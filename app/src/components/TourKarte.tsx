/**
 * Eine Tour als Karte — das Grundelement beider Übersichten.
 *
 * Dieselbe Karte trägt die Community und „Deine Touren". Sie sahen vorher
 * verschieden aus, obwohl sie dasselbe zeigten; dass eine Tour mir gehört,
 * ändert nicht, wie sie aussieht, sondern nur, was ich mit ihr tun kann.
 *
 * Aufbau von oben nach unten, nach dem, wonach jemand eine Tour aussucht:
 * Bild (wo geht es lang?), Name, Urheberin, Kennzahlen, Handlungen.
 */
import type { ReactNode } from 'react'
import { ArrowUpRight, Clock, MessageCircle, Mountain, Route as RouteIcon } from 'lucide-react'
import type { Position } from '../data/geo'
import { formatDauer } from '../data/hiking'
import type { PublicTour, Tour } from '../services/supabase'
import { RoutenVorschau } from './RoutenVorschau'

export const formatKm = (m: number | null | undefined) =>
  m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

/** Deutsches Datum, kurz. Null bleibt null — kein erfundenes Datum. */
export const formatDatum = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : null

/**
 * „vor 3 Tagen" statt eines Datums, solange es kurz her ist.
 *
 * In einer Community-Liste ist die Frische die Auskunft, nicht der Kalendertag:
 * „vor 2 Stunden" sagt, dass hier gerade etwas passiert.
 */
export function seitdem(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const minuten = Math.round(ms / 60_000)
  if (minuten < 1) return 'gerade eben'
  if (minuten < 60) return `vor ${minuten} min`
  const stunden = Math.round(minuten / 60)
  if (stunden < 24) return `vor ${stunden} h`
  const tage = Math.round(stunden / 24)
  if (tage < 31) return `vor ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`
  return formatDatum(iso) ?? ''
}

/** Initialen der Urheberin — zwei Buchstaben, mehr wird unleserlich. */
export function autorInitialen(autor: string | null | undefined): string {
  const quelle = autor?.trim()
  if (!quelle) return '?'
  const teile = quelle.split(/\s+/).filter(Boolean)
  return (teile.length > 1 ? teile[0][0] + teile[1][0] : quelle.slice(0, 2)).toUpperCase()
}

export function AutorZeile({
  autor, zeit, className = '',
}: { autor: string | null; zeit: string | null; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-kante bg-flaeche-3 text-[10px] font-semibold text-ink-300"
      >
        {autorInitialen(autor)}
      </span>
      {/*
        Seit Migration 0017 hat jedes Konto einen Benutzernamen, und die View
        holt ihn live aus dem Profil — „ohne Urheberangabe" kann es nicht mehr
        geben. Der Rückfall steht nur noch für Zeilen aus der Zeit davor, deren
        Konto gelöscht wurde.
      */}
      <span className="min-w-0 truncate text-klein text-ink-400">
        {autor?.trim() || 'gelöschtes Konto'}
        {zeit && <span className="text-ink-600"> · {seitdem(zeit)}</span>}
      </span>
    </div>
  )
}

/** Eine Kennzahl mit Symbol. Fehlt der Wert, fällt sie ganz weg. */
function Kennwert({ icon: Icon, wert, titel }: { icon: typeof Clock; wert: string; titel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-klein text-ink-300" title={titel}>
      <Icon size={13} strokeWidth={2} className="shrink-0 text-ink-500" aria-hidden />
      {wert}
    </span>
  )
}

/**
 * Die Kennzahlenreihe. Bewusst nur drei: Länge, Aufstieg, Gehzeit. Alles
 * Weitere steht in der Detailansicht — eine Karte, die alles zeigt, zeigt
 * nichts.
 */
