/**
 * SCHICHT 2 — Kartenkomponente.
 *
 * Kapselt MapLibre vollständig: der Rest der App kennt keine Karten-API,
 * sondern nur Zonen, Punkte und Klick-Callbacks. Das ist die Trennung,
 * die einen späteren Wechsel der Kartenbibliothek billig hält.
 *
 * Zum Zeichnen der Route: das Vorbild ist bewusst Komoot, weil dessen
 * Bedienung sich durchgesetzt hat und niemand hier etwas Neues lernen will.
 * Drei Gesten, mehr braucht es nicht —
 *   1. Klick in die Karte hängt hinten einen Wegpunkt an,
 *   2. einen Wegpunkt anfassen und ziehen verschiebt ihn,
 *   3. die *Linie* anfassen und ziehen zieht einen neuen Wegpunkt heraus
 *      und fügt ihn an der richtigen Stelle in der Reihenfolge ein.
 * Punkt 3 ist der eigentliche Unterschied: ohne ihn muss man eine Route
 * löschen und neu setzen, nur weil man einen Umweg einbauen will.
 */
import { useEffect, useRef } from 'react'
import {
  AttributionControl, GeolocateControl, GeoJSONSource, Map as MlMap, NavigationControl, ScaleControl,
} from 'maplibre-gl'
import type maplibregl from 'maplibre-gl'
// maplibre-gl reicht die Expression-Typen nicht nach aussen durch; sie stammen
// aus der Style-Spec, die MapLibre selbst verwendet.
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  ActivityMode, EigenerPunkt, NatureFeature, Peak, Point, Region, Zone,
} from '../data/types'
import { naechsterIndex, naechsterPunktAufLinie, type Position } from '../data/geo'
import { effectiveStatus } from '../data/legalData'
import { ATTRIBUTION, BASEMAPS, STATUS_COLORS, TEXT_FONT, type BasemapKey } from './mapConfig'
import { alpenGrenzen, maskeGeoJson, MIN_ZOOM } from './alpenRahmen'
import { symboleAnlegen } from './symbole'

interface Props {
  region: Region
  zones: Zone[]
  points: Point[]
  peaks: Peak[]
  nature: NatureFeature[]
  eigene: EigenerPunkt[]
  /** Steuert nur die Einfärbung — es werden nie Zonen ausgeblendet. */
  activity: ActivityMode
  basemap: BasemapKey
  /**
   * Ob die Karte gerade sichtbar ist. Sie bleibt beim Ansichtswechsel bewusst
   * montiert: ein Neuaufbau würde Kartenposition und geladene Kacheln verwerfen.
   * MapLibre muss nach dem Wiedereinblenden nur seine Grösse neu messen.
   */
  visible: boolean
  /** Der tatsächliche Streckenverlauf (auf Wege gerastert oder gerade). */
  route: Position[]
  /** Die vom Nutzer gesetzten Wegpunkte — nur diese bekommen einen Griff. */
  waypoints: Position[]
  /** Im Zeichenmodus setzt ein Kartenklick einen Wegpunkt statt eine Zone zu öffnen. */
  drawing: boolean
  /** Im Markiermodus setzt ein Kartenklick einen eigenen Punkt. */
  markieren: boolean
  onZoneClick: (zone: Zone) => void
  onPointClick: (point: Point) => void
  onNatureClick: (feature: NatureFeature) => void
  onEigenClick: (punkt: EigenerPunkt) => void
  onAddWaypoint: (position: Position) => void
  onInsertWaypoint: (index: number, position: Position) => void
  onMoveWaypoint: (index: number, position: Position) => void
  onRemoveWaypoint: (index: number) => void
  onMarkieren: (position: Position) => void
}

