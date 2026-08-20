/**
 * Ausrüstungs- und Verpflegungsgenerator mit Wetter (Abschnitte 4.3 und 4.5).
 *
 * Wird ausschliesslich in die Tour-Auswertung eingebettet — dort liegen die
 * Eckdaten, aus denen die Liste entsteht.
 * Führt Tour-Eckdaten, Wettervorhersage und generierte Packliste zusammen.
 * Die Affiliate-Ebene ist eingebunden, aber weiterhin unangebunden: solange
 * keine Partner-ID konfiguriert ist, steht am Produkt "Kauf-Link bald verfügbar".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Eingabe, Button } from '../ui'
import type { Region, Season, TripParams } from '../data/types'
import { buildPacklist, formatWeight } from '../affiliate/packlist'
import { buildAffiliateUrl } from '../affiliate/affiliateConfig'
import {
  coldestNight, daysFromToday, loadForecast, MAX_FORECAST_DAYS, sliceToTrip, type Forecast,
} from '../services/weather'
import { WeatherPanel } from './WeatherPanel'

const SEASONS: { key: Season; label: string }[] = [
  { key: 'sommer', label: 'Sommer' },
  { key: 'uebergang', label: 'Übergang' },
  { key: 'winter', label: 'Winter' },
]

const SHELTERS: { key: TripParams['shelter']; label: string; hint: string }[] = [
  { key: 'biwak', label: 'Biwak', hint: 'ohne Zelt, nur Biwaksack' },
  { key: 'zelt', label: 'Zelt', hint: 'nur wo erlaubt oder geduldet' },
  { key: 'huette', label: 'Hütte', hint: 'bewirtschaftete Übernachtung' },
]

function defaultTrip(): TripParams {
  return {
    start_date: new Date().toISOString().slice(0, 10),
    days: 3,
    persons: 2,
    elevation: 2400,
    season: seasonForDate(new Date()),
    shelter: 'biwak',
  }
}

/** Grobe Zuordnung Monat → Jahreszeit für die Alpen. */
function seasonForDate(d: Date): Season {
  const m = d.getMonth() + 1
  if (m >= 7 && m <= 8) return 'sommer'
  if (m >= 11 || m <= 3) return 'winter'
  return 'uebergang'
}

