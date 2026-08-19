import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_REGION, REGIONS } from './data/regions'
import {
  fetchRemotePoints, fetchRemoteZones, filterPoints, getPeaks, getPoints, getRegion, getZones,
  verificationStats,
} from './data/legalData'
import type { MapFilters, Point, Zone } from './data/types'
import { MapView } from './map/MapView'
import { DisclaimerBar } from './components/Disclaimer'
import { FilterBar } from './components/FilterBar'
import { InfoPanel, type Selection } from './components/InfoPanel'
import { Legend } from './components/Legend'
import { RegionIntro } from './components/RegionIntro'
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
import { BasemapSwitcher } from './components/BasemapSwitcher'
import { DEFAULT_BASEMAP, type BasemapKey } from './map/mapConfig'
import { isSupabaseConfigured } from './services/supabase'
import { saveRoute, saveTrip, useSession } from './services/account'

const INITIAL_FILTERS: MapFilters = {
  activity: 'all',
  showHuts: true,
  showCampsites: true,
  showVehicleSpots: true,
  showPeaks: true,
}

type View = 'karte' | 'community' | 'touren' | 'konto'

export default function App() {
  const [view, setView] = useState<View>('karte')
  const { session } = useSession()
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION)
  const [basemap, setBasemap] = useState<BasemapKey>(DEFAULT_BASEMAP)
  const [filters, setFilters] = useState<MapFilters>(INITIAL_FILTERS)
  const [selection, setSelection] = useState<Selection>(null)

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

  const region = getRegion(regionCode)
  // Gebündelte Fassung als Startanzeige …
  const bundledZones = useMemo(() => getZones(regionCode), [regionCode])
  const bundledPoints = useMemo(() => getPoints(regionCode), [regionCode])
  const allPeaks = useMemo(() => getPeaks(regionCode), [regionCode])
  // … die durch die Datenbankfassung ersetzt wird, sobald sie da ist.
  const [remoteZones, setRemoteZones] = useState<Zone[] | null>(null)
  const [remotePoints, setRemotePoints] = useState<Point[] | null>(null)

  useEffect(() => {
    let aktuell = true
    setRemoteZones(null); setRemotePoints(null)
    // Fehler werden bewusst verschluckt: die gebündelte Fassung ist bereits
    // sichtbar, ein Backend-Ausfall darf die Karte nicht beeinträchtigen.
    fetchRemoteZones(regionCode).then((z) => { if (aktuell && z) setRemoteZones(z) }).catch(() => {})
    fetchRemotePoints(regionCode).then((p) => { if (aktuell && p) setRemotePoints(p) }).catch(() => {})
    return () => { aktuell = false }
  }, [regionCode])

  const allZones = remoteZones ?? bundledZones
  const allPoints = remotePoints ?? bundledPoints
  const datenquelle = remoteZones ? 'datenbank' : 'gebündelt'
  // Zonen werden nie gefiltert — nur umgefärbt (siehe effectiveStatus).
  const points = useMemo(() => filterPoints(allPoints, filters), [allPoints, filters])
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

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
        <span aria-hidden className="text-xl">⛺</span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight">CampBuddy</h1>
          <p className="truncate text-xs text-slate-400">
            Wo darf ich draussen übernachten?
          </p>
        </div>

        <nav className="ml-auto flex gap-1 rounded-lg bg-white/5 p-1" aria-label="Ansicht">
          {([
            ['karte', 'Karte'],
            ['community', 'Community'],
            ['touren', 'Deine Touren'],
            ...(isSupabaseConfigured ? [['konto', session ? 'Konto' : 'Anmelden'] as const] : []),
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-current={view === key ? 'page' : undefined}
              className={`min-h-9 rounded-md px-3 py-1.5 text-sm transition ${
                view === key ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline">Region</span>
          <select
            value={regionCode}
            onChange={(e) => { setRegionCode(e.target.value); setSelection(null) }}
            className="min-h-9 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100"
          >
            {Object.values(REGIONS).map((r) => (
              <option key={r.code} value={r.code}>{r.name} ({r.country})</option>
            ))}
          </select>
        </label>
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
            activity={filters.activity}
            basemap={basemap}
            visible={view === 'karte'}
            route={routeGeometry}
            waypoints={gpxTrack ? [] : waypoints}
            drawing={drawing}
            onZoneClick={(zone) => setSelection({ kind: 'zone', zone })}
            onPointClick={(point) => setSelection({ kind: 'point', point })}
            onAddWaypoint={(position) => {
              // Ein neuer Klick beginnt eine gezeichnete Route; eine importierte
              // Spur würde sonst stillschweigend mit Wegpunkten vermischt.
              setGpxTrack(null)
              setWaypoints((w) => [...w, position])
            }}
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
              onAuswerten={() => { setDrawing(false); setAuswertungOffen(true) }}
              onClose={() => { setRouteOpen(false); setDrawing(false) }}
            />
          ) : (
            <>
              <RegionIntro region={region} stats={stats} quelle={datenquelle} />
              <button
                onClick={() => setRouteOpen(true)}
                className="absolute bottom-3 left-3 z-10 min-h-9 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800"
              >
                🥾 Route planen
              </button>
            </>
          )}
          <BasemapSwitcher region={regionCode} value={basemap} onChange={setBasemap} />
          <Legend activity={filters.activity} />
          <InfoPanel
            selection={selection}
            onClose={() => setSelection(null)}
            onOpenPlanner={() => { setSelection(null); setView('touren') }}
          />
        </main>
      </div>

      {/*
        Eine geladene Route wird als fertige Spur übernommen und nicht neu
        geroutet — sie folgt bereits realen Wegen.
      */}

      <main className={view === 'touren' ? 'flex-1 overflow-y-auto' : 'hidden'}>
        <MyToursPanel
          region={region}
          session={session}
          onSaveTrip={handleSaveTrip}
          onLoadRoute={routeLaden}
          onAnmelden={() => setView('konto')}
        />
      </main>

      {view === 'community' && (
        <main className="flex-1 overflow-y-auto">
          <CommunityPanel session={session} onLoadRoute={routeLaden} />
        </main>
      )}

      {view === 'konto' && (
        <main className="flex-1 overflow-y-auto">
          <AccountPanel session={session} onZuTouren={() => setView('touren')} />
        </main>
      )}

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
