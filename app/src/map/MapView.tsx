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
  AttributionControl, GeolocateControl, GeoJSONSource, LngLatBounds, Map as MlMap,
  NavigationControl, ScaleControl,
} from 'maplibre-gl'
import type maplibregl from 'maplibre-gl'
// maplibre-gl reicht die Expression-Typen nicht nach aussen durch; sie stammen
// aus der Style-Spec, die MapLibre selbst verwendet.
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  ActivityMode, EigenerPunkt, NatureFeature, Peak, Point, Region, Wegpunkt, Zone,
} from '../data/types'
import { naechsterIndex, naechsterPunktAufLinie, type Position } from '../data/geo'
import type { Ausschnitt } from '../data/types'
import { effectiveStatus } from '../data/legalData'
import {
  ATTRIBUTION, BASEMAPS, GEMEINDE_COLORS, STATUS_COLORS, textFontFuer, ZOOM_AB, type BasemapKey,
} from './mapConfig'
import { alpenGrenzen, MIN_ZOOM } from './alpenRahmen'
import { symboleAnlegen } from './symbole'

interface Props {
  region: Region
  zones: Zone[]
  points: Point[]
  peaks: Peak[]
  nature: NatureFeature[]
  eigene: EigenerPunkt[]
  /**
   * Die Gemeindeflächen mit ihrer Rechtslage — die Ebene, auf der die Frage
   * ausserhalb der Schutzgebiete tatsächlich entschieden wird.
   */
  gemeinden: GeoJSON.FeatureCollection
  /** Die landesweite Übersichtsfassung — zeichnet unterhalb von Zoom 9,5. */
  gemeindenFern: GeoJSON.FeatureCollection
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
  /**
   * Ausschnitt, auf den die Karte springen soll — gesetzt, wenn eine
   * gespeicherte oder geteilte Tour geöffnet wird.
   *
   * Der `zaehler` ist nötig, weil dieselbe Tour zweimal hintereinander
   * geöffnet werden kann: an der Geometrie allein liesse sich der zweite Klick
   * nicht vom ersten unterscheiden, und die Karte bliebe stehen, wo der Nutzer
   * inzwischen hingescrollt hat.
   */
  kameraZiel: { geometry: Position[]; zaehler: number } | null
  /** Im Zeichenmodus setzt ein Kartenklick einen Wegpunkt statt eine Zone zu öffnen. */
  drawing: boolean
  /** Im Markiermodus setzt ein Kartenklick einen eigenen Punkt. */
  markieren: boolean
  onZoneClick: (zone: Zone) => void
  onPointClick: (point: Point) => void
  onNatureClick: (feature: NatureFeature) => void
  onPeakClick: (peak: Peak) => void
  onEigenClick: (punkt: EigenerPunkt) => void
  /**
   * Klick auf freie Fläche. Dort ist keine Zone eingezeichnet, also entscheidet,
   * wer an dieser Stelle zuständig ist — deshalb kommt der Ort mit.
   */
  onLeerClick: (position: Position) => void
  /**
   * Meldet den sichtbaren Ausschnitt nach jeder Bewegung. Gipfel und
   * Natur-Objekte werden danach nachgeladen: landesweit wären es Zehntausende,
   * sichtbar ist immer nur ein Ausschnitt davon.
   */
  onAusschnitt: (a: Ausschnitt) => void
  onAddWaypoint: (position: Position, ort?: Wegpunkt['ort']) => void
  onInsertWaypoint: (index: number, position: Position) => void
  onMoveWaypoint: (index: number, position: Position) => void
  onRemoveWaypoint: (index: number) => void
  onMarkieren: (position: Position) => void
}

