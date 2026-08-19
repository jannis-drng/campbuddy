/**
 * Auswertung einer Route für die Tourenplanung (Abschnitt 4.2).
 *
 * Reine Rechenlogik, kein Netzzugriff. Alle Annahmen stehen als benannte
 * Konstanten und werden im UI offengelegt — Faustformeln sollen als solche
 * erkennbar bleiben.
 */
import { distanceToLine, type Position } from './geo'
import type { Point } from './types'
import type { ElevationPoint } from '../services/elevation'

/* ---------------- Annahmen ---------------- */

/**
 * Höhenmodelle rauschen. Ohne Schwelle summierte man jedes Rastergezappel
 * zu Höhenmetern auf — bei einer flachen Talwanderung kämen so schnell
 * mehrere hundert erfundene Meter zusammen.
 */
const HOEHEN_SCHWELLE_M = 8
/** Fenstergrösse der Glättung, in Stützpunkten. */
const GLAETTUNG = 3

/** Alpenvereins-/DIN-33466-Formel. */
const HORIZONTAL_KMH = 4
const AUFSTIEG_MH = 300
const ABSTIEG_MH = 500

/** Realistische Gehzeit pro Tag inklusive Pausen. */
export const STUNDEN_PRO_TAG = 6

export type Schwierigkeit = 'leicht' | 'mittel' | 'schwer' | 'sehr schwer'

export interface HikingStats {
  distance_m: number
  ascent_m: number
  descent_m: number
  min_ele: number
  max_ele: number
  /** Reine Gehzeit in Sekunden, ohne längere Pausen. */
  duration_s: number
  schwierigkeit: Schwierigkeit
  /** Warum diese Einstufung — gehört sichtbar ins UI. */
  begruendung: string
}

/** Gleitender Mittelwert gegen das Rauschen des Höhenmodells. */
function glaetten(werte: number[]): number[] {
  if (werte.length <= GLAETTUNG) return werte
  return werte.map((_, i) => {
    const von = Math.max(0, i - GLAETTUNG)
    const bis = Math.min(werte.length, i + GLAETTUNG + 1)
    const fenster = werte.slice(von, bis)
    return fenster.reduce((a, b) => a + b, 0) / fenster.length
  })
}

/**
 * Summiert Auf- und Abstieg. Gezählt wird erst, wenn sich die Höhe seit dem
 * letzten gezählten Punkt um mehr als die Schwelle geändert hat.
 */
export function aufUndAbstieg(profil: ElevationPoint[]): { ascent: number; descent: number } {
  const geglaettet = glaetten(profil.map((p) => p.elevation))
  let ascent = 0
  let descent = 0
  let referenz = geglaettet[0]

  for (const hoehe of geglaettet) {
    const delta = hoehe - referenz
    if (Math.abs(delta) < HOEHEN_SCHWELLE_M) continue
    if (delta > 0) ascent += delta
    else descent += -delta
    referenz = hoehe
  }
  return { ascent: Math.round(ascent), descent: Math.round(descent) }
}

/**
 * Gehzeit nach der Alpenvereinsformel: horizontale und vertikale Zeit
 * getrennt rechnen, die grössere voll, die kleinere halb ansetzen.
 */
export function gehzeitSekunden(distance_m: number, ascent_m: number, descent_m: number): number {
  const horizontal = distance_m / 1000 / HORIZONTAL_KMH
  const vertikal = ascent_m / AUFSTIEG_MH + descent_m / ABSTIEG_MH
  const stunden = Math.max(horizontal, vertikal) + Math.min(horizontal, vertikal) / 2
  return Math.round(stunden * 3600)
}

/**
 * Schwierigkeit aus Länge und Höhenmetern.
 *
 * Bewusst nur Kondition, nicht Technik: ob ein Weg ausgesetzt oder
 * seilversichert ist, steht nicht in den Daten. Eine SAC-Bergwanderskala
 * daraus abzuleiten wäre geraten, und Geratenes hat in dieser App nichts
 * verloren.
 */
export function schwierigkeit(distance_m: number, ascent_m: number): {
  stufe: Schwierigkeit
  begruendung: string
} {
  const km = distance_m / 1000
  const hm = ascent_m

  const stufe: Schwierigkeit =
    km > 25 || hm > 1600 ? 'sehr schwer'
    : km > 15 || hm > 900 ? 'schwer'
    : km > 8 || hm > 400 ? 'mittel'
    : 'leicht'

  return {
    stufe,
    begruendung:
      `${km.toFixed(1).replace('.', ',')} km und ${hm} Höhenmeter im Aufstieg. ` +
      'Bewertet ist nur die Kondition — wie ausgesetzt oder gesichert der Weg ist, ' +
      'geht aus den Daten nicht hervor.',
  }
}

