/**
 * Eine einzelne Anfrage an eine Stelle, die uns eine Gemeinde genannt hat.
 *
 * Getrennt vom Reihenversand, weil sie sich in zwei Punkten unterscheidet:
 * sie geht an eine namentlich genannte Person statt an ein Amtspostfach, und
 * sie beginnt mit dem Hinweis, wer uns geschickt hat. Ohne diesen Bezug wäre
 * es für die Empfängerin eine unaufgeforderte Nachricht — mit ihm ist es die
 * Fortsetzung eines Vorgangs, den ihre eigene Verwaltung angestossen hat.
 *
 * Aufruf:
 *   node --env-file=.env.mail.local scripts/mail-nachfassen.mjs --bfs 6217 --an … --von … [--senden]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, s = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : s
}
const SENDEN = process.argv.includes('--senden')
const BFS = Number(arg('bfs'))
const AN = arg('an')
const VERWIESEN_VON = arg('von', '')
const SPRACHE = arg('sprache', 'fr')

const gemeinden = JSON.parse(readFileSync(resolve(ROOT, 'import/CH/gemeinden/CH.json'), 'utf8'))
  .features.map((f) => f.properties)
const g = gemeinden.find((x) => x.bfs === BFS)
if (!g || !AN) { console.log('Aufruf: --bfs <nummer> --an <adresse> [--von <wer verwiesen hat>]'); process.exit(1) }

const {
  SMTP_HOST, SMTP_PORT, MAIL_USER, MAIL_PASSWORT, MAIL_ABSENDERADRESSE,
  MAIL_ANTWORT_AN, MAIL_ABSENDER, MAIL_PROJEKT_URL,
} = process.env

const TEXTE = {
  fr: {
    betreff: `Nuitée en plein air — question sur la réglementation à ${g.name}`,
    text: `Madame, Monsieur,

${VERWIESEN_VON ? `${VERWIESEN_VON} m'a aimablement transmis vos coordonnées pour cette question.\n\n` : ''}J'exploite une carte en ligne gratuite consacrée aux nuitées en pleine nature.
Elle indique pour chaque commune ce qui s'applique, avec la source et la date
de la dernière vérification.

Pour ${g.name}, je n'ai trouvé aucune disposition en ligne. D'où ma question :

Existe-t-il à ${g.name} une réglementation concernant le camping ou le fait de
passer la nuit en plein air en dehors des places autorisées ?

Une référence à l'article du règlement communal ou un lien suffit. S'il
n'existe aucune réglementation, cette réponse nous est tout aussi utile — la
carte l'indiquera ainsi.

Votre réponse figurera sur la carte avec la commune comme source et la date.
Si vous ne le souhaitez pas, un bref message suffit.

Transparence : cette demande a été rédigée et envoyée de manière automatisée,
avec le concours d'un système d'IA. Si elle devait être erronée ou
inappropriée, je vous prie de m'en excuser. Chaque réponse est lue par une
personne, et chaque indication est vérifiée manuellement avant publication.
Si vous ne souhaitez plus recevoir de messages, répondez « pas de demandes ».

Avec mes salutations les meilleures
${MAIL_ABSENDER}
${MAIL_PROJEKT_URL}`,
  },
}
const { betreff, text } = TEXTE[SPRACHE] ?? TEXTE.fr

console.log(`An:      ${AN}`)
console.log(`Betreff: ${betreff}`)
console.log(`Bezug:   ${VERWIESEN_VON || '(keiner)'}`)
console.log('')
console.log(text)

if (!SENDEN) { console.log('\nVorlauf — es ging nichts hinaus. Mit --senden wird versandt.'); process.exit(0) }

const post = nodemailer.createTransport({
  host: SMTP_HOST, port: Number(SMTP_PORT ?? 465), secure: Number(SMTP_PORT ?? 465) === 465,
  auth: { user: MAIL_USER, pass: MAIL_PASSWORT },
})
const ergebnis = await post.sendMail({
  from: `${MAIL_ABSENDER} <${MAIL_ABSENDERADRESSE ?? MAIL_USER}>`,
  to: AN,
  replyTo: (MAIL_ANTWORT_AN ?? '').replace('{{bfs}}', String(BFS)),
  subject: betreff,
  text,
})

// Im selben Protokoll festhalten, damit die Gemeinde nicht doppelt angeschrieben wird.
const pfad = resolve(ROOT, 'import/mail/versandt.json')
const protokoll = JSON.parse(readFileSync(pfad, 'utf8'))
protokoll.eintraege.push({
  bfs: BFS, name: g.name, kanton: g.kanton, sprache: SPRACHE, an: AN,
  antwort_an: (MAIL_ANTWORT_AN ?? '').replace('{{bfs}}', String(BFS)),
  nachricht_id: ergebnis.messageId, am: new Date().toISOString(),
  nachgefasst_auf_verweis_von: VERWIESEN_VON || null,
})
writeFileSync(pfad, JSON.stringify(protokoll, null, 1) + '\n')
console.log(`\n✓ versandt an ${AN}, festgehalten.`)
