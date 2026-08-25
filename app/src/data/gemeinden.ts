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
import type { Ausschnitt, Gemeinde, GemeindeRecht, LegalStatus, ReviewStatus } from './types'
import type { Position } from './geo'
import { pointInGeometry } from './geo'
import { kachelLader, ladeJson, ohneDoppelte } from './snapshot'
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
 * Zwei Auflösungen derselben Flächen — und warum das kein Luxus ist.
 *
 * Die 2119 Gemeindegrenzen sind mit 617 KB gepackt der grösste Einzelposten
 * der ganzen Anwendung. Beim Zeichnen tragen sie aber nur Farbe: was in einer
 * Gemeinde gilt, steht in `gemeinden.legal.json` (12 KB) und hängt an der
 * BFS-Nummer, nicht an der Geometrie.
 *
 * Also: eine grob vereinfachte Übersicht (148 KB) färbt sofort das ganze Land,
 * und die genauen Grenzen kommen kachelweise nach, sobald jemand hineinzoomt.
 * Wer über die Karte fliegt, lädt ein Viertel; wer eine Gemeinde wirklich
 * ansieht, bekommt sie exakt.
 *
 * Die Genauigkeit ist dort nicht verhandelbar: `gemeindeAn` beantwortet die
 * Frage „in welcher Gemeinde stehe ich" und damit, welches Reglement gilt. An
 * einer Grenze die falsche Gemeinde zu nennen wäre dieselbe Sorte Fehler wie
 * eine kantonale Auskunft, wo die kommunale zählt. Deshalb fragt sie zuerst
 * die genauen Flächen und erst danach die Übersicht.
 */
let UEBERSICHT: Gemeinde[] = []
let GENAU: Gemeinde[] = []

const DETAIL_LADER = kachelLader<GemeindeDatei['features'][number]>('gemeinden', 'gemeinden.CH.json')

/** Die landesweite Übersicht — einmal pro Sitzung, danach aus dem Cache. */
export async function ladeGemeindenUebersicht(region: string): Promise<number> {
  UEBERSICHT = ausDatei(await ladeJson<GemeindeDatei>(`gemeinden.uebersicht.${region}.json`))
  return UEBERSICHT.length
}

/**
 * Die genauen Flächen des Ausschnitts nachladen.
 *
 * Gibt zurück, ob etwas Neues dazugekommen ist — nur dann muss die Karte ihre
 * Daten neu aufbauen. Beim blossen Verschieben innerhalb schon geladener
 * Kacheln passiert nichts, und das ist der Punkt: vorher ging jede
 * Kartenbewegung als frische Abfrage an die Datenbank.
 */
export async function ladeGemeindenDetail(a: Ausschnitt): Promise<boolean> {
  const features = await DETAIL_LADER.laden(a)
  if (!features) return false
  GENAU = ohneDoppelte(ausDatei({ features }))
  return true
}

export function alleGemeinden(): Gemeinde[] {
  return GENAU.length > 0 ? GENAU : UEBERSICHT
}

const RECHT = (rechtRoh as unknown as { gemeinden: Record<string, GemeindeRecht> }).gemeinden

/**
 * Welche Gemeinde liegt unter diesem Punkt? null ausserhalb der geladenen Flächen.
 *
 * Erst die genauen Kacheln, dann die Übersicht. Die Reihenfolge ist die
 * Aussage: wer weit genug hineingezoomt hat, um zu tippen, hat die genaue
 * Fläche längst geladen; die vereinfachte Übersicht ist nur der Rückfall für
 * einen Tipp aus der Landesansicht, wo eine Abweichung von einem halben
 * Kilometer unter dem Fingerkuppendurchmesser liegt.
 */
export function gemeindeAn(position: Position): Gemeinde | null {
  return GENAU.find((g) => pointInGeometry(position, g.geometry))
    ?? UEBERSICHT.find((g) => pointInGeometry(position, g.geometry))
    ?? null
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
export function gemeindenGeoJSON(welche: 'uebersicht' | 'genau'): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (welche === 'genau' ? GENAU : UEBERSICHT).map((g) => {
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
    geladen: UEBERSICHT.length,
    recherchiert: Object.keys(RECHT).length,
    belegt,
  }
}
