/**
 * Kontobereich — Abschnitt 4.6 der Spezifikation.
 *
 * Drei Anmeldewege nebeneinander: Passwort, Magic Link und externe Anbieter.
 * Die Anbieter-Knöpfe erscheinen nur, wenn der Anbieter im Supabase-Projekt
 * wirklich eingerichtet ist — ein Knopf, der in eine Fehlerseite führt, ist
 * schlimmer als kein Knopf.
 *
 * Passwörter werden nirgends zwischengespeichert oder protokolliert; sie gehen
 * direkt an Supabase.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut, Mail, Trash2, X } from 'lucide-react'
import { Button, Eingabe, Feld, Hinweis, Segmente } from '../ui'
import { isSupabaseConfigured } from '../services/supabase'
import {
  kontoLoeschen, ladeProfil, passwortAendern, passwortZuruecksetzen, signInWithEmail,
  signInWithPassword, signInWithProvider, signOut, signUpWithPassword, speichereAnzeigename,
  verfuegbareAnbieter, type LinkErgebnis, type Profil,
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

// Zwölf, nicht acht. Acht Zeichen sind für einen Angreifer mit einer
// Grafikkarte keine Hürde mehr, und die Serverseite muss denselben Wert
// tragen (Supabase -> Authentication -> Policies), sonst prüft nur der
// Browser — und den umgeht, wer die API direkt anspricht.
const MIN_PASSWORT = 12

export function AccountPanel({ session, onZuTouren, linkErgebnis, onLinkErgebnisGelesen }: Props) {
  const [anbieter, setAnbieter] = useState<string[]>([])

  useEffect(() => {
    if (isSupabaseConfigured) verfuegbareAnbieter().then(setAnbieter)
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <Rahmen titel="Konto">
        <p className="rounded-mittel bg-flaeche-1 p-3 text-fliess leading-relaxed text-ink-400">
          Für dieses Projekt ist kein Backend hinterlegt, deshalb gibt es hier nichts
          anzumelden. Karte, Routenplanung und Auswertung funktionieren vollständig ohne Konto.
        </p>
      </Rahmen>
    )
  }

  const meldung = linkErgebnis && (
    <div
      className={`rounded-mittel p-3 text-fliess leading-relaxed ${
        linkErgebnis.art === 'fehler'
          ? 'bg-geduldet-500/10 text-geduldet-200'
          : 'bg-gletscher-500/10 text-gletscher-200'
      }`}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <p>{linkErgebnis.meldung}</p>
        <button onClick={onLinkErgebnisGelesen} aria-label="Hinweis schliessen"
                className="-mr-1 -mt-1 shrink-0 rounded-klein p-1 opacity-60 transition-opacity duration-[160ms] hover:opacity-100">
          <X size={14} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  )

  return session
    ? <AngemeldeteAnsicht session={session} onZuTouren={onZuTouren} meldung={meldung} />
    : <AnmeldeAnsicht anbieter={anbieter} meldung={meldung} />
}

/* ---------------------------------------------------------------- */
/* Nicht angemeldet                                                   */
/* ---------------------------------------------------------------- */

