/**
 * Erinnert daran, dass das Impressum noch Lücken hat.
 *
 * Warum eine Warnung und kein Abbruch — anders als beim Grössenbudget:
 * Das Budget bewacht etwas, das ohne Wächter unbemerkt schlechter wird. Hier
 * ist die Lücke ohnehin sichtbar, sie steht im Klartext auf der Rechtsseite.
 * Den Build daran scheitern zu lassen hiesse, eine bereits veröffentlichte
 * Seite bis zum Ausfüllen nicht mehr aktualisieren zu können — also auch die
 * Rechtstexte selbst nicht. Das wäre die falsche Sperre am falschen Ort.
 *
 * Sobald die Angaben stehen, schweigt dieses Skript.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const QUELLE = fileURLToPath(new URL('../src/rechtliches/betreiber.ts', import.meta.url))

/** Liest die Zuweisung `feld: '…'` aus dem BETREIBER-Block. */
function wert(text, feld) {
  const treffer = text.match(new RegExp(`\\n  ${feld}: '([^']*)'`))
  return treffer ? treffer[1].trim() : ''
}

const text = readFileSync(QUELLE, 'utf8')
const PFLICHT = [
  ['name', 'Name oder Firma'],
  ['strasse', 'Strasse und Hausnummer'],
  ['ort', 'Postleitzahl und Ort'],
  ['email', 'E-Mail-Adresse'],
]

const fehlend = PFLICHT.filter(([feld]) => !wert(text, feld))

if (fehlend.length === 0) {
  console.log('\x1b[32m✓\x1b[0m Impressum vollständig.\n')
  process.exit(0)
}

console.log(`
\x1b[33m▲  Das Impressum ist unvollständig.\x1b[0m

   Es fehlen:
${fehlend.map(([, was]) => `     · ${was}`).join('\n')}

   Einzutragen in \x1b[90msrc/rechtliches/betreiber.ts\x1b[0m. Bis dahin nennen
   /#/impressum und /#/datenschutz die Lücke offen — die Seiten sind
   erreichbar und verlinkt, sie sind nur noch nicht vollständig.
`)
