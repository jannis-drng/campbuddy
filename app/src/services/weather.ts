/**
 * SCHICHT 2 — externe Open-Data-Dienste (wie die Kartenschicht austauschbar).
 *
 * Open-Meteo nach Abschnitt 6 der Spezifikation: kostenlos, kein API-Key,
 * keine Registrierung. Die UI kennt nur `loadForecast` und `Forecast` —
 * ein Anbieterwechsel bliebe auf diese Datei beschränkt.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

/** Open-Meteo liefert höchstens 16 Tage Vorhersage. */
export const MAX_FORECAST_DAYS = 16

export interface ForecastDay {
  date: string
  tempMin: number
  tempMax: number
  precipitation: number
  windMax: number
  code: number
  description: string
}

export interface Forecast {
  /** Höhe des Modell-Gitterpunkts — weicht von der realen Tourhöhe ab. */
  elevation: number
  days: ForecastDay[]
}

/** WMO-Wettercodes, auf das reduziert, was draussen wirklich zählt. */
const WMO: Record<number, string> = {
  0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bedeckt',
  45: 'Nebel', 48: 'Reifnebel',
  51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen',
  56: 'Gefrierender Niesel', 57: 'Starker gefrierender Niesel',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen',
  66: 'Gefrierender Regen', 67: 'Starker gefrierender Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall',
  77: 'Schneegriesel',
  80: 'Leichte Regenschauer', 81: 'Regenschauer', 82: 'Heftige Regenschauer',
  85: 'Leichte Schneeschauer', 86: 'Starke Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Schweres Gewitter mit Hagel',
}

export function describeWeather(code: number): string {
  return WMO[code] ?? 'Unbekannt'
}

export async function loadForecast(
  lat: number,
  lng: number,
  days: number,
  signal?: AbortSignal,
): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: String(Math.min(Math.max(days, 1), MAX_FORECAST_DAYS)),
  })

  const res = await fetch(`${ENDPOINT}?${params}`, { signal })
  if (!res.ok) throw new Error(`Wetterdienst antwortete mit ${res.status}`)
  const json = await res.json()

  const d = json.daily
  return {
    elevation: json.elevation,
    days: d.time.map((date: string, i: number) => ({
      date,
      tempMin: d.temperature_2m_min[i],
      tempMax: d.temperature_2m_max[i],
      precipitation: d.precipitation_sum[i],
      windMax: d.wind_speed_10m_max[i],
      code: d.weather_code[i],
      description: describeWeather(d.weather_code[i]),
    })),
  }
}

/**
 * Temperatur auf die tatsächliche Tourhöhe umrechnen.
 * Trockenadiabatisch rund 0,65 °C pro 100 Höhenmeter — eine Faustformel,
 * die im Gebirge gut genug ist, um Schlafsack und Kleidung zu wählen.
 */
export function adjustToElevation(temp: number, fromElevation: number, toElevation: number): number {
  return temp - ((toElevation - fromElevation) / 100) * 0.65
}

/** Kälteste zu erwartende Nacht auf Tourhöhe — die Zahl, die den Schlafsack bestimmt. */
export function coldestNight(forecast: Forecast, targetElevation: number): number {
  const min = Math.min(...forecast.days.map((d) => d.tempMin))
  return adjustToElevation(min, forecast.elevation, targetElevation)
}

/** Tage zwischen heute und einem ISO-Datum (negativ = liegt in der Vergangenheit). */
export function daysFromToday(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(isoDate + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export interface TripForecast {
  /** Nur die Tage, die tatsächlich im Reisezeitraum liegen. */
  forecast: Forecast | null
  /** true, wenn der Zeitraum ganz oder teilweise ausserhalb des Vorhersagefensters liegt. */
  partial: boolean
}

/**
 * Schneidet die Vorhersage auf den Reisezeitraum zu.
 *
 * Ohne diesen Schritt würde die Packliste die nächsten Tage ab heute bewerten,
 * auch wenn die Tour erst in zwei Monaten startet — die Temperaturannahme wäre
 * dann schlicht falsch.
 */
export function sliceToTrip(full: Forecast, startDate: string, days: number): TripForecast {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + days - 1)

  const inRange = full.days.filter((d) => {
    const day = new Date(d.date + 'T00:00:00')
    return day >= start && day <= end
  })

  if (inRange.length === 0) return { forecast: null, partial: true }
  return { forecast: { elevation: full.elevation, days: inRange }, partial: inRange.length < days }
}
