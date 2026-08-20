/**
 * Einstieg in die Region: der allgemeine Rechtsrahmen als Kontext, bevor
 * jemand einzelne Flächen anklickt. Ohne diesen Rahmen wäre eine Karte mit
 * wenigen eingezeichneten Zonen leicht misszuverstehen („überall sonst = erlaubt").
 */
import { useState } from 'react'
import { ChevronRight, ExternalLink, FileWarning, Scale, X } from 'lucide-react'
import type { Region } from '../data/types'
import { IconButton, Label } from '../ui'
import { STATUS_LABEL } from './ui'

export function RegionIntro({
  region, stats, quelle,
}: {
  region: Region
  stats: { total: number; entwurf: number }
  /** Woher die angezeigten Zonen stammen — Transparenz über den Datenstand. */
  quelle: 'gebündelt' | 'datenbank'
}) {
  // Auf dem Telefon eingeklappt starten — ein bildfüllendes Erklärpanel vor
  // der Karte ist dort mehr Hindernis als Hilfe.
  const [offen, setOffen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 640px)').matches,
  )
  const [quellenOffen, setQuellenOffen] = useState(false)

  if (!offen) {
    return (
      <button
        onClick={() => setOffen(true)}
        className="absolute left-3 top-3 z-10 flex h-9 items-center gap-2 rounded-mittel border
                   border-kante bg-flaeche-2/92 px-3 text-klein font-medium text-ink-200
                   shadow-[var(--shadow-2)] backdrop-blur-md transition-colors duration-[160ms]
                   hover:bg-flaeche-3 hover:text-ink-50"
      >
        <Scale size={14} strokeWidth={2} className="text-gletscher-400" aria-hidden />
        Rechtslage {region.name}
      </button>
    )
  }

  return (
    <aside
      className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-5.5rem)] w-[min(23rem,calc(100%-1.5rem))]
                 flex-col overflow-hidden rounded-gross border border-kante bg-flaeche-2/94
                 shadow-[var(--shadow-3)] backdrop-blur-md"
      aria-label={`Rechtslage ${region.name}`}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <h2 className="text-titel font-semibold text-ink-50">{region.name}</h2>
          <p className="mt-0.5 text-mikro normal-case tracking-normal text-ink-500">{region.country}</p>
        </div>
        <IconButton icon={X} label="Schliessen" groesse="klein" onClick={() => setOffen(false)} className="-mr-1.5 -mt-1" />
      </header>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 pb-4">
        <p className="text-klein leading-relaxed text-ink-300">{region.legal_framework.summary}</p>

        {/* Die wichtigste einzelne Aussage des Panels — deshalb als eigene Fläche. */}
        <div className="rounded-mittel border border-kante bg-flaeche-1 px-3 py-2.5">
          <Label>Ausserhalb eingezeichneter Flächen gilt</Label>
          <p className="mt-1 text-ueberschrift font-semibold text-ink-50">
            {STATUS_LABEL[region.legal_framework.baseline_status]}
          </p>
        </div>

        <div>
          <button
            onClick={() => setQuellenOffen((v) => !v)}
            aria-expanded={quellenOffen}
            className="flex items-center gap-1 text-klein font-medium text-gletscher-400
                       transition-colors duration-[160ms] hover:text-gletscher-300"
          >
            <ChevronRight
              size={14} strokeWidth={2.5} aria-hidden
              className={`transition-transform duration-[160ms] ease-[var(--ease-heraus)] ${quellenOffen ? 'rotate-90' : ''}`}
            />
            Rechtsgrundlagen &amp; Quellen
          </button>
          {quellenOffen && (
            <ul className="mt-2 space-y-2 pl-5">
              {region.legal_framework.references.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url} target="_blank" rel="noreferrer noopener"
                    className="group flex items-start gap-1.5 text-klein leading-snug text-ink-400
                               transition-colors duration-[160ms] hover:text-gletscher-300"
                  >
                    <span className="min-w-0">{r.label}</span>
                    <ExternalLink size={12} strokeWidth={2} aria-hidden
                                  className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2.5 rounded-mittel border border-geduldet-500/20 bg-geduldet-500/[0.07] px-3 py-2.5">
          <FileWarning size={15} strokeWidth={2} className="mt-px shrink-0 text-geduldet-400" aria-hidden />
          <p className="text-mikro normal-case leading-relaxed tracking-normal text-geduldet-400/90">
            {stats.total} Flächen erfasst, davon <strong className="font-semibold">{stats.entwurf} ungeprüft</strong>.
            Ungeprüfte Flächen haben einen gestrichelten Rand.
            {quelle === 'datenbank' && ' Aktuelle Fassung aus der Datenbank.'}
          </p>
        </div>
      </div>
    </aside>
  )
}
