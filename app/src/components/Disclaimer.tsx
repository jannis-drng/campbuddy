/**
 * Haftungshinweis [FUNDAMENT] — Abschnitt 9 der Spezifikation.
 *
 * Bewusst nicht wegklickbar an der Karte, zusätzlich in jeder Infokarte
 * wiederholt. Gestalterisch aber zurückgenommen: eine Dauerwarnung, die
 * schreit, wird nach dem dritten Besuch übersehen.
 */
import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'

export function DisclaimerBar() {
  const [offen, setOffen] = useState(false)

  return (
    <div className="shrink-0 border-b border-geduldet-500/15 bg-geduldet-500/[0.06]">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2">
        <Info size={14} strokeWidth={2} className="shrink-0 text-geduldet-400" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-klein text-geduldet-400">
          <span className="font-semibold">Orientierungshilfe, keine Rechtsgarantie.</span>{' '}
          <span className="text-geduldet-400/70">Prüfe die Lage vor Ort.</span>
        </p>
        <button
          onClick={() => setOffen((v) => !v)}
          aria-expanded={offen}
          className="flex shrink-0 items-center gap-1 rounded-klein px-1.5 py-0.5 text-mikro font-medium
                     text-geduldet-400/80 transition-colors duration-[160ms] hover:bg-geduldet-500/10 hover:text-geduldet-400"
        >
          {offen ? 'Weniger' : 'Was heisst das?'}
          <ChevronDown
            size={13}
            strokeWidth={2.5}
            aria-hidden
            className={`transition-transform duration-[160ms] ease-[var(--ease-heraus)] ${offen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {offen && (
        <div className="mx-auto max-w-6xl space-y-2 px-4 pb-3 pl-10 text-klein leading-relaxed text-geduldet-400/85">
          <p>
            CampBuddy stellt Rechtsinformationen dar und ersetzt keine Rechtsberatung. Die
            Einstufung einer Fläche kann sich durch neue Verordnungen, saisonale Verbote
            (Waldbrandgefahr, Wildruhezonen im Winter) oder Gemeindebeschlüsse jederzeit ändern.
          </p>
          <p>
            Angaben ohne Prüfdatum sind aus dem allgemeinen Rechtsrahmen abgeleitet und
            <strong className="font-semibold"> nicht amtlich bestätigt</strong>. Jede Zone zeigt
            ihren Prüfstand offen an. Beschilderung vor Ort und Auskünfte von Gemeinde oder
            Wildhut gehen dieser Karte immer vor.
          </p>
        </div>
      )}
    </div>
  )
}
