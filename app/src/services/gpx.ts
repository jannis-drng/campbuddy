/**
 * GPX-Import — Abschnitt 4.2 der Spezifikation.
 *
 * Bewusst früh umgesetzt: erfahrene Wanderer planen Routen ohnehin in Komoot,
 * AllTrails oder auf dem Gerät. Statt gegen diese Planer anzutreten (Abschnitt 2),
 * nimmt CampBuddy deren Ergebnis entgegen und legt die Legalitäts-Ebene darüber.
 */
import type { Position } from '../data/geo'
import type { Wegpunkt, WegpunktArt } from '../data/types'

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

/**
 * GPX-Symbolnamen je Art.
 *
 * Die Namen sind keine Erfindung, sondern Garmins Symbolliste — sie ist der
 * faktische Standard, den auch komoot und Strava beim Import lesen. Eigene
 * Namen würden schlicht ignoriert und der Wegpunkt landete als namenlose
 * Stecknadel.
 */
const WEGPUNKT_SYMBOL: Record<WegpunktArt, string> = {
  hut: 'Lodging',
  campsite: 'Campground',
  vehicle_spot: 'Parking Area',
  peak: 'Summit',
  wasser: 'Drinking Water',
  aussicht: 'Scenic Area',
  eigen: 'Flag, Blue',
}

const escapeXml = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!))

/**
 * Exportiert die gezeichnete Route wieder als GPX.
 *
 * Benannte Wegpunkte kommen als `<wpt>` mit — genau die Hütten, Gipfel und
 * Wasserstellen, die jemand bewusst angetippt hat. Ohne sie käme im fremden
 * Planer eine nackte Linie an, und die Entscheidung "hier wird übernachtet"
 * müsste dort noch einmal getroffen werden. Namenlose Klicks auf freie Fläche
 * bleiben aussen vor; sie sind Form der Linie, kein Ort.
 *
 * Die Reihenfolge `metadata` → `wpt` → `trk` gibt das GPX-1.1-Schema vor.
 * Strenge Importeure weisen die Datei sonst zurück.
 */
export function toGpx(points: Position[], name = 'CampBuddy-Route', wegpunkte: Wegpunkt[] = []): string {
  const escaped = escapeXml(name)
  const seg = points.map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}" />`).join('\n')
  // Ein selbst vergebener Name zählt genauso wie der eines übernommenen Ortes:
  // wer eine Stelle „Schlafplatz" genannt hat, will sie auf dem Gerät
  // wiederfinden. Ohne Symbol im Datensatz nimmt sie die blaue Fahne.
  const wpts = wegpunkte
    .map((w) => ({ w, name: w.name?.trim() || w.ort?.name }))
    .filter((e): e is { w: Wegpunkt; name: string } => Boolean(e.name))
    .map(({ w, name }) => `  <wpt lat="${w.position[1]}" lon="${w.position[0]}">
    <name>${escapeXml(name)}</name>
    <sym>${WEGPUNKT_SYMBOL[w.ort?.art ?? 'eigen']}</sym>
  </wpt>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CampBuddy" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escaped}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts ? wpts + '\n' : ''}  <trk>
    <name>${escaped}</name>
    <trkseg>
${seg}
    </trkseg>
  </trk>
</gpx>
`
}
