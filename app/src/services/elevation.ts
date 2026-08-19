/**
 * SCHICHT 2 — Höhendaten (Open-Meteo Elevation, Abschnitt 6).
 *
 * Kostenlos, ohne API-Schlüssel, 100 Koordinaten pro Anfrage. Grundlage für
 * Höhenprofil, Auf- und Abstieg und damit für eine realistische Gehzeit —
 * die Zeit der Routing-Engine kennt keine Höhenmeter und ist im Gebirge
 * deutlich zu optimistisch.
 */
import { resampleByCount, type Position } from '../data/geo'

const ENDPOINT = 'https://api.open-meteo.com/v1/elevation'
const MAX_PRO_ANFRAGE = 100

/** Auflösung des Profils. 120 Punkte sind für die Anzeige mehr als genug. */
export const PROFIL_PUNKTE = 120

export interface ElevationPoint {
  position: Position
  distance_m: number
  elevation: number
}

/**
 * Holt das Höhenprofil entlang der Route.
 *
 * Wichtig: das Modell liefert Geländehöhen aus einem Raster, keine
 * Vermessungswerte. In steilem Gelände weicht das spürbar ab — genug für
 * eine Gehzeitschätzung, zu wenig für alles, was auf den Meter ankommt.
 */
export async function loadElevationProfile(
  route: Position[],
  signal?: AbortSignal,
): Promise<ElevationPoint[]> {
  if (route.length < 2) return []

  const stuetzpunkte = resampleByCount(route, PROFIL_PUNKTE)
  const hoehen: number[] = []

  for (let i = 0; i < stuetzpunkte.length; i += MAX_PRO_ANFRAGE) {
    const teil = stuetzpunkte.slice(i, i + MAX_PRO_ANFRAGE)
    const params = new URLSearchParams({
      latitude: teil.map((p) => p.position[1].toFixed(5)).join(','),
      longitude: teil.map((p) => p.position[0].toFixed(5)).join(','),
    })
    const res = await fetch(`${ENDPOINT}?${params}`, { signal })
    if (!res.ok) throw new Error(`Höhendienst antwortete mit ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json.elevation)) throw new Error('Höhendienst lieferte keine Daten')
    hoehen.push(...json.elevation)
  }

  return stuetzpunkte.map((p, i) => ({
    position: p.position,
    distance_m: p.distance_m,
    elevation: hoehen[i] ?? 0,
  }))
}
