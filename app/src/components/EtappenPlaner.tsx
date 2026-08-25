/**
 * Etappen und die Orte, an denen sie enden können.
 *
 * Zwei Dinge, die zusammengehören und vorher getrennt standen: die Einteilung
 * in Tage und die Liste der Schlafplätze entlang der Route. Wer die Nächte
 * selbst festlegt, wählt aus genau dieser Liste — und wer sie nur überfliegt,
 * um zu sehen, was unterwegs liegt, will von dort aus einen Stopp setzen
 * können, ohne den Ort auf der Karte erst wiederzufinden.
 *
 * Der automatische Vorschlag teilt nach sechs Gehstunden. Das ist eine
 * brauchbare erste Annahme und für die eigene Tour fast nie die richtige: die
 * Nacht liegt dort, wo eine Hütte steht, wo jemand schon gelegen hat oder wo
 * man erwartet wird — nicht dort, wo die Uhr abläuft.
 *
 * Die Auswahl ist Teil der Tour und wird mit ihr gespeichert (Migration 0021).
 */
import {
  Building2, CalendarClock, Hand, MapPin, MapPinPlus, Star, Tent, Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Position } from '../data/geo'
import type { LegalStatus, WegpunktArt } from '../data/types'
import type { Etappe, Etappenkandidat, Uebernachtung } from '../data/hiking'
import { formatDauer } from '../data/hiking'
import type { GespeicherteEtappe } from '../services/account'
import { Hinweis, Segmente } from '../ui'
import { STATUS_LABEL } from './ui'

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

const ART_ICON: Record<Uebernachtung['art'], LucideIcon> = {
  hut: Building2,
  campsite: Tent,
  vehicle_spot: Truck,
  eigen: Star,
  stopp: MapPin,
}

const ART_LABEL: Record<Uebernachtung['art'], string> = {
  hut: 'Hütte',
  campsite: 'Campingplatz',
  vehicle_spot: 'Stellplatz',
  eigen: 'Markierter Schlafplatz',
  stopp: 'Dein Stopp',
}

/** Nur die Farbe, nicht die volle Marke: in einer Zeile wäre die zu laut. */
const STATUS_FARBE: Record<LegalStatus, string> = {
  allowed: 'text-erlaubt-400',
  tolerated: 'text-geduldet-400',
  forbidden: 'text-verboten-400',
  unknown: 'text-ungeklaert-400',
}

/** Die Art des Ortes in die Sprache der Wegpunkte übersetzen. */
const ALS_WEGPUNKT: Record<Uebernachtung['art'], WegpunktArt> = {
  hut: 'hut',
  campsite: 'campsite',
  vehicle_spot: 'vehicle_spot',
  eigen: 'eigen',
  stopp: 'eigen',
}

interface Props {
  /** Die Etappen, wie sie gerade gelten — vorgeschlagen oder selbst gewählt. */
  etappen: Etappe[]
  /** Woraus sich wählen lässt, in der Reihenfolge der Strecke. */
  kandidaten: Etappenkandidat[]
  /** Die gewählten Nachtlager. `null` heisst: der Vorschlag gilt. */
  wahl: GespeicherteEtappe[] | null
  onWahl: (wahl: GespeicherteEtappe[] | null) => void
  /** Einen Ort in die Route übernehmen. Null bei einer importierten Spur. */
  onAlsStopp: ((position: Position, ort: { name: string; art: WegpunktArt }) => void) | null
  /** Welche Orte schon als Stopp in der Route stehen. */
  bereitsStopp: (position: Position) => boolean
}

