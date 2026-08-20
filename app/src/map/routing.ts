/**
 * SCHICHT 2 — Routing-Engine (Abschnitt 4.2, Abschnitt 6).
 *
 * Zwei Anbieter, beide von der FOSSGIS e.V. für die OSM-Community betrieben,
 * beide ohne API-Schlüssel:
 *
 *  - **Valhalla** ist der Hauptanbieter. Sein Fussgänger-Modell kennt echte
 *    Wanderwege: `walkway_factor` bevorzugt Fusswege gegenüber Fahrbahnen,
 *    `max_hiking_difficulty` erlaubt Steige bis zur gewählten SAC-Stufe, und
 *    `use_hills` verhindert, dass Steigungen pauschal gemieden werden.
 *  - **OSRM** ist die Rückfallebene. Sein Fuss-Profil gewichtet ausschliesslich
 *    nach Distanz und nimmt im Gebirge deshalb oft die kürzere Talstrasse
 *    statt des Steigs — brauchbar, aber nicht das, was ein Wanderer will.
 *
 * Beide Instanzen laufen auf Spendenbasis. Anfragen werden deshalb im UI
 * entprellt; für dauerhaft hohe Last ist ein eigener Schlüssel bei
 * OpenRouteService vorgesehen (siehe ROUTING in mapConfig).
 */
import { distanceToLine, lineLength, type Position } from '../data/geo'
import { ROUTING } from './mapConfig'

export type RoutingProfile = 'foot' | 'bike' | 'car'

export interface RoutedPath {
  coordinates: Position[]
  distance_m: number
  /** Reisezeit in Sekunden, null wenn der Anbieter keine liefert. */
  duration_s: number | null
  /** false = die Wegpunkte sind nur gerade verbunden, kein Weg-Routing. */
  snapped: boolean
  /** Warum nicht gerastert wurde — für einen ehrlichen Hinweis im UI. */
  fallbackReason: string | null
  /**
   * Wie weit der am stärksten verschobene Wegpunkt auf den nächsten Weg
   * gezogen wurde. Wichtig für die Legalitäts-Auswertung: ein weit
   * verschobener Punkt liegt womöglich in einer ganz anderen Zone.
   */
  snapDistance_m: number | null
  /** Welcher Dienst geantwortet hat — gehört sichtbar ins UI. */
  anbieter: 'valhalla' | 'osrm' | null
}

/** Ab hier ist die geroutete Strecke nicht mehr das, was der Nutzer gezeichnet hat. */
const MAX_SNAP_M = 2000
/** Ab hier wird im UI gewarnt, die Route aber noch verwendet. */
export const SNAP_WARN_M = 250

export const PROFILE_LABEL: Record<RoutingProfile, string> = {
  foot: 'Zu Fuss',
  bike: 'Rad',
  car: 'Auto',
}

const VALHALLA_COSTING: Record<RoutingProfile, string> = {
  foot: 'pedestrian',
  bike: 'bicycle',
  car: 'auto',
}

const OSRM_PROFILE: Record<RoutingProfile, string> = {
  foot: 'routed-foot',
  bike: 'routed-bike',
  car: 'routed-car',
}

/**
 * Kosten-Einstellungen je Fortbewegungsart.
 *
 * Für Fussgänger ist das der Kern dieser Datei:
 *  - `walkway_factor: 2` heißt, Fusswege werden doppelt so attraktiv bewertet
 *    wie ihre Länge nahelegt — die App soll Steige nehmen, nicht Asphalt.
 *  - `max_hiking_difficulty: 4` lässt Bergwege bis SAC T4 zu (alpine Steige).
 *    Höher wäre unverantwortlich: T5/T6 verlangen Kletterei.
 *  - `use_hills: 1` schaltet die Steigungsvermeidung ab. Wer in den Alpen
 *    plant, will nicht um jeden Höhenmeter herumgeführt werden.
 *  - `driveway_factor`/`alley_factor` drücken Zufahrten und Gassen zurück.
 */
const VALHALLA_OPTIONEN: Record<RoutingProfile, Record<string, number>> = {
  foot: {
    walkway_factor: 2.0,
    max_hiking_difficulty: 4,
    use_hills: 1.0,
    driveway_factor: 5.0,
    alley_factor: 2.0,
    walking_speed: 4.0,
  },
  bike: { use_hills: 0.5, use_roads: 0.3 },
  car: {},
}

/** Ohne Routing verbundene Wegpunkte — die ehrliche Rückfallebene. */
function geradeVerbindung(waypoints: Position[], grund: string): RoutedPath {
  return {
    coordinates: waypoints,
    distance_m: lineLength(waypoints),
    duration_s: null,
    snapped: false,
    fallbackReason: grund,
    snapDistance_m: null,
    anbieter: null,
  }
}

