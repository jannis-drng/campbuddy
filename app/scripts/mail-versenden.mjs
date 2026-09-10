/**
 * Die Anfragen an die Gemeinden versenden.
 *
 * Es gibt keine Datenbank der Schweizer Campingregeln, und für rund 1500
 * Gemeinden steht auch keine im Netz — nicht weil wir schlecht gesucht
 * hätten, sondern weil sie nichts veröffentlicht haben. Bleibt, sie zu
 * fragen.
 *
 * Drei Dinge sind dabei nicht verhandelbar:
 *
 * 1. **Niemand wird zweimal angeschrieben.** Was verschickt wurde, steht in
 *    `versandt.json` und wird vor jedem Lauf gelesen. Eine Behörde zweimal
 *    dieselbe automatische Anfrage zu schicken, verspielt genau das Wohlwollen,
 *    auf das dieses Vorhaben angewiesen ist.
 * 2. **Wer sich abmeldet, bleibt abgemeldet.** `keine-anfragen.json` wird
 *    ebenso gelesen, und der Läufer prüft es auch dann, wenn die Gemeinde
 *    noch nie angeschrieben wurde.
 * 3. **Ohne `--senden` geht nichts hinaus.** Der Vorlauf zeigt, was passieren
 *    würde, und schreibt keine Zeile.
 *
 * Aufruf:
 *   node --env-file=.env.mail.local scripts/mail-versenden.mjs [--kanton CH-VS] [--anzahl 20]
 *   … dasselbe mit --senden, wenn es wirklich hinausgehen soll.
 *   --an <adresse>  schickt alles an diese Adresse statt an die Gemeinden (Probe).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const arg = (n, s = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : s
}
const SENDEN = process.argv.includes('--senden')
const KANTON = arg('kanton')
const PROBE_AN = arg('an')
const ANZAHL = Number(arg('anzahl', process.env.MAIL_PRO_TAG ?? '50'))

const MAIL = resolve(ROOT, 'import/mail')
const VERSANDT = resolve(MAIL, 'versandt.json')
const ABGEMELDET = resolve(MAIL, 'keine-anfragen.json')

/**
 * Welche Sprache eine Gemeinde spricht.
 *
 * Nach Kanton, nicht nach Gemeinde — das ist an den Sprachgrenzen ungenau
 * (Freiburg, Wallis und Graubünden sind zweisprachig), aber eine deutsche
 * Anfrage an eine französischsprachige Gemeinde ist ein kleineres Ärgernis
 * als gar keine. Wo es auffällt, wird nachgebessert.
 */
const SPRACHE = {
  'CH-GE': 'fr', 'CH-JU': 'fr', 'CH-NE': 'fr', 'CH-VD': 'fr',
  'CH-TI': 'it',
}

/** Zweisprachige Kantone — hier sagt der Kanton nichts, die Gemeinde schon. */
const GEMISCHT = new Set(['CH-VS', 'CH-FR', 'CH-BE', 'CH-GR'])

const SPRACHCACHE = resolve(MAIL, 'sprachen.json')

/**
 * Welche Sprache eine Gemeinde spricht.
 *
 * Für die einsprachigen Kantone genügt die Tabelle. In Wallis, Freiburg, Bern
 * und Graubünden verläuft die Sprachgrenze mitten hindurch — dort wird die
 * Gemeindeseite selbst gefragt: ihr `<html lang>` sagt es zuverlässiger als
 * jede Zuordnung, die wir uns ausdenken könnten.
 *
 * Ardon im Wallis hätte sonst eine deutsche Anfrage bekommen. Das ist kein
 * Beinbruch, aber es ist die Art Nachlässigkeit, die eine automatische
 * Anfrage von einer ernstgemeinten unterscheidet.
 */
/** Die Seite holen — mit der zweiten Schreibweise als Rückfall. */
async function seiteHolen(url) {
  const versuche = [url, url.replace('://www.', '://'), url.replace('://', '://www.')]
  for (const v of [...new Set(versuche)]) {
    try {
      const antwort = await fetch(v, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'CampBuddy-Recherche/1.0 (+https://github.com/jannis-drng/campbuddy)' },
      })
      if (antwort.ok) return (await antwort.text()).slice(0, 60000)
    } catch { /* nächste Schreibweise */ }
  }
  return null
}

/**
 * Die Sprache am Wortschatz erkennen.
 *
 * Ein grober, aber für diesen Zweck sicherer Zähler: die häufigsten Funktions-
 * und Verwaltungswörter der drei Sprachen. Sie kommen auf jeder Gemeindeseite
 * dutzendfach vor, und ihre Verteilung ist eindeutig.
 */
