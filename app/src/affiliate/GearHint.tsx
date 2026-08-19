/**
 * SCHICHT 3 im UI — vorbereitet, nicht angebunden (Abschnitt 7).
 *
 * Zeigt die Ausrüstungs-Ebene bereits sichtbar an, aber ohne Fantasie-Links:
 * solange keine Partner-ID hinterlegt ist, steht dort ehrlich "bald verfügbar".
 */
import { useState } from 'react'
import type { LegalStatus } from '../data/types'
import { buildAffiliateUrl } from './affiliateConfig'
import { suggestGear } from './gearItems'

export function GearHint({ status }: { status: LegalStatus }) {
  const [open, setOpen] = useState(false)
  const items = suggestGear(status)
  if (items.length === 0) return null

  return (
    <section className="rounded-lg border border-white/10 bg-white/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-200"
        aria-expanded={open}
      >
        Passende Ausrüstung
        <span className="text-xs font-normal text-slate-500">{open ? 'schliessen' : `${items.length} Vorschläge`}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/10 px-3 py-3">
          {items.map((item) => {
            const url = buildAffiliateUrl(item.vendor, item.affiliate_url)
            return (
              <div key={item.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-100">{item.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{item.price_hint}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{item.rationale}</p>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer noopener sponsored"
                     className="mt-1 inline-block text-xs text-sky-400 hover:underline">
                    Zum Produkt ↗
                  </a>
                ) : (
                  <span className="mt-1 inline-block rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-500">
                    Kauf-Link bald verfügbar
                  </span>
                )}
              </div>
            )
          })}
          <p className="border-t border-white/10 pt-2 text-[11px] leading-relaxed text-slate-500">
            Der Ausrüstungs-Generator [BALD] baut auf dieser Ebene auf. Kauf-Links werden künftig
            Provisionslinks sein — sie werden dann als solche gekennzeichnet.
          </p>
        </div>
      )}
    </section>
  )
}
