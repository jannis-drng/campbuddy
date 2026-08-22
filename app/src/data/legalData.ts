/**
 * SCHICHT 1 — ZUGRIFFS-API auf die Legalitäts-Daten.
 *
 * Das ist die einzige Stelle, an der die UI an die Rechtsdaten kommt.
 * Heute: statisches JSON, gebündelt ins Frontend (kostenlos, kein Backend).
 * Später: dieselben Funktionen gegen Supabase/PostGIS implementieren —
 * die UI bleibt unverändert, weil sie nur diese Signaturen kennt.
 */
import type {
  ActivityMode, LegalStatus, MapFilters, NatureFeature, Peak, Permission, Point, RegionCode,
  ReviewStatus, Zone,
} from './types'
import { REGIONS } from './regions'
import { getSupabase } from '../services/supabase'

import osmZonesVS from './zones/CH-VS.osm.json'
import legalVS from './zones/CH-VS.legal.json'
import pointsVS from './points/CH-VS.json'
import peaksVS from './peaks/CH-VS.json'
import natureVS from './nature/CH-VS.json'

interface LegalEntry {
  status: LegalStatus
  tent_allowed: Permission
  vehicle_allowed: Permission
  fire_allowed: Permission
  conditions: string | null
  notes: string | null
  review_status: ReviewStatus
  last_verified: string | null
}

