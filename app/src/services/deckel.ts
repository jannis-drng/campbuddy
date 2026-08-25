/**
 * Gegen die stillschweigend abgeschnittene Antwort.
 *
 * PostgREST liefert pro Anfrage höchstens 1000 Zeilen — ohne Fehler, ohne
 * Hinweis, einfach weniger. Genau daran hing der teuerste Fehler dieses
 * Projekts: `fetchRemoteGemeinden` holte die Gemeindeflächen der Schweiz mit
 * einer einzigen Abfrage ohne Blättern und bekam 1000 von 2119. Über tausend
 * Gemeinden fehlten live auf der Karte, monatelang, und nichts hat es gemeldet
 * — die Karte sah aus, als gäbe es dort einfach nichts zu sagen.
 *
 * Auf einer Karte, deren ganzer Wert daran hängt, dass „keine Auskunft" und
 * „keine Regel" unterscheidbar bleiben, ist das die schlimmste Sorte Fehler.
 * Die Kartendaten kommen deshalb inzwischen als statische Dateien (siehe
 * `data/snapshot.ts`). Was an Abfragen bleibt, ist nutzerbezogen — und geht
 * durch diese Datei, damit derselbe Fehler nicht an anderer Stelle wieder
 * auftaucht.
 */

/**
 * Die Obergrenze, die PostgREST von sich aus setzt.
 *
 * Sie steht in der Projekteinstellung von Supabase (`db.max_rows`) und ist
 * dort auf dem Standardwert. Wird sie dort geändert, ändert sich hier nichts
 * Kaputtes: die Schleife blättert dann nur in grösseren Schritten, weil sie
 * an der tatsächlich gelieferten Menge erkennt, wann eine Seite voll war.
 */
export const SEITE = 1000

/**
 * Wie viele Seiten höchstens — als Reissleine, nicht als fachliche Grenze.
 *
 * Eine Endlosschleife gegen eine fremde API ist schlimmer als eine
 * unvollständige Liste, weil sie das Kontingent aufbraucht und den Browser
 * blockiert. Hunderttausend Zeilen erreicht keine der nutzerbezogenen
 * Tabellen; wer hier anschlägt, hat einen Fehler, keinen grossen Datenbestand.
 */
const MAX_SEITEN = 100

interface Antwort<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Holt wirklich alle Zeilen einer Abfrage, über den Deckel hinaus.
 *
 * `seite` bekommt einen Bereich und baut damit die Abfrage — in der Regel ein
 * `.range(von, bis)` am Ende einer Supabase-Kette. Geblättert wird, solange
 * eine Seite randvoll zurückkommt: das ist das einzige Signal, das PostgREST
 * gibt, dass da noch mehr sein könnte.
 *
 *     const touren = await alleZeilen<Tour>((von, bis) =>
 *       sb.from('routes').select('*').order('created_at').range(von, bis))
 */
export async function alleZeilen<T>(
  seite: (von: number, bis: number) => PromiseLike<Antwort<T>>,
): Promise<T[]> {
  const alle: T[] = []

  for (let n = 0; n < MAX_SEITEN; n++) {
    const von = n * SEITE
    const { data, error } = await seite(von, von + SEITE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    alle.push(...data)
    // Eine nicht ganz volle Seite heisst: das war der Rest. Eine volle heisst
    // nicht, dass mehr kommt — aber es ist das Einzige, worauf man sich
    // stützen kann, und eine überflüssige leere Anfrage ist billiger als eine
    // fehlende Zeile.
    if (data.length < SEITE) break
  }

  return alle
}
