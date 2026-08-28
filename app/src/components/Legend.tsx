/**
 * Legende der Kartenebenen.
 *
 * Sie war einmal doppelt so lang und reichte am Zeiger bis an den unteren
 * Kartenrand. Gekürzt an drei Stellen, ohne dass eine Auskunft verloren geht:
 *
 *  - **Zone und Gemeinde in einer Zeile.** „Erlaubt · Geduldet · Verboten"
 *    stand zweimal untereinander, einmal in den Zonentönen, einmal in den
 *    tieferen Gemeindetönen — acht Zeilen für vier Wörter. Jetzt trägt jede
 *    Zeile beide Kästchen nebeneinander, und die Spaltenüberschrift sagt,
 *    welches wofür steht. Nebenbei lernt man so, dass es zwei Ebenen gibt.
 *  - **Die Schraffur wird einmal erklärt, nicht zweimal.** Sie stand als
 *    eigene Zeile *und* als Fussnote.
 *  - **Die Symbole stehen zu zweit nebeneinander** statt sieben Zeilen tief.
 *
 * Die Schalter dafür bleiben, wo sie sind: in der Filterleiste. Legende und
 * Schalter zusammenzulegen war einmal versucht und wieder verworfen — beim
 * Nachschlagen will man nichts umlegen, und ein Klick auf eine Erklärung, der
 * die Karte ändert, ist eine Falle.
 *
 * Die Legende bringt ihre Lage nicht mehr selbst mit — sie steht dort, wo auch
 * die Wahl der Hintergrundkarte steht (siehe `Kartenebenen`). Beides sind
 * Auskünfte über dieselbe Karte; sie an zwei gegenüberliegende Ecken zu
 * verteilen hiess, zweimal suchen zu müssen.
 *
 * Deshalb zwei Bausteine: `LegendeInhalt` ist die reine Erklärung, `Legende`
 * die aufklappbare Karte drumherum. Auf dem Telefon steckt der Inhalt in der
 * Ebenen-Blase und braucht keinen zweiten Klappmechanismus.
 */
import { useState } from 'react'
import { ChevronDown, Droplet, Eye, Layers, Star, Tent, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityMode } from '../data/types'
import { GEMEINDE_COLORS, STATUS_COLORS } from '../map/mapConfig'
import { SYMBOL_FARBEN } from '../map/symbole'
import { Label } from '../ui'

/** Dasselbe Zeichen wie das Kartensymbol, nur klein — sonst müsste man zweimal lernen. */
function Huettenzeichen({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12.5 12 5l9 7.5" />
      <path d="M5.5 11.5V19h13v-7.5" />
    </svg>
  )
}

const BEZUG: Record<ActivityMode, string> = {
  all: 'Gesamteinstufung',
  tent: 'Regel für Zelt / Biwak',
  vehicle: 'Regel für Fahrzeuge',
  fire: 'Regel für offenes Feuer',
}

/**
 * Eine Zeile je Einstufung, mit beiden Farbwelten nebeneinander: links die
 * Zone (Schutzgebiet), rechts die Gemeinde. `gemeinde: null` heisst „ohne
 * Füllung" — die Gemeindeebene kennt kein eigenes Grau für „ungeklärt", sie
 * lässt die Fläche schlicht leer.
 */
const EINSTUFUNGEN: [string, string, string | null][] = [
  ['Erlaubt', STATUS_COLORS.allowed, GEMEINDE_COLORS.allowed],
  ['Geduldet', STATUS_COLORS.tolerated, GEMEINDE_COLORS.tolerated],
  ['Verboten', STATUS_COLORS.forbidden, GEMEINDE_COLORS.forbidden],
  ['Ungeklärt', STATUS_COLORS.unknown, null],
]

/** Dieselbe Schraffur wie auf der Karte, nur als Kachel im Kästchen. */
function schraffurStil(farbe: string) {
  return {
    backgroundColor: 'transparent',
    backgroundImage: `repeating-linear-gradient(-45deg, ${farbe} 0 2px, transparent 2px 5px)`,
    borderColor: farbe,
  }
}

/**
 * Die Kartensymbole, kurz benannt. „Trinkwasser, Quelle" und „See, Wasserfall"
 * waren zwei Zeilen für dieselbe Ebene und sind eine geworden; die langen
 * Namen sind auf das Wort gekürzt, das die Karte selbst benutzt.
 */
const SYMBOLE: [string, string, LucideIcon | typeof Huettenzeichen][] = [
  ['Hütte', SYMBOL_FARBEN.hut, Huettenzeichen],
  ['Camping', SYMBOL_FARBEN.campsite, Tent],
  ['Stellplatz', SYMBOL_FARBEN.vehicle_spot, Truck],
  ['Wasser', SYMBOL_FARBEN.drinking_water, Droplet],
  ['Aussicht', SYMBOL_FARBEN.viewpoint, Eye],
  ['Eigene', SYMBOL_FARBEN.eigen, Star],
]

