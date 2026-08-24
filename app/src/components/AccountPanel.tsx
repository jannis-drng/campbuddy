/**
 * Kontobereich — Abschnitt 4.6 der Spezifikation.
 *
 * Drei Anmeldewege nebeneinander: Passwort, Magic Link und externe Anbieter.
 * Die Anbieter-Knöpfe erscheinen nur, wenn der Anbieter im Supabase-Projekt
 * wirklich eingerichtet ist — ein Knopf, der in eine Fehlerseite führt, ist
 * schlimmer als kein Knopf.
 *
 * Zur Gestaltung: die Anmeldung ist für viele die erste Seite, die nicht die
 * Karte ist. Sie steht deshalb als eigene, zentrierte Karte da — Markenzeichen,
 * eine Überschrift, ein Formular — und nicht als Formularliste im Fliesstext.
 * Die angemeldete Ansicht ist das Gegenstück: keine lose Folge von Feldern
 * mehr, sondern Karten mit gleichem Kopf (Symbol, Titel, ein Satz Erklärung),
 * damit man auf einen Blick sieht, worum es in jedem Block geht. Beide nutzen
 * ausschliesslich die Primitive aus `src/ui` — vorher trugen mehrere Knöpfe
 * hier ihre eigene Utility-Kette und sahen dadurch anders aus als überall sonst.
 *
 * Passwörter werden nirgends zwischengespeichert oder protokolliert; sie gehen
 * direkt an Supabase.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AtSign, BadgeCheck, Check, ChevronRight, Eye, EyeOff, KeyRound, Loader2, Lock, LogOut, Mail,
  Map as MapIcon, ShieldCheck, Sparkles, Trash2, TriangleAlert, UserRound, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, Button, Card, Eingabe, Hinweis, Label, Leer, Segmente, Seite, Stufen } from '../ui'
import { isSupabaseConfigured } from '../services/supabase'
import {
  kontoLoeschen, ladeProfil, namePruefen, namensformPruefen, passwortAendern,
  passwortZuruecksetzen, signInWithEmail, signInWithPassword, signInWithProvider, signOut,
  signUpWithPassword, speichereAnzeigename, verfuegbareAnbieter,
  NAME_MAX, NAME_MIN, type LinkErgebnis, type NamensUrteil, type Profil,
} from '../services/account'

interface Props {
  session: Session | null
  onZuTouren: () => void
  /** Ergebnis der Rückkehr von einem E-Mail-Link, falls es eines gab. */
  linkErgebnis: LinkErgebnis | null
  onLinkErgebnisGelesen: () => void
}

const ANBIETER_NAMEN: Record<string, string> = {
  google: 'Google', apple: 'Apple', github: 'GitHub', facebook: 'Facebook',
  azure: 'Microsoft', discord: 'Discord', gitlab: 'GitLab', bitbucket: 'Bitbucket',
}

// Acht Zeichen — bewusst niedrig gehalten, damit die Registrierung nicht an
// der Hürde scheitert. Das Gewicht trägt dafür die Leak-Prüfung auf der
// Serverseite (Supabase -> Authentication -> Policies): ein Passwort aus einem
// bekannten Leak fällt bei jedem Angriff zuerst, egal wie lang es ist, und ein
// nicht geleaktes mit acht Zeichen hält länger als ein geleaktes mit sechzehn.
//
// Dieser Wert prüft nur im Browser. Wer die API direkt anspricht, umgeht ihn —
// die Serverseite muss denselben Wert tragen, sonst ist er Zierde.
const MIN_PASSWORT = 8

export function AccountPanel({ session, onZuTouren, linkErgebnis, onLinkErgebnisGelesen }: Props) {
  const [anbieter, setAnbieter] = useState<string[]>([])

  useEffect(() => {
    if (isSupabaseConfigured) verfuegbareAnbieter().then(setAnbieter)
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <Seite titel="Konto" breite="schmal"
             beschreibung="Für dieses Projekt ist kein Backend hinterlegt.">
        <Leer
          icon={UserRound}
          titel="Hier gibt es nichts anzumelden"
          text="Karte, Routenplanung und Auswertung funktionieren vollständig ohne Konto. Sobald ein Backend hinterlegt ist, entsteht an dieser Stelle die Anmeldung."
        />
      </Seite>
    )
  }

  const meldung = linkErgebnis && (
    <LinkMeldung ergebnis={linkErgebnis} onSchliessen={onLinkErgebnisGelesen} />
  )

  return session
    ? <AngemeldeteAnsicht session={session} onZuTouren={onZuTouren} meldung={meldung} />
    : <AnmeldeAnsicht anbieter={anbieter} meldung={meldung} />
}

