/**
 * Einen eigenen Punkt anlegen oder bearbeiten.
 *
 * Der Ort steht schon fest, wenn dieses Fenster aufgeht — angetippt wurde er
 * auf der Karte. Hier kommt nur noch dazu, *was* es ist und *warum* es
 * bemerkenswert war. Deshalb ist die Gattung das erste Feld und nicht der
 * Name: „Aussichtspunkt" beantwortet die Frage meist schon, und wer keinen
 * Namen eintippen will, bekommt die Gattung als Namen.
 */
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Droplet, Eye, Globe, Loader2, Lock, Star, Tent, Trash2, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { EigenerPunkt, EigenerPunktTyp, RegionCode } from '../data/types'
import type { Position } from '../data/geo'
import { fotoHochladen, punktAendern, punktAnlegen } from '../services/eigenePunkte'
import { Button, Eingabe, Feld, Hinweis, IconButton, Label } from '../ui'
import { PunktFoto } from './PunktFoto'

const ARTEN: { wert: EigenerPunktTyp; label: string; icon: LucideIcon; vorschlag: string }[] = [
  { wert: 'viewpoint', label: 'Aussicht', icon: Eye, vorschlag: 'Aussichtspunkt' },
  { wert: 'campspot', label: 'Schlafplatz', icon: Tent, vorschlag: 'Schlafplatz' },
  { wert: 'water', label: 'Wasser', icon: Droplet, vorschlag: 'Wasserstelle' },
  { wert: 'foto', label: 'Foto', icon: Camera, vorschlag: 'Foto' },
  { wert: 'sonstiges', label: 'Sonstiges', icon: Star, vorschlag: 'Markierung' },
]

interface Props {
  offen: boolean
  region: RegionCode
  /** Beim Anlegen: der angetippte Ort. Beim Bearbeiten: null. */
  position: Position | null
  /** Beim Bearbeiten: der bestehende Punkt. */
  punkt: EigenerPunkt | null
  /** Route, an der der Punkt hängt — nur beim Anlegen während des Planens. */
  routeId?: string | null
  onClose: () => void
  onGespeichert: (punkt: EigenerPunkt) => void
}

