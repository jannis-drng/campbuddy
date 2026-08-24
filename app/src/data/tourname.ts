/**
 * Namensvorschläge für eine gezeichnete Tour.
 *
 * Einen Namen zu erfinden ist die letzte Hürde vor dem Speichern — und die
 * unnötigste: die Tour weiss selbst, wo sie langgeht. Aus den angetippten
 * Orten, den Gipfeln am Weg und den durchquerten Zonen lässt sich ein Titel
 * bauen, der besser ist als „Tour 3".
 *
 * Zwei Regeln haben die Form der Vorschläge bestimmt:
 *
 *  - **Keine Artikel, keine Präpositionen mit Geschlecht.** „im Wallis" geht,
 *    „im Schweiz" nicht, und ob eine Zone der, die oder das ist, weiß hier
 *    niemand. Deshalb Gedankenstrich und Bindestrich-Zusammensetzungen:
 *    „Moiry – Zermatt", „Parrotspitze-Runde". Die sind immer richtig.
 *  - **Nichts erfinden.** Jeder Bestandteil kommt aus echten Daten: aus einem
 *    angetippten Symbol, einem erfassten Gipfel, einem erfassten Punkt oder
 *    einer eingezeichneten Zone. Gibt es nichts davon, sagt der Vorschlag nur
 *    Länge und Dauer — das stimmt immer.
 */
import { distanceMeters, type Position } from './geo'
import type { Etappe } from './hiking'
import type { CrossedZone } from './routeAnalysis'
import type { Peak, Point, Wegpunkt } from './types'

/** Wie nah ein erfasster Ort am Start liegen muss, um ihn zu benennen. */
const NAH_AM_ENDE_M = 900

/** Ab welcher Nähe von Start und Ziel es eine Rundtour ist. */
const RUNDTOUR_M = 400

/** Wie weit ein Gipfel von der Route weg sein darf, um als Höhepunkt zu zählen. */
const GIPFEL_NAH_M = 1200

export interface TournameDaten {
  /** Die gesetzten Wegpunkte — benannte zuerst, sie sind die beste Quelle. */
  wegpunkte: Wegpunkt[]
  route: Position[]
  /** Erfasste Punkte der Region, um unbenannte Enden zu benennen. */
  points: Point[]
  peaks: Peak[]
  crossed: CrossedZone[]
  etappen: Etappe[]
}

/**
 * Bis zu drei Vorschläge, bester zuerst. Immer mindestens einer.
 */
export function tournameVorschlaege(daten: TournameDaten): string[] {
  const { route } = daten
  const vorschlaege: string[] = []

  const start = ortAm(daten, 0)
  const ziel = ortAm(daten, route.length - 1)
  const rundtour = route.length > 1
    && distanceMeters(route[0], route[route.length - 1]) <= RUNDTOUR_M
  const gipfel = hoechsterGipfelAmWeg(daten, [start, ziel])
  const zone = groessteZone(daten.crossed)
  const dauer = dauerTeil(daten)

  if (rundtour && start) {
    vorschlaege.push(`Rundtour ab ${start}`)
    if (gipfel) vorschlaege.push(`Rundtour ab ${start} über ${gipfel}`)
  } else if (start && ziel && start !== ziel) {
    vorschlaege.push(`${start} – ${ziel}`)
    if (gipfel) vorschlaege.push(`${start} – ${ziel} über ${gipfel}`)
  } else if (start || ziel) {
    const einziger = (start ?? ziel)!
    // „Moiry – Grand Cornier" behauptet ein Ziel. Ein Gipfel am Weg ist aber
    // kein Ziel, sondern eine Station — also „über", nicht Gedankenstrich.
    vorschlaege.push(gipfel ? `${einziger} über ${gipfel}` : zusammensetzen(einziger, rundtour))
  }

  if (gipfel) vorschlaege.push(zusammensetzen(gipfel, rundtour))
  if (zone) {
    vorschlaege.push(rundtour
      ? zusammensetzen(zone, true)
      : einWort(zone) ? `${zone}-Durchquerung` : `Durchquerung ${zone}`)
  }

  // Fällt alles aus, bleibt das, was immer stimmt.
  vorschlaege.push(dauer)

  // Dauer voranstellen, wenn es eine Mehrtagestour ist: „4 Tage" trennt zwei
  // Touren über dieselbe Strecke besser als jedes andere Merkmal.
  const tage = daten.etappen.length
  const mitDauer = tage > 1 && vorschlaege[0] !== dauer
    ? [`${vorschlaege[0]} in ${tage} Tagen`, ...vorschlaege]
    : vorschlaege

  return [...new Set(mitDauer.map(kuerzen))].slice(0, 3)
}