/**
 * Rückmeldung eines E-Mail-Links (bestätigt, abgelaufen, …).
 *
 * Bewusst kein `Hinweis`: dieser Kasten trägt als einziger einen Schliessen-
 * Knopf, weil er nach dem Lesen weg soll, statt bis zum Neuladen zu bleiben.
 */
function LinkMeldung({ ergebnis, onSchliessen }: { ergebnis: LinkErgebnis; onSchliessen: () => void }) {
  const fehler = ergebnis.art === 'fehler'
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-mittel border px-3 py-2.5 text-klein leading-relaxed ${
        fehler
          ? 'border-verboten-500/25 bg-verboten-500/8 text-verboten-400'
          : 'border-erlaubt-500/25 bg-erlaubt-500/8 text-erlaubt-400'
      }`}
    >
      {fehler
        ? <TriangleAlert size={15} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
        : <Check size={15} strokeWidth={2.5} className="mt-px shrink-0" aria-hidden />}
      <p className="min-w-0 flex-1">{ergebnis.meldung}</p>
      <button
        onClick={onSchliessen}
        aria-label="Hinweis schliessen"
        className="-mr-1 -mt-0.5 shrink-0 rounded-klein p-1 opacity-60 transition-opacity duration-[160ms] hover:opacity-100"
      >
        <X size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Bausteine, die beide Ansichten teilen                              */
/* ---------------------------------------------------------------- */

/** Das Zelt-Dreieck der Wortmarke, gross und auf einer erhöhten Fläche. */
function Zeltmarke() {
  return (
    <span
      aria-hidden
      className="inline-flex h-14 w-14 items-center justify-center rounded-riesig border border-kante bg-flaeche-2 shadow-[var(--shadow-2)]"
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8">
        <path d="M12 3.5 3 20h18L12 3.5Z" fill="none"
              stroke="var(--color-gletscher-400)" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M12 10.5 17 20H7l5-9.5Z" fill="var(--color-gletscher-400)" opacity="0.28" />
      </svg>
    </span>
  )
}

/**
 * Karte mit Kopfzeile: Symbol, Titel, ein Satz Erklärung, darunter der Inhalt.
 *
 * Alle Blöcke der angemeldeten Ansicht sind so gebaut. Dadurch steht die
 * Erklärung immer an derselben Stelle, und die Blöcke lassen sich überfliegen,
 * ohne jeden Fliesstext zu lesen.
 */
function Feldkarte({
  icon: Icon, titel, beschreibung, beiwerk, ton = 'normal', children,
}: {
  icon: LucideIcon
  titel: string
  beschreibung?: string
  beiwerk?: React.ReactNode
  ton?: 'normal' | 'gefahr'
  children: React.ReactNode
}) {
  const gefahr = ton === 'gefahr'
  return (
    <Card className={gefahr ? 'border-verboten-500/25 bg-verboten-500/[0.04]' : ''}>
      <div className="flex items-start gap-3 p-5">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-mittel border ${
            gefahr
              ? 'border-verboten-500/25 bg-verboten-500/10 text-verboten-400'
              : 'border-kante bg-flaeche-3 text-gletscher-300'
          }`}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={`text-ueberschrift font-semibold ${gefahr ? 'text-verboten-200' : 'text-ink-50'}`}>
              {titel}
            </h3>
            {beiwerk}
          </div>
          {beschreibung && (
            <p className="mt-1 text-klein leading-relaxed text-ink-400">{beschreibung}</p>
          )}
          <div className="mt-3.5">{children}</div>
        </div>
      </div>
    </Card>
  )
}

/**
 * Passwortfeld mit Auge zum Aufdecken.
 *
 * Tippfehler in einem verdeckten Feld sind der häufigste Grund für eine
 * gescheiterte Anmeldung; der Knopf kostet nichts und erspart den zweiten
 * Versuch. Der Zustand liegt im Feld selbst, damit ihn keine Seite mitschleppt.
 */
