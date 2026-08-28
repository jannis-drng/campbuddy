/**
 * Filterleiste über der Karte: die Einfärbung, und sonst nichts.
 *
 * Hier standen einmal zwei Dinge nebeneinander, die verschieden funktionieren:
 * die Einfärbung (Einfachauswahl — es wird nie eine Zone versteckt, sonst
 * könnte ein Verbot durch Filtern unsichtbar werden) und die Symbolebenen
 * (unabhängige Schalter). Die Symbolebenen sind in die Legende gezogen, weil
 * dort dieselben sieben Wörter schon standen — man schlug an einem Ort nach
 * und schaltete am anderen. Was übrig bleibt, ist eine Zeile statt zweier.
 *
 * Auf dem Telefon passten die vier Segmente „Gesamt · Zelt · Fahrzeug · Feuer"
 * nie auf 375 px: „Feuer" lag ausserhalb des Bildes, und welche Einfärbung
 * galt, sah man erst nach dem Wischen. Dort steht deshalb ein Knopf, der
 * seinen Zustand ausspricht und die Liste aufklappt. Am Zeiger bleiben die
 * Segmente offen sichtbar — dort ist Breite da, und Sehen ohne Klicken ist
 * der schnellere Weg.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Flame, Home, Palette, Tent, Truck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityMode, MapFilters } from '../data/types'
import { Label, Segmente } from '../ui'

interface Props {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  counts: { zones: number; points: number }
}

const AKTIVITAETEN: { wert: ActivityMode; label: string; icon?: LucideIcon; titel?: string }[] = [
  { wert: 'all', label: 'Gesamt', titel: 'Gesamteinstufung der Zone' },
  { wert: 'tent', label: 'Zelt', icon: Tent, titel: 'Nur die Regel fürs Zelt' },
  { wert: 'vehicle', label: 'Fahrzeug', icon: Truck, titel: 'Nur die Regel fürs Fahrzeug' },
  { wert: 'fire', label: 'Feuer', icon: Flame, titel: 'Nur die Regel fürs Feuer' },
]

export function FilterBar({ filters, onChange, counts }: Props) {
  const gewaehlt = AKTIVITAETEN.find((a) => a.wert === filters.activity) ?? AKTIVITAETEN[0]

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-kante
                    bg-flaeche-2 px-4 py-2.5">
      {/* ---------------------------------------------------------- Telefon */}
      <div className="w-full sm:hidden">
        <EinfaerbenMenue
          gewaehlt={gewaehlt}
          onWaehlen={(a) => onChange({ ...filters, activity: a })}
        />
      </div>

      {/* ----------------------------------------------------------- Zeiger */}
      <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
        <Label>Einfärben</Label>
        <Segmente
          ariaLabel="Karte einfärben nach"
          optionen={AKTIVITAETEN}
          wert={filters.activity}
          onWaehlen={(a) => onChange({ ...filters, activity: a })}
        />
      </div>

      <p className="ml-auto hidden items-center gap-1.5 text-mikro text-ink-500 lg:flex">
        <Home size={12} strokeWidth={2} aria-hidden />
        {counts.zones.toLocaleString('de-CH')} Schutzgebiete ·{' '}
        {counts.points.toLocaleString('de-CH')} Schlafplätze
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ Menü, Telefon */

/**
 * Knopf mit Blase. Die Zeilen sind 44 px hoch und über die volle Breite
 * anfassbar — das ist die Grösse, die ein Daumen im Gehen trifft.
 */
function EinfaerbenMenue({
  gewaehlt, onWaehlen,
}: {
  gewaehlt: (typeof AKTIVITAETEN)[number]
  onWaehlen: (a: ActivityMode) => void
}) {
  const [offen, setOffen] = useState(false)
  const huelle = useRef<HTMLDivElement>(null)
  const id = useId()

  // Escape und ein Tippen daneben schliessen — sonst deckt die Liste die Karte
  // zu und der einzige Ausweg wäre derselbe Knopf weiter oben.
  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false) }
    const onZeiger = (e: PointerEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setOffen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onZeiger)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onZeiger)
    }
  }, [offen])

  return (
    <div ref={huelle} className="relative">
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        aria-label="Einfärben nach"
        className={`flex h-9 w-full items-center gap-1.5 rounded-full border px-3 text-klein
                    font-medium transition-colors duration-[160ms]
                    ${offen || gewaehlt.wert !== 'all'
                      ? 'border-kante-stark bg-flaeche-3 text-ink-50'
                      : 'border-kante text-ink-400'}`}
      >
        {gewaehlt.icon
          ? <gewaehlt.icon size={13} strokeWidth={2} aria-hidden />
          : <Palette size={13} strokeWidth={2} aria-hidden />}
        Einfärben: {gewaehlt.label}
        <ChevronDown
          size={14}
          strokeWidth={2}
          aria-hidden
          className={`ml-auto shrink-0 text-ink-500 transition-transform duration-[160ms]
                      ${offen ? 'rotate-180' : ''}`}
        />
      </button>

      {offen && (
        <div
          id={id}
          role="menu"
          aria-label="Einfärben nach"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-[15rem] max-w-[calc(100vw-2rem)]
                     overflow-hidden rounded-gross border border-kante bg-flaeche-2/97
                     shadow-[var(--shadow-4)] backdrop-blur-md"
        >
          <div className="flex items-center gap-2 border-b border-kante px-3 py-2">
            <span className="flex-1 text-klein font-semibold text-ink-100">Einfärben nach</span>
            <button
              onClick={() => setOffen(false)}
              aria-label="Schliessen"
              className="-mr-1 rounded-klein p-1 text-ink-500 transition-colors duration-[160ms]
                         hover:bg-flaeche-3 hover:text-ink-100"
            >
              <X size={15} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="py-1">
            {AKTIVITAETEN.map((a) => {
              const an = a.wert === gewaehlt.wert
              return (
                <button
                  key={a.wert}
                  onClick={() => { onWaehlen(a.wert); setOffen(false) }}
                  role="menuitemradio"
                  aria-checked={an}
                  className={`flex h-11 w-full items-center gap-2.5 px-3 text-klein transition-colors
                              duration-[160ms] hover:bg-flaeche-3 ${an ? 'text-ink-50' : 'text-ink-400'}`}
                >
                  <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center text-ink-400">
                    {a.icon && <a.icon size={13} strokeWidth={2} />}
                  </span>
                  <span className="flex-1 text-left">{a.label}</span>
                  {an && <Check size={15} strokeWidth={2.5} className="text-gletscher-200" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
