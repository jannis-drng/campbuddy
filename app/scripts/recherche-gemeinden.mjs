/**
 * Die kommunalen Reglemente suchen, holen und die einschlägige Stelle herausschneiden.
 *
 * Es gibt keine Datenbank der Schweizer Campingregeln — genau deshalb ist diese
 * Karte etwas wert. Was es gibt, sind 2119 Gemeindewebseiten, auf denen
 * irgendwo ein Polizeireglement als PDF liegt, und darin oft ein Artikel zum
 * Campieren. Dieser Läufer sucht ihn.
 *
 * Was er ausdrücklich NICHT tut: eine Rechtslage behaupten. Er sammelt Belege —
 * Dokumentadresse, Titel, den Artikel im Wortlaut — und legt sie als
 * *Kandidaten* ab. Ob daraus „erlaubt" oder „verboten" wird, entscheidet ein
 * Mensch, der die Stelle gelesen hat. Ein Treffer auf das Wort „Campieren" sagt
 * noch nicht, in welche Richtung der Satz geht, und ein falsches Grün auf dieser
 * Karte ist schlimmer als eine leere Fläche.
 *
 * Aufruf:  node scripts/recherche-gemeinden.mjs [--limit N] [--kanton CH-VS] [--nur 6300]
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFParse } from 'pdf-parse'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const arg = (name, standard = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}

const LIMIT = Number(arg('limit', '0')) || Infinity
const KANTON = arg('kanton')
const NUR = arg('nur')
const GLEICHZEITIG = 6

/* ------------------------------------------------------------- Erkennung */

/**
 * Wonach auf der Gemeindeseite gesucht wird — in vier Landessprachen.
 *
 * Die Reglementsammlung heisst je nach Kanton und CMS anders. Breit gefasst,
 * weil ein verpasster Link eine Gemeinde ganz verliert, ein überflüssiger aber
 * nur einen Abruf kostet.
 */
const SAMMLUNG = [
  [/reglement|règlement|regolamento|erlass|rechtssammlung|gesetzessammlung/i, 10],
  [/l[ée]gislation|legislation|leggi|gesetz/i, 6],
  [/verwaltung|administration|amministrazione|behörde|gemeinde|commune/i, 3],
  [/dokument|document|publikation|publication|downloads?|merkblatt/i, 2],
]

/** Wie gut ein Link nach der Reglementsammlung aussieht. 0 = gar nicht. */
function sammlungsRang(text) {
  let rang = 0
  for (const [muster, punkte] of SAMMLUNG) if (muster.test(text)) rang = Math.max(rang, punkte)
  // Häufige Sackgassen, die sonst die besten Plätze belegen.
  if (/baupublikation|todesfall|abfall|veranstaltung|news|aktuell/i.test(text)) rang = 0
  return rang
}

/** Welches Dokument gemeint ist: das Polizeireglement, hilfsweise Verwandtes. */
const DOKUMENT = /polizei|police|polizia|gemeindeordnung|allgemeines\s*reglement|règlement\s*général|nutzungs|bau.*reglement|camping|campieren/i

/**
 * Die Stellen, an denen es um das Übernachten im Freien geht.
 *
 * Vier Sprachen, und bewusst auch die Umschreibungen: viele Reglemente sagen
 * nicht „Campieren", sondern „Nächtigen im Freien" oder „bivouac". Die
 * Wortgrenzen sind wichtig — ohne sie trifft „camp" auch „campagne" und
 * „Zelt" auch „Festzelt".
 */
