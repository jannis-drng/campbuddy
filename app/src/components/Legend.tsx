/**
 * Legende der Kartenebenen — und zugleich ihr Schalter.
 *
 * Die Legende bringt ihre Lage nicht mehr selbst mit — sie steht dort, wo auch
 * die Wahl der Hintergrundkarte steht (siehe `Kartenebenen`). Beides sind
 * Auskünfte über dieselbe Karte; sie an zwei gegenüberliegende Ecken zu
 * verteilen hiess, zweimal suchen zu müssen.
 *
 * Aus demselben Grund sind die Symbolebenen hierher gezogen. Sie standen als
 * Chipreihe in der Filterleiste, während zwei Handbreit weiter dieselben
 * Symbole erklärt wurden: ein Ort zum Nachschlagen, ein zweiter zum Schalten,
 * beide mit denselben sieben Wörtern. Jetzt schaltet man dort, wo die
 * Bedeutung steht — und die Filterleiste über der Karte ist eine Zeile kürzer.
 *
 * **Was sich schalten lässt und was nicht, ist Absicht:** Zonen- und
 * Gemeindefarben bleiben reine Erklärung. Eine Rechtslage darf man nicht
 * wegklicken können, sonst verschwände ein Verbot durch Filtern. Alles
 * darunter ist Beiwerk — eine ausgeblendete Hütte behauptet nichts.
 *
 * Die Schalter stehen oben, die Erklärung darunter: wer die Blase öffnet, will
 * meistens etwas umlegen — nachgeschlagen wird einmal, geschaltet oft.
 *
 * Zwei Bausteine: `LegendeInhalt` ist der Inhalt, `Legende` die aufklappbare
 * Karte drumherum. Auf dem Telefon steckt der Inhalt in der Ebenen-Blase und
 * braucht keinen zweiten Klappmechanismus.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Droplet, Eye, Layers, Mountain, Star, Tent, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityMode, MapFilters } from '../data/types'
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

/**
 * Die Symbolebenen: Zeichen, Bedeutung und der Schalter dahinter — eine Zeile.
 *
 * Trinkwasser, Quellen, Seen und Wasserfälle standen früher als zwei Zeilen
 * da, hängen aber an *einem* Schalter. Zwei Zeilen mit einem Schalter wären
 * eine Zeile zu viel: der zweite Klick täte, was der erste schon getan hat.
 */
const EBENEN: {
  key: Exclude<keyof MapFilters, 'activity'>
  label: string
  gruppe: 'Übernachten' | 'Unterwegs'
  farbe?: string
  zeichen: LucideIcon | typeof Huettenzeichen
}[] = [
  { key: 'showHuts', label: 'Hütte', gruppe: 'Übernachten', farbe: SYMBOL_FARBEN.hut, zeichen: Huettenzeichen },
  { key: 'showCampsites', label: 'Campingplatz', gruppe: 'Übernachten', farbe: SYMBOL_FARBEN.campsite, zeichen: Tent },
  { key: 'showVehicleSpots', label: 'Stellplatz', gruppe: 'Übernachten', farbe: SYMBOL_FARBEN.vehicle_spot, zeichen: Truck },
  { key: 'showWater', label: 'Wasser, Seen', gruppe: 'Unterwegs', farbe: SYMBOL_FARBEN.drinking_water, zeichen: Droplet },
  { key: 'showViewpoints', label: 'Aussichtspunkt', gruppe: 'Unterwegs', farbe: SYMBOL_FARBEN.viewpoint, zeichen: Eye },
  { key: 'showPeaks', label: 'Gipfel', gruppe: 'Unterwegs', zeichen: Mountain },
  { key: 'showEigene', label: 'Eigene Punkte', gruppe: 'Unterwegs', farbe: SYMBOL_FARBEN.eigen, zeichen: Star },
]

const GRUPPEN = ['Übernachten', 'Unterwegs'] as const

/**
 * Die aufklappbare Legende, wie sie am Zeiger unter der Kartenwahl hängt.
 *
 * Sie klappt nach unten auf und bringt keine eigene Lage mit — die gibt ihr
 * `Kartenebenen`. Was nicht in die Höhe passt, scrollt innen.
 */
