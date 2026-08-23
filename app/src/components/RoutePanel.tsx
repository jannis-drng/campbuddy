/**
 * Route zeichnen (Abschnitt 4.2).
 *
 * Bewusst schlank: beim Zeichnen zeigt das Panel nur Länge und Gehzeit. Die
 * vollständige Auswertung — Legalität, Profil, Etappen, Ausrüstung, Wetter —
 * öffnet sich erst auf Knopfdruck als eigenes Fenster. Sonst zappelten bei
 * jedem gesetzten Wegpunkt zwei Bildschirmhöhen Inhalt.
 *
 * Die Werkzeuge sind nach Häufigkeit gestaffelt: Zeichnen ist die eine
 * primäre Aktion, Rückgängig und Löschen liegen daneben, Import und Export
 * als leiseste Stufe darunter.
 */
import { useRef } from 'react'
import {
  ArrowRight, Bike, Camera, Car, Download, Flag, Footprints, MapPin, MousePointerClick,
  Pencil, PencilOff, Trash2, TriangleAlert, Undo2, Upload, X,
} from 'lucide-react'
import { lineLength, type Position } from '../data/geo'
import { formatDauer, type HikingStats } from '../data/hiking'
import { PROFILE_LABEL, SNAP_WARN_M, type RoutedPath, type RoutingProfile } from '../map/routing'
import { toGpx } from '../services/gpx'
import { Button, Hinweis, IconButton, Label, Leer, Segmente } from '../ui'