interface OsmFeature {
  id: string
  properties: { name: string; source: string; source_url: string; [k: string]: unknown }
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/**
 * Die gebündelte Fassung — bewusst nur das Wallis.
 *
 * Sie ist die Sofortanzeige: sichtbar, bevor irgendetwas über die Leitung
 * geht, und die einzige Fassung, die auch ohne Backend steht. Die ganze
 * Schweiz hier hineinzulegen hiesse, jedem Besucher megabyteweise Daten
 * aufzuladen, die er meist nicht braucht — sie kommt deshalb aus der
 * Datenbank und ersetzt diese Fassung, sobald sie da ist (siehe `fetchRemote*`
 * und `datenquelle` in App.tsx).
 *
 * Dass hier unter 'CH' nur ein Kanton liegt, ist kein Versehen: es ist ein
 * Ausschnitt, und die Oberfläche weist offen aus, welche Fassung sie zeigt.
 */
const GEOMETRY_SOURCES: Record<RegionCode, { features: OsmFeature[] }> = {
  CH: osmZonesVS as unknown as { features: OsmFeature[] },
}

const LEGAL_SOURCES: Record<RegionCode, { zones: Record<string, LegalEntry> }> = {
  CH: legalVS as unknown as { zones: Record<string, LegalEntry> },
}

const POINT_SOURCES: Record<RegionCode, Point[]> = {
  CH: pointsVS as unknown as Point[],
}

const PEAK_SOURCES: Record<RegionCode, Peak[]> = {
  CH: peaksVS as unknown as Peak[],
}

const NATURE_SOURCES: Record<RegionCode, NatureFeature[]> = {
  CH: natureVS as unknown as NatureFeature[],
}

/**
 * Setzt Geometrie (OSM) und rechtliche Bewertung (eigene Pflege) zusammen.
 * Flächen ohne Bewertung erscheinen bewusst als 'unknown' statt zu verschwinden —
 * eine ungeprüfte Fläche ist eine Information, keine Lücke.
 */
export function getZones(region: RegionCode): Zone[] {
  const geo = GEOMETRY_SOURCES[region]
  const legal = LEGAL_SOURCES[region]
  if (!geo) return []

  return geo.features.map((f): Zone => {
    const entry = legal?.zones[f.id]
    return {
      id: f.id,
      region,
      name: f.properties.name,
      status: entry?.status ?? 'unknown',
      tent_allowed: entry?.tent_allowed ?? 'unknown',
      vehicle_allowed: entry?.vehicle_allowed ?? 'unknown',
      fire_allowed: entry?.fire_allowed ?? 'unknown',
      conditions: entry?.conditions ?? null,
      source: f.properties.source,
      source_url: f.properties.source_url,
      last_verified: entry?.last_verified ?? null,
      review_status: entry?.review_status ?? 'entwurf',
      notes: entry?.notes ?? null,
      geometry: f.geometry,
    }
  })
}

export function getPoints(region: RegionCode): Point[] {
  return POINT_SOURCES[region] ?? []
}

export function getPeaks(region: RegionCode): Peak[] {
  return PEAK_SOURCES[region] ?? []
}

export function getNature(region: RegionCode): NatureFeature[] {
  return NATURE_SOURCES[region] ?? []
}

/**
 * Wasser und Aussicht getrennt schaltbar: wer im Sommer Trinkwasser sucht,
 * will alle 957 Brunnen sehen; wer einen Schlafplatz sucht, will sie nicht.
 */
export function filterNature(features: NatureFeature[], f: MapFilters): NatureFeature[] {
  return features.filter((n) =>
    (n.type === 'viewpoint' ? f.showViewpoints : f.showWater),
  )
}

export function getRegion(region: RegionCode) {
  return REGIONS[region]
}

const PERMISSION_TO_STATUS: Record<Permission, LegalStatus> = {
  yes: 'allowed',
  no: 'forbidden',
  conditional: 'tolerated',
  unknown: 'unknown',
}

const ACTIVITY_FIELD = {
  tent: 'tent_allowed',
  vehicle: 'vehicle_allowed',
  fire: 'fire_allowed',
} as const

/**
 * Welche Einstufung soll für die gewählte Aktivität angezeigt werden?
 *
 * Bewusst KEIN Ausblenden: ein Aktivitätsfilter färbt die Karte um, statt Zonen
 * zu entfernen. Würde "nur Zelt" die Flächen mit Zeltverbot verstecken, sähe ein
 * Verbotsgebiet aus wie unmarkiertes Gelände — und unmarkiert heisst in dieser
 * Region "geduldet". Ein Filter darf ein Verbot niemals unsichtbar machen.
 */
export function effectiveStatus(zone: Zone, activity: ActivityMode): LegalStatus {
  if (activity === 'all') return zone.status
  return PERMISSION_TO_STATUS[zone[ACTIVITY_FIELD[activity]]]
}

export function filterPoints(points: Point[], f: MapFilters): Point[] {
  return points.filter((p) =>
    (p.type === 'hut' && f.showHuts) ||
    (p.type === 'campsite' && f.showCampsites) ||
    (p.type === 'vehicle_spot' && f.showVehicleSpots),
  )
}

/** Wie viele Zonen sind tatsächlich belegt statt nur abgeleitet? */
export function verificationStats(zones: Zone[]) {
  return {
    total: zones.length,
    entwurf: zones.filter((z) => z.review_status === 'entwurf').length,
    quelle: zones.filter((z) => z.review_status === 'quelle').length,
    vorOrt: zones.filter((z) => z.review_status === 'vor-ort').length,
  }
}

/* ---------------- Daten aus dem Backend ---------------- */

/**
 * Holt Zonen und Punkte aus Supabase, falls konfiguriert.
 *
 * Warum beides — gebündelt UND aus der Datenbank? Die gebündelten Dateien sind
 * sofort da, kosten nichts und funktionieren ohne Netz (Voraussetzung für die
 * Offline-Karte [SPÄTER]). Die Datenbank ist dafür aktuell: eine korrigierte
 * Rechtseinstufung wirkt sofort, ohne die Seite neu zu bauen. Deshalb rendert
 * die App zuerst die gebündelte Fassung und ersetzt sie, sobald die frische da
 * ist. Schlägt das fehl, bleibt es bei der gebündelten — nie ein leerer Zustand.
 */
export async function fetchRemoteZones(region: RegionCode): Promise<Zone[] | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.from('zones').select('*').eq('region', region)
  if (error || !data || data.length === 0) return null

  return data.map((row): Zone => ({
    id: row.id,
    region: row.region,
    name: row.name,
    status: row.status,
    tent_allowed: row.tent_allowed,
    vehicle_allowed: row.vehicle_allowed,
    fire_allowed: row.fire_allowed,
    conditions: row.conditions,
    source: row.source,
    source_url: row.source_url,
    last_verified: row.last_verified,
    review_status: row.review_status,
    notes: row.notes,
    geometry: row.geometry,
  }))
}

export async function fetchRemotePoints(region: RegionCode): Promise<Point[] | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb.from('points').select('*').eq('region', region)
  if (error || !data || data.length === 0) return null

  return data.map((row): Point => ({
    id: row.id,
    region: row.region,
    type: row.type,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    elevation: row.elevation,
    info: row.info ?? {},
    source: row.source,
    source_url: row.source_url,
    last_verified: row.last_verified,
  }))
}
