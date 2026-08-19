/**
 * Community-Routen [SPÄTER, vorgezogen] — Abschnitt 4.6 der Spezifikation.
 *
 * Zeigt Routen, die andere ausdrücklich veröffentlicht haben. Lesen geht ohne
 * Konto; favorisieren und selbst veröffentlichen brauchen eines.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Position } from '../data/geo'
import { lineLength } from '../data/geo'
import { isSupabaseConfigured, type StoredRoute } from '../services/supabase'
import { addFavorite, listFavoriteIds, listPublicRoutes, removeFavorite } from '../services/account'

interface Props {
  session: Session | null
  onLoadRoute: (geometry: Position[], waypoints: Position[]) => void
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

export function CommunityPanel({ session, onLoadRoute }: Props) {
  const [routen, setRouten] = useState<StoredRoute[]>([])
  const [favoriten, setFavoriten] = useState<Set<string>>(new Set())
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) { setLaedt(false); return }
    setLaedt(true)
    listPublicRoutes()
      .then(setRouten)
      .catch((e: Error) => setFehler(e.message))
      .finally(() => setLaedt(false))
  }, [])

  useEffect(() => {
    if (!session) { setFavoriten(new Set()); return }
    listFavoriteIds().then(setFavoriten).catch(() => {})
  }, [session])

  const umschalten = async (id: string) => {
    const istFavorit = favoriten.has(id)
    // Sofort umschalten, damit sich der Knopf nicht träge anfühlt; bei einem
    // Fehler wird zurückgenommen.
    setFavoriten((f) => {
      const n = new Set(f)
      if (istFavorit) n.delete(id); else n.add(id)
      return n
    })
    try {
      if (istFavorit) await removeFavorite(id)
      else await addFavorite(id)
    } catch (e) {
      setFehler((e as Error).message)
      setFavoriten((f) => {
        const n = new Set(f)
        if (istFavorit) n.add(id); else n.delete(id)
        return n
      })
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <Rahmen>
        <p className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-slate-400">
          Für dieses Projekt ist kein Backend hinterlegt, deshalb gibt es hier keine geteilten
          Routen. Karte und Tourenplanung funktionieren ohne.
        </p>
      </Rahmen>
    )
  }

  return (
    <Rahmen>
      {laedt && <p className="text-sm text-slate-400">Routen werden geladen …</p>}
      {fehler && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{fehler}</p>}

      {!laedt && routen.length === 0 && (
        <div className="rounded-lg bg-white/5 p-4 text-sm leading-relaxed text-slate-400">
          <p className="font-medium text-slate-200">Noch keine geteilten Routen.</p>
          <p className="mt-1">
            Das ist der erwartete Anfang: hier steht nur, was jemand ausdrücklich
            veröffentlicht. Zeichne eine Route auf der Karte, speichere sie, und setze
            sie unter „Deine Touren" auf öffentlich — dann taucht sie hier auf.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {routen.map((r) => {
          const laenge = lineLength(r.geometry.coordinates as Position[])
          const istFavorit = favoriten.has(r.id)
          return (
            <li key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{r.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.autor ? `von ${r.autor} · ` : ''}
                    {r.region} · {formatKm(laenge)} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => onLoadRoute(r.geometry.coordinates as Position[], (r.waypoints ?? []) as Position[])}
                    className="min-h-9 rounded-lg bg-white/5 px-2.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
                  >
                    Auf Karte
                  </button>
                  {session ? (
                    <button
                      onClick={() => umschalten(r.id)}
                      aria-pressed={istFavorit}
                      aria-label={istFavorit ? `${r.name} aus Favoriten entfernen` : `${r.name} favorisieren`}
                      className={`min-h-9 rounded-lg px-2.5 text-xs ring-1 ${
                        istFavorit
                          ? 'bg-amber-500/20 text-amber-200 ring-amber-500/40'
                          : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10'
                      }`}
                    >
                      {istFavorit ? '★ Favorit' : '☆ Merken'}
                    </button>
                  ) : null}
                </div>
              </div>
              {r.beschreibung && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{r.beschreibung}</p>
              )}
            </li>
          )
        })}
      </ul>

      {!session && routen.length > 0 && (
        <p className="text-xs text-slate-500">
          Zum Merken von Routen ist eine Anmeldung nötig. Ansehen und laden geht ohne.
        </p>
      )}

      <p className="rounded-lg bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200/90">
        Geteilte Routen stammen von Nutzern, nicht von CampBuddy. Ob Übernachten entlang
        einer Route zulässig ist, sagt dir die Legalitäts-Ebene auf der Karte — nicht die
        Tatsache, dass jemand die Route geteilt hat.
      </p>
    </Rahmen>
  )
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h2 className="text-lg font-semibold">Community</h2>
        <p className="mt-0.5 text-sm text-slate-400">Routen, die andere geteilt haben.</p>
      </div>
      {children}
    </div>
  )
}
