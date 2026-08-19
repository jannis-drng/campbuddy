/**
 * Konto-Ansicht [BALD] — Abschnitt 4.6.
 *
 * Bewusst minimal: Anmeldung per Magic Link, Übersicht des Gespeicherten,
 * Abmelden. Kein Passwortfeld, kein Registrierungsformular — wer eine
 * E-Mail-Adresse eingibt, bekommt einen Link, fertig.
 */
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../services/supabase'
import { signInWithEmail, signOut } from '../services/account'

interface Props {
  session: Session | null
  /** Nach dem Anmelden dorthin, wo das Gespeicherte liegt. */
  onZuTouren: () => void
}

export function AccountPanel({ session, onZuTouren }: Props) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h2 className="text-lg font-semibold">Konto</h2>
        <p className="mt-2 rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-slate-400">
          Für dieses Projekt ist noch kein Backend hinterlegt, deshalb gibt es hier nichts
          anzumelden. Karte, Routenplanung und Ausrüstungsgenerator funktionieren vollständig
          ohne Konto — ein Login wird nur gebraucht, um Routen und Touren zu speichern.
        </p>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await signInWithEmail(email.trim())
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h2 className="text-lg font-semibold">Anmelden</h2>
        <p className="mt-1 text-sm text-slate-400">
          Nur nötig, um Routen und Touren zu speichern. Du bekommst einen Anmeldelink per
          E-Mail — es gibt kein Passwort.
        </p>

        {sent ? (
          <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">
            Link verschickt. Schau in dein Postfach und öffne ihn auf diesem Gerät.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="du@beispiel.de" autoComplete="email"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
            />
            <button type="submit" disabled={busy}
                    className="min-h-10 rounded-lg bg-emerald-500/20 px-4 text-sm font-medium text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50">
              {busy ? 'Sende …' : 'Link schicken'}
            </button>
          </form>
        )}

        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Gespeichert wird nur, was du selbst anlegst: deine E-Mail-Adresse, deine Routen und
          deine Tourdaten. Kein Tracking, keine Weitergabe. Die Daten liegen in der EU-Region
          deines Supabase-Projekts.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Konto</h2>
          <p className="truncate text-sm text-slate-400">{session.user.email}</p>
        </div>
        <button onClick={signOut}
                className="min-h-9 rounded-lg bg-white/5 px-3 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10">
          Abmelden
        </button>
      </section>

      <section className="rounded-lg bg-white/5 p-4">
        <p className="text-sm leading-relaxed text-slate-300">
          Deine gespeicherten Routen, Touren und Favoriten liegen unter „Deine Touren".
        </p>
        <button
          onClick={onZuTouren}
          className="mt-2 min-h-9 rounded-lg bg-emerald-500/15 px-3 text-sm text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
        >
          Zu deinen Touren
        </button>
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        Gespeichert wird nur, was du selbst anlegst. Kein Tracking, keine Weitergabe.
        Die Daten liegen in der EU-Region deines Supabase-Projekts.
      </p>

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    </div>
  )
}
