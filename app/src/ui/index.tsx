/**
 * Die Primitive der Oberfläche.
 *
 * Vorher trug jeder Knopf seine eigene Utility-Kette im JSX — bei jeder
 * Änderung musste man 14 Dateien durchsuchen. Hier liegen die Bausteine
 * einmal, alle Seiten setzen sie zusammen.
 *
 * Regeln, die überall gelten:
 *  - Radien nach Flächengrösse (klein → riesig), nicht nach Laune.
 *  - Elevation in vier Stufen; höher liegt, was näher am Nutzer ist.
 *  - Übergänge 160 ms mit ease-heraus: schnell genug, um nicht zu bremsen.
 *  - Berührungsziele mindestens 36 px hoch.
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

const uebergang = 'transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease-[var(--ease-heraus)]'

/* ------------------------------------------------------------------ Button */

type Variante = 'primaer' | 'sekundaer' | 'geist' | 'gefahr'
type Groesse = 'klein' | 'mittel' | 'gross'

const VARIANTEN: Record<Variante, string> = {
  // Genau eine primäre Aktion pro Abschnitt — deshalb ist nur diese gefüllt.
  // Heller Akzent mit dunkler Schrift statt mittelblau mit weisser: das
  // erreicht 10,6:1 statt 3,5:1 und liest sich auf dunklem Grund klarer
  // als primär.
  primaer:
    'bg-gletscher-300 text-ink-950 shadow-[var(--shadow-1)] ' +
    'hover:bg-gletscher-200 active:translate-y-px ' +
    'disabled:bg-ink-700 disabled:text-ink-500 disabled:shadow-none',
  sekundaer:
    'bg-flaeche-3 text-ink-100 border border-kante ' +
    'hover:bg-ink-750 hover:border-kante-stark active:translate-y-px ' +
    'disabled:text-ink-500 disabled:bg-flaeche-2',
  geist:
    'text-ink-300 hover:bg-flaeche-3 hover:text-ink-100 active:translate-y-px ' +
    'disabled:text-ink-600 disabled:hover:bg-transparent',
  gefahr:
    'bg-verboten-500/12 text-verboten-400 border border-verboten-500/30 ' +
    'hover:bg-verboten-500/20 hover:border-verboten-500/50 active:translate-y-px ' +
    'disabled:text-ink-500 disabled:bg-flaeche-2 disabled:border-kante',
}

const GROESSEN: Record<Groesse, string> = {
  klein: 'h-8 px-2.5 text-klein gap-1.5 rounded-klein',
  mittel: 'h-9 px-3.5 text-fliess gap-2 rounded-mittel',
  gross: 'h-11 px-5 text-fliess gap-2 rounded-mittel',
}

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variante?: Variante
  groesse?: Groesse
  icon?: LucideIcon
  /** Füllt die volle Breite — für die eine Hauptaktion eines Formulars. */
  breit?: boolean
}

