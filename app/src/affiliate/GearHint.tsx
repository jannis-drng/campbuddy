/**
 * SCHICHT 3 im UI — Brücke von der Zone zur Tourplanung.
 *
 * Zeigt in der Infokarte an, worauf es bei dieser Rechtslage ausrüstungsseitig
 * ankommt, und führt für die vollständige Liste in den Generator.
 */
import { Ban, Backpack, ArrowRight } from 'lucide-react'
import type { LegalStatus } from '../data/types'
import { Button, Label } from '../ui'
import { GEAR_ITEMS } from './gearItems'

/** Was die jeweilige Rechtslage praktisch für die Ausrüstung bedeutet. */
const HINT_BY_STATUS: Record<LegalStatus, { text: string; items: string[] } | null> = {
  forbidden: null,
  allowed: {
    text: 'Hier darfst du regulär übernachten - Zelt und Kocher sind unproblematisch.',
    items: ['leichtzelt', 'schlafsack-3jahres', 'isomatte', 'gaskocher'],
  },
  tolerated: {
    text: 'Geduldet heisst: unauffällig bleiben. Spät aufbauen, früh abbauen, keine Spuren - dafür ist ein Biwaksack besser geeignet als ein auffälliges Zelt.',
    items: ['biwaksack', 'isomatte', 'gaskocher', 'muellbeutel'],
  },
  unknown: {
    text: 'Solange die Lage ungeklärt ist, plane so, als wärst du auf dich gestellt: unauffällig, autark, ohne Feuer.',
    items: ['biwaksack', 'gaskocher', 'wasserfilter', 'muellbeutel'],
  },
}

export function GearHint({ status, onOpenPlanner }: { status: LegalStatus; onOpenPlanner: () => void }) {
  const hinweis = HINT_BY_STATUS[status]

  if (!hinweis) {
    return (
      <section className="flex gap-2.5 rounded-mittel border border-kante bg-flaeche-1 px-3 py-2.5">
        <Ban size={15} strokeWidth={2} className="mt-px shrink-0 text-verboten-400" aria-hidden />
        <p className="text-klein leading-relaxed text-ink-400">
          Hier ist Übernachten untersagt - deshalb gibt es an dieser Stelle bewusst keine
          Ausrüstungsempfehlung. Such dir einen Platz ausserhalb der Zone.
        </p>
      </section>
    )
  }

  const teile = hinweis.items
    .map((id) => GEAR_ITEMS.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => g != null)

  return (
    <section className="rounded-gross border border-kante bg-flaeche-1 p-3.5">
      <Label className="mb-1.5 flex items-center gap-1.5">
        <Backpack size={12} strokeWidth={2} aria-hidden />
        Was das für die Ausrüstung heisst
      </Label>
      <p className="text-klein leading-relaxed text-ink-400">{hinweis.text}</p>

      <ul className="mt-3 space-y-1.5">
        {teile.map((teil) => (
          <li key={teil.id} className="flex items-baseline justify-between gap-3 text-klein">
            <span className="text-ink-200">{teil.name}</span>
            <span className="shrink-0 text-ink-500">{teil.price_hint ?? '-'}</span>
          </li>
        ))}
      </ul>

      <Button variante="sekundaer" breit icon={ArrowRight} onClick={onOpenPlanner} className="mt-3.5">
        Vollständige Packliste
      </Button>
    </section>
  )
}