function Passwortfeld({
  wert, onAendern, autoComplete, placeholder, required, minLength, id,
}: {
  wert: string
  onAendern: (w: string) => void
  autoComplete: string
  placeholder?: string
  required?: boolean
  minLength?: number
  id?: string
}) {
  const [sichtbar, setSichtbar] = useState(false)
  return (
    <div className="relative">
      <Eingabe
        id={id}
        type={sichtbar ? 'text' : 'password'}
        value={wert}
        onChange={(e) => onAendern(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setSichtbar((s) => !s)}
        aria-label={sichtbar ? 'Passwort verbergen' : 'Passwort anzeigen'}
        title={sichtbar ? 'Passwort verbergen' : 'Passwort anzeigen'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-mittel text-ink-500 transition-colors duration-[160ms] hover:text-ink-200"
      >
        {sichtbar
          ? <EyeOff size={16} strokeWidth={2} aria-hidden />
          : <Eye size={16} strokeWidth={2} aria-hidden />}
      </button>
    </div>
  )
}

/**
 * Grobe Einschätzung der Passwortstärke — drei Stufen, in der Akzentfarbe.
 *
 * Bewusst nicht in Grün/Gelb/Rot: diese drei Töne sind in dieser App der
 * Rechtslage vorbehalten (siehe `index.css`). Ein rotes Passwortfeld sähe aus
 * wie „verboten". Die Stufen tragen deshalb Form, nicht Bedeutungsfarbe.
 */
function passwortStaerke(p: string): { stufe: number; label: string } {
  if (p.length < MIN_PASSWORT) return { stufe: 1, label: 'Zu kurz' }
  let punkte = 1
  if (p.length >= 12) punkte++
  if (/\d/.test(p) && /[a-zA-Z]/.test(p)) punkte++
  if (/[^\w]/.test(p) || p.length >= 16) punkte++
  const stufe = Math.min(3, punkte)
  return { stufe, label: ['Schwach', 'Brauchbar', 'Kräftig'][stufe - 1] }
}

/* ---------------------------------------------------------------- */
/* Nicht angemeldet                                                   */
/* ---------------------------------------------------------------- */

/**
 * Markenzeichen der externen Anbieter.
 *
 * Als Pfad statt als Bilddatei, damit die Content-Security-Policy keine
 * fremde Domain freigeben muss und der Knopf ohne Netz sofort steht.
 * Unbekannte Anbieter bekommen ein neutrales Schlüsselsymbol — lieber kein
 * Zeichen als ein falsches.
 */
function AnbieterZeichen({ anbieter }: { anbieter: string }) {
  const klasse = 'h-[18px] w-[18px] shrink-0'
  if (anbieter === 'google') {
    return (
      <svg viewBox="0 0 24 24" className={klasse} aria-hidden>
        <path fill="#4285F4" d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.17-2 3.44-4.95 3.44-8.55Z" />
        <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.75v2.98A11.5 11.5 0 0 0 12 23.5Z" />
        <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4V6.82H1.75a11.5 11.5 0 0 0 0 10.36L5.6 14.2Z" />
        <path fill="#EA4335" d="M12 5.08c1.68 0 3.19.58 4.38 1.72l3.28-3.28C17.7 1.63 15.1.5 12 .5A11.5 11.5 0 0 0 1.75 6.82L5.6 9.8c.9-2.71 3.42-4.72 6.4-4.72Z" />
      </svg>
    )
  }
  if (anbieter === 'apple') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={klasse} aria-hidden>
        <path d="M16.36 12.72c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3-.79-1.55.02-2.98.9-3.77 2.28-1.6 2.79-.41 6.92 1.15 9.18.76 1.11 1.67 2.35 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 3 .72 1.24-.02 2.02-1.12 2.78-2.24.87-1.28 1.23-2.53 1.25-2.6-.03-.01-2.4-.92-2.4-3.68ZM14.1 5.9c.63-.77 1.06-1.83.94-2.9-.91.04-2.01.61-2.67 1.37-.59.68-1.1 1.77-.96 2.81 1.01.08 2.05-.51 2.69-1.28Z" />
      </svg>
    )
  }
  if (anbieter === 'github') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={klasse} aria-hidden>
        <path d="M12 .5C5.73.5.9 5.34.9 11.6c0 4.9 3.17 9.06 7.57 10.53.55.1.75-.24.75-.53l-.01-1.87c-3.08.67-3.73-1.48-3.73-1.48-.5-1.29-1.23-1.63-1.23-1.63-1.01-.69.08-.67.08-.67 1.11.08 1.7 1.14 1.7 1.14.99 1.7 2.6 1.21 3.23.92.1-.72.39-1.21.7-1.49-2.46-.28-5.05-1.23-5.05-5.48 0-1.21.43-2.2 1.14-2.98-.11-.28-.5-1.41.11-2.94 0 0 .93-.3 3.05 1.14a10.5 10.5 0 0 1 5.56 0c2.11-1.44 3.04-1.14 3.04-1.14.61 1.53.23 2.66.11 2.94.71.78 1.14 1.77 1.14 2.98 0 4.26-2.6 5.19-5.07 5.47.4.34.76 1.03.76 2.08l-.01 3.08c0 .3.2.64.76.53A11.11 11.11 0 0 0 23.1 11.6C23.1 5.34 18.27.5 12 .5Z" />
      </svg>
    )
  }
  return <KeyRound size={17} strokeWidth={2} className="shrink-0" aria-hidden />
}

