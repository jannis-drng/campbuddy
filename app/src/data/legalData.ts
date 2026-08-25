/**
 * SCHICHT 1 — ZUGRIFFS-API auf die Legalitäts-Daten.
 *
 * Das ist die einzige Stelle, an der die UI an die Rechtsdaten kommt.
 *
 * Woher sie kommen, hat sich geändert und die UI hat es nicht gemerkt —
 * genau dafür gibt es diese Schicht. Früher lagen die Daten doppelt vor:
 * gebündelt im JavaScript (die Fokusregion) und zusätzlich aus Supabase
 * nachgeladen (der Rest). Das kostete jeden Besucher rund 630 KB Datenbank-
 * Egress und war obendrein falsch — PostgREST liefert höchstens 1000 Zeilen,
 * die Abfragen paginierten nicht, und so fehlten still über tausend Gemeinden
 * und mehrere hundert Schutzgebiete.
 *
 * Jetzt kommen sie aus statischen Snapshot-Dateien mit Inhalts-Hash
 * (`snapshot.ts`, erzeugt von `scripts/snapshot-daten.mjs`): vollständig,
 * unbegrenzt cachebar, ohne Datenbank. Supabase ist weiterhin da — für das,
 * was tatsächlich pro Nutzer verschieden ist: Konten, Touren, Kommentare,
 * Meldungen, eigene Punkte.
 */
import type {
  ActivityMode, Ausschnitt, LegalStatus, MapFilters, NatureFeature, Peak, Permission, Point,
  RegionCode, Zone,
} from './types'
import { REGIONS } from './regions'
import { kachelLader, ladeJson, ohneDoppelte } from './snapshot'

/**
 * Die Zonen einer Region.
 *
 * Bewusst in einem Stück und in voller Auflösung, anders als die
 * Gemeindeflächen: jede Zone ist anklickbar und trägt eine Aussage darüber,
 * was dort gilt. Wo eine Kante die Grenze zwischen „erlaubt" und „verboten"
 * ist, wird sie nicht zugunsten der Dateigrösse verschoben — und die
 * Routenanalyse (`analyseRoute`) braucht ohnehin alle Flächen, nicht nur die
 * im Bild, weil eine Route über den Bildrand hinausgeht.
 *
 * Das kostet einmalig 343 KB gepackt. Danach nie wieder: die Datei trägt
 * einen Inhalts-Hash und liegt unbegrenzt im Browser-Cache.
 */
export const ladeZonen = (region: RegionCode) => ladeJson<Zone[]>(`zonen.${region}.json`)

export const ladePunkte = (region: RegionCode) => ladeJson<Point[]>(`punkte.${region}.json`)

/**
 * Gipfel und Naturobjekte nach Ausschnitt.
 *
 * Landesweit sind das 7274 beziehungsweise 23 753 Objekte. Sie liegen deshalb
 * in einem Gradgitter, und der Lader merkt sich, welche Kacheln schon da sind
 * — zurück über eine bekannte Gegend zu scrollen kostet nichts mehr.
 */
const GIPFEL_LADER: Partial<Record<RegionCode, ReturnType<typeof kachelLader<Peak>>>> = {}
const NATUR_LADER: Partial<Record<RegionCode, ReturnType<typeof kachelLader<NatureFeature>>>> = {}

/**
 * Die hohen Gipfel — eine kleine Datei statt achtzig Kacheln.
 *
 * Bei Zoom 8 zeichnet die Karte nur, was über 3500 m liegt; der Ausschnitt
 * deckt dort aber fast das Land ab. Diese 291 Gipfel wiegen 8 KB und tragen
 * alles bis Zoom 11. Erst darüber lohnt das Gitter.
 */
const GIPFEL_HOCH: Partial<Record<RegionCode, Peak[]>> = {}

export async function ladeGipfelUebersicht(region: RegionCode): Promise<Peak[]> {
  GIPFEL_HOCH[region] ??= await ladeJson<Peak[]>(`gipfel.hoch.${region}.json`)
  return GIPFEL_HOCH[region]!
}

/**
 * Die Gipfel des Ausschnitts, zusammen mit der Übersicht.
 *
 * Die hohen sind in beiden Beständen — deshalb `ohneDoppelte`. Sie
 * herauszurechnen wäre die andere Möglichkeit, aber dann hinge die Richtigkeit
 * der Kacheln an einer Höhenschwelle, die an zwei Stellen gleich sein muss.
 */
export async function ladeGipfel(region: RegionCode, a: Ausschnitt): Promise<Peak[] | null> {
  GIPFEL_LADER[region] ??= kachelLader<Peak>('gipfel', `gipfel.${region}.json`)
  const neu = await GIPFEL_LADER[region]!.laden(a)
  if (!neu) return null
  return ohneDoppelte([...(GIPFEL_HOCH[region] ?? []), ...neu])
}

export function ladeNatur(region: RegionCode, a: Ausschnitt): Promise<NatureFeature[] | null> {
  NATUR_LADER[region] ??= kachelLader<NatureFeature>('natur', `natur.${region}.json`)
  return NATUR_LADER[region]!.laden(a)
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
