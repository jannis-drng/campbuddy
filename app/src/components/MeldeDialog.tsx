/**
 * Einen öffentlichen Inhalt melden.
 *
 * Bewusst ohne Anmeldezwang und bewusst kurz: ein Grund genügt, der Text ist
 * freiwillig. Je mehr Hürden hier stehen, desto seltener wird gemeldet — und
 * eine falsche Rechtsangabe, die niemand meldet, bleibt auf der Karte stehen.
 */
import { useEffect, useState } from 'react'
import { Check, Flag, Loader2, X } from 'lucide-react'
import { BESCHREIBUNG_MAX, MELDE_GRUENDE, meldungAbsenden, type MeldeGrund } from '../services/meldungen'
import { Button, Hinweis, IconButton, Label } from '../ui'

interface Props {
  offen: boolean
  zielArt: 'route' | 'punkt'
  zielId: string
  /** Name des gemeldeten Inhalts — damit klar ist, worum es geht. */
  zielName: string
  onClose: () => void
}

export function MeldeDialog({ offen, zielArt, zielId, zielName, onClose }: Props) {
  const [grund, setGrund] = useState<MeldeGrund>('falsche_rechtsangabe')
  const [text, setText] = useState('')
  const [stand, setStand] = useState<'idle' | 'sendet' | 'fertig'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!offen) return
    setGrund('falsche_rechtsangabe')
    setText('')
    setStand('idle')
    setFehler(null)
  }, [offen])

  useEffect(() => {
    if (!offen) return
    const zu = (e: KeyboardEvent) => { if (e.key === 'Escape' && stand !== 'sendet') onClose() }
    window.addEventListener('keydown', zu)
    return () => window.removeEventListener('keydown', zu)
  }, [offen, stand, onClose])

  if (!offen) return null

  const senden = async () => {
    setStand('sendet')
    setFehler(null)
    try {
      await meldungAbsenden(zielArt, zielId, grund, text)
      setStand('fertig')
      // Kurz stehen lassen, damit die Bestätigung gelesen werden kann.
      setTimeout(onClose, 1800)
    } catch (e) {
      setFehler((e as Error).message)
      setStand('idle')
    }
  }

  const beschaeftigt = stand === 'sendet'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Inhalt melden"
      onClick={(e) => { if (e.target === e.currentTarget && !beschaeftigt) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl
                      border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-kante px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-titel font-semibold text-ink-50">Inhalt melden</h2>
            <p className="mt-0.5 truncate text-klein text-ink-400">{zielName}</p>
          </div>
          <IconButton icon={X} label="Schliessen" onClick={onClose} disabled={beschaeftigt} className="-mr-1.5 -mt-1" />
        </header>

        {stand === 'fertig' ? (
          <div className="px-5 py-8 text-center">
            <Check size={28} strokeWidth={2} className="mx-auto text-gletscher-300" aria-hidden />
            <p className="mt-3 font-medium text-ink-50">Meldung ist angekommen.</p>
            <p className="mt-1 text-klein leading-relaxed text-ink-400">
              Sie wird von Hand geprüft. Bei einer falschen Rechtsangabe hilft dein Hinweis
              der Karte am meisten — danke dafür.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <fieldset>
                <Label className="mb-1.5">Was stimmt nicht</Label>
                <div className="space-y-1.5">
                  {MELDE_GRUENDE.map((g) => (
                    <label
                      key={g.wert}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-gross border px-3 py-2.5
                                  transition-colors duration-[160ms]
                                  ${grund === g.wert
                                    ? 'border-gletscher-500 bg-flaeche-3'
                                    : 'border-kante hover:bg-flaeche-3'}`}
                    >
                      <input
                        type="radio"
                        name="meldegrund"
                        value={g.wert}
                        checked={grund === g.wert}
                        onChange={() => setGrund(g.wert)}
                        className="mt-0.5 accent-[var(--color-gletscher-400)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-klein font-medium text-ink-50">{g.label}</span>
                        <span className="block text-mikro leading-relaxed text-ink-500">{g.hilfe}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <Label className="mb-1.5">
                  Beschreibung <span className="font-normal normal-case text-ink-500">(freiwillig)</span>
                </Label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, BESCHREIBUNG_MAX))}
                  rows={3}
                  placeholder="Was genau ist falsch? Je konkreter, desto schneller lässt es sich prüfen."
                  className="w-full resize-none rounded-gross border border-kante bg-flaeche-1 px-3 py-2
                             text-klein text-ink-100 placeholder:text-ink-600
                             focus:border-gletscher-500 focus:outline-none"
                />
                <p className="mt-1 text-right text-mikro text-ink-600">
                  {text.length}/{BESCHREIBUNG_MAX}
                </p>
              </div>

              {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
            </div>

            <div className="shrink-0 border-t border-kante px-5 py-4">
              <Button
                variante="primaer" groesse="gross" breit
                icon={beschaeftigt ? Loader2 : Flag}
                onClick={() => void senden()}
                disabled={beschaeftigt}
                className={beschaeftigt ? '[&>svg]:animate-spin' : ''}
              >
                Meldung senden
              </Button>
              <p className="mt-2 text-center text-mikro leading-relaxed text-ink-600">
                Ohne Konto möglich. Meldungen werden von Hand geprüft.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
