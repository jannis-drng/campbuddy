/**
 * Der Zeichenmodus auf dem Telefon — ohne Panel davor.
 *
 * Auf dem Zeiger liegt das Routenpanel neben der Karte; auf dem Telefon lag es
 * als Blatt darüber und nahm zwei Drittel des Bildes weg. Man sollte zeichnen
 * und sah dabei kaum, worauf. Deshalb tritt das Blatt zurück, sobald gezeichnet
 * oder markiert wird, und an seine Stelle kommt genau so viel Bedienung, wie
 * für den Finger nötig ist: zurücknehmen, löschen, fertig.
 *
 * Das Band oben ist kein Zierrat. Ohne es sieht eine Karte im Zeichenmodus aus
 * wie eine Karte — und jeder Tipper setzt unerwartet einen Stopp.
 */
import { Check, MousePointerClick, Trash2, Undo2, Camera } from 'lucide-react'
import { Button, IconButton } from '../ui'

interface Props {
  modus: 'zeichnen' | 'markieren'
  /** Wie viele Stopps stehen — die Rückmeldung, dass das Tippen ankommt. */
  stopps: number
  hatRoute: boolean
  onUndo: () => void
  onClear: () => void
  /** Beendet den Modus und holt das Routenblatt zurück. */
  onFertig: () => void
}

export function ZeichenLeiste({ modus, stopps, hatRoute, onUndo, onClear, onFertig }: Props) {
  const zeichnet = modus === 'zeichnen'

  return (
    <div className="sm:hidden">
      {/* ---- Band oben: was gerade gilt ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-14">
        <p
          role="status"
          className="flex max-w-full items-center gap-2 rounded-full border border-gletscher-500/40
                     bg-flaeche-2/95 px-3.5 py-1.5 text-klein font-medium text-gletscher-200
                     shadow-[var(--shadow-3)] backdrop-blur-md"
        >
          {zeichnet ? (
            <MousePointerClick size={14} strokeWidth={2.25} aria-hidden />
          ) : (
            <Camera size={14} strokeWidth={2.25} aria-hidden />
          )}
          <span className="truncate">
            {zeichnet
              ? stopps === 0
                ? 'Tippe für den ersten Stopp'
                : `${stopps} ${stopps === 1 ? 'Stopp' : 'Stopps'} - weiter tippen`
              : 'Tippe die Stelle an'}
          </span>
        </p>
      </div>

      {/* ---- Leiste unten: die drei Handgriffe ---- */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-kante
                   bg-flaeche-2/95 px-4 py-3 backdrop-blur-md"
      >
        {zeichnet && (
          <>
            <IconButton
              icon={Undo2} label="Letzten Stopp zurücknehmen" variante="sekundaer"
              onClick={onUndo} disabled={stopps === 0}
            />
            <IconButton
              icon={Trash2} label="Route löschen" variante="sekundaer"
              onClick={onClear} disabled={!hatRoute}
            />
          </>
        )}
        <Button
          variante="primaer" groesse="gross" icon={Check} onClick={onFertig}
          className="ml-auto flex-1"
        >
          {zeichnet ? 'Fertig' : 'Markieren beenden'}
        </Button>
      </div>
    </div>
  )
}