const TREFFER = new RegExp(
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
const NORMATIV = /verbot|verboten|untersagt|gestattet|erlaubt|bewilligung|bewilligungspflicht|zustimmung|nur mit|interdit|interdiction|autoris|permis|soumis|vietat|consentit|autorizzazione|divieto/i

/**
 * Ein Inhaltsverzeichnis erkennt man an den Punktreihen zur Seitenzahl.
 *
 * Ohne dieses Sieb besteht die halbe Ausbeute aus Verzeichniszeilen: dort steht
 * das Stichwort zwar, aber kein Satz, der etwas regelt.
 */
const VERZEICHNIS = /\.{4,}\s*\d+|…{2,}/

/**
 * Das Dokument in seine Artikel zerlegen.
 *
 * Der einzige verlässliche Anker in schweizerischen Reglementen ist die
 * Artikelzählung. Wer stattdessen ein festes Zeichenfenster um den Treffer
 * legt, schneidet regelmässig den Absatz mit der Ausnahme ab — und „Campieren
 * ist verboten" ohne den nächsten Satz ist eine irreführende Verkürzung.
 */
function artikel(text) {
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
function fundstellen(text) {
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

const HÖFLICH = 400
const schlafe = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Ein Abruf mit Zeitlimit und ehrlichem Scheitern.
 *
 * Gemeindeseiten sind ein sehr gemischtes Feld: abgelaufene Zertifikate,
 * Server, die nie antworten, Weiterleitungen im Kreis. Jeder Fehler wird
 * festgehalten statt verschluckt — am Ende soll ablesbar sein, woran es lag.
 */
async function hole(url, alsBinär = false) {
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
function links(html, basis) {
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
async function pdfText(daten) {
  const p = new PDFParse({ data: daten })
  try {
    const { text } = await p.getText()
    return text
  } finally {
    await p.destroy().catch(() => {})
  }
}

/* ------------------------------------------------------- Eine Gemeinde */

async function eineGemeinde(g) {
  const ergebnis = {
    bfs: g.bfs, name: g.name, kanton: g.kanton, website: g.website,
    dokument: null, dokument_titel: null, stellen: [], fehler: null,
  }
  if (!g.website) { ergebnis.fehler = 'keine Webseite bekannt'; return ergebnis }

  let start
  try {
    start = await hole(g.website)
  } catch (e) {
    ergebnis.fehler = `Startseite: ${e.message}`
    return ergebnis
  }

  const alle = links(start, g.website)

  // Direkt verlinkte PDFs zuerst — manche Gemeinden hängen das Reglement auf
  // die Startseite und ersparen uns den Umweg über die Sammlung.
  const kandidaten = alle
    .filter(([u, t]) => /\.pdf($|\?)/i.test(u) && DOKUMENT.test(`${u} ${t}`))
    .slice(0, 4)

  if (kandidaten.length === 0) {
    // Nach Rang, nicht nach Reihenfolge im Dokument. Vorher gewann, was zufällig
    // weiter oben stand — auf einer Gemeindeseite sind das die Baupublikationen,
    // und die Reglementsammlung fiel hinten heraus.
    const sammlungen = alle
      .map(([u, t]) => [u, t, sammlungsRang(`${u} ${t}`)])
      .filter(([, , rang]) => rang > 0)
      .sort((a, b) => b[2] - a[2])
      .slice(0, 4)

    // Eine Ebene tiefer, wenn die Sammlung selbst keine PDF verlinkt: viele
    // Gemeinden führen pro Reglement eine eigene Unterseite.
    const tiefer = []
    for (const [seite] of sammlungen) {
      try {
        await schlafe(HÖFLICH)
        const html = await hole(seite)
        for (const [u, t] of links(html, seite)) {
          if (/\.pdf($|\?)/i.test(u)) {
            if (DOKUMENT.test(`${u} ${t}`)) kandidaten.push([u, t])
          } else if (DOKUMENT.test(t) && tiefer.length < 3) {
            tiefer.push([u, t])
          }
        }
      } catch { /* eine Sammlung weniger, kein Grund abzubrechen */ }
      if (kandidaten.length >= 4) break
    }

    for (const [seite, titel] of tiefer) {
      if (kandidaten.length >= 4) break
      try {
        await schlafe(HÖFLICH)
        const html = await hole(seite)
        for (const [u, t] of links(html, seite)) {
          if (/\.pdf($|\?)/i.test(u)) kandidaten.push([u, t || titel])
        }
      } catch { /* nichts zu holen */ }
    }
  }

  if (kandidaten.length === 0) {
    ergebnis.fehler = 'kein passendes Reglement gefunden'
    return ergebnis
  }

  // Das Polizeireglement zuerst prüfen, dann die schwächeren Kandidaten.
  kandidaten.sort(([ua, ta], [ub, tb]) => {
    const rang = (s) => (/polizei|police|polizia/i.test(s) ? 0 : 1)
    return rang(`${ua} ${ta}`) - rang(`${ub} ${tb}`)
  })

  for (const [url, titel] of kandidaten.slice(0, 4)) {
    try {
      await schlafe(HÖFLICH)
      const daten = await hole(url, true)
      if (daten.length > 12 * 1024 * 1024) continue
      const text = await pdfText(daten)
      if (!text || text.length < 400) continue
      const stellen = fundstellen(text)
      if (stellen.length > 0) {
        ergebnis.dokument = url
        ergebnis.dokument_titel = titel || null
        ergebnis.stellen = stellen
        return ergebnis
      }
      // Gelesen, aber nichts zum Übernachten drin — auch das ist ein Befund.
      if (!ergebnis.dokument) { ergebnis.dokument = url; ergebnis.dokument_titel = titel || null }
    } catch (e) {
      ergebnis.fehler = `PDF: ${e.message}`
    }
  }

  if (ergebnis.stellen.length === 0 && !ergebnis.fehler) {
    ergebnis.fehler = 'Reglement gelesen, keine Stelle zum Übernachten'
  }
  return ergebnis
}

/* ------------------------------------------------------------------ Lauf */

const quelle = existsSync(resolve(ROOT, 'import/CH/gemeinden/CH.json'))
  ? resolve(ROOT, 'import/CH/gemeinden/CH.json')
  : resolve(ROOT, 'src/data/gemeinden/CH-VS.json')

let gemeinden = JSON.parse(readFileSync(quelle, 'utf8')).features.map((f) => f.properties)
if (KANTON) gemeinden = gemeinden.filter((g) => g.kanton === KANTON)
if (NUR) gemeinden = gemeinden.filter((g) => String(g.bfs) === NUR)
gemeinden = gemeinden.slice(0, LIMIT)

const ZIEL = resolve(ROOT, 'import/recherche')
mkdirSync(ZIEL, { recursive: true })
const AUSGABE = resolve(ZIEL, `kandidaten${KANTON ? `-${KANTON}` : ''}.json`)

console.log(`Recherche für ${gemeinden.length} Gemeinden, ${GLEICHZEITIG} gleichzeitig …`)

const ergebnisse = []
let fertig = 0
const warteschlange = [...gemeinden]

async function arbeiter() {
  while (warteschlange.length) {
    const g = warteschlange.shift()
    let r
    try {
      r = await eineGemeinde(g)
    } catch (e) {
      r = { bfs: g.bfs, name: g.name, kanton: g.kanton, website: g.website, stellen: [], fehler: `unerwartet: ${e.message}` }
    }
    ergebnisse.push(r)
    fertig++
    if (fertig % 25 === 0 || fertig === gemeinden.length) {
      const mit = ergebnisse.filter((x) => x.stellen.length > 0).length
      console.log(`  ${fertig}/${gemeinden.length} — ${mit} mit Fundstelle`)
      writeFileSync(AUSGABE, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ergebnisse }, null, 1) + '\n')
    }
  }
}

await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter))

ergebnisse.sort((a, b) => (a.bfs ?? 0) - (b.bfs ?? 0))
writeFileSync(AUSGABE, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ergebnisse }, null, 1) + '\n')

const mitStelle = ergebnisse.filter((r) => r.stellen.length > 0)
const mitDokument = ergebnisse.filter((r) => r.dokument)
console.log('')
console.log(`Fundstelle zum Übernachten: ${mitStelle.length} von ${ergebnisse.length}`)
console.log(`Reglement überhaupt gefunden: ${mitDokument.length}`)
console.log(`-> ${AUSGABE}`)
const gründe = {}
for (const r of ergebnisse) if (r.stellen.length === 0 && r.fehler) {
  const k = r.fehler.split(':')[0]
  gründe[k] = (gründe[k] ?? 0) + 1
}
for (const [k, n] of Object.entries(gründe).sort((a, b) => b[1] - a[1])) console.log(`   ${n}× ${k}`)
