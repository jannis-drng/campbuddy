/**
 * Route zeichnen (Abschnitt 4.2).
 *
 * Bewusst schlank: beim Zeichnen zeigt das Panel nur Länge und Gehzeit. Die
 * vollständige Auswertung — Legalität, Profil, Etappen, Ausrüstung, Wetter —
 * öffnet sich erst auf Knopfdruck als eigenes Fenster. Sonst zappelten bei
 * jedem gesetzten Wegpunkt zwei Bildschirmhöhen Inhalt.
 */
import { useRef } from 'react'
import { lineLength, type Position } from '../data/geo'
import { formatDauer, type HikingStats } from '../data/hiking'
import { PROFILE_LABEL, SNAP_WARN_M, type RoutedPath, type RoutingProfile } from '../map/routing'
import { toGpx } from '../services/gpx'

interface Props {
  route: Position[]
  waypoints: Position[]
  waypointCount: number
  routed: RoutedPath | null
  routingBusy: boolean
  profile: RoutingProfile
  isImported: boolean
  stats: HikingStats | null
  hoehenBusy: boolean
  drawing: boolean
  error: string | null
  onProfileChange: (p: RoutingProfile) => void
  onToggleDrawing: () => void
  onUndo: () => void
  onClear: () => void
  onRemoveWaypoint: (index: number) => void
  onImportGpx: (file: File) => void
  onAuswerten: () => void
  onClose: () => void
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

export function RoutePanel({
  route, waypoints, waypointCount, routed, routingBusy, profile, isImported,
  stats, hoehenBusy, drawing, error,
  onProfileChange, onToggleDrawing, onUndo, onClear, onRemoveWaypoint,
  onImportGpx, onAuswerten, onClose,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)

  const downloadGpx = () => {
    const blob = new Blob([toGpx(route)], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'campbuddy-route.gpx'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Aus der Geometrie, nicht aus dem Routing-Ergebnis: eine importierte
  // GPX-Spur wird nicht geroutet und hätte dort keine Länge.
  const laenge = route.length >= 2 ? lineLength(route) : 0

  return (
    <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[65vh] overflow-y-auto border-t border-white/10 bg-slate-900/97 text-slate-100 shadow-2xl backdrop-blur sm:inset-y-0 sm:right-auto sm:bottom-auto sm:left-0 sm:max-h-none sm:w-[23rem] sm:border-r sm:border-t-0">
      <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-white/10 bg-slate-900/97 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold leading-tight">Route</h2>
          <p className="text-xs text-slate-400">Zeichnen, dann auswerten</p>
        </div>
        <button onClick={onClose} aria-label="Routenpanel schliessen"
                className="-mr-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100">✕</button>
      </div>

      <div className="space-y-5 px-5 py-4">
        <section className="space-y-2">
          <div>
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Unterwegs</span>
            <div className="flex flex-wrap gap-1.5">
              {(['foot', 'bike', 'car'] as RoutingProfile[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onProfileChange(p)}
                  aria-pressed={profile === p}
                  disabled={isImported}
                  className={`min-h-9 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${
                    profile === p
                      ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                      : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'
                  }`}
                >
                  {PROFILE_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={onToggleDrawing}
              aria-pressed={drawing}
              className={`min-h-9 rounded-full px-3 py-1.5 text-sm transition ${
                drawing
                  ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                  : 'bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10'
              }`}
            >
              {drawing ? 'Zeichnen beenden' : 'Route zeichnen'}
            </button>
            <button onClick={onUndo} disabled={waypoints.length === 0}
                    className="min-h-9 rounded-full bg-white/5 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40">
              Punkt zurück
            </button>
            <button onClick={onClear} disabled={route.length === 0}
                    className="min-h-9 rounded-full bg-white/5 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40">
              Löschen
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => fileInput.current?.click()}
                    className="min-h-9 rounded-full bg-white/5 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10">
              GPX importieren
            </button>
            <button onClick={downloadGpx} disabled={route.length < 2}
                    className="min-h-9 rounded-full bg-white/5 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40">
              GPX speichern
            </button>
            <input
              ref={fileInput} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImportGpx(file)
                e.target.value = ''
              }}
            />
          </div>

          {drawing && (
            <p className="text-xs text-slate-400">
              Klick in die Karte setzt einen Wegpunkt. Dazwischen wird auf reale Wege geroutet.
            </p>
          )}
          {routingBusy && <p className="text-xs text-slate-400">Weg wird gesucht …</p>}
          {routed?.snapped && routed.snapDistance_m != null && routed.snapDistance_m > SNAP_WARN_M && (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-200/90">
              Ein Wegpunkt wurde {formatKm(routed.snapDistance_m)} auf den nächsten erfassten Weg
              verschoben. Die Auswertung gilt für die verschobene Strecke.
            </p>
          )}
          {routed && !routed.snapped && waypointCount >= 2 && (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-200/90">
              Kein Weg-Routing möglich ({routed.fallbackReason}). Die Wegpunkte sind nur gerade
              verbunden — Länge und Auswertung sind dadurch ungenau.
            </p>
          )}
          {error && <p className="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-300">{error}</p>}
        </section>

        {waypoints.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-200">
              Wegpunkte ({waypoints.length})
            </h3>
            <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
              {waypoints.map((_, i) => {
                const rolle = i === 0 ? 'Start' : i === waypoints.length - 1 ? 'Ziel' : `Zwischenstopp ${i}`
                const farbe = i === 0 ? 'bg-green-500' : i === waypoints.length - 1 ? 'bg-red-500' : 'bg-slate-200'
                return (
                  <li key={i} className="flex items-center gap-2 px-2.5 py-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-slate-900 ${farbe}`} />
                    <span className="min-w-0 flex-1 text-sm text-slate-200">{rolle}</span>
                    <button
                      onClick={() => onRemoveWaypoint(i)}
                      aria-label={`${rolle} entfernen`}
                      className="shrink-0 rounded px-1.5 py-1 text-slate-500 hover:bg-white/10 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Wegpunkte lassen sich auf der Karte verschieben. Rechtsklick darauf entfernt sie.
            </p>
          </section>
        )}

        {/* ---- Kurzinfo statt voller Auswertung ---- */}
        {route.length < 2 ? (
          <p className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-slate-400">
            Zeichne eine Route — die Wegpunkte werden auf reale Wege geroutet — oder
            importiere eine GPX-Datei aus deinem Tourenplaner.
          </p>
        ) : (
          <>
            <section className="rounded-lg bg-white/5 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-slate-500">Länge</span>
                <span className="text-base font-semibold text-slate-100">{formatKm(laenge)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-slate-500">Gehzeit</span>
                <span className="text-base font-semibold text-slate-100">
                  {stats ? formatDauer(stats.duration_s) : hoehenBusy ? '…' : '—'}
                </span>
              </div>
            </section>

            <button
              onClick={onAuswerten}
              className="min-h-11 w-full rounded-lg bg-emerald-500/20 px-4 text-sm font-semibold text-emerald-100 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30"
            >
              Tour auswerten →
            </button>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Öffnet die vollständige Auswertung: Rechtslage entlang der Route, Höhenprofil,
              Etappen, Ausrüstung, Verpflegung und Wetter.
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
