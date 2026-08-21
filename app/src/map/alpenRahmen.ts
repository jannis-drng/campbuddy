/**
 * SCHICHT 2 — der Kartenrahmen.
 *
 * Die Karte hört an den Alpen auf. Draussen liegt keine Weltkarte, sondern
 * dieselbe dunkle Fläche wie unter der Oberfläche — denn über alles jenseits
 * des Alpenbogens hat dieses Projekt nichts zu sagen, und eine leere Weltkarte
 * liest sich wie „hier gilt nichts".
 *
 * Der Umriss ist keine Erfindung: OSM-Relation 2698607 (`natural=mountain_range`,
 * Wikidata Q1286), über `npm run import:osm -- alpen` geholt.
 *
 * Gemeint ist aber der *Alpenraum*, nicht der Gebirgskamm — die Städte, aus denen
 * man losfährt, gehören aufs Blatt. Der Rohumriss wächst deshalb beim Import um
 * 1,1° nach aussen (rund 120 km Nord-Süd, 85 km Ost-West), sodass München,
 * Mailand, Lyon, Wien, Zürich, Turin, Ljubljana und Venedig darin liegen. Das
 * Ergebnis ist ein Kartenrahmen, keine Gebietsgrenze — und wird auch nirgends
 * als solche ausgegeben.
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
 * Wie weit über den Rahmen hinaus sich die Karte schieben lässt, in Grad.
 *
 * Genug, dass der ganze Alpenraum mit einem dunklen Rand ringsum auf den Schirm
 * passt — und nicht mehr, weil jeder weitere Grad nur zusätzliches Schwarz ist.
 * Am Rechner lässt sich damit bis etwa Zoom 5,7 herauszoomen; auf dem Telefon,
 * wo weniger Breite in den Rahmen muss, entsprechend weiter.
 */
const PUFFER_LNG = 2
const PUFFER_LAT = 1.3

/** Harte Untergrenze für schmale, hohe Fenster, wo der Rahmen allein nicht bremst. */
export const MIN_ZOOM = 5

/**
 * Alle abgedeckten Flächen: der Alpenraum und zusätzlich jede erfasste Region.
 *
 * Seit der Umriss gewachsen ist, liegt das Wallis restlos darin — die Rechtecke
 * stanzen also derzeit nichts Sichtbares aus. Sie bleiben trotzdem drin: sie
 * sind die Zusicherung, dass keine erfasste Fläche je auf schwarzem Grund ohne
 * Karte darunter landet. Vor dem Wachsen traf das ausgerechnet das Réserve
 * Naturelle des Grangettes am Genfersee — eine Verbotszone. Die strengste
 * Auskunft ohne Zusammenhang zu zeigen wäre der schlechteste denkbare Fall,
 * und eine künftige Region kann wieder über den Rand ragen.
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