export function MapView({
  region, zones, points, peaks, nature, eigene, activity, basemap, visible,
  route, waypoints, drawing, markieren,
  onZoneClick, onPointClick, onNatureClick, onEigenClick,
  onAddWaypoint, onInsertWaypoint, onMoveWaypoint, onRemoveWaypoint, onMarkieren,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const ready = useRef(false)
  const routeRef = useRef({ route, waypoints })
  routeRef.current = { route, waypoints }

  // Aktuelle Daten und Callbacks in Refs spiegeln: die MapLibre-Listener werden
  // genau einmal gebunden, greifen aber immer auf den neuesten Stand zu.
  const latest = useRef({
    zones, points, peaks, nature, eigene, activity, drawing, markieren, waypoints,
    onZoneClick, onPointClick, onNatureClick, onEigenClick,
    onAddWaypoint, onInsertWaypoint, onMoveWaypoint, onRemoveWaypoint, onMarkieren,
  })
  latest.current = {
    zones, points, peaks, nature, eigene, activity, drawing, markieren, waypoints,
    onZoneClick, onPointClick, onNatureClick, onEigenClick,
    onAddWaypoint, onInsertWaypoint, onMoveWaypoint, onRemoveWaypoint, onMarkieren,
  }

  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MlMap({
      container: container.current,
      style: BASEMAPS[basemap].style,
      center: region.center,
      zoom: region.zoom,
      // Der Ausschnitt endet am Alpenbogen (siehe alpenRahmen): ausserhalb
      // hätte diese Karte nichts zu sagen, und eine leere Weltkarte liest sich
      // wie „hier gilt nichts". Unabhängig von der gewählten Region — die
      // Alpen sind der Horizont des Projekts, nicht das Wallis.
      maxBounds: alpenGrenzen(),
      minZoom: MIN_ZOOM,
      maxZoom: 17,
      // Ohne das wiederholt sich die Welt seitlich ins Unendliche — bei einem
      // fest umrissenen Gebiet ist jede Kopie davon eine Attrappe.
      renderWorldCopies: false,
      attributionControl: false,
    })
    map.current = m
    if (import.meta.env.DEV) (window as unknown as { __map?: unknown }).__map = m

    m.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }))
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(
      new GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }),
      'top-right',
    )
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    /**
     * Eigene Layer einrichten. Bewusst mehrfach angestossen und idempotent:
     * sich allein auf das 'load'-Ereignis zu verlassen ist fragil — bleibt es
     * aus, hätte die Karte weder Zonen noch Klick-Ziele. Der Wächter über
     * getSource('zones') sorgt dafür, dass mehrfaches Aufrufen nichts kostet.
     */
    const setupLayers = () => {
      if (!m.style || m.getSource('zones')) return
      symboleAnlegen(m)
      addLayers(m)
      updateData(m, latest.current.zones, latest.current.points, latest.current.activity)
      ;(m.getSource('peaks') as GeoJSONSource | undefined)?.setData(peaksToGeoJson(latest.current.peaks))
      ;(m.getSource('natur') as GeoJSONSource | undefined)?.setData(natureToGeoJson(latest.current.nature))
      ;(m.getSource('eigene') as GeoJSONSource | undefined)?.setData(eigeneToGeoJson(latest.current.eigene))
      ;(m.getSource('route') as GeoJSONSource | undefined)
        ?.setData(routeToGeoJson(routeRef.current.route, routeRef.current.waypoints))
      ready.current = true
    }

    m.on('style.load', setupLayers)
    m.on('load', setupLayers)
    m.on('idle', setupLayers)
    if (m.isStyleLoaded()) setupLayers()

    /* ------------------------------------------------------------------
       Ziehen: entweder ein bestehender Wegpunkt oder ein neuer, der aus
       der Linie herausgezogen wird. Beides läuft über dieselbe Mechanik,
       weil es sich für die Hand gleich anfühlen soll.
       ------------------------------------------------------------------ */
    // Eigene Behandlung statt einer Marker-Bibliothek: die Wegpunkte liegen
    // als GeoJSON-Layer vor, und Marker-DOM-Elemente wären bei vielen Punkten
    // langsamer und liessen sich nicht mit denselben Ausdrücken einfärben.
    type Ziehen =
      | { art: 'verschieben'; index: number }
      | { art: 'einfuegen'; index: number }
    let zieht: Ziehen | null = null
    /** Merkt, ob wirklich gezogen wurde — ein Klick ohne Bewegung ist kein Ziehen. */
    let bewegt = false

    const setzeCursor = (wert: string) => { m.getCanvas().style.cursor = wert }
    const ruheCursor = () =>
      latest.current.markieren ? 'crosshair' : latest.current.drawing ? 'crosshair' : ''

    const geist = (position: Position | null) => {
      ;(m.getSource('route-griff') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: position
          ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: position } }]
          : [],
      })
    }

    const vorschau = (position: Position) => {
      if (!zieht) return
      const wp = [...latest.current.waypoints]
      if (zieht.art === 'verschieben') wp[zieht.index] = position
      else wp.splice(zieht.index, 0, position)
      ;(m.getSource('route') as GeoJSONSource | undefined)
        ?.setData(routeToGeoJson(routeRef.current.route, wp))
      geist(position)
    }

    const beginneVerschieben = (
      e: { features?: maplibregl.MapGeoJSONFeature[]; preventDefault: () => void },
    ) => {
      const index = e.features?.[0]?.properties?.index
      if (typeof index !== 'number') return
      // Verhindert, dass die Karte selbst mitzieht.
      e.preventDefault()
      zieht = { art: 'verschieben', index }
      bewegt = false
      setzeCursor('grabbing')
    }

    /**
     * Aus der Linie einen neuen Wegpunkt herausziehen.
     *
     * Die Einfügestelle lässt sich nicht direkt ablesen: die gezeichnete Spur
     * folgt echten Wegen und hat hunderte Stützpunkte, die gesetzten Wegpunkte
     * sind nur eine Handvoll. Also wird geschaut, zwischen welchen zwei
     * Wegpunkten der angefasste Punkt auf der Spur liegt.
     */
    const einfuegeIndex = (position: Position): number => {
      const { route: spur, waypoints: wp } = routeRef.current
      if (wp.length < 2) return wp.length
      if (spur.length < 2) return wp.length
      const griff = naechsterIndex(position, spur)
      const marken = wp.map((p) => naechsterIndex(p, spur))
      for (let i = 1; i < marken.length; i++) {
        if (griff <= marken[i]) return i
      }
      return wp.length
    }

    const beginneEinfuegen = (e: { lngLat: maplibregl.LngLat; preventDefault: () => void }) => {
      const { route: spur } = routeRef.current
      if (spur.length < 2) return
      const treffer = naechsterPunktAufLinie([e.lngLat.lng, e.lngLat.lat], spur)
      if (!treffer) return
      e.preventDefault()
      zieht = { art: 'einfuegen', index: einfuegeIndex(treffer.position) }
      bewegt = false
      setzeCursor('grabbing')
      vorschau(treffer.position)
    }

    const beendeZiehen = (lngLat: { lng: number; lat: number }) => {
      if (!zieht) return
      const aktion = zieht
      zieht = null
      geist(null)
      setzeCursor(ruheCursor())
      const position: Position = [lngLat.lng, lngLat.lat]
      if (!bewegt) {
        // Angefasst, aber nicht bewegt: die Route unverändert lassen und den
        // Vorschau-Zustand zurücknehmen.
        ;(m.getSource('route') as GeoJSONSource | undefined)
          ?.setData(routeToGeoJson(routeRef.current.route, routeRef.current.waypoints))
        return
      }
      if (aktion.art === 'verschieben') latest.current.onMoveWaypoint(aktion.index, position)
      else latest.current.onInsertWaypoint(aktion.index, position)
    }

    m.on('mousedown', 'route-waypoints', beginneVerschieben)
    m.on('touchstart', 'route-waypoints', beginneVerschieben)
    m.on('mousedown', 'route-griff', beginneEinfuegen)
    m.on('mousedown', 'route-treffer', beginneEinfuegen)
    m.on('touchstart', 'route-treffer', beginneEinfuegen)

    m.on('mousemove', (e) => {
      if (zieht) { bewegt = true; vorschau([e.lngLat.lng, e.lngLat.lat]) }
    })
    m.on('touchmove', (e) => {
      if (!zieht) return
      e.preventDefault()
      bewegt = true
      vorschau([e.lngLat.lng, e.lngLat.lat])
    })
    m.on('mouseup', (e) => beendeZiehen(e.lngLat))
    m.on('touchend', (e) => beendeZiehen(e.lngLat))

    // Rechtsklick auf einen Wegpunkt entfernt ihn.
    m.on('contextmenu', 'route-waypoints', (e) => {
      const index = e.features?.[0]?.properties?.index
      if (typeof index === 'number') {
        e.preventDefault()
        latest.current.onRemoveWaypoint(index)
      }
    })

    m.on('mouseenter', 'route-waypoints', () => { if (!zieht) setzeCursor('grab') })
    m.on('mouseleave', 'route-waypoints', () => { if (!zieht) setzeCursor(ruheCursor()) })

    // Der Griff auf der Linie: er folgt dem Zeiger, damit sichtbar ist, wo
    // beim Ziehen der neue Wegpunkt entsteht. Ohne diese Rückmeldung wirkt
    // das Aufziehen wie ein Zufallstreffer.
    m.on('mousemove', 'route-treffer', (e) => {
      if (zieht) return
      const treffer = naechsterPunktAufLinie([e.lngLat.lng, e.lngLat.lat], routeRef.current.route)
      if (!treffer) return
      geist(treffer.position)
      setzeCursor('grab')
    })
    m.on('mouseleave', 'route-treffer', () => {
      if (zieht) return
      geist(null)
      setzeCursor(ruheCursor())
    })

    // Interaktion hängt NICHT an den Layern: das Setzen von Wegpunkten muss
    // auch dann funktionieren, wenn die Legalitäts-Layer noch nicht stehen.
    {
      m.on('click', (e) => {
        // Ein Klick, der einen Wegpunkt trifft, setzt keinen neuen darauf.
        if (m.getLayer('route-waypoints') &&
            m.queryRenderedFeatures(e.point, { layers: ['route-waypoints'] }).length > 0) return

        const position: Position = [e.lngLat.lng, e.lngLat.lat]

        // Markieren hat Vorrang vor allem: wer den Modus eingeschaltet hat,
        // will genau eine Sache tun.
        if (latest.current.markieren) { latest.current.onMarkieren(position); return }

        // queryRenderedFeatures wirft, wenn ein genannter Layer fehlt.
        const layers = ['eigene-icon', 'points-icon', 'natur-icon', 'natur-see', 'zones-fill']
          .filter((id) => m.getLayer(id))
        const hits = layers.length ? m.queryRenderedFeatures(e.point, { layers }) : []

        // Beim Zeichnen wird ein angeklickter Ort zum Wegpunkt statt zur
        // Infokarte: „Route über diese Hütte" ist beim Planen das, was man will.
        if (latest.current.drawing) {
          const ort = hits.find((f) => f.layer.id.startsWith('points-') || f.layer.id.startsWith('natur-'))
          const koordinaten = ort?.geometry.type === 'Point'
            ? (ort.geometry.coordinates as Position)
            : position
          latest.current.onAddWaypoint(koordinaten)
          return
        }

        // Sonst: der kleinere Treffer gewinnt — eigene Punkte, dann Orte,
        // dann Natur, zuletzt die grossflächigen Zonen.
        const eigen = hits.find((f) => f.layer.id === 'eigene-icon')
        if (eigen) {
          const p = latest.current.eigene.find((x) => x.id === eigen.properties?.id)
          if (p) { latest.current.onEigenClick(p); return }
        }
        const hitPoint = hits.find((f) => f.layer.id === 'points-icon')
        if (hitPoint) {
          const p = latest.current.points.find((x) => x.id === hitPoint.properties?.id)
          if (p) { latest.current.onPointClick(p); return }
        }
        const hitNatur = hits.find((f) => f.layer.id.startsWith('natur-'))
        if (hitNatur) {
          const n = latest.current.nature.find((x) => x.id === hitNatur.properties?.id)
          if (n) { latest.current.onNatureClick(n); return }
        }
        const hitZone = hits.find((f) => f.layer.id === 'zones-fill')
        if (hitZone) {
          const z = latest.current.zones.find((x) => x.id === hitZone.properties?.id)
          if (z) latest.current.onZoneClick(z)
        }
      })

      // Im Zeichenmodus bleibt das Fadenkreuz stehen — sonst würde der Cursor
      // über Zonen fälschlich Anklickbarkeit signalisieren.
      for (const layer of ['points-icon', 'natur-icon', 'natur-see', 'eigene-icon', 'zones-fill']) {
        m.on('mouseenter', layer, () => {
          if (!latest.current.drawing && !latest.current.markieren) setzeCursor('pointer')
        })
        m.on('mouseleave', layer, () => {
          if (!latest.current.drawing && !latest.current.markieren) setzeCursor('')
        })
      }
    }

    return () => { m.remove(); map.current = null; ready.current = false }
  }, [region])

  // Filter-/Datenwechsel: nur die Quellen aktualisieren, die Karte bleibt stehen.
  useEffect(() => {
    const m = map.current
    if (m && ready.current) updateData(m, zones, points, activity)
  }, [zones, points, activity])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('peaks') as GeoJSONSource | undefined)?.setData(peaksToGeoJson(peaks))
  }, [peaks])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('natur') as GeoJSONSource | undefined)?.setData(natureToGeoJson(nature))
  }, [nature])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('eigene') as GeoJSONSource | undefined)?.setData(eigeneToGeoJson(eigene))
  }, [eigene])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('route') as GeoJSONSource | undefined)?.setData(routeToGeoJson(route, waypoints))
  }, [route, waypoints])

  useEffect(() => {
    const m = map.current
    if (!m) return
    m.getCanvas().style.cursor = drawing || markieren ? 'crosshair' : ''
    // Im Zeichenmodus den Doppelklick-Zoom abschalten: sonst setzt ein
    // Doppelklick zwei Wegpunkte und zoomt dabei auch noch.
    if (drawing || markieren) m.doubleClickZoom.disable()
    else m.doubleClickZoom.enable()
  }, [drawing, markieren])

  // Hintergrundkarte wechseln. setStyle verwirft alle Quellen und Layer —
  // setupLayers hängt an 'style.load' und baut sie deshalb selbst wieder auf.
  const ersterBasemap = useRef(basemap)
  useEffect(() => {
    const m = map.current
    if (!m || basemap === ersterBasemap.current) return
    ersterBasemap.current = basemap
    m.setStyle(BASEMAPS[basemap].style)
  }, [basemap])

  // Während des Ausblendens hat der Container die Grösse 0; ohne resize bliebe
  // der Canvas danach leer.
  useEffect(() => {
    if (!visible) return
    const m = map.current
    if (!m) return
    const id = requestAnimationFrame(() => m.resize())
    return () => cancelAnimationFrame(id)
  }, [visible])

  // h-full/w-full statt absolute inset-0: MapLibre setzt auf dem Container selbst
  // `.maplibregl-map { position: relative }` und würde ein `absolute` überschreiben,
  // wodurch inset-0 wirkungslos wäre und der Container auf 0 Höhe kollabiert.
  return <div ref={container} className="h-full w-full" aria-label={`Legalitätskarte ${region.name}`} />
}

