/**
 * Haftungshinweis [FUNDAMENT] — Abschnitt 9 der Spezifikation.
 *
 * Bewusst nicht wegklickbar an der Karte, zusätzlich in jeder Infokarte
 * wiederholt. Gestalterisch aber zurückgenommen: eine Dauerwarnung, die
 * schreit, wird nach dem dritten Besuch übersehen.
 *
 * Deshalb ein schmales Band statt eines Kastens — ein Satz in Kleinschrift,
 * die ganze Zeile ist der Schalter zum Ausführlichen. Der Satz „Prüfe die Lage
 * vor Ort" steht erst ab Tablet daneben: auf 375 px kostete er eine zweite
 * Zeile, und er sagt dasselbe wie das Wort davor. Was er erklärt, steht
 * ausgeklappt vollständig da.
 *
 * Prominent bleibt der Hinweis trotzdem: er sitzt über der Karte, in der
 * Warnfarbe, auf jeder Ansicht, und lässt sich nicht schliessen. Klein heisst
 * hier gedrängt, nicht versteckt.
 */
import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'

export function DisclaimerBar() {
  const [offen, setOffen] = useState(false)

  return (
    <div className="shrink-0 border-b border-geduldet-500/15 bg-geduldet-500/[0.06]">
      {/*
        Die ganze Zeile schaltet, nicht bloss ein Wort am rechten Rand. Das
        Ziel war vorher rund 100 px breit in einer 375 px breiten Leiste.
      */}
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-left
                   transition-colors duration-[160ms] hover:bg-geduldet-500/[0.06]"
      >
        <Info size={13} strokeWidth={2} className="shrink-0 text-geduldet-400" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-mikro normal-case tracking-normal text-geduldet-400">
          <span className="font-semibold">Orientierungshilfe, keine Rechtsgarantie.</span>
          <span className="hidden text-geduldet-400/70 sm:inline"> Prüfe die Lage vor Ort.</span>
        </p>
        <span className="hidden shrink-0 text-mikro font-medium text-geduldet-400/80 sm:inline">
          {offen ? 'Weniger' : 'Was heisst das?'}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          aria-hidden
          className={`shrink-0 text-geduldet-400/80 transition-transform duration-[160ms]
                      ease-[var(--ease-heraus)] ${offen ? 'rotate-180' : ''}`}
        />
      </button>

      {offen && (
        <div className="mx-auto max-w-6xl space-y-2 px-4 pb-3 pl-9 text-klein leading-relaxed text-geduldet-400/85">
          <p>
            CampBuddy stellt Rechtsinformationen dar und ersetzt keine Rechtsberatung. Die
            Einstufung einer Fläche kann sich durch neue Verordnungen, saisonale Verbote
            (Waldbrandgefahr, Wildruhezonen im Winter) oder Gemeindebeschlüsse jederzeit ändern.
          </p>
          <p>
            Angaben ohne benannte Quelle sind aus dem allgemeinen Rechtsrahmen abgeleitet und
            <strong className="font-semibold"> nicht amtlich bestätigt</strong>. Jede Fläche zeigt
            offen an, wie gut sie belegt ist. Beschilderung vor Ort und Auskünfte von Gemeinde
            oder Wildhut gehen dieser Karte immer vor.
          </p>
        </div>
      )}
    </div>
  )
}