export function MapView({
  region, zones, points, peaks, nature, eigene, gemeinden, gemeindenFern, activity, basemap, visible,
  route, waypoints, kameraZiel, drawing, markieren,
  onZoneClick, onPointClick, onNatureClick, onPeakClick, onEigenClick, onLeerClick, onAusschnitt,
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
    zones, points, peaks, nature, eigene, gemeinden, gemeindenFern, activity, drawing, markieren, waypoints,
    onZoneClick, onPointClick, onNatureClick, onPeakClick, onEigenClick, onLeerClick, onAusschnitt,
    onAddWaypoint, onInsertWaypoint, onMoveWaypoint, onRemoveWaypoint, onMarkieren,
  })
  latest.current = {
    zones, points, peaks, nature, eigene, gemeinden, gemeindenFern, activity, drawing, markieren, waypoints,
    onZoneClick, onPointClick, onNatureClick, onPeakClick, onEigenClick, onLeerClick, onAusschnitt,
    onAddWaypoint, onInsertWaypoint, onMoveWaypoint, onRemoveWaypoint, onMarkieren,
  }

  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MlMap({
      container: container.current,
      style: BASEMAPS[basemap].style,
      center: region.center,
      zoom: region.zoom,
      // Der Ausschnitt bleibt bei den Alpen (siehe alpenRahmen): ausserhalb
      // hätte diese Karte nichts zu sagen, und eine Weltkarte ohne einen
      // einzigen Hinweis darauf liest sich wie „hier gilt nichts". Unabhängig
      // von der gewählten Region — die Alpen sind der Horizont des Projekts,
      // nicht das Wallis.
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
      ;(m.getSource('gemeinden') as GeoJSONSource | undefined)?.setData(latest.current.gemeinden)
      ;(m.getSource('gemeinden-fern') as GeoJSONSource | undefined)?.setData(latest.current.gemeindenFern)
      ;(m.getSource('route') as GeoJSONSource | undefined)
        ?.setData(routeToGeoJson(routeRef.current.route, routeRef.current.waypoints))
      ready.current = true
    }

    m.on('style.load', setupLayers)
    m.on('load', setupLayers)
    m.on('idle', setupLayers)
    if (m.isStyleLoaded()) setupLayers()

    /**
     * Sichtbaren Ausschnitt melden — entprellt, weil `moveend` beim
     * Schwenken mit der Maus in schneller Folge feuert und jede Meldung
     * eine Abfrage nach sich zieht.
     */
    let ausschnittTimer: ReturnType<typeof setTimeout> | undefined
    const meldeAusschnitt = () => {
      clearTimeout(ausschnittTimer)
      ausschnittTimer = setTimeout(() => {
        const b = m.getBounds()
        latest.current.onAusschnitt({
          west: b.getWest(), sued: b.getSouth(), ost: b.getEast(), nord: b.getNorth(),
          zoom: m.getZoom(),
        })
      }, 350)
    }
    m.on('moveend', meldeAusschnitt)
    m.on('load', meldeAusschnitt)
    meldeAusschnitt()

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

        // Abgefragt werden ausschliesslich die unsichtbaren Trefferkreise, nicht
        // die Symbol-Layer — siehe `trefferKreis` in addLayers.
        // queryRenderedFeatures wirft, wenn ein genannter Layer fehlt.
        const layers = [
          'eigene-treffer', 'points-treffer', 'peaks-hoch-treffer', 'peaks-mittel-treffer',
          'peaks-niedrig-treffer', 'natur-treffer', 'natur-see-treffer', 'zones-fill',
        ].filter((id) => m.getLayer(id))
        const hits = layers.length ? m.queryRenderedFeatures(e.point, { layers }) : []

        // Beim Zeichnen wird ein angeklickter Ort zum Wegpunkt statt zur
        // Infokarte: „Route über diese Hütte" ist beim Planen das, was man will.
        if (latest.current.drawing) {
          /*
            Ein angetipptes Symbol wird zum Wegpunkt — mit seinem Namen.
            Vorher wurden zwar schon die Koordinaten uebernommen, aber nicht,
            *was* dort steht: die Liste im Routenpanel konnte danach nur
            „Zwischenstopp 2" sagen, obwohl gerade bewusst eine bestimmte
            Huette angetippt worden war.

            Reihenfolge wie bei der Infokarte: der kleinere Treffer gewinnt.
          */
          const symbol = hits.find((f) =>
            f.layer.id === 'eigene-treffer' || f.layer.id === 'points-treffer'
            || f.layer.id.startsWith('peaks-') || f.layer.id.startsWith('natur-'))

          if (symbol?.geometry.type === 'Point') {
            latest.current.onAddWaypoint(
              symbol.geometry.coordinates as Position,
              wegpunktOrt(symbol, latest.current),
            )
            return
          }
          latest.current.onAddWaypoint(position)
          return
        }

        // Sonst: der kleinere Treffer gewinnt — eigene Punkte, dann Orte,
        // dann Natur, zuletzt die grossflächigen Zonen.
        const eigen = hits.find((f) => f.layer.id === 'eigene-treffer')
        if (eigen) {
          const p = latest.current.eigene.find((x) => x.id === eigen.properties?.id)
          if (p) { latest.current.onEigenClick(p); return }
        }
        const hitPoint = hits.find((f) => f.layer.id === 'points-treffer')
        if (hitPoint) {
          const p = latest.current.points.find((x) => x.id === hitPoint.properties?.id)
          if (p) { latest.current.onPointClick(p); return }
        }
        const hitPeak = hits.find((f) => f.layer.id.startsWith('peaks-'))
        if (hitPeak) {
          const p = latest.current.peaks.find((x) => x.id === hitPeak.properties?.id)
          if (p) { latest.current.onPeakClick(p); return }
        }
        const hitNatur = hits.find((f) => f.layer.id.startsWith('natur-'))
        if (hitNatur) {
          const n = latest.current.nature.find((x) => x.id === hitNatur.properties?.id)
          if (n) { latest.current.onNatureClick(n); return }
        }
        const hitZone = hits.find((f) => f.layer.id === 'zones-fill')
        if (hitZone) {
          const z = latest.current.zones.find((x) => x.id === hitZone.properties?.id)
          if (z) { latest.current.onZoneClick(z); return }
        }

        // Nichts getroffen: hier ist keine Fläche eingezeichnet, also gilt der
        // allgemeine Rahmen der Region. Genau an dieser Stelle stellt sich die
        // Frage — deshalb kommt die Antwort auch hier und nicht in einem
        // Dauerpanel über der Karte.
        latest.current.onLeerClick(position)
      })

      // Im Zeichenmodus bleibt das Fadenkreuz stehen — sonst würde der Cursor
      // über Zonen fälschlich Anklickbarkeit signalisieren.
      const symbolEbenen = [
        'points-treffer', 'natur-treffer', 'natur-see-treffer', 'eigene-treffer',
        'peaks-hoch-treffer', 'peaks-mittel-treffer', 'peaks-niedrig-treffer',
      ]
      for (const layer of [...symbolEbenen, 'zones-fill']) {
        const istSymbol = symbolEbenen.includes(layer)
        m.on('mouseenter', layer, () => {
          if (latest.current.markieren) return
          // Beim Zeichnen bleibt das Fadenkreuz stehen — ausser ueber einem
          // Symbol: dort sagt der Zeiger, dass es sich uebernehmen laesst.
          if (latest.current.drawing) { if (istSymbol) setzeCursor('copy') ; return }
          setzeCursor('pointer')
        })
        m.on('mouseleave', layer, () => {
          if (latest.current.markieren) return
          setzeCursor(latest.current.drawing ? 'crosshair' : '')
        })
      }
    }

    return () => {
      clearTimeout(ausschnittTimer)
      m.remove(); map.current = null; ready.current = false
    }
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
    ;(m.getSource('gemeinden') as GeoJSONSource | undefined)?.setData(gemeinden)
  }, [gemeinden])

  useEffect(() => {
    const m = map.current
    if (m && ready.current) {
      ;(m.getSource('gemeinden-fern') as GeoJSONSource | undefined)?.setData(gemeindenFern)
    }
  }, [gemeindenFern])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('route') as GeoJSONSource | undefined)?.setData(routeToGeoJson(route, waypoints))
  }, [route, waypoints])

  /**
   * Auf eine geöffnete Tour springen.
   *
   * Wer in der Community auf eine Tour klickt, hat gerade ihr Vorschaubild
   * angesehen — landet er danach auf dem zuletzt gewählten Ausschnitt, muss er
   * seine eigene Tour erst suchen.
   *
   * Der Sprung wird bewusst selbst gerechnet statt `fitBounds` zu überlassen.
   * `fitBounds` tut nämlich *nichts*, wenn die Polsterung nicht in den
   * Container passt — kein Fehler, keine Meldung, die Karte bleibt einfach
   * stehen. Genau das passiert bei einem schmalen Fenster, sobald links die
   * Breite des Routenpanels reserviert wird: bei 700 px Fensterbreite blieben
   * von 700 abzüglich 400 + 88 noch 212 px, und je nach Tourlänge sieht das
   * Ergebnis dann aus wie „gar nicht gezoomt".
   */
  useEffect(() => {
    const m = map.current
    if (!m || !kameraZiel || kameraZiel.geometry.length === 0) return

    const punkte = kameraZiel.geometry.filter(
      ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 85,
    )
    if (punkte.length === 0) return

    const anfliegen = () => {
      // `resize()` vorweg: die Karte war bis eben ausgeblendet und hat dann
      // Breite 0 gemessen. Ohne das rechnet der Sprung auf die alte Grösse.
      m.resize()
      const breite = m.getContainer().clientWidth
      const hoehe = m.getContainer().clientHeight
      if (breite === 0 || hoehe === 0) return

      const rahmen = punkte.reduce(
        (b, p) => b.extend(p as [number, number]),
        new LngLatBounds(punkte[0] as [number, number], punkte[0] as [number, number]),
      )

      // Links Platz für das Routenpanel, das beim Öffnen aufgeht — aber nie so
      // viel, dass vom Bild nichts übrig bleibt. Die Polsterung darf zusammen
      // höchstens die Hälfte der jeweiligen Kante belegen.
      const panel = breite >= 640 ? Math.min(400, breite * 0.32) : 0
      const seitlich = Math.max(24, Math.min(breite * 0.12, 72))
      const padding = {
        left: Math.round(panel > 0 ? panel + 24 : seitlich),
        right: Math.round(breite >= 640 ? 88 : seitlich),
        top: Math.round(Math.max(24, Math.min(hoehe * 0.12, 72))),
        bottom: Math.round(Math.max(24, Math.min(hoehe * 0.12, 72))),
      }

      // Selbst rechnen, um zu sehen, ob überhaupt etwas herauskommt. Kommt
      // nichts, war die Polsterung zu gross — dann lieber ohne als gar nicht.
      const ziel =
        m.cameraForBounds(rahmen, { padding, maxZoom: 14 }) ??
        m.cameraForBounds(rahmen, { padding: 24, maxZoom: 14 })
      if (!ziel || !ziel.center || !Number.isFinite(ziel.zoom)) return

      m.easeTo({ center: ziel.center, zoom: ziel.zoom, duration: 900 })
    }

    // Direkt anfliegen. Bewusst ohne Prüfung auf `m.loaded()`: das meldet
    // auch dann `false`, wenn nur noch Kacheln nachladen — und `once('load')`
    // feuert nur ein einziges Mal beim ersten Laden. Wer darauf wartet,
    // wartet nach dem ersten Kachelnachschub für immer. Gerechnet wird
    // ohnehin auf dem Transform, und den gibt es ab dem Konstruktor.
    anfliegen()

    // Einzige Ausnahme: ein Container ohne Grösse. Den gibt es, wenn die Karte
    // noch nie sichtbar war — dann nachholen, sobald sie zur Ruhe kommt.
    if (m.getContainer().clientWidth === 0) m.once('idle', anfliegen)
  }, [kameraZiel])

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
      // `id` muss mit: der Klick sucht den Gipfel damit in der Prop-Liste
      // wieder. Ohne sie fiele jeder Gipfelklick auf die Rechtslage der
      // Region durch — die Ebene traf, die Zuordnung nicht.
      properties: { id: p.id, name: p.name, elevation: p.elevation },
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

