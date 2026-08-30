/**
 * Filterleiste über der Karte.
 *
 * Zwei bewusst unterschiedliche Mechanismen, auch optisch getrennt:
 * - „Einfärben nach" ist eine Einfachauswahl — es wird nie eine Zone versteckt,
 *   sonst könnte ein Verbot durch Filtern unsichtbar werden.
 * - „Symbole" sind unabhängige Schalter. Das ist unbedenklich: eine
 *   ausgeblendete Hütte behauptet nichts über die Rechtslage.
 *
 * Auf dem Telefon war diese Leiste ein Band, das seitlich weggescrollt werden
 * musste: vier Segmente der Einfärbung und sieben Symbol-Chips, von denen die
 * Hälfte immer ausserhalb des Bildes lag — und ob etwas eingeschaltet war, sah
 * man erst nach dem Wischen. Dort stehen jetzt **zwei** Knöpfe, die jeweils
 * ihren Zustand aussprechen („Gesamt", „Symbole 2") und eine Liste öffnen.
 * Beide Listen sind gleich gebaut, damit man die Bedienung einmal lernt.
 *
 * Am Zeiger bleibt alles offen sichtbar: dort ist Breite da, und Sehen ohne
 * Klicken ist der schnellere Weg.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Check, ChevronDown, Droplet, Eye, Flame, Home, Moon, Mountain, Palette, Shapes, Star, Tent, Truck, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityMode, MapFilters } from '../data/types'
import { SYMBOL_FARBEN } from '../map/symbole'
import { Chip, Label, Segmente } from '../ui'

interface Props {
  filters: MapFilters
  onChange: (f: MapFilters) => void
  counts: { zones: number; points: number }
}

const AKTIVITAETEN: { wert: ActivityMode; label: string; icon?: LucideIcon; titel?: string }[] = [
  { wert: 'all', label: 'Gesamt', titel: 'Gesamteinstufung der Zone' },
  { wert: 'tent', label: 'Zelt', icon: Tent, titel: 'Nur die Regel fürs Zelt' },
  { wert: 'bivouac', label: 'Biwak', icon: Moon, titel: 'Nur die Regel fürs Biwakieren — ohne Zelt, im Schlafsack' },
  { wert: 'vehicle', label: 'Fahrzeug', icon: Truck, titel: 'Nur die Regel fürs Fahrzeug' },
  { wert: 'fire', label: 'Feuer', icon: Flame, titel: 'Nur die Regel fürs Feuer' },
]

type EbenenKey = Exclude<keyof MapFilters, 'activity'>

/**
 * Die Symbolebenen in drei Gruppen — „wo man schläft", „was drumherum liegt",
 * „was von mir stammt". Sieben gleichrangige Chips nebeneinander sind eine
 * Aufzählung; drei Gruppen sind eine Ordnung, in der man sucht.
 */
const EBENEN: { key: EbenenKey; label: string; gruppe: string; farbe?: string; icon?: LucideIcon }[] = [
  { key: 'showHuts', label: 'Hütten', gruppe: 'Schlafen', farbe: SYMBOL_FARBEN.hut },
  { key: 'showCampsites', label: 'Campingplätze', gruppe: 'Schlafen', farbe: SYMBOL_FARBEN.campsite },
  { key: 'showVehicleSpots', label: 'Stellplätze', gruppe: 'Schlafen', farbe: SYMBOL_FARBEN.vehicle_spot },
  { key: 'showWater', label: 'Wasser', gruppe: 'Umgebung', farbe: SYMBOL_FARBEN.drinking_water, icon: Droplet },
  { key: 'showViewpoints', label: 'Aussicht', gruppe: 'Umgebung', farbe: SYMBOL_FARBEN.viewpoint, icon: Eye },
  { key: 'showPeaks', label: 'Gipfel', gruppe: 'Umgebung', icon: Mountain },
  { key: 'showEigene', label: 'Eigene', gruppe: 'Eigene', farbe: SYMBOL_FARBEN.eigen, icon: Star },
]

const GRUPPEN = [...new Set(EBENEN.map((e) => e.gruppe))]

