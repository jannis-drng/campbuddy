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

/**
 * Die Fläche, die swisstopo ausliefert — dieselbe wie bei der Landeskarte oben.
 *
 * Steht hier als eigene Konstante, weil sie zwei Dinge steuert: welche Kacheln
 * die Karte anfragt, und aus welcher Quelle ein Vorschaubild gebaut wird.
 */
const SWISSTOPO_RAHMEN: [number, number, number, number] =
  [5.140242, 45.398181, 11.47757, 48.230651]

const SWISSTOPO_KACHEL =
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'

/** Umkehrung von `lonZuX`/`latZuY`: von der Kachelkoordinate zurück zum Ort. */
function kachelMitte(z: number, x: number, y: number): [number, number] {
  const n = 2 ** z
  const lon = ((x + 0.5) / n) * 360 - 180
  const r = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)))
  return [lon, (r * 180) / Math.PI]
}

const VORSCHAU_HOSTS = ['a', 'b', 'c']

/**
 * Woraus ein Vorschaubild gebaut wird — und warum nicht aus der Standardkarte.
 *
 * Der naheliegende Wunsch ist, hier dieselbe Karte zu nehmen wie beim Antippen,
 * also die Standardkarte. Das geht nicht: OpenFreeMap liefert **Vektorkacheln**,
 * die erst ein Renderer zu einem Bild macht. Ein Vorschaubild ist aber ein
 * schlichtes Raster aus `<img>` — genau deshalb kostet es keinen WebGL-Kontext
 * und lassen sich zwölf davon auf eine Seite legen. Eine zweite Kartenmaschine
 * je Vorschau wäre der Zustand, den diese Datei ausdrücklich vermeidet.
 *
 * Also die beste verfügbare *Raster*-Quelle, und das ist innerhalb ihres
 * Gebiets swisstopo: amtlich, von einem Bundes-CDN, und bei gleichem Inhalt
 * weniger als die Hälfte der Bytes von OpenTopoMap (gemessen bei Zoom 12:
 * 142 statt 305 KB für sechs Kacheln).
 *
 * Der eigentliche Grund für den Wechsel steht aber im Kopf der
 * `RoutenVorschau`: OpenTopoMap ist ein ehrenamtliches Projekt, und eine
 * Übersichtsseite voller Vorschaubilder ist die Stelle, an der diese App es am
 * ehesten überfordert. Auf dem Standardweg soll deshalb kein ehrenamtlicher
 * Server mehr liegen. Er bleibt die Ausweichquelle für alles ausserhalb des
 * swisstopo-Gebiets — das reicht von Lyon bis Salzburg, deckt den Alpenbogen
 * also mit ab, und ausserhalb davon ist eine gelegentliche Tour verkraftbar.
 *
 * Der erste Eintrag ist die reguläre Adresse, die weiteren sind zweite und
 * dritte Chance derselben Kachel — beantwortet ein Host gerade nicht, tut es
 * vielleicht der nächste.
 */
export function vorschauKacheln(z: number, x: number, y: number): string[] {
  const [lon, lat] = kachelMitte(z, x, y)
  const [west, sued, ost, nord] = SWISSTOPO_RAHMEN
  const drin = lon >= west && lon <= ost && lat >= sued && lat <= nord

  const opentopo = () => {
    const start = (x + y) % VORSCHAU_HOSTS.length
    return VORSCHAU_HOSTS.map(
      (_, i) => `https://${VORSCHAU_HOSTS[(start + i) % VORSCHAU_HOSTS.length]}.tile.opentopomap.org/${z}/${x}/${y}.png`,
    )
  }

  if (!drin) return opentopo()

  // swisstopo zuerst, OpenTopoMap als Auffangnetz: fällt der Bundes-Dienst
  // einmal aus, bleibt das Bild trotzdem vollständig.
  return [
    SWISSTOPO_KACHEL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)),
    ...opentopo().slice(0, 1),
  ]
}

/**
 * Bis wohin swisstopo Kacheln hat.
 *
 * Die Vorschau deckelt ihren Massstab ohnehin bei 15; die Landeskarte reicht
 * bis 18. Der Wert steht hier, damit der Deckel nicht stillschweigend über die
 * Quelle hinauswächst, wenn ihn jemand anhebt.
 */
export const VORSCHAU_MAX_ZOOM = 15

/** Herkunftshinweis unter einem Vorschaubild — klein, aber vorhanden. */
export const VORSCHAU_HINWEIS = '© swisstopo / OpenTopoMap, OSM'

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
