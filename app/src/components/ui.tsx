/** Kleine, geteilte Darstellungs-Bausteine. Keine Logik, keine Datenkenntnis. */
import type { LegalStatus, Permission, ReviewStatus } from '../data/types'

export const STATUS_LABEL: Record<LegalStatus, string> = {
  allowed: 'Erlaubt',
  tolerated: 'Geduldet / Grauzone',
  forbidden: 'Verboten',
  unknown: 'Ungeklärt',
}

export const STATUS_CLASS: Record<LegalStatus, string> = {
  allowed: 'bg-green-500/15 text-green-300 ring-green-500/30',
  tolerated: 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/30',
  forbidden: 'bg-red-500/15 text-red-300 ring-red-500/30',
  unknown: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  yes: 'erlaubt',
  no: 'verboten',
  conditional: 'bedingt',
  unknown: 'ungeklärt',
}

const PERMISSION_ICON: Record<Permission, string> = {
  yes: '✓', no: '✕', conditional: '!', unknown: '?',
}

const PERMISSION_CLASS: Record<Permission, string> = {
  yes: 'text-green-400',
  no: 'text-red-400',
  conditional: 'text-yellow-400',
  unknown: 'text-slate-400',
}

export function StatusBadge({ status }: { status: LegalStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PermissionRow({ label, value }: { label: string; value: Permission }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 text-sm last:border-0">
      <span className="text-slate-300">{label}</span>
      <span className={`flex items-center gap-1.5 font-medium ${PERMISSION_CLASS[value]}`}>
        <span aria-hidden className="w-4 text-center">{PERMISSION_ICON[value]}</span>
        {PERMISSION_LABEL[value]}
      </span>
    </div>
  )
}

/**
 * Der wichtigste Vertrauensbaustein: zeigt schonungslos, wie gut eine Angabe
 * belegt ist. Ein Entwurf darf nie aussehen wie eine geprüfte Auskunft.
 */
export function ReviewBadge({ status, lastVerified }: { status: ReviewStatus; lastVerified: string | null }) {
  const map = {
    entwurf: { text: 'Entwurf — nicht amtlich geprüft', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
    quelle: { text: 'Mit Quelle belegt', cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
    'vor-ort': { text: 'Vor Ort verifiziert', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  }[status]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ring-1 ${map.cls}`}>
      {map.text}
      {lastVerified ? <span className="opacity-70">· Stand {lastVerified}</span> : <span className="opacity-70">· kein Prüfdatum</span>}
    </span>
  )
}
