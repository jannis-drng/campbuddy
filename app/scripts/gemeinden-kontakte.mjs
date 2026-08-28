/**
 * Die Kontaktadressen der Gemeinden einsammeln.
 *
 * OpenStreetMap führt für 1961 von 2119 Gemeinden eine Webseite, aber nur für
 * eine einzige eine E-Mail-Adresse. Solange das so ist, gibt es keinen
 * Mailweg — man kann niemanden fragen, dessen Adresse man nicht hat.
 *
 * Diese Suche ist ungleich einfacher als die nach den Reglementen: eine
 * Kontaktadresse steht auf praktisch jeder Gemeindeseite, meist im Impressum
 * oder unter „Kontakt", und sie steht als `mailto:` im Quelltext. Ein Abruf
 * der Startseite plus höchstens zwei Unterseiten genügt fast immer.
 *
 * Gesammelt wird nur, was eine Gemeinde selbst als ihre Kontaktadresse
 * veröffentlicht — keine Namen einzelner Mitarbeitender. Wer eine Behörde
 * anschreibt, schreibt der Behörde, nicht einer Person.
 *
 * Aufruf:  node scripts/gemeinden-kontakte.mjs [--limit N] [--kanton CH-VS]
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPERRE, anbieterVon, anstehen, hole, links, sperrWaechter } from './lib/reglemente.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const arg = (n, s = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : s
}
const LIMIT = Number(arg('limit', '0')) || Infinity
const KANTON = arg('kanton')
const GLEICHZEITIG = 4

/** Wo eine Gemeinde ihre Adresse hinschreibt. */
const KONTAKTSEITE = /kontakt|impressum|contact|contatt|adresse|verwaltung|gemeindeverwaltung|administration/i

