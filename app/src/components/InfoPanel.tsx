/**
 * Die Infokarte — das Herz der Ansicht [JETZT].
 *
 * Reihenfolge bewusst: erst was gilt, dann unter welchen Bedingungen,
 * dann woher die Angabe stammt und wie gut sie belegt ist.
 */
import type { Point, Zone } from '../data/types'
import { PermissionRow, ReviewBadge, StatusBadge } from './ui'
import { GearHint } from '../affiliate/GearHint'

export type Selection =
  | { kind: 'zone'; zone: Zone }
  | { kind: 'point'; point: Point }
  | null

interface InfoPanelProps {
  selection: Selection
  onClose: () => void
  onOpenPlanner: () => void
}

export function InfoPanel({ selection, onClose, onOpenPlanner }: InfoPanelProps) {
  if (!selection) return null

  return (
    <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto border-t border-white/10 bg-slate-900/97 text-slate-100 shadow-2xl backdrop-blur sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:border-l sm:border-t-0">
      <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-white/10 bg-slate-900/97 px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {selection.kind === 'zone' ? 'Zone' : POINT_LABEL[selection.point.type]}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold leading-tight">
            {selection.kind === 'zone' ? selection.zone.name : selection.point.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Infokarte schliessen"
          className="-mr-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100"
        >
          ✕
        </button>
      </div>

      {selection.kind === 'zone'
        ? <ZoneBody zone={selection.zone} onOpenPlanner={onOpenPlanner} />
        : <PointBody point={selection.point} />}
    </aside>
  )
}

const POINT_LABEL = {
  hut: 'Berghütte',
  campsite: 'Campingplatz',
  vehicle_spot: 'Stellplatz Fahrzeug',
} as const

function ZoneBody({ zone, onOpenPlanner }: { zone: Zone; onOpenPlanner: () => void }) {
  return (
    <div className="space-y-5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={zone.status} />
        <ReviewBadge status={zone.review_status} lastVerified={zone.last_verified} />
      </div>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Was gilt hier?</h3>
        <PermissionRow label="Zelt / Biwak" value={zone.tent_allowed} />
        <PermissionRow label="Auto / Camper" value={zone.vehicle_allowed} />
        <PermissionRow label="Offenes Feuer" value={zone.fire_allowed} />
      </section>

      {zone.conditions && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-200">Bedingungen</h3>
          <p className="text-sm leading-relaxed text-slate-300">{zone.conditions}</p>
        </section>
      )}

      {zone.notes && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-200">Hinweise</h3>
          <p className="text-sm leading-relaxed text-slate-400">{zone.notes}</p>
        </section>
      )}

      <SourceBlock source={zone.source} url={zone.source_url} lastVerified={zone.last_verified} isGeometryOnly />

      <GearHint status={zone.status} onOpenPlanner={onOpenPlanner} />

      <p className="rounded-lg bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200/90">
        Orientierungshilfe, keine Rechtsgarantie. Beschilderung vor Ort und Auskünfte von Gemeinde
        oder Wildhut gehen dieser Angabe vor.
      </p>
    </div>
  )
}

function PointBody({ point }: { point: Point }) {
  const rows = [
    ['Betreiber', point.info.operator],
    ['Kapazität', point.info.capacity],
    ['Öffnung', point.info.opening_hours ?? point.info.seasonal],
    ['Telefon', point.info.phone],
    ['Höhe', point.elevation ? `${point.elevation} m` : null],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <div className="space-y-5 px-5 py-4">
      {rows.length > 0 ? (
        <section>
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-white/5 py-2 text-sm last:border-0">
              <span className="text-slate-400">{label}</span>
              <span className="text-right text-slate-200">{value}</span>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-sm text-slate-400">Zu diesem Punkt liegen ausser Name und Lage noch keine Angaben vor.</p>
      )}

      {point.info.website && (
        <a
          href={point.info.website}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block rounded-lg bg-white/10 px-3 py-2 text-sm text-sky-300 hover:bg-white/15"
        >
          Website öffnen ↗
        </a>
      )}

      <p className="text-xs text-slate-500">
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </p>

      <SourceBlock source={point.source} url={point.source_url} lastVerified={point.last_verified} />
    </div>
  )
}

/** Quelle + Stand bei jeder Angabe [FUNDAMENT] — Abschnitt 9. */
function SourceBlock({
  source, url, lastVerified, isGeometryOnly = false,
}: { source: string | null; url: string | null; lastVerified: string | null; isGeometryOnly?: boolean }) {
  return (
    <section className="rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-slate-400">
      <h3 className="mb-1 font-semibold text-slate-300">Quelle &amp; Stand</h3>
      <p>
        {isGeometryOnly ? 'Geometrie: ' : 'Daten: '}
        {source ?? 'keine Angabe'}
        {url && (
          <>
            {' · '}
            <a href={url} target="_blank" rel="noreferrer noopener" className="text-sky-400 hover:underline">
              Original ansehen ↗
            </a>
          </>
        )}
      </p>
      {isGeometryOnly && (
        <p className="mt-1">
          Die rechtliche Einstufung stammt nicht aus OpenStreetMap, sondern aus eigener Pflege
          (<code className="text-slate-300">src/data/zones/*.legal.json</code>).
        </p>
      )}
      <p className="mt-1">Eigene Prüfung: {lastVerified ?? 'noch nicht erfolgt'}</p>
    </section>
  )
}
