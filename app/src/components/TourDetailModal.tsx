/**
 * Die vollständige Auswertung einer fertig gezeichneten Route.
 *
 * Beim Zeichnen zeigt das Seitenpanel bewusst nur Länge und Gehzeit — alles
 * andere würde bei jedem gesetzten Wegpunkt zappeln. Erst wenn die Route steht,
 * öffnet sich hier das ganze Bild: Legalität, Profil, Etappen, Ausrüstung,
 * Verpflegung und Wetter.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Position } from '../data/geo'
import type { Peak, Point, Region, TripParams, Wegpunkt } from '../data/types'
import { tournameVorschlaege } from '../data/tourname'
import { NEARBY_RADIUS_M, summarise, type RouteAnalysis } from '../data/routeAnalysis'
import {
  etappenkandidaten, etappenNachZielen, formatDauer, schlafhoehe,
  type Etappe, type Etappenkandidat, type HikingStats,
} from '../data/hiking'
import type { PackStand, PackStaende } from '../affiliate/packlist'
import type { GespeicherteEtappe } from '../services/account'
import { wegpunktName } from '../data/wegpunkte'
import { EtappenPlaner } from './EtappenPlaner'
import type { ElevationPoint } from '../services/elevation'
import { ElevationProfile } from './ElevationProfile'
import { TripPlanner, type Abgeleitet } from './TripPlanner'
import { Shuffle, X } from 'lucide-react'
import { Button, IconButton, Stufen } from '../ui'
import { StatusBadge } from './ui'
import { ExportKnopf } from './ExportKnopf'

interface Props {
  offen: boolean
  onClose: () => void
  region: Region
  route: Position[]
  analysis: RouteAnalysis
  stats: HikingStats | null
  profil: ElevationPoint[]
  etappen: Etappe[]
  hoehenBusy: boolean
  hoehenFehler: string | null
  /** Die gesetzten Wegpunkte — Grundlage für den Namensvorschlag. */
  wegpunkte: Wegpunkt[]
  points: Point[]
  peaks: Peak[]
  /**
   * Speichert Verlauf und Eckdaten in einem Zug. Vorher standen hier zwei
   * Formulare — „Route speichern" und „Tour speichern" — und niemand konnte
   * sagen, was der Unterschied sein sollte. Seit Migration 0016 ist es eine
   * Sache. null = kein Backend oder nicht angemeldet.
   */
  onSaveTour: ((
    name: string,
    trip: TripParams,
    packliste: PackStaende,
    etappen: GespeicherteEtappe[] | null,
  ) => Promise<void>) | null
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

/**
 * Rang der Schwierigkeit als Stufenzahl statt als Ampelfarbe: Grün, Gelb und
 * Rot gehören in dieser App der Rechtslage. Ein oranges „schwer" sähe aus wie
 * ein Hinweis auf eine Grauzone.
 */
const SCHWIERIGKEIT_STUFE = {
  leicht: 1, mittel: 2, schwer: 3, 'sehr schwer': 4,
} as const

