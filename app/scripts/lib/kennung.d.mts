/**
 * Typen zur gemeinsamen Kennung-Funktion.
 *
 * Sie liegt als `.mjs` bei den Skripten, weil Node sie dort braucht — und wird
 * von der Oberfläche mitbenutzt, damit die Adresse einer Gemeindeseite an
 * genau einer Stelle entsteht. Zwei Fassungen derselben Regel liefen früher
 * oder später auseinander, und der Fehler zeigte sich erst als toter Link auf
 * der veröffentlichten Seite.
 */
export declare function kennung(name: string): string
