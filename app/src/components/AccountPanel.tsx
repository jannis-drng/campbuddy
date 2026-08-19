/**
 * Konto-Ansicht [BALD] — Abschnitt 4.6.
 *
 * Bewusst minimal: Anmeldung per Magic Link, Übersicht des Gespeicherten,
 * Abmelden. Kein Passwortfeld, kein Registrierungsformular — wer eine
 * E-Mail-Adresse eingibt, bekommt einen Link, fertig.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, type StoredRoute, type StoredTrip } from '../services/supabase'
import { deleteRoute, deleteTrip, listRoutes, listTrips, signInWithEmail, signOut } from '../services/account'
import type { Position } from '../data/geo'

interface Props {
  session: Session | null
  onLoadRoute: (geometry: Position[], waypoints: Position[]) => void
}

export function AccountPanel({ session, onLoadRoute }: Props) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routes, setRoutes] = useState<StoredRoute[]>([])
  const [trips, setTrips] = useState<StoredTrip[]>([])

  useEffect(() => {
    if (!session) { setRoutes([]); setTrips([]); return }
    Promise.all([listRoutes(), listTrips()])
      .then(([r, t]) => { setRoutes(r); setTrips(t) })
      .catch((e: Error) => setError(e.message))
  }, [session])

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

  const removeRoute = async (id: string) => {
    await deleteRoute(id)
    setRoutes((r) => r.filter((x) => x.id !== id))
  }
  const removeTrip = async (id: string) => {
    await deleteTrip(id)
    setTrips((t) => t.filter((x) => x.id !== id))
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

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Gespeicherte Routen {routes.length > 0 && `(${routes.length})`}
        </h3>
        {routes.length === 0 ? (
          <p className="text-sm text-slate-400">
            Noch keine. In der Kartenansicht eine Route zeichnen und dort speichern.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
            {routes.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{r.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.region} · {new Date(r.created_at).toLocaleDateString('de-DE')} ·{' '}
                    {r.geometry.coordinates.length} Stützpunkte
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => onLoadRoute(r.geometry.coordinates, r.waypoints ?? [])}
                    className="min-h-9 rounded-lg bg-white/5 px-2.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Laden
                  </button>
                  <button onClick={() => removeRoute(r.id)} aria-label={`${r.name} löschen`}
                          className="min-h-9 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-white/10 hover:text-red-300">
                    Löschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Gespeicherte Touren {trips.length > 0 && `(${trips.length})`}
        </h3>
        {trips.length === 0 ? (
          <p className="text-sm text-slate-400">
            Noch keine. Unter „Tour planen" die Eckdaten setzen und dort speichern.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
            {trips.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{t.name}</p>
                  <p className="text-[11px] text-slate-500">
                    ab {new Date(t.start_date).toLocaleDateString('de-DE')} · {t.days} Tage ·{' '}
                    {t.persons} {t.persons === 1 ? 'Person' : 'Personen'} · {t.elevation} m
                  </p>
                </div>
                <button onClick={() => removeTrip(t.id)} aria-label={`${t.name} löschen`}
                        className="min-h-9 shrink-0 rounded-lg px-2.5 text-xs text-slate-500 hover:bg-white/10 hover:text-red-300">
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    </div>
  )
}
