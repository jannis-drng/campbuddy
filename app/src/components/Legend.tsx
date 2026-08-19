import type { ActivityMode } from '../data/types'
import { POINT_COLORS, STATUS_COLORS } from '../map/mapConfig'

const ACTIVITY_CAPTION: Record<ActivityMode, string> = {
  all: 'Gesamteinstufung der Zone',
  tent: 'Regel für Zelt / Biwak',
  vehicle: 'Regel für Auto / Camper',
  fire: 'Regel für offenes Feuer',
}

export function Legend({ activity }: { activity: ActivityMode }) {
  const zones = [
    ['Erlaubt', STATUS_COLORS.allowed],
    ['Geduldet', STATUS_COLORS.tolerated],
    ['Verboten', STATUS_COLORS.forbidden],
    ['Ungeklärt', STATUS_COLORS.unknown],
  ] as const
  const points = [
    ['Hütte', POINT_COLORS.hut],
    ['Campingplatz', POINT_COLORS.campsite],
    ['Stellplatz', POINT_COLORS.vehicle_spot],
  ] as const

  return (
    <div className="pointer-events-none absolute bottom-8 right-3 z-10 hidden rounded-lg border border-white/10 bg-slate-900/85 p-3 text-xs text-slate-200 shadow-lg backdrop-blur sm:block">
      <p className="font-semibold text-slate-100">Legende</p>
      <p className="mb-1.5 text-[10px] text-slate-400">{ACTIVITY_CAPTION[activity]}</p>
      <div className="space-y-1">
        {zones.map(([label, color]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.55 }} />
            {label}
          </div>
        ))}
      </div>
      <div className="my-2 h-px bg-white/10" />
      <div className="space-y-1">
        {points.map(([label, color]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-white/10 pt-1.5 text-[10px] leading-tight text-slate-400">
        Gestrichelter Rand =<br />noch nicht geprüft
      </p>
    </div>
  )
}