/** Der beste einzelne Vorschlag. */
export function tournameVorschlag(daten: TournameDaten): string {
  return tournameVorschlaege(daten)[0]
}

/* ------------------------------------------------------------- Bausteine */

/**
 * „Parrotspitze-Runde" liest sich gut, „Pigne de la Le-Runde" nicht: ein
 * Bindestrich bindet nur das letzte Wort, und aus drei Wörtern wird dabei
 * Unsinn. Mehrteilige Namen bekommen deshalb die getrennte Form.
 */
function einWort(name: string): boolean {
  return !/\s/.test(name)
}

function zusammensetzen(name: string, rundtour: boolean): string {
  if (einWort(name)) return rundtour ? `${name}-Runde` : `${name}-Tour`
  return rundtour ? `Rundtour über ${name}` : `Tour über ${name}`
}

/**
 * Wie heisst der Ort am Anfang bzw. Ende der Route?
 *
 * Zuerst der angetippte Wegpunkt — wer eine Hütte bewusst angetippt hat, meint
 * sie auch. Erst wenn dort nichts steht, wird der nächste erfasste Ort gesucht,
 * und auch das nur, wenn er wirklich nah liegt: ein Gipfel drei Kilometer
 * weiter ist kein Startpunkt.
 */
function ortAm(daten: TournameDaten, index: number): string | null {
  const { wegpunkte, route, points, peaks } = daten
  if (route.length === 0) return null

  const amAnfang = index === 0
  const wegpunkt = amAnfang ? wegpunkte[0] : wegpunkte[wegpunkte.length - 1]
  if (wegpunkt?.ort) return wegpunkt.ort.name

  const stelle = route[index]
  if (!stelle) return null

  let bester: { name: string; abstand: number } | null = null
  for (const p of points) {
    const abstand = distanceMeters(stelle, [p.lng, p.lat])
    if (abstand <= NAH_AM_ENDE_M && (!bester || abstand < bester.abstand)) {
      bester = { name: p.name, abstand }
    }
  }
  for (const p of peaks) {
    const abstand = distanceMeters(stelle, [p.lng, p.lat])
    if (abstand <= NAH_AM_ENDE_M && (!bester || abstand < bester.abstand)) {
      bester = { name: p.name, abstand }
    }
  }
  return bester?.name ?? null
}

/**
 * Der höchste Gipfel nahe der Route — das, woran man sich erinnert.
 *
 * Geprüft wird gegen jeden Stützpunkt der Route, nicht gegen die Strecken
 * dazwischen. Bei einer gerouteten Linie mit dichten Stützpunkten ist der
 * Unterschied kleiner als der Umkreis, gegen den geprüft wird.
 */
function hoechsterGipfelAmWeg(daten: TournameDaten, schonVergeben: (string | null)[]): string | null {
  const { peaks, route } = daten
  if (route.length === 0) return null

  let bester: Peak | null = null
  for (const p of peaks) {
    if (schonVergeben.includes(p.name)) continue
    if (bester && p.elevation <= bester.elevation) continue
    const nah = route.some((stelle) => distanceMeters(stelle, [p.lng, p.lat]) <= GIPFEL_NAH_M)
    if (nah) bester = p
  }
  return bester?.name ?? null
}

/** Die Zone mit dem grössten Streckenanteil — wenn sie überhaupt prägt. */
function groessteZone(crossed: CrossedZone[]): string | null {
  const groesste = crossed.reduce<CrossedZone | null>(
    (a, b) => (!a || b.share > a.share ? b : a), null,
  )
  // Unter einem Drittel der Strecke ist die Zone eine Durchfahrt, kein Titel.
  return groesste && groesste.share >= 0.33 ? groesste.zone.name : null
}

/** Was immer stimmt: Dauer und Länge. */
function dauerTeil(daten: TournameDaten): string {
  const tage = daten.etappen.length
  const laenge = daten.route.length > 1 ? laengeKurz(daten) : null
  if (tage > 1) return laenge ? `${tage}-Tage-Tour, ${laenge}` : `${tage}-Tage-Tour`
  return laenge ? `Tagestour, ${laenge}` : 'Neue Tour'
}

function laengeKurz(daten: TournameDaten): string | null {
  let meter = 0
  for (let i = 1; i < daten.route.length; i++) {
    meter += distanceMeters(daten.route[i - 1], daten.route[i])
  }
  if (meter < 100) return null
  return meter >= 1000
    ? `${(meter / 1000).toFixed(1).replace('.', ',')} km`
    : `${Math.round(meter)} m`
}

/** Die Datenbank lässt 120 Zeichen zu; ein Titel darüber ist ohnehin keiner. */
function kuerzen(name: string): string {
  return name.length <= 120 ? name : `${name.slice(0, 117).trimEnd()}…`
}
