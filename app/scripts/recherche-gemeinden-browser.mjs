/**
 * Dasselbe wie `recherche-gemeinden.mjs`, aber mit einem echten Browser.
 *
 * Der HTTP-Läufer scheiterte bei 1056 Gemeinden daran, das Reglement zu
 * finden — nicht, weil es nicht da wäre, sondern weil die Navigation per
 * JavaScript aufgebaut wird. Im rohen HTML steht dann ein leeres `<nav>`, und
 * der Link zur Rechtssammlung existiert erst, nachdem der Browser gearbeitet
 * hat. Aadorf liefert per `fetch` keinen einzigen Reglement-Link und im
 * Browser eine vollständige Menüstruktur.
 *
 * Was danach passiert, ist identisch — Erkennung, PDF, Artikel und
 * Fundstellen kommen aus `lib/reglemente.mjs`. Es darf nicht vom Abrufweg
 * abhängen, welche Rechtslage die Karte zeigt.
 *
 * Gearbeitet wird mit dem installierten Chrome (playwright-core, `channel:
 * chrome`), damit kein eigener Browser heruntergeladen werden muss, und in
 * einem eigenen Profilverzeichnis — das Profil der Nutzerin bleibt unberührt.
 *
 * Aufruf:  node scripts/recherche-gemeinden-browser.mjs [--limit N] [--kanton CH-VS] [--alle]
 * Ohne --alle werden nur die Gemeinden bearbeitet, bei denen der HTTP-Läufer
 * kein Reglement gefunden hat.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import {
  dokumentKandidaten, fundstellen, hole, holeDokument, links, pdfText, sammlungsRang,
} from './lib/reglemente.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const arg = (name, standard = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}
const LIMIT = Number(arg('limit', '0')) || Infinity
const KANTON = arg('kanton')
const ALLE = process.argv.includes('--alle')
const NUR = arg('nur')
const GLEICHZEITIG = 3

/**
 * Pfade, die viele Gemeinde-CMS gleich benennen.
 *
 * Ein Versuch kostet einen Seitenaufruf und erspart im Erfolgsfall das ganze
 * Durchsuchen der Navigation. Geraten wird dabei nichts: entweder die Seite
 * existiert und verlinkt Reglemente, oder sie tut es nicht.
 */
const PFADE = [
  '/reglemente', '/reglemente-und-gesetze', '/rechtssammlung', '/erlasse',
  '/gesetze-und-reglemente', '/reglements', '/reglements-communaux',
  '/legislation', '/regolamenti',
]

/** Alle gerenderten Links einer Seite — nach dem JavaScript, nicht davor. */
async function seitenLinks(seite) {
  return seite.evaluate(() => [...document.querySelectorAll('a[href]')]
    .map((a) => [a.href, (a.textContent || '').replace(/\s+/g, ' ').trim()])
    .filter(([u]) => /^https?:/.test(u)))
}

/** Die andere Schreibweise derselben Adresse — http statt https und umgekehrt. */
const andereSchreibweise = (url) => (url.startsWith('https://')
  ? 'http://' + url.slice(8)
  : url.startsWith('http://') ? 'https://' + url.slice(7) : null)

/**
 * Eine Seite öffnen und ihre Links holen — notfalls ohne Browser.
 *
 * Der Browser kann mehr als `fetch`, aber nicht überall: manche Gemeindeserver
 * brechen die TLS-Verbindung ab, die Chrome aufbaut, während Node sie
 * bekommt — Bonstetten etwa ist über https gar nicht erreichbar, über http
 * schon. Umgekehrt sieht `fetch` die per JavaScript aufgebaute Navigation
 * nicht. Beides zu können ist der Punkt dieses Läufers, nicht das eine gegen
 * das andere auszuspielen.
 *
 * Reihenfolge: Browser mit der hinterlegten Adresse, Browser mit der anderen
 * Schreibweise, zuletzt der schlichte Abruf. Erst wenn alle drei scheitern,
 * ist die Seite wirklich nicht zu haben.
 */
