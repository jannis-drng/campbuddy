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
import { Map as MapIcon } from 'lucide-react'
import { Button, Liste, Seite } from '../ui'
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
    <Seite
      titel="Deine Touren"
      beschreibung="Gespeicherte Routen, Touren und Favoriten. Geplant wird auf der Karte."
      aktion={<Button variante="primaer" icon={MapIcon} onClick={onZurKarte}>Zur Karte</Button>}
    >

      {fehler && <p className="rounded-mittel bg-verboten-500/10 p-3 text-fliess text-verboten-300">{fehler}</p>}

      {!session && isSupabaseConfigured && (
        <div className="rounded-mittel bg-flaeche-1 p-4">
          <p className="text-fliess leading-relaxed text-ink-300">
            Zum Speichern von Routen und Touren ist eine Anmeldung nötig. Karte,
            Routenplanung und Auswertung funktionieren ohne.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onAnmelden}
              className="min-h-9 rounded-mittel bg-gletscher-500/15 px-3 text-fliess text-gletscher-200 ring-1 ring-gletscher-500/30 hover:bg-gletscher-500/25"
            >
              Anmelden
            </button>
            <button
              onClick={onZurKarte}
              className="min-h-9 rounded-mittel bg-flaeche-1 px-3 text-fliess text-ink-300 ring-1 ring-kante hover:bg-flaeche-3"
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
                  <p className="truncate text-fliess text-ink-50">{r.name}</p>
                  <p className="text-mikro text-ink-500">
                    {r.region} · {formatKm(lineLength(r.geometry.coordinates as Position[]))} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('de-DE')}
                    {r.is_public && ' · veröffentlicht'}
                  </p>
                </div>
                <Button variante="sekundaer" groesse="klein" onClick={() => onLoadRoute(r.geometry.coordinates as Position[], (r.waypoints ?? []) as Position[])}>Auf Karte</Button>
                <button
                  onClick={() => veroeffentlichen(r)}
                  aria-pressed={r.is_public}
                  title={r.is_public
                    ? 'Route ist öffentlich sichtbar — Klick nimmt sie zurück'
                    : 'Route für alle sichtbar machen'}
                  className={`min-h-9 rounded-mittel px-2.5 text-klein ring-1 ${
                    r.is_public
                      ? 'bg-gletscher-500/20 text-gletscher-200 ring-gletscher-500/40'
                      : 'bg-flaeche-1 text-ink-300 ring-kante hover:bg-flaeche-3'
                  }`}
                >
                  {r.is_public ? 'Öffentlich' : 'Teilen'}
                </button>
                <button
                  onClick={async () => { await deleteRoute(r.id); setStand((n) => n + 1) }}
                  aria-label={`${r.name} löschen`}
                  className="min-h-9 rounded-mittel px-2 text-klein text-ink-500 hover:bg-flaeche-3 hover:text-verboten-300"
                >
                  Löschen
                </button>
              </li>
            ))}
          </Abschnitt>

          {routen.some((r) => r.is_public) && !anzeigename && (
            <p className="rounded-mittel bg-geduldet-500/10 p-3 text-klein leading-relaxed text-geduldet-200/90">
              Du hast Routen veröffentlicht, aber keinen Anzeigenamen gesetzt — sie erscheinen
              ohne Urheberangabe. Im Kontobereich lässt sich einer eintragen.
            </p>
          )}

          <Abschnitt titel="Favoriten aus der Community" anzahl={favoriten.length}
                     leer="Noch keine. Im Community-Bereich lassen sich Routen mit ☆ merken.">
            {favoriten.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-fliess text-ink-50">{r.name}</p>
                  <p className="text-mikro text-ink-500">
                    {r.autor ? `von ${r.autor} · ` : ''}
                    {formatKm(lineLength(r.geometry.coordinates as Position[]))}
                  </p>
                </div>
                <Button variante="sekundaer" groesse="klein" onClick={() => onLoadRoute(r.geometry.coordinates as Position[], (r.waypoints ?? []) as Position[])}>Auf Karte</Button>
                <button
                  onClick={async () => { await removeFavorite(r.id); setStand((n) => n + 1) }}
                  aria-label={`${r.name} aus Favoriten entfernen`}
                  className="min-h-9 rounded-mittel px-2 text-klein text-ink-500 hover:bg-flaeche-3 hover:text-verboten-300"
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
                  <p className="truncate text-fliess text-ink-50">{t.name}</p>
                  <p className="text-mikro text-ink-500">
                    ab {new Date(t.start_date).toLocaleDateString('de-DE')} · {t.days} Tage ·{' '}
                    {t.persons} {t.persons === 1 ? 'Person' : 'Personen'} · {t.elevation} m
                  </p>
                </div>
                <button
                  onClick={async () => { await deleteTrip(t.id); setStand((n) => n + 1) }}
                  aria-label={`${t.name} löschen`}
                  className="min-h-9 shrink-0 rounded-mittel px-2 text-klein text-ink-500 hover:bg-flaeche-3 hover:text-verboten-300"
                >
                  Löschen
                </button>
              </li>
            ))}
          </Abschnitt>
        </>
      )}

      {session && (
        <p className="border-t border-kante pt-5 text-klein leading-relaxed text-ink-500">
          Neue Touren entstehen auf der Karte: Route zeichnen, „Tour auswerten" öffnen und
          dort speichern. Die Auswertung enthält auch Ausrüstung, Verpflegung und Wetter.{' '}
          <button onClick={onZurKarte} className="text-gletscher-400 underline underline-offset-2 hover:text-gletscher-300">
            Zur Karte
          </button>
        </p>
      )}
    </Seite>
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
      <h2 className="mb-2.5 flex items-baseline gap-2 text-ueberschrift font-semibold text-ink-50">
        {titel}
        {anzahl > 0 && <span className="text-klein font-normal text-ink-500">{anzahl}</span>}
      </h2>
      {anzahl === 0 ? (
        <p className="rounded-gross border border-dashed border-kante px-4 py-5 text-klein
                      leading-relaxed text-ink-400">
          {leer}
        </p>
      ) : (
        <Liste>{children}</Liste>
      )}
    </section>
  )
}
