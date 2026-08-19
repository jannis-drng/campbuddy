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
  onZoneClick: (zone: Zone) => void
  onPointClick: (point: Point) => void
}

export function MapView({ region, zones, points, activity, visible, onZoneClick, onPointClick }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const ready = useRef(false)

  // Aktuelle Daten und Callbacks in Refs spiegeln: die MapLibre-Listener werden
  // genau einmal gebunden, greifen aber immer auf den neuesten Stand zu.
  const latest = useRef({ zones, points, activity, onZoneClick, onPointClick })
  latest.current = { zones, points, activity, onZoneClick, onPointClick }

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

      // Punkte vor Zonen prüfen: der kleinere Treffer gewinnt.
      m.on('click', (e) => {
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

      for (const layer of ['points-circle', 'zones-fill']) {
        m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = '' })
      }
    })

    return () => { m.remove(); map.current = null; ready.current = false }
  }, [region])

  // Filter-/Datenwechsel: nur die Quellen aktualisieren, die Karte bleibt stehen.
  useEffect(() => {
    const m = map.current
    if (m && ready.current) updateData(m, zones, points, activity)
  }, [zones, points, activity])

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