/**
 * Benutzername mit Prüfung, während getippt wird.
 *
 * Zwei Stufen: Form und Länge beantwortet der Browser sofort, alles Weitere
 * (Sperrliste, Verfügbarkeit) die Datenbank — entprellt, damit nicht jeder
 * Tastenanschlag eine Abfrage auslöst. Die Sperrliste bleibt dort, wo sie
 * hingehört; sie im Bundle mitzuliefern hiesse, eine Sammlung von
 * Schimpfwörtern auszuliefern und zugleich zu verraten, was gerade noch
 * durchgeht.
 *
 * `onUrteil` meldet nach oben, ob abgeschickt werden darf.
 */
function Namensfeld({
  wert, onAendern, onUrteil, label = 'Benutzername', hinweis, autoFocus,
}: {
  wert: string
  onAendern: (w: string) => void
  onUrteil: (u: NamensUrteil | null) => void
  label?: string
  hinweis?: React.ReactNode
  autoFocus?: boolean
}) {
  const [urteil, setUrteil] = useState<NamensUrteil | null>(null)
  const [prueft, setPrueft] = useState(false)
  const laufendeAnfrage = useRef(0)

  useEffect(() => {
    const n = wert.trim()
    if (n.length === 0) { setUrteil(null); onUrteil(null); setPrueft(false); return }

    // Formfehler sofort zeigen — dafür braucht es kein Netz.
    const sofort = namensformPruefen(n)
    if (sofort) { setUrteil(sofort); onUrteil(sofort); setPrueft(false); return }

    setPrueft(true)
    const marke = ++laufendeAnfrage.current
    const t = setTimeout(async () => {
      const u = await namePruefen(n)
      // Eine langsame Antwort auf eine ältere Eingabe darf die neuere nicht
      // überschreiben.
      if (marke !== laufendeAnfrage.current) return
      setUrteil(u); onUrteil(u); setPrueft(false)
    }, 400)
    return () => clearTimeout(t)
  }, [wert, onUrteil])

  const zustand = urteil?.ok ? 'ok' : urteil ? 'fehler' : null

  return (
    <div>
      <Label className="mb-1.5">{label}</Label>
      <div className="relative">
        <AtSign
          size={15} strokeWidth={2} aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
        />
        <Eingabe
          value={wert}
          onChange={(e) => onAendern(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={NAME_MAX}
          required
          autoFocus={autoFocus}
          aria-invalid={zustand === 'fehler'}
          placeholder="z.B. bergziege"
          className={`pl-9 pr-9 ${
            zustand === 'ok' ? 'border-erlaubt-500/50'
            : zustand === 'fehler' ? 'border-verboten-500/50'
            : ''}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {prueft && <Loader2 size={15} className="animate-spin text-ink-500" aria-hidden />}
          {!prueft && zustand === 'ok' && (
            <Check size={15} strokeWidth={2.5} className="text-erlaubt-400" aria-hidden />
          )}
          {!prueft && zustand === 'fehler' && (
            <X size={15} strokeWidth={2.5} className="text-verboten-400" aria-hidden />
          )}
        </span>
      </div>
      <p
        role="status"
        className={`mt-1.5 text-mikro normal-case leading-relaxed tracking-normal ${
          zustand === 'ok' ? 'text-erlaubt-400'
          : zustand === 'fehler' ? 'text-verboten-400'
          : 'text-ink-500'}`}
      >
        {prueft ? 'Wird geprüft …'
          : urteil ? (urteil.ok ? 'Der Name ist frei.' : urteil.meldung)
          : hinweis ?? `${NAME_MIN}–${NAME_MAX} Zeichen. Unter diesem Namen erscheinen deine geteilten Touren.`}
      </p>
    </div>
  )
}

function AnmeldeAnsicht({ anbieter, meldung }: { anbieter: string[]; meldung: React.ReactNode }) {
  const [modus, setModus] = useState<'anmelden' | 'registrieren'>('anmelden')
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [name, setName] = useState('')
  const [nameUrteil, setNameUrteil] = useState<NamensUrteil | null>(null)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  const registrieren = modus === 'registrieren'
  const zuKurz = registrieren && passwort.length > 0 && passwort.length < MIN_PASSWORT
  const staerke = passwortStaerke(passwort)
  // Ohne freigegebenen Namen kein Konto: er ist ab Migration 0017 die einzige
  // öffentliche Kennung, und ein Konto ohne ihn wäre wieder „ohne Urheber".
  const nameOk = !registrieren || nameUrteil?.ok === true
  // In einem Callback, damit das Namensfeld nicht bei jeder Neuzeichnung neu prüft.
  const urteilUebernehmen = useCallback((u: NamensUrteil | null) => setNameUrteil(u), [])

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zuKurz || !nameOk) return
    setBusy(true); setFehler(null); setHinweis(null)
    try {
      if (registrieren) {
        const { bestaetigungNoetig } = await signUpWithPassword(email.trim(), passwort, name.trim())
        setHinweis(bestaetigungNoetig
          ? 'Fast fertig — bestätige den Link in deiner E-Mail, dann kannst du dich anmelden.'
          : 'Konto angelegt.')
        setPasswort('')
      } else {
        await signInWithPassword(email.trim(), passwort)
      }
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const magicLink = async () => {
    if (!email.trim()) { setFehler('Bitte zuerst deine E-Mail-Adresse eintragen.'); return }
    setBusy(true); setFehler(null); setHinweis(null)
    try {
      await signInWithEmail(email.trim())
      setHinweis('Anmeldelink verschickt. Öffne ihn auf diesem Gerät.')
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const zuruecksetzen = async () => {
    if (!email.trim()) { setFehler('Bitte zuerst deine E-Mail-Adresse eintragen.'); return }
    setBusy(true); setFehler(null); setHinweis(null)
    try {
      await passwortZuruecksetzen(email.trim())
      setHinweis('Link zum Neusetzen des Passworts verschickt.')
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 pb-20 sm:px-6">
      <header className="mb-7 text-center">
        <Zeltmarke />
        <h1 className="mt-4 text-display font-semibold text-ink-50">
          {registrieren ? 'Konto anlegen' : 'Willkommen zurück'}
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-fliess leading-relaxed text-ink-400">
          {registrieren
            ? 'Damit deine Routen, Touren und Favoriten auf jedem Gerät wieder da sind.'
            : 'Melde dich an, um deine gespeicherten Touren wiederzufinden.'}
        </p>
      </header>

      <Card className="space-y-4 p-5 shadow-[var(--shadow-3)] sm:p-6">
        {meldung}

        <Segmente
          ariaLabel="Anmelden oder registrieren"
          wert={modus}
          onWaehlen={(m) => { setModus(m); setFehler(null); setHinweis(null); setNameUrteil(null) }}
          className="w-full [&>button]:flex-1"
          optionen={[
            { wert: 'anmelden' as const, label: 'Anmelden' },
            { wert: 'registrieren' as const, label: 'Registrieren' },
          ]}
        />

        {anbieter.length > 0 && (
          <>
            <div className="space-y-2">
              {anbieter.map((a) => (
                <Button
                  key={a}
                  variante="sekundaer"
                  groesse="gross"
                  breit
                  onClick={() => signInWithProvider(a).catch((e: Error) => setFehler(e.message))}
                >
                  <AnbieterZeichen anbieter={a} />
                  Weiter mit {ANBIETER_NAMEN[a] ?? a}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-mikro uppercase text-ink-600">
              <span className="h-px flex-1 bg-kante" />oder mit E-Mail<span className="h-px flex-1 bg-kante" />
            </div>
          </>
        )}

        <form onSubmit={absenden} className="space-y-3.5">
          {registrieren && (
            <Namensfeld wert={name} onAendern={setName} onUrteil={urteilUebernehmen} />
          )}

          <div>
            <Label className="mb-1.5">E-Mail</Label>
            <Eingabe
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" placeholder="du@beispiel.de"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <Label>Passwort</Label>
              {registrieren && passwort.length > 0 && (
                <Stufen stufe={staerke.stufe} von={3} label={staerke.label} />
              )}
            </div>
            <Passwortfeld
              wert={passwort}
              onAendern={setPasswort}
              autoComplete={registrieren ? 'new-password' : 'current-password'}
              minLength={registrieren ? MIN_PASSWORT : undefined}
              required
            />
            {registrieren && (
              <p className={`mt-1.5 text-mikro normal-case tracking-normal ${zuKurz ? 'text-geduldet-400' : 'text-ink-500'}`}>
                Mindestens {MIN_PASSWORT} Zeichen.
              </p>
            )}
          </div>

          <Button type="submit" variante="primaer" groesse="gross" breit disabled={busy || zuKurz || !nameOk}>
            {busy ? 'Moment …' : registrieren ? 'Konto anlegen' : 'Anmelden'}
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-klein">
          <button onClick={magicLink} disabled={busy}
                  className="inline-flex items-center gap-1.5 text-gletscher-400 underline underline-offset-2 hover:text-gletscher-300 disabled:opacity-50">
            <Mail size={13} strokeWidth={2} aria-hidden />
            Stattdessen Link per E-Mail
          </button>
          {!registrieren && (
            <button onClick={zuruecksetzen} disabled={busy}
                    className="text-ink-400 underline underline-offset-2 hover:text-ink-200 disabled:opacity-50">
              Passwort vergessen
            </button>
          )}
        </div>

        {hinweis && <Hinweis ton="erfolg" icon={Mail}>{hinweis}</Hinweis>}
        {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}
      </Card>

      {/*
        Die drei Zusagen darunter statt als Textblock: wer hier zögert, zögert
        wegen genau dieser Fragen — brauche ich das überhaupt, was passiert mit
        meinen Daten, wo liegen sie.
      */}
      <ul className="mt-6 space-y-2.5">
        <Zusage icon={MapIcon}>
          Karte, Routenplanung und Auswertung funktionieren ohne Konto. Es braucht
          eines nur zum Speichern, Teilen und Merken.
        </Zusage>
        <Zusage icon={ShieldCheck}>
          Gespeichert wird nur, was du selbst anlegst — kein Tracking, keine Weitergabe.
        </Zusage>
        <Zusage icon={Lock}>
          Die Daten liegen in der EU-Region des Supabase-Projekts.
        </Zusage>
      </ul>
    </div>
  )
}

function Zusage({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-klein leading-relaxed text-ink-500">
      <Icon size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-600" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

/* ---------------------------------------------------------------- */
/* Angemeldet                                                         */
/* ---------------------------------------------------------------- */

/** Initialen aus Anzeigename oder E-Mail — höchstens zwei Buchstaben. */
function initialen(name: string | null, email: string | undefined): string {
  const quelle = (name?.trim() || email?.split('@')[0] || '?')
  const teile = quelle.split(/[\s._-]+/).filter(Boolean)
  return (teile.length > 1
    ? teile[0][0] + teile[1][0]
    : quelle.slice(0, 2)
  ).toUpperCase()
}

function AngemeldeteAnsicht({
  session, onZuTouren, meldung,
}: { session: Session; onZuTouren: () => void; meldung: React.ReactNode }) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [name, setName] = useState('')
  const [nameStand, setNameStand] = useState<'idle' | 'busy' | 'ok'>('idle')
  const [nameUrteil, setNameUrteil] = useState<NamensUrteil | null>(null)
  const urteilUebernehmen = useCallback((u: NamensUrteil | null) => setNameUrteil(u), [])
  const [neuesPasswort, setNeuesPasswort] = useState('')
  const [pwStand, setPwStand] = useState<'idle' | 'busy' | 'ok'>('idle')
  const [loeschOffen, setLoeschOffen] = useState(false)
  const [loeschBestaetigung, setLoeschBestaetigung] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    ladeProfil().then((p) => { setProfil(p); setName(p?.anzeigename ?? '') }).catch(() => {})
  }, [session])

  const nameSpeichern = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameStand('busy'); setFehler(null)
    try {
      await speichereAnzeigename(name)
      setNameStand('ok')
    } catch (err) { setFehler((err as Error).message); setNameStand('idle') }
  }

  const passwortSetzen = async (e: React.FormEvent) => {
    e.preventDefault()
    if (neuesPasswort.length < MIN_PASSWORT) return
    setPwStand('busy'); setFehler(null)
    try {
      await passwortAendern(neuesPasswort)
      setPwStand('ok'); setNeuesPasswort('')
    } catch (err) { setFehler((err as Error).message); setPwStand('idle') }
  }

  const loeschen = async () => {
    setFehler(null)
    try { await kontoLoeschen() } catch (err) { setFehler((err as Error).message) }
  }

  const bezahlt = profil?.subscription_status === 'paid'
  // Umbenennen nur, wenn der Name geprüft *und* wirklich ein anderer ist —
  // sonst schickt der Knopf eine Änderung, die keine ist.
  const nameAenderbar = nameUrteil?.ok === true && name.trim() !== (profil?.anzeigename ?? '')
  const provider = session.user.app_metadata?.provider ?? ''
  const providerName = provider === 'email' ? 'E-Mail' : ANBIETER_NAMEN[provider] ?? provider
  const seit = session.user.created_at
    ? new Date(session.user.created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
    : null
  const staerke = passwortStaerke(neuesPasswort)

  return (
    <Seite
      titel="Konto"
      beschreibung="Anmeldung, Anzeigename und was mit deinen Daten passiert."
      aktion={<Button variante="sekundaer" icon={LogOut} onClick={signOut}>Abmelden</Button>}
    >
      {meldung}

      {/* ---- Wer bin ich hier, und wo geht es weiter ---- */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span
            aria-hidden
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gletscher-500/30 bg-gletscher-500/12 text-ueberschrift font-semibold text-gletscher-200"
          >
            {initialen(profil?.anzeigename ?? null, session.user.email)}
          </span>
          {/* `basis-48`: unterschreitet der Platz daneben diese Breite, rutscht
              die Plakette in die nächste Zeile, statt die Adresse zu quetschen. */}
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate text-ueberschrift font-semibold text-ink-50">
              {profil?.anzeigename?.trim() || session.user.email}
            </p>
            {/* Nicht abgeschnitten, sondern umbrechend: auf dem Telefon ist
                „über E-Mail · dabe…" keine Auskunft mehr. */}
            <p className="text-klein leading-relaxed text-ink-500">
              {profil?.anzeigename?.trim() && <>{session.user.email} · </>}
              über {providerName}
              {seit && <> · dabei seit {seit}</>}
            </p>
          </div>
          <Badge ton={bezahlt ? 'akzent' : 'neutral'} icon={bezahlt ? BadgeCheck : undefined}>
            {bezahlt ? 'Plus' : 'Kostenlos'}
          </Badge>
        </div>

        {/*
          Der einzige Weg von hier zurück in den Inhalt. Als volle Zeile statt
          als Knopf im Fliesstext, damit er auf dem Telefon mit dem Daumen
          sicher zu treffen ist.
        */}
        <button
          onClick={onZuTouren}
          className="flex w-full items-center gap-3 border-t border-kante px-5 py-3.5 text-left transition-colors duration-[160ms] hover:bg-flaeche-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-fliess font-medium text-ink-100">Zu deinen Touren</span>
            <span className="block text-klein text-ink-500">Gespeicherte Routen, Touren und Favoriten</span>
          </span>
          <ChevronRight size={17} strokeWidth={2} className="shrink-0 text-ink-500" aria-hidden />
        </button>
      </Card>

      {/* ---- Benutzername ---- */}
      <Feldkarte
        icon={UserRound}
        titel="Benutzername"
        beschreibung="Dein Name in der Community: er steht an jeder Tour, die du teilst, und an jedem Kommentar. Deine E-Mail-Adresse wird nie veröffentlicht."
      >
        <form onSubmit={nameSpeichern} className="space-y-3">
          <Namensfeld
            wert={name}
            onAendern={(w) => { setName(w); setNameStand('idle') }}
            onUrteil={urteilUebernehmen}
            label="Name"
            hinweis={`${NAME_MIN}–${NAME_MAX} Zeichen. Eine Umbenennung wirkt sofort auf alle deine geteilten Touren.`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variante="sekundaer" groesse="gross"
                    disabled={nameStand === 'busy' || !nameAenderbar}>
              {nameStand === 'busy' ? 'Speichere …' : 'Umbenennen'}
            </Button>
            {nameStand === 'ok' && (
              <p className="flex items-center gap-1.5 text-klein text-erlaubt-400">
                <Check size={13} strokeWidth={2.5} aria-hidden />Gespeichert.
              </p>
            )}
          </div>
        </form>
      </Feldkarte>

      {/* ---- Abo (Platzhalter) ---- */}
      <Feldkarte
        icon={Sparkles}
        titel="Abo"
        beschreibung={bezahlt
          ? profil?.abo_bis
            ? `CampBuddy Plus, läuft bis ${new Date(profil.abo_bis).toLocaleDateString('de-DE')}.`
            : 'CampBuddy Plus ist aktiv.'
          : 'Du nutzt die kostenlose Fassung — alle Grundfunktionen ohne Kosten.'}
        beiwerk={
          <Button variante="sekundaer" groesse="klein" disabled title="Noch nicht verfügbar">
            Bald verfügbar
          </Button>
        }
      >
        <ul className="space-y-1.5 rounded-mittel bg-flaeche-1 p-3.5">
          {['Weitere Regionen', 'Offline-Karten', 'Unbegrenzt gespeicherte Touren'].map((z) => (
            <li key={z} className="flex items-center gap-2.5 text-klein text-ink-300">
              <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-ink-600" />
              {z}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
          Geplant für später (Abschnitt 5 der Spezifikation). Die Grundkarte für die
          Basis-Region bleibt kostenlos. Es ist noch nichts buchbar und nichts abgerechnet.
        </p>
      </Feldkarte>

      {/* ---- Sicherheit ---- */}
      <Feldkarte
        icon={KeyRound}
        titel={provider === 'email' ? 'Passwort ändern' : 'Passwort setzen'}
        beschreibung={provider === 'email'
          ? 'Das neue Passwort gilt sofort; angemeldet bleibst du auf diesem Gerät.'
          : `Du meldest dich über ${providerName} an. Ein Passwort ist zusätzlich möglich — dann geht beides.`}
      >
        <form onSubmit={passwortSetzen} className="space-y-2.5">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <Passwortfeld
                wert={neuesPasswort}
                onAendern={(w) => { setNeuesPasswort(w); setPwStand('idle') }}
                autoComplete="new-password"
                placeholder={`Neues Passwort (min. ${MIN_PASSWORT} Zeichen)`}
              />
            </div>
            <Button type="submit" variante="sekundaer" groesse="gross"
                    disabled={neuesPasswort.length < MIN_PASSWORT || pwStand === 'busy'}>
              {pwStand === 'busy' ? 'Setze …' : 'Ändern'}
            </Button>
          </div>
          {neuesPasswort.length > 0 && (
            <Stufen stufe={staerke.stufe} von={3} label={staerke.label} />
          )}
          {pwStand === 'ok' && (
            <p className="flex items-center gap-1.5 text-klein text-erlaubt-400">
              <Check size={13} strokeWidth={2.5} aria-hidden />Passwort geändert.
            </p>
          )}
        </form>
      </Feldkarte>

      {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}

      {/* ---- Konto löschen ----
        Zugeklappt, bis jemand es wirklich will. Ein Feld mit der Aufschrift
        „LÖSCHEN eintippen" dauerhaft neben den Einstellungen stehen zu lassen,
        macht die Seite unruhig und die Handlung beiläufiger, als sie ist.
      */}
      <Feldkarte
        icon={Trash2}
        ton="gefahr"
        titel="Konto löschen"
        beschreibung="Löscht dein Konto und alles daran: Profil, gespeicherte Routen und Touren, Favoriten. Veröffentlichte Routen verschwinden mit. Das lässt sich nicht rückgängig machen."
      >
        {loeschOffen ? (
          <div className="space-y-2.5">
            <label className="block">
              <Label className="mb-1.5 text-verboten-300">Zum Bestätigen LÖSCHEN eintippen</Label>
              <Eingabe
                value={loeschBestaetigung}
                onChange={(e) => setLoeschBestaetigung(e.target.value)}
                placeholder="LÖSCHEN"
                autoComplete="off"
                className="max-w-xs"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variante="gefahr" groesse="gross" icon={Trash2}
                onClick={loeschen}
                disabled={loeschBestaetigung.trim().toUpperCase() !== 'LÖSCHEN'}
              >
                Endgültig löschen
              </Button>
              <Button
                variante="geist" groesse="gross"
                onClick={() => { setLoeschOffen(false); setLoeschBestaetigung('') }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <Button variante="gefahr" onClick={() => setLoeschOffen(true)}>
            Konto löschen …
          </Button>
        )}
      </Feldkarte>
    </Seite>
  )
}
