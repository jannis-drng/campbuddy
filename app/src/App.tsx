import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_REGION, REGIONS } from './data/regions'
import { filterPoints, getPoints, getRegion, getZones, verificationStats } from './data/legalData'
import type { MapFilters } from './data/types'
import { MapView } from './map/MapView'
import { DisclaimerBar } from './components/Disclaimer'
import { FilterBar } from './components/FilterBar'
import { InfoPanel, type Selection } from './components/InfoPanel'
import { Legend } from './components/Legend'
import { RegionIntro } from './components/RegionIntro'
import { TripPlanner } from './components/TripPlanner'
import { RoutePanel } from './components/RoutePanel'
import { analyseRoute } from './data/routeAnalysis'
import type { Position } from './data/geo'
import { parseGpx } from './services/gpx'
import { routeWaypoints, type RoutedPath, type RoutingProfile } from './map/routing'

const INITIAL_FILTERS: MapFilters = {
  activity: 'all',
  showHuts: true,
  showCampsites: true,
  showVehicleSpots: true,
}

type View = 'karte' | 'tour'

export default function App() {
  const [view, setView] = useState<View>('karte')
  const [regionCode, setRegionCode] = useState(DEFAULT_REGION)
  const [filters, setFilters] = useState<MapFilters>(INITIAL_FILTERS)
  const [selection, setSelection] = useState<Selection>(null)

  const [routeOpen, setRouteOpen] = useState(false)
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

  const region = getRegion(regionCode)
  const allZones = useMemo(() => getZones(regionCode), [regionCode])
  const allPoints = useMemo(() => getPoints(regionCode), [regionCode])
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
          {([['karte', 'Karte'], ['tour', 'Tour planen']] as const).map(([key, label]) => (
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
            activity={filters.activity}
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
          />
          {routeOpen ? (
            <RoutePanel
              route={routeGeometry}
              waypointCount={gpxTrack ? 0 : waypoints.length}
              routed={routed}
              routingBusy={routingBusy}
              profile={profile}
              isImported={gpxTrack != null}
              analysis={analysis}
              region={region}
              drawing={drawing}
              error={routeError}
              onProfileChange={setProfile}
              onToggleDrawing={() => setDrawing((d) => !d)}
              onUndo={() => setWaypoints((w) => w.slice(0, -1))}
              onClear={clearRoute}
              onImportGpx={importGpx}
              onClose={() => { setRouteOpen(false); setDrawing(false) }}
            />
          ) : (
            <>
              <RegionIntro region={region} stats={stats} />
              <button
                onClick={() => setRouteOpen(true)}
                className="absolute bottom-3 left-3 z-10 min-h-9 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800"
              >
                🥾 Route planen
              </button>
            </>
          )}
          <Legend activity={filters.activity} />
          <InfoPanel
            selection={selection}
            onClose={() => setSelection(null)}
            onOpenPlanner={() => { setSelection(null); setView('tour') }}
          />
        </main>
      </div>

      <main className={view === 'tour' ? 'flex-1 overflow-y-auto' : 'hidden'}>
        <TripPlanner region={region} />
      </main>
    </div>
  )
}
