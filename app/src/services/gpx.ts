/**
 * GPX-Import — Abschnitt 4.2 der Spezifikation.
 *
 * Bewusst früh umgesetzt: erfahrene Wanderer planen Routen ohnehin in Komoot,
 * AllTrails oder auf dem Gerät. Statt gegen diese Planer anzutreten (Abschnitt 2),
 * nimmt CampBuddy deren Ergebnis entgegen und legt die Legalitäts-Ebene darüber.
 */
import type { Position } from '../data/geo'

export interface GpxResult {
  name: string | null
  points: Position[]
}

/**
 * Liest Track- bzw. Routenpunkte aus einer GPX-Datei.
 * Nutzt den DOMParser des Browsers — keine zusätzliche Abhängigkeit.
 */
export function parseGpx(xml: string): GpxResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  if (doc.querySelector('parsererror')) {
    throw new Error('Die Datei ist kein gültiges XML.')
  }
  if (!doc.querySelector('gpx')) {
    throw new Error('Die Datei enthält kein GPX-Element.')
  }

  // trkpt ist der Normalfall (aufgezeichnete oder geplante Tracks),
  // rtept der seltenere Routen-Fall.
  const nodes = doc.querySelectorAll('trkpt').length > 0
    ? doc.querySelectorAll('trkpt')
    : doc.querySelectorAll('rtept')

  const points: Position[] = []
  for (const node of nodes) {
    const lat = Number(node.getAttribute('lat'))
    const lon = Number(node.getAttribute('lon'))
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lon, lat])
  }

  if (points.length < 2) {
    throw new Error('Es liessen sich keine zwei Wegpunkte aus der Datei lesen.')
  }

  const name = doc.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim()
  return { name: name || null, points }
}

/** Exportiert die gezeichnete Route wieder als GPX. */
export function toGpx(points: Position[], name = 'CampBuddy-Route'): string {
  const escaped = name.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  const seg = points.map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}" />`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CampBuddy" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escaped}</name>
    <trkseg>
${seg}
    </trkseg>
  </trk>
</gpx>
`
}
