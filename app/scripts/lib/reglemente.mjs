/**
 * Was ein kommunales Reglement ausmacht — geteilt von beiden Rechercheläufern.
 *
 * Der eine holt die Seiten mit `fetch`, der andere mit einem echten Browser.
 * Was sie danach damit tun, ist identisch: die Reglementsammlung erkennen, das
 * Polizeireglement herausfischen, das PDF in Artikel zerlegen und die Stellen
 * zum Übernachten im Wortlaut ausschneiden. Diese Logik zweimal zu pflegen
 * hiesse, sie über kurz oder lang auseinanderlaufen zu lassen — und dann
 * hinge es vom Abrufweg ab, welche Rechtslage die Karte zeigt.
 */
import { promises as dnsPromises } from 'node:dns'
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFParse } from 'pdf-parse'

const { lookup } = dnsPromises

/* ------------------------------------------------------------- Erkennung */

/**
 * Wonach auf der Gemeindeseite gesucht wird — in vier Landessprachen.
 *
 * Die Reglementsammlung heisst je nach Kanton und CMS anders. Breit gefasst,
 * weil ein verpasster Link eine Gemeinde ganz verliert, ein überflüssiger aber
 * nur einen Abruf kostet.
 */
export const SAMMLUNG = [
  [/reglement|règlement|regolamento|erlass|rechtssammlung|gesetzessammlung/i, 10],
  [/l[ée]gislation|legislation|leggi|gesetz/i, 6],
  [/verwaltung|administration|amministrazione|behörde|gemeinde|commune/i, 3],
  [/dokument|document|publikation|publication|downloads?|merkblatt/i, 2],
]

/** Wie gut ein Link nach der Reglementsammlung aussieht. 0 = gar nicht. */
export function sammlungsRang(text) {
  let rang = 0
  for (const [muster, punkte] of SAMMLUNG) if (muster.test(text)) rang = Math.max(rang, punkte)
  // Häufige Sackgassen, die sonst die besten Plätze belegen.
  if (/baupublikation|todesfall|abfall|veranstaltung|news|aktuell/i.test(text)) rang = 0
  return rang
}

/** Welches Dokument gemeint ist: das Polizeireglement, hilfsweise Verwandtes. */
export const DOKUMENT = /polizei|police|polizia|gemeindeordnung|allgemeines\s*reglement|règlement\s*général|nutzungs|bau.*reglement|camping|campieren/i

/**
 * Die Stellen, an denen es um das Übernachten im Freien geht.
 *
 * Vier Sprachen, und bewusst auch die Umschreibungen: viele Reglemente sagen
 * nicht „Campieren", sondern „Nächtigen im Freien" oder „bivouac". Die
 * Wortgrenzen sind wichtig — ohne sie trifft „camp" auch „campagne" und
 * „Zelt" auch „Festzelt".
 */
export const TREFFER = new RegExp(
  '\\b(' + [
    // deutsch
    'campier\\w*', 'campieren', 'zelt', 'zelte[nr]?', 'zeltens', 'biwak\\w*',
    'wohnwagen', 'wohnmobil\\w*', 'n[äa]chtig\\w*', 'campingwagen', 'camping',
    // französisch
    'camper', 'campe[rz]', 'campement', 'bivouac\\w*', 'tente[s]?', 'caravane[s]?',
    'camping[-\\s]?car[s]?',
    // italienisch
    'campeggi\\w*', 'tenda', 'tende', 'roulotte[s]?', 'bivacc\\w*',
  ].join('|') + ')\\b',
  'i',
)

/**
 * Was ein Treffer sein muss, um mehr als ein Wort zu sein.
 *
 * „Camping" allein steht in jedem Reglement irgendwo — im Gebührenanhang, im
 * Verzeichnis der Betriebe. Interessant wird die Stelle erst, wenn sie etwas
 * anordnet. Ohne dieses zweite Sieb besteht die Ausbeute aus Fehlalarmen, und
 * eine Kandidatenliste, die man ohnehin alle wegwerfen muss, ist wertlos.
 */
export const NORMATIV = /verbot|verboten|untersagt|gestattet|erlaubt|bewilligung|bewilligungspflicht|zustimmung|nur mit|interdit|interdiction|autoris|permis|soumis|vietat|consentit|autorizzazione|divieto/i

