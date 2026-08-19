/**
 * "Deine Touren" — alles Gespeicherte an einer Stelle (Abschnitt 4.6).
 *
 * Geplant wird ausschliesslich auf der Karte: dort entsteht die Route, und die
 * Auswertung dazu enthält Ausrüstung, Verpflegung und Wetter. Hier liegt nur,
 * was daraus gespeichert wurde.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Position } from '../data/geo'
import { lineLength } from '../data/geo'
import { isSupabaseConfigured, type StoredRoute, type StoredTrip } from '../services/supabase'
import {
  deleteRoute, deleteTrip, ladeProfil, listFavoriteRoutes, listRoutes, listTrips, removeFavorite,
  setRoutePublic,
} from '../services/account'

interface Props {
  session: Session | null
  onLoadRoute: (geometry: Position[], waypoints: Position[]) => void
  onAnmelden: () => void
  /** Führt zur Karte, wo Touren entstehen. */
  onZurKarte: () => void
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

export function MyToursPanel({ session, onLoadRoute, onAnmelden, onZurKarte }: Props) {
  const [routen, setRouten] = useState<StoredRoute[]>([])
  const [touren, setTouren] = useState<StoredTrip[]>([])
  const [favoriten, setFavoriten] = useState<StoredRoute[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [stand, setStand] = useState(0)
  const [anzeigename, setAnzeigename] = useState<string | null>(null)

  useEffect(() => {
    if (!session) { setAnzeigename(null); return }
    ladeProfil().then((p) => setAnzeigename(p?.anzeigename ?? null)).catch(() => {})
  }, [session])

  useEffect(() => {
    if (!session) { setRouten([]); setTouren([]); setFavoriten([]); return }
    Promise.all([listRoutes(), listTrips(), listFavoriteRoutes()])
      .then(([r, t, f]) => { setRouten(r); setTouren(t); setFavoriten(f) })
      .catch((e: Error) => setFehler(e.message))
  }, [session, stand])

  const veroeffentlichen = async (r: StoredRoute) => {
    try {
      // Beim Veröffentlichen den Anzeigenamen aus dem Profil mitgeben, damit
      // die Route nicht anonym in der Community steht.
      await setRoutePublic(r.id, !r.is_public, r.is_public ? undefined : anzeigename ?? undefined)
      setRouten((liste) => liste.map((x) => (x.id === r.id ? { ...x, is_public: !x.is_public } : x)))
    } catch (e) {
      setFehler((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 pb-16">
      <div>
        <h2 className="text-lg font-semibold">Deine Touren</h2>
        <p className="mt-0.5 text-sm text-slate-400">
          Gespeicherte Routen, Touren und Favoriten. Geplant wird auf der Karte.
        </p>
      </div>

      {fehler && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{fehler}</p>}

      {!session && isSupabaseConfigured && (
        <div className="rounded-lg bg-white/5 p-4">
          <p className="text-sm leading-relaxed text-slate-300">
            Zum Speichern von Routen und Touren ist eine Anmeldung nötig. Karte,
            Routenplanung und Auswertung funktionieren ohne.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onAnmelden}
              className="min-h-9 rounded-lg bg-emerald-500/15 px-3 text-sm text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              Anmelden
            </button>
            <button
              onClick={onZurKarte}
              className="min-h-9 rounded-lg bg-white/5 px-3 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
            >
              Zur Karte
            </button>
          </div>
        </div>
      )}

      {session && (
        <>
          <Abschnitt titel="Gespeicherte Routen" anzahl={routen.length}
                     leer="Noch keine. Zeichne auf der Karte eine Route und speichere sie dort.">
            {routen.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-100">{r.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.region} · {formatKm(lineLength(r.geometry.coordinates as Position[]))} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('de-DE')}
                    {r.is_public && ' · veröffentlicht'}
                  </p>
                </div>
                <button
                  onClick={() => onLoadRoute(r.geometry.coordinates as Position[], (r.waypoints ?? []) as Position[])}
                  className="min-h-9 rounded-lg bg-white/5 px-2.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                >
                  Auf Karte
                </button>
                <button
                  onClick={() => veroeffentlichen(r)}
                  aria-pressed={r.is_public}
                  title={r.is_public
                    ? 'Route ist öffentlich sichtbar — Klick nimmt sie zurück'
                    : 'Route für alle sichtbar machen'}
                  className={`min-h-9 rounded-lg px-2.5 text-xs ring-1 ${
                    r.is_public
                      ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/40'
                      : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10'
                  }`}
                >
                  {r.is_public ? 'Öffentlich' : 'Teilen'}
                </button>
                <button
                  onClick={async () => { await deleteRoute(r.id); setStand((n) => n + 1) }}
                  aria-label={`${r.name} löschen`}
                  className="min-h-9 rounded-lg px-2 text-xs text-slate-500 hover:bg-white/10 hover:text-red-300"
                >
                  Löschen
                </button>
              </li>
            ))}
          </Abschnitt>

          {routen.some((r) => r.is_public) && !anzeigename && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200/90">
              Du hast Routen veröffentlicht, aber keinen Anzeigenamen gesetzt — sie erscheinen
              ohne Urheberangabe. Im Kontobereich lässt sich einer eintragen.
            </p>
          )}

          <Abschnitt titel="Favoriten aus der Community" anzahl={favoriten.length}
                     leer="Noch keine. Im Community-Bereich lassen sich Routen mit ☆ merken.">
            {favoriten.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-100">{r.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.autor ? `von ${r.autor} · ` : ''}
                    {formatKm(lineLength(r.geometry.coordinates as Position[]))}
                  </p>
                </div>
                <button
                  onClick={() => onLoadRoute(r.geometry.coordinates as Position[], (r.waypoints ?? []) as Position[])}
                  className="min-h-9 rounded-lg bg-white/5 px-2.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                >
                  Auf Karte
                </button>
                <button
                  onClick={async () => { await removeFavorite(r.id); setStand((n) => n + 1) }}
                  aria-label={`${r.name} aus Favoriten entfernen`}
                  className="min-h-9 rounded-lg px-2 text-xs text-slate-500 hover:bg-white/10 hover:text-red-300"
                >
                  Entfernen
                </button>
              </li>
            ))}
          </Abschnitt>

          <Abschnitt titel="Gespeicherte Touren" anzahl={touren.length}
                     leer="Noch keine. Unten die Eckdaten setzen und speichern.">
            {touren.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{t.name}</p>
                  <p className="text-[11px] text-slate-500">
                    ab {new Date(t.start_date).toLocaleDateString('de-DE')} · {t.days} Tage ·{' '}
                    {t.persons} {t.persons === 1 ? 'Person' : 'Personen'} · {t.elevation} m
                  </p>
                </div>
                <button
                  onClick={async () => { await deleteTrip(t.id); setStand((n) => n + 1) }}
                  aria-label={`${t.name} löschen`}
                  className="min-h-9 shrink-0 rounded-lg px-2 text-xs text-slate-500 hover:bg-white/10 hover:text-red-300"
                >
                  Löschen
                </button>
              </li>
            ))}
          </Abschnitt>
        </>
      )}

      {session && (
        <p className="border-t border-white/10 pt-5 text-xs leading-relaxed text-slate-500">
          Neue Touren entstehen auf der Karte: Route zeichnen, „Tour auswerten" öffnen und
          dort speichern. Die Auswertung enthält auch Ausrüstung, Verpflegung und Wetter.{' '}
          <button onClick={onZurKarte} className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
            Zur Karte
          </button>
        </p>
      )}
    </div>
  )
}

function Abschnitt({
  titel, anzahl, leer, children,
}: {
  titel: string
  anzahl: number
  leer: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-200">
        {titel} {anzahl > 0 && <span className="text-slate-500">({anzahl})</span>}
      </h3>
      {anzahl === 0 ? (
        <p className="text-sm text-slate-400">{leer}</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">{children}</ul>
      )}
    </section>
  )
}