function AnmeldeAnsicht({ anbieter, meldung }: { anbieter: string[]; meldung: React.ReactNode }) {
  const [modus, setModus] = useState<'anmelden' | 'registrieren'>('anmelden')
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)

  const zuKurz = modus === 'registrieren' && passwort.length > 0 && passwort.length < MIN_PASSWORT

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zuKurz) return
    setBusy(true); setFehler(null); setHinweis(null)
    try {
      if (modus === 'registrieren') {
        const { bestaetigungNoetig } = await signUpWithPassword(email.trim(), passwort)
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
    <Rahmen titel={modus === 'anmelden' ? 'Anmelden' : 'Konto anlegen'}>
      {meldung}
      <Segmente
        ariaLabel="Anmelden oder registrieren"
        wert={modus}
        onWaehlen={(m) => { setModus(m); setFehler(null); setHinweis(null) }}
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
                Weiter mit {ANBIETER_NAMEN[a] ?? a}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-mikro uppercase text-ink-600">
            <span className="h-px flex-1 bg-flaeche-3" />oder<span className="h-px flex-1 bg-flaeche-3" />
          </div>
        </>
      )}

      <form onSubmit={absenden} className="space-y-3">
        <Feld label="E-Mail">
          <Eingabe
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" placeholder="du@beispiel.de"
            />
        </Feld>
        <Feld label="Passwort">
          <Eingabe
              type="password" required value={passwort} onChange={(e) => setPasswort(e.target.value)}
              autoComplete={modus === 'registrieren' ? 'new-password' : 'current-password'}
              minLength={modus === 'registrieren' ? MIN_PASSWORT : undefined}
            />
          {modus === 'registrieren' && (
            <p className={`mt-1 text-mikro ${zuKurz ? 'text-geduldet-300' : 'text-ink-500'}`}>
              Mindestens {MIN_PASSWORT} Zeichen.
            </p>
          )}
        </Feld>

        <Button type="submit" variante="primaer" groesse="gross" breit disabled={busy || zuKurz}>
          {busy ? 'Moment …' : modus === 'registrieren' ? 'Konto anlegen' : 'Anmelden'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-klein">
        <button onClick={magicLink} disabled={busy}
                className="text-gletscher-400 underline underline-offset-2 hover:text-gletscher-300 disabled:opacity-50">
          Stattdessen Link per E-Mail
        </button>
        {modus === 'anmelden' && (
          <button onClick={zuruecksetzen} disabled={busy}
                  className="text-ink-400 underline underline-offset-2 hover:text-ink-200 disabled:opacity-50">
            Passwort vergessen
          </button>
        )}
      </div>

      {hinweis && <Hinweis ton="erfolg" icon={Mail}>{hinweis}</Hinweis>}
      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}

      <p className="text-klein leading-relaxed text-ink-500">
        Ein Konto brauchst du nur zum Speichern, Teilen und Merken von Touren. Karte,
        Routenplanung und Auswertung funktionieren ohne. Gespeichert wird nur, was du selbst
        anlegst — kein Tracking, keine Weitergabe. Die Daten liegen in der EU-Region deines
        Supabase-Projekts.
      </p>
    </Rahmen>
  )
}

/* ---------------------------------------------------------------- */
/* Angemeldet                                                         */
/* ---------------------------------------------------------------- */

