/**
 * SCHICHT 3 im UI — Brücke von der Zone zur Tourplanung.
 *
 * Zeigt in der Infokarte an, worauf es bei dieser Rechtslage ausrüstungsseitig
 * ankommt, und führt für die vollständige Liste in den Generator.
 */
import type { LegalStatus } from '../data/types'
import { GEAR_ITEMS } from './gearItems'

/** Was die jeweilige Rechtslage praktisch für die Ausrüstung bedeutet. */
const HINT_BY_STATUS: Record<LegalStatus, { text: string; items: string[] } | null> = {
  forbidden: null,
  allowed: {
    text: 'Hier darfst du regulär übernachten — Zelt und Kocher sind unproblematisch.',
    items: ['leichtzelt', 'schlafsack-3jahres', 'isomatte', 'gaskocher'],
  },
  tolerated: {
    text: 'Geduldet heisst: unauffällig bleiben. Spät aufbauen, früh abbauen, keine Spuren — dafür ist ein Biwaksack besser geeignet als ein auffälliges Zelt.',
    items: ['biwaksack', 'isomatte', 'gaskocher', 'muellbeutel'],
  },
  unknown: {
    text: 'Solange die Lage ungeklärt ist, plane so, als wärst du auf dich gestellt: unauffällig, autark, ohne Feuer.',
    items: ['biwaksack', 'gaskocher', 'wasserfilter', 'muellbeutel'],
  },
}

export function GearHint({ status, onOpenPlanner }: { status: LegalStatus; onOpenPlanner: () => void }) {
  const hint = HINT_BY_STATUS[status]

  if (!hint) {
    return (
      <section className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-relaxed text-slate-400">
        Hier ist Übernachten untersagt — deshalb gibt es an dieser Stelle bewusst keine
        Ausrüstungsempfehlung. Such dir einen Platz ausserhalb der Zone.
      </section>
    )
  }

  const items = hint.items
    .map((id) => GEAR_ITEMS.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => g != null)

  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-3">
      <h3 className="text-sm font-semibold text-slate-200">Was das für die Ausrüstung heisst</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint.text}</p>

      <ul className="mt-2.5 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-200">{item.name}</span>
            <span className="shrink-0 text-slate-500">{item.price_hint ?? '—'}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onOpenPlanner}
        className="mt-3 min-h-9 w-full rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
      >
        Vollständige Packliste erzeugen →
      </button>
    </section>
  )
}