function ausWortschatz(html) {
  const text = html.replace(/<[^>]*>/g, ' ').toLowerCase()
  const zaehle = (woerter) => woerter.reduce(
    (n, w) => n + (text.match(new RegExp(`\\b${w}\\b`, 'g'))?.length ?? 0), 0,
  )
  const punkte = {
    de: zaehle(['und', 'der', 'die', 'gemeinde', 'für', 'über', 'aktuelles', 'verwaltung']),
    fr: zaehle(['et', 'les', 'des', 'commune', 'pour', 'actualités', 'administration', 'nous']),
    it: zaehle(['e', 'gli', 'del', 'comune', 'per', 'attualità', 'amministrazione', 'noi']),
  }
  const [beste, zweite] = Object.entries(punkte).sort((a, b) => b[1] - a[1])
  // Nur bei deutlichem Abstand entscheiden — sonst lieber nichts behaupten.
  return beste[1] >= 8 && beste[1] > zweite[1] * 1.5 ? beste[0] : null
}

/** Die Sprache am Amtspostfach ablesen. */
function ausPostfach(adresse) {
  const vorn = adresse.split('@')[0]?.toLowerCase() ?? ''
  if (/^(commune|administration|secretariat|secrétariat|greffe|mairie|chancellerie)/.test(vorn)) return 'fr'
  if (/^(gemeinde|gemeindeverwaltung|gemeindekanzlei|einwohner)/.test(vorn)) return 'de'
  if (/^(comune|municipio|cancelleria)/.test(vorn)) return 'it'
  return null
}

async function spracheVon(g) {
  // Die Handeintragung geht vor: sie ist der Fall, in dem ein Mensch
  // hingesehen hat, weil die Maschine es nicht konnte.
  const handgesetzt = lade(resolve(MAIL, 'sprachen-manuell.json'), { sprachen: {} }).sprachen
  if (handgesetzt[g.bfs]) return handgesetzt[g.bfs]
  if (SPRACHE[g.kanton]) return SPRACHE[g.kanton]
  if (!GEMISCHT.has(g.kanton) || !g.website) return 'de'

  const cache = lade(SPRACHCACHE, {})
  if (cache[g.bfs]) return cache[g.bfs]

  let sprache = null
  const html = await seiteHolen(g.website)
  if (html) {
    const m = html.match(/<html[^>]*\blang=["']?([a-z]{2})/i)
    if (m && ['de', 'fr', 'it'].includes(m[1].toLowerCase())) sprache = m[1].toLowerCase()
    // Zweites Standbein: viele Gemeindeseiten setzen gar kein lang-Attribut.
    // Hérémence im Val d'Hérens etwa — französischsprachig, und die Anfrage
    // wäre still auf Deutsch hinausgegangen. Dann entscheiden die Wörter.
    if (!sprache) sprache = ausWortschatz(html)
  }
  // Drittes Standbein: das Amtspostfach selbst. Eine Gemeinde, die ihre
  // Adresse "commune@" nennt, ist französischsprachig, "gemeinde@" deutsch,
  // "comune@" italienisch. Das ist kein Zufall und kein Näherungswert — es
  // steht so im Briefkopf. Sechs Walliser Gemeinden blieben ohne diesen
  // Hinweis liegen, obwohl ihre Adresse die Frage beantwortet.
  if (!sprache) sprache = ausPostfach(adressen.get(g.bfs) ?? '')

  if (!sprache) {
    console.log(`    (Sprache für ${g.name} nicht bestimmbar — Anfrage zurückgestellt)`)
    return null
  }

  cache[g.bfs] = sprache
  writeFileSync(SPRACHCACHE, JSON.stringify(cache, null, 1) + '\n')
  return sprache
}

/**
 * Wo eine kantonale Regel die Frage schon halb beantwortet, wird die andere
 * Hälfte gefragt.
 *
 * Im Tessin ist das Campieren kantonal geregelt: nur auf bewilligten Plätzen,
 * ausgenommen das Bergbiwak (Legge sui campeggi, Art. 2). Die Gemeinde nach
 * einer Campingregelung zu fragen, heisst dort, sie das Kantonsrecht
 * abschreiben zu lassen — die Antworten aus Lumino und Ascona lauteten genau
 * so. Interessant ist allein, wie die Gemeinde die Biwak-Ausnahme handhabt.
 *
 * Eine gezielte Frage ist auch die höflichere: sie zeigt, dass wir das
 * Naheliegende selbst nachgesehen haben.
 */
const EIGENE_VORLAGE = { 'CH-TI': 'it-ti' }

const vorlage = (sprache) => {
  const roh = readFileSync(resolve(MAIL, 'vorlagen', `${sprache}.txt`), 'utf8')
  const bruch = roh.indexOf('\n\n')
  return { betreff: roh.slice(0, bruch).trim(), text: roh.slice(bruch).trim() }
}

const einsetzen = (s, werte) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => werte[k] ?? '')

/* ------------------------------------------------------------ Auswahl */

const lade = (p, standard) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : standard)

