/**
 * SCHICHT 2 — der Kartenausschnitt.
 *
 * Die Karte lässt sich nicht beliebig weit von den Alpen wegschieben oder
 * herauszoomen. Nicht aus Gängelei: ausserhalb hat dieses Projekt nichts zu
 * sagen, und eine Weltkarte ohne einen einzigen eingezeichneten Hinweis liest
 * sich wie „hier gilt nichts". Wer die Karte öffnet, soll dort landen, wo sie
 * etwas weiss — und dort bleiben können, ohne sich zu verlaufen.
 *
 * Gezeichnet wird nichts. Die Begrenzung ist ausschliesslich `maxBounds` und
 * `minZoom`; die Karte selbst bleibt eine ganz normale Karte.
 *
 * Woher das Rechteck kommt: die umschliessende Box der OSM-Relation 2698607
 * (`natural=mountain_range`, Wikidata Q1286), geholt über
 * `npm run import:osm -- alpen`. Keine ausgedachten Zahlen.
 */
import { REGIONS } from '../data/regions'
import alpen from './alpen.json'

interface AlpenDatei {
  quelle: string
  source_url: string
  lizenz: string
  bbox: [number, number, number, number]
}

const daten = alpen as unknown as AlpenDatei

/**
 * Wie weit über die Alpen hinaus man schauen darf, in Grad.
 *
 * Der Gebirgsrand ist nicht die sinnvolle Kante: man fährt aus München,
 * Mailand, Lyon oder Wien los, und der Blick dorthin gehört zur Planung.
 *
 * Nach Osten und Westen mehr als nach Norden und Süden, und das aus zwei
 * Gründen. Erstens liegt der Alpenbogen quer — die Anfahrt kommt von den
 * Enden, nicht von oben und unten. Zweitens ist ein Längengrad auf 46° Breite
 * nur rund 77 km breit, ein Breitengrad aber 111: gleiche Gradzahlen wären
 * seitlich die deutlich kürzere Strecke. 3° mal 1,2° sind so etwa 230 km nach
 * Osten und Westen, 130 km nach Norden und Süden.
 */
const PUFFER_LNG = 3
const PUFFER_LAT = 1.2

/**
 * Untergrenze des Zooms.
 *
 * In der Regel bremst schon `maxBounds` früher — die Grenze greift nur in
 * schmalen, hohen Fenstern, in denen das Rechteck seitlich noch Luft hätte.
 */
export const MIN_ZOOM = 5.5

/**
 * Der Bereich, in dem sich die Karte bewegen darf.
 *
 * Die Regionen kommen zur Alpen-Box dazu, damit eine erfasste Fläche nie
 * ausserhalb des erreichbaren Bereichs liegen kann. Heute ragt keine hinaus;
 * die Zeile ist die Zusicherung, dass das auch für die nächste Region gilt,
 * ohne dass jemand daran denken muss.
 */
export function alpenGrenzen(): [[number, number], [number, number]] {
  const kaesten: [number, number, number, number][] = [
    daten.bbox,
    ...Object.values(REGIONS).map((r) => r.bounds),
  ]
  const west = Math.min(...kaesten.map((b) => b[0]))
  const sued = Math.min(...kaesten.map((b) => b[1]))
  const ost = Math.max(...kaesten.map((b) => b[2]))
  const nord = Math.max(...kaesten.map((b) => b[3]))
  return [
    [west - PUFFER_LNG, sued - PUFFER_LAT],
    [ost + PUFFER_LNG, nord + PUFFER_LAT],
  ]
}