interface Props {
  route: Position[]
  waypoints: Position[]
  waypointCount: number
  routed: RoutedPath | null
  routingBusy: boolean
  profile: RoutingProfile
  isImported: boolean
  stats: HikingStats | null
  hoehenBusy: boolean
  drawing: boolean
  error: string | null
  onProfileChange: (p: RoutingProfile) => void
  onToggleDrawing: () => void
  onUndo: () => void
  onClear: () => void
  onRemoveWaypoint: (index: number) => void
  onImportGpx: (file: File) => void
  onAuswerten: () => void
  onClose: () => void
  /** Markiermodus für eigene Punkte und Fotos — null, wenn kein Konto da ist. */
  markieren: boolean
  onToggleMarkieren: (() => void) | null
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

const PROFILE_ICONS = { foot: Footprints, bike: Bike, car: Car } as const

export function RoutePanel({
  route, waypoints, waypointCount, routed, routingBusy, profile, isImported,
  stats, hoehenBusy, drawing, error, markieren,
  onProfileChange, onToggleDrawing, onUndo, onClear, onRemoveWaypoint,
  onImportGpx, onAuswerten, onClose, onToggleMarkieren,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)

  const gpxSpeichern = () => {
    const blob = new Blob([toGpx(route)], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'campbuddy-route.gpx'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Aus der Geometrie, nicht aus dem Routing-Ergebnis: eine importierte
  // GPX-Spur wird nicht geroutet und hätte dort keine Länge.
  const laenge = route.length >= 2 ? lineLength(route) : 0

  return (
    <aside
      /*
        Die Höhe kommt vom Kartenbereich, nicht vom Fenster.

        Vorher stand hier `max-h-[68vh]` und am Rand `sm:bottom-auto`. Beides
        war falsch: `vh` rechnet ohne Kopfzeile, Filterleiste und die
        Tableiste am unteren Rand, und `bottom-auto` hob das `bottom-0` aus
        `inset-y-0` wieder auf — das Panel wuchs dann mit seinem Inhalt aus
        dem Bild heraus und schob die ganze Seite ins Scrollen.

        Jetzt begrenzt der Kartenbereich selbst: auf dem Telefon 70 % davon
        als Blatt von unten, ab Tablet die volle Höhe als Spalte. Was nicht
        hineinpasst, scrollt innen (siehe `min-h-0 flex-1 overflow-y-auto`
        weiter unten) — die Seite selbst nie.

        Das `overflow-y-auto` hier ist der letzte Ausweg für sehr flache
        Fenster: dort sind Kopfzeile und Fussleiste zusammen schon höher als
        der Kartenbereich, und der klebende Fuss mit „Tour auswerten" rutschte
        aus dem Bild. Im Normalfall greift es nie, weil der innere Bereich
        vorher nachgibt.
      */
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col overflow-y-auto rounded-t-riesig border
                 border-kante bg-flaeche-2/97 shadow-[var(--shadow-4)] backdrop-blur-md
                 sm:inset-y-0 sm:right-auto sm:left-0 sm:max-h-none sm:w-[23rem]
                 sm:rounded-none sm:rounded-r-gross"
      aria-label="Route"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-kante px-5 py-4">
        <div>
          <h2 className="text-titel font-semibold leading-tight text-ink-50">Route</h2>
          <p className="mt-0.5 text-klein text-ink-400">Zeichnen, dann auswerten</p>
        </div>
        <IconButton icon={X} label="Routenpanel schliessen" onClick={onClose} className="-mr-1.5 -mt-1" />
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* ---- Fortbewegungsart ---- */}
        <div>
          <Label className="mb-1.5">Unterwegs</Label>
          <Segmente
            ariaLabel="Fortbewegungsart"
            wert={profile}
            onWaehlen={onProfileChange}
            optionen={(['foot', 'bike', 'car'] as RoutingProfile[]).map((p) => ({
              wert: p, label: PROFILE_LABEL[p], icon: PROFILE_ICONS[p],
              titel: isImported ? 'Bei importierten Spuren ohne Wirkung' : undefined,
            }))}
            className={isImported ? 'pointer-events-none opacity-40' : ''}
          />
        </div>

        {/* ---- Werkzeuge ---- */}
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <Button
              variante={drawing ? 'primaer' : 'sekundaer'}
              icon={drawing ? PencilOff : Pencil}
              onClick={onToggleDrawing}
              aria-pressed={drawing}
              className="flex-1"
            >
              {drawing ? 'Zeichnen beenden' : 'Route zeichnen'}
            </Button>
            <IconButton icon={Undo2} label="Letzten Punkt zurücknehmen"
                        variante="sekundaer" onClick={onUndo} disabled={waypoints.length === 0} />
            <IconButton icon={Trash2} label="Route löschen"
                        variante="sekundaer" onClick={onClear} disabled={route.length === 0} />
          </div>

          {onToggleMarkieren && (
            <Button
              variante={markieren ? 'primaer' : 'sekundaer'}
              icon={Camera}
              onClick={onToggleMarkieren}
              aria-pressed={markieren}
              breit
            >
              {markieren ? 'Markieren beenden' : 'Punkt oder Foto markieren'}
            </Button>
          )}

          <div className="flex gap-1.5">
            <Button variante="geist" groesse="klein" icon={Upload}
                    onClick={() => fileInput.current?.click()} className="flex-1">
              GPX laden
            </Button>
            <Button variante="geist" groesse="klein" icon={Download}
                    onClick={gpxSpeichern} disabled={route.length < 2} className="flex-1">
              GPX sichern
            </Button>
            <input
              ref={fileInput} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImportGpx(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {/* ---- Zustände ---- */}
        {drawing && (
          <Hinweis ton="info" icon={MousePointerClick}>
            <strong className="font-semibold">Tippen</strong> hängt hinten einen Wegpunkt an ·{' '}
            <strong className="font-semibold">Punkt ziehen</strong> verschiebt ihn ·{' '}
            <strong className="font-semibold">Linie ziehen</strong> baut an dieser Stelle einen
            Umweg ein. Dazwischen wird auf reale Wege geroutet.
            {profile === 'foot' && ' Wanderwege werden gegenüber Strassen bevorzugt.'}
          </Hinweis>
        )}
        {markieren && (
          <Hinweis ton="info" icon={Camera}>
            Tippe die Stelle in der Karte an, die du markieren willst — Aussicht, Schlafplatz,
            Wasserstelle oder Foto.
          </Hinweis>
        )}
        {routingBusy && (
          <p className="flex items-center gap-2 text-klein text-ink-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-600 border-t-gletscher-400" aria-hidden />
            Weg wird gesucht …
          </p>
        )}
        {routed?.snapped && routed.snapDistance_m != null && routed.snapDistance_m > SNAP_WARN_M && (
          <Hinweis ton="warnung" icon={TriangleAlert}>
            Ein Wegpunkt wurde {formatKm(routed.snapDistance_m)} auf den nächsten erfassten Weg
            verschoben. Die Auswertung gilt für die verschobene Strecke.
          </Hinweis>
        )}
        {routed && !routed.snapped && waypointCount >= 2 && (
          <Hinweis ton="warnung" icon={TriangleAlert}>
            Kein Weg-Routing möglich ({routed.fallbackReason}). Die Wegpunkte sind nur gerade
            verbunden — Länge und Auswertung sind dadurch ungenau.
          </Hinweis>
        )}
        {error && <Hinweis ton="fehler" icon={TriangleAlert}>{error}</Hinweis>}

        {/* ---- Wegpunkte ---- */}
        {waypoints.length > 0 && (
          <section>
            <Label className="mb-1.5">Wegpunkte ({waypoints.length})</Label>
            <ul className="divide-y divide-kante overflow-hidden rounded-mittel border border-kante bg-flaeche-1">
              {waypoints.map((_, i) => {
                const start = i === 0
                const ziel = i === waypoints.length - 1
                const rolle = start ? 'Start' : ziel ? 'Ziel' : `Zwischenstopp ${i}`
                const Symbol = start ? MapPin : ziel ? Flag : null
                return (
                  <li key={i} className="group flex items-center gap-2.5 px-2.5 py-2">
                    {Symbol ? (
                      <Symbol
                        size={14} strokeWidth={2.25} aria-hidden
                        className={start ? 'text-erlaubt-400' : 'text-verboten-400'}
                      />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border
                                       border-ink-500 text-mikro font-semibold tracking-normal
                                       text-ink-400" aria-hidden>
                        {i}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-klein text-ink-200">{rolle}</span>
                    <button
                      onClick={() => onRemoveWaypoint(i)}
                      aria-label={`${rolle} entfernen`}
                      className="shrink-0 rounded-klein p-1 text-ink-600 opacity-0 transition-all
                                 duration-[160ms] hover:bg-verboten-500/12 hover:text-verboten-400
                                 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <X size={13} strokeWidth={2.5} aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
              Wegpunkte lassen sich auf der Karte verschieben, Rechtsklick entfernt sie. Um einen
              Umweg einzubauen, die Linie an der gewünschten Stelle anfassen und ziehen.
            </p>
          </section>
        )}
      </div>

      {/* ---- Abschluss: klebt unten, damit die Hauptaktion immer erreichbar ist ---- */}
      {route.length < 2 ? (
        <div className="shrink-0 border-t border-kante px-5 py-4">
          <Leer
            icon={Pencil}
            titel="Noch keine Route"
            text="Zeichne eine Route auf der Karte oder importiere eine GPX-Datei aus deinem Tourenplaner."
          />
        </div>
      ) : (
        <div className="shrink-0 space-y-3 border-t border-kante bg-flaeche-2 px-5 py-4">
          <div className="flex gap-6">
            <div>
              <Label>Länge</Label>
              <p className="mt-0.5 text-titel font-semibold text-ink-50">{formatKm(laenge)}</p>
            </div>
            <div>
              <Label>Gehzeit</Label>
              <p className="mt-0.5 text-titel font-semibold text-ink-50">
                {stats ? formatDauer(stats.duration_s) : hoehenBusy ? '…' : '—'}
              </p>
            </div>
          </div>

          <Button variante="primaer" groesse="gross" breit icon={ArrowRight} onClick={onAuswerten}>
            Tour auswerten
          </Button>
          <p className="text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
            Rechtslage entlang der Route, Höhenprofil, Etappen, Ausrüstung, Verpflegung und Wetter.
            {routed?.anbieter === 'osrm' && profile === 'foot' && (
              <> Der bevorzugte Wanderweg-Router war nicht erreichbar; diese Route folgt
              der kürzesten Strecke und nutzt eher Strassen.</>
            )}
          </p>
        </div>
      )}
    </aside>
  )
}
