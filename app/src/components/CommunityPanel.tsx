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
import { isSupabaseConfigured, type PublicRoute } from '../services/supabase'
import { addFavorite, listFavoriteIds, listPublicRoutes, removeFavorite } from '../services/account'
import { Compass, Map as MapIcon, Star, TriangleAlert } from 'lucide-react'
import { Button, Hinweis, Leer, Liste, Seite } from '../ui'

interface Props {
  session: Session | null
  onLoadRoute: (geometry: Position[], waypoints: Position[]) => void
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

export function CommunityPanel({ session, onLoadRoute }: Props) {
  const [routen, setRouten] = useState<PublicRoute[]>([])
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
        <Leer
          icon={Compass}
          titel="Keine geteilten Routen"
          text="Für dieses Projekt ist kein Backend hinterlegt. Karte und Tourenplanung funktionieren ohne."
        />
      </Rahmen>
    )
  }

  return (
    <Rahmen>
      {laedt && (
        <div className="space-y-2" aria-label="Routen werden geladen">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-gross border border-kante bg-flaeche-2" />
          ))}
        </div>
      )}
      {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}

      {!laedt && routen.length === 0 && (
        <Leer
          icon={Compass}
          titel="Noch keine geteilten Routen"
          text="Das ist der erwartete Anfang: hier steht nur, was jemand ausdrücklich veröffentlicht. Zeichne eine Route auf der Karte, speichere sie, und setze sie unter „Deine Touren“ auf öffentlich."
        />
      )}

      {routen.length > 0 && <Liste>
        {routen.map((r) => {
          const laenge = lineLength(r.geometry.coordinates as Position[])
          const istFavorit = favoriten.has(r.id)
          return (
            <li key={r.id} className="p-3.5 transition-colors duration-[160ms] hover:bg-flaeche-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-50">{r.name}</p>
                  <p className="text-mikro text-ink-500">
                    {r.autor ? `von ${r.autor} · ` : ''}
                    {r.region} · {formatKm(laenge)} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variante="sekundaer" groesse="klein" icon={MapIcon}
                    onClick={() => onLoadRoute(r.geometry.coordinates as Position[], (r.waypoints ?? []) as Position[])}
                  >
                    Auf Karte
                  </Button>
                  {session ? (
                    <Button
                      variante={istFavorit ? 'primaer' : 'sekundaer'}
                      groesse="klein"
                      icon={Star}
                      onClick={() => umschalten(r.id)}
                      aria-pressed={istFavorit}
                      aria-label={istFavorit ? `${r.name} aus Favoriten entfernen` : `${r.name} favorisieren`}
                    >
                      {istFavorit ? 'Gemerkt' : 'Merken'}
                    </Button>
                  ) : null}
                </div>
              </div>
              {r.beschreibung && (
                <p className="mt-1.5 text-klein leading-relaxed text-ink-400">{r.beschreibung}</p>
              )}
            </li>
          )
        })}
      </Liste>}

      {!session && routen.length > 0 && (
        <p className="text-klein text-ink-500">
          Zum Merken von Routen ist eine Anmeldung nötig. Ansehen und laden geht ohne.
        </p>
      )}

      <Hinweis ton="warnung" icon={TriangleAlert}>
        Geteilte Routen stammen von Nutzern, nicht von CampBuddy. Ob Übernachten entlang einer
        Route zulässig ist, sagt dir die Legalitäts-Ebene auf der Karte — nicht die Tatsache,
        dass jemand die Route geteilt hat.
      </Hinweis>
    </Rahmen>
  )
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <Seite titel="Community" beschreibung="Routen, die andere geteilt haben.">
      {children}
    </Seite>
  )
}
