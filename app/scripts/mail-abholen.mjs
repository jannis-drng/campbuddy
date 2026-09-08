/**
 * Die Antworten der Gemeinden abholen und auswerten.
 *
 * Die Zuordnung ist der heikle Teil, und sie wird hier nicht geraten: jede
 * Anfrage ging mit einem `Reply-To` der Form `contact+bfs4551@…` hinaus, also
 * trägt die Antwort ihre Gemeinde selbst mit sich. Wo dieser Anker fehlt —
 * weil jemand aus dem Adressbuch heraus an `contact@` geschrieben hat —, wird
 * über die Absenderdomain nur ein Vorschlag gemacht, den ein Mensch bestätigt.
 * Eine falsch zugeordnete Auskunft wäre schlimmer als eine unzugeordnete: sie
 * behauptet Rechtslage für eine Gemeinde, die nie danach gefragt wurde.
 *
 * Ausgewertet wird nichts automatisch eingestuft. Die Antwort landet als
 * Kandidat mit dem Wortlaut daneben; die Einstufung macht ein Mensch, so wie
 * bei den Reglementen auch.
 *
 * Aufruf: node --env-file=.env.mail.local scripts/mail-abholen.mjs [--alle]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { fundstellen } from './lib/reglemente.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MAIL = resolve(ROOT, 'import/mail')
const ANTWORTEN = resolve(MAIL, 'antworten.json')
const ABGEMELDET = resolve(MAIL, 'keine-anfragen.json')

const ALLE = process.argv.includes('--alle')
const lade = (p, standard) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : standard)

/**
 * Wer sich abmeldet, wird nicht mehr gefragt.
 *
 * Bewusst grosszügig erkannt: lieber eine Gemeinde zu viel austragen als eine
 * zu wenig. Wer «bitte keine weiteren Anfragen» schreibt, hat kein Interesse
 * daran, dass wir seine Formulierung genau treffen.
 */
const ABMELDUNG = /keine anfragen|keine weiteren (anfragen|mails|nachrichten)|nicht mehr (anschreiben|kontaktieren)|austragen|abmelden|pas de demandes|plus de messages|ne plus (nous )?(contacter|écrire)|nessuna richiesta|non contattarci|unsubscribe/i

/**
 * Unser eigenes Schreiben aus dem Text entfernen, bevor er ausgewertet wird.
 *
 * Das Anschreiben enthält die Abmeldeanweisung im Wortlaut («antworten Sie
 * bitte mit ‹keine Anfragen›»). Wird es zitiert — und Behördenantworten
 * zitieren fast immer —, findet die Abmeldeerkennung unsere eigene Anweisung
 * und trägt die Gemeinde aus, die gerade geantwortet hat. Beim Ausprobieren
 * hat sie genau das mit unseren eigenen Probemails getan.
 *
 * Erkannt wird das Zitat an Sätzen, die nur in unserer Vorlage vorkommen.
 */
const UNSER_TEXT = [
  /Ich betreibe eine kostenlose Online-Karte/i,
  /J'exploite une carte en ligne gratuite/i,
  /Gestisco una mappa online gratuita/i,
  /Transparenzhinweis:/i, /Transparence\s*:/i, /Nota di trasparenza:/i,
]

function ohneUnserSchreiben(text) {
  let kuerzeste = text
  for (const muster of UNSER_TEXT) {
    const m = muster.exec(text)
    if (m && m.index < kuerzeste.length) kuerzeste = text.slice(0, m.index)
  }
  return kuerzeste.trim()
}

/**
 * Ist das überhaupt eine Antwort auf uns?
 *
 * Im Postfach liegt auch alles andere — Rechnungen, Rundbriefe von Diensten,
 * Bestätigungsmails. Ohne diese Prüfung landet das alles als «Antwort einer
 * Gemeinde» in der Auswertung und muss von Hand aussortiert werden.
 */
/**
 * Der dritte Weg zur Gemeinde: der Betreff.
 *
 * Wir schreiben den Gemeindenamen selbst hinein ("… zur Regelung in Fully"),
 * und die Antwort trägt ihn zurück. Das rettet die Fälle, in denen jemand von
 * einer anderen Adresse antwortet als der, die wir angeschrieben haben —
 * Fully wurde unter admin.fully.ch angeschrieben und antwortete von
 * fully.ch, womit beide bisherigen Wege ins Leere liefen.
 *
 * Nur eindeutige Treffer zählen: kommen zwei Gemeindenamen im Betreff vor,
 * wird nichts geraten.
 */
function bfsAusBetreff(betreff) {
  if (!betreff) return null
  const treffer = gemeinden.filter((g) => betreff.includes(g.name))
  return treffer.length === 1 ? treffer[0].bfs : null
}

