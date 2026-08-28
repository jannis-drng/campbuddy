/**
 * SCHICHT 1 — Routen-Analyse: "Wo kann ich entlang dieser Route legal schlafen?"
 *
 * Das ist der Punkt, an dem sich CampBuddy von Routenplanern unterscheidet
 * (Abschnitt 4.2 der Spezifikation). Die Route selbst ist Beiwerk — der Wert
 * entsteht dadurch, dass die Legalitäts-Ebene auf sie gelegt wird.
 */
import { densify, distanceToLine, lineLength, pointInGeometry, type Position } from './geo'
import type { LegalStatus, Point, Zone } from './types'

export interface CrossedZone {
  zone: Zone
  /** Streckenlänge innerhalb dieser Zone, in Metern. */
  meters: number
  /** Anteil an der Gesamtroute, 0–1. */
  share: number
}

export interface NearbyPoint {
  point: Point
  /** Luftlinie zur Route in Metern. */
  distance: number
}

export interface RouteAnalysis {
  length_m: number
  crossed: CrossedZone[]
  nearby: NearbyPoint[]
  /** Streckenanteil, der durch Zonen mit Übernachtungsverbot führt. */
  forbiddenShare: number
  /** Streckenanteil ohne eingezeichnete Zone — dort gilt der Regions-Grundsatz. */
  unmappedShare: number
}

/** Wie weit von der Route entfernt ein Schlafplatz noch als erreichbar gilt. */
export const NEARBY_RADIUS_M = 2000

export function analyseRoute(
  route: Position[],
  zones: Zone[],
  points: Point[],
  radius = NEARBY_RADIUS_M,
): RouteAnalysis {
  const length_m = lineLength(route)
  if (route.length < 2) {
    return { length_m: 0, crossed: [], nearby: [], forbiddenShare: 0, unmappedShare: 0 }
  }

  // Verdichten, damit schmale Zonen nicht zwischen zwei Stützpunkten durchfallen.
  const sampled = densify(route)
  const stepLength = length_m / Math.max(1, sampled.length - 1)

  const metersPerZone = new Map<string, number>()
  let coveredSteps = 0

  for (const position of sampled) {
    let insideAny = false
    for (const zone of zones) {
      if (pointInGeometry(position, zone.geometry)) {
        metersPerZone.set(zone.id, (metersPerZone.get(zone.id) ?? 0) + stepLength)
        insideAny = true
      }
    }
    if (insideAny) coveredSteps++
  }

  const crossed: CrossedZone[] = [...metersPerZone.entries()]
    .map(([id, meters]) => ({
      zone: zones.find((z) => z.id === id)!,
      meters,
      share: length_m > 0 ? meters / length_m : 0,
    }))
    .sort((a, b) => b.meters - a.meters)

  const forbiddenMeters = crossed
    .filter((c) => c.zone.status === 'forbidden')
    .reduce((sum, c) => sum + c.meters, 0)

  const nearby: NearbyPoint[] = points
    .map((point) => ({ point, distance: distanceToLine([point.lng, point.lat], route) }))
    .filter((n) => n.distance <= radius)
    .sort((a, b) => a.distance - b.distance)

  return {
    length_m,
    crossed,
    nearby,
    forbiddenShare: length_m > 0 ? forbiddenMeters / length_m : 0,
    unmappedShare: 1 - coveredSteps / sampled.length,
  }
}

/**
 * Kurzfazit für die Route. Formuliert bewusst vorsichtig: die Aussage ist nur
 * so gut wie der Prüfstand der Zonen, und ausserhalb eingezeichneter Flächen
 * gilt lediglich der allgemeine Regions-Grundsatz.
 */
export function summarise(analysis: RouteAnalysis, baseline: LegalStatus): string {
  if (analysis.length_m === 0) return 'Noch keine Route gezeichnet.'

  const parts: string[] = []
  const forbidden = analysis.crossed.filter((c) => c.zone.status === 'forbidden')

  if (forbidden.length > 0) {
    parts.push(
      `Die Route führt durch ${forbidden.length} Gebiet${forbidden.length > 1 ? 'e' : ''} mit ` +
      `Übernachtungsverbot (${Math.round(analysis.forbiddenShare * 100)} % der Strecke). ` +
      'Dort darfst du durchwandern, aber nicht schlafen.',
    )
  } else if (analysis.crossed.length > 0) {
    parts.push('Auf der Route liegt kein Gebiet mit generellem Übernachtungsverbot.')
  }

  if (analysis.unmappedShare > 0.05) {
    const label = { allowed: 'erlaubt', tolerated: 'geduldet', forbidden: 'verboten', unknown: 'ungeklärt' }[baseline]
    parts.push(
      `${Math.round(analysis.unmappedShare * 100)} % der Strecke liegen ausserhalb eingezeichneter ` +
      `Flächen - dort gilt nur der allgemeine Grundsatz der Region (${label}).`,
    )
  }

  const sleepable = analysis.nearby.filter((n) => n.point.type !== 'vehicle_spot')
  const km = NEARBY_RADIUS_M / 1000
  if (sleepable.length === 0) {
    parts.push(`Im Umkreis von ${km} km liegt keine Hütte und kein Campingplatz.`)
  } else if (sleepable.length === 1) {
    parts.push(`Eine Hütte oder ein Campingplatz liegt im Umkreis von ${km} km.`)
  } else {
    parts.push(`${sleepable.length} Hütten und Campingplätze liegen im Umkreis von ${km} km.`)
  }

  return parts.join(' ')
}
