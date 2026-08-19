/**
 * Backend-Anbindung [BALD] — Abschnitt 6 und 8.3/8.4/8.6 der Spezifikation.
 *
 * Supabase im EU-Hosting, mit optionalem Login. Die App muss ohne Konto
 * vollständig nutzbar bleiben (Abschnitt 3: "Kein Login nötig zum Ansehen"),
 * deshalb ist der Client hier optional: fehlt die Konfiguration, liefert
 * `getSupabase()` null und das UI blendet alles Konto-Bezogene aus, statt
 * Fehler zu werfen.
 *
 * Verwendet wird ausschliesslich der *publishable* Schlüssel. Der ist dafür
 * gemacht, im Browser zu stehen — der Schutz kommt aus Row Level Security.
 * Ein `sb_secret_…`-Schlüssel gehört nie in dieses Bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && key)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

/** Eine gespeicherte Route (Abschnitt 8.4). */
export interface StoredRoute {
  id: string
  user_id: string
  name: string
  region: string
  /** GeoJSON-LineString des gerouteten Verlaufs. */
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  /** Die vom Nutzer gesetzten Stützpunkte, damit die Route weiterbearbeitbar bleibt. */
  waypoints: [number, number][] | null
  /** Opt-in: nur ausdrücklich veröffentlichte Routen sind für andere sichtbar. */
  is_public: boolean
  beschreibung: string | null
  /** Frei wählbarer Anzeigename — niemand muss seine Mailadresse veröffentlichen. */
  autor: string | null
  created_at: string
}

/** Eine gespeicherte Tour (Abschnitt 8.6). */
export interface StoredTrip {
  id: string
  user_id: string
  route_id: string | null
  name: string
  start_date: string
  days: number
  persons: number
  elevation: number
  season: string
  shelter: string
  region: string | null
  distance_m: number | null
  ascent_m: number | null
  duration_s: number | null
  created_at: string
}
