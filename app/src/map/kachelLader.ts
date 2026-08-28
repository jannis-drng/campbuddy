/**
 * SCHICHT 2 — der Kachel-Nachschub der Vorschaubilder (`RoutenVorschau`).
 *
 * Warum das nicht der Browser allein macht: eine Übersichtsseite trägt ein
 * Dutzend Vorschauen, jede aus vier bis sechs Kacheln. Hängt an jeder Kachel
 * nur ein <img>, dann gehen beim Aufschlagen der Seite fünfzig Anfragen
 * gleichzeitig an einen ehrenamtlichen Kachelserver hinaus. Der antwortet
 * darauf nicht mit Kacheln, sondern mit Absagen — und weil ein <img> von sich
 * aus keinen zweiten Versuch macht, blieben genau die abgesagten Stellen für
 * immer leer. Das war der Grund, aus dem die Community-Seite Karten zeigte,
 * von denen nur Teile ankamen.
 *
 * Diese Datei setzt drei Dinge davor:
 *   1. **Deckel.** Höchstens `GLEICHZEITIG` Kacheln unterwegs, alle Vorschauen
 *      zusammengezählt. Der Rest wartet, statt abgewiesen zu werden.
 *   2. **Zweiter Versuch.** Eine Absage ist meist Drosselung, keine fehlende
 *      Kachel — also noch einmal, kurz später und über einen anderen Host.
 *   3. **Gedächtnis.** Dieselbe Kachel wird nie zweimal geholt, auch nicht,
 *      wenn zwei Karten sie brauchen oder die Liste neu aufgebaut wird.
 *
 * Erst wenn eine Kachel wirklich da ist, zeigt die Vorschau sie an. Ein Bild,
 * das erst nach dem Vollständigwerden erscheint, wirkt langsamer als eines,
 * das halb steht — aber halb stehen bleibt es eben auch, und das ist der
 * Eindruck, den es zu vermeiden gilt.
 */

/**
 * Wie viele Kacheln gleichzeitig unterwegs sein dürfen.
 *
 * Sechs ist die Zahl, die Browser über HTTP/1.1 ohnehin pro Host zulassen —
 * hier gilt sie über alle Vorschauen und alle Hosts zusammen. Das ist
 * bewusst knapp: die Kacheln sind Beiwerk, und sie sollen weder den
 * Kachelserver noch die eigentliche Karte verdrängen.
 */
const GLEICHZEITIG = 6

/** Wie oft eine Kachel versucht wird, bevor sie als fehlend gilt. */
const VERSUCHE = 3

/**
 * Ab wann ein Versuch als gescheitert gilt.
 *
 * Ohne diese Grenze hielte eine einzige nie beantwortete Anfrage einen der
 * sechs Plätze für immer besetzt, und die Warteschlange käme zum Stillstand.
 */
const ZEITGRENZE_MS = 10_000

/** Wartezeit vor dem nächsten Versuch — Drosselung vergeht nur mit Zeit. */
const PAUSE_MS = 400

/** Schon geholt: Adresse → die Adresse, die geklappt hat (oder null). */
const erledigt = new Map<string, string | null>()
/** Gerade unterwegs — damit zwei Karten dieselbe Kachel nicht doppelt holen. */
const laufend = new Map<string, Promise<string | null>>()

let offen = 0
const wartend: (() => void)[] = []

function platzNehmen(): Promise<void> {
  if (offen < GLEICHZEITIG) { offen++; return Promise.resolve() }
  return new Promise((weiter) => {
    wartend.push(() => { offen++; weiter() })
  })
}

function platzFreigeben() {
  offen--
  /*
    Vom Ende, nicht vom Anfang: wer zuletzt gefragt hat, ist am ehesten das,
    was gerade im Bild steht. Beim schnellen Scrollen durch eine lange Liste
    würde eine Warteschlange von vorn zuerst die Karten bedienen, an denen
    längst niemand mehr vorbeischaut.
  */
  wartend.pop()?.()
}

function warten(ms: number) {
  return new Promise<void>((weiter) => setTimeout(weiter, ms))
}

/** Ein Ladeversuch. Bricht nie ab — sagt nur ja oder nein. */
function bildHolen(adresse: string): Promise<boolean> {
  return new Promise((fertig) => {
    const bild = new Image()
    let entschieden = false
    const antwort = (gut: boolean) => {
      if (entschieden) return
      entschieden = true
      clearTimeout(uhr)
      bild.onload = null
      bild.onerror = null
      fertig(gut)
    }
    const uhr = setTimeout(() => antwort(false), ZEITGRENZE_MS)
    bild.decoding = 'async'
    bild.onload = () => antwort(true)
    bild.onerror = () => antwort(false)
    bild.src = adresse
  })
}

async function durchprobieren(adressen: string[]): Promise<string | null> {
  for (let i = 0; i < Math.min(VERSUCHE, adressen.length); i++) {
    if (await bildHolen(adressen[i])) return adressen[i]
    if (i < Math.min(VERSUCHE, adressen.length) - 1) await warten(PAUSE_MS * 2 ** i)
  }
  return null
}

/**
 * Holt eine Kachel und meldet die Adresse, unter der sie angekommen ist.
 *
 * `adressen` ist dieselbe Kachel über verschiedene Hosts, in der Reihenfolge
 * der Versuche. Die erste Adresse ist zugleich der Schlüssel im Gedächtnis —
 * sie muss für eine Kachel deshalb immer dieselbe sein.
 *
 * Kommt die Kachel nicht an, ist die Antwort `null`. Die Vorschau lässt die
 * Stelle dann frei; ein Verlauf auf grauem Grund ist immer noch lesbar.
 */
export function ladeKachel(adressen: string[]): Promise<string | null> {
  const schluessel = adressen[0]

  const bekannt = erledigt.get(schluessel)
  if (bekannt !== undefined) return Promise.resolve(bekannt)

  const schonUnterwegs = laufend.get(schluessel)
  if (schonUnterwegs) return schonUnterwegs

  const lauf = (async () => {
    await platzNehmen()
    try {
      const treffer = await durchprobieren(adressen)
      /*
        Nur den Erfolg dauerhaft merken. Ein Nein war meist Drosselung, und
        die ist vorbei, wenn jemand die Seite später erneut ansieht — es als
        endgültig zu speichern hiesse, eine Lücke festzuschreiben.
      */
      if (treffer) erledigt.set(schluessel, treffer)
      return treffer
    } finally {
      laufend.delete(schluessel)
      platzFreigeben()
    }
  })()

  laufend.set(schluessel, lauf)
  return lauf
}

/** Liegt die Kachel schon vor? Dann darf sie ohne Umweg gezeichnet werden. */
export function kachelBereit(adresse: string): string | null {
  return erledigt.get(adresse) ?? null
}
