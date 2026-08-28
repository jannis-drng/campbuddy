/**
 * Unterstützen — der einzige Ort, an dem diese App um Geld bittet.
 *
 * Bewusst *kein* eingebettetes Ko-fi-Overlay, obwohl Ko-fi eines anbietet.
 * Drei Gründe, alle drei hätte das Widget gebrochen:
 *
 *  1. Die CSP in `_headers.vorlage` lässt ausser dem Cloudflare-Beacon kein
 *     fremdes JavaScript zu. Für das Overlay müssten `storage.ko-fi.com` in
 *     `script-src` und ko-fi.com in `frame-src` — fremder Code mit vollem
 *     Zugriff auf die Seite, bei jedem Aufruf, nur damit ein Knopf schwebt.
 *     Ein gewöhnlicher Link erreicht dasselbe und kostet keine Zeile CSP.
 *  2. Der Vorschlag von Ko-fi ist grün (#5cb85c). Grün, Gelb und Rot sind in
 *     dieser App für die Rechtslage reserviert (siehe `components/ui.tsx`) —
 *     ein grüner Knopf neben einer grünen Fläche heisst für den Lesenden
 *     erstmal „hier ist Übernachten erlaubt". Deshalb Gletscher, der Akzent.
 *  3. Die schwebende Blase sitzt unten rechts, also genau dort, wo auf dem
 *     Telefon die Panels liegen.
 *
 * Ein Ko-fi-Link lädt nichts nach und meldet nichts — Ko-fi erfährt vom
 * Besuch erst, wenn jemand tatsächlich klickt.
 *
 * Zwei Auftritte, weil die beiden Ansichten verschieden viel Platz haben:
 * das Band auf der Startseite darf ausholen, die Blase an der Karte nicht.
 * Der Text der Blase ist deshalb nicht gekürzt, sondern eigens geschrieben —
 * gekürzte Fassungen klingen immer nach Restposten.
 */
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Heart, Info, Sprout, X } from 'lucide-react'

/* ------------------------------------------------------------ Konfiguration */

/** Ändert sich der Ko-fi-Name, ändert er sich hier — und nirgends sonst. */
export const KOFI_NAME = 'campbuddy'
export const KOFI_URL = `https://ko-fi.com/${KOFI_NAME}`

/**
 * Die Klimazusage.
 *
 * Sie steht hier als Konstante und nicht als Fliesstext in der Sektion, weil
 * sie eine überprüfbare Aussage über echtes Geld ist: Zahlungen über Ko-fi
 * laufen über das verbundene Stripe-Konto, und Stripe Climate leitet dort
 * einen festgelegten Anteil des Umsatzes an die *dauerhafte Entnahme* von CO₂
 * weiter — nicht an Kompensation durch Baumpflanzung. Der Unterschied ist
 * kein Detail, deshalb steht er auch im Satz.
 *
 * Wird der Anteil im Stripe-Dashboard geändert oder abgeschaltet, gehört
 * diese Konstante mitgeändert. Eine Zusage, die nicht mehr stimmt, ist
 * schlimmer als gar keine. Der Anteil steht nur einmal da, damit die kurze
 * und die lange Fassung nicht auseinanderlaufen können.
 */
export const KLIMA_ANTEIL = '1 %'
export const KLIMA_ZUSAGE =
  `${KLIMA_ANTEIL} jeder Zahlung geht über Stripe Climate in die dauerhafte Entnahme von CO₂ aus der Atmosphäre.`
export const KLIMA_ZUSAGE_KURZ =
  `${KLIMA_ANTEIL} jeder Zahlung geht über Stripe Climate in dauerhafte CO₂-Entnahme.`

/**
 * Die Ausnahme gehört zur Zusage, nicht ins Impressum.
 *
 * Ko-fi nimmt auch PayPal an, und PayPal-Zahlungen laufen an Stripe
 * vorbei — dort greift Stripe Climate also nicht. „Jeder Zahlung" stimmt
 * damit nur mit dieser Einschränkung, und eine Werbeaussage, deren
 * Einschränkung man suchen muss, ist keine ehrliche.
 *
 * Als aufklappbare Fussnote statt als zweiter Satz, weil sie sonst länger
 * wäre als die Zusage selbst und die Kernaussage erschlagen würde. Das
 * Zeichen dafür steht unmittelbar hinter dem Satz, den es einschränkt.
 */