const versandt = lade(VERSANDT, { eintraege: [] })
const abgemeldet = lade(ABGEMELDET, { bfs: [] })
const schonDran = new Set(versandt.eintraege.map((e) => e.bfs))
const nichtStoeren = new Set(abgemeldet.bfs)

const recht = JSON.parse(readFileSync(resolve(ROOT, 'src/data/gemeinden.legal.json'), 'utf8')).gemeinden
const kontakte = lade(resolve(ROOT, 'import/recherche/kontakte.json'), { ergebnisse: [] }).ergebnisse
/**
 * Was als Adresse durchgeht.
 *
 * Nach dem Entschlüsseln der HTML-Entitäten bleiben ein Dutzend Zeichenketten
 * übrig, die keine Adresse sind — abgeschnittene Fragmente, zusammengeklebte
 * Wörter. Sie würden als Rückläufer zurückkommen und die Versandrate belasten,
 * also gehen sie gar nicht erst hinaus.
 */
const ADRESSE_GUELTIG = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i

const adressen = new Map(kontakte.filter((k) => k.email).map((k) => [k.bfs, k.email]))

/**
 * Von Hand nachgetragene Adressen — sie gehen vor.
 *
 * Rund jede fünfte Gemeinde veröffentlicht keine Adresse mehr, sondern nur
 * noch ein Kontaktformular. Automatisch ist da nichts zu holen; wer die
 * Adresse von Hand heraussucht, soll sie an einer Stelle eintragen können und
 * nicht in der gesammelten Datei, die beim nächsten Lauf überschrieben wird.
 */
const unbrauchbar = []
for (const e of lade(resolve(MAIL, 'adressen-manuell.json'), { gemeinden: [] }).gemeinden) {
  const roh = e.email?.trim()
  if (!roh) continue
  // Manche Einträge nennen zwei Adressen, getrennt durch einen Schrägstrich —
  // dann die erste nehmen. Andere sind gar keine Adresse, sondern eine
  // Webseite. Beides stillschweigend zu überspringen hiesse, die Handarbeit
  // ins Leere laufen zu lassen, ohne dass es jemand merkt.
  const erste = roh.split(/\s*[/;,]\s*/)[0].trim()
  if (ADRESSE_GUELTIG.test(erste)) adressen.set(e.bfs, erste)
  else unbrauchbar.push(`${e.name}: ${roh.slice(0, 50)}`)
}
if (unbrauchbar.length > 0) {
  console.log('Nachgetragen, aber keine brauchbare Adresse:')
  for (const u of unbrauchbar) console.log(`  ${u}`)
  console.log('')
}

const gemeinden = JSON.parse(readFileSync(resolve(ROOT, 'import/CH/gemeinden/CH.json'), 'utf8')).features
  .map((f) => f.properties)

let offen = gemeinden.filter((g) => (
  g.bfs != null
  && !recht[String(g.bfs)]        // noch nicht eingestuft
  && adressen.has(g.bfs)          // Adresse bekannt
  && !schonDran.has(g.bfs)        // noch nicht angeschrieben
  && !nichtStoeren.has(g.bfs)     // nicht abgemeldet
  && ADRESSE_GUELTIG.test(adressen.get(g.bfs))
))
if (KANTON) offen = offen.filter((g) => g.kanton === KANTON)

// Nach Kanton und Name, damit ein Lauf zusammenhängende Gebiete abdeckt statt
// quer durchs Land zu springen — das erleichtert auch das Nachfassen.
offen.sort((a, b) => (a.kanton ?? '').localeCompare(b.kanton ?? '') || a.name.localeCompare(b.name, 'de'))
const dran = offen.slice(0, ANZAHL)

console.log(`Offen und erreichbar: ${offen.length}`)
console.log(`Bereits angeschrieben: ${schonDran.size} · abgemeldet: ${nichtStoeren.size}`)
console.log(`Dieser Lauf: ${dran.length}${KANTON ? ` (nur ${KANTON})` : ''}`)
console.log('')

if (dran.length === 0) { console.log('Nichts zu tun.'); process.exit(0) }

/* ------------------------------------------------------------ Versand */

const { SMTP_HOST, SMTP_PORT, MAIL_USER, MAIL_PASSWORT, MAIL_ABSENDERADRESSE,
        MAIL_ANTWORT_AN, MAIL_ABSENDER, MAIL_PROJEKT_URL } = process.env

