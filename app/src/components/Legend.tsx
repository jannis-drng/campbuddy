/**
 * Legende der Kartenebenen.
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
import { ChevronDown, Droplet, Eye, Layers, Star, Tent, Truck, Waves } from 'lucide-react'
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

const ZONEN = [
  ['Erlaubt', STATUS_COLORS.allowed],
  ['Geduldet', STATUS_COLORS.tolerated],
  ['Verboten', STATUS_COLORS.forbidden],
  ['Ungeklärt', STATUS_COLORS.unknown],
] as const

/**
 * Die Gemeindeebene, und was ihre zwei Darstellungen bedeuten.
 *
 * Der Unterschied zwischen voller Fläche und Schraffur ist keine Spielerei,
 * sondern die wichtigste Auskunft dieser Karte über sich selbst: die eine
 * Einstufung ist mit einem amtlichen Dokument belegt, die andere bloss
 * abgeleitet. Deshalb steht er in der Legende, und deshalb steht dabei, was er
 * heisst.
 */
const GEMEINDEN = [
  ['Erlaubt', GEMEINDE_COLORS.allowed, true],
  ['Geduldet', GEMEINDE_COLORS.tolerated, true],
  ['Verboten', GEMEINDE_COLORS.forbidden, true],
  ['… schraffiert: ohne Beleg', GEMEINDE_COLORS.forbidden, false],
] as const

/** Dieselbe Schraffur wie auf der Karte, nur als Kachel im Kästchen. */
function schraffurStil(farbe: string) {
  return {
    backgroundColor: 'transparent',
    backgroundImage: `repeating-linear-gradient(-45deg, ${farbe} 0 2px, transparent 2px 5px)`,
    borderColor: farbe,
  }
}

const PUNKTE: [string, string, LucideIcon | typeof Huettenzeichen][] = [
  ['Hütte', SYMBOL_FARBEN.hut, Huettenzeichen],
  ['Campingplatz', SYMBOL_FARBEN.campsite, Tent],
  ['Stellplatz', SYMBOL_FARBEN.vehicle_spot, Truck],
]

const NATUR: [string, string, LucideIcon][] = [
  ['Trinkwasser, Quelle', SYMBOL_FARBEN.drinking_water, Droplet],
  ['See, Wasserfall', SYMBOL_FARBEN.lake, Waves],
  ['Aussichtspunkt', SYMBOL_FARBEN.viewpoint, Eye],
  ['Eigene Markierung', SYMBOL_FARBEN.eigen, Star],
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
            <Label className="mb-1.5">Gemeinde</Label>
            <div className="space-y-1.5">
              {GEMEINDEN.map(([label, farbe, voll]) => (
                <div key={label} className="flex items-center gap-2 text-klein text-ink-300">
                  <span
                    className="h-3 w-3 shrink-0 rounded-[3px] border"
                    style={voll ? { backgroundColor: `${farbe}55`, borderColor: farbe } : schraffurStil(farbe)}
                    aria-hidden
                  />
                  {label}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
              Ausserhalb der Schutzgebiete entscheidet die Gemeinde. Ohne Füllung heisst:
              hier gilt keine bekannte Gemeinderegel — antippen zeigt, wen du fragen kannst.
            </p>
          </div>

          <div className="border-t border-kante pt-2.5">
            <Label className="mb-1.5">Übernachten</Label>
            <div className="space-y-1.5">
              {PUNKTE.map(([label, farbe, Zeichen]) => (
                <div key={label} className="flex items-center gap-2 text-klein text-ink-300">
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

          <div className="border-t border-kante pt-2.5">
            <Label className="mb-1.5">Unterwegs</Label>
            <div className="space-y-1.5">
              {NATUR.map(([label, farbe, Zeichen]) => (
                <div key={label} className="flex items-center gap-2 text-klein text-ink-300">
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

          <p className="flex items-start gap-2 border-t border-kante pt-2.5 text-mikro
                        normal-case leading-snug tracking-normal text-ink-500">
            <svg viewBox="0 0 20 6" className="mt-1.5 h-1 w-5 shrink-0" aria-hidden>
              <line x1="0" y1="3" x2="20" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Gestrichelter Rand oder Schraffur: Einstufung ohne amtlichen Beleg
          </p>
    </div>
  )
}
