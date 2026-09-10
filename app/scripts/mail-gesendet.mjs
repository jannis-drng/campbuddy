/**
 * Was ist wirklich hinausgegangen? Der Ordner «Gesendet» weiss es.
 *
 * `versandt.json` ist unsere eigene Buchführung — und die wird erst am Ende
 * eines Laufs geschrieben. Bricht ein Lauf ab, klafft eine Lücke, und die ist
 * gefährlich in beide Richtungen: eine Gemeinde doppelt anzuschreiben ist
 * peinlich, eine für immer zu überspringen ist schlimmer.
 *
 * Dieses Skript fragt nicht uns, sondern den Postausgang beim Anbieter. Es ist
 * die einzige Prüfung, die unabhängig von unserer eigenen Datei ist — gebraucht
 * am 10.09.2026, als ein Lauf eine Stunde lief und am Ende offen war, ob 27
 * Gemeinden angeschrieben worden waren oder keine. (Es war keine.)
 *
 *   node --env-file=.env.mail.local scripts/mail-gesendet.mjs [--seit 2026-09-01]
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--seit')
const SEIT = new Date(i > -1 && process.argv[i + 1] ? process.argv[i + 1] : new Date().toISOString().slice(0, 10))

const post = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: Number(process.env.IMAP_PORT ?? 993),
  secure: true,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORT },
  logger: false,
})
await post.connect()

const ordner = await post.list()
const gesendet = ordner.find((o) => o.specialUse === '\\Sent') ?? ordner.find((o) => /^sent|gesendet/i.test(o.path))
if (!gesendet) {
  console.error(`Kein Ordner «Gesendet» gefunden. Vorhanden: ${ordner.map((o) => o.path).join(', ')}`)
  await post.logout()
  process.exit(1)
}

const schloss = await post.getMailboxLock(gesendet.path)
const raus = []
try {
  for await (const n of post.fetch({ since: SEIT }, { source: true })) {
    const m = await simpleParser(n.source)
    raus.push({ an: m.to?.text ?? '', am: m.date?.toISOString() ?? '' })
  }
} finally {
  schloss.release()
  await post.logout()
}
raus.sort((a, b) => a.am.localeCompare(b.am))

console.log(`Im Postausgang seit ${SEIT.toISOString().slice(0, 10)}: ${raus.length}`)
for (const r of raus) console.log(`  ${r.am.slice(0, 16).replace('T', ' ')}  ${r.an}`)

// Der eigentliche Zweck: unsere Buchführung dagegenhalten.
const versandt = JSON.parse(readFileSync(resolve(ROOT, 'import/mail/versandt.json'), 'utf8')).eintraege
const beiUns = new Set(versandt.filter((e) => new Date(e.am) >= SEIT).map((e) => e.an?.toLowerCase()))
const beiZoho = new Set(raus.map((r) => (r.an.match(/[^\s<>]+@[^\s<>]+/) ?? [''])[0].toLowerCase()).filter(Boolean))

const nurZoho = [...beiZoho].filter((a) => !beiUns.has(a))
const nurWir = [...beiUns].filter((a) => !beiZoho.has(a))

console.log('')
if (nurZoho.length) {
  console.log(`⚠ ${nurZoho.length} versandt, aber nicht in versandt.json — die würden wir erneut anschreiben:`)
  for (const a of nurZoho) console.log(`   ${a}`)
}
if (nurWir.length) {
  console.log(`⚠ ${nurWir.length} in versandt.json, aber nicht im Postausgang — als erledigt geführt, ohne Beleg:`)
  for (const a of nurWir) console.log(`   ${a}`)
}
if (!nurZoho.length && !nurWir.length) console.log('✓ Buchführung und Postausgang stimmen überein.')
