/**
 * Die Packliste als Checkliste.
 *
 * Sie war eine Aufzählung: hier ist, was du brauchst. Das beantwortet die
 * Frage nicht, die vor einer Tour tatsächlich ansteht — was davon liegt schon
 * im Keller, was muss ich noch besorgen, was lasse ich diesmal weg. Genau das
 * steht jetzt an jedem Teil, und weil man die Liste über Wochen immer wieder
 * aufschlägt, wird der Stand mit der Tour gespeichert (Migration 0021).
 *
 * Weggelassene Teile zählen nicht mehr ins Gewicht. Das ist der eigentliche
 * Nutzen der drei Zustände: das Traggewicht ist danach das eigene, nicht das
 * eines gedachten Rucksacks.
 */
import { Check, ExternalLink, Minus, ShoppingBag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { buildAffiliateUrl } from '../affiliate/affiliateConfig'
import { formatWeight, type Packlist, type PackStand, type PackStaende } from '../affiliate/packlist'

const STUFEN: { stand: PackStand; label: string; kurz: string; icon: LucideIcon }[] = [
  { stand: 'habe', label: 'Habe ich schon', kurz: 'Habe', icon: Check },
  { stand: 'brauche', label: 'Muss ich noch besorgen', kurz: 'Brauche', icon: ShoppingBag },
  { stand: 'weglassen', label: 'Nehme ich nicht mit', kurz: 'Weg', icon: Minus },
]

const TON: Record<PackStand, string> = {
  habe: 'bg-erlaubt-500/15 text-erlaubt-400 ring-erlaubt-500/35',
  brauche: 'bg-gletscher-500/18 text-gletscher-200 ring-gletscher-500/40',
  weglassen: 'bg-flaeche-3 text-ink-400 ring-kante-stark',
}

interface Props {
  packlist: Packlist
  staende: PackStaende
  /** `null` als Stand setzt ein Teil auf unentschieden zurück. */
  onStand: (id: string, stand: PackStand | null) => void
  personen: number
}

export function Packliste({ packlist, staende, onStand, personen }: Props) {
  const alle = packlist.categories.flatMap((c) => c.entries)
  const zaehle = (stand: PackStand) => alle.filter((e) => staende[e.item.id] === stand).length
  const habe = zaehle('habe')
  const brauche = zaehle('brauche')
  const weg = zaehle('weglassen')

  // Was tatsächlich mitkommt — Weggelassenes wiegt nichts.
  const getragen = alle
    .filter((e) => staende[e.item.id] !== 'weglassen')
    .reduce((summe, e) => summe + (e.weight_g ?? 0), 0)

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-fliess font-semibold text-ink-200">Packliste</h3>
        <span className="text-klein text-ink-500">
          {formatWeight(getragen)} für {personen} {personen === 1 ? 'Person' : 'Personen'}
          {weg > 0 && ` · ${weg} weggelassen`}
        </span>
      </div>

      {/*
        Die eine Zahl, für die man die Liste aufschlägt, wenn die Tour näher
        rückt: was fehlt noch.
      */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-mittel bg-flaeche-1 px-3 py-2 text-klein">
        <span className="text-erlaubt-400">{habe} hast du</span>
        <span className={brauche > 0 ? 'text-gletscher-300' : 'text-ink-500'}>
          {brauche} {brauche === 1 ? 'fehlt' : 'fehlen'} noch
        </span>
        <span className="text-ink-500">{alle.length - habe - brauche - weg} offen</span>
      </div>

      <div className="space-y-4">
        {packlist.categories.map(({ category, entries }) => (
          <div key={category}>
            <h4 className="mb-1 text-mikro uppercase text-ink-500">{category}</h4>
            <ul className="divide-y divide-kante rounded-mittel border border-kante">
              {entries.map(({ item, quantity, weight_g }) => {
                const stand = staende[item.id]
                const url = buildAffiliateUrl(item.vendor, item.affiliate_url)
                return (
                  <li
                    key={item.id}
                    className={`p-3 transition-opacity duration-[160ms] ${
                      stand === 'weglassen' ? 'opacity-45' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className={`font-medium text-ink-50 ${stand === 'weglassen' ? 'line-through' : ''}`}>
                        {quantity > 1 && <span className="text-ink-400">{quantity}× </span>}
                        {item.name}
                        {item.essential && (
                          <span className="ml-2 rounded bg-geduldet-500/15 px-1.5 py-0.5 text-mikro text-geduldet-300">
                            wichtig
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-klein text-ink-500">
                        {weight_g != null && `${formatWeight(weight_g)} · `}
                        {item.price_hint ?? '-'}
                      </span>
                    </div>
                    <p className="mt-1 text-klein leading-relaxed text-ink-400">{item.rationale}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {STUFEN.map((s) => {
                        const an = stand === s.stand
                        return (
                          <button
                            key={s.stand}
                            // Nochmal auf denselben Stand tippen macht ihn rückgängig —
                            // ein versehentliches „weglassen" wäre sonst nicht zu lösen.
                            onClick={() => onStand(item.id, an ? null : s.stand)}
                            aria-pressed={an}
                            title={s.label}
                            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5
                                        text-klein font-medium ring-1 transition-colors duration-[160ms]
                                        ${an ? TON[s.stand]
                                             : 'bg-flaeche-1 text-ink-500 ring-kante hover:bg-flaeche-3 hover:text-ink-200'}`}
                          >
                            <s.icon size={13} strokeWidth={2.5} aria-hidden />
                            {s.kurz}
                          </button>
                        )
                      })}
                      {url && (
                        <a
                          href={url} target="_blank" rel="noreferrer noopener sponsored"
                          className="ml-auto text-klein text-gletscher-400 hover:underline"
                        >
                          Zum Produkt <ExternalLink size={11} strokeWidth={2.5} className="inline" aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
