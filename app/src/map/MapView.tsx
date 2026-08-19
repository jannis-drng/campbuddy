/**
 * SCHICHT 2 — Kartenkomponente.
 *
 * Kapselt MapLibre vollständig: der Rest der App kennt keine Karten-API,
 * sondern nur Zonen, Punkte und Klick-Callbacks. Das ist die Trennung,
 * die einen späteren Wechsel der Kartenbibliothek billig hält.
 */
import { useEffect, useRef } from 'react'
import {
  AttributionControl, GeolocateControl, GeoJSONSource, Map as MlMap, NavigationControl, ScaleControl,
} from 'maplibre-gl'
// maplibre-gl reicht die Expression-Typen nicht nach aussen durch; sie stammen
// aus der Style-Spec, die MapLibre selbst verwendet.
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ActivityMode, Point, Region, Zone } from '../data/types'
import type { Position } from '../data/geo'
import { effectiveStatus } from '../data/legalData'
import { ATTRIBUTION, MAP_STYLE_URL, POINT_COLORS, STATUS_COLORS } from './mapConfig'

interface Props {
  region: Region
  zones: Zone[]
  points: Point[]
  /** Steuert nur die Einfärbung — es werden nie Zonen ausgeblendet. */
  activity: ActivityMode
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
  onZoneClick: (zone: Zone) => void
  onPointClick: (point: Point) => void
  onAddWaypoint: (position: Position) => void
}

export function MapView({
  region, zones, points, activity, visible, route, waypoints, drawing,
  onZoneClick, onPointClick, onAddWaypoint,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const ready = useRef(false)
  const routeRef = useRef({ route, waypoints })
  routeRef.current = { route, waypoints }

  // Aktuelle Daten und Callbacks in Refs spiegeln: die MapLibre-Listener werden
  // genau einmal gebunden, greifen aber immer auf den neuesten Stand zu.
  const latest = useRef({ zones, points, activity, drawing, onZoneClick, onPointClick, onAddWaypoint })
  latest.current = { zones, points, activity, drawing, onZoneClick, onPointClick, onAddWaypoint }

  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MlMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: region.center,
      zoom: region.zoom,
      maxZoom: 17,
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

    m.on('load', () => {
      ready.current = true
      addLayers(m)
      updateData(m, latest.current.zones, latest.current.points, latest.current.activity)
      ;(m.getSource('route') as GeoJSONSource | undefined)
        ?.setData(routeToGeoJson(routeRef.current.route, routeRef.current.waypoints))

      m.on('click', (e) => {
        // Im Zeichenmodus hat das Setzen eines Wegpunkts Vorrang.
        if (latest.current.drawing) {
          latest.current.onAddWaypoint([e.lngLat.lng, e.lngLat.lat])
          return
        }
        // Sonst: Punkte vor Zonen prüfen, der kleinere Treffer gewinnt.
        const hits = m.queryRenderedFeatures(e.point, { layers: ['points-circle', 'zones-fill'] })
        const hitPoint = hits.find((f) => f.layer.id === 'points-circle')
        if (hitPoint) {
          const p = latest.current.points.find((x) => x.id === hitPoint.properties?.id)
          if (p) latest.current.onPointClick(p)
          return
        }
        const hitZone = hits.find((f) => f.layer.id === 'zones-fill')
        if (hitZone) {
          const z = latest.current.zones.find((x) => x.id === hitZone.properties?.id)
          if (z) latest.current.onZoneClick(z)
        }
      })

      // Im Zeichenmodus bleibt das Fadenkreuz stehen — sonst würde der Cursor
      // über Zonen fälschlich Anklickbarkeit signalisieren.
      for (const layer of ['points-circle', 'zones-fill']) {
        m.on('mouseenter', layer, () => {
          if (!latest.current.drawing) m.getCanvas().style.cursor = 'pointer'
        })
        m.on('mouseleave', layer, () => {
          if (!latest.current.drawing) m.getCanvas().style.cursor = ''
        })
      }
    })

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
    ;(m.getSource('route') as GeoJSONSource | undefined)?.setData(routeToGeoJson(route, waypoints))
  }, [route, waypoints])

  useEffect(() => {
    const m = map.current
    if (m) m.getCanvas().style.cursor = drawing ? 'crosshair' : ''
  }, [drawing])

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

const statusColor: ExpressionSpecification = [
  'match', ['get', 'status'],
  'allowed', STATUS_COLORS.allowed,
  'tolerated', STATUS_COLORS.tolerated,
  'forbidden', STATUS_COLORS.forbidden,
  STATUS_COLORS.unknown,
]

const pointColor: ExpressionSpecification = [
  'match', ['get', 'type'],
  'hut', POINT_COLORS.hut,
  'campsite', POINT_COLORS.campsite,
  'vehicle_spot', POINT_COLORS.vehicle_spot,
  '#64748b',
]

function addLayers(m: MlMap) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  m.addSource('zones', { type: 'geojson', data: empty })
  m.addSource('points', { type: 'geojson', data: empty })
  m.addSource('route', { type: 'geojson', data: empty })

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
    layout: { 'text-field': ['get', 'name'], 'text-size': 12 },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })

  m.addLayer({
    id: 'points-circle',
    type: 'circle',
    source: 'points',
    paint: {
      // Touch-freundlich: Trefferfläche wächst mit dem Zoom.
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 11, 7, 15, 11],
      'circle-color': pointColor,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
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
    paint: { 'line-color': '#f8fafc', 'line-width': 3 },
  })
  m.addLayer({
    id: 'route-waypoints',
    type: 'circle',
    source: 'route',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5,
      'circle-color': '#f8fafc',
      'circle-stroke-color': '#0f172a',
      'circle-stroke-width': 2,
    },
  })

  m.addLayer({
    id: 'points-label',
    type: 'symbol',
    source: 'points',
    minzoom: 10.5,
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })
}

function updateData(m: MlMap, zones: Zone[], points: Point[], activity: ActivityMode) {
  ;(m.getSource('zones') as GeoJSONSource | undefined)?.setData(zonesToGeoJson(zones, activity))
  ;(m.getSource('points') as GeoJSONSource | undefined)?.setData(pointsToGeoJson(points))
}

function routeToGeoJson(route: Position[], waypoints: Position[]): GeoJSON.FeatureCollection {
  // Nur die gesetzten Wegpunkte bekommen einen Griff — eine gerasterte Route
  // hat hunderte Stützpunkte, die niemand als Punkte sehen will.
  const features: GeoJSON.Feature[] = waypoints.map((p) => ({
    type: 'Feature',
    properties: {},
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
