/**
 * Wegpunkte: benennen, umsortieren, beschriften.
 *
 * Ein Wegpunkt entsteht auf drei Wegen — durch Antippen eines erfassten Ortes
 * (dann trägt er dessen Namen), durch Antippen freier Fläche (dann trägt er
 * keinen) und durch Umbenennen von Hand. Die letzte Möglichkeit ist der Grund
 * für diese Datei: „Schlafplatz", „Wasser holen", „Mittag" sind Angaben, die
 * kein Datensatz liefern kann und die eine Mehrtagestour trotzdem erst lesbar
 * machen. Ein selbst gesetzter Name schlägt deshalb immer den übernommenen.
 */
import { naechsterIndex, type Position } from './geo'
import type { Wegpunkt } from './types'

/** Start, Ziel oder wievielter Zwischenstopp — die Rolle folgt der Position. */
export function rolleVon(index: number, anzahl: number): string {
  if (index === 0) return 'Start'
  if (index === anzahl - 1) return 'Ziel'
  return `Zwischenstopp ${index}`
}

/**
 * Was an diesem Punkt steht.
 *
 * Reihenfolge: selbst vergeben → übernommener Ort → Rolle. Die Rolle ist die
 * letzte Zuflucht, weil sie sich beim Umsortieren ändert; ein Name nicht.
 */
export function wegpunktName(w: Wegpunkt, index: number, anzahl: number): string {
  return w.name?.trim() || w.ort?.name || rolleVon(index, anzahl)
}

/** Hat der Punkt einen eigenen Namen — egal woher? */
export function hatNamen(w: Wegpunkt): boolean {
  return Boolean(w.name?.trim() || w.ort?.name)
}

/**
 * Einen Wegpunkt an eine andere Stelle setzen.
 *
 * Bewusst „verschieben" und nicht „tauschen": beim Tauschen zweier
 * benachbarter Punkte ist beides dasselbe, bei einem Sprung über mehrere
 * Stationen aber nicht — dort will man den Punkt einsortieren, nicht zwei
 * Stationen der Tour über Kreuz vertauschen.
 */
export function verschieben<T>(liste: T[], von: number, nach: number): T[] {
  if (von === nach || von < 0 || nach < 0 || von >= liste.length || nach >= liste.length) {
    return liste
  }
  const kopie = [...liste]
  const [stueck] = kopie.splice(von, 1)
  kopie.splice(nach, 0, stueck)
  return kopie
}

/** Denselben Weg andersherum gehen: aus Start wird Ziel. */
export function umkehren<T>(liste: T[]): T[] {
  return [...liste].reverse()
}

/**
 * An welche Stelle der Liste ein neuer Stopp gehört.
 *
 * Hinten anhängen wäre falsch: eine Hütte, die auf halber Strecke liegt, ist
 * nicht das neue Ziel der Tour, sondern eine Station unterwegs. Ablesen lässt
 * sich die Stelle nicht direkt — die gezeichnete Spur folgt echten Wegen und
 * hat hunderte Stützpunkte, die gesetzten Stopps sind eine Handvoll. Also
 * wird geschaut, zwischen welchen zwei Stopps der neue Ort auf der Spur
 * liegt.
 *
 * Ohne Spur oder mit weniger als zwei Stopps gibt es nichts einzusortieren;
 * dann ist das Ende die richtige Antwort.
 */
export function einfuegeStelle(
  position: Position, route: Position[], stopps: Position[],
): number {
  if (stopps.length < 2 || route.length < 2) return stopps.length
  const stelle = naechsterIndex(position, route)
  const marken = stopps.map((p) => naechsterIndex(p, route))
  for (let i = 1; i < marken.length; i++) {
    if (stelle <= marken[i]) return i
  }
  return stopps.length
}
