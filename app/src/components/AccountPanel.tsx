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

const MIN_PASSWORT = 8

export function AccountPanel({ session, onZuTouren, linkErgebnis, onLinkErgebnisGelesen }: Props) {
  const [anbieter, setAnbieter] = useState<string[]>([])

  useEffect(() => {
    if (isSupabaseConfigured) verfuegbareAnbieter().then(setAnbieter)
  }, [])

  if (!isSupabaseConfigured) {
    return (
      <Rahmen titel="Konto">
        <p className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-slate-400">
          Für dieses Projekt ist kein Backend hinterlegt, deshalb gibt es hier nichts
          anzumelden. Karte, Routenplanung und Auswertung funktionieren vollständig ohne Konto.
        </p>
      </Rahmen>
    )
  }

  const meldung = linkErgebnis && (
    <div
      className={`rounded-lg p-3 text-sm leading-relaxed ${
        linkErgebnis.art === 'fehler'
          ? 'bg-amber-500/10 text-amber-200'
          : 'bg-emerald-500/10 text-emerald-200'
      }`}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <p>{linkErgebnis.meldung}</p>
        <button onClick={onLinkErgebnisGelesen} aria-label="Hinweis schliessen"
                className="-mr-1 -mt-1 shrink-0 rounded p-1 opacity-60 hover:opacity-100">✕</button>
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
      <div className="flex gap-1 rounded-lg bg-white/5 p-1">
        {([['anmelden', 'Anmelden'], ['registrieren', 'Registrieren']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setModus(key); setFehler(null); setHinweis(null) }}
            aria-pressed={modus === key}
            className={`min-h-9 flex-1 rounded-md px-3 text-sm transition ${
              modus === key ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {anbieter.length > 0 && (
        <>
          <div className="space-y-2">
            {anbieter.map((a) => (
              <button
                key={a}
                onClick={() => signInWithProvider(a).catch((e: Error) => setFehler(e.message))}
                className="min-h-11 w-full rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-medium text-slate-100 hover:bg-white/10"
              >
                Weiter mit {ANBIETER_NAMEN[a] ?? a}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-600">
            <span className="h-px flex-1 bg-white/10" />oder<span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}

      <form onSubmit={absenden} className="space-y-3">
        <Feld label="E-Mail">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" placeholder="du@beispiel.de"
            className="min-h-11 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
          />
        </Feld>
        <Feld label="Passwort">
          <input
            type="password" required value={passwort} onChange={(e) => setPasswort(e.target.value)}
            autoComplete={modus === 'registrieren' ? 'new-password' : 'current-password'}
            minLength={modus === 'registrieren' ? MIN_PASSWORT : undefined}
            className="min-h-11 w-full rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
          />
          {modus === 'registrieren' && (
            <p className={`mt-1 text-[11px] ${zuKurz ? 'text-amber-300' : 'text-slate-500'}`}>
              Mindestens {MIN_PASSWORT} Zeichen.
            </p>
          )}
        </Feld>

        <button type="submit" disabled={busy || zuKurz}
                className="min-h-11 w-full rounded-lg bg-emerald-500/20 px-4 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50">
          {busy ? 'Moment …' : modus === 'registrieren' ? 'Konto anlegen' : 'Anmelden'}
        </button>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <button onClick={magicLink} disabled={busy}
                className="text-sky-400 underline underline-offset-2 hover:text-sky-300 disabled:opacity-50">
          Stattdessen Link per E-Mail
        </button>
        {modus === 'anmelden' && (
          <button onClick={zuruecksetzen} disabled={busy}
                  className="text-slate-400 underline underline-offset-2 hover:text-slate-200 disabled:opacity-50">
            Passwort vergessen
          </button>
        )}
      </div>

      {hinweis && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">{hinweis}</p>}
      {fehler && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{fehler}</p>}

      <p className="text-xs leading-relaxed text-slate-500">
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
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/5 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{session.user.email}</p>
          <p className="text-[11px] text-slate-500">
            Angemeldet über {session.user.app_metadata?.provider === 'email'
              ? 'E-Mail'
              : ANBIETER_NAMEN[session.user.app_metadata?.provider ?? ''] ?? session.user.app_metadata?.provider}
          </p>
        </div>
        <button onClick={signOut}
                className="min-h-9 rounded-lg bg-white/5 px-3 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10">
          Abmelden
        </button>
      </section>

      {/* ---- Anzeigename ---- */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Anzeigename</h3>
        <p className="mb-2 text-xs leading-relaxed text-slate-500">
          Steht an Routen, die du veröffentlichst. Ohne ihn erscheinen geteilte Routen ohne
          Urheberangabe — deine E-Mail-Adresse wird nie veröffentlicht.
        </p>
        <form onSubmit={nameSpeichern} className="flex flex-wrap gap-2">
          <input
            value={name} onChange={(e) => { setName(e.target.value); setNameStand('idle') }}
            maxLength={40} placeholder="z.B. Jannis"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
          />
          <button type="submit" disabled={nameStand === 'busy'}
                  className="min-h-10 rounded-lg bg-white/5 px-4 text-sm text-slate-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50">
            {nameStand === 'busy' ? 'Speichere …' : 'Speichern'}
          </button>
          {nameStand === 'ok' && <p className="w-full text-xs text-emerald-300">Gespeichert.</p>}
        </form>
      </section>

      {/* ---- Abo (Platzhalter) ---- */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Abo</h3>
        <div className="rounded-lg border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-100">
                {bezahlt ? 'CampBuddy Plus' : 'Kostenlos'}
              </p>
              <p className="text-[11px] text-slate-500">
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
              className="min-h-9 cursor-not-allowed rounded-lg bg-white/5 px-3 text-sm text-slate-500 ring-1 ring-white/10"
            >
              Bald verfügbar
            </button>
          </div>
          <p className="mt-3 border-t border-white/10 pt-2.5 text-[11px] leading-relaxed text-slate-500">
            Geplant für später (Abschnitt 5 der Spezifikation): weitere Regionen, Offline-Karten
            und unbegrenzt gespeicherte Touren. Die Grundkarte für die Basis-Region bleibt
            kostenlos. Es ist noch nichts buchbar und nichts abgerechnet.
          </p>
        </div>
      </section>

      {/* ---- Sicherheit ---- */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Passwort ändern</h3>
        <form onSubmit={passwortSetzen} className="flex flex-wrap gap-2">
          <input
            type="password" value={neuesPasswort} autoComplete="new-password"
            onChange={(e) => { setNeuesPasswort(e.target.value); setPwStand('idle') }}
            placeholder={`Neues Passwort (min. ${MIN_PASSWORT} Zeichen)`}
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
          />
          <button type="submit" disabled={neuesPasswort.length < MIN_PASSWORT || pwStand === 'busy'}
                  className="min-h-10 rounded-lg bg-white/5 px-4 text-sm text-slate-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40">
            {pwStand === 'busy' ? 'Setze …' : 'Ändern'}
          </button>
          {pwStand === 'ok' && <p className="w-full text-xs text-emerald-300">Passwort geändert.</p>}
        </form>
      </section>

      <section>
        <button onClick={onZuTouren}
                className="min-h-10 rounded-lg bg-emerald-500/15 px-4 text-sm text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
          Zu deinen Touren
        </button>
      </section>

      {/* ---- Konto löschen ---- */}
      <section className="rounded-lg border border-red-500/25 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-200">Konto löschen</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Löscht dein Konto und alles daran: Profil, gespeicherte Routen und Touren, Favoriten.
          Veröffentlichte Routen verschwinden mit. Das lässt sich nicht rückgängig machen.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <input
            value={loeschBestaetigung}
            onChange={(e) => setLoeschBestaetigung(e.target.value)}
            placeholder="LÖSCHEN eintippen"
            aria-label="Löschung bestätigen"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
          />
          <button
            onClick={loeschen}
            disabled={loeschBestaetigung.trim().toUpperCase() !== 'LÖSCHEN'}
            className="min-h-10 rounded-lg bg-red-500/20 px-4 text-sm font-medium text-red-200 ring-1 ring-red-500/40 hover:bg-red-500/30 disabled:opacity-40"
          >
            Endgültig löschen
          </button>
        </div>
      </section>

      {fehler && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{fehler}</p>}
    </Rahmen>
  )
}

/* ---------------------------------------------------------------- */

function Rahmen({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-6 pb-16">
      <h2 className="text-lg font-semibold">{titel}</h2>
      {children}
    </div>
  )
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}