/** Wie die Gemeindeebene eingefärbt wird — tiefer als die Zonenfarben. */
const gemeindeColor: ExpressionSpecification = [
  'match', ['get', 'status'],
  'allowed', GEMEINDE_COLORS.allowed,
  'tolerated', GEMEINDE_COLORS.tolerated,
  'forbidden', GEMEINDE_COLORS.forbidden,
  GEMEINDE_COLORS.unknown,
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

/**
 * Ab welcher Zoomstufe die genauen Gemeindegrenzen die Übersicht ablösen.
 *
 * Bei Zoom 8 misst ein Bildpunkt auf Schweizer Breite rund 420 m; die
 * Übersichtsfassung ist auf 550 m ausgedünnt, ihre Abweichung bleibt also
 * unter zwei Pixeln. Ab 9,5 wäre sie sichtbar — dort liegen die genauen
 * Kacheln des Ausschnitts längst vor.
 */
const GEMEINDE_UMSCHALT = ZOOM_AB.gemeindenGenau

/**
 * Der Ebenensatz der Gemeindedarstellung, einmal je Auflösung.
 *
 * Sechs Ebenen zweimal von Hand hinzuschreiben hiesse, sechs Paare von
 * Farbwerten und Linienbreiten synchron halten zu müssen — und das erste, was
 * bei einer Änderung auseinanderliefe, wäre die Farbe an der Zoomschwelle.
 */
function gemeindeEbenen(m: MlMap, quelle: string, zoom: { minzoom?: number; maxzoom?: number }) {
  const id = (name: string) => (quelle === 'gemeinden' ? name : `${name}-fern`)

  m.addLayer({
    ...zoom,
    id: id('gemeinden-grund'),
    type: 'fill',
    source: quelle,
    filter: ['!=', ['get', 'status'], 'unknown'],
    paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.58 },
  })

  // Die Statusfarbe sass vorher mit 32 % direkt auf der Grundkarte. Auf einem
  // Reliefbild heisst das: Rot auf Rotbraun — die wichtigste Aussage dieser
  // Karte war ausgerechnet dort nicht zu erkennen, wo man sie braucht, im
  // Gebirge. Der helle Grund darunter nimmt der Grundkarte so viel Sättigung,
  // dass die Farbe wieder eine Farbe ist, statt eine Tönung.
  m.addLayer({
    ...zoom,
    id: id('gemeinden-fill'),
    type: 'fill',
    source: quelle,
    filter: ['all', ['!=', ['get', 'status'], 'unknown'], ['==', ['get', 'bestaetigt'], true]],
    paint: { 'fill-color': gemeindeColor, 'fill-opacity': 0.46 },
  })

  // Abgeleitet, aber nicht belegt: schraffiert statt voll. Der Prüfstand ist
  // damit Teil des Kartenbilds und nicht bloss eine Fussnote im Infofeld.
  m.addLayer({
    ...zoom,
    id: id('gemeinden-fill-unbestaetigt'),
    type: 'fill',
    source: quelle,
    filter: ['all', ['!=', ['get', 'status'], 'unknown'], ['==', ['get', 'bestaetigt'], false]],
    paint: { 'fill-pattern': schraffurBild, 'fill-opacity': 0.5 },
  })

  // Zwei Linien übereinander: eine helle Kasche, darauf die dunkle Grenze.
  // Die Grundkarte lässt sich umschalten und reicht von hellem Papier bis zu
  // dunklem Relief — eine einzelne graue Linie verschwindet auf der einen oder
  // der anderen. Die Gemeindegrenze ist nach der Rechtslage die zweitwichtigste
  // Linie auf dieser Karte; sie darf nicht von der Grundkarte abhängen.
  m.addLayer({
    ...zoom,
    id: id('gemeinden-outline-kasche'),
    type: 'line',
    source: quelle,
    minzoom: Math.max(8, zoom.minzoom ?? 0),
    paint: {
      'line-color': 'rgba(255,255,255,0.75)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 13, 2.8],
    },
  })
  m.addLayer({
    ...zoom,
    id: id('gemeinden-outline'),
    type: 'line',
    source: quelle,
    minzoom: Math.max(8, zoom.minzoom ?? 0),
    paint: {
      'line-color': '#334155',
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 1.1],
      'line-opacity': 0.75,
    },
  })

  // Der Rand in der Statusfarbe. Er trägt die Aussage auch dort, wo die Fläche
  // klein ist oder von Schutzgebieten überlagert wird — und er macht auf einen
  // Blick sichtbar, wo eine Auskunft aufhört und die nächste anfängt.
  m.addLayer({
    ...zoom,
    id: id('gemeinden-rand'),
    type: 'line',
    source: quelle,
    filter: ['!=', ['get', 'status'], 'unknown'],
    paint: {
      'line-color': gemeindeColor,
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.6, 11, 3, 14, 4],
      'line-opacity': 1,
    },
  })
}

