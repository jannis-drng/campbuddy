/**
 * Ausrüstungs-, Verpflegungs- und Wetterteil der Tour-Auswertung
 * (Abschnitte 4.3 und 4.5).
 *
 * Hier wird nur noch gefragt, was die Tour nicht schon weiss.
 *
 * Vorher standen fünf Felder nebeneinander — Datum, Tage, Personen,
 * Schlafhöhe, Jahreszeit — und vier davon waren bereits entschieden: die Tage
 * stehen in den Etappen, die Schlafhöhe im Höhenprofil, die Jahreszeit im
 * Startdatum, und ob es eine Hüttentour wird, hat man beim Wählen der
 * Nachtlager festgelegt. Wer sie trotzdem einzeln setzen musste, konnte sie
 * auch gegen die eigene Route stellen: „7 Tage" bei einer Etappenplanung über
 * drei, „Sommer" bei einem Dezembertermin. Abgeleitete Werte stehen jetzt als
 * Angabe da, nicht als Eingabefeld.
 *
 * Übrig bleiben die zwei echten Fragen: wann geht es los, und mit wie vielen.
 * Dazu die eine, die die Route nicht beantwortet — Biwaksack oder Zelt.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Mountain, Thermometer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Region, Season, TripParams } from '../data/types'
import { buildPacklist, formatWeight, type PackStand, type PackStaende } from '../affiliate/packlist'
import {
  coldestNight, daysFromToday, loadForecast, MAX_FORECAST_DAYS, sliceToTrip, type Forecast,
} from '../services/weather'
import { WeatherPanel } from './WeatherPanel'
import { Packliste } from './Packliste'
import { Eingabe, Feld, Label } from '../ui'

const SHELTERS: { key: TripParams['shelter']; label: string; hint: string }[] = [
  { key: 'biwak', label: 'Biwak', hint: 'ohne Zelt, nur Biwaksack' },
  { key: 'zelt', label: 'Zelt', hint: 'nur wo erlaubt oder geduldet' },
]

const HUETTE: { key: TripParams['shelter']; label: string; hint: string } =
  { key: 'huette', label: 'Hütte', hint: 'bewirtschaftete Übernachtung' }

const SEASON_LABEL: Record<Season, string> = {
  sommer: 'Sommer', uebergang: 'Übergangszeit', winter: 'Winter',
}

/** Grobe Zuordnung Monat → Jahreszeit für die Alpen. */
function seasonForDate(d: Date): Season {
  const m = d.getMonth() + 1
  if (m >= 7 && m <= 8) return 'sommer'
  if (m >= 11 || m <= 3) return 'winter'
  return 'uebergang'
}

const heute = () => new Date().toISOString().slice(0, 10)

export interface Abgeleitet {
  /** Anzahl Tage — aus den Etappen. */
  days: number
  /** Höchste Nacht in Metern — aus dem Höhenprofil. */
  elevation: number
  /** Enden alle Nächte an einer Hütte? Dann ist es eine Hüttentour. */
  huettenTour: boolean
}

interface Props {
  region: Region
  /** Was die Route bereits festlegt. Ändert sie sich, ändert sich das hier mit. */
  abgeleitet: Abgeleitet
  /** Meldet die vollständigen Eckdaten nach oben — gespeichert wird eine Ebene höher. */
  onTripChange?: (trip: TripParams) => void
  /** Vorbelegung aus einer gespeicherten Tour. */
  initial?: { start_date?: string | null; persons?: number | null; shelter?: TripParams['shelter'] | null }
  staende: PackStaende
  onStand: (id: string, stand: PackStand | null) => void
}

