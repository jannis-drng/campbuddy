/**
 * SCHICHT 1 — LEGALITÄTS-DATENSCHICHT (Typen)
 *
 * Das Datenmodell folgt Abschnitt 8 der Spezifikation. Es ist bewusst
 * datenbank-nah gehalten, damit der spätere Umzug von statischem JSON
 * nach Supabase/PostGIS ein Austausch der Zugriffs-Funktionen bleibt
 * und keine Änderung an der UI erfordert.
 */

export type LegalStatus = 'allowed' | 'forbidden' | 'tolerated' | 'unknown'

/** Für Zelt / Fahrzeug / Feuer: erlaubt, verboten oder an Bedingungen geknüpft. */
export type Permission = 'yes' | 'no' | 'conditional' | 'unknown'

/**
 * Prüfstand der rechtlichen Einstufung. Steuert direkt die Warnhinweise im UI.
 * - 'entwurf'    = aus allgemeinem Rechtsrahmen abgeleitet, NICHT amtlich geprüft
 * - 'quelle'     = mit benannter offizieller Quelle belegt
 * - 'vor-ort'    = zusätzlich selbst vor Ort verifiziert
 */
export type ReviewStatus = 'entwurf' | 'quelle' | 'vor-ort'

export interface Zone {
  id: string
  region: RegionCode
  name: string
  status: LegalStatus
  tent_allowed: Permission
  vehicle_allowed: Permission
  fire_allowed: Permission
  /** Freitext-Bedingungen, z.B. "nur oberhalb der Waldgrenze, eine Nacht". */
  conditions: string | null
  source: string | null
  source_url: string | null
  /** ISO-Datum der letzten eigenen Prüfung. null = noch nie geprüft. */
  last_verified: string | null
  review_status: ReviewStatus
  notes: string | null
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export type PointType = 'hut' | 'campsite' | 'vehicle_spot'

export interface Point {
  id: string
  region: RegionCode
  type: PointType
  name: string
  lat: number
  lng: number
  elevation: number | null
  info: {
    operator?: string | null
    phone?: string | null
    website?: string | null
    capacity?: string | null
    opening_hours?: string | null
    seasonal?: string | null
  }
  source: string | null
  source_url: string | null
  last_verified: string | null
}

export type RegionCode = string

export interface Region {
  code: RegionCode
  name: string
  country: string
  center: [number, number]
  zoom: number
  bounds: [number, number, number, number]
  /** Der allgemeine Rechtsrahmen der Region — wird im UI als Kontext gezeigt. */
  legal_framework: {
    summary: string
    baseline_status: LegalStatus
    references: { label: string; url: string }[]
  }
}

/** Filterzustand der Kartenansicht. */
export interface MapFilters {
  tent: boolean
  vehicle: boolean
  fire: boolean
  showHuts: boolean
  showCampsites: boolean
  showVehicleSpots: boolean
}