const MAILTO = /mailto:([^"'?>\s]+)/gi
const IM_TEXT = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi

/**
 * Welche Adresse die richtige ist.
 *
 * Gesucht ist die allgemeine Anlaufstelle der Verwaltung, nicht das Postfach
 * der Webagentur und nicht die private Adresse einer Sachbearbeiterin. Punkte
 * für das, was nach Gemeinde klingt; Abzug für alles andere.
 */
function bewerte(adresse, host) {
  const a = adresse.toLowerCase()
  if (/\.(png|jpg|gif|webp|svg|css|js)$/.test(a)) return -100
  if (/(webmaster|hostmaster|postmaster|noreply|no-reply|abuse|privacy|datenschutz)@/.test(a)) return -50
  // Fremde Domain heisst fast immer: Dienstleister, nicht Gemeinde.
  const domain = a.split('@')[1] ?? ''
  const eigen = host.replace(/^www\./, '')
  let punkte = domain.endsWith(eigen) || eigen.endsWith(domain) ? 40 : -20
  if (/^(info|kontakt|gemeinde|verwaltung|kanzlei|contact|commune|comune|info-?gemeinde)@/.test(a)) punkte += 30
  if (/^(gemeindeverwaltung|gemeindekanzlei|administration|secretariat|segreteria)@/.test(a)) punkte += 25
  // Personenpostfächer meiden: vorname.nachname@
  if (/^[a-z]+\.[a-z]+@/.test(a)) punkte -= 15
  return punkte
}

function adressenAus(html, host) {
  const roh = new Set()
  for (const m of html.matchAll(MAILTO)) roh.add(decodeURIComponent(m[1]).trim())
  // Manche Seiten schreiben die Adresse nur als Text. Nur dann heranziehen,
  // wenn kein mailto gefunden wurde — sonst überwiegt das Rauschen.
  if (roh.size === 0) for (const m of html.matchAll(IM_TEXT)) roh.add(m[0].trim())
  return [...roh]
    .map((a) => ({ adresse: a.toLowerCase(), punkte: bewerte(a, host) }))
    .filter((x) => x.punkte > -20)
    .sort((a, b) => b.punkte - a.punkte)
}

async function eineGemeinde(g) {
  const ergebnis = { bfs: g.bfs, name: g.name, kanton: g.kanton, website: g.website, email: null, quelle: null, fehler: null }
  if (!g.website) { ergebnis.fehler = 'keine Webseite bekannt'; return ergebnis }

  const host = new URL(g.website).hostname
  let start
  try {
    start = await hole(g.website)
  } catch (e) {
    ergebnis.fehler = `Startseite: ${e.cause?.code ?? e.message}`.slice(0, 60)
    return ergebnis
  }

  let treffer = adressenAus(start, host)
  if (treffer.length > 0 && treffer[0].punkte >= 40) {
    ergebnis.email = treffer[0].adresse
    ergebnis.quelle = g.website
    return ergebnis
  }

  // Sonst die Kontakt- oder Impressumsseite.
  const seiten = links(start, g.website)
    .filter(([u, t]) => KONTAKTSEITE.test(`${u} ${t}`))
    .slice(0, 3)
  for (const [url] of seiten) {
    try {
      const html = await hole(url)
      const weitere = adressenAus(html, host)
      if (weitere.length > 0) {
        treffer = [...treffer, ...weitere].sort((a, b) => b.punkte - a.punkte)
        if (treffer[0].punkte >= 40) {
          ergebnis.email = treffer[0].adresse
          ergebnis.quelle = url
          return ergebnis
        }
      }
    } catch { /* eine Seite weniger */ }
  }

  if (treffer.length > 0) {
    ergebnis.email = treffer[0].adresse
    ergebnis.quelle = g.website
  } else {
    ergebnis.fehler = ergebnis.fehler ?? 'keine Adresse gefunden'
  }
  return ergebnis
}

/* ------------------------------------------------------------------ Lauf */

const gemeindenDatei = resolve(ROOT, 'import/CH/gemeinden/CH.json')
const recht = JSON.parse(readFileSync(resolve(ROOT, 'src/data/gemeinden.legal.json'), 'utf8')).gemeinden

let offen = JSON.parse(readFileSync(gemeindenDatei, 'utf8')).features
  .map((f) => f.properties)
  .filter((g) => !recht[String(g.bfs)])
if (KANTON) offen = offen.filter((g) => g.kanton === KANTON)
offen = offen.slice(0, LIMIT)

const ZIEL = resolve(ROOT, 'import/recherche')
mkdirSync(ZIEL, { recursive: true })
const AUSGABE = resolve(ZIEL, 'kontakte.json')

console.log(`Kontaktsuche für ${offen.length} Gemeinden …`)

const ergebnisse = []
const warteschlange = [...offen]
const waechter = sperrWaechter(10)
let fertig = 0

async function arbeiter() {
  while (warteschlange.length) {
    const g = warteschlange.shift()
    const anbieter = await anbieterVon(g.website ?? '')
    if (waechter.gesperrt(anbieter)) {
      ergebnisse.push({ ...g, email: null, fehler: 'Anbieter sperrt uns aus' })
      fertig++
      continue
    }
    const freigeben = await anstehen(anbieter)
    let r
    try {
      r = await eineGemeinde(g)
    } catch (e) {
      r = { bfs: g.bfs, name: g.name, kanton: g.kanton, website: g.website, email: null, fehler: `unerwartet: ${e.message.slice(0, 50)}` }
    } finally {
      freigeben()
    }
    waechter.melde(anbieter, SPERRE.test(r.fehler ?? ''))
    ergebnisse.push(r)
    fertig++
    if (fertig % 50 === 0 || fertig === offen.length) {
      console.log(`  ${fertig}/${offen.length} — ${ergebnisse.filter((x) => x.email).length} mit Adresse`)
      writeFileSync(AUSGABE, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ergebnisse }, null, 1) + '\n')
    }
  }
}

await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter))
ergebnisse.sort((a, b) => (a.bfs ?? 0) - (b.bfs ?? 0))
writeFileSync(AUSGABE, JSON.stringify({ stand: new Date().toISOString().slice(0, 10), ergebnisse }, null, 1) + '\n')
console.log(`\nMit Adresse: ${ergebnisse.filter((r) => r.email).length} von ${ergebnisse.length}`)
console.log(`-> ${AUSGABE}`)
