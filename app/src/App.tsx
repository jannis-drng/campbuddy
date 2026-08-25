import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_REGION, REGIONS } from './data/regions'
import {
  filterNature, filterPoints, getRegion, ladeGipfel, ladeGipfelUebersicht, ladeNatur, ladePunkte,
  ladeZonen, verificationStats,
} from './data/legalData'
import type {
  Ausschnitt, EigenerPunkt, MapFilters, NatureFeature, Peak, Point, TripParams, Wegpunkt, Zone,
} from './data/types'
import { MapView } from './map/MapView'
import { DisclaimerBar } from './components/Disclaimer'
import { FilterBar } from './components/FilterBar'
import { InfoPanel, type Selection } from './components/InfoPanel'
import { Legend } from './components/Legend'
import { MyToursPanel } from './components/MyToursPanel'
import { CommunityPanel } from './components/CommunityPanel'
import { TourDetailModal } from './components/TourDetailModal'
import { RoutePanel } from './components/RoutePanel'
import { analyseRoute } from './data/routeAnalysis'
import { lineLength, type Position } from './data/geo'
import { umkehren, verschieben, wegpunktName } from './data/wegpunkte'
import { parseGpx } from './services/gpx'
import { loadElevationProfile, type ElevationPoint } from './services/elevation'
import { analyseProfil, planeEtappen } from './data/hiking'
import { routeWaypoints, type RoutedPath, type RoutingProfile } from './map/routing'
import { AccountPanel } from './components/AccountPanel'
import { PunktDialog } from './components/PunktDialog'
import { ladeEigenePunkte, punktLoeschen } from './services/eigenePunkte'
import { kantonAn, kantonGrundlagen, kantonRecht, ladeKantone } from './data/kantone'
import {
  gemeindeAn, gemeindeRecht, gemeindenGeoJSON, ladeGemeindenDetail, ladeGemeindenUebersicht,
} from './data/gemeinden'
import { BasemapSwitcher } from './components/BasemapSwitcher'
import { Marke } from './components/Marke'
import { DEFAULT_BASEMAP, ZOOM_AB, type BasemapKey } from './map/mapConfig'
import { isSupabaseConfigured } from './services/supabase'
import { serviceWorkerVorwaermen } from './services/sw'
import {
  linkErgebnisAuslesen, saveTour, useSession,
  type GespeicherteEtappe, type LinkErgebnis,
} from './services/account'
import type { PackStaende } from './affiliate/packlist'
import { ORT_UMKREIS_M, type Ortsfilter } from './services/community'
import { Bookmark, Compass, LogIn, Map, Route, UserRound } from 'lucide-react'
import { Auswahl, Button, Segmente } from './ui'

const INITIAL_FILTERS: MapFilters = {
  activity: 'all',
  showHuts: true,
  showCampsites: true,
  showVehicleSpots: true,
  showPeaks: true,
  showWater: true,
  showViewpoints: true,
  showEigene: true,
}

type View = 'karte' | 'community' | 'touren' | 'konto'

const mehrereRegionen = Object.keys(REGIONS).length > 1