function addLayers(m: MlMap) {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  // Hier und nicht als Konstante im Modul: welche Schrift die eigenen
  // Beschriftungen bekommen können, hängt an der Hintergrundkarte — jeder
  // Style bringt seinen eigenen Schriftserver mit (siehe mapConfig).
  const schrift = textFontFuer(m.getGlyphs())

  m.addSource('zones', { type: 'geojson', data: empty })
  m.addSource('points', { type: 'geojson', data: empty })
  m.addSource('natur', { type: 'geojson', data: empty })
  m.addSource('eigene', { type: 'geojson', data: empty })
  m.addSource('route', { type: 'geojson', data: empty })
  m.addSource('route-griff', { type: 'geojson', data: empty })
  m.addSource('peaks', { type: 'geojson', data: empty })
  m.addSource('gemeinden', { type: 'geojson', data: empty })
  m.addSource('gemeinden-fern', { type: 'geojson', data: empty })

  schraffurenAnlegen(m)

  // Die Gemeindeebene liegt unter allem anderen. Sie beantwortet die Frage im
  // Normalfall — auf freier Fläche, wo kein Schutzgebiet eingezeichnet ist.
  // Wo eines liegt, gilt dessen strengere Regel, und es muss darüber sichtbar
  // bleiben.
  //
  // Nicht recherchierte Gemeinden bekommen gar keine Füllung — nur Grenze und
  // Name. Zwei Gründe, und beide zählen: sie mit einer der drei Rechtsfarben
  // zu füllen hiesse zu raten, und ein neutraler Grauschleier läge derzeit über
  // der ganzen Schweiz und würde die Grundkarte vermatschen. Die leere Fläche
  // ist die ehrlichere und die lesbarere Lösung — und je weiter die Recherche
  // kommt, desto mehr färbt sich die Karte. Man sieht dem Bild den Fortschritt an.
  //
  // Es gibt sie zweimal, aus zwei Quellen: `gemeinden-fern` trägt die
  // landesweite, grob vereinfachte Übersicht und zeichnet bis Zoom 9,5;
  // `gemeinden` trägt die genauen Flächen des Ausschnitts und übernimmt
  // darüber. Der Grund ist nicht Kosmetik, sondern Gewicht — in voller
  // Auflösung sind die 2119 Grenzen 617 KB gepackt, der grösste Einzelposten
  // der ganzen Anwendung. Wer über die Karte fliegt, braucht davon nichts;
  // wer eine Gemeinde wirklich ansieht, bekommt sie exakt.
  gemeindeEbenen(m, 'gemeinden-fern', { maxzoom: GEMEINDE_UMSCHALT })
  gemeindeEbenen(m, 'gemeinden', { minzoom: GEMEINDE_UMSCHALT })

  m.addLayer({
    id: 'gemeinden-label',
    type: 'symbol',
    source: 'gemeinden',
    minzoom: 10,
    layout: {
      'text-field': ['get', 'name'], 'text-size': 10.5, 'text-font': schrift,
      'text-letter-spacing': 0.03, 'text-max-width': 9,
    },
    paint: {
      'text-color': '#1E293B', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.6,
    },
  })

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
      'text-field': ['get', 'name'], 'text-size': 11.5, 'text-font': schrift,
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
        'text-font': schrift,
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
    'text-font': schrift,
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

  /**
   * Unsichtbare Kreise nur zum Anklicken.
   *
   * MapLibres Trefferprüfung auf Symbol-Layern hängt daran, dass die
   * Symbolplatzierung fertig gerechnet ist. Ist sie das nicht — etwa weil noch
   * Kacheln unterwegs sind —, liefert eine Abfrage auf einen einzelnen Pixel
   * unter Umständen jedes Symbol der Kachel zurück; gemessen wurden Treffer
   * über 250 px entfernt. Ein Klick auf leere Fläche öffnete dann irgendeine
   * Hütte am anderen Ende des Tals.
   *
   * Kreis-Layer werden geometrisch geprüft und kennen dieses Problem nicht.
   * Sie sind vollständig durchsichtig, liegen deckungsgleich über den Symbolen
   * und sind die einzigen Layer, die der Klick abfragt.
   */
  const trefferKreis = (
    id: string, source: string, radius: ExpressionSpecification, versatz: [number, number],
  ): maplibregl.CircleLayerSpecification => ({
    id,
    type: 'circle',
    source,
    paint: {
      'circle-radius': radius,
      'circle-color': '#000000',
      'circle-opacity': 0,
      'circle-translate': versatz,
    },
  })

  m.addLayer({
    ...trefferKreis(
      'natur-see-treffer', 'natur',
      ['interpolate', ['linear'], ['zoom'], 9.5, 8, 15, 12], [0, 0],
    ),
    minzoom: 9.5,
    filter: ['==', ['get', 'type'], 'lake'],
  })
  m.addLayer({
    ...trefferKreis(
      'natur-treffer', 'natur',
      ['interpolate', ['linear'], ['zoom'], 12.5, 9, 16, 12], [0, 0],
    ),
    minzoom: 12.5,
    filter: ['!=', ['get', 'type'], 'lake'],
  })

  /*
    Gipfel anklickbar machen. Der Trefferkreis sitzt etwas höher als der
    Ankerpunkt, weil das Gipfelsymbol nach oben aus dem Punkt herauswächst
    (`icon-anchor: bottom`) — ohne Versatz träfe man daneben.

    Derselbe Stufenfilter wie bei der Darstellung: was nicht gezeichnet ist,
    darf auch nicht getroffen werden, sonst klickt man auf einen unsichtbaren
    Gipfel.
  */
  for (const [id, minzoom, filter] of peakTiers) {
    m.addLayer({
      ...trefferKreis(`${id}-treffer`, 'peaks',
        ['interpolate', ['linear'], ['zoom'], 8, 8, 15, 12], [0, -6]),
      minzoom,
      filter,
    })
  }

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
      'text-font': schrift,
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

  // Die Nadel steht auf ihrem Ort, der Körper liegt darüber — der Trefferkreis
  // wird deshalb nach oben versetzt, sonst klickt man ins Leere unter dem Symbol.
  m.addLayer(trefferKreis(
    'points-treffer', 'points',
    ['interpolate', ['linear'], ['zoom'], 7, 7, 11, 10, 15, 14], [0, -13],
  ))

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
      'text-font': schrift,
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
      'text-font': schrift,
      'text-offset': [0, 0.35],
      'text-anchor': 'top',
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })
  m.addLayer(trefferKreis(
    'eigene-treffer', 'eigene',
    ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 13], [0, -12],
  ))
}

