/**
 * Filterleiste über der Karte.
 *
 * Zwei bewusst unterschiedliche Mechanismen, jetzt auch optisch getrennt:
 * - „Einfärben nach" ist eine Einfachauswahl (Segmente) — es wird nie eine Zone
 *   versteckt, sonst könnte ein Verbot durch Filtern unsichtbar werden.
 * - „Ebenen" sind unabhängige Schalter (Chips mit Farbpunkt). Das ist
 *   unbedenklich: eine ausgeblendete Hütte behauptet nichts über die Rechtslage.
 */
import { Flame, Home, Mountain, Tent, Truck } from 'lucide-react'
import type { ActivityMode, MapFilters } from '../data/types'
import { POINT_COLORS } from '../map/mapConfig'
import { Chip, Label, Segmente } from '../ui'

interface Props {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  counts: { zones: number; points: number }
}

const AKTIVITAETEN = [
  { wert: 'all' as ActivityMode, label: 'Gesamt' },
  { wert: 'tent' as ActivityMode, label: 'Zelt', icon: Tent },
  { wert: 'vehicle' as ActivityMode, label: 'Fahrzeug', icon: Truck },
  { wert: 'fire' as ActivityMode, label: 'Feuer', icon: Flame },
]

const EBENEN: { key: keyof MapFilters; label: string; farbe?: string }[] = [
  { key: 'showHuts', label: 'Hütten', farbe: POINT_COLORS.hut },
  { key: 'showCampsites', label: 'Campingplätze', farbe: POINT_COLORS.campsite },
  { key: 'showVehicleSpots', label: 'Stellplätze', farbe: POINT_COLORS.vehicle_spot },
  { key: 'showPeaks', label: 'Gipfel' },
]

export function FilterBar({ filters, onChange, counts }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-x-5 gap-y-2.5 overflow-x-auto border-b border-kante
                    bg-flaeche-2 px-4 py-2.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible
                    [&::-webkit-scrollbar]:hidden">
      <div className="flex shrink-0 items-center gap-2.5">
        <Label className="hidden sm:block">Einfärben</Label>
        <Segmente
          ariaLabel="Karte einfärben nach"
          optionen={AKTIVITAETEN}
          wert={filters.activity}
          onWaehlen={(a) => onChange({ ...filters, activity: a })}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Label className="hidden sm:block">Ebenen</Label>
        <div className="flex gap-1.5 sm:flex-wrap">
          {EBENEN.map((e) => (
            <Chip
              key={e.key}
              aktiv={filters[e.key] as boolean}
              farbe={e.farbe}
              onClick={() => onChange({ ...filters, [e.key]: !filters[e.key] })}
            >
              {e.label === 'Gipfel'
                ? <><Mountain size={13} strokeWidth={2} aria-hidden />{e.label}</>
                : e.label}
            </Chip>
          ))}
        </div>
      </div>

      <p className="ml-auto hidden items-center gap-1.5 text-mikro text-ink-500 lg:flex">
        <Home size={12} strokeWidth={2} aria-hidden />
        {counts.zones} Zonen · {counts.points} Punkte
      </p>
    </div>
  )
}