/**
 * Wie weit wurden die gesetzten Wegpunkte auf das Wegenetz gezogen?
 *
 * Selbst berechnet statt vom Anbieter übernommen: Valhalla liefert dafür kein
 * Feld, und die Prüfung ist ohnehin verlässlicher, wenn sie für alle Anbieter
 * identisch funktioniert.
 */
function versatzMessen(waypoints: Position[], geometrie: Position[]): number {
  return Math.max(...waypoints.map((w) => distanceToLine(w, geometrie)))
}

export async function routeWaypoints(
  waypoints: Position[],
  profile: RoutingProfile,
  signal?: AbortSignal,
): Promise<RoutedPath> {
  if (waypoints.length < 2) {
    return {
      coordinates: waypoints, distance_m: 0, duration_s: null,
      snapped: false, fallbackReason: null, snapDistance_m: null, anbieter: null,
    }
  }

  let ersterFehler: string | null = null

  // Valhalla zuerst — nur dieses Modell kennt Wanderwege wirklich.
  try {
    return pruefeVersatz(await routeViaValhalla(waypoints, profile, signal), waypoints)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    ersterFehler = (e as Error).message
  }

  try {
    return pruefeVersatz(await routeViaOsrm(waypoints, profile, signal), waypoints)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return geradeVerbindung(waypoints, ersterFehler ?? (e as Error).message)
  }
}

/** Ein zu weit verschobener Wegpunkt beschreibt einen anderen Ort als den geklickten. */
function pruefeVersatz(pfad: RoutedPath, waypoints: Position[]): RoutedPath {
  const versatz = versatzMessen(waypoints, pfad.coordinates)
  if (versatz > MAX_SNAP_M) {
    return geradeVerbindung(
      waypoints,
      `ein Wegpunkt liegt ${Math.round(versatz / 1000)} km vom nächsten erfassten Weg entfernt`,
    )
  }
  return { ...pfad, snapDistance_m: Math.round(versatz) }
}

/* ---------------------------------------------------------------- Valhalla */

async function routeViaValhalla(
  waypoints: Position[],
  profile: RoutingProfile,
  signal?: AbortSignal,
): Promise<RoutedPath> {
  const costing = VALHALLA_COSTING[profile]
  const res = await fetch(`${ROUTING.valhallaBase}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      locations: waypoints.map(([lon, lat]) => ({ lat, lon })),
      costing,
      costing_options: { [costing]: VALHALLA_OPTIONEN[profile] },
      directions_options: { units: 'kilometers' },
    }),
  })
  if (!res.ok) throw new Error(`Routing-Dienst antwortete mit ${res.status}`)

  const json = await res.json()
  if (!json.trip?.legs?.length) {
    throw new Error(json.error ?? 'Zwischen diesen Punkten liess sich kein Weg finden')
  }

  // Alle Etappen zu einer durchgehenden Linie zusammensetzen.
  const coordinates = json.trip.legs.flatMap((leg: { shape: string }) => decodePolyline(leg.shape))

  return {
    coordinates,
    distance_m: json.trip.summary.length * 1000,
    duration_s: json.trip.summary.time,
    snapped: true,
    fallbackReason: null,
    snapDistance_m: null,
    anbieter: 'valhalla',
  }
}

/**
 * Valhalla kodiert die Geometrie als Polyline mit sechs Nachkommastellen
 * (Google-Format nutzt fünf).
 */
function decodePolyline(str: string, precision = 6): Position[] {
  const faktor = Math.pow(10, precision)
  const punkte: Position[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < str.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = str.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      byte = str.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    punkte.push([lng / faktor, lat / faktor])
  }
  return punkte
}

/* -------------------------------------------------------------------- OSRM */

async function routeViaOsrm(
  waypoints: Position[],
  profile: RoutingProfile,
  signal?: AbortSignal,
): Promise<RoutedPath> {
  const coords = waypoints.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  // Der Pfadbestandteil heisst bei OSRM immer "driving"; das tatsächliche
  // Profil steckt in der Instanz (routed-foot/-bike/-car).
  const url = `${ROUTING.osrmBase}/${OSRM_PROFILE[profile]}/route/v1/driving/${coords}` +
    '?overview=full&geometries=geojson'

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Routing-Dienst antwortete mit ${res.status}`)

  const json = await res.json()
  if (json.code !== 'Ok' || !json.routes?.[0]) {
    throw new Error(
      json.code === 'NoRoute'
        ? 'Zwischen diesen Punkten liess sich kein Weg finden'
        : `Routing fehlgeschlagen (${json.code ?? 'unbekannt'})`,
    )
  }

  const route = json.routes[0]
  return {
    coordinates: route.geometry.coordinates as Position[],
    distance_m: route.distance,
    duration_s: route.duration,
    snapped: true,
    fallbackReason: null,
    snapDistance_m: null,
    anbieter: 'osrm',
  }
}
