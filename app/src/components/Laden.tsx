/**
 * Zwei Anzeigen für „es passiert gerade etwas" — und warum es zwei sein müssen.
 *
 * Beides ist Warten, aber es sind zwei verschiedene Sorten, und sie vertragen
 * dieselbe Behandlung nicht:
 *
 *  1. **Eine Tour wird geholt.** Hier wechselt gleich die Ansicht, und bis der
 *     Verlauf da ist, kann man nichts Sinnvolles tun. Eine grosse Tour bringt
 *     über zwanzigtausend Stützpunkte mit; auf schlechtem Netz sind das
 *     mehrere Sekunden, in denen bisher schlicht nichts geschah — man klickte
 *     „Auf Karte" und blieb in der Liste stehen. Der zweite Klick auf denselben
 *     Knopf lädt dann dieselbe Tour ein zweites Mal. Deshalb ein Schleier über
 *     allem: er sagt, dass es läuft, und nimmt den Doppelklick gleich mit.
 *
 *  2. **Ein Weg wird berechnet.** Hier darf nichts blockieren. Wer einen
 *     dritten Stopp setzen will, während der zweite noch gerechnet wird, soll
 *     das können — die Berechnung läuft ohnehin gleich neu. Ein Schleier wäre
 *     hier eine Bremse, die nichts schützt. Also eine kleine Marke, die über
 *     der Karte schwebt und den Rest in Ruhe lässt.
 *
 * Beide sind bewusst wortkarg und ohne Fortschrittsbalken: keine dieser beiden
 * Wartezeiten lässt sich ehrlich in Prozent ausdrücken, und ein Balken, der bei
 * 90 % stehenbleibt, ist schlimmer als keiner.
 */
import { Marke } from './Marke'

/** Der Kreis, den sich beide teilen. Grösse kommt von aussen. */
function Kreisel({ klasse }: { klasse: string }) {
  return (
    <span
      aria-hidden
      className={`animate-spin rounded-full border-ink-600 border-t-gletscher-400 ${klasse}`}
    />
  )
}

/**
 * Der Schleier über der ganzen Ansicht.
 *
 * `aria-live="assertive"` und `role="status"`, damit auch ohne Blick auf den
 * Schirm ankommt, dass gerade geladen wird — die Anzeige ersetzt hier eine
 * Rückmeldung, die es sonst gar nicht gäbe.
 *
 * Die Marke steht dabei, nicht nur ein Kreisel: einen nackten Kreisel über
 * einer weggeblendeten Oberfläche liest man als Fehler, das Zeichen daneben
 * macht daraus einen Vorgang.
 */
export function Ladeschleier({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4
                 bg-flaeche-1/80 backdrop-blur-sm"
    >
      <Marke className="h-10 w-10 opacity-90" />
      <div className="flex items-center gap-2.5 text-fliess text-ink-300">
        <Kreisel klasse="h-4 w-4 border-2" />
        {text}
      </div>
    </div>
  )
}

/**
 * Die schwebende Marke über der Karte.
 *
 * Oben mittig, weil dort als einziger Rand nichts liegt: links die Zoomknöpfe,
 * rechts Kartenwahl und Legende, unten Massstab und „Route planen".
 * `pointer-events-none` ist wichtig — sie schwebt über der Karte, und man muss
 * durch sie hindurch einen Wegpunkt setzen können.
 */
export function Ladehinweis({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2"
    >
      <span
        className="flex items-center gap-2 rounded-full border border-kante bg-flaeche-2/95 px-3.5
                   py-1.5 text-mikro font-medium normal-case tracking-normal text-ink-300
                   shadow-[var(--shadow-3)] backdrop-blur-sm"
      >
        <Kreisel klasse="h-3 w-3 border-2" />
        {text}
      </span>
    </div>
  )
}