/**
 * Diagonale Schraffuren als Kachelbilder — eine je Rechtslage.
 *
 * Sie machen den Prüfstand im Kartenbild sichtbar: eine belegte Einstufung
 * wird als volle Fläche gezeichnet, eine bloss abgeleitete schraffiert. Wer
 * die Karte anschaut, sieht damit sofort, wo die Auskunft trägt und wo sie
 * erst ein Anhaltspunkt ist — ohne eine Zeile zu lesen.
 *
 * Drei Bilder statt eines eingefärbten, weil `fill-pattern` sich nicht pro
 * Fläche tönen lässt; die Auswahl passiert stattdessen über einen
 * `match`-Ausdruck auf `status`.
 */
function schraffurenAnlegen(m: MlMap) {
  const kante = 8
  const dpr = 2
  for (const [name, farbe] of Object.entries(GEMEINDE_COLORS)) {
    const id = `schraffur-${name}`
    if (m.hasImage(id)) continue
    const c = document.createElement('canvas')
    c.width = kante * dpr
    c.height = kante * dpr
    const g = c.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    g.strokeStyle = farbe
    g.lineWidth = 2.2
    // Zwei versetzte Striche, damit die Kachel nahtlos aneinanderstösst.
    for (const versatz of [-kante, 0]) {
      g.beginPath()
      g.moveTo(versatz, kante)
      g.lineTo(versatz + kante, 0)
      g.stroke()
    }
    const bild = g.getImageData(0, 0, c.width, c.height)
    m.addImage(id, { width: c.width, height: c.height, data: new Uint8Array(bild.data) }, { pixelRatio: dpr })
  }
}