export function TripPlanner({
  region, abgeleitet, onTripChange, initial, staende, onStand,
}: Props) {
  const [startDatum, setStartDatum] = useState(initial?.start_date || heute())
  const [personen, setPersonen] = useState(initial?.persons ?? 2)
  const [shelter, setShelter] = useState<TripParams['shelter']>(
    initial?.shelter ?? (abgeleitet.huettenTour ? 'huette' : 'biwak'),
  )

  /*
    Die Übernachtungsart folgt den gewählten Nachtlagern, bis jemand sie
    einmal selbst gesetzt hat. Wer alle Nächte auf Hütten legt, will keine
    Zeltstangen in der Packliste — wer danach ausdrücklich „Biwak" wählt,
    schon, und dann soll die nächste Etappenänderung ihm das nicht wieder
    wegnehmen.
  */
  const shelterSelbst = useRef(initial?.shelter != null)
  useEffect(() => {
    if (shelterSelbst.current) return
    setShelter(abgeleitet.huettenTour ? 'huette' : 'biwak')
  }, [abgeleitet.huettenTour])

  const season = seasonForDate(new Date(startDatum + 'T12:00:00'))

  const trip = useMemo<TripParams>(() => ({
    start_date: startDatum,
    days: abgeleitet.days,
    persons: personen,
    elevation: abgeleitet.elevation,
    season,
    shelter,
  }), [startDatum, personen, shelter, season, abgeleitet.days, abgeleitet.elevation])

  const [fullForecast, setFullForecast] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lng, lat] = region.center

  // Vorhersage muss bis zum ENDE der Tour reichen, nicht nur über deren Dauer.
  const offset = Math.max(0, daysFromToday(trip.start_date))
  const neededDays = Math.min(offset + trip.days, MAX_FORECAST_DAYS)
  const outOfRange = offset >= MAX_FORECAST_DAYS

  useEffect(() => {
    if (outOfRange) { setFullForecast(null); setError(null); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    loadForecast(lat, lng, neededDays, controller.signal)
      .then(setFullForecast)
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setError((e as Error).message)
        setFullForecast(null)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [lat, lng, neededDays, outOfRange])

  // Nur die Tage des Reisezeitraums zählen für Anzeige und Packliste.
  const { forecast, partial } = useMemo(
    () => (fullForecast
      ? sliceToTrip(fullForecast, trip.start_date, trip.days)
      : { forecast: null, partial: true }),
    [fullForecast, trip.start_date, trip.days],
  )

  const nightTemp = useMemo(
    () => (forecast ? coldestNight(forecast, trip.elevation) : undefined),
    [forecast, trip.elevation],
  )
  const packlist = useMemo(() => buildPacklist(trip, nightTemp), [trip, nightTemp])

  // Die Eckdaten gehören zur Tour, nicht zum Planer. Wer speichert, speichert
  // beides zusammen — deshalb wandern sie bei jeder Änderung nach oben.
  useEffect(() => { onTripChange?.(trip) }, [trip, onTripChange])

  const optionen = abgeleitet.huettenTour ? [HUETTE, ...SHELTERS] : SHELTERS

  return (
    <div className="space-y-5">

      {/* ---- Was die Route offen lässt ---- */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Feld label="Start">
          <Eingabe
            type="date"
            value={startDatum}
            onChange={(e) => setStartDatum(e.target.value || heute())}
          />
        </Feld>
        <Feld label="Personen">
          <Eingabe
            type="number" min={1} max={12} value={personen}
            onChange={(e) => {
              // Ein leeres Feld ergibt NaN; ungeprüft übernommen stünde später
              // „NaN kcal" in der Verpflegung.
              const zahl = Number(e.target.value)
              setPersonen(Number.isFinite(zahl) ? Math.min(12, Math.max(1, Math.round(zahl))) : 1)
            }}
          />
        </Feld>
      </section>

      <section>
        <Label className="mb-1">Übernachtung</Label>
        <div className="flex flex-wrap gap-1.5">
          {optionen.map((o) => (
            <button
              key={o.key}
              onClick={() => { shelterSelbst.current = true; setShelter(o.key) }}
              aria-pressed={shelter === o.key}
              title={o.hint}
              className={`min-h-9 rounded-full px-3 py-1.5 text-fliess transition ${
                shelter === o.key
                  ? 'bg-gletscher-500/20 text-gletscher-200 ring-1 ring-gletscher-500/40'
                  : 'bg-flaeche-1 text-ink-400 ring-1 ring-kante hover:bg-flaeche-3'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---- Was die Route bereits entschieden hat ---- */}
      <section className="flex flex-wrap gap-x-6 gap-y-2 rounded-mittel bg-flaeche-1 px-3 py-2.5">
        <Abgelesen icon={CalendarDays} label="Dauer"
                   wert={`${trip.days} ${trip.days === 1 ? 'Tag' : 'Tage'}`}
                   woher="aus den Etappen" />
        <Abgelesen icon={Mountain} label="Höchste Nacht" wert={`${trip.elevation} m`}
                   woher="aus dem Höhenprofil" />
        <Abgelesen icon={Thermometer} label="Jahreszeit" wert={SEASON_LABEL[season]}
                   woher="aus dem Startdatum" />
      </section>

      {/* ---- Wetter ---- */}
      <section>
        <h3 className="mb-2 text-fliess font-semibold text-ink-200">Wetter</h3>
        <WeatherPanel
          forecast={forecast}
          loading={loading}
          error={error}
          targetElevation={trip.elevation}
          outOfRange={outOfRange}
          partial={partial}
        />
      </section>

      {/* ---- Grundlage der Empfehlung ---- */}
      <section className="rounded-mittel bg-flaeche-1 p-3 text-fliess">
        <p className="text-ink-300">
          Die Liste rechnet mit einer kältesten Nacht von{' '}
          <strong className="text-ink-50">{packlist.basedOnNightTemp.toLocaleString('de-DE')} °C</strong> auf {trip.elevation} m.
        </p>
        <p className="mt-1 text-klein text-ink-500">
          {packlist.fromForecast
            ? partial
              ? 'Aus der Vorhersage für den Teil des Zeitraums abgeleitet, der noch im 16-Tage-Fenster liegt.'
              : 'Aus der Vorhersage für deinen Reisezeitraum abgeleitet.'
            : `Aus der Jahreszeit geschätzt — dein Zeitraum liegt ausserhalb des Vorhersagefensters (Open-Meteo reicht ${MAX_FORECAST_DAYS} Tage voraus).`}
        </p>
      </section>

      <Packliste packlist={packlist} staende={staende} onStand={onStand} personen={trip.persons} />

      {/* ---- Verpflegung ---- */}
      <section>
        <h3 className="mb-2 text-fliess font-semibold text-ink-200">Verpflegung</h3>
        <div className="rounded-mittel border border-kante p-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Stat label="Pro Person und Tag" value={`${packlist.food.kcalPerPersonPerDay} kcal`} />
            <Stat label="Gesamt" value={`${packlist.food.totalKcal.toLocaleString('de-DE')} kcal`} />
            <Stat label="Gewicht Verpflegung" value={formatWeight(packlist.food.weight_g)} />
          </div>
          <p className="mt-2.5 border-t border-kante pt-2 text-mikro leading-relaxed text-ink-500">
            Annahmen: {packlist.food.assumptions.join(' · ')}. Grobe Richtwerte, kein Ernährungsplan.
          </p>
        </div>
      </section>

      <p className="rounded-mittel bg-geduldet-500/10 p-3 text-klein leading-relaxed text-geduldet-200/90">
        Die Packliste ersetzt keine eigene Tourenplanung. Prüfe Wetterbericht, Lawinenlage und
        Kondition unabhängig — und ob Übernachten an deinem Ziel überhaupt zulässig ist.
      </p>
    </div>
  )
}

/* ---------------- kleine Bausteine ---------------- */

/** Ein Wert, den die Route selbst hergibt — mit der Quelle darunter. */
function Abgelesen({
  icon: Icon, label, wert, woher,
}: { icon: LucideIcon; label: string; wert: string; woher: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} strokeWidth={1.9} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />
      <div>
        <p className="text-mikro uppercase text-ink-500">{label}</p>
        <p className="text-fliess font-semibold text-ink-50">{wert}</p>
        <p className="text-mikro normal-case tracking-normal text-ink-600">{woher}</p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-mikro uppercase text-ink-500">{label}</p>
      <p className="text-ueberschrift font-semibold text-ink-50">{value}</p>
    </div>
  )
}
