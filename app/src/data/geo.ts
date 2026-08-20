/**
 * Geometrie-Grundlagen für die Routen-Analyse.
 *
 * Bewusst ohne Bibliothek: es geht um wenige Operationen auf kleinen Datenmengen,
 * und jede zusätzliche Abhängigkeit landet im Bundle, das Nutzer draussen über
 * Mobilfunk laden.
 */

export type Position = [number, number] // [lng, lat]

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Entfernung zweier Punkte in Metern (Haversine). */
export function distanceMeters(a: Position, b: Position): number {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(a[0] - b[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Gesamtlänge eines Linienzugs in Metern. */
export function lineLength(line: Position[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += distanceMeters(line[i - 1], line[i])
  return total
}

/**
 * Punkt-in-Polygon per Ray-Casting.
 * `ring` ist der äussere Ring; Löcher werden bewusst ignoriert — die
 * Schutzgebiete im Datenbestand haben keine, und ein falsch behandeltes Loch
 * wäre gefährlicher als ein ignoriertes.
 */
function pointInRing(point: Position, ring: Position[]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function pointInGeometry(
  point: Position,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  const polygons: Position[][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as Position[][]]
      : (geometry.coordinates as Position[][][])

  return polygons.some((rings) => rings.length > 0 && pointInRing(point, rings[0]))
}

/**
 * Verdichtet einen Linienzug, damit die Zonen-Prüfung keine Fläche überspringt.
 * Ohne Zwischenpunkte könnte eine Route ein schmales Schutzgebiet komplett
 * überspringen — genau der Fall, der nicht passieren darf.
 */
export function densify(line: Position[], maxSpacingM = 250): Position[] {
  if (line.length < 2) return line
  const out: Position[] = [line[0]]

  for (let i = 1; i < line.length; i++) {
    const from = line[i - 1]
    const to = line[i]
    const steps = Math.ceil(distanceMeters(from, to) / maxSpacingM)
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
    }
  }
  return out
}

/** Kürzeste Entfernung eines Punktes zu einem Linienzug, in Metern. */
export function distanceToLine(point: Position, line: Position[]): number {
  if (line.length === 0) return Infinity
  let min = Infinity
  for (let i = 1; i < line.length; i++) {
    min = Math.min(min, distanceToSegment(point, line[i - 1], line[i]))
  }
  return line.length === 1 ? distanceMeters(point, line[0]) : min
}

function distanceToSegment(p: Position, a: Position, b: Position): number {
  // Auf Tourlängen genügt eine ebene Näherung mit Breitengrad-Korrektur.
  const latScale = Math.cos(toRad((a[1] + b[1]) / 2))
  const px = (p[0] - a[0]) * latScale
  const py = p[1] - a[1]
  const bx = (b[0] - a[0]) * latScale
  const by = b[1] - a[1]

  const lenSq = bx * bx + by * by
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq))
  const nearest: Position = [a[0] + ((b[0] - a[0]) * t), a[1] + ((b[1] - a[1]) * t)]
  return distanceMeters(p, nearest)
}

/**
 * Nächstgelegener Punkt auf einer Linie — die Grundlage dafür, dass sich eine
 * Route wie bei Komoot an einer beliebigen Stelle anfassen und aufziehen lässt.
 *
 * Zurück kommt neben der Position auch das Segment: daraus leitet die Karte
 * ab, zwischen welche zwei Wegpunkte ein neuer gehört.
 */
export function naechsterPunktAufLinie(
  point: Position, line: Position[],
): { position: Position; segment: number; distance_m: number } | null {
  if (line.length < 2) return null
  let best = { position: line[0], segment: 0, distance_m: Infinity }
  for (let i = 1; i < line.length; i++) {
    const kandidat = projiziereAufSegment(point, line[i - 1], line[i])
    const d = distanceMeters(point, kandidat)
    if (d < best.distance_m) best = { position: kandidat, segment: i - 1, distance_m: d }
  }
  return best
}

function projiziereAufSegment(p: Position, a: Position, b: Position): Position {
  const latScale = Math.cos(toRad((a[1] + b[1]) / 2))
  const px = (p[0] - a[0]) * latScale
  const py = p[1] - a[1]
  const bx = (b[0] - a[0]) * latScale
  const by = b[1] - a[1]
  const lenSq = bx * bx + by * by
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq))
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/**
 * Index des Linienpunkts, der einer Position am nächsten liegt.
 *
 * Gebraucht, um gesetzte Wegpunkte auf der gerouteten Spur wiederzufinden:
 * die Spur folgt echten Wegen und trifft die gesetzten Punkte nicht exakt.
 */
export function naechsterIndex(point: Position, line: Position[]): number {
  let best = 0
  let min = Infinity
  for (let i = 0; i < line.length; i++) {
    const d = distanceMeters(point, line[i])
    if (d < min) { min = d; best = i }
  }
  return best
}

/**
 * Verteilt `count` Stützpunkte gleichmässig über die Streckenlänge.
 *
 * Für das Höhenprofil: die Rohgeometrie hat je nach Routing hunderte bis
 * tausende Punkte, ungleich verteilt. Gleichmässige Abstände machen das
 * Profil lesbar und halten die Zahl der Höhenabfragen klein.
 */
export function resampleByCount(line: Position[], count: number): { position: Position; distance_m: number }[] {
  if (line.length === 0) return []
  if (line.length === 1) return [{ position: line[0], distance_m: 0 }]

  const gesamt = lineLength(line)
  if (gesamt === 0) return [{ position: line[0], distance_m: 0 }]

  // Kumulierte Distanz je Originalpunkt.
  const kumuliert: number[] = [0]
  for (let i = 1; i < line.length; i++) {
    kumuliert.push(kumuliert[i - 1] + distanceMeters(line[i - 1], line[i]))
  }

  const out: { position: Position; distance_m: number }[] = []
  let j = 1
  for (let k = 0; k < count; k++) {
    const ziel = (gesamt * k) / (count - 1)
    while (j < kumuliert.length - 1 && kumuliert[j] < ziel) j++
    const vor = kumuliert[j - 1]
    const nach = kumuliert[j]
    const t = nach === vor ? 0 : (ziel - vor) / (nach - vor)
    const a = line[j - 1]
    const b = line[j]
    out.push({
      position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      distance_m: ziel,
    })
  }
  return out
}
