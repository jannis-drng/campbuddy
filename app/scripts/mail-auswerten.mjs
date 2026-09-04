/**
 * Die Antworten der Gemeinden durchgehen und einstufen.
 *
 * Was sich automatisieren lässt, ist hier automatisiert: die Antwort wird der
 * Gemeinde zugeordnet, das Zitat unserer eigenen Anfrage entfernt, der Text
 * gegen die 74 geprüften Musterformulierungen gehalten und ein Vorschlag
 * daraus gebaut. Übrig bleibt eine Frage, die ein Mensch beantwortet: stimmt
 * das?
 *
 * Diese eine Frage bleibt bewusst stehen. Eine Gemeindeantwort ist Freitext —
 * «bei uns ist das nicht gestattet», «grundsätzlich nein, aber im Gebirge
 * duldet man es», «siehe beiliegendes Reglement». Wer daraus maschinell eine
 * Rechtslage ableitet, produziert früher oder später eine Karte, die etwas
 * behauptet, das so nie gesagt wurde. Und anders als bei einem Reglement, das
 * jeder nachlesen kann, steht dahinter dann eine Behörde, die sich falsch
 * zitiert sieht.
 *
 * Aufruf: node --env-file=.env.mail.local scripts/mail-auswerten.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { bundleNachziehen } from './lib/bundle.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MAIL = resolve(ROOT, 'import/mail')
const RECHT = resolve(ROOT, 'src/data/gemeinden.legal.json')

const lade = (p, s) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : s)
const HEUTE = new Date().toISOString().slice(0, 10)

const grau = (s) => `\x1b[90m${s}\x1b[0m`
const fett = (s) => `\x1b[1m${s}\x1b[0m`
const gruen = (s) => `\x1b[32m${s}\x1b[0m`
const gelb = (s) => `\x1b[33m${s}\x1b[0m`

const antworten = lade(resolve(MAIL, 'antworten.json'), { eintraege: [] })
const recht = JSON.parse(readFileSync(RECHT, 'utf8'))
const muster = JSON.parse(readFileSync(resolve(ROOT, 'src/data/gemeinden.muster.json'), 'utf8')).muster
const gemeinden = new Map(
  JSON.parse(readFileSync(resolve(ROOT, 'import/CH/gemeinden/CH.json'), 'utf8')).features
    .map((f) => [f.properties.bfs, f.properties]),
)

const kern = (s) => s.toLowerCase().replace(/[’´`]/g, "'").replace(/[–—]/g, '-')
  .replace(/[^a-zäöüàâçéèêëîïôùûœ' ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Passt eine der geprüften Formulierungen auf diese Antwort? */
function vorschlag(text) {
  const k = kern(text)
  for (const m of muster) {
    if (!m.erkennt?.length) continue
    if (m.erkennt.every((t) => k.includes(kern(t))) && !(m.erkennt_nicht ?? []).some((t) => k.includes(kern(t)))) {
      return m
    }
  }
  return null
}

/**
 * Grobe Richtung aus dem Wortlaut — ausdrücklich nur als Lesehilfe.
 *
 * Sie färbt nichts ein und schreibt nichts fest; sie lenkt nur den Blick auf
 * die Stelle, an der die Antwort ihre Aussage macht.
 */
const HINWEISE = [
  [/nicht gestattet|nicht erlaubt|verboten|untersagt|interdit|vietat/i, 'klingt nach Verbot'],
  [/gestattet|erlaubt|zulässig|autoris|permis|consentit/i, 'klingt nach Erlaubnis'],
  [/bewilligung|gesuch|genehmigung|autorisation|permesso/i, 'nennt eine Bewilligung'],
  [/geduldet|toleriert|tolér|tollerat/i, 'klingt nach Duldung'],
  [/keine (kommunale )?(regelung|bestimmung|vorschrift)|nichts geregelt|pas de r[éè]glementation/i,
    'sagt: nichts geregelt'],
  [/reglement|règlement|regolamento|art\.?\s*\d+/i, 'verweist auf ein Reglement'],
]

