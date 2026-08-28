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

/**
 * Welche Schrift die eigenen Beschriftungen verlangen dürfen — das entscheidet
 * nicht der Geschmack, sondern der Schriftserver des geladenen Styles.
 *
 * MapLibre kennt pro Style genau **eine** Glyphen-Adresse, und die gilt auch
 * für unsere Ebenen. Auf den Rasterkarten ist das die oben eingetragene; wählt
 * jemand die Karte „Standard", ist es die von OpenFreeMap, und die kennt eine
 * andere Schrift. Gemessen an `0-255.pbf`:
 *
 *   fonts.openmaptiles.org   Open Sans Regular ✓   Noto Sans Regular ✗
 *   tiles.openfreemap.org    Open Sans Regular ✗   Noto Sans Regular ✓
 *
 * Es gibt also keinen Namen, der auf beiden liegt — deshalb die Zuordnung.
 * Vorher stand hier fest „Open Sans Regular": auf der Karte „Standard" kam
 * jede Zeichengruppe als 404 zurück, und MapLibre zeichnete die Namen
 * ersatzweise lokal, Zeichen für Zeichen (eine Konsolenzeile je Zeichen).
 *
 * Achtung bei „✗": beide Server antworten dann mit 200 und einer HTML-Seite,
 * nicht mit 404 — der Fehler zeigt sich erst beim Auspacken der Glyphen.
 */
const SCHRIFT_JE_SERVER: [string, string[]][] = [
  ['fonts.openmaptiles.org', ['Open Sans Regular']],
  ['tiles.openfreemap.org', ['Noto Sans Regular']],
]

/** Die Schrift des zuerst eingetragenen Servers — auch die der Rasterkarten. */
export const TEXT_FONT = SCHRIFT_JE_SERVER[0][1]

/** Passende Schrift zur Glyphen-Adresse des geladenen Styles (`map.getGlyphs()`). */
export function textFontFuer(glyphsUrl: string | null | undefined): string[] {
  return SCHRIFT_JE_SERVER.find(([host]) => glyphsUrl?.includes(host))?.[1] ?? TEXT_FONT
}

export type BasemapKey = 'standard' | 'outdoor' | 'landeskarte'

export interface Basemap {
  key: BasemapKey
  label: string
  hint: string
  /** Auf diese Regionen beschränkt. undefined = überall verfügbar. */
  regions?: string[]
  style: StyleSpecification | string
}

/**
 * Baut einen Style aus einer einzelnen Rasterquelle.
 *
 * `bounds` ist optional und meint die Fläche, die der Kachelserver überhaupt
 * kennt. Ohne die Angabe fragt MapLibre den gesamten sichtbaren Ausschnitt an —
 * bei einer Landeskarte also auch Kacheln über Frankreich oder Ungarn, die es
 * dort nie gab.
 */
