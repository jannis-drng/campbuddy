/**
 * Filterleiste über der Karte.
 *
 * Zwei bewusst unterschiedliche Mechanismen, auch optisch getrennt:
 * - „Einfärben nach" ist eine Einfachauswahl (Segmente) — es wird nie eine Zone
 *   versteckt, sonst könnte ein Verbot durch Filtern unsichtbar werden.
 * - „Symbole" sind unabhängige Schalter. Das ist unbedenklich: eine
 *   ausgeblendete Hütte behauptet nichts über die Rechtslage.
 *
 * Auf dem Telefon standen die sieben Symbolebenen als Chipreihe in einer
 * Leiste, die seitlich weggescrollt werden musste — vier davon lagen immer
 * ausserhalb des Bildes, und ob eine eingeschaltet war, sah man erst nach dem
 * Wischen. Dort steht jetzt **ein** Knopf mit der Zahl der aktiven Ebenen; die
 * Liste öffnet sich als Blase mit ganzzeiligen Zielen und einem Weg, alles auf
 * einmal an- oder auszuschalten. Am Zeiger, wo die Breite da ist, bleiben die
 * Chips: dort ist Sehen ohne Klicken der schnellere Weg.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Droplet, Eye, Flame, Home, Mountain, Shapes, Star, Tent, Truck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityMode, MapFilters } from '../data/types'
import { SYMBOL_FARBEN } from '../map/symbole'
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

type EbenenKey = Exclude<keyof MapFilters, 'activity'>

const EBENEN: { key: EbenenKey; label: string; farbe?: string; icon?: LucideIcon }[] = [
  { key: 'showHuts', label: 'Hütten', farbe: SYMBOL_FARBEN.hut },
  { key: 'showCampsites', label: 'Campingplätze', farbe: SYMBOL_FARBEN.campsite },
  { key: 'showVehicleSpots', label: 'Stellplätze', farbe: SYMBOL_FARBEN.vehicle_spot },
  { key: 'showWater', label: 'Wasser', farbe: SYMBOL_FARBEN.drinking_water, icon: Droplet },
  { key: 'showViewpoints', label: 'Aussicht', farbe: SYMBOL_FARBEN.viewpoint, icon: Eye },
  { key: 'showEigene', label: 'Eigene', farbe: SYMBOL_FARBEN.eigen, icon: Star },
  { key: 'showPeaks', label: 'Gipfel', icon: Mountain },
]

export function FilterBar({ filters, onChange, counts }: Props) {
  const aktiv = EBENEN.filter((e) => filters[e.key]).length

  const setzeAlle = (an: boolean) => {
    const naechste = { ...filters }
    for (const e of EBENEN) naechste[e.key] = an
    onChange(naechste)
  }

  return (
    <div className="flex shrink-0 items-center gap-x-5 gap-y-2.5 border-b border-kante bg-flaeche-2
                    px-4 py-2.5 sm:flex-wrap">
      {/*
        Scrollt notfalls seitlich: „Gesamt · Zelt · Fahrzeug · Feuer" braucht
        mehr als die 375 px eines Telefons hergeben, und der Symbol-Knopf
        rechts darf ihm nicht auf die Schrift rücken.
      */}
      <div className="flex min-w-0 shrink items-center gap-2.5 overflow-x-auto
                      [scrollbar-width:none] sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        <Label className="hidden sm:block">Einfärben</Label>
        <Segmente
          ariaLabel="Karte einfärben nach"
          optionen={AKTIVITAETEN}
          wert={filters.activity}
          onWaehlen={(a) => onChange({ ...filters, activity: a })}
        />
      </div>

      {/* ---------------------------------------------------------- Telefon */}
      <div className="shrink-0 sm:hidden">
        <SymbolMenue
          filters={filters}
          onChange={onChange}
          anzahl={aktiv}
          onAlle={setzeAlle}
        />
      </div>

      {/* ----------------------------------------------------------- Zeiger */}
      <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
        <Label>Symbole</Label>
        <div className="flex flex-wrap gap-1.5">
          {EBENEN.map((e) => (
            <Chip
              key={e.key}
              aktiv={filters[e.key]}
              farbe={e.farbe}
              onClick={() => onChange({ ...filters, [e.key]: !filters[e.key] })}
            >
              {e.icon ? <><e.icon size={13} strokeWidth={2} aria-hidden />{e.label}</> : e.label}
            </Chip>
          ))}
        </div>
      </div>

      <p className="ml-auto hidden items-center gap-1.5 text-mikro text-ink-500 lg:flex">
        <Home size={12} strokeWidth={2} aria-hidden />
        {counts.zones.toLocaleString('de-CH')} Schutzgebiete ·{' '}
        {counts.points.toLocaleString('de-CH')} Schlafplätze
      </p>
    </div>
  )
}