const offen = antworten.eintraege.filter((e) => !e.geprueft && !e.abmeldung)
if (offen.length === 0) {
  console.log('Keine ungeprüften Antworten.')
  process.exit(0)
}

console.log(`${offen.length} Antwort(en) zu prüfen.\n`)
const frage = createInterface({ input: process.stdin, output: process.stdout })

let eingestuft = 0
for (const a of offen) {
  const bfs = a.bfs ?? a.bfs_vermutet
  const g = gemeinden.get(bfs)
  console.log('─'.repeat(78))
  console.log(fett(g?.name ?? `BFS ${bfs}`), grau(`· ${g?.kanton ?? '?'} · ${a.am.slice(0, 10)}`))
  if (!a.bfs && a.bfs_vermutet) console.log(gelb('  Zuordnung nur vermutet — über die Absenderdomain, nicht über die Adresse.'))
  console.log(grau(`von ${a.von}`))
  console.log('')
  console.log(a.text.split('\n').slice(0, 18).map((z) => '  ' + z).join('\n'))
  console.log('')

  for (const [muster_, was] of HINWEISE) if (muster_.test(a.text)) console.log(grau(`  › ${was}`))

  const v = vorschlag(a.text)
  if (v) {
    console.log('')
    console.log(gruen(`  Vorschlag: ${v.status}`), grau(`(${v.id})`))
    console.log(grau(`  Zelt ${v.tent_allowed} · Fahrzeug ${v.vehicle_allowed} · Feuer ${v.fire_allowed}`))
    console.log(grau('  ' + v.summary.slice(0, 150)))
  } else {
    console.log(grau('  Kein Muster passt — von Hand einstufen oder zurückstellen.'))
  }

  console.log('')
  const antwort = (await frage.question(
    v ? '  [j] übernehmen  [n] zurückstellen  [q] Schluss > '
      : '  [n] zurückstellen  [q] Schluss > ',
  )).trim().toLowerCase()

  if (antwort === 'q') break
  if (antwort !== 'j' || !v) { console.log(grau('  zurückgestellt\n')); continue }

  recht.gemeinden[String(bfs)] = {
    status: v.status,
    tent_allowed: v.tent_allowed,
    vehicle_allowed: v.vehicle_allowed,
    fire_allowed: v.fire_allowed,
    summary: v.summary,
    conditions: v.conditions ?? null,
    // Die Quelle ist die Auskunft selbst, mit ihrem Datum. Sie ist amtlich —
    // sie kommt von der Gemeinde —, aber sie ist nicht nachlesbar wie ein
    // Reglement. Das gehört in die Quellenangabe, nicht ins Kleingedruckte.
    source: `Schriftliche Auskunft der Gemeindeverwaltung ${g?.name ?? ''}, ${a.am.slice(0, 10)}`,
    source_url: g?.website ?? null,
    review_status: 'quelle',
    last_verified: HEUTE,
    _muster: v.id,
    _aus_mail: a.nachricht_id,
  }
  a.geprueft = true
  eingestuft++
  console.log(gruen('  übernommen\n'))
}

frage.close()

if (eingestuft > 0) {
  recht.gemeinden = Object.fromEntries(Object.entries(recht.gemeinden).sort((a, b) => Number(a[0]) - Number(b[0])))
  recht._stand = HEUTE
  writeFileSync(RECHT, JSON.stringify(recht, null, 2) + '\n')
  writeFileSync(resolve(MAIL, 'antworten.json'), JSON.stringify(antworten, null, 1) + '\n')
  console.log(`${eingestuft} eingestuft — jetzt ${Object.keys(recht.gemeinden).length} Gemeinden.`)
  // Ohne diesen Schritt stünde die Gemeinde in der Rechtsdatei, ihre Fläche
  // aber nicht im Bundle — eingestuft und trotzdem unsichtbar.
  bundleNachziehen(recht.gemeinden)
  console.log('Sichtbar auf der Karte nach dem nächsten Bauen.')
} else {
  console.log('Nichts eingestuft.')
}