/**
 * Ein Inhaltsverzeichnis erkennt man an den Punktreihen zur Seitenzahl.
 *
 * Ohne dieses Sieb besteht die halbe Ausbeute aus Verzeichniszeilen: dort steht
 * das Stichwort zwar, aber kein Satz, der etwas regelt.
 */
export const VERZEICHNIS = /\.{4,}\s*\d+|…{2,}/

/**
 * Das Dokument in seine Artikel zerlegen.
 *
 * Der einzige verlässliche Anker in schweizerischen Reglementen ist die
 * Artikelzählung. Wer stattdessen ein festes Zeichenfenster um den Treffer
 * legt, schneidet regelmässig den Absatz mit der Ausnahme ab — und „Campieren
 * ist verboten" ohne den nächsten Satz ist eine irreführende Verkürzung.
 */
export function artikel(text) {
  const sauber = text
    .split('\n')
    .filter((z) => !VERZEICHNIS.test(z))
    .join('\n')
    .replace(/\u00ad/g, '')

  const kopf = /(?:^|\n)\s*(Art(?:icle|icolo)?\.?\s*\d+[a-z]?)\s*[:.\-–]?\s*([^\n]{0,80})/gi
  const stellen = []
  let m
  while ((m = kopf.exec(sauber)) !== null) {
    stellen.push({ nummer: m[1].replace(/\s+/g, ' ').trim(), titel: m[2].trim(), von: m.index })
  }
  return stellen.map((a, i) => ({
    nummer: a.nummer,
    titel: a.titel,
    text: sauber.slice(a.von, stellen[i + 1]?.von ?? Math.min(sauber.length, a.von + 2500))
      .replace(/\s+/g, ' ').trim(),
  }))
}

/**
 * Die Artikel heraussuchen, die vom Übernachten im Freien handeln.
 *
 * Zurück geht der Wortlaut, nicht eine Einstufung. Ob daraus „erlaubt" oder
 * „verboten" wird, entscheidet ein Mensch, der die Stelle gelesen hat — ein
 * Treffer auf „Campieren" sagt noch nicht, in welche Richtung der Satz geht,
 * und ein falsches Grün auf dieser Karte ist schlimmer als eine leere Fläche.
 */
export function fundstellen(text) {
  const gefunden = []
  for (const a of artikel(text)) {
    if (a.text.length < 40 || a.text.length > 4000) continue

    // Stichwort und Anordnung müssen zusammengehören. Beide bloss irgendwo im
    // selben Artikel zu verlangen genügt nicht: „interdit" steht in fast jedem
    // Artikel eines Polizeireglements, und „camping" irgendwo weiter unten im
    // Gebührenanhang. Was zählt, ist der Satz, der beides verbindet.
    const treffer = new RegExp(TREFFER.source, 'gi')
    let m
    let passt = false
    while ((m = treffer.exec(a.text)) !== null) {
      const umfeld = a.text.slice(Math.max(0, m.index - 220), m.index + 260)
      if (NORMATIV.test(umfeld)) { passt = true; break }
    }
    if (!passt) continue

    // Ein Artikel, dessen Überschrift schon das Thema nennt, ist der sicherste
    // Fund — er kommt zuerst, damit beim Sichten das Beste oben steht.
    const imTitel = TREFFER.test(a.titel ?? '')
    gefunden.push({
      artikel: a.titel ? `${a.nummer} ${a.titel}` : a.nummer,
      text: a.text.slice(0, 1400),
      im_titel: imTitel,
    })
    if (gefunden.length >= 6) break
  }
  gefunden.sort((a, b) => Number(b.im_titel) - Number(a.im_titel))
  return gefunden.slice(0, 4)
}

/* ------------------------------------------------------------- Werkzeuge */

export const HÖFLICH = 400
export const schlafe = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Ein Abruf mit Zeitlimit und ehrlichem Scheitern.
 *
 * Gemeindeseiten sind ein sehr gemischtes Feld: abgelaufene Zertifikate,
 * Server, die nie antworten, Weiterleitungen im Kreis. Jeder Fehler wird
 * festgehalten statt verschluckt — am Ende soll ablesbar sein, woran es lag.
 */