export function Button({
  variante = 'sekundaer', groesse = 'mittel', icon: Icon, breit, className = '', children, ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center font-medium ${uebergang} ` +
        `disabled:cursor-not-allowed ${VARIANTEN[variante]} ${GROESSEN[groesse]} ` +
        `${breit ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={groesse === 'klein' ? 14 : 16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  )
}

/** Quadratischer Knopf mit nur einem Icon — braucht immer ein aria-label. */
export function IconButton({
  icon: Icon, label, groesse = 'mittel', variante = 'geist', className = '', ...rest
}: Omit<ButtonProps, 'children' | 'icon' | 'breit'> & { icon: LucideIcon; label: string }) {
  const kante = groesse === 'klein' ? 'h-8 w-8' : 'h-9 w-9'
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-mittel ${uebergang} ` +
        `${VARIANTEN[variante]} ${kante} ${className}`}
      {...rest}
    >
      <Icon size={groesse === 'klein' ? 15 : 17} strokeWidth={2} aria-hidden />
    </button>
  )
}

/* -------------------------------------------------------------------- Card */

export function Card({ className = '', children, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={`rounded-gross border border-kante bg-flaeche-2 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

/** Zeile in einer Liste — gemeinsame Kante, keine doppelten Rahmen. */
export function Liste({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <ul className={`divide-y divide-kante overflow-hidden rounded-gross border border-kante bg-flaeche-2 ${className}`}>
      {children}
    </ul>
  )
}

/* ------------------------------------------------------------------- Badge */

type BadgeTon = 'neutral' | 'akzent' | 'erlaubt' | 'geduldet' | 'verboten' | 'ungeklaert' | 'warnung'

const BADGE_TOENE: Record<BadgeTon, string> = {
  neutral: 'bg-flaeche-3 text-ink-300 border-kante',
  akzent: 'bg-gletscher-500/12 text-gletscher-300 border-gletscher-500/25',
  erlaubt: 'bg-erlaubt-500/12 text-erlaubt-400 border-erlaubt-500/25',
  geduldet: 'bg-geduldet-500/12 text-geduldet-400 border-geduldet-500/25',
  verboten: 'bg-verboten-500/12 text-verboten-400 border-verboten-500/25',
  ungeklaert: 'bg-ungeklaert-500/12 text-ungeklaert-400 border-ungeklaert-500/25',
  warnung: 'bg-geduldet-500/10 text-geduldet-400 border-geduldet-500/20',
}

export function Badge({
  ton = 'neutral', icon: Icon, children, className = '',
}: { ton?: BadgeTon; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ` +
        `text-mikro font-semibold uppercase ${BADGE_TOENE[ton]} ${className}`}
    >
      {Icon && <Icon size={11} strokeWidth={2.5} aria-hidden />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------- Hinweis / Zustand */

type HinweisTon = 'info' | 'warnung' | 'fehler' | 'erfolg'

const HINWEIS_TOENE: Record<HinweisTon, string> = {
  info: 'bg-flaeche-3 text-ink-300 border-kante',
  warnung: 'bg-geduldet-500/8 text-geduldet-400 border-geduldet-500/20',
  fehler: 'bg-verboten-500/8 text-verboten-400 border-verboten-500/20',
  erfolg: 'bg-erlaubt-500/8 text-erlaubt-400 border-erlaubt-500/20',
}

export function Hinweis({
  ton = 'info', icon: Icon, children, className = '',
}: { ton?: HinweisTon; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div
      role={ton === 'fehler' ? 'alert' : 'status'}
      className={`flex gap-2.5 rounded-mittel border px-3 py-2.5 text-klein leading-relaxed ${HINWEIS_TOENE[ton]} ${className}`}
    >
      {Icon && <Icon size={15} strokeWidth={2} className="mt-px shrink-0" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/* ----------------------------------------------------------------- Section */

/** Abschnitt mit Überschrift und optionalem Beiwerk rechts. */
export function Abschnitt({
  titel, beiwerk, hinweis, children, className = '',
}: {
  titel: string
  beiwerk?: ReactNode
  hinweis?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-ueberschrift font-semibold text-ink-50">{titel}</h3>
        {beiwerk && <div className="shrink-0 text-klein text-ink-400">{beiwerk}</div>}
      </div>
      {hinweis && <p className="mb-2.5 text-klein leading-relaxed text-ink-400">{hinweis}</p>}
      {children}
    </section>
  )
}

/** Kleine Grossbuchstaben-Auszeichnung über Feldern und Werten. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`block text-mikro font-medium uppercase text-ink-500 ${className}`}>
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------- Stat */

/** Kennzahl: Auszeichnung klein und leise, Wert gross und ruhig. */
export function Stat({ label, wert, ton }: { label: string; wert: ReactNode; ton?: 'akzent' }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={`mt-0.5 text-ueberschrift font-semibold ${ton === 'akzent' ? 'text-gletscher-300' : 'text-ink-50'}`}>
        {wert}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------- Input */

const EINGABE_BASIS =
  `w-full rounded-mittel border border-kante bg-flaeche-1 px-3 text-fliess text-ink-100 ` +
  `placeholder:text-ink-500 ${uebergang} hover:border-kante-stark ` +
  `focus:border-gletscher-500 focus:outline-none focus:ring-2 focus:ring-gletscher-500/25`

export function Eingabe({ className = '', ...rest }: ComponentPropsWithoutRef<'input'>) {
  return <input className={`h-10 ${EINGABE_BASIS} ${className}`} {...rest} />
}

export function Auswahl({ className = '', children, ...rest }: ComponentPropsWithoutRef<'select'>) {
  return (
    <select className={`h-9 cursor-pointer appearance-none pr-8 ${EINGABE_BASIS} ${className}`} {...rest}>
      {children}
    </select>
  )
}

export function Feld({
  label, hinweis, children,
}: { label: string; hinweis?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <Label className="mb-1.5">{label}</Label>
      {children}
      {hinweis && <p className="mt-1 text-mikro normal-case tracking-normal text-ink-500">{hinweis}</p>}
    </label>
  )
}

/* ------------------------------------------------------- SegmentedControl */

/**
 * Eine Auswahl aus wenigen gleichrangigen Optionen.
 * Ersetzt die vorherigen Pillen-Reihen, die je nach Ort anders aussahen.
 */
export function Segmente<T extends string>({
  optionen, wert, onWaehlen, groesse = 'mittel', className = '', ariaLabel,
}: {
  optionen: { wert: T; label: string; icon?: LucideIcon; titel?: string }[]
  wert: T
  onWaehlen: (w: T) => void
  groesse?: 'klein' | 'mittel'
  className?: string
  ariaLabel?: string
}) {
  const hoehe = groesse === 'klein' ? 'h-7 px-2 text-mikro normal-case tracking-normal' : 'h-8 px-3 text-klein'
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex gap-0.5 rounded-mittel border border-kante bg-flaeche-1 p-0.5 ${className}`}
    >
      {optionen.map((o) => {
        const aktiv = o.wert === wert
        return (
          <button
            key={o.wert}
            onClick={() => onWaehlen(o.wert)}
            aria-pressed={aktiv}
            title={o.titel}
            className={`inline-flex items-center justify-center gap-1.5 rounded-klein font-medium ${uebergang} ${hoehe} ` +
              (aktiv
                ? 'bg-flaeche-3 text-ink-50 shadow-[var(--shadow-1)]'
                : 'text-ink-400 hover:text-ink-100')}
          >
            {o.icon && <o.icon size={13} strokeWidth={2} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Mehrfachauswahl als Chip — für Ebenen, die sich unabhängig ein- und
 * ausschalten lassen. Der Farbpunkt zeigt, worum es auf der Karte geht.
 */
export function Chip({
  aktiv, onClick, farbe, children,
}: { aktiv: boolean; onClick: () => void; farbe?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={aktiv}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-klein font-medium ${uebergang} ` +
        (aktiv
          ? 'border-kante-stark bg-flaeche-3 text-ink-50'
          : 'border-kante bg-transparent text-ink-500 hover:border-kante-stark hover:text-ink-300')}
    >
      {farbe && (
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${uebergang}`}
          style={{ backgroundColor: farbe, opacity: aktiv ? 1 : 0.35 }}
        />
      )}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------ Leerzustand */

export function Leer({
  icon: Icon, titel, text, aktion,
}: { icon: LucideIcon; titel: string; text: string; aktion?: ReactNode }) {
  return (
    <div className="rounded-gross border border-dashed border-kante px-5 py-8 text-center">
      <Icon size={22} strokeWidth={1.5} className="mx-auto text-ink-500" aria-hidden />
      <p className="mt-2.5 text-fliess font-medium text-ink-200">{titel}</p>
      <p className="mx-auto mt-1 max-w-sm text-klein leading-relaxed text-ink-400">{text}</p>
      {aktion && <div className="mt-4">{aktion}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- Seitenhülle */

/**
 * Gemeinsame Hülle der Vollseiten-Ansichten.
 *
 * Vorher hatte jede Seite ihre eigene Breite, ihren eigenen Abstand und eine
 * gleich grosse Überschrift wie der Fliesstext. Hier liegt der Rhythmus einmal:
 * Titel gross, Beschreibung leise, Inhalt in einer lesbaren Spaltenbreite.
 */
export function Seite({
  titel, beschreibung, breite = 'normal', aktion, children,
}: {
  titel: string
  beschreibung?: string
  breite?: 'schmal' | 'normal'
  aktion?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full px-4 py-8 pb-20 sm:px-6 ${breite === 'schmal' ? 'max-w-md' : 'max-w-3xl'}`}>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display font-semibold text-ink-50">{titel}</h1>
          {beschreibung && (
            <p className="mt-1.5 max-w-prose text-fliess leading-relaxed text-ink-400">{beschreibung}</p>
          )}
        </div>
        {aktion && <div className="shrink-0">{aktion}</div>}
      </header>
      <div className="space-y-7">{children}</div>
    </div>
  )
}

/* -------------------------------------------------------------- Stufenmesser */

/**
 * Ordinalskala als gefüllte Segmente statt als Ampelfarbe.
 *
 * Grün/Gelb/Rot sind in dieser App der Rechtslage vorbehalten. Eine
 * Schwierigkeit in denselben Tönen liesse sich mit ihr verwechseln —
 * „schwer" sähe aus wie „geduldet". Die Stufen tragen deshalb Form,
 * nicht Bedeutungsfarbe.
 */
export function Stufen({
  stufe, von, label,
}: { stufe: number; von: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-end gap-[3px]" role="img" aria-label={`${label}, Stufe ${stufe} von ${von}`}>
        {Array.from({ length: von }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={`w-1.5 rounded-[2px] ${i < stufe ? 'bg-gletscher-300' : 'bg-ink-700'}`}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
      <span className="text-klein font-semibold text-ink-100">{label}</span>
    </span>
  )
}