function AngemeldeteAnsicht({
  session, onZuTouren, meldung,
}: { session: Session; onZuTouren: () => void; meldung: React.ReactNode }) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [name, setName] = useState('')
  const [nameStand, setNameStand] = useState<'idle' | 'busy' | 'ok'>('idle')
  const [neuesPasswort, setNeuesPasswort] = useState('')
  const [pwStand, setPwStand] = useState<'idle' | 'busy' | 'ok'>('idle')
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

  return (
    <Rahmen titel="Konto">
      {meldung}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-mittel bg-flaeche-1 p-4">
        <div className="min-w-0">
          <p className="truncate text-fliess font-medium text-ink-50">{session.user.email}</p>
          <p className="text-mikro text-ink-500">
            Angemeldet über {session.user.app_metadata?.provider === 'email'
              ? 'E-Mail'
              : ANBIETER_NAMEN[session.user.app_metadata?.provider ?? ''] ?? session.user.app_metadata?.provider}
          </p>
        </div>
        <Button variante="sekundaer" icon={LogOut} onClick={signOut}>Abmelden</Button>
      </section>

      {/* ---- Anzeigename ---- */}
      <section>
        <h3 className="mb-1 text-fliess font-semibold text-ink-200">Anzeigename</h3>
        <p className="mb-2 text-klein leading-relaxed text-ink-500">
          Steht an Routen, die du veröffentlichst. Ohne ihn erscheinen geteilte Routen ohne
          Urheberangabe — deine E-Mail-Adresse wird nie veröffentlicht.
        </p>
        <form onSubmit={nameSpeichern} className="flex flex-wrap gap-2">
          <Eingabe
            value={name} onChange={(e) => { setName(e.target.value); setNameStand('idle') }}
            maxLength={40} placeholder="z.B. Jannis"
            className="min-w-0 flex-1"
          />
          <button type="submit" disabled={nameStand === 'busy'}
                  className="min-h-10 rounded-mittel bg-flaeche-1 px-4 text-fliess text-ink-200 ring-1 ring-kante hover:bg-flaeche-3 disabled:opacity-50">
            {nameStand === 'busy' ? 'Speichere …' : 'Speichern'}
          </button>
          {nameStand === 'ok' && <p className="w-full text-klein text-gletscher-300">Gespeichert.</p>}
        </form>
      </section>

      {/* ---- Abo (Platzhalter) ---- */}
      <section>
        <h3 className="mb-1 text-fliess font-semibold text-ink-200">Abo</h3>
        <div className="rounded-mittel border border-kante p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-fliess font-medium text-ink-50">
                {bezahlt ? 'CampBuddy Plus' : 'Kostenlos'}
              </p>
              <p className="text-mikro text-ink-500">
                {bezahlt
                  ? profil?.abo_bis
                    ? `Läuft bis ${new Date(profil.abo_bis).toLocaleDateString('de-DE')}`
                    : 'Aktiv'
                  : 'Alle Grundfunktionen ohne Kosten'}
              </p>
            </div>
            <button
              disabled
              title="Noch nicht verfügbar"
              className="min-h-9 cursor-not-allowed rounded-mittel bg-flaeche-1 px-3 text-fliess text-ink-500 ring-1 ring-kante"
            >
              Bald verfügbar
            </button>
          </div>
          <p className="mt-3 border-t border-kante pt-2.5 text-mikro leading-relaxed text-ink-500">
            Geplant für später (Abschnitt 5 der Spezifikation): weitere Regionen, Offline-Karten
            und unbegrenzt gespeicherte Touren. Die Grundkarte für die Basis-Region bleibt
            kostenlos. Es ist noch nichts buchbar und nichts abgerechnet.
          </p>
        </div>
      </section>

      {/* ---- Sicherheit ---- */}
      <section>
        <h3 className="mb-1 text-fliess font-semibold text-ink-200">Passwort ändern</h3>
        <form onSubmit={passwortSetzen} className="flex flex-wrap gap-2">
          <Eingabe
            type="password" value={neuesPasswort} autoComplete="new-password"
            onChange={(e) => { setNeuesPasswort(e.target.value); setPwStand('idle') }}
            placeholder={`Neues Passwort (min. ${MIN_PASSWORT} Zeichen)`}
            className="min-w-0 flex-1"
          />
          <button type="submit" disabled={neuesPasswort.length < MIN_PASSWORT || pwStand === 'busy'}
                  className="min-h-10 rounded-mittel bg-flaeche-1 px-4 text-fliess text-ink-200 ring-1 ring-kante hover:bg-flaeche-3 disabled:opacity-40">
            {pwStand === 'busy' ? 'Setze …' : 'Ändern'}
          </button>
          {pwStand === 'ok' && <p className="w-full text-klein text-gletscher-300">Passwort geändert.</p>}
        </form>
      </section>

      <section>
        <button onClick={onZuTouren}
                className="min-h-10 rounded-mittel bg-gletscher-500/15 px-4 text-fliess text-gletscher-200 ring-1 ring-gletscher-500/30 hover:bg-gletscher-500/25">
          Zu deinen Touren
        </button>
      </section>

      {/* ---- Konto löschen ---- */}
      <section className="rounded-mittel border border-verboten-500/25 bg-verboten-500/5 p-4">
        <h3 className="text-fliess font-semibold text-verboten-200">Konto löschen</h3>
        <p className="mt-1 text-klein leading-relaxed text-ink-400">
          Löscht dein Konto und alles daran: Profil, gespeicherte Routen und Touren, Favoriten.
          Veröffentlichte Routen verschwinden mit. Das lässt sich nicht rückgängig machen.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Eingabe
            value={loeschBestaetigung}
            onChange={(e) => setLoeschBestaetigung(e.target.value)}
            placeholder="LÖSCHEN eintippen"
            aria-label="Löschung bestätigen"
            className="min-w-0 flex-1"
          />
          <Button
            variante="gefahr" groesse="gross" icon={Trash2}
            onClick={loeschen}
            disabled={loeschBestaetigung.trim().toUpperCase() !== 'LÖSCHEN'}
          >
            Endgültig löschen
          </Button>
        </div>
      </section>

      {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
    </Rahmen>
  )
}

/* ---------------------------------------------------------------- */

function Rahmen({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 py-8 pb-20 sm:px-6">
      <h1 className="text-display font-semibold text-ink-50">{titel}</h1>
      {children}
    </div>
  )
}
