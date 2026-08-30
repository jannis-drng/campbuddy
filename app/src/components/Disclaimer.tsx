/**
 * Haftungshinweis [FUNDAMENT] — Abschnitt 9 der Spezifikation.
 *
 * Er war ein eigenes Band unter der Kopfzeile und kostete damit dauerhaft
 * eine Zeile Kartenhöhe für einen Satz, den man einmal liest. Jetzt steht er
 * als Marke neben dem Logo: dieselbe Warnfarbe, dieselbe Aussage, aber in der
 * Zeile, die ohnehin schon da ist — die Karte beginnt eine Zeile früher.
 *
 * Auf der Marke steht nur der Satz, um den es geht. Alles Weitere — was sich
 * ändern kann, was ein fehlender Beleg heisst, was vor Ort gilt — klappt
 * darunter auf. Das ist kein Verstecken: der Hinweis ist auf jeder Ansicht
 * sichtbar, nicht schliessbar, und in jeder Infokarte steht er noch einmal
 * bei der Fläche, um die es gerade geht.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'

export function Haftungshinweis({ className = '' }: { className?: string }) {
  const [offen, setOffen] = useState(false)
  const huelle = useRef<HTMLDivElement>(null)

  // Escape und ein Klick daneben schliessen — beides erwartet man von einer
  // Blase, und ohne sie bliebe sie auf dem Telefon über der Karte stehen.
  useEffect(() => {
    if (!offen) return
    const beiTaste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false) }
    const beiZeiger = (e: PointerEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setOffen(false)
    }
    window.addEventListener('keydown', beiTaste)
    window.addEventListener('pointerdown', beiZeiger)
    return () => {
      window.removeEventListener('keydown', beiTaste)
      window.removeEventListener('pointerdown', beiZeiger)
    }
  }, [offen])

  return (
    <div ref={huelle} className={`relative min-w-0 ${className}`}>
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className={`flex h-7 min-w-0 items-center gap-1.5 rounded-full border
                    border-geduldet-500/25 px-2 text-mikro font-medium normal-case sm:px-2.5
                    tracking-normal text-geduldet-400 transition-colors duration-[160ms]
                    hover:bg-geduldet-500/[0.12]
                    ${offen ? 'bg-geduldet-500/[0.14]' : 'bg-geduldet-500/[0.07]'}`}
      >
        <Info size={12} strokeWidth={2.25} className="shrink-0" aria-hidden />
        {/*
          Auf dem Telefon nur das erste Wort. Zwischen Logo und „Unterstütze
          uns" bleiben dort rund 145 px; der ganze Satz passte nur, wenn eines
          von beiden weichen musste — und ein abgeschnittenes „…keine
          Rechtsg…" ist schlechter als ein ganzes Wort. Der vollständige Satz
          steht als erste Zeile in der Blase, einen Tipp entfernt.
        */}
        <span className="truncate sm:hidden">Orientierungshilfe</span>
        <span className="hidden truncate sm:inline">Orientierungshilfe, keine Rechtsgarantie</span>
        {/*
          Auf dem Telefon fällt der Pfeil weg: er kostet 18 px, und die
          gekürzte Fassung „…keine Rechtsg…" wäre bei einem Haftungshinweis
          der schlechtere Handel. Das ⓘ zeigt ohnehin an, dass mehr dahinter
          steckt.
        */}
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          aria-hidden
          className={`hidden shrink-0 transition-transform duration-[160ms] ease-[var(--ease-heraus)]
                      sm:block ${offen ? 'rotate-180' : ''}`}
        />
      </button>

      {offen && (
        <div
          role="dialog"
          aria-label="Orientierungshilfe, keine Rechtsgarantie"
          /*
            Auf dem Telefon hängt die Blase nicht an der Marke, sondern am
            Bildschirm: an der Marke ausgerichtet begann sie 40 px vom linken
            Rand und stand mit ihren 24 rem zur Hälfte draussen. `fixed` mit
            beiden Kanten lässt sie genau so breit werden, wie Platz ist.
          */
          className="fixed inset-x-3 top-[3.25rem] z-50 overflow-hidden rounded-gross
                     border border-geduldet-500/25 bg-flaeche-2/97 shadow-[var(--shadow-4)]
                     backdrop-blur-md sm:absolute sm:inset-x-auto sm:left-0 sm:top-full
                     sm:mt-2 sm:w-[24rem]"
        >
          <div className="space-y-2 px-4 py-3 text-klein leading-relaxed text-ink-300">
            <p className="font-semibold text-geduldet-400">
              Diese Karte ist eine Orientierungshilfe. Prüfe die Lage vor Ort.
            </p>
            <p>
              CampBuddy stellt Rechtsinformationen dar und ersetzt keine Rechtsberatung. Die
              Einstufung einer Fläche kann sich durch neue Verordnungen, saisonale Verbote
              (Waldbrandgefahr, Wildruhezonen im Winter) oder Gemeindebeschlüsse jederzeit ändern.
            </p>
            <p>
              Angaben ohne benannte Quelle sind aus dem allgemeinen Rechtsrahmen abgeleitet und
              <strong className="font-semibold text-ink-200"> nicht amtlich bestätigt</strong>. Jede
              Fläche zeigt offen an, wie gut sie belegt ist. Beschilderung vor Ort und Auskünfte
              von Gemeinde oder Wildhut gehen dieser Karte immer vor.
            </p>
            {/*
              Die Pflichttexte hängen hier, weil das der einzige Ort ist, der
              auf der Kartenansicht immer sichtbar ist — die Karte selbst hat
              keine Fusszeile, und eine eigene Zeile dafür wäre dieselbe
              verlorene Kartenhöhe, die dieser Hinweis gerade eingespart hat.
            */}
            <p className="flex gap-4 border-t border-kante pt-2 text-mikro normal-case tracking-normal">
              <a href="#/impressum" className="text-ink-400 transition-colors duration-[160ms] hover:text-gletscher-300">
                Impressum
              </a>
              <a href="#/datenschutz" className="text-ink-400 transition-colors duration-[160ms] hover:text-gletscher-300">
                Datenschutz
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