export function TripPlanner({
  region, onSave, initial,
}: {
  region: Region
  /** null = kein Backend oder nicht angemeldet. */
  onSave: ((name: string, trip: TripParams) => Promise<void>) | null
  /**
   * Vorbelegung aus einer gezeichneten Route: Dauer aus den Etappen, Schlafhöhe
   * aus dem Höhenprofil. Dadurch passt die Packliste zur konkreten Tour, statt
   * bei Standardwerten zu beginnen.
   */
  initial?: Partial<TripParams>
}) {
  const [trip, setTrip] = useState<TripParams>(() => ({ ...defaultTrip(), ...initial }))

  // Ändert sich die Route, sollen Dauer und Höhe der Packliste folgen — es sei
  // denn, der Nutzer hat den Wert inzwischen selbst gesetzt.
  const initialSchluessel = JSON.stringify(initial ?? {})
  const letzteVorbelegung = useRef(initialSchluessel)
  useEffect(() => {
    if (!initial || initialSchluessel === letzteVorbelegung.current) return
    letzteVorbelegung.current = initialSchluessel
    setTrip((t) => ({ ...t, ...initial }))
  }, [initial, initialSchluessel])
  // Die Jahreszeit folgt dem Startdatum, bis sie einmal von Hand gesetzt wurde.
  // Sonst stünde bei einem Dezember-Termin weiter "Sommer" und die
  // Temperaturschätzung wäre um Größenordnungen daneben.
  const [seasonTouched, setSeasonTouched] = useState(false)
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

  const derivedSeason = seasonForDate(new Date(trip.start_date + 'T12:00:00'))
  useEffect(() => {
    if (!seasonTouched && derivedSeason !== trip.season) {
      setTrip((t) => ({ ...t, season: derivedSeason }))
    }
  }, [derivedSeason, seasonTouched, trip.season])

  const [saveName, setSaveName] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onSave || !saveName.trim()) return
    setSaveState('busy'); setSaveError(null)
    try {
      await onSave(saveName.trim(), trip)
      setSaveState('ok'); setSaveName('')
    } catch (err) {
      setSaveState('error'); setSaveError((err as Error).message)
    }
  }

  const set = <K extends keyof TripParams>(key: K, value: TripParams[K]) =>
    setTrip((t) => ({ ...t, [key]: value }))

  return (
    <div className="space-y-5">

      {/* ---- Eckdaten ---- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Start">
          <input
            type="date"
            value={trip.start_date}
            onChange={(e) => set('start_date', e.target.value)}
            className=""
          />
        </Field>
        <Field label="Tage">
          <input
            type="number" min={1} max={30} value={trip.days}
            onChange={(e) => set('days', clamp(Number(e.target.value), 1, 30))}
            className=""
          />
        </Field>
        <Field label="Personen">
          <input
            type="number" min={1} max={12} value={trip.persons}
            onChange={(e) => set('persons', clamp(Number(e.target.value), 1, 12))}
            className=""
          />
        </Field>
        <Field label="Schlafhöhe (m)">
          <input
            type="number" min={200} max={4000} step={100} value={trip.elevation}
            onChange={(e) => set('elevation', clamp(Number(e.target.value), 200, 4000))}
            className=""
          />
        </Field>
      </section>

      <section className="flex flex-wrap gap-x-6 gap-y-3">
        <Choice
          label="Jahreszeit"
          options={SEASONS}
          value={trip.season}
          onChange={(v) => { setSeasonTouched(true); set('season', v) }}
        />
        <Choice label="Übernachtung" options={SHELTERS} value={trip.shelter} onChange={(v) => set('shelter', v)} />
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
          <strong className="text-ink-50">{packlist.basedOnNightTemp} °C</strong> auf {trip.elevation} m.
        </p>
        <p className="mt-1 text-klein text-ink-500">
          {packlist.fromForecast
            ? partial
              ? 'Aus der Vorhersage für den Teil des Zeitraums abgeleitet, der noch im 16-Tage-Fenster liegt.'
              : 'Aus der Vorhersage für deinen Reisezeitraum abgeleitet.'
            : `Aus der Jahreszeit geschätzt — dein Zeitraum liegt ausserhalb des Vorhersagefensters (Open-Meteo reicht ${MAX_FORECAST_DAYS} Tage voraus).`}
        </p>
      </section>

      {/* ---- Packliste ---- */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-fliess font-semibold text-ink-200">Packliste</h3>
          <span className="text-klein text-ink-500">
            Ausrüstung gesamt ca. {formatWeight(packlist.totalWeight_g)} für {trip.persons}{' '}
            {trip.persons === 1 ? 'Person' : 'Personen'}
          </span>
        </div>

        <div className="space-y-4">
          {packlist.categories.map(({ category, entries }) => (
            <div key={category}>
              <h4 className="mb-1 text-mikro uppercase text-ink-500">{category}</h4>
              <ul className="divide-y divide-kante rounded-mittel border border-kante">
                {entries.map(({ item, quantity, weight_g }) => {
                  const url = buildAffiliateUrl(item.vendor, item.affiliate_url)
                  return (
                    <li key={item.id} className="p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="font-medium text-ink-50">
                          {quantity > 1 && <span className="text-ink-400">{quantity}× </span>}
                          {item.name}
                          {item.essential && (
                            <span className="ml-2 rounded bg-geduldet-500/15 px-1.5 py-0.5 text-mikro text-geduldet-300">
                              wichtig
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-klein text-ink-500">
                          {weight_g != null && `${formatWeight(weight_g)} · `}
                          {item.price_hint ?? '—'}
                        </span>
                      </div>
                      <p className="mt-1 text-klein leading-relaxed text-ink-400">{item.rationale}</p>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer noopener sponsored"
                           className="mt-1.5 inline-block text-klein text-gletscher-400 hover:underline">
                          Zum Produkt <ExternalLink size={11} strokeWidth={2.5} className="inline" aria-hidden />
                        </a>
                      ) : item.vendor ? (
                        <span className="mt-1.5 inline-block rounded bg-flaeche-1 px-2 py-0.5 text-mikro text-ink-500">
                          Kauf-Link bald verfügbar
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

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
            Annahmen: {packlist.food.assumptions.join(' · ')}. Grobe Richtwerte, kein Ernährungsplan —
            wie viel du wirklich brauchst, hängt von Tempo, Gewicht und Körperbau ab.
          </p>
        </div>
      </section>

      {onSave && (
        <form onSubmit={save} className="flex flex-wrap gap-2">
          <Eingabe
            value={saveName}
            onChange={(e) => { setSaveName(e.target.value); setSaveState('idle') }}
            placeholder="Tour benennen und speichern"
            maxLength={120}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variante="primaer" groesse="gross"
                  disabled={!saveName.trim() || saveState === 'busy'}>
            {saveState === 'busy' ? 'Speichere …' : 'Speichern'}
          </Button>
          {saveState === 'ok' && <p className="w-full text-klein text-gletscher-300">Tour gespeichert.</p>}
          {saveState === 'error' && <p className="w-full text-klein text-verboten-300">{saveError}</p>}
        </form>
      )}

      <p className="rounded-mittel bg-geduldet-500/10 p-3 text-klein leading-relaxed text-geduldet-200/90">
        Die Packliste ersetzt keine eigene Tourenplanung. Prüfe Wetterbericht, Lawinenlage und
        Kondition unabhängig — und ob Übernachten an deinem Ziel überhaupt zulässig ist.
      </p>
    </div>
  )
}

/* ---------------- kleine Bausteine ---------------- */

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-mikro uppercase text-ink-500">{label}</span>
      {children}
    </label>
  )
}

function Choice<T extends string>({
  label, options, value, onChange,
}: {
  label: string
  options: { key: T; label: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <span className="mb-1 block text-mikro uppercase text-ink-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={value === o.key}
            title={o.hint}
            className={`min-h-9 rounded-full px-3 py-1.5 text-fliess transition ${
              value === o.key
                ? 'bg-gletscher-500/20 text-gletscher-200 ring-1 ring-gletscher-500/40'
                : 'bg-flaeche-1 text-ink-400 ring-1 ring-kante hover:bg-flaeche-3'
            }`}
          >
            {o.label}
          </button>
        ))}
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