export function EtappenPlaner({
  etappen, kandidaten, wahl, onWahl, onAlsStopp, bereitsStopp,
}: Props) {
  const selbst = wahl != null
  const gewaehlt = new Set((wahl ?? []).map((e) => schluessel(e.bei_m)))

  const umschalten = (k: Etappenkandidat) => {
    const bestand = wahl ?? []
    const drin = bestand.some((e) => schluessel(e.bei_m) === schluessel(k.bei_m))
    const neu = drin
      ? bestand.filter((e) => schluessel(e.bei_m) !== schluessel(k.bei_m))
      : [...bestand, { bei_m: k.bei_m, name: k.name, art: k.art, position: k.position }]
    onWahl(neu.sort((a, b) => a.bei_m - b.bei_m))
  }

  return (
    <>
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-fliess font-semibold text-ink-200">
            Etappen{etappen.length > 0 && ` (${etappen.length} ${etappen.length === 1 ? 'Tag' : 'Tage'})`}
          </h3>
          <Segmente
            ariaLabel="Wie die Etappen entstehen"
            wert={selbst ? 'selbst' : 'auto'}
            onWaehlen={(w) => onWahl(w === 'selbst' ? (wahl ?? []) : null)}
            optionen={[
              { wert: 'auto' as const, label: 'Vorschlag', icon: CalendarClock },
              { wert: 'selbst' as const, label: 'Selbst', icon: Hand },
            ]}
          />
        </div>

        {etappen.length === 0 ? (
          <p className="text-klein leading-relaxed text-ink-400">
            {selbst
              ? 'Noch keine Nacht gewählt — die Tour gilt als Tagesmarsch. Hak unten an, wo du schlafen willst.'
              : 'Die Tour passt in einen Tag; der Vorschlag teilt sie deshalb nicht auf.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {etappen.map((e) => (
              <li key={e.nummer} className="rounded-mittel bg-flaeche-1 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-fliess font-medium text-ink-50">Tag {e.nummer}</span>
                  <span className="text-mikro text-ink-500">
                    {formatKm(e.distance_m)} · {e.ascent_m} hm · {formatDauer(e.duration_s)}
                  </span>
                </div>
                <p className="mt-0.5 text-klein text-ink-400">
                  {e.schlafplatz ? (
                    <>
                      Nacht: {e.schlafplatz.name}
                      {e.schlafplatz.distance_m > 50 && ` (${formatKm(e.schlafplatz.distance_m)} vom Weg)`}
                      {' · '}{e.endhoehe_m} m
                      {e.schlafplatz.status && (
                        <span className={STATUS_FARBE[e.schlafplatz.status]}>
                          {' · '}{STATUS_LABEL[e.schlafplatz.status].toLowerCase()}
                        </span>
                      )}
                    </>
                  ) : e.nummer === etappen.length ? (
                    `Ziel erreicht, auf ${e.endhoehe_m} m.`
                  ) : (
                    'Keine erfasste Übernachtung in der Nähe — hier zählt die Rechtslage der Zone.'
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Die Orte selbst ---- */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-fliess font-semibold text-ink-200">Schlafplätze entlang der Route</h3>
          {selbst && kandidaten.length > 0 && (
            <span className="text-mikro normal-case tracking-normal text-ink-500">
              Angehakt = hier endet ein Tag
            </span>
          )}
        </div>

        {kandidaten.length === 0 ? (
          <Hinweis ton="info" icon={MapPin}>
            Entlang dieser Route ist nichts erfasst, woran sich eine Nacht festmachen liesse.
            Setz auf der Karte einen Stopp an der Stelle, an der du schlafen willst, oder
            markiere sie als eigenen Schlafplatz — beides erscheint dann hier.
          </Hinweis>
        ) : (
          <ul className="divide-y divide-kante overflow-hidden rounded-mittel border border-kante">
            {kandidaten.map((k) => {
              const Icon = ART_ICON[k.art]
              const an = gewaehlt.has(schluessel(k.bei_m))
              const schonStopp = bereitsStopp(k.position)
              return (
                <li key={k.id} className="flex items-center gap-2.5 px-3 py-2">
                  {selbst && (
                    <input
                      type="checkbox"
                      checked={an}
                      onChange={() => umschalten(k)}
                      aria-label={`In ${k.name} übernachten`}
                      className="h-4 w-4 shrink-0 accent-[var(--color-gletscher-400)]"
                    />
                  )}
                  <Icon size={15} strokeWidth={2} className="shrink-0 text-ink-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fliess text-ink-100">{k.name}</span>
                    <span className="block text-mikro normal-case tracking-normal text-ink-500">
                      {ART_LABEL[k.art]} · bei {formatKm(k.bei_m)}
                      {k.distance_m > 50 && ` · ${formatKm(k.distance_m)} neben der Route`}
                      <span className={STATUS_FARBE[k.status]}>
                        {' · '}{STATUS_LABEL[k.status].toLowerCase()}
                      </span>
                    </span>
                  </span>

                  {/*
                    Der kurze Weg von „das sieht gut aus" zu „da will ich hin".
                    Der Ort wird einsortiert, nicht angehängt — auf halber
                    Strecke ist er eine Station, nicht das neue Ziel.
                  */}
                  {onAlsStopp && (
                    <button
                      onClick={() => onAlsStopp(k.position, { name: k.name, art: ALS_WEGPUNKT[k.art] })}
                      disabled={schonStopp}
                      title={schonStopp ? 'Steht schon in der Route' : 'Als Stopp in die Route'}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1
                                 text-klein font-medium text-ink-400 ring-1 ring-kante
                                 transition-colors duration-[160ms] hover:bg-flaeche-3
                                 hover:text-ink-100 disabled:opacity-35
                                 disabled:hover:bg-transparent disabled:hover:text-ink-400"
                    >
                      <MapPinPlus size={13} strokeWidth={2.25} aria-hidden />
                      {schonStopp ? 'Im Weg' : 'Als Stopp'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
          Hütten und Campingplätze aus dem Datenbestand, dazu markierte Schlafplätze — eigene
          und geteilte. Die Rechtslage dahinter ist die der feinsten zuständigen Ebene an
          dieser Stelle; der Vorschlag meidet Verbotsgebiete.
        </p>
      </section>
    </>
  )
}

/**
 * Zwei Nachtlager sind dasselbe, wenn sie an derselben Stelle der Strecke
 * liegen. Auf zehn Meter gerundet, weil das Höhenprofil bei jedem Öffnen neu
 * geholt wird und seine Stützpunkte dann leicht anders liegen können.
 */
const schluessel = (bei_m: number) => Math.round(bei_m / 10)
