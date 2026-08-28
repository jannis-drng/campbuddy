/**
 * SCHICHT 1 - Kantonsnamen, ohne Geometrie.
 *
 * Die Kantonsflächen liegen als eigene Snapshot-Datei (131 KB) und werden nur
 * dort geladen, wo man sie zeichnet: auf der Karte. Die Community-Ansicht
 * braucht aber Namen - für die Auswahlliste „welcher Kanton". Diese Datei ist
 * die Antwort darauf: 26 Zeilen Text statt 131 KB Polygone.
 *
 * Erzeugt aus `snapshot/kantone.CH.json` (Code und Name), von Hand gepflegt.
 * Kommt ein Land dazu, kommt hier eine zweite Liste dazu - der Zuschnitt der
 * Schweizer Kantone ändert sich nicht.
 */

/** Code -> Name, alphabetisch nach Code. */
export const KANTON_NAMEN: [string, string][] = [
  ['CH-AG', 'Aargau'],
  ['CH-AI', 'Appenzell Innerrhoden'],
  ['CH-AR', 'Appenzell Ausserrhoden'],
  ['CH-BE', 'Bern'],
  ['CH-BL', 'Basel-Landschaft'],
  ['CH-BS', 'Basel-Stadt'],
  ['CH-FR', 'Freiburg'],
  ['CH-GE', 'Genf'],
  ['CH-GL', 'Glarus'],
  ['CH-GR', 'Graubünden'],
  ['CH-JU', 'Jura'],
  ['CH-LU', 'Luzern'],
  ['CH-NE', 'Neuenburg'],
  ['CH-NW', 'Nidwalden'],
  ['CH-OW', 'Obwalden'],
  ['CH-SG', 'St. Gallen'],
  ['CH-SH', 'Schaffhausen'],
  ['CH-SO', 'Solothurn'],
  ['CH-SZ', 'Schwyz'],
  ['CH-TG', 'Thurgau'],
  ['CH-TI', 'Tessin'],
  ['CH-UR', 'Uri'],
  ['CH-VD', 'Waadt'],
  ['CH-VS', 'Wallis'],
  ['CH-ZG', 'Zug'],
  ['CH-ZH', 'Zürich'],
]

const NACH_CODE = new Map(KANTON_NAMEN)

/** Name eines Kantons, oder der Code selbst, wenn er unbekannt ist. */
export function kantonName(code: string): string {
  return NACH_CODE.get(code) ?? code
}

/** Ist dieser Regionscode ein Kanton (und nicht das ganze Land)? */
export function istKanton(code: string | null | undefined): boolean {
  return !!code && NACH_CODE.has(code)
}
