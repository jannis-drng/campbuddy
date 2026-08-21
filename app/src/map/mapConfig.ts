/**
 * SCHICHT 2 — KARTEN-/ROUTING-SCHICHT.
 *
 * Alle externen Kartendienste stehen hier gebündelt. Wechselt der Anbieter,
 * ändert sich nur diese Datei — die Legalitäts-Daten bleiben unberührt.
 */
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'

/**
 * Beschriftungen brauchen eine Schriftquelle. Vektor-Styles bringen die mit,
 * reine Rasterkarten nicht — ohne diesen Eintrag blieben Zonen- und
 * Punktnamen auf der Outdoor-Karte unsichtbar.
 */
const GLYPHS = 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
export const TEXT_FONT = ['Open Sans Regular']

export type BasemapKey = 'outdoor' | 'landeskarte' | 'standard'

export interface Basemap {
  key: BasemapKey
  label: string
  hint: string
  /** Auf diese Regionen beschränkt. undefined = überall verfügbar. */
  regions?: string[]
  style: StyleSpecification | string
}

/** Baut einen Style aus einer einzelnen Rasterquelle. */
function rasterStyle(tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      base: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution },
    },
    layers: [
      { id: 'hintergrund', type: 'background', paint: { 'background-color': '#f2efe9' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  }
}

/**
 * Die wählbaren Hintergrundkarten.
 *
 * 'outdoor' ist der Standard: Höhenlinien, Wanderwege, Gipfel und Hütten sind
 * für dieses Projekt wichtiger als Strassennamen. OpenTopoMap ist ein
 * ehrenamtliches Projekt — bei stark steigender Nutzung gehört ein eigener
 * Kachelserver her, nicht mehr Last auf deren Infrastruktur.
 */
export const BASEMAPS: Record<BasemapKey, Basemap> = {
  outdoor: {
    key: 'outdoor',
    label: 'Outdoor',
    hint: 'Höhenlinien, Wanderwege, Gipfel',
    style: rasterStyle(
      [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
      ],
      'Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM · ' +
        'Darstellung © <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA)',
      17,
    ),
  },
  landeskarte: {
    key: 'landeskarte',
    label: 'Landeskarte',
    hint: 'amtliche Schweizer Karte (swisstopo)',
    regions: ['CH-VS'],
    style: rasterStyle(
      ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'],
      '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
      18,
    ),
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    hint: 'Strassenkarte',
    style: 'https://tiles.openfreemap.org/styles/liberty',
  },
}

export const DEFAULT_BASEMAP: BasemapKey = 'outdoor'

/** Welche Hintergrundkarten stehen in dieser Region zur Wahl? */
export function basemapsFor(region: string): Basemap[] {
  return Object.values(BASEMAPS).filter((b) => !b.regions || b.regions.includes(region))
}

/* --------------------------------------------------- Kartenausschnitt */

/**
 * Wie weit über die Region hinaus man schauen darf, in Grad.
 *
 * Eine Legalitätskarte, die sich bis Neuseeland schieben lässt, ist ein
 * Versprechen, das sie nicht hält: ausserhalb der erfassten Region weiss sie
 * nichts, und eine leere Weltkarte sieht aus wie „hier gilt nichts". Der
 * Ausschnitt bleibt deshalb im Gebirge.
 *
 * Nicht bis auf die Regionsgrenze zugeschnürt, sondern grosszügig gepolstert:
 * eine Tour endet gern knapp hinter der Kantons- oder Landesgrenze, und der
 * Blick auf die Nachbartäler gehört zur Orientierung. Bei rund 46° Breite sind
 * das etwa 170 km nach Osten und Westen, 155 km nach Norden und Süden — für das
 * Wallis also die West- und Zentralalpen von Chamonix bis ins Tirol.
 */
const SPIELRAUM_LNG = 2.2
const SPIELRAUM_LAT = 1.4

/** So weit darf herausgezoomt werden — etwa der ganze Alpenbogen. */
export const MIN_ZOOM = 6

/**
 * Der Bereich, in dem sich die Karte bewegen darf.
 *
 * Bewusst aus `region.bounds` abgeleitet statt als fester Alpen-Kasten
 * hinterlegt: eine neue Region einzutragen soll weiterhin genügen, ohne dass
 * jemand daran denken muss, hier eine zweite Zahl nachzuziehen.
 */
export function kartenGrenzen(
  bounds: [number, number, number, number],
): [[number, number], [number, number]] {
  const [west, sued, ost, nord] = bounds
  return [
    [west - SPIELRAUM_LNG, Math.max(-85, sued - SPIELRAUM_LAT)],
    [ost + SPIELRAUM_LNG, Math.min(85, nord + SPIELRAUM_LAT)],
  ]
}

export const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'

/**
 * Farbcode der Legalitäts-Ebene. Grün/Gelb/Rot wie in der Spezifikation,
 * Grau für ungeprüft — damit "keine Angabe" nie wie "erlaubt" aussieht.
 */
export const STATUS_COLORS = {
  allowed: '#22c55e',
  tolerated: '#eab308',
  forbidden: '#ef4444',
  unknown: '#94a3b8',
} as const

export const POINT_COLORS = {
  hut: '#38bdf8',
  campsite: '#a78bfa',
  vehicle_spot: '#fb923c',
} as const

/**
 * Routing-Engine (Abschnitt 4.2, Abschnitt 6).
 *
 * Standard ist die öffentliche OSRM-Instanz der FOSSGIS e.V. — dieselbe, die
 * openstreetmap.org nutzt. Kein API-Schlüssel, keine Registrierung, OSM-Daten.
 *
 * `apiKey` bleibt leer, solange das reicht. Wird die Nutzung so hoch, dass die
 * Community-Instanz nicht mehr angemessen ist, hier einen OpenRouteService-
 * Schlüssel eintragen — die Routing-Schicht schaltet dann automatisch um.
 */
export const ROUTING = {
  /**
   * Valhalla ist der Hauptanbieter, weil sein Fussgänger-Modell echte
   * Wanderwege kennt: `walkway_factor` bevorzugt Fusswege, und
   * `max_hiking_difficulty` erlaubt Steige bis zur gewählten SAC-Stufe.
   * OSRMs Fuss-Profil gewichtet nur nach Distanz und nimmt im Gebirge
   * deshalb oft die kürzere Talstrasse statt des Steigs.
   */
  valhallaBase: 'https://valhalla1.openstreetmap.de',
  /** Rückfallebene, wenn Valhalla nicht antwortet. */
  osrmBase: 'https://routing.openstreetmap.de',
  provider: 'openrouteservice' as 'openrouteservice' | 'graphhopper',
  apiKey: '',
  endpoints: {
    openrouteservice: 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson',
    graphhopper: 'https://graphhopper.com/api/1/route',
  },
} as const