export function PunktDialog({
  offen, region, position, punkt, routeId, onClose, onGespeichert,
}: Props) {
  const bearbeiten = Boolean(punkt)
  const [typ, setTyp] = useState<EigenerPunktTyp>('viewpoint')
  const [name, setName] = useState('')
  const [notiz, setNotiz] = useState('')
  const [oeffentlich, setOeffentlich] = useState(false)
  const [fotoPfad, setFotoPfad] = useState<string | null>(null)
  const [stand, setStand] = useState<'idle' | 'foto' | 'speichern'>('idle')
  const [fehler, setFehler] = useState<string | null>(null)
  const dateiFeld = useRef<HTMLInputElement>(null)

  // Beim Öffnen zurücksetzen beziehungsweise mit dem Bestand füllen.
  useEffect(() => {
    if (!offen) return
    setTyp(punkt?.typ ?? 'viewpoint')
    setName(punkt?.name ?? '')
    setNotiz(punkt?.notiz ?? '')
    setOeffentlich(punkt?.ist_oeffentlich ?? false)
    setFotoPfad(punkt?.foto_pfad ?? null)
    setStand('idle')
    setFehler(null)
  }, [offen, punkt])

  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && stand === 'idle') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offen, onClose, stand])

  if (!offen) return null

  const vorschlag = ARTEN.find((a) => a.wert === typ)?.vorschlag ?? 'Markierung'

  const fotoWaehlen = async (datei: File) => {
    setStand('foto')
    setFehler(null)
    try {
      setFotoPfad(await fotoHochladen(datei))
      // Ein Foto ohne eigene Gattung ist ein Foto — aber eine bewusst
      // gewählte Gattung wird nicht überschrieben.
      if (typ === 'sonstiges') setTyp('foto')
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setStand('idle')
    }
  }

  const speichern = async () => {
    setStand('speichern')
    setFehler(null)
    try {
      const felder = {
        typ,
        name: name.trim() || vorschlag,
        notiz: notiz.trim() || null,
        ist_oeffentlich: oeffentlich,
        foto_pfad: fotoPfad,
      }
      const gespeichert = punkt
        ? await punktAendern(punkt.id, felder)
        : await punktAnlegen({
            ...felder,
            region,
            lat: position?.[1] ?? 0,
            lng: position?.[0] ?? 0,
            route_id: routeId ?? null,
          })
      onGespeichert(gespeichert)
      onClose()
    } catch (e) {
      setFehler((e as Error).message)
      setStand('idle')
    }
  }

  const beschaeftigt = stand !== 'idle'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={bearbeiten ? 'Markierung bearbeiten' : 'Punkt markieren'}
      onClick={(e) => { if (e.target === e.currentTarget && !beschaeftigt) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl
                      border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-kante px-5 py-4">
          <div>
            <h2 className="text-titel font-semibold text-ink-50">
              {bearbeiten ? 'Markierung bearbeiten' : 'Punkt markieren'}
            </h2>
            <p className="mt-0.5 text-klein text-ink-400">
              {position
                ? `${position[1].toFixed(5)}, ${position[0].toFixed(5)}`
                : punkt && `${punkt.lat.toFixed(5)}, ${punkt.lng.toFixed(5)}`}
            </p>
          </div>
          <IconButton icon={X} label="Schliessen" onClick={onClose} disabled={beschaeftigt} className="-mr-1.5 -mt-1" />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <Label className="mb-1.5">Was ist das</Label>
            <div className="flex flex-wrap gap-1.5">
              {ARTEN.map((a) => {
                const aktiv = a.wert === typ
                return (
                  <button
                    key={a.wert}
                    onClick={() => setTyp(a.wert)}
                    aria-pressed={aktiv}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-klein
                                font-medium transition-[background-color,border-color,color]
                                duration-[160ms] ease-[var(--ease-heraus)] ${
                                  aktiv
                                    ? 'border-gletscher-500/40 bg-gletscher-500/12 text-gletscher-300'
                                    : 'border-kante text-ink-400 hover:border-kante-stark hover:text-ink-200'
                                }`}
                  >
                    <a.icon size={14} strokeWidth={2} aria-hidden />
                    {a.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Feld label="Name" hinweis={`Leer lassen ergibt „${vorschlag}".`}>
            <Eingabe
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={vorschlag}
              maxLength={80}
              autoFocus
            />
          </Feld>

          <Feld label="Notiz" hinweis="Nur für dich sichtbar, solange der Punkt privat ist.">
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Windgeschützt, flacher Boden, Wasser 200 m weiter unten …"
              className="w-full resize-y rounded-mittel border border-kante bg-flaeche-1 px-3 py-2
                         text-fliess leading-relaxed text-ink-100 placeholder:text-ink-500
                         transition-colors duration-[160ms] hover:border-kante-stark
                         focus:border-gletscher-500 focus:outline-none focus:ring-2 focus:ring-gletscher-500/25"
            />
          </Feld>

          <div>
            <Label className="mb-1.5">Foto</Label>
            {fotoPfad ? (
              <div className="space-y-2">
                <PunktFoto pfad={fotoPfad} alt={name || vorschlag} />
                <Button
                  variante="geist" groesse="klein" icon={Trash2}
                  onClick={() => setFotoPfad(null)} disabled={beschaeftigt}
                >
                  Foto entfernen
                </Button>
              </div>
            ) : (
              <Button
                variante="sekundaer"
                icon={stand === 'foto' ? Loader2 : Camera}
                onClick={() => dateiFeld.current?.click()}
                disabled={beschaeftigt}
                breit
                className={stand === 'foto' ? '[&>svg]:animate-spin' : ''}
              >
                {stand === 'foto' ? 'Wird hochgeladen …' : 'Foto aufnehmen oder wählen'}
              </Button>
            )}
            <input
              ref={dateiFeld}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const datei = e.target.files?.[0]
                if (datei) void fotoWaehlen(datei)
                e.target.value = ''
              }}
            />
            <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
              Wird vor dem Hochladen verkleinert. Dabei fallen auch die versteckten
              Kameradaten weg — der Ort des Punktes ist der, den du gesetzt hast.
            </p>
          </div>

          <button
            onClick={() => setOeffentlich((v) => !v)}
            aria-pressed={oeffentlich}
            className="flex w-full items-start gap-3 rounded-mittel border border-kante bg-flaeche-1
                       px-3 py-2.5 text-left transition-colors duration-[160ms] hover:border-kante-stark"
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-klein border
                          transition-colors duration-[160ms] ${
                            oeffentlich
                              ? 'border-gletscher-400 bg-gletscher-300 text-ink-950'
                              : 'border-kante-stark text-transparent'
                          }`}
            >
              <Check size={13} strokeWidth={3} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-fliess font-medium text-ink-100">
                {oeffentlich ? <Globe size={14} strokeWidth={2} aria-hidden /> : <Lock size={14} strokeWidth={2} aria-hidden />}
                Für andere sichtbar machen
              </span>
              <span className="mt-0.5 block text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
                Standard ist privat. Veröffentlicht sind Name, Notiz, Ort und Foto für alle
                sichtbar — auch ohne Konto.
              </span>
            </span>
          </button>

          {fehler && <Hinweis ton="fehler">{fehler}</Hinweis>}
        </div>

        <div className="shrink-0 border-t border-kante px-5 py-4">
          <Button
            variante="primaer" groesse="gross" breit
            icon={stand === 'speichern' ? Loader2 : Check}
            onClick={() => void speichern()}
            disabled={beschaeftigt}
            className={stand === 'speichern' ? '[&>svg]:animate-spin' : ''}
          >
            {bearbeiten ? 'Änderungen sichern' : 'Punkt speichern'}
          </Button>
        </div>
      </div>
    </div>
  )
}