const post = SENDEN ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 465),
  secure: Number(SMTP_PORT ?? 465) === 465,
  auth: { user: MAIL_USER, pass: MAIL_PASSWORT },
  // Ohne diese drei wartet nodemailer unbegrenzt auf einen Server, der nicht
  // mehr antwortet. Ein Lauf, der nachts hängenbleibt, sieht am Morgen aus
  // wie einer, der noch arbeitet.
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 60000,
}) : null

/**
 * Wenn der Anbieter dichtmacht, aufhören statt weiterklopfen.
 *
 * Am 10.09.2026 wies Zoho jede einzelne Mail mit «550 5.4.6 Unusual sending
 * activity» ab. Der Lauf machte trotzdem weiter: für jede der fünfzig
 * Gemeinden erst die Sprache von ihrer Webseite holen, dann in dieselbe
 * Ablehnung laufen — eine Stunde lang, für null versandte Mails. Drei
 * Absagen hintereinander sind kein Zufall mehr, sondern eine Sperre.
 */
const GESPERRT = /5\.4\.6|unusual sending|rate limit|too many|quota|550 5\.7/i
const ABBRUCH_NACH = 3
let hintereinander = 0

const neu = []
for (const g of dran) {
  const sprache = await spracheVon(g)
  if (!sprache) continue
  const { betreff, text } = vorlage(EIGENE_VORLAGE[g.kanton] ?? sprache)
  const werte = { gemeinde: g.name, absender: MAIL_ABSENDER, projekt_url: MAIL_PROJEKT_URL }
  const empfaenger = PROBE_AN ?? adressen.get(g.bfs)
  const antwortAn = (MAIL_ANTWORT_AN ?? '').replace('{{bfs}}', String(g.bfs))

  if (!SENDEN) {
    console.log(`  ${g.kanton}  ${g.name.padEnd(24)} ${sprache}  → ${empfaenger}`)
    continue
  }

  try {
    const ergebnis = await post.sendMail({
      from: `${MAIL_ABSENDER} <${MAIL_ABSENDERADRESSE ?? MAIL_USER}>`,
      to: empfaenger,
      replyTo: antwortAn,
      subject: einsetzen(betreff, werte),
      text: einsetzen(text, werte),
    })
    neu.push({
      bfs: g.bfs, name: g.name, kanton: g.kanton, sprache,
      an: empfaenger, antwort_an: antwortAn,
      nachricht_id: ergebnis.messageId, am: new Date().toISOString(),
    })
    console.log(`  ✓ ${g.kanton}  ${g.name.padEnd(24)} → ${empfaenger}`)
    // Zwischen zwei Mails eine Pause: fünfzig am Tag sind unauffällig, fünfzig
    // in einer Minute nicht. Zoho beobachtet die Rate, nicht die Tagesmenge.
    await new Promise((r) => setTimeout(r, 4000))
    hintereinander = 0
  } catch (e) {
    console.log(`  ✗ ${g.name}: ${e.message.slice(0, 90)}`)
    hintereinander = GESPERRT.test(e.message) ? hintereinander + 1 : 0
    if (hintereinander >= ABBRUCH_NACH) {
      console.log('')
      console.log(`Abbruch: ${ABBRUCH_NACH} Absagen hintereinander — der Anbieter nimmt gerade nichts an.`)
      console.log('Nichts davon wurde als angeschrieben verbucht; der Lauf lässt sich später unverändert')
      console.log('wiederholen. Mit «node --env-file=.env.mail.local scripts/mail-gesendet.mjs» nachsehen,')
      console.log('was tatsächlich hinausging.')
      break
    }
  }
}

// Eine Probe an die eigene Adresse ist kein Kontakt mit der Gemeinde. Sie
// trotzdem als "angeschrieben" festzuhalten hiesse, sie stillschweigend von
// jeder weiteren Anfrage auszuschliessen — ein Ausschluss, den niemand mehr
// bemerkt, weil er wie ein erledigter Vorgang aussieht.
if (SENDEN && PROBE_AN) {
  console.log(`\n${neu.length} Probe(n) an ${PROBE_AN} — nicht als angeschrieben vermerkt.`)
} else if (SENDEN && neu.length > 0) {
  mkdirSync(MAIL, { recursive: true })
  versandt.eintraege.push(...neu)
  versandt.stand = new Date().toISOString().slice(0, 10)
  writeFileSync(VERSANDT, JSON.stringify(versandt, null, 1) + '\n')
  console.log(`\n${neu.length} versandt, festgehalten in ${VERSANDT}`)
} else if (!SENDEN) {
  console.log('\nVorlauf — es ging nichts hinaus. Mit --senden wird versandt.')
}
