/**
 * "Route mitnehmen" — ein Knopf, dahinter die Übergabe an fremde Planer.
 *
 * Die Reihenfolge im Dialog ist die Reihenfolge der Wahrscheinlichkeit, nicht
 * die der Technik. Auf dem Telefon steht die Teilen-Auswahl oben und gross:
 * dort ist sie eine Berührung von der komoot-App entfernt. Am Rechner gibt es
 * sie nicht, dann rücken die drei Dienste nach oben.
 *
 * Warum überhaupt ein Dialog und kein direkter Knopf: Ziel und Weg sind zwei
 * Entscheidungen ("wohin?" und "teilen oder Datei?"), und drei Dienste plus
 * zwei Wege als fünf Knöpfe ins Routenpanel zu legen, hiesse das Panel mit
 * einer Nebensache zu füllen. Warum keine Schnittstelle dahinter steckt,
 * steht in `services/tourExport.ts`.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, ExternalLink, Share2, TriangleAlert, X } from 'lucide-react'
import type { Position } from '../data/geo'
import type { Wegpunkt } from '../data/types'
import {
  EXPORT_ZIELE, gpxDatei, herunterladen, kannTeilen, teile, zumDienst, type ExportZiel,
} from '../services/tourExport'
import { Button, Hinweis, IconButton, Label } from '../ui'

interface Props {
  route: Position[]
  wegpunkte: Wegpunkt[]
  /** Name der Tour — wird Dateiname und Spurname im fremden Planer. */
  name?: string
  variante?: 'primaer' | 'sekundaer' | 'geist'
  groesse?: 'klein' | 'mittel' | 'gross'
  breit?: boolean
  className?: string
  beschriftung?: string
}

export function ExportKnopf({
  route, wegpunkte, name = 'CampBuddy-Route',
  variante = 'geist', groesse = 'klein', breit, className = '', beschriftung = 'Mitnehmen',
}: Props) {
  const [offen, setOffen] = useState(false)
  return (
    <>
      <Button
        variante={variante} groesse={groesse} breit={breit} className={className}
        icon={Share2} disabled={route.length < 2} onClick={() => setOffen(true)}
      >
        {beschriftung}
      </Button>
      <ExportDialog
        offen={offen} onClose={() => setOffen(false)}
        route={route} wegpunkte={wegpunkte} name={name}
      />
    </>
  )
}

function ExportDialog({
  offen, onClose, route, wegpunkte, name,
}: { offen: boolean; onClose: () => void; route: Position[]; wegpunkte: Wegpunkt[]; name: string }) {
  const [fehler, setFehler] = useState<string | null>(null)
  /** Welcher Weg gerade gegangen wurde — kurze Bestätigung statt stiller Knopf. */
  const [erledigt, setErledigt] = useState<string | null>(null)

  useEffect(() => {
    if (!offen) return
    setFehler(null)
    setErledigt(null)
    const zu = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', zu)
    return () => window.removeEventListener('keydown', zu)
  }, [offen, onClose])

  /*
    Die Datei wird einmal gebaut und nicht pro Knopf: `kannTeilen` braucht sie
    ohnehin zur Prüfung, und ein zweites Mal dieselben tausend Punkte zu
    serialisieren wäre reine Arbeit ohne Ergebnis.
  */
  const datei = useMemo(
    () => (route.length >= 2 ? gpxDatei(route, wegpunkte, name) : null),
    [route, wegpunkte, name],
  )
  const teilbar = datei != null && kannTeilen(datei)

  if (!offen || !datei) return null

  const merken = (was: string) => {
    setErledigt(was)
    setFehler(null)
  }

  const dienst = (ziel: ExportZiel) => {
    zumDienst(datei, ziel)
    merken(ziel.id)
  }

  /*
    Ins `body` gehängt, nicht an Ort und Stelle gerendert.

    Das Routenpanel trägt `backdrop-blur` — und ein Backdrop-Filter macht das
    Element zum Bezugsrahmen für alles `fixed` darunter. Der Dialog klebte
    dadurch im Panel statt über der Seite: halb abgeschnitten, ohne
    Abdunklung. Dasselbe gilt für die Auswertung, die ebenfalls unscharf
    hinterlegt ist.
  */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Route mitnehmen"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl
                      border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-kante px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-titel font-semibold text-ink-50">Route mitnehmen</h2>
            <p className="mt-0.5 truncate text-klein text-ink-400">{datei.name}</p>
          </div>
          <IconButton icon={X} label="Schliessen" onClick={onClose} className="-mr-1.5 -mt-1" />
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* ---- Der kurze Weg, wenn das Gerät ihn hat ---- */}
          {teilbar && (
            <div>
              <Button
                variante="primaer" groesse="gross" breit icon={Share2}
                onClick={() => {
                  // Wer eine App gewählt hat, ist fertig — die Auswahl des
                  // Geräts ist die Bestätigung, ein Häkchen darunter wäre eine
                  // zweite. Abbrechen wirft nicht und lässt den Dialog stehen.
                  void teile(datei, name)
                    .then(onClose)
                    .catch((e: Error) => setFehler(`Teilen ging nicht: ${e.message}`))
                }}
              >
                An App senden
              </Button>
              <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
                komoot, Strava, Garmin und die Dateien-App nehmen die Route direkt an.
              </p>
            </div>
          )}

          {/* ---- Die Dienste ---- */}
          <div>
            <Label className="mb-1.5">{teilbar ? 'Oder Import-Seite öffnen' : 'Import-Seite öffnen'}</Label>
            <ul className="divide-y divide-kante overflow-hidden rounded-mittel border border-kante bg-flaeche-1">
              {EXPORT_ZIELE.map((ziel) => (
                <li key={ziel.id}>
                  <button
                    onClick={() => dienst(ziel)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left
                               transition-colors duration-[160ms] hover:bg-flaeche-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-fliess font-medium text-ink-50">
                        {ziel.name}
                        {erledigt === ziel.id && (
                          <Check size={13} strokeWidth={2.5} className="text-erlaubt-400" aria-hidden />
                        )}
                      </span>
                      <span className="mt-0.5 block text-mikro normal-case leading-relaxed
                                       tracking-normal text-ink-500">
                        {ziel.schritt}
                      </span>
                    </span>
                    <ExternalLink size={15} strokeWidth={2} className="shrink-0 text-ink-500" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* ---- Nur die Datei ---- */}
          <div>
            <Button
              variante="sekundaer" groesse="mittel" breit icon={Download}
              onClick={() => { herunterladen(datei); merken('datei') }}
            >
              {erledigt === 'datei' ? 'Heruntergeladen' : 'Nur die GPX-Datei'}
            </Button>
            <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
              Für Organic Maps, OsmAnd, Locus oder das eigene Gerät.
            </p>
          </div>

          {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}

          {/*
            Die Ehrlichkeit gehört sichtbar in den Dialog, nicht ins
            Kleingedruckte: wer "komoot" antippt und ein neues Tab statt einer
            fertigen Tour bekommt, hält es sonst für einen Fehler.
          */}
          <p className="rounded-mittel bg-flaeche-1 p-3 text-mikro normal-case leading-relaxed
                        tracking-normal text-ink-500">
            komoot und Strava lassen keine direkte Übertragung von aussen zu — komoot hat keine
            offene Schnittstelle, Strava nimmt über seine nur aufgezeichnete Aktivitäten an,
            keine geplanten Routen. CampBuddy legt die Datei deshalb bereit und öffnet die
            Seite, auf der sie hingehört; hineinziehen musst du sie dort selbst.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
