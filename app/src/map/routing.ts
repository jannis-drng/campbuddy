/**
 * SCHICHT 2 — Routing-Engine (Abschnitt 4.2, Abschnitt 6).
 *
 * Zwei Anbieter, beide von der FOSSGIS e.V. für die OSM-Community betrieben,
 * beide ohne API-Schlüssel:
 *
 *  - **Valhalla** ist der Hauptanbieter, weil sein Fussgänger-Modell über
 *    `max_hiking_difficulty` echte Bergwege zulässt. Ohne diesen Wert meidet
 *    es Steige ab SAC T3 vollständig — siehe die Messung bei den Kosten-
 *    Einstellungen weiter unten.
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
 * `max_hiking_difficulty` ist der entscheidende Wert und der Grund, warum
 * kleine Bergwege überhaupt benutzt werden. Valhallas Voreinstellung ist 1
 * und schliesst damit alles ab T3 aus — gemessen an vier getaggten Steigen im
 * Wallis führte das zu einem mittleren Umweg vom **9,1-fachen** der
 * Steiglänge, in einem Fall zum 30-fachen. Mit 4 (SAC T4) folgt der Router
 * ihnen praktisch exakt (Faktor 1,01).
 *
 * Höher als T4 wird bewusst nicht gesetzt: T5 und T6 verlangen Kletterei.
 *
 * `use_hills` fehlt hier absichtlich. Der Wert 1.0 („Steigungen nicht meiden")
 * klingt nach der richtigen Wahl fürs Gebirge, verschlechterte im Test aber
 * das Ergebnis — ein Steig wurde damit doppelt so weit umfahren wie nötig.
 * Die Voreinstellung ist besser.
 *
 * `walkway_factor` fehlt ebenfalls: es wirkt auf `highway=footway`, nicht auf
 * `highway=path`, und blieb in allen Messungen wirkungslos.
 */
const VALHALLA_OPTIONEN: Record<RoutingProfile, Record<string, number>> = {
  foot: {
    max_hiking_difficulty: 4,
    // Realistischer als die Voreinstellung von 5,1 km/h — betrifft nur die
    // vom Dienst gemeldete Dauer, angezeigt wird ohnehin die Alpenvereinsformel.
    walking_speed: 4.0,
  },
  bike: { use_roads: 0.3 },
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
    return pruefeVersatz(await routeViaValhallaMitZweitversuch(waypoints, profile, signal), waypoints)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // „Failed to fetch" steht in der Sprache des Browsers und sagt niemandem
    // etwas. Der häufigste Grund dafür ist hier die Anfragegrenze des Dienstes.
    ersterFehler = istNetzfehler(e)
      ? 'der Routing-Dienst war nicht erreichbar (womöglich zu viele Anfragen kurz hintereinander)'
      : (e as Error).message
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

/**
 * Wie lange nach einem gescheiterten Versuch gewartet wird, bevor es der
 * Zweitversuch nochmal probiert.
 */
const ZWEITVERSUCH_MS = 900

/**
 * War das ein Netzfehler — oder eine echte Absage des Dienstes?
 *
 * `fetch` lehnt mit einem `TypeError` ab, wenn die Antwort den Browser gar
 * nicht erst erreicht: Verbindung weg, oder die Antwort trug keine
 * CORS-Kopfzeile. Alles, was dieses Modul selbst wirft, ist ein schlichter
 * `Error` — daran lassen sich die beiden Fälle unterscheiden.
 */
function istNetzfehler(e: unknown): boolean {
  return e instanceof TypeError
}

function abgebrochen(): Error {
  return new DOMException('Abgebrochen', 'AbortError')
}

function warte(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abgebrochen())
    const beiAbbruch = () => { clearTimeout(zeit); reject(abgebrochen()) }
    const zeit = setTimeout(() => {
      signal?.removeEventListener('abort', beiAbbruch)
      resolve()
    }, ms)
    signal?.addEventListener('abort', beiAbbruch, { once: true })
  })
}

/**
 * Ein zweiter Versuch, bevor auf OSRM zurückgefallen wird.
 *
 * Die FOSSGIS-Instanz begrenzt die Anfragen pro IP. Wer zügig mehrere
 * Wegpunkte setzt, läuft in diese Grenze — und sieht sie im Browser nicht als
 * 429: die Fehlerantwort von deren nginx trägt keine CORS-Kopfzeile, deshalb
 * hält der Browser die Antwort ganz zurück und meldet stattdessen einen
 * CORS-Verstoss. Gemessen an zwölf gleichzeitigen Anfragen: elf mit 200 und
 * `access-control-allow-origin: *`, eine mit 429 und ohne die Kopfzeile.
 *
 * Ohne diesen Versuch fiel jede solche Anfrage stillschweigend auf OSRM
 * zurück — und das nimmt im Gebirge die Talstrasse statt des Steigs. Ein
 * einzelner später Versuch, nicht mehr: die Instanz läuft auf Spendenbasis.
 */
async function routeViaValhallaMitZweitversuch(
  waypoints: Position[],
  profile: RoutingProfile,
  signal?: AbortSignal,
): Promise<RoutedPath> {
  try {
    return await routeViaValhalla(waypoints, profile, signal)
  } catch (e) {
    if ((e as Error).name === 'AbortError' || !istNetzfehler(e)) throw e
    await warte(ZWEITVERSUCH_MS, signal)
    return routeViaValhalla(waypoints, profile, signal)
  }
}

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