export function analyseProfil(profil: ElevationPoint[]): HikingStats | null {
  if (profil.length < 2) return null

  // Differenz, nicht Absolutwert: bei einem Teilstück (Etappe) trägt der
  // letzte Punkt die Distanz seit Routenbeginn, nicht die Etappenlänge.
  const distance_m = profil[profil.length - 1].distance_m - profil[0].distance_m
  const { ascent, descent } = aufUndAbstieg(profil)
  const hoehen = profil.map((p) => p.elevation)
  const { stufe, begruendung } = schwierigkeit(distance_m, ascent)

  return {
    distance_m,
    ascent_m: ascent,
    descent_m: descent,
    min_ele: Math.round(Math.min(...hoehen)),
    max_ele: Math.round(Math.max(...hoehen)),
    duration_s: gehzeitSekunden(distance_m, ascent, descent),
    schwierigkeit: stufe,
    begruendung,
  }
}

/* ---------------- Mehrtages-Etappen ---------------- */

export interface Etappe {
  nummer: number
  von_m: number
  bis_m: number
  distance_m: number
  ascent_m: number
  descent_m: number
  duration_s: number
  /** Wo die Etappe endet — Grundlage für den Schlafplatz-Vorschlag. */
  endposition: Position
  /** Nächstgelegene Übernachtungsmöglichkeit, falls eine in Reichweite liegt. */
  schlafplatz: { point: Point; distance: number } | null
}

/** Wie weit ein Schlafplatz vom Etappenende entfernt sein darf. */
const SCHLAFPLATZ_RADIUS_M = 3000

/**
 * Teilt die Route in Tagesetappen und schlägt je Etappe eine Übernachtung vor.
 *
 * Geteilt wird nach Gehzeit, nicht nach Kilometern: 12 km im Flachen und
 * 12 km mit 1200 Höhenmetern sind nicht derselbe Tag.
 */
export function planeEtappen(
  profil: ElevationPoint[],
  punkte: Point[],
  stundenProTag = STUNDEN_PRO_TAG,
): Etappe[] {
  if (profil.length < 2) return []

  const gesamt = analyseProfil(profil)
  if (!gesamt) return []

  const tage = Math.max(1, Math.ceil(gesamt.duration_s / 3600 / stundenProTag))
  if (tage === 1) return []

  const zielProEtappe = gesamt.duration_s / tage
  const etappen: Etappe[] = []
  let startIndex = 0

  for (let tag = 1; tag <= tage; tag++) {
    // Letzte Etappe läuft immer bis zum Ende, damit nichts übrig bleibt.
    let endIndex = profil.length - 1
    if (tag < tage) {
      let verbraucht = 0
      for (let i = startIndex + 1; i < profil.length; i++) {
        const abschnitt = profil.slice(startIndex, i + 1)
        const s = analyseProfil(abschnitt)
        verbraucht = s?.duration_s ?? 0
        if (verbraucht >= zielProEtappe) { endIndex = i; break }
      }
    }
    if (endIndex <= startIndex) endIndex = Math.min(startIndex + 1, profil.length - 1)

    const abschnitt = profil.slice(startIndex, endIndex + 1)
    const s = analyseProfil(abschnitt)
    const endposition = profil[endIndex].position

    const naechster = punkte
      .filter((p) => p.type !== 'vehicle_spot')
      .map((point) => ({ point, distance: distanceToLine([point.lng, point.lat], [endposition]) }))
      .filter((k) => k.distance <= SCHLAFPLATZ_RADIUS_M)
      .sort((a, b) => a.distance - b.distance)[0] ?? null

    etappen.push({
      nummer: tag,
      von_m: profil[startIndex].distance_m,
      bis_m: profil[endIndex].distance_m,
      distance_m: (s?.distance_m ?? 0),
      ascent_m: s?.ascent_m ?? 0,
      descent_m: s?.descent_m ?? 0,
      duration_s: s?.duration_s ?? 0,
      endposition,
      schlafplatz: naechster,
    })

    startIndex = endIndex
    if (startIndex >= profil.length - 1) break
  }

  return etappen
}

export function formatDauer(sekunden: number): string {
  const h = Math.floor(sekunden / 3600)
  const m = Math.round((sekunden % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