export function TourDetailModal({
  offen, onClose, region, analysis, stats, profil, etappen,
  hoehenBusy, hoehenFehler, wegpunkte, points, peaks, onSaveTour, route,
}: Props) {
  const [speicherStand, setSpeicherStand] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null)
  // Die Eckdaten leben weiter im Planer; hier liegt nur die letzte Fassung,
  // damit der eine Speicherknopf sie mitgeben kann.
  const [trip, setTrip] = useState<TripParams | null>(null)
  /** Welcher der Vorschläge gerade steht. */
  const [vorschlagNr, setVorschlagNr] = useState(0)
  /** Nur gesetzt, wenn jemand den Namen von Hand angefasst hat. */
  const [eigenerName, setEigenerName] = useState<string | null>(null)
  /** Stand der Checkliste. Wird mit der Tour gespeichert. */
  const [staende, setStaende] = useState<PackStaende>({})
  /** Selbst gewählte Nachtlager; `null` heisst „automatischer Vorschlag". */
  const [etappenWahl, setEtappenWahl] = useState<GespeicherteEtappe[] | null>(null)

  const standSetzen = useCallback((id: string, stand: PackStand | null) => {
    setStaende((alt) => {
      const neu = { ...alt }
      if (stand) neu[id] = stand
      else delete neu[id]
      return neu
    })
  }, [])

  /*
    Woraus sich Nachtlager wählen lassen: die erfassten Punkte in Routennähe
    und die selbst gesetzten Stopps. Beide in derselben Liste, weil die Frage
    dieselbe ist — hier oder dort die Nacht? — und die Herkunft nur als
    Kennzeichnung dahinter steht.
  */
  const kandidaten = useMemo<Etappenkandidat[]>(() => {
    if (profil.length < 2) return []
    const ausPunkten = analysis.nearby.map(({ point, distance }) => ({
      id: `punkt-${point.id}`,
      name: point.name,
      position: [point.lng, point.lat] as Position,
      distance_m: Math.round(distance),
      art: (point.type === 'hut' || point.type === 'campsite' || point.type === 'vehicle_spot'
        ? point.type
        : 'stopp') as Etappenkandidat['art'],
    }))
    // Namenlose Klicks auf freie Fläche sind Form der Linie, kein Ort — sie
    // taugen nicht als „hier schlafe ich".
    const ausStopps = wegpunkte
      .map((w, i) => ({ w, name: wegpunktName(w, i, wegpunkte.length), i }))
      .filter(({ w }) => Boolean(w.name?.trim() || w.ort))
      .map(({ w, name, i }) => ({
        id: `stopp-${i}`,
        name,
        position: w.position,
        distance_m: 0,
        art: (w.ort?.art === 'hut' || w.ort?.art === 'campsite' || w.ort?.art === 'vehicle_spot'
          ? w.ort.art
          : w.ort?.art === 'eigen' ? 'eigen' : 'stopp') as Etappenkandidat['art'],
      }))
    return etappenkandidaten(profil, [...ausStopps, ...ausPunkten])
  }, [profil, analysis.nearby, wegpunkte])

  /** Was gerade gilt: die selbst gewählte Einteilung oder der Vorschlag. */
  const etappenAktuell = useMemo(
    () => (etappenWahl
      ? etappenNachZielen(profil, etappenWahl.map((e) => ({
          bei_m: e.bei_m,
          uebernachtung: { name: e.name, art: e.art, position: e.position, distance_m: 0 },
        })))
      : etappen),
    [etappenWahl, profil, etappen],
  )

  /*
    Der Name entsteht aus der Tour selbst — aus den angetippten Orten, dem
    höchsten Gipfel am Weg und der durchquerten Zone. Einen Titel zu erfinden
    war die letzte Hürde vor dem Speichern und die unnötigste: die Tour weiss
    selbst, wo sie langgeht.
  */
  const vorschlaege = useMemo(
    () => tournameVorschlaege({
      wegpunkte, route, points, peaks, crossed: analysis.crossed, etappen,
    }),
    [wegpunkte, route, points, peaks, analysis.crossed, etappen],
  )
  const name = eigenerName ?? vorschlaege[vorschlagNr % vorschlaege.length] ?? ''

  // Escape schliesst — bei einem bildfüllenden Fenster erwartet man das.
  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offen, onClose])

  /**
   * Was die Route bereits entscheidet: Tage aus den Etappen, Schlafhöhe aus
   * dem Höhenprofil, Hüttentour aus den gewählten Nachtlagern.
   *
   * Das waren früher Eingabefelder im Planer — mit dem Ergebnis, dass sich
   * „7 Tage" neben einer Etappenplanung über drei einstellen liess. Jetzt
   * folgen sie der Tour.
   */
  const abgeleitet = useMemo<Abgeleitet>(() => {
    const naechte = etappenAktuell.filter((e) => e.schlafplatz != null)
    return {
      days: Math.max(1, etappenAktuell.length || 1),
      elevation: Math.max(0, Math.round(schlafhoehe(etappenAktuell, stats?.max_ele ?? 0))),
      huettenTour: naechte.length > 0 && naechte.every((e) => e.schlafplatz?.art === 'hut'),
    }
  }, [etappenAktuell, stats])

  if (!offen) return null

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onSaveTour || !name.trim() || !trip) return
    setSpeicherStand('busy'); setSpeicherFehler(null)
    try {
      await onSaveTour(name.trim(), trip, staende, etappenWahl)
      setSpeicherStand('ok')
    } catch (err) {
      setSpeicherStand('error'); setSpeicherFehler((err as Error).message)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Tour-Auswertung"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <header className="flex items-start justify-between gap-3 border-b border-kante px-5 py-4">
          <div>
            <h2 className="text-titel font-semibold text-ink-50">Deine Tour</h2>
            <p className="text-fliess text-ink-400">
              {formatKm(analysis.length_m)}
              {stats && ` · ${formatDauer(stats.duration_s)}`}
              {etappenAktuell.length > 1 && ` · ${etappenAktuell.length} Tage`}
            </p>
          </div>
          {/*
            Der Export sitzt im Kopf, nicht unten beim Speichern: Speichern
            braucht ein Konto, Mitnehmen nicht — und wer die Tour gleich aufs
            Gerät holen will, soll dafür nicht durch die ganze Auswertung
            scrollen. Der Name der Tour ist derselbe, den das Formular unten
            vorschlägt; er wird Dateiname und Spurname im fremden Planer.
          */}
          <div className="-mt-0.5 flex shrink-0 items-center gap-1.5">
            <ExportKnopf
              route={route} wegpunkte={wegpunkte} name={name.trim() || 'CampBuddy-Route'}
              variante="sekundaer" groesse="mittel"
            />
            <IconButton icon={X} label="Auswertung schliessen" onClick={onClose} className="-mr-1.5 -mt-0.5" />
          </div>
        </header>

        <div className="space-y-7 overflow-y-auto px-5 py-5">
          {/* ---- Legalität zuerst: das ist der Kern der App ---- */}
          <section>
            <h3 className="mb-1.5 text-fliess font-semibold text-ink-200">Wo darfst du schlafen?</h3>
            <p className="text-fliess leading-relaxed text-ink-300">
              {summarise(analysis, region.legal_framework.baseline_status)}
            </p>

            {analysis.crossed.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {analysis.crossed.map(({ zone, meters, share }) => (
                  <li key={zone.id} className="rounded-mittel bg-flaeche-1 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-fliess text-ink-50">{zone.name}</span>
                      <StatusBadge status={zone.status} />
                    </div>
                    <p className="mt-0.5 text-mikro text-ink-500">
                      {formatKm(meters)} · {Math.round(share * 100)} %
                      {zone.review_status === 'entwurf' && ' · Einstufung ungeprüft'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- Profil und Aufwand ---- */}
          <section>
            <h3 className="mb-1.5 text-fliess font-semibold text-ink-200">Profil &amp; Aufwand</h3>
            {hoehenBusy && <p className="text-klein text-ink-400">Höhendaten werden geladen …</p>}
            {hoehenFehler && (
              <p className="rounded-mittel bg-geduldet-500/10 p-2.5 text-klein text-geduldet-200/90">
                Höhendaten nicht verfügbar ({hoehenFehler}). Gehzeit und Schwierigkeit lassen
                sich ohne sie nicht bestimmen.
              </p>
            )}
            {profil.length > 1 && (
              <ElevationProfile profil={profil} etappenGrenzen={etappenAktuell.slice(0, -1).map((e) => e.bis_m)} />
            )}
            {stats && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                  <Kennzahl label="Aufstieg" wert={`${stats.ascent_m} hm`} />
                  <Kennzahl label="Abstieg" wert={`${stats.descent_m} hm`} />
                  <Kennzahl label="Höchster Punkt" wert={`${stats.max_ele} m`} />
                  <Kennzahl label="Gehzeit" wert={formatDauer(stats.duration_s)} />
                </div>
                <div className="mt-3 flex items-center gap-2.5">
                  <Stufen stufe={SCHWIERIGKEIT_STUFE[stats.schwierigkeit]} von={4}
                          label={stats.schwierigkeit} />
                  <span className="text-mikro text-ink-500">Kondition</span>
                </div>
                <p className="mt-1.5 text-mikro leading-relaxed text-ink-500">
                  {stats.begruendung} Gehzeit nach der Alpenvereinsformel (4 km/h eben,
                  300 hm/h aufwärts, 500 hm/h abwärts), ohne längere Pausen.
                </p>
              </>
            )}
          </section>

          {/* ---- Etappen: Vorschlag oder eigene Einteilung ---- */}
          <EtappenPlaner
            etappen={etappenAktuell}
            kandidaten={kandidaten}
            wahl={etappenWahl}
            onWahl={setEtappenWahl}
          />

          {/* ---- Schlafplätze ---- */}
          <section>
            <h3 className="mb-1.5 text-fliess font-semibold text-ink-200">
              Schlafplätze im Umkreis von {NEARBY_RADIUS_M / 1000} km
            </h3>
            {analysis.nearby.length === 0 ? (
              <p className="text-klein text-ink-400">Keine erfassten Punkte in Routennähe.</p>
            ) : (
              <ul className="divide-y divide-kante rounded-mittel border border-kante">
                {analysis.nearby.slice(0, 12).map(({ point, distance }) => (
                  <li key={point.id} className="flex items-baseline justify-between gap-2 px-2.5 py-2">
                    <span className="min-w-0 text-fliess text-ink-50">{point.name}</span>
                    <span className="shrink-0 text-klein text-ink-400">{formatKm(distance)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- Ausrüstung, Verpflegung, Wetter ---- */}
          <section className="border-t border-kante pt-5">
            <h3 className="mb-1 text-fliess font-semibold text-ink-200">
              Ausrüstung, Verpflegung &amp; Wetter
            </h3>
            <p className="mb-3 text-mikro leading-relaxed text-ink-500">
              Dauer, Schlafhöhe und Jahreszeit ergeben sich aus deiner Route und den Etappen
              darüber.
            </p>
            <TripPlanner
              region={region}
              abgeleitet={abgeleitet}
              onTripChange={setTrip}
              staende={staende}
              onStand={standSetzen}
            />
          </section>

          {/* ---- Speichern: Verlauf und Eckdaten in einem Zug ---- */}
          {onSaveTour && (
            <section className="rounded-gross border border-kante bg-flaeche-1 p-4">
              <h3 className="text-fliess font-semibold text-ink-100">Tour speichern</h3>
              <p className="mb-3 mt-0.5 text-klein leading-relaxed text-ink-500">
                Der Name kommt aus der Tour selbst — aus den Orten am Weg. Überschreiben
                geht jederzeit. Gespeichert wird beides zusammen: der Verlauf und die
                Eckdaten von oben; unter „Deine Touren“ kannst du die Tour später teilen.
              </p>
              <form onSubmit={speichern} className="flex flex-wrap gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-mittel border
                                border-kante bg-flaeche-2 pr-1 focus-within:border-gletscher-500
                                focus-within:ring-2 focus-within:ring-gletscher-500/25">
                  <input
                    value={name}
                    onChange={(e) => { setEigenerName(e.target.value); setSpeicherStand('idle') }}
                    maxLength={120}
                    aria-label="Name der Tour"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-fliess text-ink-100
                               placeholder:text-ink-500 focus:outline-none"
                  />
                  {/*
                    Nur wenn es überhaupt etwas zu wechseln gibt. Ein Knopf, der
                    denselben Namen noch einmal vorschlägt, ist ein kaputter Knopf.
                  */}
                  {vorschlaege.length > 1 && (
                    <IconButton
                      icon={Shuffle}
                      groesse="klein"
                      label="Anderen Namen vorschlagen"
                      onClick={() => {
                        setEigenerName(null)
                        setVorschlagNr((n) => n + 1)
                        setSpeicherStand('idle')
                      }}
                    />
                  )}
                </div>
                <Button type="submit" variante="primaer" groesse="gross"
                        disabled={!name.trim() || speicherStand === 'busy'}>
                  {speicherStand === 'busy' ? 'Speichere …' : 'Speichern'}
                </Button>
                {speicherStand === 'ok' && (
                  <p className="w-full text-klein text-erlaubt-400">
                    Gespeichert. Unter „Deine Touren“ kannst du sie teilen.
                  </p>
                )}
                {speicherStand === 'error' && <p className="w-full text-klein text-verboten-300">{speicherFehler}</p>}
              </form>
            </section>
          )}

          <p className="rounded-mittel bg-geduldet-500/10 p-3 text-klein leading-relaxed text-geduldet-200/90">
            Orientierungshilfe, keine Rechtsgarantie. Die Auswertung ist nur so verlässlich wie
            die Angaben der einzelnen Flächen; ausserhalb eingezeichneter Flächen gilt allein
            der allgemeine Rechtsrahmen. Prüfe die Lage vor Ort.
          </p>
        </div>
      </div>
    </div>
  )
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <p className="text-mikro uppercase text-ink-500">{label}</p>
      <p className="font-semibold text-ink-50">{wert}</p>
    </div>
  )
}
