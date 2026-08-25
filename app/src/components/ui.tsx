/**
 * Darstellungs-Bausteine für die Rechtslage.
 *
 * Diese vier Farben sind die Kernaussage der App und deshalb streng reserviert:
 * kein Knopf, keine Marke, kein Zierrat verwendet Grün, Gelb oder Rot.
 */
import { Ban, Check, CircleHelp, FileWarning, MapPinCheck, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LegalStatus, Permission, ReviewStatus } from '../data/types'
import { Badge } from '../ui'

export const STATUS_LABEL: Record<LegalStatus, string> = {
  allowed: 'Erlaubt',
  tolerated: 'Geduldet',
  forbidden: 'Verboten',
  unknown: 'Ungeklärt',
}

/** Für Stellen, die noch direkt Klassen brauchen (z.B. Kartenlegende). */
export const STATUS_CLASS: Record<LegalStatus, string> = {
  allowed: 'bg-erlaubt-500/12 text-erlaubt-400 ring-erlaubt-500/25',
  tolerated: 'bg-geduldet-500/12 text-geduldet-400 ring-geduldet-500/25',
  forbidden: 'bg-verboten-500/12 text-verboten-400 ring-verboten-500/25',
  unknown: 'bg-ungeklaert-500/12 text-ungeklaert-400 ring-ungeklaert-500/25',
}

const STATUS_TON = {
  allowed: 'erlaubt', tolerated: 'geduldet', forbidden: 'verboten', unknown: 'ungeklaert',
} as const

const STATUS_ICON: Record<LegalStatus, LucideIcon> = {
  allowed: ShieldCheck,
  tolerated: TriangleAlert,
  forbidden: Ban,
  unknown: CircleHelp,
}

export function StatusBadge({ status }: { status: LegalStatus }) {
  return (
    <Badge ton={STATUS_TON[status]} icon={STATUS_ICON[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  yes: 'erlaubt', no: 'verboten', conditional: 'bedingt', unknown: 'ungeklärt',
}

const PERMISSION_ICON: Record<Permission, LucideIcon> = {
  yes: Check, no: Ban, conditional: TriangleAlert, unknown: CircleHelp,
}

const PERMISSION_FARBE: Record<Permission, string> = {
  yes: 'text-erlaubt-400',
  no: 'text-verboten-400',
  conditional: 'text-geduldet-400',
  unknown: 'text-ungeklaert-400',
}

/** Eine Zeile „Zelt / Biwak — bedingt" in der Infokarte. */
export function PermissionRow({
  label, value, icon: Icon,
}: { label: string; value: Permission; icon?: LucideIcon }) {
  const Zeichen = PERMISSION_ICON[value]
  return (
    <div className="flex items-center justify-between gap-3 border-b border-kante py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-fliess text-ink-300">
        {Icon && <Icon size={15} strokeWidth={1.75} className="text-ink-500" aria-hidden />}
        {label}
      </span>
      <span className={`flex items-center gap-1.5 text-fliess font-medium ${PERMISSION_FARBE[value]}`}>
        <Zeichen size={14} strokeWidth={2.5} aria-hidden />
        {PERMISSION_LABEL[value]}
      </span>
    </div>
  )
}

/**
 * Der wichtigste Vertrauensbaustein: zeigt, wie gut eine Angabe belegt ist.
 * Eine abgeleitete Einstufung darf nie aussehen wie eine belegte.
 *
 * Die Beschriftung beschreibt die *Angabe*, nicht den Arbeitsstand des
 * Projekts: „Nicht amtlich belegt" sagt einem Nutzer, wie viel er auf die
 * Farbe geben kann. „Entwurf" sagte ihm nur, dass hier jemand noch arbeitet.
 */
export function ReviewBadge({
  status, lastVerified,
}: { status: ReviewStatus; lastVerified: string | null }) {
  const karte = {
    entwurf: { text: 'Nicht amtlich belegt', ton: 'warnung', icon: FileWarning },
    quelle: { text: 'Amtlich belegt', ton: 'akzent', icon: ShieldCheck },
    'vor-ort': { text: 'Vor Ort geprüft', ton: 'erlaubt', icon: MapPinCheck },
  }[status] as { text: string; ton: 'warnung' | 'akzent' | 'erlaubt'; icon: LucideIcon }

  return (
    <Badge ton={karte.ton} icon={karte.icon}>
      {karte.text}
      {lastVerified && (
        <span className="font-normal normal-case tracking-normal opacity-70">
          · Stand {lastVerified}
        </span>
      )}
    </Badge>
  )
}
