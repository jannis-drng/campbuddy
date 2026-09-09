/**
 * Die in der Prüfliste getroffenen Entscheidungen übernehmen.
 *
 * Die Liste im Browser hält fest, welchem Vorschlag zugestimmt wurde; dieses
 * Skript trägt die Zustimmungen in den Datensatz der Karte ein. Getrennt,
 * weil beides verschiedene Dinge sind: dort wird entschieden, hier wird
 * geschrieben — und was geschrieben wird, soll dieselbe Prüfung durchlaufen
 * wie jede andere Quelle.
 *
 * Die Entscheidungen kommen aus dem Speicher des Artefakts; sie werden mit
 * `read_db` ausgelesen und als Datei übergeben.
 *
 * Aufruf: node scripts/mail-entscheidungen.mjs <entscheidungen.json> [--schreiben]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleNachziehen } from './lib/bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCHREIBEN = process.argv.includes('--schreiben')
const QUELLE = process.argv[2]
if (!QUELLE || QUELLE.startsWith('--')) {
  console.log('Aufruf: node scripts/mail-entscheidungen.mjs <entscheidungen.json> [--schreiben]')
  process.exit(1)
}

const RECHT = resolve(ROOT, 'src/data/gemeinden.legal.json')
const recht = JSON.parse(readFileSync(RECHT, 'utf8'))
const vorschlaege = new Map(
  JSON.parse(readFileSync(resolve(ROOT, 'import/mail/vorschlaege.json'), 'utf8'))
    .vorschlaege.map((v) => [v.bfs, v]),
)
const entscheidungen = JSON.parse(readFileSync(QUELLE, 'utf8'))
const liste = Array.isArray(entscheidungen) ? entscheidungen : Object.values(entscheidungen)

/**
 * Gemeinden, die gebeten haben, nicht zu erscheinen.
 *
 * Im Anschreiben steht: «Ist Ihnen das nicht recht, genügt ein kurzer Hinweis;
 * dann bleibt die Fläche unmarkiert.» Das ist eine Zusage. Sie hier zu prüfen
 * und nicht bloss zu notieren ist der Unterschied zwischen einem Versprechen
 * und einem Vermerk — die Auskunft dieser Gemeinden ist inhaltlich brauchbar,
 * und genau deshalb muss der Riegel im Code sitzen.
 *
 * Aufpassen bei der Zuordnung: «wir haben keine eigene Regelung und möchten
 * keine gemeindespezifischen Angaben» ist etwas anderes als «zeigt uns nicht».
 * Das Erste ist die Auskunft selbst und gehört als Eintrag mit
 * `ohne_eigene_regel` in den Datensatz, mit dem Verweis aufs übergeordnete
 * Recht. Magliaso stand deswegen zu Unrecht in dieser Liste.
 */
const NICHT_ANZEIGEN = new Set(
  (JSON.parse(readFileSync(resolve(ROOT, 'import/mail/nicht-anzeigen.json'), 'utf8'))
    .gemeinden ?? []).map((g) => g.bfs),
)

let uebernommen = 0
let abgelehnt = 0
const fehlend = []

for (const e of liste) {
  const bfs = Number(e.bfs)
  if (e.entscheidung !== 'ja') { abgelehnt++; continue }
  if (NICHT_ANZEIGEN.has(bfs)) {
    console.log(`  ${bfs}: Gemeinde wünscht keinen Eintrag — übersprungen`)
    continue
  }
  const v = vorschlaege.get(bfs)
  if (!v) { fehlend.push(bfs); continue }
  // Ein bereits eingestufter Eintrag wird nicht stillschweigend überschrieben.
  if (recht.gemeinden[String(bfs)]) {
    console.log(`  ${v.name}: schon eingestuft, übersprungen`)
    continue
  }
  recht.gemeinden[String(bfs)] = { ...v.vorschlag, _aus_mail: `entscheidung-${e.am ?? ''}` }
  console.log(`  ✓ ${v.name} (${v.kanton}) — ${v.vorschlag.status}`)
  uebernommen++
}

console.log('')
console.log(`Zugestimmt: ${uebernommen} · zurückgestellt: ${abgelehnt}`)
if (fehlend.length) console.log(`Ohne Vorschlag: ${fehlend.join(', ')}`)

if (!SCHREIBEN) {
  console.log('\nNur Bericht. Mit --schreiben wird der Datensatz ergänzt.')
} else if (uebernommen > 0) {
  recht.gemeinden = Object.fromEntries(
    Object.entries(recht.gemeinden).sort((a, b) => Number(a[0]) - Number(b[0])),
  )
  recht._stand = new Date().toISOString().slice(0, 10)
  writeFileSync(RECHT, JSON.stringify(recht, null, 2) + '\n')
  bundleNachziehen(recht.gemeinden)
  console.log(`\n${RECHT} ergänzt — jetzt ${Object.keys(recht.gemeinden).length} Gemeinden.`)
}
