/**
 * Die Auskunft der Karte über sich selbst: welche Hintergrundkarte liegt
 * darunter, und was bedeuten die Farben darauf.
 *
 * Vorher waren das zwei Elemente in zwei gegenüberliegenden Ecken — die
 * Kartenwahl schwebte auf dem Telefon frei über der unteren Bildhälfte, die
 * Legende gab es dort gar nicht. Beides gehört zusammen und steht deshalb an
 * einer Stelle, oben rechts:
 *
 *  - Am Zeiger: die Kartenwahl offen, die Legende direkt darunter, nach unten
 *    aufklappend. Ihre Höhe begrenzt der Kartenbereich; was nicht hineinpasst,
 *    scrollt innen.
 *  - Auf dem Telefon: ein Knopf, der beides als Blase öffnet. 375 px reichen
 *    nicht für drei Kartennamen quer über das Bild, und Kartenfläche ist
 *    draussen das Knappste.
 */
import { useEffect, useState } from 'react'
import { Layers, X } from 'lucide-react'
import type { MapFilters } from '../data/types'
import type { BasemapKey } from '../map/mapConfig'
import { Label } from '../ui'
import { BasemapSwitcher } from './BasemapSwitcher'
import { Legende, LegendeInhalt } from './Legend'

interface Props {
  region: string
  basemap: BasemapKey
  onBasemapChange: (key: BasemapKey) => void
  /**
   * Die Symbolebenen werden hier nicht nur erklärt, sondern auch geschaltet —
   * siehe den Kopf von `Legend.tsx`. Deshalb der ganze Filterzustand statt nur
   * der Aktivität.
   */
  filters: MapFilters
  onFiltersChange: (f: MapFilters) => void
}

export function Kartenebenen({ region, basemap, onBasemapChange, filters, onFiltersChange }: Props) {
  const [offen, setOffen] = useState(false)

  // Auf dem Telefon deckt die Blase halbe Karte ab — Escape ist der übliche
  // Weg heraus, und sie darf nicht offen bleiben, wenn das Fenster wächst.
  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offen])

  return (
    /*
      Weicht einer offenen Infokarte aus — deren Breite steht in
      `--karte-rechts` (siehe `.karte` in index.css).
    */
    <div
      style={{ right: 'calc(var(--karte-rechts, 0px) + 0.75rem)' }}
      /*
        Die Höhe endet oberhalb der Herkunftsangabe (ⓘ, 24 px plus Rand) — sonst
        deckt eine lange Legende sie zu, genau der Fehler, den ihr alter Platz
        unten rechts schon hatte. Was nicht hineinpasst, scrollt in der Legende.
      */
      className="pointer-events-none absolute top-3 z-10 flex max-h-[calc(100%-3.5rem)]
                 flex-col items-end gap-2 transition-[right] duration-200
                 ease-[var(--ease-heraus)]"
    >
      {/* ---------------------------------------------------------- Telefon */}
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-label="Kartenwahl, Ebenen und Legende"
        className={`pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center
                    rounded-mittel border border-kante bg-flaeche-2/92 shadow-[var(--shadow-2)]
                    backdrop-blur-md transition-colors duration-[160ms] sm:hidden
                    ${offen ? 'text-gletscher-200' : 'text-ink-300'}`}
      >
        <Layers size={17} strokeWidth={2} aria-hidden />
      </button>

      {offen && (
        <div
          className="pointer-events-auto flex min-h-0 w-[17rem] flex-col overflow-hidden
                     rounded-gross border border-kante bg-flaeche-2/97 shadow-[var(--shadow-4)]
                     backdrop-blur-md sm:hidden"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-kante px-3 py-2.5">
            <span className="flex-1 text-klein font-semibold text-ink-100">Karte &amp; Ebenen</span>
            <button
              onClick={() => setOffen(false)}
              aria-label="Schliessen"
              className="-mr-1 rounded-klein p-1 text-ink-500 transition-colors duration-[160ms]
                         hover:bg-flaeche-3 hover:text-ink-100"
            >
              <X size={15} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto px-3 pb-3 pt-2.5">
            <div>
              <Label className="mb-1.5">Hintergrundkarte</Label>
              <BasemapSwitcher region={region} value={basemap} onChange={onBasemapChange} breit />
            </div>
            <div className="border-t border-kante pt-3">
              <LegendeInhalt activity={filters.activity} filters={filters} onChange={onFiltersChange} />
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- Zeiger */}
      <div className="pointer-events-auto hidden shrink-0 sm:block">
        <BasemapSwitcher region={region} value={basemap} onChange={onBasemapChange} />
      </div>
      <div className="hidden min-h-0 sm:flex">
        <Legende activity={filters.activity} filters={filters} onChange={onFiltersChange} />
      </div>
    </div>
  )
}
