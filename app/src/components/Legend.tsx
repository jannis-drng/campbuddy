/**
 * Legende der Kartenebenen.
 *
 * Auf kleinen Bildschirmen einklappbar: draussen zählt Kartenfläche mehr als
 * eine Dauererklärung.
 */
import { useState } from 'react'
import { ChevronDown, Layers } from 'lucide-react'
import type { ActivityMode } from '../data/types'
import { POINT_COLORS, STATUS_COLORS } from '../map/mapConfig'
import { Label } from '../ui'

const BEZUG: Record<ActivityMode, string> = {
  all: 'Gesamteinstufung',
  tent: 'Regel für Zelt / Biwak',
  vehicle: 'Regel für Fahrzeuge',
  fire: 'Regel für offenes Feuer',
}

const ZONEN = [
  ['Erlaubt', STATUS_COLORS.allowed],
  ['Geduldet', STATUS_COLORS.tolerated],
  ['Verboten', STATUS_COLORS.forbidden],
  ['Ungeklärt', STATUS_COLORS.unknown],
] as const

const PUNKTE = [
  ['Hütte', POINT_COLORS.hut],
  ['Campingplatz', POINT_COLORS.campsite],
  ['Stellplatz', POINT_COLORS.vehicle_spot],
] as const

export function Legend({ activity }: { activity: ActivityMode }) {
  const [offen, setOffen] = useState(true)

  return (
    <div className="pointer-events-auto absolute bottom-9 right-3 z-10 hidden w-44 overflow-hidden
                    rounded-gross border border-kante bg-flaeche-2/92 shadow-[var(--shadow-3)]
                    backdrop-blur-md sm:block">
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors
                   duration-[160ms] hover:bg-flaeche-3"
      >
        <Layers size={14} strokeWidth={2} className="text-ink-500" aria-hidden />
        <span className="flex-1 text-klein font-semibold text-ink-100">Legende</span>
        <ChevronDown
          size={14} strokeWidth={2.5} aria-hidden
          className={`text-ink-500 transition-transform duration-[160ms] ease-[var(--ease-heraus)] ${offen ? '' : '-rotate-90'}`}
        />
      </button>

      {offen && (
        <div className="space-y-3 border-t border-kante px-3 pb-3 pt-2.5">
          <div>
            <Label className="mb-1.5">{BEZUG[activity]}</Label>
            <div className="space-y-1.5">
              {ZONEN.map(([label, farbe]) => (
                <div key={label} className="flex items-center gap-2 text-klein text-ink-300">
                  <span
                    className="h-3 w-3 shrink-0 rounded-[3px] border"
                    style={{ backgroundColor: `${farbe}55`, borderColor: farbe }}
                    aria-hidden
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-kante pt-2.5">
            <Label className="mb-1.5">Punkte</Label>
            <div className="space-y-1.5">
              {PUNKTE.map(([label, farbe]) => (
                <div key={label} className="flex items-center gap-2 text-klein text-ink-300">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-flaeche-2"
                    style={{ backgroundColor: farbe }}
                    aria-hidden
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <p className="flex items-start gap-2 border-t border-kante pt-2.5 text-mikro
                        normal-case leading-snug tracking-normal text-ink-500">
            <svg viewBox="0 0 20 6" className="mt-1.5 h-1 w-5 shrink-0" aria-hidden>
              <line x1="0" y1="3" x2="20" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Gestrichelter Rand: Einstufung noch nicht geprüft
          </p>
        </div>
      )}
    </div>
  )
}
