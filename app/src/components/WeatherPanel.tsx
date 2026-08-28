/** Wettervorhersage für den Tourzeitraum — Abschnitt 4.5. */
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Forecast } from '../services/weather'
import { adjustToElevation } from '../services/weather'
import { Hinweis, Label } from '../ui'

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** WMO-Code auf ein Icon abbilden — ein Set, keine Emoji-Sammlung. */
function iconFuer(code: number): LucideIcon {
  if (code <= 1) return Sun
  if (code === 2) return CloudSun
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if (code >= 61 && code <= 67) return CloudRain
  if (code >= 71 && code <= 77) return CloudSnow
  if (code >= 80 && code <= 82) return CloudRain
  if (code >= 85 && code <= 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

/** Sonnig warm, Niederschlag kühl-blau, Gewitter als Signal. */
function farbeFuer(code: number): string {
  if (code <= 2) return 'text-geduldet-400'
  if (code >= 95) return 'text-verboten-400'
  if (code >= 71 && code <= 86) return 'text-gletscher-200'
  if (code >= 51) return 'text-gletscher-400'
  return 'text-ink-400'
}

interface Props {
  forecast: Forecast | null
  loading: boolean
  error: string | null
  targetElevation: number
  outOfRange: boolean
  partial: boolean
}

export function WeatherPanel({ forecast, loading, error, targetElevation, outOfRange, partial }: Props) {
  if (outOfRange) {
    return (
      <Hinweis ton="info">
        Dein Startdatum liegt weiter als 16 Tage in der Zukunft - so weit reicht keine seriöse
        Vorhersage. Die Packliste rechnet solange mit Erfahrungswerten für die gewählte Jahreszeit.
      </Hinweis>
    )
  }
  if (loading) {
    return (
      <div className="flex gap-2" aria-label="Wetter wird geladen">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 w-[4.75rem] animate-pulse rounded-mittel bg-flaeche-3" />
        ))}
      </div>
    )
  }
  if (error) return <Hinweis ton="fehler">Wetter konnte nicht geladen werden: {error}</Hinweis>
  if (!forecast) return null

  const versatz = targetElevation - forecast.elevation

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {forecast.days.map((d) => {
          const min = adjustToElevation(d.tempMin, forecast.elevation, targetElevation)
          const max = adjustToElevation(d.tempMax, forecast.elevation, targetElevation)
          const datum = new Date(d.date + 'T12:00:00')
          const Icon = iconFuer(d.code)
          return (
            <div
              key={d.date}
              title={d.description}
              className="w-[4.75rem] shrink-0 rounded-mittel border border-kante bg-flaeche-1 px-2 py-2.5 text-center"
            >
              <p className="text-mikro font-semibold uppercase text-ink-500">
                {WOCHENTAGE[datum.getDay()]}
              </p>
              <Icon size={22} strokeWidth={1.75} aria-hidden
                    className={`mx-auto my-1.5 ${farbeFuer(d.code)}`} />
              <p className="text-fliess font-semibold text-ink-50">{Math.round(max)}°</p>
              <p className="text-klein text-gletscher-300">{Math.round(min)}°</p>
              {d.precipitation > 0 && (
                <p className="mt-1 text-mikro normal-case tracking-normal text-ink-500">
                  {d.precipitation.toFixed(1)} mm
                </p>
              )}
            </div>
          )
        })}
      </div>

      {partial && (
        <Hinweis ton="warnung" className="mt-2.5">
          Nur der Anfang deiner Tour liegt im Vorhersagefenster - die späteren Tage sind nicht abgedeckt.
        </Hinweis>
      )}

      <p className="mt-2.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
        <Label className="inline normal-case tracking-normal">Quelle:</Label>{' '}
        Open-Meteo. Das Modell rechnet für {Math.round(forecast.elevation)} m;
        {versatz === 0
          ? ' deine Tourhöhe entspricht dem.'
          : ` die Werte sind auf ${targetElevation} m umgerechnet (${versatz > 0 ? '+' : ''}${versatz} m, rund 0,65 °C je 100 m).`}{' '}
        Im Gebirge ist das eine Näherung - Wind, Hangneigung und Kaltluftseen können deutlich abweichen.
      </p>
    </div>
  )
}
