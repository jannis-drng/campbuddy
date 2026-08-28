/**
 * Auswertung einer Route für die Tourenplanung (Abschnitt 4.2).
 *
 * Reine Rechenlogik, kein Netzzugriff. Alle Annahmen stehen als benannte
 * Konstanten und werden im UI offengelegt — Faustformeln sollen als solche
 * erkennbar bleiben.
 */
import { distanceToLine, naechsterIndex, type Position } from './geo'
import type { LegalStatus } from './types'
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
      'Bewertet ist nur die Kondition - wie ausgesetzt oder gesichert der Weg ist, ' +
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

/**
 * Wo eine Etappe endet und die Nacht verbracht wird.
 *
 * Bewusst nicht der `Point` selbst: eine Übernachtung kann auch an einem
 * selbst gesetzten Stopp liegen („beim Bach hinter der Alp"), und der steht
 * in keinem Datensatz. Was zählt, ist Name, Lage und wie weit sie vom
 * Etappenende entfernt ist.
 */
export interface Uebernachtung {
  name: string
  position: Position
  /** Luftlinie vom Etappenende zum Platz. */
  distance_m: number
  art: 'hut' | 'campsite' | 'vehicle_spot' | 'eigen' | 'stopp'
  /** Was an dieser Stelle gilt. Fehlt bei selbst gewählten Nachtlagern. */
  status?: LegalStatus
}

/**
 * Eine Stelle, an der die Nacht verbracht werden könnte.
 *
 * Bewusst nicht `Point`: eine Hütte aus dem Datenbestand, ein von jemandem
 * markierter Schlafplatz und ein selbst gesetzter Stopp sind für diese Frage
 * dasselbe — Orte, an denen man liegen kann. Dass eine App fürs Wildcampen
 * ihre Etappen nur an Hütten enden liess, war die alte Fassung: sie kannte
 * nichts anderes.
 */
export interface Schlafmoeglichkeit {
  id: string
  name: string
  position: Position
  art: Uebernachtung['art']
  /** Rechtslage an dieser Stelle — feinste zuständige Ebene, siehe App.tsx. */
  status: LegalStatus
}

export interface Etappe {
  nummer: number
  von_m: number
  bis_m: number
  distance_m: number
  ascent_m: number
  descent_m: number
  duration_s: number
  /** Höhe am Etappenende — bestimmt Schlafsack und Kleidung. */
  endhoehe_m: number
  /** Wo die Etappe endet — Grundlage für den Schlafplatz-Vorschlag. */
  endposition: Position
  /** Wo übernachtet wird, falls etwas in Reichweite liegt oder gewählt wurde. */
  schlafplatz: Uebernachtung | null
}

/** Eine Etappe aus einem Abschnitt des Höhenprofils bauen. */
function etappeAus(
  profil: ElevationPoint[], startIndex: number, endIndex: number, nummer: number,
): Etappe {
  const abschnitt = profil.slice(startIndex, endIndex + 1)
  const s = analyseProfil(abschnitt)
  return {
    nummer,
    von_m: profil[startIndex].distance_m,
    bis_m: profil[endIndex].distance_m,
    distance_m: s?.distance_m ?? 0,
    ascent_m: s?.ascent_m ?? 0,
    descent_m: s?.descent_m ?? 0,
    duration_s: s?.duration_s ?? 0,
    endhoehe_m: Math.round(profil[endIndex].elevation),
    endposition: profil[endIndex].position,
    schlafplatz: null,
  }
}

/** Wie weit ein Schlafplatz vom Etappenende entfernt sein darf. */
const SCHLAFPLATZ_RADIUS_M = 3000

/**
 * Wie stark die Rechtslage gegen einen Platz spricht, in Metern Umweg
 * gerechnet.
 *
 * Die Zahlen sind Gewichte, keine Entfernungen — sie beantworten die Frage
 * „wie viel weiter würde ich für einen sicheren Platz gehen?". Ein geduldeter
 * Platz ist einen knappen Kilometer Umweg wert gegenüber einem erlaubten, ein
 * ungeklärter zwei. Verboten ist keine Frage des Abwägens: in einem
 * Naturschutzgebiet oder einer Wildruhezone schlägt diese App keinen
 * Schlafplatz vor, egal wie günstig er läge.
 */