/* ------------------------------------------------------------- GeoJSON-Bau */

function zonesToGeoJson(zones: Zone[], activity: ActivityMode): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      properties: {
        id: z.id,
        name: z.name,
        // Nicht z.status: bei gewählter Aktivität zählt deren eigene Regel.
        status: effectiveStatus(z, activity),
        review_status: z.review_status,
      },
      geometry: z.geometry,
    })),
  }
}

function pointsToGeoJson(points: Point[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, type: p.type },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  }
}

function natureToGeoJson(features: NatureFeature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((n) => ({
      type: 'Feature',
      properties: { id: n.id, name: n.name, type: n.type, benannt: n.benannt },
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
    })),
  }
}

function eigeneToGeoJson(punkte: EigenerPunkt[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: punkte.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, typ: p.typ, hatFoto: Boolean(p.foto_pfad) },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  }
}

function peaksToGeoJson(peaks: Peak[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: peaks.map((p) => ({
      type: 'Feature',
      properties: { name: p.name, elevation: p.elevation },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  }
}

function routeToGeoJson(route: Position[], waypoints: Position[]): GeoJSON.FeatureCollection {
  // Nur die gesetzten Wegpunkte bekommen einen Griff — eine gerasterte Route
  // hat hunderte Stützpunkte, die niemand als Punkte sehen will.
  const features: GeoJSON.Feature[] = waypoints.map((p, i) => ({
    type: 'Feature',
    properties: {
      index: i,
      rolle: i === 0 ? 'start' : i === waypoints.length - 1 ? 'ziel' : 'zwischen',
      // Start und Ziel tragen ihren Namen, Zwischenstopps ihre Nummer.
      beschriftung: i === 0 ? 'Start' : i === waypoints.length - 1 ? 'Ziel' : String(i),
    },
    geometry: { type: 'Point', coordinates: p },
  }))
  if (route.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route },
    })
  }
  return { type: 'FeatureCollection', features }
}

