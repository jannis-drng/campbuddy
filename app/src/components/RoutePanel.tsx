/**
 * Route + Legalitäts-Ebene (Abschnitt 4.2).
 *
 * Der Teil, der CampBuddy von Routenplanern unterscheidet: nicht die Route
 * selbst, sondern die Antwort auf "wo darf ich entlang dieser Route schlafen".
 */
import { useRef } from 'react'
import type { Position } from '../data/geo'
import type { Region } from '../data/types'
import { NEARBY_RADIUS_M, summarise, type RouteAnalysis } from '../data/routeAnalysis'
import { ROUTING } from '../map/mapConfig'
import { toGpx } from '../services/gpx'
import { STATUS_CLASS, STATUS_LABEL } from './ui'

interface Props {
  route: Position[]
  analysis: RouteAnalysis
  region: Region
  drawing: boolean
  error: string | null
  onToggleDrawing: () => void
  onUndo: () => void
  onClear: () => void
  onImportGpx: (file: File) => void
  onClose: () => void
}

const POINT_LABEL = { hut: 'Hütte', campsite: 'Campingplatz', vehicle_spot: 'Stellplatz' } as const

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

export function RoutePanel({
  route, analysis, region, drawing, error,
  onToggleDrawing, onUndo, onClear, onImportGpx, onClose,
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

  return (
    <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[65vh] overflow-y-auto border-t border-white/10 bg-slate-900/97 text-slate-100 shadow-2xl backdrop-blur sm:inset-y-0 sm:right-auto sm:bottom-auto sm:left-0 sm:max-h-none sm:w-[24rem] sm:border-r sm:border-t-0">
      <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-white/10 bg-slate-900/97 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold leading-tight">Route</h2>
          <p className="text-xs text-slate-400">Wo darf ich unterwegs schlafen?</p>
        </div>
        <button onClick={onClose} aria-label="Routenpanel schliessen"
                className="-mr-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100">✕</button>
      </div>

      <div className="space-y-5 px-5 py-4">
        {/* ---- Werkzeuge ---- */}
        <section className="space-y-2">
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
            <button onClick={onUndo} disabled={route.length === 0}
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
                e.target.value = '' // gleiche Datei soll erneut wählbar bleiben
              }}
            />
          </div>

          {drawing && (
            <p className="text-xs text-slate-400">
              Klick in die Karte setzt einen Wegpunkt.
              {!ROUTING.enabled && ' Die Wegpunkte werden gerade verbunden — ohne Routing-Schlüssel folgt die Linie keinem Weg.'}
            </p>
          )}
          {error && <p className="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-300">{error}</p>}
        </section>

        {route.length < 2 ? (
          <p className="rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-slate-400">
            Zeichne eine Route oder importiere eine GPX-Datei aus deinem Tourenplaner.
            CampBuddy legt dann die Legalitäts-Ebene darüber und zeigt dir, wo unterwegs
            Übernachten zulässig ist.
          </p>
        ) : (
          <>
            <section>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-200">Fazit</h3>
                <span className="text-xs text-slate-500">{formatKm(analysis.length_m)}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">
                {summarise(analysis, region.legal_framework.baseline_status)}
              </p>
            </section>

            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-200">
                Durchquerte Zonen{analysis.crossed.length > 0 && ` (${analysis.crossed.length})`}
              </h3>
              {analysis.crossed.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Die Route berührt keine eingezeichnete Fläche.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {analysis.crossed.map(({ zone, meters, share }) => (
                    <li key={zone.id} className="rounded-lg bg-white/5 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-slate-100">{zone.name}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_CLASS[zone.status]}`}>
                          {STATUS_LABEL[zone.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatKm(meters)} auf der Route · {Math.round(share * 100)} %
                        {zone.review_status === 'entwurf' && ' · Einstufung ungeprüft'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-200">
                Schlafplätze im Umkreis von {NEARBY_RADIUS_M / 1000} km
              </h3>
              {analysis.nearby.length === 0 ? (
                <p className="text-xs text-slate-400">Keine erfassten Punkte in Routennähe.</p>
              ) : (
                <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                  {analysis.nearby.slice(0, 15).map(({ point, distance }) => (
                    <li key={point.id} className="flex items-baseline justify-between gap-2 px-2.5 py-2">
                      <span className="min-w-0 text-sm">
                        <span className="text-slate-100">{point.name}</span>
                        <span className="ml-1.5 text-[11px] text-slate-500">{POINT_LABEL[point.type]}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{formatKm(distance)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {analysis.nearby.length > 15 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  … und {analysis.nearby.length - 15} weitere.
                </p>
              )}
            </section>

            <p className="rounded-lg bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200/90">
              Die Auswertung ist nur so verlässlich wie der Prüfstand der Zonen. Ausserhalb
              eingezeichneter Flächen gilt allein der allgemeine Grundsatz der Region —
              das ersetzt keine Prüfung vor Ort.
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