export const KLIMA_AUSNAHME =
  'Ausgenommen sind Zahlungen über PayPal: die laufen nicht über Stripe, ' +
  'deshalb greift Stripe Climate dort nicht.'

/* --------------------------------------------------------------- Ko-fi-Link */

const KOFI_KNOPF =
  'inline-flex w-full items-center justify-center gap-2 rounded-mittel ' +
  'bg-gletscher-300 px-4 text-fliess font-medium text-ink-950 shadow-[var(--shadow-1)] ' +
  'transition-[background-color,transform] duration-[160ms] ease-[var(--ease-heraus)] ' +
  'hover:bg-gletscher-200 active:translate-y-px'

/**
 * Der Weg zu Ko-fi ist ein echter Anker und kein `window.open` — nur so
 * funktionieren Mittelklick, „in neuem Tab öffnen" und die Statuszeile, die
 * vor dem Klick zeigt, wohin es geht. Bei einem Spendenlink ist genau das
 * die Zusicherung, die jemand sehen will.
 */
function KofiLink({ hoehe = 'h-11' }: { hoehe?: string }) {
  return (
    <a href={KOFI_URL} target="_blank" rel="noreferrer noopener" className={`${KOFI_KNOPF} ${hoehe}`}>
      <Heart size={16} strokeWidth={2} aria-hidden />
      Auf Ko-fi unterstützen
    </a>
  )
}