const STATUS_GEWICHT: Record<LegalStatus, number> = {
  allowed: 0,
  tolerated: 800,
  unknown: 2000,
  forbidden: Infinity,
}

/**
 * Und wie stark die Art des Platzes.
 *
 * Ein markierter Schlafplatz ist die naheliegendste Antwort für das, was
 * diese App ist — jemand hat dort schon gelegen und es aufgeschrieben. Eine
 * Hütte ist ebenso gut, nur nicht dasselbe. Ein Campingplatz kostet Geld und
 * liegt meist im Tal; ein Stellplatz ist fürs Fahrzeug und taugt zu Fuss
 * selten, deshalb steht er weit hinten statt gar nicht zur Wahl.
 */
const ART_GEWICHT: Record<Uebernachtung['art'], number> = {
  eigen: 0,
  stopp: 0,
  hut: 100,
  campsite: 600,
  vehicle_spot: 2500,
}

/**
 * Der beste Platz für diese Nacht.
 *
 * Entfernung, Rechtslage und Art wandern in dieselbe Einheit — Meter, die man
 * dafür in Kauf nähme. So gewinnt der geduldete Platz 400 m neben dem Weg
 * gegen die Hütte drei Kilometer weiter, aber nicht gegen die Hütte
 * nebenan; und ein Platz im Verbotsgebiet gewinnt nie.
 */
function bestesLager(
  position: Position, moeglichkeiten: Schlafmoeglichkeit[],
): Uebernachtung | null {
  let bester: { m: Schlafmoeglichkeit; abstand: number; wert: number } | null = null

  for (const m of moeglichkeiten) {
    const abstand = distanceToLine(m.position, [position])
    if (abstand > SCHLAFPLATZ_RADIUS_M) continue
    const wert = abstand + STATUS_GEWICHT[m.status] + ART_GEWICHT[m.art]
    if (!Number.isFinite(wert)) continue
    if (!bester || wert < bester.wert) bester = { m, abstand, wert }
  }

  if (!bester) return null
  return {
    name: bester.m.name,
    position: bester.m.position,
    distance_m: Math.round(bester.abstand),
    art: bester.m.art,
    status: bester.m.status,
  }
}

/**
 * Teilt die Route in Tagesetappen und schlägt je Etappe eine Übernachtung vor.
 *
 * Geteilt wird nach Gehzeit, nicht nach Kilometern: 12 km im Flachen und
 * 12 km mit 1200 Höhenmetern sind nicht derselbe Tag.
 *
 * Das ist der Vorschlag. Wer die Nächte selbst festlegt, geht über
 * `etappenNachZielen` — dort bestimmen gewählte Orte die Grenzen, nicht die
 * Uhr.
 */
export function planeEtappen(
  profil: ElevationPoint[],
  moeglichkeiten: Schlafmoeglichkeit[],
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

    const etappe = etappeAus(profil, startIndex, endIndex, tag)
    // Die letzte Etappe endet am Ziel, nicht an einer Übernachtung.
    etappe.schlafplatz = tag < tage ? bestesLager(etappe.endposition, moeglichkeiten) : null
    etappen.push(etappe)

    startIndex = endIndex
    if (startIndex >= profil.length - 1) break
  }

  return etappen
}

/**
 * Selbst festgelegte Etappen: die gewählten Nachtlager bestimmen die Tage.
 *
 * Der Vorschlag rechnet mit sechs Gehstunden — eine Zahl, die für die eigene
 * Tour fast nie stimmt. Wer weiss, dass er in der Cabane de Moiry schläft und
 * am zweiten Tag nur bis zur Alp will, legt genau das fest; Strecke, Aufstieg
 * und Gehzeit je Tag ergeben sich daraus.
 *
 * `ziele` sind die Nachtlager in Streckenmetern ab Start, ungeordnet erlaubt.
 * Das Ende der Route zählt nicht dazu: dort ist die Tour zu Ende, nicht die
 * Nacht.
 */