/**
 * Die aufklappbare Legende, wie sie am Zeiger unter der Kartenwahl hängt.
 *
 * Sie klappt nach unten auf und bringt keine eigene Lage mit — die gibt ihr
 * `Kartenebenen`. Was nicht in die Höhe passt, scrollt innen.
 */
export function Legende({ activity }: { activity: ActivityMode }) {
  const [offen, setOffen] = useState(true)

  return (
    <div
      className={`pointer-events-auto flex min-h-0 w-48 flex-col overflow-hidden rounded-gross
                  border border-kante bg-flaeche-2/92 shadow-[var(--shadow-3)] backdrop-blur-md
                  ${offen ? '' : 'shrink-0'}`}
    >
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="flex w-full shrink-0 items-center gap-2 px-3 py-2.5 text-left transition-colors
                   duration-[160ms] hover:bg-flaeche-3"
      >
        <Layers size={14} strokeWidth={2} className="text-ink-500" aria-hidden />
        <span className="flex-1 text-klein font-semibold text-ink-100">Legende</span>
        <ChevronDown
          size={14} strokeWidth={2.5} aria-hidden
          className={`text-ink-500 transition-transform duration-[160ms] ease-[var(--ease-heraus)] ${offen ? '-rotate-0' : '-rotate-90'}`}
        />
      </button>

      {offen && (
        <div className="min-h-0 overflow-y-auto border-t border-kante px-3 pb-3 pt-2.5">
          <LegendeInhalt activity={activity} />
        </div>
      )}
    </div>
  )
}

/** Die Erklärung selbst — ohne Rahmen, ohne Klappmechanik. */
export function LegendeInhalt({ activity }: { activity: ActivityMode }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="mb-1">{BEZUG[activity]}</Label>
        {/*
          Die Zeile darüber ist der ganze Trick: ohne sie wären zwei Kästchen
          nebeneinander bloss zwei Farben, mit ihr sind sie zwei
          Zuständigkeitsebenen — und dass die feinere die Gemeinde ist, ist
          die Aussage, auf die es bei dieser Karte ankommt.
        */}
        <p className="mb-1 text-mikro normal-case tracking-normal text-ink-500">
          links Zone · rechts Gemeinde
        </p>
        <div className="space-y-1">
          {EINSTUFUNGEN.map(([label, zone, gemeinde]) => (
            <div key={label} className="flex items-center gap-2 text-klein text-ink-300">
              <span
                className="h-3 w-3 shrink-0 rounded-[3px] border"
                style={{ backgroundColor: `${zone}55`, borderColor: zone }}
                aria-hidden
              />
              <span
                className="h-3 w-3 shrink-0 rounded-[3px] border"
                style={gemeinde
                  ? { backgroundColor: `${gemeinde}55`, borderColor: gemeinde }
                  : { backgroundColor: 'transparent', borderColor: GEMEINDE_COLORS.unknown, borderStyle: 'dashed' }}
                aria-hidden
              />
              {label}
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
          Ausserhalb der Schutzgebiete entscheidet die Gemeinde. Ohne Füllung: keine
          bekannte Regel - antippen zeigt den Kontakt.
        </p>
      </div>

      {/*
        Die wichtigste Auskunft dieser Karte über sich selbst: die eine
        Einstufung ist mit einem amtlichen Dokument belegt, die andere bloss
        abgeleitet. Sie stand einmal als Zeile und noch einmal als Fussnote.
      */}
      <p className="flex items-center gap-2 border-t border-kante pt-2.5 text-mikro
                    normal-case leading-snug tracking-normal text-ink-500">
        <span
          className="h-3 w-3 shrink-0 rounded-[3px] border"
          style={schraffurStil(GEMEINDE_COLORS.forbidden)}
          aria-hidden
        />
        Schraffiert oder gestrichelt: Einstufung ohne amtlichen Beleg
      </p>

      <div className="border-t border-kante pt-2.5">
        <Label className="mb-1.5">Symbole</Label>
        {/*
          Zwei Spalten statt sieben Zeilen. Die Namen sind kurz genug, dass
          nichts umbricht; wer schalten will, findet dieselben Wörter in der
          Filterleiste wieder.
        */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          {SYMBOLE.map(([label, farbe, Zeichen]) => (
            <div key={label} className="flex items-center gap-1.5 text-klein text-ink-300">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: farbe, color: '#0B1214' }}
                aria-hidden
              >
                <Zeichen className="h-2.5 w-2.5" />
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
