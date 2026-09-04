/**
 * Prüft, ob der Mailzugang wirklich funktioniert — bevor irgendetwas versendet wird.
 *
 * Zwei Wege, zwei Prüfungen: IMAP zum Lesen der Antworten, SMTP zum Versenden
 * der Anfragen. Beide sprechen ein einfaches zeilenweises Protokoll, deshalb
 * genügt eine TLS-Verbindung und es braucht keine Bibliothek. Das ist hier ein
 * Vorteil und keine Sparsamkeit: eine Zugangsprüfung, die selbst von einer
 * Abhängigkeit abhängt, prüft auch die Abhängigkeit mit.
 *
 * Aufruf: node --env-file=.env.mail.local scripts/mail-pruefen.mjs
 */
import { connect } from 'node:tls'

const rot = (s) => `\x1b[31m${s}\x1b[0m`
const gruen = (s) => `\x1b[32m${s}\x1b[0m`

/** Eine TLS-Sitzung, die zeilenweise spricht und auf Antworten wartet. */
function sitzung(host, port) {
  return new Promise((fertig, scheitern) => {
    const buchse = connect({ host, port, servername: host }, () => fertig(buchse))
    buchse.setTimeout(15000)
    buchse.on('timeout', () => { buchse.destroy(); scheitern(new Error('Zeitüberschreitung')) })
    buchse.on('error', scheitern)
  })
}

function sagen(buchse, zeile, erwartet) {
  return new Promise((fertig, scheitern) => {
    let gesammelt = ''
    const zuhoerer = (stueck) => {
      gesammelt += stueck.toString('utf8')
      if (erwartet.test(gesammelt)) { buchse.off('data', zuhoerer); fertig(gesammelt) }
    }
    buchse.on('data', zuhoerer)
    if (zeile) buchse.write(zeile + '\r\n')
    setTimeout(() => { buchse.off('data', zuhoerer); scheitern(new Error(`keine Antwort auf «${(zeile ?? '').split(' ')[0]}»`)) }, 15000)
  })
}

const {
  IMAP_HOST, IMAP_PORT, SMTP_HOST, SMTP_PORT, MAIL_USER, MAIL_PASSWORT, MAIL_ABSENDERADRESSE,
} = process.env
const fehlend = Object.entries({ IMAP_HOST, SMTP_HOST, MAIL_USER, MAIL_PASSWORT })
  .filter(([, v]) => !v).map(([k]) => k)
if (fehlend.length) {
  console.log(rot(`Es fehlen: ${fehlend.join(', ')}`))
  process.exit(1)
}

let fehler = 0

/* ---- Lesen: IMAP ---- */
try {
  const b = await sitzung(IMAP_HOST, Number(IMAP_PORT ?? 993))
  await sagen(b, null, /^\* OK/m)
  // Anführungszeichen um beide Angaben: App-Passwörter enthalten oft Zeichen,
  // die IMAP sonst als Trenner läse.
  const antwort = await sagen(b, `a1 LOGIN "${MAIL_USER}" "${MAIL_PASSWORT}"`, /^a1 (OK|NO|BAD)/m)
  if (/^a1 OK/m.test(antwort)) {
    const posteingang = await sagen(b, 'a2 SELECT INBOX', /^a2 (OK|NO|BAD)/m)
    const anzahl = (posteingang.match(/\* (\d+) EXISTS/) ?? [])[1]
    console.log(gruen('✓ IMAP'), `— angemeldet, Posteingang mit ${anzahl ?? '?'} Nachrichten`)
  } else {
    console.log(rot('✗ IMAP'), '— Anmeldung abgewiesen:', antwort.trim().split('\n').pop())
    // Die häufigste Ursache zuerst, und sie ist unauffällig: Zoho antwortet
    // auf die Anmeldung an einem Alias oder einer Gruppe mit demselben
    // "Invalid credentials" wie auf ein falsches Passwort. Wer das nicht
    // weiss, sucht stundenlang am richtigen Passwort.
    console.log(`   ${MAIL_USER} — ist das ein echtes Benutzerkonto?`)
    console.log('   Ein Alias oder eine Zoho-Gruppe hat kein eigenes Passwort.')
    console.log('   Dann MAIL_USER auf das Konto setzen, unter dem das Postfach liegt (meist admin@).')
    console.log('   Sonst prüfen: IMAP in Zoho eingeschaltet? App-Passwort statt Kontopasswort?')
    fehler++
  }
  b.write('a3 LOGOUT\r\n'); b.end()
} catch (e) {
  console.log(rot('✗ IMAP'), '—', e.message, `(${IMAP_HOST}:${IMAP_PORT ?? 993})`)
  fehler++
}

/* ---- Versenden: SMTP ---- */
try {
  const b = await sitzung(SMTP_HOST, Number(SMTP_PORT ?? 465))
  await sagen(b, null, /^220 /m)
  await sagen(b, 'EHLO camping-map.com', /^250 /m)
  await sagen(b, 'AUTH LOGIN', /^334 /m)
  await sagen(b, Buffer.from(MAIL_USER).toString('base64'), /^334 /m)
  const antwort = await sagen(b, Buffer.from(MAIL_PASSWORT).toString('base64'), /^(235|535|534|530)/m)
  if (/^235/m.test(antwort)) {
    console.log(gruen('✓ SMTP'), '— angemeldet, Versand möglich')
  } else {
    console.log(rot('✗ SMTP'), '— Anmeldung abgewiesen:', antwort.trim())
    fehler++
  }
  b.write('QUIT\r\n'); b.end()
} catch (e) {
  console.log(rot('✗ SMTP'), '—', e.message, `(${SMTP_HOST}:${SMTP_PORT ?? 465})`)
  fehler++
}

// Die Absenderadresse darf vom Anmeldekonto abweichen — dann muss sie in Zoho
// aber als Absenderadresse bestätigt sein. Das lässt sich hier nicht prüfen,
// nur benennen: SMTP weist sie erst beim Versand zurück.
if (fehler === 0 && MAIL_ABSENDERADRESSE && MAIL_ABSENDERADRESSE !== MAIL_USER) {
  console.log('')
  console.log(`  Hinweis: gesendet wird als ${MAIL_ABSENDERADRESSE}, angemeldet als ${MAIL_USER}.`)
  console.log('  Diese Absenderadresse muss in Zoho unter «Absenderadressen» bestätigt sein.')
}

console.log('')
console.log(fehler === 0
  ? gruen('Beides steht. Der Mailweg kann gebaut werden.')
  : rot('Noch nicht bereit — siehe oben.'))
process.exit(fehler === 0 ? 0 : 1)