export function FilterBar({ filters, onChange, counts }: Props) {
  const aktiv = EBENEN.filter((e) => filters[e.key]).length
  const aktivitaet = AKTIVITAETEN.find((a) => a.wert === filters.activity) ?? AKTIVITAETEN[0]

  const setzeAlle = (an: boolean) => {
    const naechste = { ...filters }
    for (const e of EBENEN) naechste[e.key] = an
    onChange(naechste)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-kante
                    bg-flaeche-2 px-4 py-2.5">
      {/* ---------------------------------------------------------- Telefon */}
      <div className="flex w-full items-center gap-2 sm:hidden">
        <Menue
          etikett="Einfärben nach"
          titel="Einfärben nach"
          angesagt={aktiv > 0 || filters.activity !== 'all'}
          knopf={
            <>
              {aktivitaet.icon
                ? <aktivitaet.icon size={13} strokeWidth={2} aria-hidden />
                : <Palette size={13} strokeWidth={2} aria-hidden />}
              {aktivitaet.label}
            </>
          }
        >
          {(schliessen) => (
            <div className="py-1">
              {AKTIVITAETEN.map((a) => (
                <Zeile
                  key={a.wert}
                  rolle="menuitemradio"
                  an={a.wert === filters.activity}
                  onClick={() => { onChange({ ...filters, activity: a.wert }); schliessen() }}
                  marke={
                    <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center text-ink-400">
                      {a.icon && <a.icon size={13} strokeWidth={2} />}
                    </span>
                  }
                >
                  {a.label}
                </Zeile>
              ))}
            </div>
          )}
        </Menue>

        <Menue
          etikett="Symbolebenen"
          titel="Symbole"
          ausrichtung="rechts"
          angesagt={aktiv > 0}
          knopf={
            <>
              <Shapes size={13} strokeWidth={2} aria-hidden />
              Symbole
              {aktiv > 0 && (
                <span className="rounded-full bg-gletscher-500/22 px-1.5 text-mikro font-semibold text-gletscher-200">
                  {aktiv}
                </span>
              )}
            </>
          }
          kopfAktion={
            <button
              onClick={() => setzeAlle(aktiv === 0)}
              className="rounded-klein px-1.5 py-0.5 text-mikro font-medium text-gletscher-200
                         transition-colors duration-[160ms] hover:bg-flaeche-3"
            >
              {aktiv === 0 ? 'Alle an' : 'Alle aus'}
            </button>
          }
        >
          {() => (
            <div className="py-1">
              {GRUPPEN.map((g) => (
                <div key={g} className="border-t border-kante/60 first:border-t-0">
                  <p className="px-3 pb-0.5 pt-2 text-mikro font-semibold uppercase tracking-wide text-ink-500">
                    {g}
                  </p>
                  {EBENEN.filter((e) => e.gruppe === g).map((e) => (
                    <Zeile
                      key={e.key}
                      rolle="menuitemcheckbox"
                      an={filters[e.key]}
                      onClick={() => onChange({ ...filters, [e.key]: !filters[e.key] })}
                      marke={<Punkt farbe={e.farbe} icon={e.icon} an={filters[e.key]} />}
                    >
                      {e.label}
                    </Zeile>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Menue>
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

      <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
        <Label>Symbole</Label>
        {/*
          Die Gruppen stehen als Abstand da, nicht als Überschrift: drei Paare
          von Chips lesen sich schneller als sieben in einer Reihe, und
          Überschriften über einer einzigen Zeile wären mehr Text als Nutzen.
        */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
          {GRUPPEN.map((g, i) => (
            <div key={g} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-kante" />}
              {EBENEN.filter((e) => e.gruppe === g).map((e) => (
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
          ))}
          {/*
            Erscheint erst, wenn es etwas zurückzunehmen gibt. Ohne ihn ist der
            Weg zurück zur ruhigen Karte sieben Klicks weit.
          */}
          {aktiv > 0 && (
            <button
              onClick={() => setzeAlle(false)}
              className="ml-1 rounded-klein px-1.5 py-1 text-mikro font-medium text-ink-500
                         transition-colors duration-[160ms] hover:text-ink-100"
            >
              Alle aus
            </button>
          )}
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

/* ------------------------------------------------------------ Menü, Telefon */

/**
 * Knopf mit Blase — die gemeinsame Form beider Telefon-Menüs.
 *
 * `children` bekommt eine Funktion zum Schliessen: die Einfärbung ist eine
 * Einfachauswahl und schliesst nach der Wahl, die Symbolebenen bleiben offen,
 * weil man dort selten genau eine schaltet.
 */
function Menue({
  etikett, titel, knopf, kopfAktion, angesagt, ausrichtung = 'links', children,
}: {
  etikett: string
  titel: string
  knopf: ReactNode
  kopfAktion?: ReactNode
  /**
   * An welcher Kante des Knopfes die Blase hängt. Der rechte Knopf beginnt in
   * der Bildmitte — eine linksbündige Blase von 15 rem stünde dort zur Hälfte
   * ausserhalb des Bildschirms.
   */
  ausrichtung?: 'links' | 'rechts'
  /** Hebt den Knopf hervor, solange etwas von der Voreinstellung abweicht. */
  angesagt: boolean
  children: (schliessen: () => void) => ReactNode
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
    <div ref={huelle} className="relative min-w-0 flex-1">
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        aria-label={etikett}
        className={`inline-flex h-9 w-full items-center gap-1.5 rounded-full border px-3 text-klein
                    font-medium transition-colors duration-[160ms]
                    ${offen || angesagt
                      ? 'border-kante-stark bg-flaeche-3 text-ink-50'
                      : 'border-kante text-ink-400'}`}
      >
        {knopf}
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
          aria-label={etikett}
          className={`absolute top-[calc(100%+0.5rem)] z-30 w-[15rem] max-w-[calc(100vw-2rem)]
                      overflow-hidden rounded-gross border border-kante bg-flaeche-2/97
                      shadow-[var(--shadow-4)] backdrop-blur-md
                      ${ausrichtung === 'rechts' ? 'right-0' : 'left-0'}`}
        >
          <div className="flex items-center gap-2 border-b border-kante px-3 py-2">
            <span className="flex-1 text-klein font-semibold text-ink-100">{titel}</span>
            {kopfAktion}
            <button
              onClick={() => setOffen(false)}
              aria-label="Schliessen"
              className="-mr-1 rounded-klein p-1 text-ink-500 transition-colors duration-[160ms]
                         hover:bg-flaeche-3 hover:text-ink-100"
            >
              <X size={15} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">{children(() => setOffen(false))}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Eine Zeile im Menü. 44 px hoch und über die volle Breite anfassbar — das ist
 * die Grösse, die ein Daumen im Gehen trifft; ein Chip von 32 px ist es nicht.
 */
function Zeile({
  an, onClick, marke, rolle, children,
}: {
  an: boolean
  onClick: () => void
  marke: ReactNode
  rolle: 'menuitemradio' | 'menuitemcheckbox'
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      role={rolle}
      aria-checked={an}
      className={`flex h-11 w-full items-center gap-2.5 px-3 text-klein transition-colors
                  duration-[160ms] hover:bg-flaeche-3 ${an ? 'text-ink-50' : 'text-ink-400'}`}
    >
      {marke}
      <span className="flex-1 text-left">{children}</span>
      {an && <Check size={15} strokeWidth={2.5} className="text-gletscher-200" aria-hidden />}
    </button>
  )
}

/** Farbpunkt einer Symbolebene — oder ihr Zeichen, wo es keine Farbe gibt. */
function Punkt({ farbe, icon: Icon, an }: { farbe?: string; icon?: LucideIcon; an: boolean }) {
  if (farbe) {
    return (
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: farbe, opacity: an ? 1 : 0.35 }}
      />
    )
  }
  return (
    <span aria-hidden className="flex h-2.5 w-2.5 shrink-0 items-center justify-center text-ink-400">
      {Icon && <Icon size={13} strokeWidth={2} />}
    </span>
  )
}
