/** Filter-Grundgerüst [JETZT] — die Erweiterung auf weitere Kriterien [BALD] ist ein Eintrag mehr. */
import type { MapFilters } from '../data/types'

interface Props {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  counts: { zones: number; points: number }
}

const TOGGLES: { key: keyof MapFilters; label: string; group: 'aktivität' | 'punkte' }[] = [
  { key: 'tent', label: 'Zelt', group: 'aktivität' },
  { key: 'vehicle', label: 'Auto / Camper', group: 'aktivität' },
  { key: 'fire', label: 'Feuer', group: 'aktivität' },
  { key: 'showHuts', label: 'Hütten', group: 'punkte' },
  { key: 'showCampsites', label: 'Campingplätze', group: 'punkte' },
  { key: 'showVehicleSpots', label: 'Stellplätze', group: 'punkte' },
]

export function FilterBar({ filters, onChange, counts }: Props) {
  const toggle = (key: keyof MapFilters) => onChange({ ...filters, [key]: !filters[key] })

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 bg-slate-900/95 px-4 py-2.5">
      {(['aktivität', 'punkte'] as const).map((group) => (
        <div key={group} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-500">
            {group === 'aktivität' ? 'Wofür' : 'Anzeigen'}
          </span>
          {TOGGLES.filter((t) => t.group === group).map((t) => (
            <button
              key={t.key}
              onClick={() => toggle(t.key)}
              aria-pressed={filters[t.key]}
              // min-h für Touch-Bedienung — die App soll später als PWA taugen.
              className={`min-h-9 rounded-full px-3 py-1.5 text-sm transition ${
                filters[t.key]
                  ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                  : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ))}
      <span className="ml-auto text-xs text-slate-500">
        {counts.zones} Zonen · {counts.points} Punkte
      </span>
    </div>
  )
}
