/**
 * SCHICHT 1 — wer ausserhalb der Schutzgebiete zuständig ist.
 *
 * Die Legalitätskarte konnte bisher auf freier Fläche nur den landesweiten
 * Rahmen zeigen. Für die Schweiz ist das die schwächste mögliche Auskunft:
 * Bundesrecht regelt die Schutzgebiete, alles andere regeln Kanton und
 * Gemeinde — und die tun das sehr unterschiedlich.
 *
 * Diese Ebene löst das nicht, aber sie benennt es. Ein Klick auf unmarkiertes
 * Gelände sagt jetzt, welcher Kanton zuständig ist, und ob dessen Regelung
 * schon recherchiert ist. „Kanton Graubünden — noch nicht recherchiert" ist
 * eine ehrliche und brauchbare Antwort; eine landesweite Faustregel als
 * kantonale Auskunft auszugeben wäre es nicht.
 */
import type { Kanton, KantonRecht } from './types'
import type { Position } from './geo'
import { pointInGeometry } from './geo'
import kantoneCH from './kantone/CH.json'
import rechtRoh from './kantone.legal.json'
import grundlagenRoh from './kantone.grundlagen.json'

interface KantonDatei {
  features: {
    id: string
    properties: { code: string | null; name: string; source_url: string }
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  }[]
}

const datei = kantoneCH as unknown as KantonDatei

export const KANTONE: Kanton[] = datei.features.map((f) => ({
  id: f.id,
  code: f.properties.code,
  name: f.properties.name,
  source_url: f.properties.source_url,
  geometry: f.geometry,
}))

const RECHT = (rechtRoh as unknown as { kantone: Record<string, KantonRecht> }).kantone

interface Grundlagen {
  quelle: string
  stand: string
  kantone: Record<string, { name: string; grundlagen: { text: string; zonen: number }[] }>
}

const GRUNDLAGEN = grundlagenRoh as unknown as Grundlagen

/**
 * Die Erlasse, auf denen die Wildruhezonen des Kantons beruhen.
 *
 * Das ist ausdrücklich **nicht** die Antwort auf „darf ich hier zelten" — es
 * ist der Hinweis, welches kantonale Recht den Wildschutz regelt, und damit
 * der Faden, an dem eine Recherche anfängt. Abgeleitet aus dem BAFU-Datensatz,
 * nicht behauptet.
 */
export function kantonGrundlagen(kanton: Kanton | null) {
  if (!kanton?.code) return null
  const eintrag = GRUNDLAGEN.kantone[kanton.code]
  if (!eintrag || eintrag.grundlagen.length === 0) return null
  return { ...eintrag, quelle: GRUNDLAGEN.quelle, stand: GRUNDLAGEN.stand }
}

/** Welcher Kanton liegt unter diesem Punkt? null ausserhalb der Schweiz. */
export function kantonAn(position: Position): Kanton | null {
  return KANTONE.find((k) => pointInGeometry(position, k.geometry)) ?? null
}

/**
 * Die recherchierte Regelung — oder null.
 *
 * null heisst ausdrücklich „noch nicht recherchiert" und nicht „es gilt
 * nichts". Der Unterschied ist der ganze Punkt dieser Karte.
 */
export function kantonRecht(kanton: Kanton | null): KantonRecht | null {
  if (!kanton?.code) return null
  return RECHT[kanton.code] ?? null
}

/** Wie weit die kantonale Rechtspflege gediehen ist — für ehrliche Kennzahlen. */
export function kantonStand() {
  const mitCode = KANTONE.filter((k) => k.code)
  return {
    gesamt: mitCode.length,
    recherchiert: mitCode.filter((k) => RECHT[k.code!]).length,
  }
}