/* ---------------------------------------------------------------- Ausdrücke */

const statusColor: ExpressionSpecification = [
  'match', ['get', 'status'],
  'allowed', STATUS_COLORS.allowed,
  'tolerated', STATUS_COLORS.tolerated,
  'forbidden', STATUS_COLORS.forbidden,
  STATUS_COLORS.unknown,
]

/** Punktarten auf ihr Symbolbild abbilden. */
const punktSymbol: ExpressionSpecification = ['concat', 'cb-', ['get', 'type']]

/**
 * Eigene Punkte leihen sich das passende Symbol der jeweiligen Gattung —
 * ein selbst markierter Aussichtspunkt sieht aus wie ein Aussichtspunkt.
 * Dass er von einem selbst stammt, sagt der Ring darunter.
 */
const eigenSymbol: ExpressionSpecification = [
  'match', ['get', 'typ'],
  'viewpoint', 'cb-viewpoint',
  'campspot', 'cb-campsite',
  'water', 'cb-drinking_water',
  'foto', 'cb-foto',
  'cb-eigen',
]

function addLayers(m: MlMap) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  /**
   * Der Rahmen zuerst — er liegt direkt auf der Hintergrundkarte und unter
   * allem Eigenen. Alles, was diese App zeigt, liegt in den Alpen; was
   * ausserhalb läge, gehörte ohnehin überdeckt.
   */
  m.addSource('rahmen', { type: 'geojson', data: maskeGeoJson() })
  m.addLayer({
    id: 'rahmen-fuellung',
    type: 'fill',
    source: 'rahmen',
    filter: ['!=', ['get', 'kante'], true],
    // Dieselbe Fläche wie unter der Oberfläche: die Karte wirkt wie ein
    // ausgeschnittenes Blatt, nicht wie ein Ladefehler.
    paint: { 'fill-color': '#0C1113', 'fill-opacity': 1 },
  })
  m.addLayer({
    id: 'rahmen-kante',
    type: 'line',
    source: 'rahmen',
    filter: ['==', ['get', 'kante'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    // Eine Haarlinie, damit der Rand gezogen aussieht und nicht abgerissen.
    paint: { 'line-color': '#94ABB0', 'line-opacity': 0.35, 'line-width': 1 },
  })

  m.addSource('zones', { type: 'geojson', data: empty })
  m.addSource('points', { type: 'geojson', data: empty })
  m.addSource('natur', { type: 'geojson', data: empty })
  m.addSource('eigene', { type: 'geojson', data: empty })
  m.addSource('route', { type: 'geojson', data: empty })
  m.addSource('route-griff', { type: 'geojson', data: empty })
  m.addSource('peaks', { type: 'geojson', data: empty })

  m.addLayer({
    id: 'zones-fill',
    type: 'fill',
    source: 'zones',
    paint: { 'fill-color': statusColor, 'fill-opacity': 0.3 },
  })

  // Zwei Umriss-Layer statt eines: line-dasharray ist nicht datengesteuert,
  // deshalb trennt ein Filter geprüfte (durchgezogen) von ungeprüften (gestrichelt) Zonen.
  m.addLayer({
    id: 'zones-outline-verified',
    type: 'line',
    source: 'zones',
    filter: ['!=', ['get', 'review_status'], 'entwurf'],
    paint: { 'line-color': statusColor, 'line-width': 2.5 },
  })
  m.addLayer({
    id: 'zones-outline-draft',
    type: 'line',
    source: 'zones',
    filter: ['==', ['get', 'review_status'], 'entwurf'],
    paint: { 'line-color': statusColor, 'line-width': 2, 'line-dasharray': [2, 2] },
  })

  m.addLayer({
    id: 'zones-label',
    type: 'symbol',
    source: 'zones',
    minzoom: 8,
    layout: {
      'text-field': ['get', 'name'], 'text-size': 11.5, 'text-font': TEXT_FONT,
      'text-letter-spacing': 0.02, 'text-max-width': 8,
    },
    paint: {
      'text-color': '#101A1C', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.5,
    },
  })

  // Das Gipfelsymbol wird gezeichnet, nicht getippt: ein ▲ als Textglyphe
  // hinge davon ab, dass der Schriftserver dieses Zeichen ausliefert — und
  // auf einer reinen Rasterkarte gibt es ohnehin keine eigenen Glyphen.
  gipfelSymbolAnlegen(m)

  // Gipfel in drei Stufen: hohe früh, niedrige erst beim Hineinzoomen. Alle
  // 1291 gleichzeitig wären eine unlesbare Punktwolke.
  const peakTiers: [string, number, maplibregl.FilterSpecification][] = [
    ['peaks-hoch', 8, ['>=', ['get', 'elevation'], 3500]],
    ['peaks-mittel', 11, ['all', ['>=', ['get', 'elevation'], 2500], ['<', ['get', 'elevation'], 3500]]],
    ['peaks-niedrig', 13, ['<', ['get', 'elevation'], 2500]],
  ]
  for (const [id, minzoom, filter] of peakTiers) {
    m.addLayer({
      id,
      type: 'symbol',
      source: 'peaks',
      minzoom,
      filter,
      layout: {
        'icon-image': 'gipfel',
        'icon-size': 1,
        'icon-anchor': 'bottom',
        'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'elevation']], ' m'],
        'text-size': 10.5,
        'text-font': TEXT_FONT,
        'text-anchor': 'top',
        'text-offset': [0, 0.35],
        'text-optional': true,
      },
      paint: {
        'text-color': '#3F2A1B',
        'text-halo-color': 'rgba(255,255,255,0.92)',
        'text-halo-width': 1.4,
      },
    })
  }

  /**
   * Natur zuerst, darüber die Schlafplätze: läuft eine Hütte und ein Brunnen
   * ineinander, soll die Hütte gewinnen — sie ist die Entscheidung, der
   * Brunnen nur die Fussnote.
   *
   * Erst ab Zoom 12: über eine ganze Region gestreut wären 957 Brunnen
   * keine Karte mehr, sondern ein Raster. Benannte Seen erscheinen früher,
   * weil sie Orientierungspunkte sind.
   */
  // Zwei Layer statt eines mit Zoom-Filter: `['zoom']` in einem `filter` wird
  // bei GeoJSON-Quellen beim Kachelbau ausgewertet und nicht beim Zeichnen —
  // das Ergebnis war eine Ebene, die je nach Kachel da war oder eben nicht.
  // `minzoom` am Layer ist dafür der verlässliche Weg.
  const naturLayout = (groesse: ExpressionSpecification): maplibregl.SymbolLayerSpecification['layout'] => ({
    'icon-image': punktSymbol,
    'icon-size': groesse,
    'icon-allow-overlap': false,
    'icon-padding': 2,
    // Nur echte Namen beschriften: „Quelle" hundertfach nebeneinander
    // ist Rauschen, kein Hinweis.
    'text-field': ['case', ['get', 'benannt'], ['get', 'name'], ''],
    'text-size': 10.5,
    'text-font': TEXT_FONT,
    'text-offset': [0, 0.95],
    'text-anchor': 'top',
    'text-optional': true,
    'text-max-width': 9,
  })
  const naturPaint = {
    'text-color': '#123244',
    'text-halo-color': 'rgba(255,255,255,0.92)',
    'text-halo-width': 1.4,
  }

  // Gewässer früher: sie sind Orientierungspunkte, nicht Kleinkram.
  m.addLayer({
    id: 'natur-see',
    type: 'symbol',
    source: 'natur',
    minzoom: 9.5,
    filter: ['==', ['get', 'type'], 'lake'],
    layout: naturLayout(['interpolate', ['linear'], ['zoom'], 9.5, 0.6, 15, 0.95]),
    paint: naturPaint,
  })
  m.addLayer({
    id: 'natur-icon',
    type: 'symbol',
    source: 'natur',
    minzoom: 12.5,
    filter: ['!=', ['get', 'type'], 'lake'],
    layout: naturLayout(['interpolate', ['linear'], ['zoom'], 12.5, 0.7, 16, 0.95]),
    paint: naturPaint,
  })

  m.addLayer({
    id: 'points-icon',
    type: 'symbol',
    source: 'points',
    layout: {
      'icon-image': punktSymbol,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.55, 11, 0.75, 15, 1],
      'icon-anchor': 'bottom',
      // Schlafplätze dürfen sich überlagern: eine verschwindende Hütte wäre
      // eine fehlende Übernachtungsmöglichkeit.
      'icon-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-font': TEXT_FONT,
      'text-offset': [0, 0.35],
      'text-anchor': 'top',
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: {
      'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5,
      // Beschriftung erst beim Hineinzoomen, das Symbol immer.
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 10.5, 1],
    },
  })

  // Route über die Zonen, aber unter die Punkte: die Punkte sind anklickbar.
  m.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0f172a', 'line-width': 7, 'line-opacity': 0.5 },
  })
  m.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#f8fafc',
      'line-width': 3,
    },
  })
  // Unsichtbarer, breiter Layer nur zum Anfassen: die sichtbare Linie ist
  // 3 px breit, mit dem Finger trifft man sie nie. So lässt sie sich greifen,
  // ohne dass sie fett aussieht.
  m.addLayer({
    id: 'route-treffer',
    type: 'line',
    source: 'route',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 22 },
  })
  m.addLayer({
    id: 'route-griff',
    type: 'circle',
    source: 'route-griff',
    paint: {
      'circle-radius': 7,
      'circle-color': '#f8fafc',
      'circle-stroke-color': '#0f172a',
      'circle-stroke-width': 2.5,
      'circle-opacity': 0.95,
    },
  })
  m.addLayer({
    id: 'route-waypoints',
    type: 'circle',
    source: 'route',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      // Grosszügig, damit der Griff auch mit dem Finger zu treffen ist.
      'circle-radius': 8,
      'circle-color': [
        'match', ['get', 'rolle'],
        'start', '#22c55e',
        'ziel', '#ef4444',
        '#f8fafc',
      ],
      'circle-stroke-color': '#0f172a',
      'circle-stroke-width': 2,
    },
  })
  m.addLayer({
    id: 'route-waypoint-labels',
    type: 'symbol',
    source: 'route',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'text-field': ['get', 'beschriftung'],
      'text-size': 10,
      'text-font': TEXT_FONT,
      'text-offset': [0, -1.4],
      'text-anchor': 'bottom',
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  })

  // Eigene Punkte ganz oben: sie sind selbst gesetzt und sollen nie von
  // importierten Daten verdeckt werden.
  m.addLayer({
    id: 'eigene-ring',
    type: 'circle',
    source: 'eigene',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 13],
      'circle-color': '#5AAFD4',
      'circle-opacity': 0.28,
      'circle-stroke-color': '#5AAFD4',
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 0.7,
      'circle-translate': [0, -6],
    },
  })
  m.addLayer({
    id: 'eigene-icon',
    type: 'symbol',
    source: 'eigene',
    layout: {
      'icon-image': eigenSymbol,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 0.95],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-font': TEXT_FONT,
      'text-offset': [0, 0.35],
      'text-anchor': 'top',
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })
}

