/**
 * Der letzte Schritt der Registrierung — und der erste, den man angemeldet tut.
 *
 * Vorher stand der Benutzername im Registrierformular, vor der Mailbestätigung.
 * Das war der falsche Zeitpunkt aus zwei Gründen: es verlangte drei Angaben
 * dort, wo zwei reichen, und der Name wurde erst Minuten später wirklich
 * vergeben — bis dahin konnte ihn jemand anderes nehmen, und weil das ein
 * Datenbank-Trigger bemerkte und kein Mensch, bekam man wortlos einen erzeugten
 * Namen (siehe Migration 0022).
 *
 * Hier ist beides in Ordnung: es gibt eine Sitzung, die Prüfung läuft gegen
 * dieselbe Datenbank, die gleich speichert, und ein vergebener Name führt zu
 * einer Meldung statt zu einer Überraschung.
 *
 * „Später" ist Absicht und keine Sackgasse: das Konto trägt bereits den
 * Übergangsnamen aus seiner ID, und der bleibt einfach stehen. Nichts ist
 * gesperrt, nichts fehlt — man heisst nur vorerst `wanderer-3f9a1c` und kann
 * sich jederzeit im Kontobereich umbenennen. Deshalb steht der aktuelle Name
 * hier auch ausdrücklich drin: wer wegklickt, soll wissen, wie er heisst.
 */
import { useEffect, useState } from 'react'
import { Check, TriangleAlert, UserRound } from 'lucide-react'
import { speichereAnzeigename, type NamensUrteil } from '../services/account'
import { Button, Hinweis } from '../ui'
import { Namensfeld } from './Namensfeld'

interface Props {
  offen: boolean
  /** Wie das Konto gerade heisst — der Übergangsname aus seiner ID. */
  bisher: string | null
  /** Zurückgestellt — das Fenster bleibt bis zur nächsten Anmeldung weg. */
  onSpaeter: () => void
  onGespeichert: (name: string) => void
}

export function BenutzernameDialog({ offen, bisher, onSpaeter, onGespeichert }: Props) {
  const [name, setName] = useState('')
  const [urteil, setUrteil] = useState<NamensUrteil | null>(null)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!offen) { setName(''); setUrteil(null); setFehler(null) }
  }, [offen])

  if (!offen) return null

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault()
    if (urteil?.ok !== true) return
    setBusy(true); setFehler(null)
    try {
      const gewaehlt = name.trim()
      await speichereAnzeigename(gewaehlt)
      onGespeichert(gewaehlt)
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      /*
        Kein Schliessen durch Klick auf den Grund: das Fenster hat zwei
        ausdrückliche Ausgänge, und ein danebengegangener Fingertipp soll nicht
        der dritte sein.
      */
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-labelledby="benutzername-titel"
    >
      <div className="w-full max-w-md rounded-t-riesig border border-kante bg-flaeche-2 p-5
                      shadow-[var(--shadow-4)] sm:rounded-riesig sm:p-6">
        <span
          aria-hidden
          className="inline-flex h-11 w-11 items-center justify-center rounded-mittel border
                     border-gletscher-500/30 bg-gletscher-500/12 text-gletscher-200"
        >
          <UserRound size={20} strokeWidth={2} />
        </span>

        <h2 id="benutzername-titel" className="mt-3.5 text-titel font-semibold text-ink-50">
          Wähle deinen Benutzernamen
        </h2>
        <p className="mt-1.5 text-fliess leading-relaxed text-ink-400">
          Unter diesem Namen erscheinen deine geteilten Touren und Kommentare. Deine
          E-Mail-Adresse wird nie veröffentlicht.
        </p>
        {bisher && (
          <p className="mt-2 text-klein leading-relaxed text-ink-500">
            Bis dahin heisst du{' '}
            <span className="font-medium text-ink-200">{bisher}</span> — das geht auch,
            und ändern kannst du es jederzeit.
          </p>
        )}

        <form onSubmit={speichern} className="mt-4 space-y-3.5">
          <Namensfeld
            wert={name}
            onAendern={(w) => { setName(w); setFehler(null) }}
            onUrteil={setUrteil}
            autoFocus
          />

          {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit" variante="primaer" groesse="gross" icon={Check}
              disabled={busy || urteil?.ok !== true} className="flex-1"
            >
              {busy ? 'Speichere …' : 'Namen übernehmen'}
            </Button>
            <Button variante="geist" groesse="gross" onClick={onSpaeter} disabled={busy}>
              Später
            </Button>
          </div>
        </form>

        <p className="mt-3 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
          Der erste eigene Name ist frei; erst ein späterer Wechsel ist danach eine Weile
          gesperrt — im Kontobereich steht, wie lange.
        </p>
      </div>
    </div>
  )
}
