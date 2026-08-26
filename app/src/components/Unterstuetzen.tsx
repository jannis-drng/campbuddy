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
 */
import { ExternalLink, Heart, Sprout } from 'lucide-react'
import { Button } from '../ui'

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
 * schlimmer als gar keine.
 */
export const KLIMA_ANTEIL = '1 %'
export const KLIMA_ZUSAGE =
  `${KLIMA_ANTEIL} jeder Zahlung geht über Stripe Climate in die dauerhafte Entnahme von CO₂ aus der Atmosphäre.`

/* -------------------------------------------------------------------- Knopf */

/**
 * Der stille Eingang in der Kopfzeile der Karte. Icon-only bis Tablet: die
 * Kopfzeile ist dort schon voll, und wer spenden will, findet ein Herz.
 */
export function UnterstuetzenKnopf({ className = '' }: { className?: string }) {
  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noreferrer noopener"
      title="CampBuddy unterstützen"
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-mittel px-2.5
                  text-fliess font-medium text-ink-300
                  transition-[background-color,color] duration-[160ms] ease-[var(--ease-heraus)]
                  hover:bg-flaeche-3 hover:text-gletscher-300
                  focus-visible:text-gletscher-300 ${className}`}
    >
      <Heart size={17} strokeWidth={2} aria-hidden />
      <span className="hidden lg:inline">Unterstützen</span>
      <span className="lg:hidden sr-only">CampBuddy unterstützen</span>
    </a>
  )
}

/* --------------------------------------------------------------------- Band */

/**
 * Die ausführliche Bitte, einmal auf der Startseite über der Fusszeile.
 * Genau ein solcher Block — eine Karte, die bei jedem Besuch um Geld bittet,
 * verliert schneller Vertrauen, als die Spende einbringt.
 */
export function UnterstuetzenBand() {
  return (
    <section
      aria-labelledby="unterstuetzen-titel"
      className="border-t border-kante bg-flaeche-2"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8
                      md:flex-row md:items-center md:justify-between md:gap-10">
        <div className="min-w-0">
          <h2
            id="unterstuetzen-titel"
            className="flex items-center gap-2.5 text-ueberschrift font-semibold tracking-tight text-ink-50"
          >
            <Heart size={18} strokeWidth={2} className="shrink-0 text-gletscher-300" aria-hidden />
            Die Karte ist kostenlos — und bleibt es.
          </h2>
          <p className="mt-2.5 max-w-xl text-fliess leading-relaxed text-ink-300">
            Jede Einstufung hier ist von Hand nachgelesen, belegt und mit einem Datum versehen.
            Wenn dir das eine Nacht draussen leichter gemacht hat, kannst du etwas dalassen.
          </p>
          <p className="mt-3 flex max-w-xl items-start gap-2 text-klein leading-relaxed text-ink-400">
            <Sprout size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-gletscher-400" aria-hidden />
            <span>{KLIMA_ZUSAGE}</span>
          </p>
        </div>

        <div className="shrink-0">
          <Button
            variante="primaer"
            groesse="gross"
            icon={Heart}
            onClick={() => window.open(KOFI_URL, '_blank', 'noopener,noreferrer')}
          >
            Auf Ko-fi unterstützen
          </Button>
          <p className="mt-2.5 flex items-center gap-1.5 text-mikro text-ink-500 md:justify-center">
            <ExternalLink size={11} strokeWidth={2.5} aria-hidden />
            Einmalig, kein Abo, kein Konto nötig
          </p>
        </div>
      </div>
    </section>
  )
}
