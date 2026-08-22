import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_REGION, REGIONS } from './data/regions'
import {
  fetchRemoteNature, fetchRemotePeaks, fetchRemotePoints, fetchRemoteZones, filterNature,
  filterPoints, getNature, getPeaks, getPoints, getRegion, getZones, verificationStats,
  type Ausschnitt,
} from './data/legalData'
import type { EigenerPunkt, MapFilters, NatureFeature, Peak, Point, Zone } from './data/types'
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
import type { Position } from './data/geo'
import { parseGpx } from './services/gpx'
import { loadElevationProfile, type ElevationPoint } from './services/elevation'
import { analyseProfil, planeEtappen } from './data/hiking'
import { routeWaypoints, type RoutedPath, type RoutingProfile } from './map/routing'
import { AccountPanel } from './components/AccountPanel'
import { PunktDialog } from './components/PunktDialog'
import { ladeEigenePunkte, punktLoeschen } from './services/eigenePunkte'
import { kantonAn, kantonGrundlagen, kantonRecht } from './data/kantone'
import { BasemapSwitcher } from './components/BasemapSwitcher'
import { DEFAULT_BASEMAP, type BasemapKey } from './map/mapConfig'
import { isSupabaseConfigured } from './services/supabase'
import { linkErgebnisAuslesen, saveRoute, saveTrip, useSession, type LinkErgebnis } from './services/account'
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
  const [waypoints, setWaypoints] = useState<Position[]>([])
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

  const region = getRegion(regionCode)
  // Gebündelte Fassung als Startanzeige …
  const bundledZones = useMemo(() => getZones(regionCode), [regionCode])
  const bundledPoints = useMemo(() => getPoints(regionCode), [regionCode])
  const bundledPeaks = useMemo(() => getPeaks(regionCode), [regionCode])
  const bundledNature = useMemo(() => getNature(regionCode), [regionCode])
  // … die durch die Datenbankfassung ersetzt wird, sobald sie da ist.
  const [remoteZones, setRemoteZones] = useState<Zone[] | null>(null)
  const [remotePoints, setRemotePoints] = useState<Point[] | null>(null)
  // Gipfel und Natur hängen am Ausschnitt, nicht an der Region: landesweit
  // wären es Zehntausende, sichtbar ist immer nur ein Bruchteil davon.
  const [ausschnitt, setAusschnitt] = useState<Ausschnitt | null>(null)
  const [remotePeaks, setRemotePeaks] = useState<Peak[] | null>(null)
  const [remoteNature, setRemoteNature] = useState<NatureFeature[] | null>(null)

  useEffect(() => {
    let aktuell = true
    setRemoteZones(null); setRemotePoints(null)
    // Fehler werden bewusst verschluckt: die gebündelte Fassung ist bereits
    // sichtbar, ein Backend-Ausfall darf die Karte nicht beeinträchtigen.
    fetchRemoteZones(regionCode).then((z) => { if (aktuell && z) setRemoteZones(z) }).catch(() => {})
    fetchRemotePoints(regionCode).then((p) => { if (aktuell && p) setRemotePoints(p) }).catch(() => {})
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
    if (filters.showPeaks) {
      fetchRemotePeaks(regionCode, ausschnitt)
        .then((p) => { if (aktuell && p) setRemotePeaks(p) })
        .catch(() => {})
    }
    if (filters.showWater || filters.showViewpoints) {
      fetchRemoteNature(regionCode, ausschnitt)
        .then((n) => { if (aktuell && n) setRemoteNature(n) })
        .catch(() => {})
    }
    return () => { aktuell = false }
  }, [regionCode, ausschnitt, filters.showPeaks, filters.showWater, filters.showViewpoints])

  const allZones = remoteZones ?? bundledZones
  const allPoints = remotePoints ?? bundledPoints
  const datenquelle = remoteZones ? 'datenbank' : 'gebündelt'
  // Zonen werden nie gefiltert — nur umgefärbt (siehe effectiveStatus).
  const points = useMemo(() => filterPoints(allPoints, filters), [allPoints, filters])
  const allPeaks = remotePeaks ?? bundledPeaks
  const allNature = remoteNature ?? bundledNature
  const nature = useMemo(() => filterNature(allNature, filters), [allNature, filters])
  const sichtbareEigene = useMemo(
    () => (filters.showEigene ? eigenePunkte : []),
    [eigenePunkte, filters.showEigene],
  )
  const stats = useMemo(() => verificationStats(allZones), [allZones])
  // Die Analyse läuft über alle Punkte, nicht die gefilterten: eine ausgeblendete
  // Hütte ist trotzdem eine Schlafmöglichkeit an der Route.
  // Eine importierte Spur folgt bereits realen Wegen und wird nicht neu geroutet.
  const routeGeometry = useMemo<Position[]>(
    () => gpxTrack ?? routed?.coordinates ?? waypoints,
    [gpxTrack, routed, waypoints],
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
      routeWaypoints(waypoints, profile, controller.signal)
        .then(setRouted)
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setRouteError((e as Error).message)
        })
        .finally(() => setRoutingBusy(false))
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [waypoints, profile, gpxTrack])

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

  // Nur angemeldet wird zum Speichern eingeladen — sonst wäre der Knopf eine Sackgasse.
  const handleSaveRoute = session
    ? async (name: string) => {
        await saveRoute(name, regionCode, routeGeometry, gpxTrack ? [] : waypoints)
      }
    : null

  const handleSaveTrip = session
    ? async (name: string, trip: Parameters<typeof saveTrip>[1]) => { await saveTrip(name, trip) }
    : null

  const routeLaden = (geometry: Position[], wps: Position[]) => {
    setGpxTrack(geometry)
    setWaypoints(wps)
    setRouted(null)
    setView('karte')
    setRouteOpen(true)
    setAuswertungOffen(false)
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
    <div className="flex h-dvh flex-col bg-flaeche-1 text-ink-100">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-kante bg-flaeche-2 px-4">
        {/* Wortmarke: das Zelt-Dreieck als Form, nicht als Emoji. */}
        <a href="./" className="flex min-w-0 items-center gap-2.5" aria-label="CampBuddy, Startseite">
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
            <path d="M12 3.5 3 20h18L12 3.5Z" fill="none"
                  stroke="var(--color-gletscher-400)" strokeWidth="1.75" strokeLinejoin="round" />
            <path d="M12 10.5 17 20H7l5-9.5Z" fill="var(--color-gletscher-400)" opacity="0.28" />
          </svg>
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
        <main className="relative flex-1">
          <MapView
            region={region}
            zones={allZones}
            points={points}
            peaks={filters.showPeaks ? allPeaks : []}
            nature={nature}
            eigene={sichtbareEigene}
            activity={filters.activity}
            basemap={basemap}
            visible={view === 'karte'}
            route={routeGeometry}
            waypoints={gpxTrack ? [] : waypoints}
            drawing={drawing}
            markieren={markieren}
            onZoneClick={(zone) => setSelection({ kind: 'zone', zone })}
            onPointClick={(point) => setSelection({ kind: 'point', point })}
            onNatureClick={(feature) => setSelection({ kind: 'natur', feature })}
            onEigenClick={(punkt) => setSelection({ kind: 'eigen', punkt })}
            onLeerClick={(position) => {
              // Wer an dieser Stelle zuständig ist, entscheidet die Auskunft —
              // ausserhalb der Schutzgebiete regeln Kanton und Gemeinde.
              const kanton = kantonAn(position)
              setSelection({
                kind: 'region', region, stats, quelle: datenquelle,
                kanton,
                kantonRecht: kantonRecht(kanton),
                kantonGrundlagen: kantonGrundlagen(kanton),
              })
            }}
            onAusschnitt={setAusschnitt}
            onMarkieren={(position) => {
              setDialogPunkt(null)
              setDialogPosition(position)
              setMarkieren(false)
            }}
            onAddWaypoint={(position) => {
              // Ein neuer Klick beginnt eine gezeichnete Route; eine importierte
              // Spur würde sonst stillschweigend mit Wegpunkten vermischt.
              setGpxTrack(null)
              setWaypoints((w) => [...w, position])
            }}
            onInsertWaypoint={(index, position) =>
              setWaypoints((w) => {
                const kopie = [...w]
                kopie.splice(index, 0, position)
                return kopie
              })
            }
            onMoveWaypoint={(index, position) =>
              setWaypoints((w) => w.map((p, i) => (i === index ? position : p)))
            }
            onRemoveWaypoint={(index) => setWaypoints((w) => w.filter((_, i) => i !== index))}
          />
          {routeOpen ? (
            <RoutePanel
              route={routeGeometry}
              waypoints={gpxTrack ? [] : waypoints}
              waypointCount={gpxTrack ? 0 : waypoints.length}
              onRemoveWaypoint={(index) => setWaypoints((w) => w.filter((_, i) => i !== index))}
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
          <CommunityPanel session={session} onLoadRoute={routeLaden} />
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
        onSaveRoute={handleSaveRoute}
        onSaveTrip={handleSaveTrip}
      />
    </div>
  )
}
