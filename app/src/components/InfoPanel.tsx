/**
 * Die Infokarte — das Herz der Kartenansicht.
 *
 * Reihenfolge bewusst: erst der Status als grösstes Element, dann was konkret
 * gilt, dann unter welchen Bedingungen, dann woher die Angabe stammt und wie
 * gut sie belegt ist. Die Quelle steht unten, aber sie steht immer da.
 */
import { Building2, ExternalLink, Flame, MapPin, Mountain, Phone, Tent, Truck, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Point, Zone } from '../data/types'
import { Button, IconButton, Label } from '../ui'
import { PermissionRow, ReviewBadge, StatusBadge } from './ui'
import { GearHint } from '../affiliate/GearHint'

export type Selection =
  | { kind: 'zone'; zone: Zone }
  | { kind: 'point'; point: Point }
  | null

const PUNKT_ART: Record<Point['type'], { label: string; icon: LucideIcon }> = {
  hut: { label: 'Berghütte', icon: Building2 },
  campsite: { label: 'Campingplatz', icon: Tent },
  vehicle_spot: { label: 'Stellplatz', icon: Truck },
}

interface InfoPanelProps {
  selection: Selection
  onClose: () => void
  onOpenPlanner: () => void
}

export function InfoPanel({ selection, onClose, onOpenPlanner }: InfoPanelProps) {
  if (!selection) return null

  const kopf = selection.kind === 'zone'
    ? { art: 'Zone', icon: MapPin, titel: selection.zone.name }
    : { art: PUNKT_ART[selection.point.type].label, icon: PUNKT_ART[selection.point.type].icon, titel: selection.point.name }
  const KopfIcon = kopf.icon

  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[72vh] flex-col rounded-t-riesig border
                 border-kante bg-flaeche-2/97 shadow-[var(--shadow-4)] backdrop-blur-md
                 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-gross"
      aria-label="Details"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-kante px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-mikro font-medium uppercase text-ink-500">
            <KopfIcon size={12} strokeWidth={2} aria-hidden />
            {kopf.art}
          </p>
          <h2 className="mt-1 text-titel font-semibold leading-tight text-ink-50">{kopf.titel}</h2>
        </div>
        <IconButton icon={X} label="Schliessen" onClick={onClose} className="-mr-1.5 -mt-1" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selection.kind === 'zone'
          ? <ZoneBody zone={selection.zone} onOpenPlanner={onOpenPlanner} />
          : <PointBody point={selection.point} />}
      </div>
    </aside>
  )
}

function ZoneBody({ zone, onOpenPlanner }: { zone: Zone; onOpenPlanner: () => void }) {
  return (
    <div className="space-y-5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={zone.status} />
        <ReviewBadge status={zone.review_status} lastVerified={zone.last_verified} />
      </div>

      <section>
        <Label className="mb-1">Was gilt hier</Label>
        <PermissionRow label="Zelt / Biwak" value={zone.tent_allowed} icon={Tent} />
        <PermissionRow label="Auto / Camper" value={zone.vehicle_allowed} icon={Truck} />
        <PermissionRow label="Offenes Feuer" value={zone.fire_allowed} icon={Flame} />
      </section>

      {zone.conditions && (
        <section>
          <Label className="mb-1.5">Bedingungen</Label>
          <p className="text-klein leading-relaxed text-ink-300">{zone.conditions}</p>
        </section>
      )}

      {zone.notes && (
        <section>
          <Label className="mb-1.5">Hinweise</Label>
          <p className="text-klein leading-relaxed text-ink-400">{zone.notes}</p>
        </section>
      )}

      <GearHint status={zone.status} onOpenPlanner={onOpenPlanner} />

      <QuellenBlock
        source={zone.source}
        url={zone.source_url}
        lastVerified={zone.last_verified}
        nurGeometrie
      />

      <p className="rounded-mittel border border-geduldet-500/20 bg-geduldet-500/[0.07] px-3 py-2.5
                    text-mikro normal-case leading-relaxed tracking-normal text-geduldet-400/90">
        Orientierungshilfe, keine Rechtsgarantie. Beschilderung vor Ort und Auskünfte von
        Gemeinde oder Wildhut gehen dieser Angabe vor.
      </p>
    </div>
  )
}

function PointBody({ point }: { point: Point }) {
  const zeilen = ([
    ['Betreiber', point.info.operator, Building2],
    ['Kapazität', point.info.capacity, Users],
    ['Öffnung', point.info.opening_hours ?? point.info.seasonal, null],
    ['Telefon', point.info.phone, Phone],
    ['Höhe', point.elevation ? `${point.elevation} m` : null, Mountain],
  ] as [string, string | null | undefined, LucideIcon | null][]).filter(([, v]) => v)

  return (
    <div className="space-y-5 px-5 py-4">
      {zeilen.length > 0 ? (
        <section>
          {zeilen.map(([label, wert, Icon]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-kante py-2.5 last:border-0">
              <span className="flex items-center gap-2 text-fliess text-ink-400">
                {Icon && <Icon size={15} strokeWidth={1.75} className="text-ink-500" aria-hidden />}
                {label}
              </span>
              <span className="text-right text-fliess font-medium text-ink-100">{wert}</span>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-klein leading-relaxed text-ink-400">
          Zu diesem Punkt liegen ausser Name und Lage noch keine Angaben vor.
        </p>
      )}

      {point.info.website && (
        <Button
          variante="sekundaer"
          icon={ExternalLink}
          onClick={() => window.open(point.info.website!, '_blank', 'noopener,noreferrer')}
        >
          Website öffnen
        </Button>
      )}

      <p className="font-mono text-mikro normal-case tracking-normal text-ink-500">
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </p>

      <QuellenBlock source={point.source} url={point.source_url} lastVerified={point.last_verified} />
    </div>
  )
}

/** Quelle + Stand bei jeder Angabe [FUNDAMENT] — Abschnitt 9. */
function QuellenBlock({
  source, url, lastVerified, nurGeometrie = false,
}: { source: string | null; url: string | null; lastVerified: string | null; nurGeometrie?: boolean }) {
  return (
    <section className="rounded-mittel border border-kante bg-flaeche-1 px-3 py-2.5">
      <Label className="mb-1.5">Quelle &amp; Stand</Label>
      <p className="text-mikro normal-case leading-relaxed tracking-normal text-ink-400">
        {nurGeometrie ? 'Geometrie: ' : 'Daten: '}
        {source ?? 'keine Angabe'}
        {url && (
          <>
            {' · '}
            <a
              href={url} target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-gletscher-400 transition-colors
                         duration-[160ms] hover:text-gletscher-300"
            >
              Original <ExternalLink size={10} strokeWidth={2.5} aria-hidden />
            </a>
          </>
        )}
      </p>
      {nurGeometrie && (
        <p className="mt-1 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
          Die rechtliche Einstufung stammt nicht aus OpenStreetMap, sondern aus eigener Pflege.
        </p>
      )}
      <p className="mt-1 text-mikro normal-case tracking-normal text-ink-500">
        Eigene Prüfung: {lastVerified ?? 'noch nicht erfolgt'}
      </p>
    </section>
  )
}