export function etappenNachZielen(
  profil: ElevationPoint[],
  ziele: { bei_m: number; uebernachtung: Uebernachtung }[],
): Etappe[] {
  if (profil.length < 2) return []

  const gesamtMeter = profil[profil.length - 1].distance_m
  // Ein Nachtlager am Start oder am Ziel ergäbe eine Etappe von null Länge.
  const sortiert = [...ziele]
    .filter((z) => z.bei_m > profil[0].distance_m + 1 && z.bei_m < gesamtMeter - 1)
    .sort((a, b) => a.bei_m - b.bei_m)
  if (sortiert.length === 0) return []

  const grenzen = sortiert.map((z) => indexBei(profil, z.bei_m))
  const etappen: Etappe[] = []
  let startIndex = 0

  for (const [i, endIndex] of [...grenzen, profil.length - 1].entries()) {
    if (endIndex <= startIndex) continue
    const etappe = etappeAus(profil, startIndex, endIndex, etappen.length + 1)
    etappe.schlafplatz = sortiert[i]?.uebernachtung ?? null
    etappen.push(etappe)
    startIndex = endIndex
  }

  return etappen
}

/** Der Stützpunkt des Profils, der diesem Streckenmeter am nächsten liegt. */
function indexBei(profil: ElevationPoint[], meter: number): number {
  let bester = 0
  let abstand = Infinity
  for (const [i, p] of profil.entries()) {
    const d = Math.abs(p.distance_m - meter)
    if (d < abstand) { abstand = d; bester = i }
  }
  return bester
}

/**
 * Ein möglicher Ort für eine Nacht, mit seiner Stelle auf der Strecke.
 *
 * `bei_m` ist der Streckenmeter, an dem die Route diesem Ort am nächsten
 * kommt — nicht die Luftlinie zum Start. Nur so lässt sich eine Liste
 * bilden, die der Reihe nach abläuft, wie man sie auch geht.
 */
export interface Etappenkandidat extends Uebernachtung {
  id: string
  bei_m: number
  status: LegalStatus
}

/**
 * Kandidaten der Reihe nach auf die Strecke legen.
 *
 * Doppelte Orte fallen weg: eine Hütte, die zugleich als Stopp gesetzt wurde,
 * stünde sonst zweimal in der Liste — einmal aus den erfassten Punkten,
 * einmal aus den eigenen Stopps.
 */
export function etappenkandidaten(
  profil: ElevationPoint[],
  eintraege: (Uebernachtung & { id: string; status: LegalStatus })[],
): Etappenkandidat[] {
  if (profil.length < 2) return []
  const positionen = profil.map((p) => p.position)

  const gesehen = new Set<string>()
  const kandidaten: Etappenkandidat[] = []
  for (const e of eintraege) {
    // Auf zehn Meter gerundet: derselbe Ort aus zwei Quellen trägt selten
    // exakt dieselbe Koordinate, aber immer dieselbe Stelle.
    const schluessel = `${e.position[0].toFixed(4)},${e.position[1].toFixed(4)}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    const i = naechsterIndex(e.position, positionen)
    kandidaten.push({ ...e, bei_m: profil[i].distance_m })
  }
  return kandidaten.sort((a, b) => a.bei_m - b.bei_m)
}

/**
 * Die Höhe, auf der geschlafen wird — die höchste Nacht zählt.
 *
 * Sie bestimmt Schlafsack und Kleidung, und dafür ist die kälteste Nacht
 * massgeblich, nicht der Durchschnitt. Ohne Etappen ist es der höchste Punkt
 * der Tour: wer an einem Tag hin und zurück geht, schläft zwar zu Hause, aber
 * die Packliste soll die Tour tragen.
 */
export function schlafhoehe(etappen: Etappe[], hoechsterPunkt: number): number {
  const naechte = etappen.filter((e) => e.schlafplatz != null || e.nummer < etappen.length)
  if (naechte.length === 0) return hoechsterPunkt
  return Math.max(...naechte.map((e) => e.endhoehe_m))
}

export function formatDauer(sekunden: number): string {
  const h = Math.floor(sekunden / 3600)
  const m = Math.round((sekunden % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