export default function App() {
  const [view, setView] = useState<View>('karte')
  const { session } = useSession()
  // Rückkehr von einem Bestätigungs-, Anmelde- oder Passwortlink auswerten,
  // bevor die Adresszeile aufgeräumt wird.
  const [linkErgebnis, setLinkErgebnis] = useState<LinkErgebnis | null>(null)
  useEffect(() => {
    const ergebnis = linkErgebnisAuslesen()
    if (ergebnis) { setLinkErgebnis(ergebnis); setView('konto') }
  }, [])
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION)
  const [basemap, setBasemap] = useState<BasemapKey>(DEFAULT_BASEMAP)
  const [filters, setFilters] = useState<MapFilters>(INITIAL_FILTERS)
  const [selection, setSelection] = useState<Selection>(null)

  // Selbst markierte Punkte: eigene und veröffentlichte, aus dem Backend.
  const [eigenePunkte, setEigenePunkte] = useState<EigenerPunkt[]>([])
  const [markieren, setMarkieren] = useState(false)
  const [dialogPosition, setDialogPosition] = useState<Position | null>(null)
  const [dialogPunkt, setDialogPunkt] = useState<EigenerPunkt | null>(null)

  const [routeOpen, setRouteOpen] = useState(false)
  const [auswertungOffen, setAuswertungOffen] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  // Die vom Nutzer gesetzten Stützpunkte …
  /*
    Wegpunkte tragen jetzt mit, *was* an ihrer Stelle steht, wenn sie durch
    Antippen eines Symbols entstanden sind. Die Koordinaten allein reichten
    nicht: die Liste im Routenpanel konnte danach nur „Zwischenstopp 2" sagen,
    obwohl gerade bewusst eine bestimmte Hütte angetippt worden war.
  */
  const [waypoints, setWaypoints] = useState<Wegpunkt[]>([])

  /** Nur die Koordinaten — für Routing, Karte und Speichern. */
  const wegpunktOrte = useMemo(() => waypoints.map((w) => w.position), [waypoints])
  /** Was an ihnen steht — für die Beschriftung auf der Karte. */
  const wegpunktBeschriftungen = useMemo(
    () => waypoints.map((w, i) => wegpunktName(w, i, waypoints.length)),
    [waypoints],
  )
  // … das Ergebnis des Weg-Routings dazwischen …
  const [routed, setRouted] = useState<RoutedPath | null>(null)
  const [routingBusy, setRoutingBusy] = useState(false)
  const [profile, setProfile] = useState<RoutingProfile>('foot')
  // … und eine importierte GPX-Spur, die unverändert übernommen wird.
  const [gpxTrack, setGpxTrack] = useState<Position[] | null>(null)
  const [profil, setProfil] = useState<ElevationPoint[]>([])
  const [hoehenBusy, setHoehenBusy] = useState(false)
  const [hoehenFehler, setHoehenFehler] = useState<string | null>(null)

  // Escape beendet den aktiven Modus — die übliche Fluchttaste, und ohne sie
  // klebt man im Zeichenmodus fest, sobald das Panel zugeschoben ist.
  useEffect(() => {
    if (!drawing && !markieren) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setDrawing(false)
      setMarkieren(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawing, markieren])

  /**
   * Der Seitentitel folgt der Ansicht.
   *
   * Eine Einzelseiten-App behält sonst denselben Titel, egal wo man ist —
   * in der Verlaufsliste und in einer Leiste voller Tabs sind dann alle
   * Einträge gleich, und Lesezeichen tragen den falschen Namen.
   */
  useEffect(() => {
    const titel = {
      karte: 'Karte',
      community: 'Community',
      touren: 'Deine Touren',
      konto: session ? 'Konto' : 'Anmelden',
    }[view]
    document.title = `${titel} — CampBuddy`
  }, [view, session])

  const region = getRegion(regionCode)

  /*
   * Die Kartendaten kommen aus statischen Snapshot-Dateien, nicht mehr aus der
   * Datenbank. Was das ändert, steht ausführlich in `data/snapshot.ts`; kurz:
   * jede Datei trägt einen Inhalts-Hash, liegt danach unbegrenzt im Cache, und
   * ein Wiederbesuch lädt keinen einzigen Byte davon neu.
   *
   * Zonen und Punkte gelten landesweit und kommen in einem Stück. Gipfel und
   * Naturobjekte hängen am Ausschnitt: landesweit wären es einunddreissigtausend
   * Objekte für Ebenen, die erst ab Zoom 9,5 beziehungsweise 12,5 gezeichnet
   * werden.
   */
  const [allZones, setAllZones] = useState<Zone[]>([])
  const [allPoints, setAllPoints] = useState<Point[]>([])
  const [ausschnitt, setAusschnitt] = useState<Ausschnitt | null>(null)
  const [allPeaks, setAllPeaks] = useState<Peak[]>([])
  const [allNature, setAllNature] = useState<NatureFeature[]>([])
  const [datenFehler, setDatenFehler] = useState(false)

  useEffect(() => {
    let aktuell = true
    setAllZones([]); setAllPoints([]); setDatenFehler(false)
    // Zonen sind der Kern: bleiben sie aus, ist die Karte keine Legalitätskarte
    // mehr und muss das sagen, statt leer und zuversichtlich auszusehen.
    ladeZonen(regionCode)
      .then((z) => {
        if (!aktuell) return
        setAllZones(z)
        // Erst jetzt darf der Service Worker seinen Cache füllen: vorher
        // konkurrierte er mit genau diesem Ladevorgang.
        serviceWorkerVorwaermen()
      })
      .catch(() => { if (aktuell) setDatenFehler(true) })
    ladePunkte(regionCode)
      .then((p) => { if (aktuell) setAllPoints(p) })
      .catch(() => {})
    ladeKantone(regionCode).catch(() => {})
    ladeGipfelUebersicht(regionCode)
      .then((g) => { if (aktuell) setAllPeaks((bisher) => (bisher.length > g.length ? bisher : g)) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [regionCode])

  // Neu laden, wenn die Region wechselt oder sich die Anmeldung ändert: nach
  // dem Anmelden kommen die eigenen, privaten Punkte dazu.
  useEffect(() => {
    let aktuell = true
    ladeEigenePunkte(regionCode)
      .then((p) => { if (aktuell) setEigenePunkte(p) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [regionCode, session?.user.id])

  // Nachladen, sobald sich Ausschnitt oder Region ändern — und nur für Ebenen,
  // die überhaupt eingeschaltet sind. Wer kein Wasser sehen will, soll auch
  // keins herunterladen.
  useEffect(() => {
    if (!ausschnitt) return
    let aktuell = true
    // Die Lader liefern null, wenn der Ausschnitt keine neue Kachel berührt —
    // beim blossen Verschieben passiert dann gar nichts. Genau das war vorher
    // das Leck: jede Kartenbewegung ging als frische Abfrage an die Datenbank.
    // Die Zoomschwelle ist kein Feinschliff, sondern der Unterschied zwischen
    // zwei und hundert Kacheln: in der Landesansicht deckt der Ausschnitt fast
    // die ganze Schweiz ab, gezeichnet wird von diesen Ebenen dort aber nichts.
    if (filters.showPeaks && ausschnitt.zoom >= ZOOM_AB.gipfelKacheln) {
      ladeGipfel(regionCode, ausschnitt)
        .then((p) => { if (aktuell && p) setAllPeaks(p) })
        .catch(() => {})
    }
    if ((filters.showWater || filters.showViewpoints) && ausschnitt.zoom >= ZOOM_AB.natur) {
      ladeNatur(regionCode, ausschnitt)
        .then((n) => { if (aktuell && n) setAllNature(n) })
        .catch(() => {})
    }
    return () => { aktuell = false }
  }, [regionCode, ausschnitt, filters.showPeaks, filters.showWater, filters.showViewpoints])

  // Zonen werden nie gefiltert — nur umgefärbt (siehe effectiveStatus).
  const points = useMemo(() => filterPoints(allPoints, filters), [allPoints, filters])
  const nature = useMemo(() => filterNature(allNature, filters), [allNature, filters])
  const sichtbareEigene = useMemo(
    () => (filters.showEigene ? eigenePunkte : []),
    [eigenePunkte, filters.showEigene],
  )
  const stats = useMemo(() => verificationStats(allZones), [allZones])

  /*
   * Die Gemeindeflächen in zwei Auflösungen.
   *
   * Die Übersicht kommt einmal und färbt sofort das ganze Land; die genauen
   * Grenzen kommen kachelweise nach, sobald jemand hineinzoomt. Warum das
   * beides braucht, steht in `data/gemeinden.ts` — kurz: die 2119 Grenzen sind
   * in voller Auflösung der grösste Einzelposten der Anwendung, beim Zeichnen
   * tragen sie aber nur Farbe, und die Frage „in welcher Gemeinde stehe ich"
   * wird erst beim Hineinzoomen gestellt.
   */
  const [gemeindenUebersichtStand, setGemeindenUebersichtStand] = useState(0)
  const [gemeindenDetailStand, setGemeindenDetailStand] = useState(0)

  useEffect(() => {
    let aktuell = true
    ladeGemeindenUebersicht(regionCode)
      .then(() => { if (aktuell) setGemeindenUebersichtStand((n) => n + 1) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [regionCode])

  useEffect(() => {
    // Unterhalb der Umschaltstufe zeichnet die Karte ohnehin die Übersicht;
    // die genauen Flächen dort zu holen hiesse, 617 KB in Scheiben zu laden,
    // um sie nicht anzuzeigen.
    if (!ausschnitt || ausschnitt.zoom < ZOOM_AB.gemeindenGenau) return
    let aktuell = true
    ladeGemeindenDetail(ausschnitt)
      .then((neu) => { if (aktuell && neu) setGemeindenDetailStand((n) => n + 1) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [ausschnitt])

  // Nur neu bauen, wenn tatsächlich andere Flächen vorliegen: zweitausend
  // Polygone bei jedem Rendern durchzurechnen wäre reine Verschwendung.
  const gemeindenFern = useMemo(
    () => gemeindenGeoJSON('uebersicht'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gemeindenUebersichtStand],
  )
  const gemeindenGeo = useMemo(
    () => gemeindenGeoJSON('genau'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gemeindenDetailStand],
  )
  // Die Analyse läuft über alle Punkte, nicht die gefilterten: eine ausgeblendete
  // Hütte ist trotzdem eine Schlafmöglichkeit an der Route.
  // Eine importierte Spur folgt bereits realen Wegen und wird nicht neu geroutet.
  const routeGeometry = useMemo<Position[]>(
    () => gpxTrack ?? routed?.coordinates ?? wegpunktOrte,
    [gpxTrack, routed, wegpunktOrte],
  )

  const analysis = useMemo(
    () => analyseRoute(routeGeometry, allZones, allPoints),
    [routeGeometry, allZones, allPoints],
  )

  // Höhenprofil nachladen, sobald der Streckenverlauf steht. Entprellt, damit
  // beim Setzen mehrerer Wegpunkte nicht jedes Zwischenergebnis abgefragt wird.
  useEffect(() => {
    if (routeGeometry.length < 2) { setProfil([]); setHoehenFehler(null); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setHoehenBusy(true)
      setHoehenFehler(null)
      loadElevationProfile(routeGeometry, controller.signal)
        .then(setProfil)
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return
          setHoehenFehler((e as Error).message)
          setProfil([])
        })
        .finally(() => setHoehenBusy(false))
    }, 600)
    return () => { clearTimeout(timer); controller.abort() }
  }, [routeGeometry])

  const wanderStats = useMemo(() => analyseProfil(profil), [profil])
  const etappen = useMemo(() => planeEtappen(profil, allPoints), [profil, allPoints])

  // Wegpunkte auf reale Wege rastern. Entprellt, weil die genutzte
  // OSRM-Instanz von der OSM-Community bereitgestellt wird.
  useEffect(() => {
    if (gpxTrack || waypoints.length < 2) { setRouted(null); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setRoutingBusy(true)
      routeWaypoints(wegpunktOrte, profile, controller.signal)
        .then(setRouted)
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setRouteError((e as Error).message)
        })
        .finally(() => setRoutingBusy(false))
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [wegpunktOrte, profile, gpxTrack])

  const importGpx = async (file: File) => {
    try {
      const { points } = parseGpx(await file.text())
      setGpxTrack(points)
      setWaypoints([])
      setRouted(null)
      setDrawing(false)
      setRouteError(null)
    } catch (e) {
      setRouteError(`GPX konnte nicht gelesen werden: ${(e as Error).message}`)
    }
  }

  /*
    Nur angemeldet wird zum Speichern eingeladen — sonst wäre der Knopf eine
    Sackgasse.

    Es gibt genau einen Speicherweg. Vorher waren es zwei („Route speichern"
    und „Tour speichern"), die in zwei Tabellen führten und in der Übersicht
    als zwei Listen wieder auftauchten. Gespeichert wird jetzt der Verlauf
    zusammen mit den Eckdaten und den Kennzahlen, die die Auswertung ohnehin
    schon berechnet hat — sonst müsste jede Karte in der Übersicht das
    Höhenprofil neu abfragen.
  */
  const handleSaveTour = session
    ? async (
        name: string,
        trip: TripParams,
        packliste: PackStaende,
        etappen: GespeicherteEtappe[] | null,
      ) => {
        await saveTour(
          name, regionCode, routeGeometry, gpxTrack ? [] : wegpunktOrte,
          {
            ...trip,
            distance_m: routeGeometry.length > 1 ? lineLength(routeGeometry) : null,
            ascent_m: wanderStats?.ascent_m ?? null,
            duration_s: wanderStats?.duration_s ?? null,
            // Ein leerer Stand ist keine Angabe — dann bleibt die Spalte leer,
            // statt ein leeres Objekt in jede Zeile zu schreiben.
            packliste: Object.keys(packliste).length > 0 ? packliste : null,
            etappen,
          },
        )
      }
    : null

  /**
   * Eine gespeicherte oder geteilte Tour auf die Karte holen.
   *
   * Der Sprung auf ihren Ausschnitt gehört dazu: wer in der Community auf eine
   * Tour klickt, hat gerade ihr Vorschaubild gesehen. Landete er danach auf
   * dem zuletzt betrachteten Ausschnitt — womöglich am anderen Ende der Alpen
   * —, müsste er die eben angesehene Tour erst suchen.
   *
   * Der Zähler unterscheidet zwei Klicks auf dieselbe Tour voneinander.
   */
  const [kameraZiel, setKameraZiel] = useState<{ geometry: Position[]; zaehler: number } | null>(null)

  /**
   * Von der Karte in die Community mitgenommener Ort.
   *
   * Wer auf eine Huette tippt und dort „Alle Touren hier" waehlt, sucht nicht
   * nach einem Namen, sondern nach einer Stelle. Der Filter lebt deshalb hier
   * und nicht im Community-Panel: er entsteht auf der Karte.
   */
  const [ortsfilter, setOrtsfilter] = useState<Ortsfilter | null>(null)

  const tourenBeiOrt = (name: string, position: Position) => {
    setOrtsfilter({ name, position, umkreisM: ORT_UMKREIS_M })
    setSelection(null)
    setView('community')
  }

  const routeLaden = (geometry: Position[], wps: Position[]) => {
    setGpxTrack(geometry)
    setWaypoints(wps.map((position) => ({ position })))
    setRouted(null)
    setView('karte')
    setRouteOpen(true)
    setAuswertungOffen(false)
    if (geometry.length > 0) {
      setKameraZiel((z) => ({ geometry, zaehler: (z?.zaehler ?? 0) + 1 }))
    }
  }

  const clearRoute = () => {
    setWaypoints([]); setGpxTrack(null); setRouted(null); setRouteError(null)
  }

  /**
   * Route öffnen heisst zeichnen.
   *
   * Vorher musste man das Panel öffnen *und* dann noch „Route zeichnen"
   * drücken — ein Schritt, den niemand freiwillig macht und der auf jede
   * Rückfrage „warum passiert nichts, wenn ich klicke?" hinauslief. Wer das
   * Panel öffnet, will zeichnen; abschalten lässt es sich weiterhin.
   */
  const routeOeffnen = () => {
    setRouteOpen(true)
    setDrawing(true)
    setMarkieren(false)
  }

  // Zeichnen und Markieren schliessen einander aus: beide belegen den
  // Kartenklick, und ein Klick mit zwei Bedeutungen ist keiner.
  const markierenUmschalten = () => {
    setMarkieren((m) => {
      if (!m) setDrawing(false)
      return !m
    })
  }

  const punktGespeichert = (punkt: EigenerPunkt) => {
    setEigenePunkte((liste) => {
      const ohne = liste.filter((p) => p.id !== punkt.id)
      return [punkt, ...ohne]
    })
    setSelection({ kind: 'eigen', punkt })
  }

  const punktEntfernen = async (punkt: EigenerPunkt) => {
    try {
      await punktLoeschen(punkt)
      setEigenePunkte((liste) => liste.filter((p) => p.id !== punkt.id))
      setSelection(null)
    } catch (e) {
      setRouteError((e as Error).message)
    }
  }

  return (
    /*
      `overflow-hidden` ist hier kein Zierrat: die Kartenansicht darf unter
      keinen Umständen die Seite scrollen lassen. Panels über der Karte legen
      sich darüber und scrollen innen; wenn eines doch zu gross gerät, wird es
      beschnitten statt die ganze Seite zu verschieben. Die Vollseiten-Ansichten
      (Touren, Community, Konto) bringen ihr eigenes `overflow-y-auto` mit.
    */
    <div className="flex h-dvh flex-col overflow-hidden bg-flaeche-1 text-ink-100">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-kante bg-flaeche-2 px-4">
        {/* Wortmarke: das Zelt als Form, nicht als Emoji. */}
        <a href="./" className="flex min-w-0 items-center gap-2.5" aria-label="CampBuddy, Startseite">
          <Marke className="h-7 w-7 shrink-0" />
          <span className="hidden text-ueberschrift font-semibold tracking-tight text-ink-50 sm:block">
            CampBuddy
          </span>
        </a>

        {/* Ab Tablet in der Kopfzeile; auf dem Telefon liegt die Navigation
            unten in Daumenreichweite (siehe Tableiste am Seitenende). */}
        <nav className={`hidden sm:block ${mehrereRegionen ? 'mx-auto' : 'ml-auto'}`} aria-label="Ansicht">
          <Segmente
            ariaLabel="Ansicht wählen"
            wert={view}
            onWaehlen={setView}
            optionen={[
              { wert: 'karte' as View, label: 'Karte', icon: Map },
              { wert: 'community' as View, label: 'Community', icon: Compass },
              { wert: 'touren' as View, label: 'Deine Touren', icon: Bookmark },
              ...(isSupabaseConfigured
                ? [{ wert: 'konto' as View, label: session ? 'Konto' : 'Anmelden', icon: session ? UserRound : LogIn }]
                : []),
            ]}
          />
        </nav>

        {/*
          Die Regionswahl erscheint erst, wenn es etwas zu wählen gibt. Bei
          einer einzigen Region war sie ein Aufklappmenü mit genau einem
          Eintrag — belegter Platz ohne Nutzen, und der Name der Region steht
          ohnehin in der Infokarte. Sobald die zweite Region dazukommt, ist sie
          von selbst wieder da.
        */}
        {mehrereRegionen && (
          <label className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <span className="sr-only">Region</span>
            <Auswahl
              value={regionCode}
              onChange={(e) => { setRegionCode(e.target.value); setSelection(null) }}
              className="w-auto"
            >
              {Object.values(REGIONS).map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </Auswahl>
          </label>
        )}
      </header>

      <DisclaimerBar />

      {/*
        Beide Ansichten bleiben montiert und werden nur ein-/ausgeblendet.
        Würde die Karte beim Wechsel abgebaut, ginge bei jeder Rückkehr die
        Kartenposition verloren und alle Kacheln müssten neu geladen werden.
      */}
      <div className={view === 'karte' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          counts={{ zones: allZones.length, points: points.length }}
        />
        {/*
          Die beiden Klassen sagen den Kartenbedienelementen, wie viel Rand
          gerade von einem Panel belegt ist (siehe `.karte` in index.css).
          Ohne sie liegen Massstab, Zoomstufen und Herkunftsangabe unter dem
          Routenpanel beziehungsweise der Infokarte.
        */}
        <main
          className={`karte relative flex-1
                      ${routeOpen ? 'karte-panel-links' : ''}
                      ${selection ? 'karte-panel-rechts' : ''}`}
        >
          <MapView
            region={region}
            zones={allZones}
            points={points}
            peaks={filters.showPeaks ? allPeaks : []}
            nature={nature}
            eigene={sichtbareEigene}
            gemeinden={gemeindenGeo}
            gemeindenFern={gemeindenFern}
            activity={filters.activity}
            basemap={basemap}
            visible={view === 'karte'}
            route={routeGeometry}
            waypoints={gpxTrack ? [] : wegpunktOrte}
            waypointLabels={gpxTrack ? [] : wegpunktBeschriftungen}
            kameraZiel={kameraZiel}
            drawing={drawing}
            markieren={markieren}
            onZoneClick={(zone) => setSelection({ kind: 'zone', zone })}
            onPointClick={(point) => setSelection({ kind: 'point', point })}
            onNatureClick={(feature) => setSelection({ kind: 'natur', feature })}
            onPeakClick={(peak) => setSelection({ kind: 'peak', peak })}
            onEigenClick={(punkt) => setSelection({ kind: 'eigen', punkt })}
            onLeerClick={(position) => {
              // Wer an dieser Stelle zuständig ist, entscheidet die Auskunft —
              // ausserhalb der Schutzgebiete regeln Kanton und Gemeinde.
              const kanton = kantonAn(position)
              const gemeinde = gemeindeAn(position)
              setSelection({
                kind: 'region', region, stats, datenFehler,
                kanton,
                kantonRecht: kantonRecht(kanton),
                kantonGrundlagen: kantonGrundlagen(kanton),
                gemeinde,
                gemeindeRecht: gemeindeRecht(gemeinde),
              })
            }}
            onAusschnitt={setAusschnitt}
            onMarkieren={(position) => {
              setDialogPunkt(null)
              setDialogPosition(position)
              setMarkieren(false)
            }}
            onAddWaypoint={(position, ort) => {
              // Ein neuer Klick beginnt eine gezeichnete Route; eine importierte
              // Spur würde sonst stillschweigend mit Wegpunkten vermischt.
              setGpxTrack(null)
              setWaypoints((w) => [...w, { position, ort }])
            }}
            onInsertWaypoint={(index, position) =>
              setWaypoints((w) => {
                const kopie = [...w]
                kopie.splice(index, 0, { position })
                return kopie
              })
            }
            onMoveWaypoint={(index, position) =>
              // Verschoben heisst: nicht mehr an dem Symbol, das den Namen gab.
              setWaypoints((w) => w.map((p, i) => (i === index ? { position } : p)))
            }
            onRemoveWaypoint={(index) => setWaypoints((w) => w.filter((_, i) => i !== index))}
          />
          {routeOpen ? (
            <RoutePanel
              /*
                Auf dem Telefon sind Routenpanel und Infokarte beide Blätter
                von unten. Standen beide offen, lagen sie deckungsgleich
                übereinander und man bediente blind das obere. Solange etwas
                ausgewählt ist, tritt das Routenpanel dort zurück; es bleibt
                offen und kommt beim Schliessen der Infokarte wieder.
              */
              verdeckt={selection != null}
              route={routeGeometry}
              waypoints={gpxTrack ? [] : waypoints}
              waypointCount={gpxTrack ? 0 : waypoints.length}
              onRemoveWaypoint={(index) => setWaypoints((w) => w.filter((_, i) => i !== index))}
              onMoveWaypointTo={(von, nach) => setWaypoints((w) => verschieben(w, von, nach))}
              onReverseWaypoints={() => setWaypoints((w) => umkehren(w))}
              onRenameWaypoint={(index, name) =>
                setWaypoints((w) => w.map((p, i) => (i === index ? { ...p, name: name.trim() || undefined } : p)))
              }
              routed={routed}
              routingBusy={routingBusy}
              stats={wanderStats}
              hoehenBusy={hoehenBusy}
              profile={profile}
              isImported={gpxTrack != null}
              drawing={drawing}
              error={routeError}
              onProfileChange={setProfile}
              onToggleDrawing={() => setDrawing((d) => !d)}
              onUndo={() => setWaypoints((w) => w.slice(0, -1))}
              onClear={clearRoute}
              onImportGpx={importGpx}
              onAuswerten={() => { setDrawing(false); setMarkieren(false); setAuswertungOffen(true) }}
              onClose={() => { setRouteOpen(false); setDrawing(false); setMarkieren(false) }}
              markieren={markieren}
              onToggleMarkieren={session ? markierenUmschalten : null}
            />
          ) : (
            <>
              {/* Die eine primäre Aktion der Kartenansicht — deshalb gefüllt
                  und als einziges Element hier in Akzentfarbe. */}
              <Button
                variante="primaer"
                groesse="gross"
                icon={Route}
                onClick={routeOeffnen}
                className="absolute bottom-4 left-4 z-10 shadow-[var(--shadow-3)]"
              >
                Route planen
              </Button>
            </>
          )}
          <BasemapSwitcher region={regionCode} value={basemap} onChange={setBasemap} />
          <Legend activity={filters.activity} />
          <InfoPanel
            selection={selection}
            onClose={() => setSelection(null)}
            onOpenPlanner={() => { setSelection(null); setView('touren') }}
            nutzerId={session?.user.id}
            onPunktBearbeiten={(punkt) => { setDialogPosition(null); setDialogPunkt(punkt) }}
            onPunktLoeschen={(punkt) => void punktEntfernen(punkt)}
            onTourOeffnen={(tour) => {
              setSelection(null)
              routeLaden(
                (tour.geometry?.coordinates ?? []) as Position[],
                (tour.waypoints ?? []) as Position[],
              )
            }}
            onAlleTouren={tourenBeiOrt}
            onAlsWegpunkt={(position, ort) => {
              // Eine importierte Spur und gesetzte Wegpunkte vertragen sich
              // nicht — dieselbe Regel wie beim Zeichnen auf der Karte.
              setGpxTrack(null)
              setWaypoints((w) => [...w, { position, ort }])
              setDrawing(true)
              setRouteOpen(true)
              setSelection(null)
            }}
            zeichnetGerade={drawing || waypoints.length > 0}
          />
        </main>
      </div>

      {/*
        Eine geladene Route wird als fertige Spur übernommen und nicht neu
        geroutet — sie folgt bereits realen Wegen.
      */}

      <main className={view === 'touren' ? 'flex-1 overflow-y-auto' : 'hidden'}>
        <MyToursPanel
          session={session}
          onLoadRoute={routeLaden}
          onAnmelden={() => setView('konto')}
          onZurKarte={() => setView('karte')}
        />
      </main>

      {view === 'community' && (
        <main className="flex-1 overflow-y-auto">
          <CommunityPanel
            session={session}
            onLoadRoute={routeLaden}
            ort={ortsfilter}
            onOrtLoesen={() => setOrtsfilter(null)}
          />
        </main>
      )}

      {view === 'konto' && (
        <main className="flex-1 overflow-y-auto">
          <AccountPanel
            session={session}
            onZuTouren={() => setView('touren')}
            linkErgebnis={linkErgebnis}
            onLinkErgebnisGelesen={() => setLinkErgebnis(null)}
          />
        </main>
      )}

      {/* Mobile Navigation: unten, Daumenreichweite, immer sichtbar. */}
      <nav
        aria-label="Ansicht"
        className="flex shrink-0 border-t border-kante bg-flaeche-2 sm:hidden"
      >
        {([
          ['karte', 'Karte', Map],
          ['community', 'Community', Compass],
          ['touren', 'Touren', Bookmark],
          ...(isSupabaseConfigured
            ? [['konto', session ? 'Konto' : 'Anmelden', session ? UserRound : LogIn] as const]
            : []),
        ] as const).map(([key, label, Icon]) => {
          const aktiv = view === key
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-current={aktiv ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-mikro font-medium
                          normal-case tracking-normal transition-colors duration-[160ms]
                          ${aktiv ? 'text-gletscher-300' : 'text-ink-400 hover:text-ink-200'}`}
            >
              <Icon size={19} strokeWidth={aktiv ? 2.25 : 1.75} aria-hidden />
              {label}
            </button>
          )
        })}
      </nav>

      <PunktDialog
        offen={dialogPosition != null || dialogPunkt != null}
        region={regionCode}
        position={dialogPosition}
        punkt={dialogPunkt}
        onClose={() => { setDialogPosition(null); setDialogPunkt(null) }}
        onGespeichert={punktGespeichert}
      />

      <TourDetailModal
        offen={auswertungOffen}
        onClose={() => setAuswertungOffen(false)}
        region={region}
        route={routeGeometry}
        analysis={analysis}
        stats={wanderStats}
        profil={profil}
        etappen={etappen}
        hoehenBusy={hoehenBusy}
        hoehenFehler={hoehenFehler}
        wegpunkte={gpxTrack ? [] : waypoints}
        points={allPoints}
        peaks={allPeaks}
        onSaveTour={handleSaveTour}
      />
    </div>
  )
}
