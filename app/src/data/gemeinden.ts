/**
 * SCHICHT 1 — die Ebene, auf der über das Campieren entschieden wird.
 *
 * Die Karte konnte ausserhalb der Schutzgebiete bisher nur den Kanton nennen.
 * Das ist die falsche Auflösung: in der Schweiz regelt das Übernachten im
 * Freien überwiegend die Gemeinde, über Polizeireglement, Nutzungsplanung oder
 * ein Verbot am Seeufer. Zwei Nachbargemeinden im selben Kanton können es
 * gegensätzlich halten — eine kantonale Auskunft ist dann im Zweifel eine
 * falsche Auskunft.
 *
 * Diese Ebene beantwortet die Frage also eine Stufe feiner. Wo nichts
 * recherchiert ist, sagt sie das — sie rät nicht und leitet nichts vom
 * Nachbarn oder vom Kanton ab. Genau diese Zurückhaltung ist der Grund, warum
 * man der Karte dort glauben kann, wo sie etwas behauptet.
 */
import type { Gemeinde, GemeindeRecht, LegalStatus, ReviewStatus } from './types'
import type { Position } from './geo'
import { pointInGeometry } from './geo'
import gemeindenVS from './gemeinden/CH-VS.json'
import rechtRoh from './gemeinden.legal.json'

interface GemeindeDatei {
  features: {
    id: string
    properties: {
      bfs: number | null
      name: string
      kanton: string | null
      website: string | null
      email: string | null
      source_url: string
    }
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  }[]
}

function ausDatei(datei: GemeindeDatei): Gemeinde[] {
  return datei.features.map((f) => ({
    id: f.id,
    bfs: f.properties.bfs,
    name: f.properties.name,
    kanton: f.properties.kanton,
    website: f.properties.website,
    email: f.properties.email,
    source_url: f.properties.source_url,
    geometry: f.geometry,
  }))
}

/**
 * Die gebündelte Fassung — bewusst nur das Wallis.
 *
 * Alle 2119 Schweizer Gemeinden wären gut 700 KB gepackt, die jeder Besucher
 * vorab lädt. Die Fokusregion steht dafür sofort und auch ohne Netz; der Rest
 * kommt aus der Datenbank und ersetzt sie (siehe `setzeGemeinden`). Dasselbe
 * Verfahren wie bei Zonen, Gipfeln und Natur.
 */
const GEBUENDELT = ausDatei(gemeindenVS as unknown as GemeindeDatei)

let AKTUELL: Gemeinde[] = GEBUENDELT

/**
 * Die Fassung aus der Datenbank dazunehmen — ergänzend, nicht ersetzend.
 *
 * Ersetzen war ein Fehler. Ins Bundle kommt genau das, was recherchiert ist
 * (siehe `bundleNachziehen` in scripts/gemeinden-einstufen.mjs), und es ist
 * per Konstruktion mit der Rechtspflege im selben Commit synchron. Die
 * Datenbank wird von Hand nachgeführt und hinkt deshalb hinterher. Wer sie
 * das Bundle überschreiben lässt, verliert genau die Gemeinden, für die
 * jemand die Arbeit gemacht hat — sie fallen ohne Fehlermeldung von der Karte.
 *
 * Also: das Bundle bleibt massgeblich für die Flächen, die es führt, und die
 * Datenbank füllt den grossen Rest der Schweiz auf.
 */
export function setzeGemeinden(gemeinden: Gemeinde[]) {
  if (gemeinden.length === 0) { AKTUELL = GEBUENDELT; return }
  const gebuendelt = new Set(GEBUENDELT.map((g) => g.id))
  AKTUELL = [...GEBUENDELT, ...gemeinden.filter((g) => !gebuendelt.has(g.id))]
}

export function alleGemeinden(): Gemeinde[] {
  return AKTUELL
}

const RECHT = (rechtRoh as unknown as { gemeinden: Record<string, GemeindeRecht> }).gemeinden

/** Welche Gemeinde liegt unter diesem Punkt? null ausserhalb der geladenen Flächen. */
export function gemeindeAn(position: Position): Gemeinde | null {
  return AKTUELL.find((g) => pointInGeometry(position, g.geometry)) ?? null
}

/**
 * Die recherchierte Regelung — oder null.
 *
 * null heisst ausdrücklich „noch nicht recherchiert" und nicht „es gilt
 * nichts". Der Unterschied ist der ganze Punkt dieser Karte.
 */
export function gemeindeRecht(gemeinde: Gemeinde | null): GemeindeRecht | null {
  if (!gemeinde?.bfs) return null
  return RECHT[String(gemeinde.bfs)] ?? null
}

/**
 * Wie eine Gemeinde auf der Karte erscheint.
 *
 * Zwei getrennte Achsen, und das ist Absicht: *was* gilt (`status`) und *wie
 * belastbar* die Auskunft ist (`bestaetigt`). Eine abgeleitete Einstufung wird
 * schraffiert gezeichnet, eine belegte voll — so ist der Prüfstand im
 * Kartenbild selbst zu sehen und nicht erst im Kleingedruckten.
 */
export interface GemeindeAnzeige {
  status: LegalStatus
  bestaetigt: boolean
  review_status: ReviewStatus | null
}

export function gemeindeAnzeige(recht: GemeindeRecht | null): GemeindeAnzeige {
  if (!recht) return { status: 'unknown', bestaetigt: false, review_status: null }
  return {
    status: recht.status,
    bestaetigt: recht.review_status !== 'entwurf',
    review_status: recht.review_status,
  }
}

/**
 * Die Gemeindeflächen als GeoJSON für die Karte, mit Anzeige-Eigenschaften.
 *
 * Die Einfärbung passiert in MapLibre über diese Felder, nicht in React —
 * 2119 Flächen einzeln durch die Komponentenschicht zu schicken wäre
 * verschwendet.
 */
export function gemeindenGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: AKTUELL.map((g) => {
      const anzeige = gemeindeAnzeige(gemeindeRecht(g))
      return {
        type: 'Feature' as const,
        id: g.bfs ?? undefined,
        properties: {
          bfs: g.bfs,
          name: g.name,
          kanton: g.kanton,
          status: anzeige.status,
          bestaetigt: anzeige.bestaetigt,
        },
        geometry: g.geometry,
      }
    }),
  }
}

/** Wie weit die kommunale Rechtspflege gediehen ist — für ehrliche Kennzahlen. */
export function gemeindeStand() {
  const belegt = Object.values(RECHT).filter((r) => r.review_status !== 'entwurf').length
  return {
    geladen: AKTUELL.length,
    recherchiert: Object.keys(RECHT).length,
    belegt,
  }
}
