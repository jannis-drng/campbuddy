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

/**
 * Eine gespeicherte Tour (Abschnitte 8.4 und 8.6 zusammengelegt).
 *
 * Verlauf und Eckdaten lagen bis Migration 0016 in zwei Tabellen (`routes`
 * und `trips`). Was jemand plant, ist aber eine Sache: ein Weg mit einem
 * Datum, einer Dauer und einer Packliste. Zweimal speichern hiess in der
 * Oberfläche zwei Listen und die unbeantwortbare Frage, ob die eigene Tour
 * nun die Route oder die Tour sei.
 *
 * Die Eckdaten sind optional: eine Tour darf gespeichert werden, bevor jemand
 * ein Datum gesetzt hat.
 */
export interface Tour {
  id: string
  user_id: string
  name: string
  region: string
  /** GeoJSON-LineString des gerouteten Verlaufs. Leer = Tour ohne Weg. */
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  /** Die vom Nutzer gesetzten Stützpunkte, damit die Route weiterbearbeitbar bleibt. */
  waypoints: [number, number][] | null
  /** Opt-in: nur ausdrücklich veröffentlichte Touren sind für andere sichtbar. */
  is_public: boolean
  beschreibung: string | null
  /** Frei wählbarer Anzeigename — niemand muss seine Mailadresse veröffentlichen. */
  autor: string | null
  created_at: string
  /** Wann geteilt. Null, solange die Tour privat ist. */
  veroeffentlicht_am: string | null

  /* --- Eckdaten der Planung (vormals `trips`) --- */
  start_date: string | null
  days: number | null
  persons: number | null
  /** Geplante Schlafhöhe in Metern — bestimmt Temperatur und Ausrüstung. */
  elevation: number | null
  season: 'sommer' | 'uebergang' | 'winter' | null
  shelter: 'zelt' | 'biwak' | 'huette' | null

  /* --- Einmal beim Speichern berechnet, damit die Übersicht nicht rechnen muss --- */
  distance_m: number | null
  ascent_m: number | null
  duration_s: number | null

  /* --- Community-Zähler, von Triggern gepflegt (Migration 0016) --- */
  likes_count: number
  kommentare_count: number
}

/**
 * Eine geteilte Tour, wie sie Fremde zu sehen bekommen.
 *
 * Bewusst ohne `user_id`: die View `oeffentliche_routen` gibt sie nicht heraus.
 * Der Typ hält das fest, damit niemand versehentlich wieder danach greift und
 * die Spalte zurückholt.
 */
export type PublicTour = Omit<Tour, 'user_id'>

/** Ein Kommentar, wie ihn die View `oeffentliche_kommentare` herausgibt. */
export interface Kommentar {
  id: string
  route_id: string
  /** Der Beitrag, auf den geantwortet wurde. Null = eigenständiger Beitrag. */
  eltern_id: string | null
  /** Oberster Beitrag des Strangs. Null bei einem Ursprung selbst. */
  wurzel_id: string | null
  /** 0 = Ursprung, 1 = Antwort darauf, und so fort. Gedeckelt bei 6. */
  tiefe: number
  autor: string | null
  text: string
  created_at: string
  likes_count: number
}

/** Ein Kommentar samt der Antworten darunter — beliebig tief verschachtelt. */
export interface KommentarKnoten extends Kommentar {
  antworten: KommentarKnoten[]
}