/**
 * Kleines Gipfeldreieck als Bild in den Style legen.
 * Nach einem Kartenwechsel sind Bilder mit dem Style verworfen — deshalb
 * idempotent und aus setupLayers heraus aufgerufen.
 */
function gipfelSymbolAnlegen(m: MlMap) {
  if (m.hasImage('gipfel')) return

  const kante = 14
  const dpr = 2
  const c = document.createElement('canvas')
  c.width = kante * dpr
  c.height = kante * dpr
  const g = c.getContext('2d')
  if (!g) return

  g.scale(dpr, dpr)
  g.beginPath()
  g.moveTo(kante / 2, 2)
  g.lineTo(kante - 1.5, kante - 2.5)
  g.lineTo(1.5, kante - 2.5)
  g.closePath()
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.fill()
  g.lineWidth = 1.6
  g.strokeStyle = '#5C3A22'
  g.stroke()

  const bild = g.getImageData(0, 0, c.width, c.height)
  m.addImage('gipfel', { width: c.width, height: c.height, data: new Uint8Array(bild.data) }, { pixelRatio: dpr })
}

function updateData(m: MlMap, zones: Zone[], points: Point[], activity: ActivityMode) {
  ;(m.getSource('zones') as GeoJSONSource | undefined)?.setData(zonesToGeoJson(zones, activity))
  ;(m.getSource('points') as GeoJSONSource | undefined)?.setData(pointsToGeoJson(points))
}
