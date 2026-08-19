/**
 * SCHICHT 2 — KARTEN-/ROUTING-SCHICHT.
 *
 * Alle externen Kartendienste stehen hier gebündelt. Wechselt der Anbieter,
 * ändert sich nur diese Datei — die Legalitäts-Daten bleiben unberührt.
 *
 * Bewusst gewählt: MapLibre GL + OpenFreeMap-Vektorkacheln (OpenStreetMap-Daten).
 * Kein API-Key, keine Lizenzgebühr, kein Nutzungslimit-Vertrag — siehe
 * Abschnitt 6 der Spezifikation.
 */

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Fällt an, wenn der Kachel-Dienst nicht erreichbar ist: reine OSM-Rasterkarte. */
export const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap-Mitwirkende',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
}

export const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende · Kacheln: <a href="https://openfreemap.org/">OpenFreeMap</a>'

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
  osrmBase: 'https://routing.openstreetmap.de',
  provider: 'openrouteservice' as 'openrouteservice' | 'graphhopper',
  apiKey: '',
  endpoints: {
    openrouteservice: 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson',
    graphhopper: 'https://graphhopper.com/api/1/route',
  },
} as const
