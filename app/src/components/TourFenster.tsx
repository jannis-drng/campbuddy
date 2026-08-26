/**
 * Eine gespeicherte Tour, aufgeschlagen — und veränderbar.
 *
 * Vorher führte genau ein Weg zu dem, was an einer Tour hängt: ein kleiner
 * Knopf mit einem Listensymbol, und dahinter nur die Packliste. Alles andere —
 * wo die Nächte liegen, wie das Wetter wird, welche Eckdaten die Tour hat —
 * stand entweder nirgends oder erst wieder auf der Karte hinter „Tour
 * auswerten". Ein Knopf für einen Teil und kein Weg zum Rest ist keine
 * Aufteilung, sondern ein Versehen.
 *
 * Dasselbe Fenster trägt eigene und gemerkte Touren. Der Unterschied ist nicht,
 * was zu sehen ist, sondern wohin eine Änderung geht:
 *
 *  - **Eigene Tour:** Angaben und Packliste werden gespeichert, verzögert und
 *    als Folge der Änderung. Verlauf und Nachtlager ändert man auf der Karte —
 *    dort liegen Höhenprofil und Schlafmöglichkeiten, und ein zweiter,
 *    schwächerer Etappenplaner an dieser Stelle wäre eine Fassade.
 *  - **Gemerkte Tour:** dieselben Felder, aber nur zum Durchspielen. Wer sie
 *    behalten will, übernimmt die Tour als eigene — dann ist es seine Planung
 *    und alles Weitere geht wie oben.
 *
 * Was einer fremden Tour fehlt, fehlt mit Absicht: Packliste und Nachtlager
 * ihrer Urheberin stehen nicht in der öffentlichen Sicht. Wo jemand schlafen
 * will, ist seine Planung, nicht die aller Leser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, CloudSun, Copy, Map as MapIcon, Moon, Mountain, Pencil, Route,
  TriangleAlert, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Position } from '../data/geo'
import type { Season, TripParams } from '../data/types'
import { formatDauer } from '../data/hiking'
import { getRegion } from '../data/legalData'
import {
  buildPacklist, formatWeight, packstaendeLesen, type PackStand, type PackStaende,
} from '../affiliate/packlist'
import {
  coldestNight, daysFromToday, loadForecast, MAX_FORECAST_DAYS, sliceToTrip, type Forecast,
} from '../services/weather'
import { aktualisiereTour, etappenLesen } from '../services/account'
import type { PublicTour, Tour } from '../services/supabase'
import { Button, Eingabe, Feld, Hinweis, IconButton, Label, Segmente } from '../ui'
import { Packliste } from './Packliste'
import { RoutenVorschau } from './RoutenVorschau'
import { WeatherPanel } from './WeatherPanel'
import { UEBERNACHTUNG_ICON, UEBERNACHTUNG_LABEL } from './uebernachtung'

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

const SEASON_LABEL: Record<Season, string> = {
  sommer: 'Sommer', uebergang: 'Übergangszeit', winter: 'Winter',
}

const UNTERKUENFTE: { wert: TripParams['shelter']; label: string }[] = [
  { wert: 'biwak', label: 'Biwak' },
  { wert: 'zelt', label: 'Zelt' },
  { wert: 'huette', label: 'Hütte' },
]

/** Monat → Jahreszeit, dieselbe Zuordnung wie im Planer. */
function seasonForDate(iso: string): Season {
  const m = new Date(iso + 'T12:00:00').getMonth() + 1
  if (m >= 7 && m <= 8) return 'sommer'
  if (m >= 11 || m <= 3) return 'winter'
  return 'uebergang'
}

const heute = () => new Date().toISOString().slice(0, 10)

/** Was sich an einer Tour hier einstellen lässt. */
interface Angaben {
  name: string
  beschreibung: string
  /** Leer heisst: kein Datum gesetzt — dann gibt es auch keine Vorhersage. */
  start_date: string
  days: number
  persons: number
  shelter: TripParams['shelter']
}

function angabenAus(tour: Tour | PublicTour): Angaben {
  return {
    name: tour.name,
    beschreibung: tour.beschreibung ?? '',
    start_date: tour.start_date ?? '',
    days: tour.days ?? 1,
    persons: tour.persons ?? 1,
    shelter: tour.shelter ?? 'biwak',
  }
}