function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom: number,
  bounds?: [number, number, number, number],
): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      base: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution, ...(bounds ? { bounds } : {}) },
    },
    layers: [
      { id: 'hintergrund', type: 'background', paint: { 'background-color': '#f2efe9' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  }
}

/**
 * Die wählbaren Hintergrundkarten, in der Reihenfolge der Umschaltleiste.
 *
 * 'standard' steht vorn und ist die Voreinstellung: die Legalitätsebene ist
 * der Inhalt dieser Karte, und sie liest sich am ruhigsten über einer
 * zurückhaltenden Strassenkarte. Das Reliefbild von OpenTopoMap ist im
 * Gelände wertvoll, als erster Eindruck aber laut — wer es braucht, schaltet
 * einen Griff weit um. OpenTopoMap ist zudem ein ehrenamtliches Projekt: bei
 * stark steigender Nutzung gehört ein eigener Kachelserver her, nicht mehr
 * Last auf deren Infrastruktur.
 */
export const BASEMAPS: Record<BasemapKey, Basemap> = {
  standard: {
    key: 'standard',
    label: 'Standard',
    hint: 'Strassenkarte',
    style: 'https://tiles.openfreemap.org/styles/liberty',
  },
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
  /*
   * Die amtliche Schweizer Karte — und die leichtere von beiden.
   *
   * Gemessen bei Zoom 12: sechs Kacheln OpenTopoMap sind 305 KB, dieselben
   * sechs von swisstopo 142 KB. Bei gleichem Inhalt für diesen Zweck
   * (Wanderwege, Höhenlinien, Hütten) und von einem Bundes-CDN statt von
   * einem ehrenamtlichen Server. Für schlechtes Netz ist das die bessere Wahl.
   *
   * Sie stand vorher nur im Wallis zur Verfügung — ohne Grund: swisstopo deckt
   * die ganze Schweiz ab, und die Schweiz ist die Fokusregion dieses Projekts.
   * Voreingestellt ist sie trotzdem nicht: sie endet an der Landesgrenze,
   * die App aber nicht.
   */
  landeskarte: {
    key: 'landeskarte',
    label: 'Landeskarte',
    hint: 'amtliche Schweizer Karte, leichter zu laden',
    regions: ['CH', 'CH-VS'],
    style: rasterStyle(
      ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'],
      '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
      18,
      /*
       * Die Fläche, die swisstopo ausliefert — aus den WMTS-Capabilities des
       * Layers (WGS84BoundingBox), nicht geschätzt. Sie reicht von Lyon bis
       * Salzburg, deckt also den Alpenbogen um die Schweiz mit ab.
       *
       * Ohne diese Grenze antwortete der Server auf jede Kachel ausserhalb mit
       * 400, und zwar auf jeder Zoomstufe: beim Herauszoomen auf die Alpen
       * gingen zweistellig viele Anfragen ins Leere, jede mit einer roten Zeile
       * in der Konsole. MapLibre fragt Kacheln ausserhalb von `bounds` gar
       * nicht erst an.
       */
      [5.140242, 45.398181, 11.47757, 48.230651],
    ),
  },
}

export const DEFAULT_BASEMAP: BasemapKey = 'standard'

/* ------------------------------------------------- Kacheln der Vorschaubilder */

const VORSCHAU_HOSTS = ['a', 'b', 'c']

/**
 * Dieselbe Kachel über mehrere Hosts — in der Reihenfolge der Versuche.
 *
 * Die Vorschaubilder der Touren (`components/RoutenVorschau`) bauen ihre Karte
 * aus einzelnen Kacheln zusammen. Der erste Eintrag ist die reguläre Adresse:
 * er hängt an `x + y`, damit benachbarte Kacheln auf verschiedene Hosts fallen
 * und eine Vorschau nicht als Ganzes an einem einzigen hängt. Die weiteren
 * Einträge sind die zweite und dritte Chance derselben Kachel — beantwortet
 * ein Host gerade nicht, tut es vielleicht der nächste.
 *
 * Bewusst dieselbe Quelle wie die Karte „Outdoor": eine Vorschau soll aussehen
 * wie das, was man beim Antippen bekommt. Zur Last, die das erzeugt, steht
 * alles Weitere in `map/kachelLader.ts` und im Kopf der `RoutenVorschau`.
 */
export function vorschauKacheln(z: number, x: number, y: number): string[] {
  const start = (x + y) % VORSCHAU_HOSTS.length
  return VORSCHAU_HOSTS.map(
    (_, i) => `https://${VORSCHAU_HOSTS[(start + i) % VORSCHAU_HOSTS.length]}.tile.opentopomap.org/${z}/${x}/${y}.png`,
  )
}

/** Herkunftshinweis unter einem Vorschaubild — klein, aber vorhanden. */
export const VORSCHAU_HINWEIS = '© OpenTopoMap, OSM'

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

/**
 * Ab welcher Zoomstufe eine Ebene überhaupt gezeichnet wird.
 *
 * Sie stehen hier und nicht bei den Layer-Definitionen, weil zwei Stellen sie
 * brauchen: die Karte, um zu zeichnen, und die Datenschicht, um zu entscheiden,
 * ob sich das Nachladen lohnt. Liefen die beiden auseinander, wäre der Fehler
 * unsichtbar — die Karte sähe richtig aus und lüde im Hintergrund Daten, die
 * sie nie zeigt.
 */
export const ZOOM_AB = {
  /** Die höchsten Gipfel erscheinen zuerst (peaks-hoch) — aus der Übersicht. */
  gipfel: 8,
  /**
   * Ab hier lohnt das Kachelgitter für Gipfel.
   *
   * Nicht schon ab 8: dort deckt der Ausschnitt über achtzig Kacheln ab, für
   * eine Handvoll Dreitausender-Namen. Bis 11 reicht die Übersichtsdatei mit
   * den 291 Gipfeln über 3500 m (8 KB); ab 11 setzt peaks-mittel ein, und der
   * Ausschnitt ist auf zwei Kacheln geschrumpft.
   */
  gipfelKacheln: 11,
  /** Seen zuerst, das übrige Naturzeug erst ab 12,5 (natur-see / natur-icon). */
  natur: 9.5,
  /** Ab hier lösen die genauen Gemeindegrenzen die Übersicht ab. */
  gemeindenGenau: 9.5,
} as const