export async function hole(url, alsBinär = false) {
  const abbruch = AbortSignal.timeout(20000)
  const antwort = await fetch(url, {
    signal: abbruch,
    redirect: 'follow',
    headers: {
      'User-Agent': 'CampBuddy-Recherche/1.0 (+https://github.com/jannis-drng/campbuddy)',
      'Accept-Language': 'de,fr,it',
    },
  })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return alsBinär ? Buffer.from(await antwort.arrayBuffer()) : await antwort.text()
}

/** Alle Links einer Seite als [absoluteAdresse, Linktext]. */
export function links(html, basis) {
  const gefunden = []
  const muster = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = muster.exec(html)) !== null) {
    const roh = m[1]
    if (/^(#|mailto:|tel:|javascript:)/i.test(roh)) continue
    let absolut
    try { absolut = new URL(roh, basis).href } catch { continue }
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    gefunden.push([absolut, text])
  }
  return gefunden
}

/** Den Text eines PDF holen. Gescannte Bilder liefern nichts — das ist kein Fehler. */
export async function pdfText(daten) {
  const p = new PDFParse({ data: daten })
  try {
    const { text } = await p.getText()
    return text
  } finally {
    await p.destroy().catch(() => {})
  }
}

/**
 * Was hinter einer Adresse steckt — PDF oder Webseite, am Inhalt erkannt.
 *
 * Die Dateiendung taugt nicht als Merkmal. Viele Gemeinde-CMS liefern ihre
 * Reglemente unter Adressen wie `/_doc/4711` oder `download.php?id=12` aus,
 * ohne jedes `.pdf` — Aaraus Rechtssammlung verlinkt 741 Dokumente und kein
 * einziges davon mit Endung. Wer nur auf `.pdf` prüft, übersieht genau die
 * Gemeinden, die ihre Erlasse ordentlich publizieren.
 *
 * Entschieden wird deshalb an den ersten Bytes: ein PDF beginnt mit `%PDF`.
 * Das ist billiger und ehrlicher als dem Content-Type zu glauben, den manche
 * Server falsch setzen.
 */
export async function holeDokument(url) {
  const daten = await hole(url, true)
  const kopf = daten.subarray(0, 5).toString('latin1')
  if (kopf.startsWith('%PDF')) return { typ: 'pdf', daten }
  return { typ: 'html', html: daten.toString('utf8'), url }
}

/**
 * Links, die auf ein Reglement zeigen könnten — mit und ohne Dateiendung.
 *
 * Zurück kommt eine Rangfolge: was schon in der Adresse nach einem Dokument
 * aussieht, zuerst; dann, was im Linktext danach klingt. Geprüft wird
 * anschliessend am Inhalt, nicht am Namen.
 */
/**
 * Adressen, die thematisch passen, aber nie ein Erlass sind.
 *
 * Eine Neuigkeit mit dem Titel „Polizei-/Veranstaltungsbewilligung: Schiessen"
 * trifft jedes Polizei-Muster und ist doch bloss eine Meldung von letzter
 * Woche. Solche Treffer sind schlimmer als gar keine: sie sehen nach einem
 * Fund aus und verdrängen die echte Rechtssammlung von Platz eins.
 */
const KEIN_ERLASS = /\/news\/|\/aktuell|\/veranstaltung|\/anlaess|\/agenda|\/mitteilung|\/medien|\/protokoll|\/traktand|\/stellen|\/jobs?\b/i

export function dokumentKandidaten(gefundene) {
  const bewertet = []
  for (const [u, t] of gefundene) {
    const zusammen = `${u} ${t}`
    const endung = /\.pdf($|\?)/i.test(u)
    if (!endung && !DOKUMENT.test(zusammen)) continue
    if (KEIN_ERLASS.test(u) && !endung) continue
    const punkte = dokumentRang(zusammen, endung)
    if (punkte <= AUSSCHUSS) continue
    bewertet.push([u, t, punkte])
  }
  bewertet.sort((a, b) => b[2] - a[2])
  const gesehen = new Set()
  return bewertet.filter(([u]) => !gesehen.has(u) && gesehen.add(u)).map(([u, t]) => [u, t])
}

/** Ab hier lohnt sich der Abruf nicht mehr. */
const AUSSCHUSS = -10

/**
 * Wie gut ein Dokument nach dem Polizeireglement aussieht.
 *
 * Die erste Fassung wog das blosse Wort „Reglement" höher als „Polizei" — und
 * zog damit systematisch das Falsche: von 578 Gemeinden, bei denen ein
 * Reglement gelesen wurde und nichts zum Übernachten darinstand, war nur bei
 * 36 Prozent überhaupt ein Polizeireglement dabei. Der Rest waren
 * Baureglemente und Gemeindeordnungen. Die Campingregel steht aber fast immer
 * im Polizeireglement, und das haben wir schlicht nie geöffnet.
 *
 * Deshalb entscheidet jetzt das Thema, nicht die Wortart. Und die Themen, die
 * sicher nichts beitragen — Abfall, Friedhof, Wasser, Gebühren —, kosten so
 * viele Punkte, dass sie gar nicht erst abgerufen werden.
 */
export function dokumentRang(text, istPdf = true) {
  let p = istPdf ? 2 : 0

  // Die Kantonspolizei ist nicht das Polizeireglement der Gemeinde. Ihr
  // Kürzel „kapo" liess den Verweis auf kapo.zh.ch als bestes Dokument
  // gewinnen — eine Behördenseite, auf der kein einziger Erlass steht.
  if (/kapo\.|kantonspolizei|police\s*cantonale|stadtpolizei|polizei\.zh\.ch|suisse-?police/i.test(text)) return -30
  if (/polizeireglement|polizei-?reglement|règlement\s*(de\s*)?police|regolamento\s*(di\s*)?polizia/i.test(text)) p += 20
  else if (/polizei|police|polizia/i.test(text)) p += 12
  if (/gemeindeordnung|allgemeines\s*reglement|règlement\s*g[ée]n[ée]ral|regolamento\s*generale/i.test(text)) p += 8
  if (/reglement|règlement|regolamento|verordnung|ordnung|gesetz|erlass|statut/i.test(text)) p += 5
  if (/camping|campier|campeggio/i.test(text)) p += 6

  // Bauen und Zonen regeln, wo ein Campingplatz stehen darf — nicht, ob man
  // eine Nacht im Zelt verbringen darf. Gelegentlich steht dort doch etwas,
  // deshalb Abzug statt Ausschluss.
  if (/baureglement|bau-?\s*und\s*zonen|nutzungsplan|zonenreglement|bauordnung|plan\s*d.affectation/i.test(text)) p -= 8

  // Diese Erlasse tragen sicher nichts bei.
  if (/abfall|entsorgung|friedhof|bestattung|wasser|abwasser|kanalisation|feuerwehr|schul|personal|besoldung|steuer|geb[üu]hren|tarif|finanz|energie|d[ée]chets|cimeti[èe]re|eaux|pompiers|[ée]cole|imp[ôo]t/i.test(text)) p -= 25
  // Formulare, Protokolle, Jahresberichte
  if (/formular|gesuch|antrag|protokoll|jahresbericht|budget|rechnung|einladung|traktand/i.test(text)) p -= 25
  return p
}

/* ---------------------------------------------------------------- OCR */

/**
 * Eingescannte Reglemente lesbar machen.
 *
 * 242 Gemeinden veröffentlichen ihr Reglement als reines Bild — abfotografiert
 * oder eingescannt, ohne Textebene. Für die bisherige Suche waren sie leer und
 * damit stumm, obwohl die Regel schwarz auf weiss dasteht.
 *
 * Der Weg führt über zwei Werkzeuge: `pdftoppm` rendert die Seiten zu Bildern,
 * `tesseract` liest sie. Beides läuft lokal, es geht nichts an einen Dienst
 * heraus. Gerendert wird mit 200 dpi in Graustufen — genug für gesetzten
 * Fliesstext und deutlich schneller als die volle Auflösung.
 *
 * Die Sprache steht nicht fest: ein Reglement aus dem Wallis kann deutsch oder
 * französisch sein. Tesseract bekommt deshalb alle drei Landessprachen
 * gleichzeitig; das kostet etwas Zeit und erspart eine Fehlentscheidung, die
 * den ganzen Text unbrauchbar machen würde.
 */
const OCR_SPRACHEN = 'deu+fra+ita'
const OCR_SEITEN = 40

export async function ocrText(daten) {
  const spur = await mkdtemp(join(tmpdir(), 'campbuddy-ocr-'))
  const pdf = join(spur, 'quelle.pdf')
  try {
    await writeFile(pdf, daten)
    // Erst rendern …
    await lauf('pdftoppm', ['-gray', '-r', '200', '-f', '1', '-l', String(OCR_SEITEN), pdf, join(spur, 'seite')])
    const bilder = (await readdir(spur)).filter((f) => f.endsWith('.pgm') || f.endsWith('.ppm')).sort()
    if (bilder.length === 0) return ''
    // … dann lesen. Alle Seiten in einem Durchgang über eine Dateiliste:
    // Tesseract je Seite zu starten kostet mehr Zeit im Startvorgang als im Lesen.
    const liste = join(spur, 'seiten.txt')
    await writeFile(liste, bilder.map((b) => join(spur, b)).join('\n'))
    await lauf('tesseract', [liste, join(spur, 'ergebnis'), '-l', OCR_SPRACHEN, '--psm', '1'])
    return await readFile(join(spur, 'ergebnis.txt'), 'utf8').catch(() => '')
  } finally {
    await rm(spur, { recursive: true, force: true }).catch(() => {})
  }
}

/** Ein Hilfsprogramm aufrufen und auf sein Ende warten. */
function lauf(befehl, argumente, fristMs = 240000) {
  return new Promise((fertig, scheitern) => {
    const kind = spawn(befehl, argumente, { stdio: 'ignore' })
    const frist = setTimeout(() => { kind.kill('SIGKILL'); scheitern(new Error(`${befehl}: Frist abgelaufen`)) }, fristMs)
    kind.on('error', (e) => { clearTimeout(frist); scheitern(e) })
    kind.on('close', (code) => {
      clearTimeout(frist)
      code === 0 ? fertig() : scheitern(new Error(`${befehl}: Abbruch mit ${code}`))
    })
  })
}

/** Steht OCR auf diesem Rechner zur Verfügung? */
export async function ocrVerfuegbar() {
  try {
    await lauf('tesseract', ['--version'], 10000)
    await lauf('pdftoppm', ['-v'], 10000)
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------ Anbieter */

/**
 * Eine Drossel je Anbieter — und die Einsicht, warum es sie braucht.
 *
 * Beim ersten vollen Browserlauf sind 726 von 1056 Gemeinden an der Startseite
 * gescheitert. Das sah nach einem Netzausfall aus, war aber etwas anderes:
 * rund zwei Drittel aller Schweizer Gemeindeseiten liegen bei einem einzigen
 * Hoster (i-web, 195.65.x), ein weiteres Viertel bei 193.135.x. Drei
 * gleichzeitige Abrufe über tausend Gemeinden hinweg sind für uns
 * „drei gleichzeitig" — für den Anbieter sind es tausende Anfragen aus einer
 * Hand, und er hat uns folgerichtig ausgesperrt.
 *
 * Deshalb wird hier nicht nach Gemeinden gedrosselt, sondern nach Anbieter:
 * pro Adressblock immer nur ein Abruf, mit spürbarem Abstand. Der Lauf dauert
 * dadurch länger. Das ist der richtige Preis — die Gegenseite stellt diese
 * Dokumente freiwillig bereit.
 */
/**
 * Wie lange zwischen zwei Abrufen beim selben Anbieter gewartet wird.
 *
 * 2,5 Sekunden waren zu wenig. Bei rund 1400 Gemeinden auf einem einzigen
 * Hoster heisst das über tausend Anfragen aus einer Hand innerhalb einer
 * Stunde — der Anbieter hat uns zum zweiten Mal ausgesperrt, und der Lauf
 * verbrannte danach seine ganze Zeit in Zeitüberschreitungen, ohne einen
 * einzigen Befund zu erzeugen.
 *
 * Zwölf Sekunden bedeuten für den Anbieter fünf Anfragen pro Minute, also
 * weniger als ein einzelner Mensch beim Blättern erzeugt. Für uns heisst es:
 * ein grosser Lauf dauert Tage statt Stunden. Das ist die richtige Reihenfolge
 * der Rücksichtnahme — die Gegenseite stellt diese Dokumente freiwillig
 * bereit, und ein gesperrter Lauf bringt ohnehin nichts.
 *
 * Über ANBIETER_PAUSE_MS anpassbar, etwa für einen kleinen, gezielten Lauf.
 */
const ANBIETER_PAUSE = Number(process.env.ANBIETER_PAUSE_MS ?? 12000)
const letzterAbruf = new Map()
const wartend = new Map()

const anbieterCache = new Map()

/**
 * Der Anbieter hinter einer Adresse — über die aufgelöste IP, nicht den Namen.
 *
 * Das ist der Kern der Sache und war zuerst falsch: nach `regensdorf.ch` zu
 * gruppieren macht jede Gemeinde zu ihrem eigenen Anbieter, und die Bremse
 * greift nie. Genau so kam es zur Sperre. Entscheidend ist, wer die Anfragen
 * tatsächlich entgegennimmt — und das sind bei zwei Dritteln aller Schweizer
 * Gemeinden dieselben Server.
 *
 * Gruppiert wird auf /16, weil ein Hoster seine Gemeindeseiten über mehrere
 * benachbarte Adressen verteilt. Lässt sich der Name nicht auflösen, bleibt
 * er selbst der Schlüssel — dann wird eben diese eine Gemeinde gedrosselt.
 */
export async function anbieterVon(url) {
  let host
  try {
    host = new URL(url).hostname
  } catch {
    return url
  }
  if (anbieterCache.has(host)) return anbieterCache.get(host)

  let schluessel = host
  try {
    const [{ address }] = await lookup(host, { all: true })
    if (address?.includes('.')) schluessel = address.split('.').slice(0, 2).join('.')
    else if (address) schluessel = address.split(':').slice(0, 3).join(':')
  } catch {
    // Nicht auflösbar — dann ist der Name der beste Schlüssel, den es gibt.
  }
  anbieterCache.set(host, schluessel)
  return schluessel
}

/**
 * Anstehen, bis dieser Anbieter wieder an der Reihe ist.
 *
 * Bewusst eine Kette statt eines blossen Zeitvergleichs: bei parallelen
 * Arbeitern würden sonst alle gleichzeitig feststellen, dass die Pause vorbei
 * ist, und wieder im Pulk losrennen.
 */
const HOECHSTE_HALTEDAUER = 180000

export async function anstehen(schluessel) {
  const vorherige = wartend.get(schluessel) ?? Promise.resolve()
  let freigeben
  const meine = new Promise((r) => { freigeben = r })
  wartend.set(schluessel, meine)

  // Notbremse: eine verlorene Freigabe darf die Kette nicht für immer
  // festsetzen. Genau das ist passiert — ein `continue` an der falschen Stelle,
  // und der Lauf stand neun Stunden bei null Gemeinden, weil fast alle
  // denselben Anbieter teilen. Ein Fehler in dieser Kette darf höchstens
  // langsam machen, nie blockieren.
  const notbremse = setTimeout(freigeben, HOECHSTE_HALTEDAUER)

  await vorherige
  const seit = Date.now() - (letzterAbruf.get(schluessel) ?? 0)
  if (seit < ANBIETER_PAUSE) await schlafe(ANBIETER_PAUSE - seit)
  letzterAbruf.set(schluessel, Date.now())
  return () => { clearTimeout(notbremse); freigeben() }
}

/**
 * Woran man erkennt, dass ein Anbieter dichtmacht.
 *
 * Diese Fehler sind ausdrücklich **kein** Befund über die Gemeinde. Sie als
 * „kein Reglement gefunden" abzulegen wäre die schlimmere Art von Datenmüll:
 * ein Ergebnis, dem niemand ansieht, dass es keines ist.
 */
export const SPERRE = /EMPTY_RESPONSE|CONNECTION_CLOSED|INTERNET_DISCONNECTED|UND_ERR_SOCKET|ECONNRESET|CONNECT_TIMEOUT|ETIMEDOUT/

/**
 * Zählt Fehlschläge je Anbieter und meldet, wann Schluss ist.
 *
 * Nach einer Reihe von Sperrsignalen hintereinander hat es keinen Sinn mehr,
 * weiter anzuklopfen — dann sind wir gesperrt, und jeder weitere Abruf macht
 * es nur schlimmer.
 */
export function sperrWaechter(grenze = 8) {
  const reihe = new Map()
  return {
    melde(schluessel, gescheitert) {
      reihe.set(schluessel, gescheitert ? (reihe.get(schluessel) ?? 0) + 1 : 0)
    },
    gesperrt(schluessel) {
      return (reihe.get(schluessel) ?? 0) >= grenze
    },
  }
}
