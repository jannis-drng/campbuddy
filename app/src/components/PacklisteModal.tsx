/**
 * Die Packliste einer gespeicherten Tour — ohne den Umweg über die Karte.
 *
 * Bisher führte genau ein Weg dorthin: Route zeichnen oder laden, „Tour
 * auswerten", ganz nach unten scrollen. Das passt zum Planen. Es passt nicht
 * zu dem, wofür man eine Packliste tatsächlich aufschlägt — am Abend vorher,
 * mit dem Rucksack auf dem Boden, um zu sehen, was noch fehlt. Dafür ist die
 * Karte nicht nötig; ein Bild von ihr genügt, und wer sie doch braucht, tippt
 * darauf.
 *
 * Der Stand der Liste wird beim Ändern gespeichert, nicht auf Knopfdruck: hier
 * gibt es kein Formular, das man absendet, sondern eine Liste, die man
 * durchgeht.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, Map as MapIcon, Mountain, Route, TriangleAlert, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Position } from '../data/geo'
import type { Season, TripParams } from '../data/types'
import { formatDauer } from '../data/hiking'
import {
  buildPacklist, formatWeight, packstaendeLesen, type PackStand, type PackStaende,
} from '../affiliate/packlist'
import { aktualisiereTour } from '../services/account'
import type { Tour } from '../services/supabase'
import { Hinweis, IconButton } from '../ui'
import { Packliste } from './Packliste'
import { RoutenVorschau } from './RoutenVorschau'

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

const SEASON_LABEL: Record<Season, string> = {
  sommer: 'Sommer', uebergang: 'Übergangszeit', winter: 'Winter',
}

const SHELTER_LABEL: Record<TripParams['shelter'], string> = {
  biwak: 'Biwak', zelt: 'Zelt', huette: 'Hütte',
}

/** Monat → Jahreszeit, dieselbe Zuordnung wie im Planer. */
function seasonForDate(iso: string): Season {
  const m = new Date(iso + 'T12:00:00').getMonth() + 1
  if (m >= 7 && m <= 8) return 'sommer'
  if (m >= 11 || m <= 3) return 'winter'
  return 'uebergang'
}

/**
 * Die Eckdaten der Tour in die Form bringen, die die Packliste braucht.
 *
 * Eine Tour darf ohne Datum gespeichert werden — deshalb steht hinter jedem
 * Feld ein Rückfall. Er ist nicht erfunden, sondern der offensichtliche:
 * heute, ein Tag, eine Person, Talhöhe.
 */
function eckdaten(tour: Tour): TripParams {
  const start = tour.start_date ?? new Date().toISOString().slice(0, 10)
  return {
    start_date: start,
    days: tour.days ?? 1,
    persons: tour.persons ?? 1,
    elevation: tour.elevation ?? 0,
    season: tour.season ?? seasonForDate(start),
    shelter: tour.shelter ?? 'biwak',
  }
}

interface Props {
  tour: Tour
  onClose: () => void
  /** Die Tour auf der Karte öffnen — hinter dem Vorschaubild. */
  onAufKarte: (geometry: Position[], waypoints: Position[]) => void
}

