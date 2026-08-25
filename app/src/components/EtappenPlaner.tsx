/**
 * Etappen: der Vorschlag — oder die eigene Einteilung.
 *
 * Der automatische Vorschlag teilt nach sechs Gehstunden. Das ist eine
 * brauchbare erste Annahme und für die eigene Tour fast nie die richtige: die
 * Nacht liegt dort, wo eine Hütte steht, wo Wasser ist oder wo man erwartet
 * wird — nicht dort, wo die Uhr abläuft. Wer das weiss, wählt hier die
 * Nachtlager selbst; Strecke, Aufstieg und Gehzeit je Tag ergeben sich daraus.
 *
 * Die Auswahl ist Teil der Tour und wird mit ihr gespeichert (Migration 0021).
 */
import { Building2, CalendarClock, Hand, MapPin, Star, Tent, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Etappe, Etappenkandidat, Uebernachtung } from '../data/hiking'
import { formatDauer } from '../data/hiking'
import type { GespeicherteEtappe } from '../services/account'
import { Hinweis, Label, Segmente } from '../ui'

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
  eigen: 'Eigene Markierung',
  stopp: 'Dein Stopp',
}

interface Props {
  /** Die Etappen, wie sie gerade gelten — vorgeschlagen oder selbst gewählt. */
  etappen: Etappe[]
  /** Woraus sich wählen lässt: Hütten, Plätze und eigene Stopps entlang der Route. */
  kandidaten: Etappenkandidat[]
  /** Die gewählten Nachtlager. `null` heisst: der Vorschlag gilt. */
  wahl: GespeicherteEtappe[] | null
  onWahl: (wahl: GespeicherteEtappe[] | null) => void
}

export function EtappenPlaner({ etappen, kandidaten, wahl, onWahl }: Props) {
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

      {selbst && (
        <div className="mb-3">
          <Label className="mb-1.5">Wo übernachtest du?</Label>
          {kandidaten.length === 0 ? (
            <Hinweis ton="info" icon={MapPin}>
              Entlang dieser Route ist nichts erfasst, woran sich eine Nacht festmachen
              liesse. Setz auf der Karte einen Stopp an der Stelle, an der du schlafen
              willst — er erscheint dann hier.
            </Hinweis>
          ) : (
            <>
              <ul className="max-h-64 divide-y divide-kante overflow-y-auto rounded-mittel
                             border border-kante bg-flaeche-1">
                {kandidaten.map((k) => {
                  const Icon = ART_ICON[k.art]
                  const an = gewaehlt.has(schluessel(k.bei_m))
                  return (
                    <li key={k.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2
                                        transition-colors duration-[160ms] hover:bg-flaeche-3">
                        <input
                          type="checkbox"
                          checked={an}
                          onChange={() => umschalten(k)}
                          className="h-4 w-4 shrink-0 accent-[var(--color-gletscher-400)]"
                        />
                        <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-500" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-fliess text-ink-100">{k.name}</span>
                          <span className="block text-mikro normal-case tracking-normal text-ink-500">
                            {ART_LABEL[k.art]} · bei {formatKm(k.bei_m)}
                            {k.distance_m > 50 && ` · ${formatKm(k.distance_m)} neben der Route`}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-1.5 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
                Jede angehakte Stelle beendet einen Tag. Ohne Haken ist die Tour ein
                Tagesmarsch — das Ziel selbst zählt nicht als Nacht.
              </p>
            </>
          )}
        </div>
      )}

      {etappen.length === 0 ? (
        <p className="text-klein leading-relaxed text-ink-400">
          {selbst
            ? 'Noch keine Nacht gewählt — die Tour gilt als Tagesmarsch.'
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
                {e.schlafplatz
                  ? `Nacht: ${e.schlafplatz.name}`
                  : e.nummer === etappen.length
                    ? `Ziel erreicht, auf ${e.endhoehe_m} m.`
                    : 'Keine erfasste Übernachtung in der Nähe — hier zählt die Rechtslage der Zone.'}
                {e.schlafplatz && e.schlafplatz.distance_m > 50
                  && ` (${formatKm(e.schlafplatz.distance_m)} vom Weg)`}
                {e.schlafplatz && ` · ${e.endhoehe_m} m`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Zwei Nachtlager sind dasselbe, wenn sie an derselben Stelle der Strecke
 * liegen. Auf zehn Meter gerundet, weil das Höhenprofil bei jedem Öffnen neu
 * geholt wird und seine Stützpunkte dann leicht anders liegen können.
 */
const schluessel = (bei_m: number) => Math.round(bei_m / 10)
