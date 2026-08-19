/**
 * Einstieg in die Region: der allgemeine Rechtsrahmen als Kontext, bevor
 * jemand einzelne Flächen anklickt. Ohne diesen Rahmen wäre eine Karte mit
 * wenigen eingezeichneten Zonen leicht misszuverstehen ("überall sonst = erlaubt").
 */
import { useState } from 'react'
import type { Region } from '../data/types'
import { STATUS_LABEL } from './ui'

export function RegionIntro({ region, stats }: { region: Region; stats: { total: number; entwurf: number } }) {
  const [open, setOpen] = useState(true)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 z-10 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-lg backdrop-blur hover:bg-slate-800"
      >
        ℹ️ Rechtslage {region.name}
      </button>
    )
  }

  return (
    <div className="absolute left-3 top-3 z-10 max-w-sm rounded-xl border border-white/10 bg-slate-900/93 p-4 text-slate-100 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{region.name}</h2>
          <p className="text-xs text-slate-400">{region.country}</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Schliessen"
                className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-white/10">✕</button>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{region.legal_framework.summary}</p>

      <p className="mt-3 text-xs text-slate-400">
        Grundlage ausserhalb eingezeichneter Flächen:{' '}
        <strong className="text-slate-200">{STATUS_LABEL[region.legal_framework.baseline_status]}</strong>
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-sky-400">Rechtsgrundlagen &amp; Quellen</summary>
        <ul className="mt-2 space-y-1.5">
          {region.legal_framework.references.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer noopener"
                 className="text-xs leading-snug text-slate-300 hover:text-sky-300 hover:underline">
                {r.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-3 rounded-lg bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-200/90">
        Datenstand: {stats.total} Flächen erfasst, davon {stats.entwurf} noch nicht amtlich geprüft.
        Ungeprüfte Flächen haben einen gestrichelten Rand.
      </p>
    </div>
  )
}
