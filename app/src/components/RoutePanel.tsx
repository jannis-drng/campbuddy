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
import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Bike, Building2, Camera, Car, Check, Droplet,
  Eye, Flag, Footprints, MapPin, MountainSnow, MousePointerClick, Pencil, PencilOff, Star,
  Tag, Tent, Trash2, TriangleAlert, Truck, Undo2, Upload, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { lineLength, type Position } from '../data/geo'
import type { Wegpunkt, WegpunktArt } from '../data/types'
import { rolleVon, wegpunktName } from '../data/wegpunkte'

/** Symbol je Art des uebernommenen Ortes — dieselben wie auf der Karte. */
const WEGPUNKT_ICON: Record<WegpunktArt, LucideIcon> = {
  hut: Building2,
  campsite: Tent,
  vehicle_spot: Truck,
  peak: MountainSnow,
  wasser: Droplet,
  aussicht: Eye,
  eigen: Star,
}
import { formatDauer, type HikingStats } from '../data/hiking'
import { PROFILE_LABEL, SNAP_WARN_M, type RoutedPath, type RoutingProfile } from '../map/routing'
import { Button, Hinweis, IconButton, Label, Leer, Segmente } from '../ui'
import { ExportKnopf } from './ExportKnopf'

interface Props {
  route: Position[]
  waypoints: Wegpunkt[]
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
  /** Einen Stopp an eine andere Stelle der Reihenfolge setzen. */
  onMoveWaypointTo: (von: number, nach: number) => void
  /** Aus Start wird Ziel — dieselbe Strecke andersherum. */
  onReverseWaypoints: () => void
  /** Freier Name für einen Stopp; leer setzt ihn zurück. */
  onRenameWaypoint: (index: number, name: string) => void
  onImportGpx: (file: File) => void
  onAuswerten: () => void
  onClose: () => void
  /** Markiermodus für eigene Punkte und Fotos — null, wenn kein Konto da ist. */
  markieren: boolean
  onToggleMarkieren: (() => void) | null
  /**
   * Tritt zurück, solange etwas ausgewählt ist — offen bleibt das Panel.
   *
   * Auf dem Telefon liegen Routenpanel und Infokarte als Blätter an derselben
   * Stelle. Aber auch auf dem Tablet ist kein Platz für beide: 23 rem plus
   * 26 rem sind 784 px, und bei 768 px überlappten sie sich nicht nur, es
   * blieb kein Streifen Karte mehr übrig. Erst ab 1024 px passen beide
   * nebeneinander und lassen noch Karte dazwischen.
   */
  verdeckt?: boolean
  /**
   * Tritt auf dem Telefon ganz zurück, solange auf der Karte gezeichnet oder
   * markiert wird.
   *
   * Dort ist das Panel ein Blatt *über* der Karte, kein Nachbar daneben — wer
   * zeichnet, braucht die Karte und nicht die Liste. An seiner Stelle steht
   * dann `ZeichenLeiste`; ein Tippen auf „Fertig" holt das Blatt zurück, mit
   * Stopps, Reihenfolge und Namen.
   */
  aufKarte?: boolean
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

const PROFILE_ICONS = { foot: Footprints, bike: Bike, car: Car } as const

export function RoutePanel({
  route, waypoints, waypointCount, routed, routingBusy, profile, isImported,
  stats, hoehenBusy, drawing, error, markieren, verdeckt = false, aufKarte = false,
  onProfileChange, onToggleDrawing, onUndo, onClear, onRemoveWaypoint,
  onMoveWaypointTo, onReverseWaypoints, onRenameWaypoint,
  onImportGpx, onAuswerten, onClose, onToggleMarkieren,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)

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

        Jetzt begrenzt der Kartenbereich selbst: auf dem Telefon fast dessen
        volle Höhe als Blatt von unten, ab Tablet die volle Höhe als Spalte.
        Was nicht hineinpasst, scrollt innen (siehe `min-h-0 flex-1
        overflow-y-auto` weiter unten) — die Seite selbst nie.

        Dass das Blatt die Karte auf dem Telefon beinahe ganz verdeckt, ist
        jetzt richtig: gezeichnet wird ohne es (siehe `aufKarte`). Wer es
        offen hat, arbeitet an der Liste — und dafür war früher zu wenig Platz,
        weil ein Streifen Karte freigehalten wurde, den niemand brauchte.

        Das `overflow-y-auto` hier ist der letzte Ausweg für sehr flache
        Fenster: dort sind Kopfzeile und Fussleiste zusammen schon höher als
        der Kartenbereich, und der klebende Fuss mit „Tour auswerten" rutschte
        aus dem Bild. Im Normalfall greift es nie, weil der innere Bereich
        vorher nachgibt.
      */
      className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[calc(100%-2rem)] flex-col
                 overflow-y-auto rounded-t-riesig border border-kante bg-flaeche-2/97
                 shadow-[var(--shadow-4)] backdrop-blur-md
                 sm:inset-y-0 sm:right-auto sm:left-0 sm:max-h-none sm:w-[23rem]
                 sm:rounded-none sm:rounded-r-gross
                 ${aufKarte ? 'hidden sm:flex' : ''}
                 ${verdeckt ? 'hidden lg:flex' : ''}`}
      aria-label="Route"
    >
      {/*
        Nur der Name der Sache. Die Unterzeile „Zeichnen, dann auswerten"
        erklärte einen Ablauf, den die beiden Knöpfe darunter ohnehin zeigen —
        auf dem Telefon kostete sie eine ganze Zeile des knappsten Platzes.
      */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-kante px-5 py-3 sm:py-4">
        <h2 className="text-titel font-semibold leading-tight text-ink-50">Route</h2>
        <IconButton icon={X} label="Routenpanel schliessen" onClick={onClose} className="-mr-1.5" />
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
            <ExportKnopf
              route={route} wegpunkte={waypoints}
              beschriftung="Mitnehmen" className="flex-1"
            />
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
            <strong className="font-semibold">Tippen</strong> hängt hinten einen Stopp an ·{' '}
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
            Ein Stopp wurde {formatKm(routed.snapDistance_m)} auf den nächsten erfassten Weg
            verschoben. Die Auswertung gilt für die verschobene Strecke.
          </Hinweis>
        )}
        {routed && !routed.snapped && waypointCount >= 2 && (
          <Hinweis ton="warnung" icon={TriangleAlert}>
            Kein Weg-Routing möglich ({routed.fallbackReason}). Die Stopps sind nur gerade
            verbunden — Länge und Auswertung sind dadurch ungenau.
          </Hinweis>
        )}
        {error && <Hinweis ton="fehler" icon={TriangleAlert}>{error}</Hinweis>}

        {/* ---- Stopps ---- */}
        {waypoints.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label>Stopps ({waypoints.length})</Label>
              {waypoints.length >= 2 && (
                <button
                  onClick={onReverseWaypoints}
                  className="flex items-center gap-1 rounded-klein px-1.5 py-0.5 text-mikro
                             font-medium normal-case tracking-normal text-ink-400 transition-colors
                             duration-[160ms] hover:bg-flaeche-3 hover:text-ink-100"
                >
                  <ArrowUpDown size={12} strokeWidth={2.25} aria-hidden />
                  Richtung umkehren
                </button>
              )}
            </div>
            <ul className="divide-y divide-kante overflow-hidden rounded-mittel border border-kante bg-flaeche-1">
              {waypoints.map((w, i) => (
                <StoppZeile
                  key={i}
                  wegpunkt={w}
                  index={i}
                  anzahl={waypoints.length}
                  onHoch={() => onMoveWaypointTo(i, i - 1)}
                  onRunter={() => onMoveWaypointTo(i, i + 1)}
                  onUmbenennen={(name) => onRenameWaypoint(i, name)}
                  onEntfernen={() => onRemoveWaypoint(i)}
                />
              ))}
            </ul>
            {/*
              Auf dem Telefon der eine Satz, der hier etwas erklärt, was man
              nicht sieht. Der Rest — Ziehen, Rechtsklick, Umwege — beschreibt
              Handgriffe am Zeiger und stand dort als siebenzeiliger Block über
              der Stopp-Liste, dem eigentlichen Inhalt dieses Blattes.
            */}
            <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal
                          text-ink-500 sm:hidden">
              Über das Schild lässt sich jeder Stopp frei benennen („Schlafplatz", „Mittag"),
              mit den Pfeilen umsortieren.
            </p>
            <p className="mt-1.5 hidden text-mikro normal-case leading-relaxed tracking-normal
                          text-ink-500 sm:block">
              Ein Tippen auf eine Hütte, einen Gipfel, eine Quelle oder eine eigene Markierung
              übernimmt sie als Stopp — mit Namen. Über das Schild lässt sich jeder Stopp frei
              benennen („Schlafplatz", „Mittag"), mit den Pfeilen umsortieren. Auf der Karte
              lassen sie sich verschieben, Rechtsklick entfernt sie; für einen Umweg die Linie
              an der gewünschten Stelle anfassen und ziehen.
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
        /*
          Der Abschluss ist auf dem Telefon eine Zeile, am Zeiger ein Block.

          Länge, Gehzeit und „Tour auswerten" standen dort untereinander und
          belegten mit dem Erklärsatz darunter fast ein Drittel des Blattes —
          Platz, der der Stopp-Liste fehlte. Nebeneinander sagen sie dasselbe
          in einem Viertel der Höhe; der Erklärsatz bleibt dem Zeiger, wo er
          nichts verdrängt.
        */
        <div className="shrink-0 border-t border-kante bg-flaeche-2 px-5 py-3 sm:py-4">
          {/* Telefon: eine Zeile. Zahl, Zahl, Knopf — mehr passt nicht, mehr braucht es nicht. */}
          <div className="flex items-center gap-3 sm:hidden">
            <p className="min-w-0 flex-1 truncate text-klein text-ink-400">
              <span className="font-semibold text-ink-50">{formatKm(laenge)}</span>
              {' · '}
              <span className="font-semibold text-ink-50">
                {stats ? formatDauer(stats.duration_s) : hoehenBusy ? '…' : '—'}
              </span>
            </p>
            <Button
              variante="primaer" icon={ArrowRight} onClick={onAuswerten}
              className="shrink-0 whitespace-nowrap"
            >
              Auswerten
            </Button>
          </div>

          {/* Zeiger: die Werte gross, der Knopf über die Breite. */}
          <div className="hidden sm:block">
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

            <Button
              variante="primaer" groesse="gross" breit icon={ArrowRight} onClick={onAuswerten}
              className="mt-3"
            >
              Tour auswerten
            </Button>
          </div>

          <p className="mt-3 hidden text-mikro normal-case leading-relaxed tracking-normal
                        text-ink-500 sm:block">
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

/* ---------------------------------------------------------------- Stopps */

/**
 * Eine Zeile der Stopp-Liste.
 *
 * Zwei Dinge, die vorher fehlten und ohne die eine Mehrtagestour nicht zu
 * planen war: die Reihenfolge ändern und einem Punkt einen eigenen Namen
 * geben. Beides direkt in der Zeile — ein Dialog für „heisst jetzt
 * Schlafplatz" wäre mehr Weg als Nutzen.
 *
 * Die Knöpfe sind auf dem Telefon immer sichtbar und werden am Zeiger erst
 * beim Überfahren deutlich: mit dem Finger gibt es kein Überfahren, und ein
 * Knopf, den man nicht sieht, existiert dort nicht.
 */
function StoppZeile({
  wegpunkt, index, anzahl, onHoch, onRunter, onUmbenennen, onEntfernen,
}: {
  wegpunkt: Wegpunkt
  index: number
  anzahl: number
  onHoch: () => void
  onRunter: () => void
  onUmbenennen: (name: string) => void
  onEntfernen: () => void
}) {
  const [bearbeitet, setBearbeitet] = useState(false)
  const [entwurf, setEntwurf] = useState('')
  const feld = useRef<HTMLInputElement>(null)

  useEffect(() => { if (bearbeitet) feld.current?.select() }, [bearbeitet])

  const start = index === 0
  const ziel = index === anzahl - 1
  const rolle = rolleVon(index, anzahl)
  const titel = wegpunktName(wegpunkt, index, anzahl)
  const Symbol = start ? MapPin : ziel ? Flag : null
  const OrtIcon = wegpunkt.ort ? WEGPUNKT_ICON[wegpunkt.ort.art] : null

  const uebernehmen = () => { onUmbenennen(entwurf); setBearbeitet(false) }

  if (bearbeitet) {
    return (
      <li className="flex items-center gap-1.5 px-2.5 py-2">
        <input
          ref={feld}
          value={entwurf}
          onChange={(e) => setEntwurf(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') uebernehmen()
            if (e.key === 'Escape') setBearbeitet(false)
          }}
          maxLength={60}
          placeholder={wegpunkt.ort?.name ?? rolle}
          aria-label={`Name für ${rolle}`}
          className="h-8 min-w-0 flex-1 rounded-klein border border-gletscher-500 bg-flaeche-2 px-2
                     text-klein text-ink-100 placeholder:text-ink-600 focus:outline-none
                     focus:ring-2 focus:ring-gletscher-500/25"
        />
        <IconButton icon={Check} groesse="klein" label="Namen übernehmen" onClick={uebernehmen} />
        <IconButton icon={X} groesse="klein" label="Abbrechen" onClick={() => setBearbeitet(false)} />
      </li>
    )
  }

  return (
    <li className="group flex items-center gap-2 px-2.5 py-1.5">
      {Symbol ? (
        <Symbol
          size={14} strokeWidth={2.25} aria-hidden
          className={`shrink-0 ${start ? 'text-erlaubt-400' : 'text-verboten-400'}`}
        />
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border
                         border-ink-500 text-mikro font-semibold tracking-normal
                         text-ink-400" aria-hidden>
          {index}
        </span>
      )}

      {/*
        Hat der Stopp einen Namen, steht er vorn und die Rolle dahinter:
        „Cabane de Moiry · Start" liest sich als Ort, „Start · Cabane de
        Moiry" als Formularfeld.
      */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {OrtIcon && !wegpunkt.name && (
          <OrtIcon size={12} strokeWidth={2} className="shrink-0 text-ink-500" aria-hidden />
        )}
        <span className="min-w-0 truncate text-klein text-ink-200">{titel}</span>
        {titel !== rolle && (
          <span className="shrink-0 text-mikro normal-case tracking-normal text-ink-600">{rolle}</span>
        )}
      </span>

      <div className="flex shrink-0 items-center opacity-100 transition-opacity duration-[160ms]
                      sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100">
        <ZeilenKnopf icon={ArrowUp} label={`${rolle} nach oben`} onClick={onHoch} disabled={index === 0} />
        <ZeilenKnopf icon={ArrowDown} label={`${rolle} nach unten`} onClick={onRunter}
                     disabled={index === anzahl - 1} />
        <ZeilenKnopf
          icon={Tag}
          label={`${rolle} benennen`}
          onClick={() => { setEntwurf(wegpunkt.name ?? ''); setBearbeitet(true) }}
        />
        <ZeilenKnopf icon={X} label={`${rolle} entfernen`} onClick={onEntfernen} gefahr />
      </div>
    </li>
  )
}

function ZeilenKnopf({
  icon: Icon, label, onClick, disabled, gefahr,
}: {
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; gefahr?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-klein p-1 text-ink-500 transition-colors duration-[160ms]
                  disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink-500
                  ${gefahr
                    ? 'hover:bg-verboten-500/12 hover:text-verboten-400'
                    : 'hover:bg-flaeche-3 hover:text-ink-100'}`}
    >
      <Icon size={13} strokeWidth={2.5} aria-hidden />
    </button>
  )
}
