/**
 * Aus einem Namen eine Adresse machen — an genau einer Stelle.
 *
 * Zwei Skripte brauchen dieselbe Regel: `gemeindeseiten.mjs` benennt damit die
 * Dateien, `snapshot-daten.mjs` schreibt damit die Kantonskennungen für die
 * Startseite. Liefen die beiden auseinander, verlinkte die Startseite auf
 * Adressen, die es nicht gibt — und zwar erst nach dem Veröffentlichen
 * sichtbar, weil beide für sich genommen plausibel aussehen.
 *
 * Die Umlaute werden ausgeschrieben, bevor die Zeichen zerlegt werden: sonst
 * würde aus „Zürich" ein „zurich" statt „zuerich", und aus „Grüningen" ein
 * „gruningen". Im Deutschen ist das falsch — ü ist ue, nicht u.
 */
export function kennung(name) {
  return String(name).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