export function Legende({ activity, filters, onChange }: {
  activity: ActivityMode
  filters: MapFilters
  onChange: (f: MapFilters) => void
}) {
  const [offen, setOffen] = useState(true)

  return (
    <div
      className={`pointer-events-auto flex min-h-0 w-52 flex-col overflow-hidden rounded-gross
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
        <span className="flex-1 text-klein font-semibold text-ink-100">Ebenen &amp; Legende</span>
        <ChevronDown
          size={14} strokeWidth={2.5} aria-hidden
          className={`text-ink-500 transition-transform duration-[160ms] ease-[var(--ease-heraus)] ${offen ? '-rotate-0' : '-rotate-90'}`}
        />
      </button>

      {offen && (
        <div className="min-h-0 overflow-y-auto border-t border-kante px-3 pb-3 pt-2.5">
          <LegendeInhalt activity={activity} filters={filters} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

/** Der Inhalt selbst — ohne Rahmen, ohne Klappmechanik. */
export function LegendeInhalt({ activity, filters, onChange }: {
  activity: ActivityMode
  filters: MapFilters
  onChange: (f: MapFilters) => void
}) {
  const aktiv = EBENEN.filter((e) => filters[e.key]).length
  const setzeAlle = (an: boolean) => {
    const naechste = { ...filters }
    for (const e of EBENEN) naechste[e.key] = an
    onChange(naechste)
  }

  return (
    <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-baseline gap-2">
              <Label className="flex-1">Symbole</Label>
              {/* Sieben Zeilen einzeln zurückzunehmen ist kein Weg zurück. */}
              <button
                onClick={() => setzeAlle(aktiv === 0)}
                className="text-mikro font-medium normal-case tracking-normal text-ink-500
                           transition-colors duration-[160ms] hover:text-ink-100"
              >
                {aktiv === 0 ? 'Alle an' : 'Alle aus'}
              </button>
            </div>

            {GRUPPEN.map((g, i) => (
              <div key={g} className={i > 0 ? 'mt-2.5' : ''}>
                <p className="mb-1 text-mikro normal-case tracking-normal text-ink-500">{g}</p>
                <div className="space-y-0.5">
                  {EBENEN.filter((e) => e.gruppe === g).map((e) => (
                    <EbenenZeile
                      key={e.key}
                      an={filters[e.key]}
                      onClick={() => onChange({ ...filters, [e.key]: !filters[e.key] })}
                      zeichen={
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                          style={e.farbe
                            ? { backgroundColor: e.farbe, color: '#0B1214' }
                            : { backgroundColor: 'transparent', color: 'currentColor' }}
                          aria-hidden
                        >
                          <e.zeichen className="h-2.5 w-2.5" />
                        </span>
                      }
                    >
                      {e.label}
                    </EbenenZeile>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-kante pt-2.5">
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
              Ausserhalb der Schutzgebiete entscheidet die Gemeinde. Ohne Füllung: keine
              bekannte Regel — antippen zeigt den Kontakt.
            </p>
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

/**
 * Eine Symbolebene als Zeile: Zeichen, Name, Haken.
 *
 * Ausgeschaltet verliert das farbige Zeichen an Deckkraft, statt zu
 * verschwinden — die Legende soll auch erklären, was man *einschalten kann*,
 * nicht nur, was gerade zu sehen ist.
 *
 * Auf dem Telefon 44 px hoch, am Zeiger 32: dort zielt eine Maus, hier ein
 * Daumen im Gehen. Angefasst wird in beiden Fällen die ganze Zeilenbreite.
 */
function EbenenZeile({
  an, onClick, zeichen, children,
}: { an: boolean; onClick: () => void; zeichen: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={an}
      className={`-mx-1 flex h-11 w-full items-center gap-2 rounded-klein px-1 text-klein sm:h-8
                  transition-colors duration-[160ms] hover:bg-flaeche-3
                  ${an ? 'text-ink-200' : 'text-ink-500'}`}
    >
      <span className={`flex items-center transition-opacity duration-[160ms] ${an ? '' : 'opacity-40'}`}>
        {zeichen}
      </span>
      <span className="flex-1 text-left">{children}</span>
      {an && <Check size={13} strokeWidth={2.5} className="shrink-0 text-gletscher-200" aria-hidden />}
    </button>
  )
}
