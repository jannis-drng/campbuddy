/**
 * Tourplanung [BALD] — Abschnitte 4.3 und 4.5 der Spezifikation.
 *
 * Führt Tour-Eckdaten, Wettervorhersage und generierte Packliste zusammen.
 * Die Affiliate-Ebene ist eingebunden, aber weiterhin unangebunden: solange
 * keine Partner-ID konfiguriert ist, steht am Produkt "Kauf-Link bald verfügbar".
 */
import { useEffect, useMemo, useState } from 'react'
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

export function TripPlanner({ region }: { region: Region }) {
  const [trip, setTrip] = useState<TripParams>(defaultTrip)
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

  const set = <K extends keyof TripParams>(key: K, value: TripParams[K]) =>
    setTrip((t) => ({ ...t, [key]: value }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-5 pb-16">
      <section>
        <h2 className="text-lg font-semibold">Tour planen</h2>
        <p className="mt-0.5 text-sm text-slate-400">
          Aus deinen Eckdaten und der Vorhersage für {region.name} entsteht eine Packliste
          und die Verpflegungsmenge.
        </p>
      </section>

      {/* ---- Eckdaten ---- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Start">
          <input
            type="date"
            value={trip.start_date}
            onChange={(e) => set('start_date', e.target.value)}
            className="w-full min-h-10 rounded-lg border border-white/10 bg-slate-800 px-2.5 text-sm"
          />
        </Field>
        <Field label="Tage">
          <input
            type="number" min={1} max={30} value={trip.days}
            onChange={(e) => set('days', clamp(Number(e.target.value), 1, 30))}
            className="w-full min-h-10 rounded-lg border border-white/10 bg-slate-800 px-2.5 text-sm"
          />
        </Field>
        <Field label="Personen">
          <input
            type="number" min={1} max={12} value={trip.persons}
            onChange={(e) => set('persons', clamp(Number(e.target.value), 1, 12))}
            className="w-full min-h-10 rounded-lg border border-white/10 bg-slate-800 px-2.5 text-sm"
          />
        </Field>
        <Field label="Schlafhöhe (m)">
          <input
            type="number" min={200} max={4000} step={100} value={trip.elevation}
            onChange={(e) => set('elevation', clamp(Number(e.target.value), 200, 4000))}
            className="w-full min-h-10 rounded-lg border border-white/10 bg-slate-800 px-2.5 text-sm"
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
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Wetter</h3>
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
      <section className="rounded-lg bg-white/5 p-3 text-sm">
        <p className="text-slate-300">
          Die Liste rechnet mit einer kältesten Nacht von{' '}
          <strong className="text-slate-100">{packlist.basedOnNightTemp} °C</strong> auf {trip.elevation} m.
        </p>
        <p className="mt-1 text-xs text-slate-500">
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
          <h3 className="text-sm font-semibold text-slate-200">Packliste</h3>
          <span className="text-xs text-slate-500">
            Ausrüstung gesamt ca. {formatWeight(packlist.totalWeight_g)} für {trip.persons}{' '}
            {trip.persons === 1 ? 'Person' : 'Personen'}
          </span>
        </div>

        <div className="space-y-4">
          {packlist.categories.map(({ category, entries }) => (
            <div key={category}>
              <h4 className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{category}</h4>
              <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                {entries.map(({ item, quantity, weight_g }) => {
                  const url = buildAffiliateUrl(item.vendor, item.affiliate_url)
                  return (
                    <li key={item.id} className="p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="font-medium text-slate-100">
                          {quantity > 1 && <span className="text-slate-400">{quantity}× </span>}
                          {item.name}
                          {item.essential && (
                            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                              wichtig
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {weight_g != null && `${formatWeight(weight_g)} · `}
                          {item.price_hint ?? '—'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.rationale}</p>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer noopener sponsored"
                           className="mt-1.5 inline-block text-xs text-sky-400 hover:underline">
                          Zum Produkt ↗
                        </a>
                      ) : item.vendor ? (
                        <span className="mt-1.5 inline-block rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-500">
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
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Verpflegung</h3>
        <div className="rounded-lg border border-white/10 p-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Stat label="Pro Person und Tag" value={`${packlist.food.kcalPerPersonPerDay} kcal`} />
            <Stat label="Gesamt" value={`${packlist.food.totalKcal.toLocaleString('de-DE')} kcal`} />
            <Stat label="Gewicht Verpflegung" value={formatWeight(packlist.food.weight_g)} />
          </div>
          <p className="mt-2.5 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-slate-500">
            Annahmen: {packlist.food.assumptions.join(' · ')}. Grobe Richtwerte, kein Ernährungsplan —
            wie viel du wirklich brauchst, hängt von Tempo, Gewicht und Körperbau ab.
          </p>
        </div>
      </section>

      <p className="rounded-lg bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200/90">
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
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
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
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={value === o.key}
            title={o.hint}
            className={`min-h-9 rounded-full px-3 py-1.5 text-sm transition ${
              value === o.key
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'
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
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-100">{value}</p>
    </div>
  )
}