async function oeffne(seite, url) {
  const versuche = [url, andereSchreibweise(url)].filter(Boolean)
  // Alle Fehlschläge sammeln, nicht nur den letzten: sonst steht am Ende
  // „fetch failed" da, und man sucht die Ursache beim falschen Schritt.
  const scheitern = []
  for (const versuch of versuche) {
    try {
      await seite.goto(versuch, { waitUntil: 'domcontentloaded', timeout: 30000 })
      // Kurz warten statt auf 'networkidle': viele Gemeindeseiten halten
      // Verbindungen dauerhaft offen und würden nie 'idle' melden.
      await seite.waitForTimeout(1200)
      return await seitenLinks(seite)
    } catch (e) {
      scheitern.push(`Chrome ${versuch.slice(0, 8)}: ${(e.message || '').split('\n')[0].slice(0, 50)}`)
    }
  }
  for (const versuch of versuche) {
    try {
      return links(await hole(versuch), versuch)
    } catch (e) {
      scheitern.push(`Abruf ${versuch.slice(0, 8)}: ${e.cause?.code ?? e.message}`)
    }
  }
  throw new Error(scheitern.join(' | '))
}

/* ------------------------------------------------------- Eine Gemeinde */

async function eineGemeinde(browser, g) {
  const ergebnis = {
    bfs: g.bfs, name: g.name, kanton: g.kanton, website: g.website,
    dokument: null, dokument_titel: null, stellen: [], fehler: null, weg: 'browser',
  }
  if (!g.website) { ergebnis.fehler = 'keine Webseite bekannt'; return ergebnis }

  const kontext = await browser.newContext({
    userAgent: 'CampBuddy-Recherche/1.0 (+https://github.com/jannis-drng/campbuddy)',
    locale: 'de-CH',
    ignoreHTTPSErrors: true,
  })
  const seite = await kontext.newPage()

  // Bilder, Schriften und Videos sind für diese Suche wertlos. Sie über
  // `context.route` wegzufiltern hat den Lauf aber zerstört: 32 von 40
  // Startseiten scheiterten, die einzeln aufgerufen alle luden — ein
  // abgebrochener Teilabruf reisst bei manchen Seiten die ganze Navigation
  // mit. Der Zeitgewinn ist das nicht wert; wer hier optimiert, prüfe die
  // Trefferquote gegen, nicht nur die Laufzeit.
  seite.setDefaultTimeout(30000)

  try {
    let alle
    try {
      alle = await oeffne(seite, g.website)
    } catch (e) {
      ergebnis.fehler = `Startseite: ${e.message.split('\n')[0].slice(0, 80)}`
      return ergebnis
    }

    // Alles sammeln, dann erst bewerten — nicht beim ersten Treffer aufhören.
    // Genau das war der Fehler: eine Neuigkeit über eine Polizeibewilligung auf
    // der Startseite galt als Fund und verhinderte, dass die Rechtssammlung
    // überhaupt gesucht wurde.
    const kandidaten = [...dokumentKandidaten(alle)]

    // Die üblichen Pfade holt der schlichte Abruf, nicht der Browser: neun
    // Proben pro Gemeinde durch Chrome zu schicken war der teuerste Teil des
    // Laufs, und eine Reglementsammlung ist so gut wie immer serverseitig
    // gebaut. Existiert der Pfad nicht, kommt sofort ein Fehler zurück.
    const basis = new URL(g.website).origin
    for (const pfad of PFADE) {
      try {
        const html = await hole(basis + pfad)
        kandidaten.push(...dokumentKandidaten(links(html, basis + pfad)))
      } catch { /* Pfad gibt es hier nicht — der Normalfall */ }
    }

    // Durch die gerenderte Navigation, zwei Ebenen tief. Die zweite Ebene ist
    // der Punkt: die Rechtssammlung hängt fast nie direkt am Hauptmenü, sondern
    // unter „Verwaltung" oder „Politik". Auch dann durchsuchen, wenn schon
    // etwas gefunden wurde — was hier liegt, ist meist das Bessere.
    {
      const ersteEbene = alle
        .map(([u, t]) => [u, t, sammlungsRang(`${u} ${t}`)])
        .filter(([, , rang]) => rang > 0)
        .sort((a, b) => b[2] - a[2])
        .slice(0, 5)

      const zweiteEbene = []
      for (const [url] of ersteEbene) {
        let l
        try { l = await oeffne(seite, url) } catch { continue }
        kandidaten.push(...dokumentKandidaten(l))
        for (const [u, t] of l) {
          if (zweiteEbene.length >= 8) break
          const rang = sammlungsRang(`${u} ${t}`)
          if (rang >= 6) zweiteEbene.push([u, t, rang])
        }
      }

      zweiteEbene.sort((a, b) => b[2] - a[2])
      for (const [url, titel] of zweiteEbene.slice(0, 4)) {
        let l
        try { l = await oeffne(seite, url) } catch { continue }
        kandidaten.push(...dokumentKandidaten(l).map(([u, t]) => [u, t || titel]))
      }
    }

    if (kandidaten.length === 0) {
      ergebnis.fehler = 'kein passendes Reglement gefunden'
      return ergebnis
    }

    // Alles zusammengetragen, jetzt einmal sauber ordnen und entdoppeln.
    const gesehen = new Set()
    const geordnet = dokumentKandidaten(kandidaten).filter(([u]) => !gesehen.has(u) && gesehen.add(u))

    for (const [url, titel] of geordnet.slice(0, 6)) {
      try {
        // Das Dokument selbst holt `fetch` — dafür braucht es keinen Browser.
        const dok = await holeDokument(url)
        // Eine Zwischenseite statt des Dokuments: viele CMS führen pro Erlass
        // eine Detailseite, an der die Datei erst hängt. Einmal weiterspringen.
        if (dok.typ === 'html') {
          // Mehrere Möglichkeiten durchprobieren, nicht nur die erste: eine
          // Erlass-Detailseite verlinkt oft die Fassung in mehreren Sprachen
          // oder Ständen, und die erste ist nicht zwingend die Datei.
          let gefunden = null
          for (const [innerU] of dokumentKandidaten(links(dok.html, url)).slice(0, 3)) {
            if (innerU === url) continue
            try {
              const zweiter = await holeDokument(innerU)
              if (zweiter.typ === 'pdf') { gefunden = zweiter.daten; break }
            } catch { /* nächster Versuch */ }
          }
          if (!gefunden) continue
          dok.typ = 'pdf'
          dok.daten = gefunden
        }
        if (dok.daten.length > 12 * 1024 * 1024) continue
        const text = await pdfText(dok.daten)
        if (!text || text.length < 400) continue
        const stellen = fundstellen(text)
        if (stellen.length > 0) {
          ergebnis.dokument = url
          ergebnis.dokument_titel = titel || null
          ergebnis.stellen = stellen
          return ergebnis
        }
        if (!ergebnis.dokument) { ergebnis.dokument = url; ergebnis.dokument_titel = titel || null }
      } catch (e) {
        ergebnis.fehler = `PDF: ${e.message.slice(0, 60)}`
      }
    }

    if (ergebnis.stellen.length === 0 && !ergebnis.fehler) {
      // Zwei sehr verschiedene Ausgänge, die vorher gleich hiessen: entweder
      // wurde ein Reglement wirklich gelesen und enthält nichts zum
      // Übernachten — oder es liess sich gar nicht erst öffnen. Wer das nicht
      // trennt, sucht die Ursache an der falschen Stelle.
      ergebnis.fehler = ergebnis.dokument
        ? 'Reglement gelesen, keine Stelle zum Übernachten'
        : `Kandidaten gefunden (${geordnet.length}), keiner lesbar`
    }
    return ergebnis
  } finally {
    await kontext.close().catch(() => {})
  }
}

