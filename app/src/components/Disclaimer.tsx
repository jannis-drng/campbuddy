/**
 * Haftungshinweis [FUNDAMENT] — Abschnitt 9 der Spezifikation.
 * Bewusst nicht wegklickbar an der Karte, zusätzlich in jeder Infokarte wiederholt.
 */
import { useState } from 'react'

export function DisclaimerBar() {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[13px] text-amber-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1">
        <strong className="font-semibold">Orientierungshilfe, keine Rechtsgarantie.</strong>
        <span className="text-amber-200/80">Prüfe die Lage immer vor Ort.</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto shrink-0 rounded px-2 py-0.5 text-xs underline underline-offset-2 hover:bg-amber-500/15"
        >
          {open ? 'weniger' : 'Was heisst das?'}
        </button>
      </div>
      {open && (
        <div className="mx-auto mt-2 max-w-6xl space-y-2 text-[13px] leading-relaxed text-amber-100/90">
          <p>
            CampBuddy stellt Rechtsinformationen dar und ersetzt keine Rechtsberatung. Die Einstufung einer
            Fläche kann sich durch neue Verordnungen, saisonale Verbote (z.B. Waldbrandgefahr, Wildruhezonen
            im Winter) oder Gemeindebeschlüsse jederzeit ändern.
          </p>
          <p>
            Angaben ohne Prüfdatum sind aus dem allgemeinen Rechtsrahmen abgeleitet und
            <strong> nicht amtlich bestätigt</strong>. Jede Zone zeigt ihren Prüfstand offen an. Beschilderung
            vor Ort und Auskünfte der Gemeinde oder Wildhut gehen dieser Karte immer vor.
          </p>
        </div>
      )}
    </div>
  )
}
