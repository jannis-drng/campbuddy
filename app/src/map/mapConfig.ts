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
 * Wo die Karte aufhört, steht in `map/alpenRahmen.ts` — der Ausschnitt hängt
 * am Alpenbogen aus OpenStreetMap, nicht an einem Kartendienst, und gehört
 * deshalb nicht in diese Datei.
 */

export const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'

/**
 * Farbcode der Legalitäts-Ebene. Grün/Gelb/Rot wie in der Spezifikation,
 * Grau für ungeprüft — damit "keine Angabe" nie wie "erlaubt" aussieht.
 */
/**
 * Eigene, tiefere Töne für die Gemeindeebene.
 *
 * Die Zonenfarben sind auf helle Flächen über der Grundkarte abgestimmt. Die
 * Gemeindeflächen liegen dagegen auf einem hellen Grund, der der Grundkarte
 * Sättigung nimmt — dort wirkt dasselbe Rot blass und die Aussage beiläufig.
 * Diese Töne sind zwei Stufen dunkler und behaupten sich auch auf dem
 * rotbraunen Reliefbild der Alpen, wo man sie am dringendsten braucht.
 *
 * Bewusst dieselben Farbfamilien wie oben: Grün, Gelb und Rot bleiben der
 * Rechtslage vorbehalten, sonst müsste man die Karte zweimal lesen lernen.
 */
export const GEMEINDE_COLORS = {
  allowed: '#15803D',
  tolerated: '#B45309',
  forbidden: '#B91C1C',
  unknown: '#94A3B8',
}

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
