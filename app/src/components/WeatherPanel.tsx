/** Wettervorhersage für den Tourzeitraum [BALD] — Abschnitt 4.5. */
import type { Forecast } from '../services/weather'
import { adjustToElevation } from '../services/weather'

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function iconFor(code: number): string {
  if (code === 0 || code === 1) return '☀️'
  if (code === 2) return '⛅'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 77) return '🌨️'
  if (code >= 80 && code <= 82) return '🌧️'
  if (code >= 85 && code <= 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '·'
}

interface Props {
  forecast: Forecast | null
  loading: boolean
  error: string | null
  targetElevation: number
  /** Reisebeginn liegt jenseits des Vorhersagefensters. */
  outOfRange: boolean
  /** Nur ein Teil des Zeitraums ist abgedeckt. */
  partial: boolean
}

export function WeatherPanel({ forecast, loading, error, targetElevation, outOfRange, partial }: Props) {
  if (outOfRange) {
    return (
      <p className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-slate-400">
        Dein Startdatum liegt weiter als 16 Tage in der Zukunft — so weit reicht keine
        seriöse Vorhersage. Die Packliste rechnet solange mit Erfahrungswerten für die
        gewählte Jahreszeit.
      </p>
    )
  }
  if (loading) return <p className="text-sm text-slate-400">Wetter wird geladen …</p>
  if (error) {
    return (
      <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
        Wetter konnte nicht geladen werden: {error}
      </p>
    )
  }
  if (!forecast) return null

  const delta = targetElevation - forecast.elevation

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {forecast.days.map((d) => {
          const min = adjustToElevation(d.tempMin, forecast.elevation, targetElevation)
          const max = adjustToElevation(d.tempMax, forecast.elevation, targetElevation)
          const date = new Date(d.date + 'T12:00:00')
          return (
            <div
              key={d.date}
              className="min-w-[4.6rem] shrink-0 rounded-lg bg-white/5 p-2 text-center"
              title={d.description}
            >
              <p className="text-[11px] text-slate-400">{DAY_NAMES[date.getDay()]}</p>
              <p className="text-lg leading-tight">{iconFor(d.code)}</p>
              <p className="text-xs font-medium text-slate-100">{Math.round(max)}°</p>
              <p className="text-xs text-sky-300">{Math.round(min)}°</p>
              {d.precipitation > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-400">{d.precipitation.toFixed(1)} mm</p>
              )}
            </div>
          )
        })}
      </div>

      {partial && (
        <p className="mt-2 rounded bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200/90">
          Nur der Anfang deiner Tour liegt im Vorhersagefenster — die späteren Tage sind nicht abgedeckt.
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Quelle: Open-Meteo. Das Modell rechnet für {Math.round(forecast.elevation)} m;
        {delta === 0
          ? ' deine Tourhöhe entspricht dem.'
          : ` die Werte sind auf ${targetElevation} m umgerechnet (${delta > 0 ? '+' : ''}${delta} m, rund 0,65 °C je 100 m).`}{' '}
        Im Gebirge ist das eine Näherung — Wind, Hangneigung und Kaltluftseen können deutlich abweichen.
      </p>
    </div>
  )
}