function istAntwort(mail, bfs, vermutet) {
  if (bfs) return true
  if (vermutet) return true
  const bezug = `${mail.inReplyTo ?? ''} ${mail.references ?? ''}`
  return unsereNachrichten.size > 0 && [...unsereNachrichten].some((id) => bezug.includes(id))
}

/**
 * Eine Eingangsbestätigung ist keine Antwort.
 *
 * Viele Verwaltungen schicken zuerst eine automatische Empfangsbestätigung
 * ("Ihre Anfrage wird an die zuständige Stelle weitergeleitet") und Tage
 * später die eigentliche Auskunft. Beide sehen im Postfach gleich aus. Wer
 * die erste als Antwort verbucht, hält die Gemeinde für erledigt und wartet
 * nie auf die zweite.
 */
const EINGANGSBESTAETIGUNG = new RegExp([
  'automatische antwort', 'automatic reply', 'réponse automatique', 'risposta automatica',
  "c'est une information automatique", 'dies ist eine automatische',
  'sera traitée dans les meilleurs délais', 'sera dirigée au service',
  'wird an die zuständige stelle', 'accusons? (bonne )?réception',
  'wir haben ihre (anfrage|nachricht) erhalten', 'abwesenheitsnotiz', 'out of office',
  'bin ich abwesend', 'je suis absent',
].join('|'), 'i')

/**
 * Woran man erkennt, dass die Mail doch etwas sagt.
 *
 * Die Länge taugt nicht als Unterscheidung: Sembrancher schreibt "Nous
 * accusons bonne réception" — und liefert im nächsten Satz die Auskunft samt
 * Artikelnummer. Eine Signatur macht umgekehrt jede Bestätigung lang.
 * Entscheidend ist, ob überhaupt etwas Regelndes darinsteht.
 */
const INHALT = /interdit|interdic|verboten|untersagt|nicht (erlaubt|gestattet)|autoris|gestattet|erlaubt|art(ikel)?\.?\s*\d+|règlement|reglement|regolamento|campingplatz|camping/i

/** Die BFS-Nummer aus den Empfängerfeldern — der Anker, den wir selbst gesetzt haben. */
function bfsAus(kopf) {
  const felder = [kopf.to?.text, kopf.cc?.text, kopf.headers?.get('delivered-to'), kopf.headers?.get('x-original-to')]
  for (const f of felder) {
    const m = String(f ?? '').match(/\+bfs(\d+)@/i)
    if (m) return Number(m[1])
  }
  return null
}

/* ------------------------------------------------------------------ Lauf */

const { IMAP_HOST, IMAP_PORT, MAIL_USER, MAIL_PASSWORT } = process.env
if (!IMAP_HOST || !MAIL_USER || !MAIL_PASSWORT) {
  console.log('Zugangsdaten fehlen — .env.mail.local prüfen.')
  process.exit(1)
}

const versandt = lade(resolve(MAIL, 'versandt.json'), { eintraege: [] }).eintraege
const gemeinden = JSON.parse(
  readFileSync(resolve(ROOT, 'import/CH/gemeinden/CH.json'), 'utf8'),
).features.map((f) => f.properties).filter((g) => g.bfs != null)
const unsereNachrichten = new Set(versandt.map((e) => e.nachricht_id).filter(Boolean))
const nachDomain = new Map()
for (const e of versandt) {
  const domain = String(e.an).split('@')[1]?.toLowerCase()
  if (domain) nachDomain.set(domain, e)
}

const antworten = lade(ANTWORTEN, { eintraege: [] })
const schonDa = new Set(antworten.eintraege.map((e) => e.nachricht_id))
const abgemeldet = lade(ABGEMELDET, { bfs: [] })

const post = new ImapFlow({
  host: IMAP_HOST,
  port: Number(IMAP_PORT ?? 993),
  secure: true,
  auth: { user: MAIL_USER, pass: MAIL_PASSWORT },
  logger: false,
})

await post.connect()
const schloss = await post.getMailboxLock('INBOX')