export function Kennzahlen({ tour }: { tour: PublicTour | Tour }) {
  const hat = tour.distance_m != null || tour.ascent_m != null || tour.duration_s != null
  if (!hat) {
    return (
      <span className="text-klein text-ink-600">
        {tour.days ? `${tour.days} ${tour.days === 1 ? 'Tag' : 'Tage'} geplant` : 'Keine Kenndaten'}
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {tour.distance_m != null && (
        <Kennwert icon={RouteIcon} wert={formatKm(tour.distance_m)} titel="Länge" />
      )}
      {tour.ascent_m != null && (
        <Kennwert icon={Mountain} wert={`${tour.ascent_m} hm`} titel="Aufstieg" />
      )}
      {tour.duration_s != null && (
        <Kennwert icon={Clock} wert={formatDauer(tour.duration_s)} titel="Gehzeit" />
      )}
    </div>
  )
}

interface Props {
  tour: PublicTour | Tour
  /** Öffnet die Detailansicht. Die ganze Karte ist der Knopf. */
  onOeffnen: () => void
  /** Zeile unter den Kennzahlen: Likes, Merken, eigene Handlungen. */
  aktionen?: ReactNode
  /** Kleine Marke oben links auf dem Bild — z.B. „Geteilt". */
  marke?: ReactNode
}

export function TourKarte({ tour, onOeffnen, aktionen, marke }: Props) {
  const geometrie = (tour.geometry?.coordinates ?? []) as Position[]

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-gross border border-kante bg-flaeche-2 transition-[border-color,transform,box-shadow] duration-[160ms] ease-[var(--ease-heraus)] hover:-translate-y-0.5 hover:border-kante-stark hover:shadow-[var(--shadow-3)] focus-within:border-kante-stark">
      <div className="relative">
        <RoutenVorschau geometry={geometrie} breite={640} hoehe={360} />
        {marke && <div className="absolute left-2.5 top-2.5">{marke}</div>}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="min-w-0">
          {/*
            Der Titel trägt den Link, nicht die ganze Karte: ein <article> in
            einem <button> wäre nicht bedienbar und der Screenreader läse den
            gesamten Inhalt als einen Knopfnamen vor. Das ausgedehnte Ziel
            darunter macht trotzdem die ganze Fläche klickbar.
          */}
          <h3 className="text-ueberschrift font-semibold leading-snug text-ink-50">
            <button
              onClick={onOeffnen}
              className="text-left after:absolute after:inset-0 after:content-[''] hover:text-gletscher-200"
            >
              <span className="line-clamp-2">{tour.name}</span>
            </button>
          </h3>
          <AutorZeile
            autor={tour.autor}
            zeit={tour.veroeffentlicht_am ?? tour.created_at}
            className="mt-1.5"
          />
        </div>

        {tour.beschreibung && (
          <p className="line-clamp-2 text-klein leading-relaxed text-ink-400">{tour.beschreibung}</p>
        )}

        <div className="mt-auto space-y-2.5 pt-0.5">
          <Kennzahlen tour={tour} />
          {aktionen && (
            <div className="relative z-10 flex flex-wrap items-center gap-1 border-t border-kante pt-2.5">
              {aktionen}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * Zählerknopf: Herz, Sternchen, Sprechblase.
 *
 * Alle drei sehen gleich aus und unterscheiden sich nur im Symbol und im
 * Zustand — sonst wirkt eine Kartenfussleiste wie eine Sammlung fremder Teile.
 */
export function ZaehlerKnopf({
  icon: Icon, zahl, aktiv, label, onClick, tonAktiv = 'akzent', disabled,
}: {
  icon: typeof MessageCircle
  zahl?: number
  aktiv?: boolean
  label: string
  onClick?: () => void
  tonAktiv?: 'akzent' | 'warm'
  disabled?: boolean
}) {
  const aktivKlasse = tonAktiv === 'warm' ? 'text-verboten-400' : 'text-gletscher-300'
  const inhalt = (
    <>
      <Icon size={15} strokeWidth={2} className="shrink-0"
            fill={aktiv ? 'currentColor' : 'none'} aria-hidden />
      {zahl != null && <span className="tabular-nums">{zahl}</span>}
    </>
  )
  const grundform = 'inline-flex h-8 items-center gap-1.5 rounded-mittel px-2 text-klein font-medium'

  /*
    Ohne Handlung ist das keine Schaltfläche, sondern eine Angabe. Ein
    ausgegrauter Knopf, der eine Zahl zeigt, lädt zum Klicken ein und tut
    dann nichts — in der eigenen Tourenliste stehen die Zähler genau so da.
  */
  if (!onClick) {
    return (
      <span className={`${grundform} ${aktiv ? aktivKlasse : 'text-ink-500'}`} title={label}>
        {inhalt}
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={aktiv}
      aria-label={label}
      title={label}
      className={`${grundform} transition-colors duration-[160ms] ` +
        `disabled:cursor-not-allowed disabled:opacity-50 ` +
        (aktiv ? `${aktivKlasse} hover:bg-flaeche-3` : 'text-ink-400 hover:bg-flaeche-3 hover:text-ink-100')}
    >
      {inhalt}
    </button>
  )
}

/** Der Weg von der Karte zurück auf die Karte. */
export function AufKarteKnopf({ onClick, label = 'Auf Karte' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-mittel px-2.5 text-klein font-medium text-gletscher-300 transition-colors duration-[160ms] hover:bg-gletscher-500/15"
    >
      {label}
      <ArrowUpRight size={14} strokeWidth={2.5} aria-hidden />
    </button>
  )
}
