/**
 * Filter-Grundgerüst [JETZT].
 *
 * Zwei bewusst unterschiedliche Mechanismen:
 * - "Wofür" färbt die Zonen um (Einfachauswahl) — es wird nie eine Zone versteckt,
 *   sonst könnte ein Verbot durch Filtern unsichtbar werden.
 * - "Anzeigen" blendet Punktarten aus. Das ist unbedenklich: eine ausgeblendete
 *   Hütte behauptet nichts über die Rechtslage.
 */
import type { ActivityMode, MapFilters } from '../data/types'

interface Props {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  counts: { zones: number; points: number }
}

const ACTIVITIES: { key: ActivityMode; label: string }[] = [
  { key: 'all', label: 'Gesamt' },
  { key: 'tent', label: 'Zelt' },
  { key: 'vehicle', label: 'Auto / Camper' },
  { key: 'fire', label: 'Feuer' },
]

const POINT_TOGGLES: { key: keyof MapFilters; label: string }[] = [
  { key: 'showHuts', label: 'Hütten' },
  { key: 'showCampsites', label: 'Campingplätze' },
  { key: 'showVehicleSpots', label: 'Stellplätze' },
  { key: 'showPeaks', label: 'Gipfel' },
]

export function FilterBar({ filters, onChange, counts }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-slate-900/95 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-500">Einfärben nach</span>
        {ACTIVITIES.map((a) => (
          <button
            key={a.key}
            onClick={() => onChange({ ...filters, activity: a.key })}
            aria-pressed={filters.activity === a.key}
            // min-h für Touch-Bedienung — die App soll später als PWA taugen.
            className={`min-h-9 rounded-full px-3 py-1.5 text-sm transition ${
              filters.activity === a.key
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-500">Anzeigen</span>
        {POINT_TOGGLES.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange({ ...filters, [t.key]: !filters[t.key] })}
            aria-pressed={filters[t.key] as boolean}
            className={`min-h-9 rounded-full px-3 py-1.5 text-sm transition ${
              filters[t.key]
                ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40'
                : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className="ml-auto text-xs text-slate-500">
        {counts.zones} Zonen · {counts.points} Punkte
      </span>
    </div>
  )
}
