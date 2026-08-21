/**
 * SCHICHT 2 — der Kartenrahmen.
 *
 * Die Karte hört an den Alpen auf. Draussen liegt keine Weltkarte, sondern
 * dieselbe dunkle Fläche wie unter der Oberfläche — denn über alles jenseits
 * des Alpenbogens hat dieses Projekt nichts zu sagen, und eine leere Weltkarte
 * liest sich wie „hier gilt nichts".
 *
 * Der Umriss ist keine Erfindung: OSM-Relation 2698607 (`natural=mountain_range`,
 * Wikidata Q1286), über `npm run import:osm -- alpen` geholt und von 58 713 auf
 * 864 Punkte vereinfacht. Bei den Zoomstufen, auf denen er als Rand dient,
 * sieht man die 500 m Toleranz nicht.
 */
import { REGIONS } from '../data/regions'
import alpen from './alpen.json'

interface AlpenDatei {
  quelle: string
  source_url: string
  lizenz: string
  bbox: [number, number, number, number]
  geometry: { type: 'MultiPolygon'; coordinates: [number, number][][][] }
}

const daten = alpen as unknown as AlpenDatei

export const ALPEN_QUELLE = { name: daten.quelle, url: daten.source_url, lizenz: daten.lizenz }

/**
 * Wie weit über den Alpenbogen hinaus man schauen darf, in Grad.
 *
 * Genug, dass die ganzen Alpen mit etwas Luft ringsum auf den Schirm passen —
 * und nicht mehr, weil jeder weitere Grad nur zusätzliches Schwarz ist. Bei
 * dieser Grösse lässt sich am Rechner bis etwa Zoom 5,9 herauszoomen; auf dem
 * Telefon, wo weniger Breite in den Rahmen muss, entsprechend weiter.
 */
const PUFFER_LNG = 2
const PUFFER_LAT = 1.3

/** Harte Untergrenze für schmale, hohe Fenster, wo der Rahmen allein nicht bremst. */
export const MIN_ZOOM = 5

/**
 * Alle abgedeckten Flächen: der Alpenbogen und jede erfasste Region.
 *
 * Die Regionen kommen dazu, weil sie nicht restlos im Umriss liegen. Das
 * Wallis reicht bis an den Genfersee, und dort liegt unter anderem das
 * Réserve Naturelle des Grangettes — eine Verbotszone. Sie auf schwarzem Grund
 * ohne Karte darunter zu zeigen, wäre der schlechteste denkbare Kompromiss:
 * ausgerechnet die strengste Auskunft ohne Zusammenhang.
 */
function abgedeckteRechtecke(): [number, number, number, number][] {
  return Object.values(REGIONS).map((r) => r.bounds)
}

/** Der Bereich, in dem sich die Karte bewegen darf: alles Abgedeckte plus Puffer. */
export function alpenGrenzen(): [[number, number], [number, number]] {
  const kaesten = [daten.bbox, ...abgedeckteRechtecke()]
  const west = Math.min(...kaesten.map((b) => b[0]))
  const sued = Math.min(...kaesten.map((b) => b[1]))
  const ost = Math.max(...kaesten.map((b) => b[2]))
  const nord = Math.max(...kaesten.map((b) => b[3]))
  return [
    [west - PUFFER_LNG, sued - PUFFER_LAT],
    [ost + PUFFER_LNG, nord + PUFFER_LAT],
  ]
}

/** Ein Rechteck als geschlossener Ring, im Uhrzeigersinn. */
function rechteckRing([west, sued, ost, nord]: [number, number, number, number]): [number, number][] {
  return [[west, sued], [ost, sued], [ost, nord], [west, nord], [west, sued]]
}

/**
 * Die Maske: ein Rechteck über die halbe Welt, aus dem der Alpenbogen
 * ausgestanzt ist.
 *
 * In GeoJSON ist der erste Ring die Aussenkante, jeder weitere ein Loch —
 * gefüllt wird also genau das, was *nicht* Alpen ist. Ein zweiter Weg wäre
 * gewesen, die Alpen als Fläche zu zeichnen und alles andere zu überdecken;
 * der hier braucht nur einen Layer.
 */
export function maskeGeoJson(): GeoJSON.FeatureCollection {
  const aussen: [number, number][] = [
    [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
  ]
  const loecher = [
    ...daten.geometry.coordinates.map((polygon) => polygon[0]),
    ...abgedeckteRechtecke().map(rechteckRing),
  ]
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [aussen, ...loecher] },
      },
      // Zweites Feature nur für die Kante: eine Linie auf dem Loch selbst,
      // damit der Rand eine gezogene Kontur ist und keine Zufallsgrenze. Die
      // Regionsrechtecke bekommen bewusst keine — ihre geraden Kanten sind
      // eine Verwaltungsgrenze, kein Gebirgsrand.
      {
        type: 'Feature',
        properties: { kante: true },
        geometry: daten.geometry,
      },
    ],
  }
}