/* --------------------------------------------------------- Symbole, Telefon */

/**
 * Ein Knopf, eine Liste. Die Zeilen sind 44 px hoch und über die volle Breite
 * anfassbar — das ist die Grösse, die ein Daumen im Gehen trifft; ein Chip von
 * 32 px Höhe ist es nicht.
 */
function SymbolMenue({
  filters, onChange, anzahl, onAlle,
}: {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  anzahl: number
  onAlle: (an: boolean) => void
}) {
  const [offen, setOffen] = useState(false)
  const huelle = useRef<HTMLDivElement>(null)

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
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-klein font-medium
                    transition-colors duration-[160ms]
                    ${offen || anzahl > 0
                      ? 'border-kante-stark bg-flaeche-3 text-ink-50'
                      : 'border-kante text-ink-400'}`}
      >
        <Shapes size={13} strokeWidth={2} aria-hidden />
        Symbole
        {anzahl > 0 && (
          <span className="rounded-full bg-gletscher-500/22 px-1.5 text-mikro font-semibold text-gletscher-200">
            {anzahl}
          </span>
        )}
      </button>

      {offen && (
        <div
          role="group"
          aria-label="Symbolebenen"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[15rem] overflow-hidden
                     rounded-gross border border-kante bg-flaeche-2/97 shadow-[var(--shadow-4)]
                     backdrop-blur-md"
        >
          <div className="flex items-center gap-2 border-b border-kante px-3 py-2">
            <span className="flex-1 text-klein font-semibold text-ink-100">Symbole</span>
            <button
              onClick={() => onAlle(anzahl === 0)}
              className="rounded-klein px-1.5 py-0.5 text-mikro font-medium text-gletscher-200
                         transition-colors duration-[160ms] hover:bg-flaeche-3"
            >
              {anzahl === 0 ? 'Alle an' : 'Alle aus'}
            </button>
            <button
              onClick={() => setOffen(false)}
              aria-label="Schliessen"
              className="-mr-1 rounded-klein p-1 text-ink-500 transition-colors duration-[160ms]
                         hover:bg-flaeche-3 hover:text-ink-100"
            >
              <X size={15} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-1">
            {EBENEN.map((e) => {
              const an = filters[e.key]
              return (
                <button
                  key={e.key}
                  onClick={() => onChange({ ...filters, [e.key]: !an })}
                  role="switch"
                  aria-checked={an}
                  className={`flex h-11 w-full items-center gap-2.5 px-3 text-klein
                              transition-colors duration-[160ms] hover:bg-flaeche-3
                              ${an ? 'text-ink-50' : 'text-ink-400'}`}
                >
                  {e.farbe ? (
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: e.farbe, opacity: an ? 1 : 0.35 }}
                    />
                  ) : (
                    <span aria-hidden className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                      {e.icon && <e.icon size={13} strokeWidth={2} />}
                    </span>
                  )}
                  <span className="flex-1 text-left">{e.label}</span>
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
