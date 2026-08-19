/**
 * SCHICHT 2 — Routing-Engine (Abschnitt 4.2, Abschnitt 6).
 *
 * Standard ist die öffentliche OSRM-Instanz der FOSSGIS e.V., die auch
 * openstreetmap.org für seine Routensuche nutzt: OSM-basiert, ohne API-Schlüssel,
 * mit Fuss-, Rad- und Autoprofil. Damit bleibt der Einstieg bei 0 € und ohne
 * Registrierung — genau die Vorgabe aus Abschnitt 6.
 *
 * Die Instanz läuft auf Spendenbasis für die OSM-Community. Deshalb: Anfragen
 * werden entprellt, und für dauerhaft hohe Last ist ein eigener Schlüssel bei
 * OpenRouteService oder GraphHopper vorgesehen (siehe ROUTING in mapConfig).
 */
import type { Position } from '../data/geo'
import { lineLength } from '../data/geo'
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
   * Wie weit der am stärksten verschobene Wegpunkt auf den nächsten Weg gezogen
   * wurde. Wichtig für die Legalitäts-Auswertung: ein weit verschobener Punkt
   * liegt womöglich in einer ganz anderen Zone als der angeklickte Ort.
   */
  snapDistance_m: number | null
}

/** Ab hier ist die geroutete Strecke nicht mehr das, was der Nutzer gezeichnet hat. */
const MAX_SNAP_M = 2000
/** Ab hier wird im UI gewarnt, die Route aber noch verwendet. */
export const SNAP_WARN_M = 250

const OSRM_PROFILE: Record<RoutingProfile, string> = {
  foot: 'routed-foot',
  bike: 'routed-bike',
  car: 'routed-car',
}

export const PROFILE_LABEL: Record<RoutingProfile, string> = {
  foot: 'Zu Fuss',
  bike: 'Rad',
  car: 'Auto',
}

/** Ohne Routing verbundene Wegpunkte — die ehrliche Rückfallebene. */
function straightLine(waypoints: Position[], reason: string): RoutedPath {
  return {
    coordinates: waypoints,
    distance_m: lineLength(waypoints),
    duration_s: null,
    snapped: false,
    fallbackReason: reason,
    snapDistance_m: null,
  }
}

export async function routeWaypoints(
  waypoints: Position[],
  profile: RoutingProfile,
  signal?: AbortSignal,
): Promise<RoutedPath> {
  if (waypoints.length < 2) {
    return {
      coordinates: waypoints, distance_m: 0, duration_s: null,
      snapped: false, fallbackReason: null, snapDistance_m: null,
    }
  }

  try {
    if (ROUTING.apiKey && ROUTING.provider === 'openrouteservice') {
      return await routeViaOrs(waypoints, signal)
    }
    return await routeViaOsrm(waypoints, profile, signal)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return straightLine(waypoints, (e as Error).message)
  }
}

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

  // OSRM zieht jede Koordinate auf den nächsten Weg und meldet die Entfernung.
  // Liegt ein Wegpunkt weitab von jedem Weg — Gletscher, Seemitte, Fehlklick —
  // beschriebe die Route einen anderen Ort als den angeklickten.
  const snapDistance_m: number = Math.max(
    0,
    ...(json.waypoints ?? []).map((w: { distance?: number }) => w.distance ?? 0),
  )
  if (snapDistance_m > MAX_SNAP_M) {
    return straightLine(
      waypoints,
      `ein Wegpunkt liegt ${Math.round(snapDistance_m / 1000)} km vom nächsten erfassten Weg entfernt`,
    )
  }

  const route = json.routes[0]
  return {
    coordinates: route.geometry.coordinates as Position[],
    distance_m: route.distance,
    duration_s: route.duration,
    snapped: true,
    fallbackReason: null,
    snapDistance_m,
  }
}

/** Alternativpfad, sobald ein OpenRouteService-Schlüssel hinterlegt ist. */
async function routeViaOrs(waypoints: Position[], signal?: AbortSignal): Promise<RoutedPath> {
  const res = await fetch(ROUTING.endpoints.openrouteservice, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: ROUTING.apiKey },
    body: JSON.stringify({ coordinates: waypoints }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenRouteService antwortete mit ${res.status}`)

  const json = await res.json()
  const feature = json.features?.[0]
  if (!feature) throw new Error('OpenRouteService lieferte keine Route')

  return {
    coordinates: feature.geometry.coordinates as Position[],
    distance_m: feature.properties.summary.distance,
    duration_s: feature.properties.summary.duration,
    snapped: true,
    fallbackReason: null,
    snapDistance_m: null,
  }
}
