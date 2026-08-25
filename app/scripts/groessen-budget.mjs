/**
 * Das Grössenbudget — der Wächter, ohne den alles zurückwandert.
 *
 * Eine Aufräumaktion hält ein paar Wochen. Dann importiert jemand eine
 * Bibliothek, jemand anders legt „nur diese eine" Datendatei ins Bündel, und
 * ein halbes Jahr später ist der Zustand wieder da, den man mühsam beseitigt
 * hat — weil nichts widersprochen hat. Diese Datei widerspricht.
 *
 * Sie läuft nach jedem `npm run build` (postbuild in package.json) und lässt
 * ihn scheitern, wenn eine Grenze reisst. Bewusst scheitern und nicht warnen:
 * eine Warnung im Bau-Protokoll liest niemand.
 *
 * Die Zahlen sind keine Wunschwerte, sondern der gemessene Stand plus etwas
 * Luft. Wer sie überschreitet, hat zwei ehrliche Möglichkeiten — die Ursache
 * beseitigen, oder die Grenze bewusst hochsetzen und dabei aufschreiben,
 * warum. Beides ist in Ordnung. Nur das Nichtbemerken nicht.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')

/**
 * Was gemessen wird, und wieviel es kosten darf — in Kilobyte, gepackt.
 *
 * `praefix` trifft den Dateinamen vor dem Inhalts-Hash. Gemessen wird gzip,
 * weil das ist, was über die Leitung geht; brotli auf Cloudflare ist noch
 * etwas kleiner, aber gzip ist die pessimistischere und damit die ehrlichere
 * Zahl.
 */
const BUDGET = [
  {
    name: 'Einstiegsbündel (Startseite)',
    praefix: ['index-'], endung: '.js', grenze: 160,
    warum: 'Das lädt jeder neue Besucher, bevor er weiss, worum es geht. '
      + 'Hier lag einmal die komplette Walliser Zonendatei — für einen Namen.',
  },
  {
    name: 'Kartenbündel',
    praefix: ['App-'], endung: '.js', grenze: 400,
    warum: 'Davon sind 268 KB MapLibre und damit unvermeidlich. Der Rest ist '
      + 'unser Code — Datendateien gehören hier nicht mehr hinein.',
  },
  {
    name: 'Stilvorlagen',
    praefix: ['index-', 'App-'], endung: '.css', grenze: 40,
    warum: 'Tailwind schreibt nur, was benutzt wird. Wächst das stark, ist '
      + 'meist eine Klassenliste dynamisch zusammengebaut worden.',
  },
  {
    name: 'Kartendaten beim Öffnen',
    praefix: ['zonen.', 'punkte.', 'gemeinden.uebersicht.', 'kantone.'],
    endung: '.json', grenze: 700,
    warum: 'Die vier Dateien, die vorliegen müssen, bevor die Karte etwas '
      + 'aussagt. Alles Weitere hängt am Ausschnitt und wird nachgeladen.',
  },
]

/**
 * Auch die grösste einzelne Kachel wird geprüft.
 *
 * Der Durchschnitt verbirgt genau den Fall, der weh tut: eine Kachel über dem
 * Mittelland, in der zehnmal so viel liegt wie über dem Gletscher. Wer bei
 * schlechtem Netz Zürich ansieht, wartet auf diese eine Datei.
 */
const KACHEL_GRENZE = 60

const kb = (bytes) => Math.round(bytes / 1024)
const dateien = readdirSync(resolve(DIST, 'assets'))

function gz(datei) {
  return gzipSync(readFileSync(resolve(DIST, 'assets', datei)), { level: 9 }).length
}

/** Kachel-Dateinamen sehen aus wie `34_189-<hash>.json`. */
const istKachel = (n) => /^-?\d+_-?\d+-[A-Za-z0-9_-]+\.json$/.test(n)

let gerissen = 0
let erstlast = 0

console.log('\n  Grössenbudget (gzip)\n')

for (const posten of BUDGET) {
  const treffer = dateien.filter(
    (n) => n.endsWith(posten.endung) && posten.praefix.some((p) => n.startsWith(p)),
  )
  if (treffer.length === 0) {
    console.error(`  ✗ ${posten.name}: keine Datei gefunden (${posten.praefix.join(', ')})`)
    gerissen++
    continue
  }

  const gross = kb(treffer.reduce((s, n) => s + gz(n), 0))
  erstlast += gross
  const anteil = Math.round((gross / posten.grenze) * 100)
  const ok = gross <= posten.grenze

  console.log(`  ${ok ? '✓' : '✗'} ${posten.name.padEnd(30)} ${String(gross).padStart(4)} / ${posten.grenze} KB  (${anteil} %)`)
  if (!ok) {
    console.error(`      ${posten.warum}`)
    console.error(`      Beteiligt: ${treffer.join(', ')}`)
    gerissen++
  }
}

const kacheln = dateien.filter(istKachel)
if (kacheln.length > 0) {
  const groesste = kacheln
    .map((n) => ({ n, g: kb(gz(n)) }))
    .sort((a, b) => b.g - a.g)[0]
  const ok = groesste.g <= KACHEL_GRENZE
  console.log(`  ${ok ? '✓' : '✗'} ${'Grösste einzelne Kachel'.padEnd(30)} ${String(groesste.g).padStart(4)} / ${KACHEL_GRENZE} KB  (${groesste.n})`)
  if (!ok) {
    console.error('      Eine Kachel über dem Mittelland wiegt ein Vielfaches einer über '
      + 'dem Gletscher. Notfalls das Gitter in scripts/snapshot-daten.mjs feiner schneiden.')
    gerissen++
  }
}

const gesamt = kb(
  dateien
    .filter((n) => statSync(resolve(DIST, 'assets', n)).isFile())
    .reduce((s, n) => s + statSync(resolve(DIST, 'assets', n)).size, 0),
)

console.log(`\n  Erstlast der geprüften Posten: ${erstlast} KB gz`)
console.log(`  Gesamtvorrat in dist/assets:   ${(gesamt / 1024).toFixed(1)} MB (roh, davon lädt ein Besuch einen Bruchteil)\n`)

if (gerissen > 0) {
  console.error(`  ${gerissen} Grenze${gerissen === 1 ? '' : 'n'} gerissen. Build abgebrochen.`)
  console.error('  Ursache beseitigen — oder die Grenze in scripts/groessen-budget.mjs '
    + 'bewusst hochsetzen und dazuschreiben, warum.\n')
  process.exit(1)
}