let gesehen = 0
let neu = 0
try {
  // Nicht nach dem Gelesen-Merkmal suchen, sondern nach dem Zeitraum.
  //
  // Der Abruf selbst markiert Nachrichten als gelesen — der Läufer hat sich
  // damit seine eigene Warteschlange weggeräumt: die Antwort aus
  // Crans-Montana lag im Postfach und wurde nicht mehr gefunden, weil ein
  // früherer Lauf sie angefasst hatte. Was schon verarbeitet ist, steht
  // ohnehin an seiner Nachrichtenkennung; das ist der verlässlichere Haken.
  const seit = new Date(Date.now() - 60 * 24 * 3600 * 1000)
  const suche = ALLE ? { all: true } : { since: seit }
  for await (const nachricht of post.fetch(suche, { source: true, envelope: true })) {
    gesehen++
    const mail = await simpleParser(nachricht.source)
    const id = mail.messageId ?? `ohne-id-${nachricht.uid}`
    if (schonDa.has(id)) continue

    const bfs = bfsAus(mail)
    const absenderDomain = mail.from?.value?.[0]?.address?.split('@')[1]?.toLowerCase()
    const vermutet = bfs
      ? null
      : nachDomain.get(absenderDomain ?? '')?.bfs ?? bfsAusBetreff(mail.subject) ?? null

    if (!istAntwort(mail, bfs, vermutet)) continue

    const text = (mail.text ?? '').replace(/\r/g, '').trim()
    // Zitierte Teile abschneiden — erst die üblichen Zitatmarken, dann unser
    // eigenes Schreiben, falls es ohne Marke darunterhängt.
    const ohneMarken = text.split(/\n>|\n-{2,}\s*(Ursprüngliche|Original|Von:|De:|Da:)/)[0].trim()
    const ohneZitat = ohneUnserSchreiben(ohneMarken)

    const eintrag = {
      nachricht_id: id,
      bfs, bfs_vermutet: vermutet,
      von: mail.from?.text ?? null,
      betreff: mail.subject ?? null,
      am: (mail.date ?? new Date()).toISOString(),
      abmeldung: ABMELDUNG.test(ohneZitat) || ABMELDUNG.test(mail.subject ?? ''),
      // Nur eine Empfangsbestätigung: festhalten, aber nicht als Auskunft
      // zählen — die eigentliche Antwort kommt oft Tage später.
      nur_bestaetigung: EINGANGSBESTAETIGUNG.test(ohneZitat) && !INHALT.test(ohneZitat),
      text: ohneZitat.slice(0, 6000),
      // Dieselbe Artikel-Extraktion wie bei den Reglementen: nennt die Antwort
      // einen Artikel im Wortlaut, wird er hier sichtbar.
      stellen: fundstellen(ohneZitat),
      anhaenge: (mail.attachments ?? []).map((a) => ({ name: a.filename, typ: a.contentType, groesse: a.size })),
      geprueft: false,
    }

    // Ein Weiterverweis ist keine Auskunft, aber auch kein Schweigen: die
    // Gemeinde nennt die zuständige Stelle. Ohne diesen Vermerk sieht die
    // Antwort später aus wie eine, die nichts hergab.
    const andereAdressen = [...ohneZitat.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)]
      .map((m) => m[0].toLowerCase())
      .filter((m) => !(mail.from?.text ?? '').toLowerCase().includes(m) && !m.includes('camping-map'))
    if (eintrag.stellen.length === 0 && !eintrag.abmeldung && andereAdressen.length > 0
        && /contacter|wenden Sie sich|zuständig ist|responsable|weitergeleitet|s'adresser/i.test(ohneZitat)) {
      eintrag.verweis_an = andereAdressen[0]
    }
    antworten.eintraege.push(eintrag)
    neu++

    if (eintrag.abmeldung && (bfs ?? vermutet)) {
      const nummer = bfs ?? vermutet
      if (!abgemeldet.bfs.includes(nummer)) abgemeldet.bfs.push(nummer)
    }

    const wer = bfs ? `bfs ${bfs}` : vermutet ? `vermutlich bfs ${vermutet}` : 'nicht zuzuordnen'
    const marke = eintrag.abmeldung ? 'ABMELDUNG'
      : eintrag.nur_bestaetigung ? 'nur Eingangsbestätigung'
        : eintrag.stellen.length ? `${eintrag.stellen.length} Fundstelle(n)` : 'Auskunft'
    console.log(`  ${wer.padEnd(24)} ${marke.padEnd(16)} ${(mail.subject ?? '').slice(0, 44)}`)
  }
} finally {
  schloss.release()
  await post.logout()
}

mkdirSync(MAIL, { recursive: true })
if (neu > 0) {
  antworten.stand = new Date().toISOString().slice(0, 10)
  writeFileSync(ANTWORTEN, JSON.stringify(antworten, null, 1) + '\n')
  writeFileSync(ABGEMELDET, JSON.stringify(abgemeldet, null, 1) + '\n')
}

console.log('')
console.log(`Angesehen: ${gesehen} · neu aufgenommen: ${neu}`)
console.log(`Insgesamt: ${antworten.eintraege.length} Antworten, davon ${antworten.eintraege.filter((e) => !e.geprueft).length} ungeprüft`)
if (abgemeldet.bfs.length) console.log(`Abgemeldet: ${abgemeldet.bfs.length} Gemeinden`)