interface Props {
  tour: Tour | PublicTour
  /** Gehört sie mir? Nur dann werden Änderungen gespeichert. */
  eigen: boolean
  onClose: () => void
  /** Den Verlauf auf der Karte zeigen. */
  onAufKarte: (geometry: Position[], waypoints: Position[]) => void
  /** Verlauf und Nachtlager auf der Karte ändern — nur bei eigenen. */
  onBearbeiten?: () => void
  /** Eine fremde Tour als eigene übernehmen, mit den hier gesetzten Eckdaten. */
  onKopieren?: (name: string, trip: TripParams) => Promise<void>
  /** Gespeicherte Änderung zurück in die Liste melden. */
  onGeaendert?: (patch: Partial<Tour>) => void
}

export function TourFenster({
  tour, eigen, onClose, onAufKarte, onBearbeiten, onKopieren, onGeaendert,
}: Props) {
  const [angaben, setAngaben] = useState<Angaben>(() => angabenAus(tour))
  const [staende, setStaende] = useState<PackStaende>(
    () => packstaendeLesen('packliste' in tour ? tour.packliste : null),
  )
  const [stand, setStand] = useState<'ruhe' | 'speichert' | 'gespeichert' | 'fehler'>('ruhe')
  const [fehler, setFehler] = useState<string | null>(null)
  const [kopiert, setKopiert] = useState<'ruhe' | 'busy'>('ruhe')

  const naechte = useMemo(
    () => ('etappen' in tour ? etappenLesen(tour.etappen) : null),
    [tour],
  )

  const geometry = useMemo(
    () => (tour.geometry?.coordinates ?? []) as Position[],
    [tour.geometry],
  )
  const hatWeg = geometry.length >= 2
  const aufKarte = () => onAufKarte(geometry, (tour.waypoints ?? []) as Position[])

  /*
    Die Höhe der höchsten Nacht kommt aus dem Höhenprofil und wird deshalb
    nicht hier eingestellt, sondern auf der Karte mit den Nachtlagern. Die
    Jahreszeit folgt dem Startdatum — sie einzeln setzbar zu machen hiesse,
    „Sommer" bei einem Dezembertermin zu erlauben.
  */
  const trip = useMemo<TripParams>(() => {
    const start = angaben.start_date || heute()
    return {
      start_date: start,
      days: angaben.days,
      persons: angaben.persons,
      elevation: tour.elevation ?? 0,
      season: angaben.start_date ? seasonForDate(start) : tour.season ?? seasonForDate(start),
      shelter: angaben.shelter,
    }
  }, [angaben, tour.elevation, tour.season])

  /* --------------------------------------------------------------- Wetter */

  // Für den Startpunkt der Tour, nicht für die Mitte der Region: bei einer
  // Tour über zwei Täler ist das ein Unterschied von tausend Höhenmetern.
  const [lng, lat] = geometry[0] ?? getRegion(tour.region).center

  /*
    Drei Fälle, in denen es keine Vorhersage geben kann, und alle drei sind
    normal: kein Datum gesetzt, Zeitraum vorbei, Zeitraum weiter als 16 Tage
    voraus. Sie werden benannt statt mit einem leeren Kasten beantwortet.
  */
  const versatz = angaben.start_date ? daysFromToday(angaben.start_date) : null
  const vorbei = versatz != null && versatz + trip.days - 1 < 0
  const zuFern = versatz != null && versatz >= MAX_FORECAST_DAYS
  const holtWetter = versatz != null && !vorbei && !zuFern
  const neededDays = Math.min(Math.max(0, versatz ?? 0) + trip.days, MAX_FORECAST_DAYS)

  const [fullForecast, setFullForecast] = useState<Forecast | null>(null)
  const [wetterLaedt, setWetterLaedt] = useState(false)
  const [wetterFehler, setWetterFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!holtWetter) { setFullForecast(null); setWetterFehler(null); return }
    const controller = new AbortController()
    setWetterLaedt(true)
    setWetterFehler(null)
    loadForecast(lat, lng, neededDays, controller.signal)
      .then(setFullForecast)
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setWetterFehler((e as Error).message)
        setFullForecast(null)
      })
      .finally(() => setWetterLaedt(false))
    return () => controller.abort()
  }, [holtWetter, lat, lng, neededDays])

  const { forecast, partial } = useMemo(
    () => (fullForecast
      ? sliceToTrip(fullForecast, trip.start_date, trip.days)
      : { forecast: null, partial: true }),
    [fullForecast, trip.start_date, trip.days],
  )

  // Liegt eine echte Vorhersage vor, rechnet die Packliste mit ihr statt mit
  // dem Erfahrungswert der Jahreszeit — wie in der Auswertung auf der Karte.
  const nightTemp = useMemo(
    () => (forecast ? coldestNight(forecast, trip.elevation) : undefined),
    [forecast, trip.elevation],
  )
  const packlist = useMemo(() => buildPacklist(trip, nightTemp), [trip, nightTemp])

  /* ------------------------------------------------------------ Speichern */

  // Escape schliesst — bei einem bildfüllenden Fenster erwartet man das.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const standSetzen = useCallback((id: string, wert: PackStand | null) => {
    setStaende((alt) => {
      const neu = { ...alt }
      if (wert) neu[id] = wert
      else delete neu[id]
      return neu
    })
  }, [])

  /*
    Gespeichert wird verzögert und als Folge der Änderung, nicht im
    Klick-Handler.

    Wer eine Packliste durchgeht, tippt zehnmal in zwanzig Sekunden, wer einen
    Namen ändert, einmal pro Buchstabe. Jeder Tastendruck ein Schreibvorgang
    wäre ein Dutzend Anfragen für eine einzige Entscheidung — und die letzte
    könnte vor der vorletzten ankommen. Eine Sekunde Ruhe genügt, um daraus
    eine zu machen.

    Verglichen wird mit dem zuletzt *gespeicherten* Stand, nicht mit einem
    „erster Durchlauf"-Merker: React ruft Effekte im Entwicklungsmodus
    absichtlich doppelt auf, und ein solcher Merker war beim zweiten Aufruf
    schon verbraucht — das Fenster schrieb dann beim blossen Öffnen.
  */
  const gespeichert = useRef(abdruck(angaben, staende))
  useEffect(() => {
    if (!eigen) return
    const jetzt = abdruck(angaben, staende)
    if (jetzt === gespeichert.current) return
    // Ein leerer Name wäre keine Änderung, sondern ein halber Tastendruck.
    if (!angaben.name.trim()) return
    setStand('speichert')
    const timer = window.setTimeout(async () => {
      try {
        const patch = {
          name: angaben.name.trim(),
          beschreibung: angaben.beschreibung.trim() || null,
          days: angaben.days,
          persons: angaben.persons,
          shelter: angaben.shelter,
          season: trip.season,
          ...(angaben.start_date ? { start_date: angaben.start_date } : {}),
          packliste: Object.keys(staende).length > 0 ? staende : null,
        }
        await aktualisiereTour(tour.id, patch)
        gespeichert.current = jetzt
        setStand('gespeichert')
        setFehler(null)
        onGeaendert?.(patch as Partial<Tour>)
      } catch (e) {
        setStand('fehler')
        setFehler((e as Error).message)
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [eigen, angaben, staende, trip.season, tour.id, onGeaendert])

  const uebernehmen = async () => {
    if (!onKopieren) return
    setKopiert('busy')
    try {
      await onKopieren(angaben.name.trim() || tour.name, trip)
    } catch (e) {
      setFehler((e as Error).message)
      setKopiert('ruhe')
    }
  }

  const setzen = (teil: Partial<Angaben>) => setAngaben((a) => ({ ...a, ...teil }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={tour.name}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl
                      border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <header className="flex items-start justify-between gap-3 border-b border-kante px-5 py-4">
          <div className="min-w-0">
            <p className="text-mikro font-medium uppercase text-ink-500">
              {eigen ? 'Deine Tour' : 'Gemerkte Tour'}
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-titel font-semibold leading-snug text-ink-50">
              {angaben.name || tour.name}
            </h2>
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
            <IconButton icon={X} label="Fenster schliessen" onClick={onClose} className="-mr-1.5 -mt-0.5" />
          </div>
        </header>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          {fehler && (
            <Hinweis ton="fehler" icon={TriangleAlert}>
              Das liess sich nicht speichern: {fehler}
            </Hinweis>
          )}

          {!eigen && (
            <Hinweis ton="info" icon={Copy}>
              Diese Tour gehört jemand anderem. Datum, Dauer und Ausrüstung kannst du hier für
              dich durchspielen — behalten werden sie erst, wenn du die Tour als eigene
              übernimmst.
            </Hinweis>
          )}

          {/*
            Das Kartenbild ist dasselbe wie in der Übersicht — es lädt vier
            Kacheln, nicht eine ganze Karte. Wer den Verlauf wirklich braucht,
            tippt darauf und ist auf der Karte.
          */}
          <button
            onClick={aufKarte}
            disabled={!hatWeg}
            title={hatWeg ? undefined : 'Diese Tour hat keinen gezeichneten Verlauf.'}
            className="group relative block w-full overflow-hidden rounded-gross border border-kante
                       transition-colors duration-[160ms] hover:border-kante-stark
                       disabled:cursor-not-allowed"
          >
            <RoutenVorschau geometry={geometry} breite={640} hoehe={200} rund="alle" linie={3} />
            {hatWeg && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center
                               justify-center gap-1.5 bg-flaeche-1/75 py-1.5 text-klein font-medium
                               text-ink-200 opacity-0 backdrop-blur-sm transition-opacity
                               duration-[160ms] group-hover:opacity-100 group-focus-visible:opacity-100">
                <MapIcon size={13} strokeWidth={2} aria-hidden />
                Auf der Karte öffnen
              </span>
            )}
          </button>

          {/* ---- Kenngrössen: was der Verlauf festlegt ---- */}
          <section className="flex flex-wrap gap-x-6 gap-y-3 rounded-mittel bg-flaeche-1 px-3 py-3">
            {tour.distance_m != null && (
              <Eckwert icon={Route} label="Strecke" wert={formatKm(tour.distance_m)} />
            )}
            {tour.ascent_m != null && (
              <Eckwert icon={Mountain} label="Aufstieg" wert={`${tour.ascent_m} hm`} />
            )}
            {tour.duration_s != null && (
              <Eckwert icon={CalendarDays} label="Gehzeit" wert={formatDauer(tour.duration_s)} />
            )}
            <Eckwert
              icon={Mountain}
              label="Höchste Nacht"
              wert={`${trip.elevation} m`}
              zusatz={SEASON_LABEL[trip.season]}
            />
          </section>

          {/* ---- Angaben: was man selbst festlegt ---- */}
          <section className="space-y-3.5">
            <h3 className="text-fliess font-semibold text-ink-200">Angaben</h3>

            {eigen ? (
              <>
                <Feld label="Name">
                  <Eingabe
                    value={angaben.name}
                    onChange={(e) => setzen({ name: e.target.value })}
                    maxLength={120}
                  />
                </Feld>
                <Feld label="Beschreibung" hinweis="Sichtbar, sobald du die Tour teilst.">
                  <textarea
                    value={angaben.beschreibung}
                    onChange={(e) => setzen({ beschreibung: e.target.value })}
                    rows={3}
                    maxLength={1000}
                    placeholder="Wo geht es lang, was sollte man wissen, wo hast du geschlafen?"
                    className="w-full resize-y rounded-mittel border border-kante bg-flaeche-1 px-3 py-2
                               text-fliess leading-relaxed text-ink-100 placeholder:text-ink-500
                               transition-colors duration-[160ms] hover:border-kante-stark
                               focus:border-gletscher-500 focus:outline-none focus:ring-2
                               focus:ring-gletscher-500/25"
                  />
                </Feld>
              </>
            ) : tour.beschreibung ? (
              <p className="whitespace-pre-line text-fliess leading-relaxed text-ink-300">
                {tour.beschreibung}
              </p>
            ) : null}

            <div className="grid gap-3.5 sm:grid-cols-3">
              <Feld label="Start" hinweis={angaben.start_date ? undefined : 'Ohne Datum kein Wetter.'}>
                <Eingabe
                  type="date"
                  value={angaben.start_date}
                  onChange={(e) => setzen({ start_date: e.target.value })}
                />
              </Feld>
              <Feld label="Tage">
                <Eingabe
                  type="number" min={1} max={60}
                  value={angaben.days}
                  onChange={(e) => setzen({ days: klemme(e.target.value, 1, 60, angaben.days) })}
                />
              </Feld>
              <Feld label="Personen">
                <Eingabe
                  type="number" min={1} max={20}
                  value={angaben.persons}
                  onChange={(e) => setzen({ persons: klemme(e.target.value, 1, 20, angaben.persons) })}
                />
              </Feld>
            </div>

            <div>
              <Label className="mb-1.5">Unterkunft</Label>
              <Segmente
                ariaLabel="Unterkunft"
                wert={angaben.shelter}
                onWaehlen={(w) => setzen({ shelter: w })}
                optionen={UNTERKUENFTE}
              />
            </div>
          </section>

          {/* ---- Übernachtungen ---- */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-fliess font-semibold text-ink-200">
              <Moon size={15} strokeWidth={2} className="text-ink-500" aria-hidden />
              Übernachtungen
            </h3>
            {naechte ? (
              <ol className="divide-y divide-kante overflow-hidden rounded-mittel border border-kante">
                {naechte.map((nacht, i) => {
                  const Zeichen = UEBERNACHTUNG_ICON[nacht.art]
                  return (
                    <li key={`${nacht.bei_m}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                                   border border-kante bg-flaeche-1 text-mikro font-semibold text-ink-400"
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fliess text-ink-50">{nacht.name}</span>
                        <span className="flex items-center gap-1.5 text-mikro normal-case tracking-normal text-ink-500">
                          <Zeichen size={11} strokeWidth={2} aria-hidden />
                          {UEBERNACHTUNG_LABEL[nacht.art]}
                          {' · nach '}{formatKm(nacht.bei_m)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="rounded-mittel border border-dashed border-kante px-3 py-3 text-klein leading-relaxed text-ink-500">
                {eigen
                  ? trip.days > 1
                    ? `Für diese Tour sind keine Nachtlager festgelegt. Geplant sind ${trip.days} Tage — wo die Nächte liegen, wählst du auf der Karte.`
                    : 'Für diese Tour sind keine Nachtlager festgelegt. Eine Tagestour braucht keine; für mehrere Tage wählst du sie auf der Karte.'
                  : 'Wo die Urheberin übernachtet, gehört zu ihrer Planung und wird nicht mitveröffentlicht. Übernimm die Tour, dann legst du deine eigenen Nächte fest.'}
              </p>
            )}
            {eigen && (
              <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
                Nachtlager hängen am Höhenprofil und an dem, was entlang der Route liegt — beides
                kennt nur die Karte. Deshalb führt der Knopf unten dorthin, statt hier eine
                zweite, blindere Auswahl anzubieten.
              </p>
            )}
            <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
              Ob an einer dieser Stellen übernachtet werden darf, sagt die Legalitäts-Ebene auf der
              Karte — nicht diese Liste.
            </p>
          </section>

          {/* ---- Wetter ---- */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-fliess font-semibold text-ink-200">
              <CloudSun size={15} strokeWidth={2} className="text-ink-500" aria-hidden />
              Wetter
            </h3>
            {versatz == null ? (
              <Hinweis ton="info">
                Für diese Tour ist kein Startdatum gesetzt — ohne Zeitraum gibt es keine
                Vorhersage. Die Ausrüstung unten rechnet solange mit Erfahrungswerten für die
                Jahreszeit.
              </Hinweis>
            ) : vorbei ? (
              <Hinweis ton="info">
                Der Zeitraum dieser Tour liegt zurück. Eine Vorhersage gibt es dafür nicht mehr —
                die Ausrüstung unten rechnet mit Erfahrungswerten für die Jahreszeit.
              </Hinweis>
            ) : (
              <WeatherPanel
                forecast={forecast}
                loading={wetterLaedt}
                error={wetterFehler}
                targetElevation={trip.elevation}
                outOfRange={zuFern}
                partial={partial}
              />
            )}
          </section>

          {/* ---- Ausrüstung ---- */}
          <section className="space-y-3">
            <h3 className="text-fliess font-semibold text-ink-200">Ausrüstung</h3>
            <p className="rounded-mittel bg-flaeche-1 p-3 text-fliess text-ink-300">
              Die Liste rechnet mit einer kältesten Nacht von{' '}
              <strong className="text-ink-50">
                {packlist.basedOnNightTemp.toLocaleString('de-DE')} °C
              </strong>{' '}
              auf {trip.elevation} m.
              <span className="mt-1 block text-klein text-ink-500">
                {packlist.fromForecast
                  ? partial
                    ? 'Aus der Vorhersage für den Teil des Zeitraums abgeleitet, der noch im 16-Tage-Fenster liegt.'
                    : 'Aus der Vorhersage für deinen Reisezeitraum abgeleitet.'
                  : `Aus Jahreszeit und Höhe geschätzt — für den Zeitraum liegt keine Vorhersage vor (Open-Meteo reicht ${MAX_FORECAST_DAYS} Tage voraus).`}
              </span>
            </p>

            {!eigen && (
              <p className="text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
                Was du hier abhakst, gilt nur für diesen Besuch — es gehört zu einer Tour, die dir
                nicht gehört. Übernimm sie, dann bleibt der Stand erhalten.
              </p>
            )}

            <Packliste
              packlist={packlist}
              staende={staende}
              onStand={standSetzen}
              personen={trip.persons}
            />
          </section>

          {/* ---- Verpflegung ---- */}
          <section>
            <h3 className="mb-2 text-fliess font-semibold text-ink-200">Verpflegung</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-mittel border border-kante p-3">
              <Eckwert label="Pro Person und Tag" wert={`${packlist.food.kcalPerPersonPerDay} kcal`} />
              <Eckwert label="Gesamt" wert={`${packlist.food.totalKcal.toLocaleString('de-DE')} kcal`} />
              <Eckwert label="Gewicht" wert={formatWeight(packlist.food.weight_g)} />
            </div>
          </section>

          <p className="rounded-mittel bg-geduldet-500/10 p-3 text-klein leading-relaxed text-geduldet-200/90">
            Diese Angaben ersetzen keine eigene Tourenplanung. Prüfe Wetterbericht, Lawinenlage und
            Kondition unabhängig — und ob Übernachten an deinem Ziel überhaupt zulässig ist.
          </p>
        </div>

        {/*
          Die Wege hinaus kleben unten. Sie sind das, was man von jeder Stelle
          dieses Fensters aus tun will — und das Vorschaubild ganz oben ist nach
          dem Scrollen nicht mehr da.
        */}
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-kante bg-flaeche-2 px-5 py-3">
          <Button
            variante="sekundaer" groesse="gross" icon={MapIcon}
            onClick={aufKarte} disabled={!hatWeg}
            className="min-w-0 flex-1"
          >
            Auf Karte
          </Button>
          {eigen ? (
            <Button
              variante="primaer" groesse="gross" icon={Pencil}
              onClick={onBearbeiten} disabled={!hatWeg || !onBearbeiten}
              className="min-w-0 flex-1"
            >
              <span className="hidden sm:inline">Verlauf &amp; Nächte&nbsp;</span>ändern
            </Button>
          ) : (
            <Button
              variante="primaer" groesse="gross" icon={Copy}
              onClick={uebernehmen} disabled={kopiert === 'busy' || !onKopieren}
              className="min-w-0 flex-1"
            >
              {kopiert === 'busy' ? 'Übernehme …' : (
                <>
                  <span className="hidden sm:inline">Als eigene&nbsp;</span>übernehmen
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Zahl aus einem Feld, im erlaubten Bereich. Leere Eingabe behält den Wert. */
function klemme(roh: string, min: number, max: number, rueckfall: number): number {
  const n = Number.parseInt(roh, 10)
  if (!Number.isFinite(n)) return rueckfall
  return Math.min(max, Math.max(min, n))
}

function Eckwert({
  icon: Icon, label, wert, zusatz,
}: { icon?: LucideIcon; label: string; wert: string; zusatz?: string }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon size={15} strokeWidth={1.9} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />}
      <div>
        <Label>{label}</Label>
        <p className="text-fliess font-semibold text-ink-50">{wert}</p>
        {zusatz && (
          <p className="text-mikro normal-case tracking-normal text-ink-600">{zusatz}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Vergleichbarer Abdruck dessen, was gespeichert würde.
 *
 * Die Packliste wird sortiert, weil die Schlüsselreihenfolge eines Objekts von
 * der Reihenfolge der Klicks abhängt — ohne Sortierung wäre derselbe Stand je
 * nach Weg dorthin ein anderer String und löste ein Speichern ohne Änderung aus.
 */
function abdruck(angaben: Angaben, staende: PackStaende): string {
  const liste = Object.keys(staende).sort().map((k) => `${k}=${staende[k]}`).join(',')
  return [
    angaben.name, angaben.beschreibung, angaben.start_date,
    angaben.days, angaben.persons, angaben.shelter, liste,
  ].join('')
}