/** Welche Schraffur zu welcher Rechtslage gehört. */
const schraffurBild: ExpressionSpecification = [
  'match', ['get', 'status'],
  'allowed', 'schraffur-allowed',
  'tolerated', 'schraffur-tolerated',
  'forbidden', 'schraffur-forbidden',
  'schraffur-unknown',
]

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

/**
 * Woher stammt der angetippte Punkt, und wie heisst er?
 *
 * Aus der getroffenen Ebene und der ID; den Namen holt die Funktion aus den
 * Prop-Listen statt aus den GeoJSON-Eigenschaften, damit sie dieselbe Quelle
 * benutzt wie die Infokarte und nicht zwei Fassungen desselben Namens
 * auseinanderlaufen koennen.
 */
function wegpunktOrt(
  treffer: maplibregl.MapGeoJSONFeature,
  daten: { points: Point[]; peaks: Peak[]; nature: NatureFeature[]; eigene: EigenerPunkt[] },
): Wegpunkt['ort'] {
  const id = treffer.properties?.id
  const ebene = treffer.layer.id

  if (ebene === 'eigene-treffer') {
    const p = daten.eigene.find((x) => x.id === id)
    return p && { name: p.name, art: 'eigen' }
  }
  if (ebene === 'points-treffer') {
    const p = daten.points.find((x) => x.id === id)
    return p && { name: p.name, art: p.type }
  }
  if (ebene.startsWith('peaks-')) {
    const p = daten.peaks.find((x) => x.id === id)
    return p && { name: p.name, art: 'peak' }
  }
  if (ebene.startsWith('natur-')) {
    const n = daten.nature.find((x) => x.id === id)
    if (!n) return undefined
    return { name: n.name, art: n.type === 'viewpoint' ? 'aussicht' : 'wasser' }
  }
  return undefined
}