/* ------------------------------------------------------------------ Lauf */

const KANDIDATEN = resolve(ROOT, 'import/recherche/kandidaten.json')
if (!existsSync(KANDIDATEN)) {
  throw new Error(`${KANDIDATEN} fehlt — erst 'node scripts/recherche-gemeinden.mjs' laufen lassen.`)
}
const bisher = JSON.parse(readFileSync(KANDIDATEN, 'utf8')).ergebnisse

let offen = bisher.filter((r) => (
  r.website && (ALLE ? !r.stellen?.length : r.fehler === 'kein passendes Reglement gefunden')
))
if (KANTON) offen = offen.filter((r) => r.kanton === KANTON)
if (NUR) offen = offen.filter((r) => String(r.bfs) === NUR)

// Die Liste ist nach BFS-Nummer sortiert und damit nach Kanton geklumpt. Eine
// Stichprobe von vorn misst deshalb einen Kanton, nicht die Schweiz — und weil
// Gemeinden derselben Region oft denselben Anbieter und dieselben Ausfälle
// haben, kann sie um ein Vielfaches danebenliegen. `--stichprobe` mischt
// vorher, mit festem Startwert, damit zwei Läufe vergleichbar bleiben.
if (process.argv.includes('--stichprobe')) {
  let samen = 20260823
  const wuerfel = () => (samen = (samen * 1103515245 + 12345) % 2147483648) / 2147483648
  offen = offen.map((r) => [wuerfel(), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r)
}

offen = offen.slice(0, LIMIT)

const ZIEL = resolve(ROOT, 'import/recherche')
mkdirSync(ZIEL, { recursive: true })
const AUSGABE = resolve(ZIEL, `browser${KANTON ? `-${KANTON}` : ''}.json`)

console.log(`Browser-Recherche für ${offen.length} Gemeinden, ${GLEICHZEITIG} gleichzeitig …`)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ergebnisse = []
let fertig = 0
const warteschlange = [...offen]

async function arbeiter() {
  while (warteschlange.length) {
    const g = warteschlange.shift()
    // Kurz durchatmen. Bei fünf gleichzeitigen Kontexten ohne Pause haben 32
    // von 40 Startseiten nicht mehr geantwortet, die einzeln aufgerufen alle
    // luden — die Gemeindeserver drosseln, und zwar zu Recht.
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400))
    let r
    try {
      r = await eineGemeinde(browser, g)
    } catch (e) {
      r = { bfs: g.bfs, name: g.name, kanton: g.kanton, website: g.website, stellen: [], fehler: `unerwartet: ${e.message.slice(0, 70)}`, weg: 'browser' }
    }
    ergebnisse.push(r)
    fertig++
    if (fertig % 25 === 0 || fertig === offen.length) {
      const mit = ergebnisse.filter((x) => x.stellen.length > 0).length
      console.log(`  ${fertig}/${offen.length} — ${mit} mit Fundstelle`)
      writeFileSync(AUSGABE, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ergebnisse }, null, 1) + '\n')
    }
  }
}

await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter))
await browser.close()

ergebnisse.sort((a, b) => (a.bfs ?? 0) - (b.bfs ?? 0))
writeFileSync(AUSGABE, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ergebnisse }, null, 1) + '\n')

const mitStelle = ergebnisse.filter((r) => r.stellen.length > 0)
console.log('')
console.log(`Fundstelle zum Übernachten: ${mitStelle.length} von ${ergebnisse.length}`)
console.log(`Reglement gefunden: ${ergebnisse.filter((r) => r.dokument).length}`)
console.log(`-> ${AUSGABE}`)
const gründe = {}
for (const r of ergebnisse) if (r.stellen.length === 0 && r.fehler) {
  const k = r.fehler.split(':')[0]
  gründe[k] = (gründe[k] ?? 0) + 1
}
for (const [k, n] of Object.entries(gründe).sort((a, b) => b[1] - a[1])) console.log(`   ${n}× ${k}`)
