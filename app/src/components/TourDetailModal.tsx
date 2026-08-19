/**
 * Die vollständige Auswertung einer fertig gezeichneten Route.
 *
 * Beim Zeichnen zeigt das Seitenpanel bewusst nur Länge und Gehzeit — alles
 * andere würde bei jedem gesetzten Wegpunkt zappeln. Erst wenn die Route steht,
 * öffnet sich hier das ganze Bild: Legalität, Profil, Etappen, Ausrüstung,
 * Verpflegung und Wetter.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Position } from '../data/geo'
import type { Region, TripParams } from '../data/types'
import { NEARBY_RADIUS_M, summarise, type RouteAnalysis } from '../data/routeAnalysis'
import { formatDauer, STUNDEN_PRO_TAG, type Etappe, type HikingStats } from '../data/hiking'
import type { ElevationPoint } from '../services/elevation'
import { ElevationProfile } from './ElevationProfile'
import { TripPlanner } from './TripPlanner'
import { STATUS_CLASS, STATUS_LABEL } from './ui'

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
  onSaveRoute: ((name: string) => Promise<void>) | null
  onSaveTrip: ((name: string, trip: TripParams) => Promise<void>) | null
}

const formatKm = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`

const SCHWIERIGKEIT_CLASS = {
  leicht: 'bg-green-500/15 text-green-300 ring-green-500/30',
  mittel: 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/30',
  schwer: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  'sehr schwer': 'bg-red-500/15 text-red-300 ring-red-500/30',
} as const

export function TourDetailModal({
  offen, onClose, region, analysis, stats, profil, etappen,
  hoehenBusy, hoehenFehler, onSaveRoute, onSaveTrip,
}: Props) {
  const [name, setName] = useState('')
  const [speicherStand, setSpeicherStand] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null)

  // Escape schliesst — bei einem bildfüllenden Fenster erwartet man das.
  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offen, onClose])

  /**
   * Tourdaten aus der Route ableiten: Tage aus den Etappen, Schlafhöhe aus der
   * höchsten Etappenübernachtung. Ohne das begänne die Packliste bei
   * Standardwerten, die nichts mit der gezeichneten Tour zu tun haben.
   */
  const vorbelegung = useMemo<Partial<TripParams>>(() => {
    const tage = Math.max(1, etappen.length || (stats ? Math.ceil(stats.duration_s / 3600 / STUNDEN_PRO_TAG) : 1))
    const schlafhoehen = etappen.length > 0
      ? etappen.map((e) => {
          const punkt = profil.find((p) => p.distance_m >= e.bis_m) ?? profil[profil.length - 1]
          return punkt?.elevation ?? 0
        })
      : [stats?.max_ele ?? 0]
    const hoehe = Math.round(Math.max(...schlafhoehen, 0) / 100) * 100
    return { days: tage, elevation: hoehe > 0 ? hoehe : undefined }
  }, [etappen, profil, stats])

  if (!offen) return null

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onSaveRoute || !name.trim()) return
    setSpeicherStand('busy'); setSpeicherFehler(null)
    try {
      await onSaveRoute(name.trim())
      setSpeicherStand('ok'); setName('')
    } catch (err) {
      setSpeicherStand('error'); setSpeicherFehler((err as Error).message)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Tour-Auswertung"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Deine Tour</h2>
            <p className="text-sm text-slate-400">
              {formatKm(analysis.length_m)}
              {stats && ` · ${formatDauer(stats.duration_s)}`}
              {etappen.length > 0 && ` · ${etappen.length} Tage`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Auswertung schliessen"
            className="-mr-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            ✕
          </button>
        </header>

        <div className="space-y-7 overflow-y-auto px-5 py-5">
          {/* ---- Legalität zuerst: das ist der Kern der App ---- */}
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-200">Wo darfst du schlafen?</h3>
            <p className="text-sm leading-relaxed text-slate-300">
              {summarise(analysis, region.legal_framework.baseline_status)}
            </p>

            {analysis.crossed.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {analysis.crossed.map(({ zone, meters, share }) => (
                  <li key={zone.id} className="rounded-lg bg-white/5 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-slate-100">{zone.name}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_CLASS[zone.status]}`}>
                        {STATUS_LABEL[zone.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
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
            <h3 className="mb-1.5 text-sm font-semibold text-slate-200">Profil &amp; Aufwand</h3>
            {hoehenBusy && <p className="text-xs text-slate-400">Höhendaten werden geladen …</p>}
            {hoehenFehler && (
              <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-200/90">
                Höhendaten nicht verfügbar ({hoehenFehler}). Gehzeit und Schwierigkeit lassen
                sich ohne sie nicht bestimmen.
              </p>
            )}
            {profil.length > 1 && (
              <ElevationProfile profil={profil} etappenGrenzen={etappen.slice(0, -1).map((e) => e.bis_m)} />
            )}
            {stats && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                  <Kennzahl label="Aufstieg" wert={`${stats.ascent_m} hm`} />
                  <Kennzahl label="Abstieg" wert={`${stats.descent_m} hm`} />
                  <Kennzahl label="Höchster Punkt" wert={`${stats.max_ele} m`} />
                  <Kennzahl label="Gehzeit" wert={formatDauer(stats.duration_s)} />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${SCHWIERIGKEIT_CLASS[stats.schwierigkeit]}`}>
                    {stats.schwierigkeit}
                  </span>
                  <span className="text-[11px] text-slate-500">Kondition</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  {stats.begruendung} Gehzeit nach der Alpenvereinsformel (4 km/h eben,
                  300 hm/h aufwärts, 500 hm/h abwärts), ohne längere Pausen.
                </p>
              </>
            )}
          </section>

          {/* ---- Etappen ---- */}
          {etappen.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-slate-200">
                Etappen ({etappen.length} Tage)
              </h3>
              <ul className="space-y-1.5">
                {etappen.map((e) => (
                  <li key={e.nummer} className="rounded-lg bg-white/5 p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-100">Tag {e.nummer}</span>
                      <span className="text-[11px] text-slate-500">
                        {formatKm(e.distance_m)} · {e.ascent_m} hm · {formatDauer(e.duration_s)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {e.schlafplatz
                        ? `Übernachtung: ${e.schlafplatz.point.name} (${formatKm(e.schlafplatz.distance)} entfernt)`
                        : 'Keine erfasste Übernachtung in der Nähe — hier zählt die Rechtslage der Zone.'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---- Schlafplätze ---- */}
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-200">
              Schlafplätze im Umkreis von {NEARBY_RADIUS_M / 1000} km
            </h3>
            {analysis.nearby.length === 0 ? (
              <p className="text-xs text-slate-400">Keine erfassten Punkte in Routennähe.</p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                {analysis.nearby.slice(0, 12).map(({ point, distance }) => (
                  <li key={point.id} className="flex items-baseline justify-between gap-2 px-2.5 py-2">
                    <span className="min-w-0 text-sm text-slate-100">{point.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{formatKm(distance)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- Ausrüstung, Verpflegung, Wetter ---- */}
          <section className="border-t border-white/10 pt-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-200">
              Ausrüstung, Verpflegung &amp; Wetter
            </h3>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              Dauer und Schlafhöhe sind aus deiner Route übernommen und lassen sich anpassen.
            </p>
            <TripPlanner region={region} onSave={onSaveTrip} initial={vorbelegung} eingebettet />
          </section>

          {/* ---- Route speichern ---- */}
          {onSaveRoute && (
            <section className="border-t border-white/10 pt-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-200">Route speichern</h3>
              <form onSubmit={speichern} className="flex flex-wrap gap-2">
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setSpeicherStand('idle') }}
                  placeholder="Name der Route"
                  maxLength={120}
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 text-sm"
                />
                <button type="submit" disabled={!name.trim() || speicherStand === 'busy'}
                        className="min-h-10 rounded-lg bg-emerald-500/15 px-4 text-sm text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40">
                  {speicherStand === 'busy' ? 'Speichere …' : 'Speichern'}
                </button>
                {speicherStand === 'ok' && (
                  <p className="w-full text-xs text-emerald-300">
                    Gespeichert. Unter „Deine Touren" kannst du sie veröffentlichen.
                  </p>
                )}
                {speicherStand === 'error' && <p className="w-full text-xs text-red-300">{speicherFehler}</p>}
              </form>
            </section>
          )}

          <p className="rounded-lg bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200/90">
            Orientierungshilfe, keine Rechtsgarantie. Die Auswertung ist nur so verlässlich wie
            der Prüfstand der Zonen; ausserhalb eingezeichneter Flächen gilt allein der
            allgemeine Grundsatz der Region. Prüfe die Lage vor Ort.
          </p>
        </div>
      </div>
    </div>
  )
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-semibold text-slate-100">{wert}</p>
    </div>
  )
}
