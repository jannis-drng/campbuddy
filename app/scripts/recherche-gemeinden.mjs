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
import {
  DOKUMENT, HÖFLICH, fundstellen, hole, links, pdfText, sammlungsRang, schlafe,
} from './lib/reglemente.mjs'

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
