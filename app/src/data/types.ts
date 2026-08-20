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

/**
 * Natur-Objekte aus OpenStreetMap: Wasser und Aussicht.
 *
 * Bewusst getrennt von `Point`: `Point` sind Orte zum Übernachten und tragen
 * deshalb eine rechtliche Relevanz und ein Prüfdatum. Ein Brunnen hat beides
 * nicht — er ist Orientierung, keine Aussage über die Rechtslage.
 */
export type NatureType = 'lake' | 'spring' | 'drinking_water' | 'waterfall' | 'viewpoint'

export interface NatureFeature {
  id: string
  region: RegionCode
  type: NatureType
  name: string
  /** false = der Name ist nur die Gattung („Quelle"), nicht aus OSM. */
  benannt: boolean
  lat: number
  lng: number
  elevation: number | null
  source_url: string
}

/** Benannter Gipfel mit Höhe — Orientierung und später Etappenbenennung. */
export interface Peak {
  id: string
  region: RegionCode
  name: string
  lat: number
  lng: number
  elevation: number
  source_url: string
}

/**
 * Ein selbst markierter Punkt.
 *
 * Der bewusste Unterschied zu `Point` und `NatureFeature`: das hier ist eine
 * *Meinung* („schöner Aussichtspunkt"), keine Auskunft. Deshalb steht sie nie
 * in derselben Ebene wie die Rechtsdaten, trägt kein Prüfdatum und ist
 * standardmässig privat — Veröffentlichen ist ausdrücklich opt-in, wie bei
 * den Routen.
 */
export type EigenerPunktTyp = 'viewpoint' | 'campspot' | 'water' | 'foto' | 'sonstiges'

export interface EigenerPunkt {
  id: string
  user_id?: string
  region: RegionCode
  typ: EigenerPunktTyp
  name: string
  notiz: string | null
  lat: number
  lng: number
  /** Pfad im Storage-Bucket, nicht die fertige URL — die ist zeitlich begrenzt. */
  foto_pfad: string | null
  /** Bezug zu einer Route, wenn der Punkt beim Planen entstanden ist. */
  route_id: string | null
  ist_oeffentlich: boolean
  created_at?: string
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

/**
 * Wofür die Karte gerade eingefärbt wird.
 * 'all' zeigt die Gesamteinstufung der Zone, sonst die Regel für genau diese Aktivität.
 */
export type ActivityMode = 'all' | 'tent' | 'vehicle' | 'fire'

/** Filterzustand der Kartenansicht. */
export interface MapFilters {
  activity: ActivityMode
  showHuts: boolean
  showCampsites: boolean
  showVehicleSpots: boolean
  showPeaks: boolean
  /** Trinkwasser, Quellen, Wasserfälle und Seen. */
  showWater: boolean
  showViewpoints: boolean
  /** Selbst markierte Punkte und Fotos entlang der Route. */
  showEigene: boolean
}

/** Jahreszeit-Einstufung für die Ausrüstungswahl. */
export type Season = 'sommer' | 'uebergang' | 'winter'

/**
 * Eckdaten einer geplanten Tour (Schema nach Abschnitt 8.6).
 *
 * Noch ohne `id`/`user_id`: gespeichert wird erst mit Login [BALD].
 * Die Felder sind bewusst schon so benannt wie die spätere Tabelle.
 */
export interface TripParams {
  start_date: string
  days: number
  persons: number
  /** Geplante Schlafhöhe in Metern — bestimmt Temperatur und Ausrüstung. */
  elevation: number
  season: Season
  /** Übernachtungsart — entscheidet, ob Zelt/Biwak überhaupt nötig ist. */
  shelter: 'zelt' | 'biwak' | 'huette'
}