export function PacklisteModal({ tour, onClose, onAufKarte }: Props) {
  const trip = useMemo(() => eckdaten(tour), [tour])
  const packlist = useMemo(() => buildPacklist(trip), [trip])

  const [staende, setStaende] = useState<PackStaende>(() => packstaendeLesen(tour.packliste))
  const [stand, setStand] = useState<'ruhe' | 'speichert' | 'gespeichert' | 'fehler'>('ruhe')
  const [fehler, setFehler] = useState<string | null>(null)

  const geometry = (tour.geometry?.coordinates ?? []) as Position[]

  // Escape schliesst — bei einem bildfüllenden Fenster erwartet man das.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /*
    Gespeichert wird verzögert.

    Wer eine Liste durchgeht, tippt zehnmal in zwanzig Sekunden. Jeder Tipp
    ein Schreibvorgang wäre zehn Anfragen für eine einzige Entscheidung —
    und die letzte könnte vor der vorletzten ankommen. Eine Sekunde Ruhe
    genügt, um daraus eine zu machen.
  */
  const timer = useRef<number | null>(null)
  const letzte = useRef<PackStaende>(staende)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const sichern = useCallback((neu: PackStaende) => {
    letzte.current = neu
    if (timer.current) window.clearTimeout(timer.current)
    setStand('speichert')
    timer.current = window.setTimeout(async () => {
      try {
        await aktualisiereTour(tour.id, {
          packliste: Object.keys(letzte.current).length > 0 ? letzte.current : null,
        })
        setStand('gespeichert')
        setFehler(null)
      } catch (e) {
        setStand('fehler')
        setFehler((e as Error).message)
      }
    }, 1000)
  }, [tour.id])

  const standSetzen = useCallback((id: string, wert: PackStand | null) => {
    setStaende((alt) => {
      const neu = { ...alt }
      if (wert) neu[id] = wert
      else delete neu[id]
      sichern(neu)
      return neu
    })
  }, [sichern])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Packliste für ${tour.name}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl
                      border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <header className="flex items-start justify-between gap-3 border-b border-kante px-5 py-4">
          <div className="min-w-0">
            <p className="text-mikro font-medium uppercase text-ink-500">Packliste</p>
            <h2 className="mt-0.5 truncate text-titel font-semibold text-ink-50">{tour.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/*
              Der Speicherstand steht neben dem Schliessen-Knopf, nicht unten:
              dort schaut man hin, bevor man das Fenster zumacht.
            */}
            <span className="hidden text-mikro normal-case tracking-normal text-ink-500 sm:block">
              {stand === 'speichert' && 'Speichert …'}
              {stand === 'gespeichert' && (
                <span className="flex items-center gap-1 text-erlaubt-400">
                  <Check size={12} strokeWidth={2.5} aria-hidden />Gespeichert
                </span>
              )}
            </span>
            <IconButton icon={X} label="Packliste schliessen" onClick={onClose} className="-mr-1.5 -mt-0.5" />
          </div>
        </header>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          {fehler && (
            <Hinweis ton="fehler" icon={TriangleAlert}>
              Der Stand liess sich nicht speichern: {fehler}
            </Hinweis>
          )}

          {/*
            Das Kartenbild ist dasselbe wie in der Übersicht — es lädt vier
            Kacheln, nicht eine ganze Karte. Wer den Verlauf wirklich braucht,
            tippt darauf und ist auf der Karte.
          */}
          <button
            onClick={() => onAufKarte(geometry, (tour.waypoints ?? []) as Position[])}
            className="group relative block w-full overflow-hidden rounded-gross border border-kante
                       transition-colors duration-[160ms] hover:border-kante-stark"
          >
            <RoutenVorschau geometry={geometry} breite={640} hoehe={200} rund="alle" linie={3} />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center
                             justify-center gap-1.5 bg-flaeche-1/75 py-1.5 text-klein font-medium
                             text-ink-200 opacity-0 backdrop-blur-sm transition-opacity
                             duration-[160ms] group-hover:opacity-100 group-focus-visible:opacity-100">
              <MapIcon size={13} strokeWidth={2} aria-hidden />
              Auf der Karte öffnen
            </span>
          </button>

          <section className="flex flex-wrap gap-x-6 gap-y-3 rounded-mittel bg-flaeche-1 px-3 py-3">
            {tour.distance_m != null && (
              <Eckwert icon={Route} label="Strecke" wert={formatKm(tour.distance_m)} />
            )}
            {tour.duration_s != null && (
              <Eckwert icon={CalendarDays} label="Gehzeit" wert={formatDauer(tour.duration_s)} />
            )}
            <Eckwert
              icon={CalendarDays}
              label="Dauer"
              wert={`${trip.days} ${trip.days === 1 ? 'Tag' : 'Tage'}`}
              zusatz={tour.start_date
                ? `ab ${new Date(tour.start_date + 'T12:00:00').toLocaleDateString('de-CH')}`
                : 'ohne Datum'}
            />
            <Eckwert icon={Users} label="Personen" wert={String(trip.persons)} />
            <Eckwert
              icon={Mountain}
              label="Höchste Nacht"
              wert={`${trip.elevation} m`}
              zusatz={`${SHELTER_LABEL[trip.shelter]} · ${SEASON_LABEL[trip.season]}`}
            />
          </section>

          <p className="text-klein leading-relaxed text-ink-500">
            Die Liste rechnet mit einer kältesten Nacht von{' '}
            <strong className="font-semibold text-ink-300">{packlist.basedOnNightTemp} °C</strong>{' '}
            auf {trip.elevation} m, aus Jahreszeit und Höhe geschätzt. Die Vorhersage für den
            Zeitraum steht in der Tour-Auswertung auf der Karte.
          </p>

          <Packliste
            packlist={packlist}
            staende={staende}
            onStand={standSetzen}
            personen={trip.persons}
          />

          <section>
            <h3 className="mb-2 text-fliess font-semibold text-ink-200">Verpflegung</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-mittel border border-kante p-3">
              <Eckwert label="Pro Person und Tag" wert={`${packlist.food.kcalPerPersonPerDay} kcal`} />
              <Eckwert label="Gesamt" wert={`${packlist.food.totalKcal.toLocaleString('de-DE')} kcal`} />
              <Eckwert label="Gewicht" wert={formatWeight(packlist.food.weight_g)} />
            </div>
          </section>

          <p className="rounded-mittel bg-geduldet-500/10 p-3 text-klein leading-relaxed text-geduldet-200/90">
            Die Packliste ersetzt keine eigene Tourenplanung. Prüfe Wetterbericht, Lawinenlage und
            Kondition unabhängig — und ob Übernachten an deinem Ziel überhaupt zulässig ist.
          </p>
        </div>
      </div>
    </div>
  )
}

function Eckwert({
  icon: Icon, label, wert, zusatz,
}: { icon?: LucideIcon; label: string; wert: string; zusatz?: string }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon size={15} strokeWidth={1.9} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />}
      <div>
        <p className="text-mikro uppercase text-ink-500">{label}</p>
        <p className="text-fliess font-semibold text-ink-50">{wert}</p>
        {zusatz && (
          <p className="text-mikro normal-case tracking-normal text-ink-600">{zusatz}</p>
        )}
      </div>
    </div>
  )
}