function Kleingedrucktes({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-mikro text-ink-500 ${className}`}>
      <ExternalLink size={11} strokeWidth={2.5} aria-hidden />
      Einmalig, kein Abo, kein Konto nötig
    </p>
  )
}

/* ---------------------------------------------------------------- Klimazeile */

/**
 * Die Klimazusage mit ihrer Ausnahme — einmal geschrieben, an beiden Orten
 * benutzt. Läge der Text zweimal da, würde die Ausnahme beim nächsten Mal an
 * genau einer Stelle nachgezogen.
 *
 * Das „i" klappt die Ausnahme auf statt sie als Tooltip zu zeigen: ein
 * Tooltip hängt am Zeiger, und auf dem Telefon gibt es keinen. Seine
 * Trefferfläche wächst über ein Pseudo-Element auf Fingergrösse, ohne dass
 * das Zeichen im Fliesstext dicker wird.
 */
function Klimazeile({ kurz = false, className = '' }: { kurz?: boolean; className?: string }) {
  const [ausnahme, setAusnahme] = useState(false)

  return (
    <div className={className}>
      <p className={`flex items-start gap-2 leading-relaxed text-ink-400 ${kurz ? 'text-mikro' : 'text-klein'}`}>
        <Sprout
          size={kurz ? 13 : 14}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-gletscher-400"
          aria-hidden
        />
        <span>
          {kurz ? KLIMA_ZUSAGE_KURZ : KLIMA_ZUSAGE}{' '}
          <button
            type="button"
            onClick={() => setAusnahme((v) => !v)}
            aria-expanded={ausnahme}
            aria-label="Ausnahme zur Klimazusage"
            className={`relative inline-flex translate-y-px items-center justify-center rounded-full
                        transition-colors duration-[160ms] ease-[var(--ease-heraus)]
                        after:absolute after:-inset-2.5 after:content-['']
                        ${ausnahme ? 'text-gletscher-300' : 'text-ink-500 hover:text-gletscher-300'}`}
          >
            <Info size={kurz ? 12 : 13} strokeWidth={2.5} aria-hidden />
          </button>
        </span>
      </p>

      {ausnahme && (
        <p className={`mt-1.5 text-mikro leading-relaxed text-ink-500 ${kurz ? 'pl-[21px]' : 'pl-[22px]'}`}>
          {KLIMA_AUSNAHME}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- Blase */

/**
 * Der Auftritt an der Karte — dort verbringen die meisten ihre Zeit, dort
 * stand vorher nur ein Herz ohne Erklärung.
 *
 * Als aufklappende Blase und nicht als Dauerstreifen: Die Kartenansicht hat
 * über der Karte schon Kopfzeile, Haftungshinweis und Filterleiste. Eine
 * vierte Zeile, die bei jedem Besuch um Geld bittet, kostet mehr Vertrauen,
 * als sie einbringt — und Kartenfläche ist draussen das Knappste.
 */
export function UnterstuetzenKnopf({ className = '' }: { className?: string }) {
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
    <div ref={huelle} className={`relative shrink-0 ${className}`}>
      <button
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-label="Unterstütze uns"
        title="Unterstütze uns"
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-mittel px-2.5
                    text-fliess font-medium
                    transition-[background-color,color] duration-[160ms] ease-[var(--ease-heraus)]
                    hover:bg-flaeche-3 hover:text-gletscher-300
                    ${offen ? 'bg-flaeche-3 text-gletscher-300' : 'text-ink-300'}`}
      >
        <Heart size={17} strokeWidth={2} aria-hidden />
        {/*
          Sichtbar auf dem Telefon und ab Laptop, dazwischen nicht: im
          Tablet-Bereich liegt die Segment-Navigation quer in der Kopfzeile und
          braucht jede Spalte. Ein Herz allein sagt zu wenig — wofür man
          zahlen soll, muss dastehen.
        */}
        <span className="inline sm:hidden lg:inline">Unterstütze uns</span>
      </button>

      {offen && (
        <div
          role="dialog"
          aria-label="Unterstütze uns"
          className="absolute right-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-gross
                     border border-kante bg-flaeche-2/97 shadow-[var(--shadow-4)] backdrop-blur-md"
        >
          <div className="flex items-center gap-2 border-b border-kante px-3.5 py-2.5">
            <Heart size={15} strokeWidth={2} className="shrink-0 text-gletscher-300" aria-hidden />
            <span className="flex-1 text-klein font-semibold text-ink-100">
              Kostenlos - und bleibt es
            </span>
            <button
              onClick={() => setOffen(false)}
              aria-label="Schliessen"
              className="-mr-1 rounded-klein p-1 text-ink-500 transition-colors duration-[160ms]
                         hover:bg-flaeche-3 hover:text-ink-100"
            >
              <X size={15} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="space-y-3 px-3.5 pb-3.5 pt-3">
            <p className="text-klein leading-relaxed text-ink-300">
              Jede Einstufung auf dieser Karte ist von Hand nachgelesen, belegt und mit einem
              Datum versehen. Wer das nützlich findet, kann etwas dalassen.
            </p>
            <Klimazeile kurz />
            <KofiLink hoehe="h-10" />
            <Kleingedrucktes className="justify-center" />
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- Band */

/**
 * Die ausführliche Bitte, einmal auf der Startseite über der Fusszeile.
 */
export function UnterstuetzenBand() {
  return (
    <section aria-labelledby="unterstuetzen-titel" className="border-t border-kante bg-flaeche-2">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8
                      md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="min-w-0">
          <h2
            id="unterstuetzen-titel"
            className="flex items-center gap-2.5 text-ueberschrift font-semibold tracking-tight text-ink-50"
          >
            <Heart size={18} strokeWidth={2} className="shrink-0 text-gletscher-300" aria-hidden />
            Die Karte ist kostenlos - und bleibt es.
          </h2>
          <p className="mt-2.5 max-w-xl text-fliess leading-relaxed text-ink-300">
            Jede Einstufung hier ist von Hand nachgelesen, belegt und mit einem Datum versehen.
            Wenn dir das eine Nacht draussen leichter gemacht hat, kannst du etwas dalassen.
          </p>
          <Klimazeile className="mt-3 max-w-xl" />
        </div>

        <div className="shrink-0 md:w-60">
          <KofiLink />
          <Kleingedrucktes className="mt-2.5 md:justify-center" />
        </div>
      </div>
    </section>
  )
}
