/**
 * SCHICHT: Community — geteilte Touren, Likes und Kommentare.
 *
 * Getrennt von `account.ts`, weil hier etwas anderes gilt: alles in dieser
 * Datei liest Inhalte *anderer*. Deshalb kommt jede Leseabfrage aus einer
 * View ohne `user_id` (`oeffentliche_routen`, `oeffentliche_kommentare`) und
 * nie aus der Basistabelle — eine Lese-Policy könnte keine Spalten verbergen,
 * siehe Migration 0014.
 *
 * Der zweite Leitgedanke ist die Menge. Die Übersicht muss auch dann noch
 * aufgehen, wenn zehntausend Touren geteilt sind. Praktisch heisst das:
 *   - gefiltert, sortiert und seitenweise wird in der Datenbank, nicht im
 *     Browser. Es wird nie „alles holen und dann filtern" gemacht.
 *   - die Zähler für Likes und Kommentare stehen als Spalte in der Zeile
 *     (Trigger, Migration 0016). Eine Unterabfrage pro Karte wäre bei
 *     zwanzig Einträgen unauffällig und bei zwanzigtausend der Grund,
 *     warum die Seite steht.
 *   - eine Seite fragt immer einen Eintrag mehr an, als sie zeigt. Daran
 *     erkennt sie, ob es weitergeht, ohne die Gesamtzahl zählen zu lassen.
 */
import type { Position } from '../data/geo'
import {
  getSupabase, verlaufLaden, LISTEN_SPALTEN,
  type Kommentar, type KommentarKnoten, type PublicTour, type Verlauf,
} from './supabase'
import { alleZeilen } from './deckel'
import { istSchemaFehlt } from './account'

export type Sortierung = 'neu' | 'beliebt' | 'besprochen' | 'lang' | 'kurz'

export const SORTIERUNGEN: { wert: Sortierung; label: string }[] = [
  { wert: 'neu', label: 'Neueste' },
  { wert: 'beliebt', label: 'Beliebteste' },
  { wert: 'besprochen', label: 'Meist besprochen' },
  { wert: 'lang', label: 'Längste' },
  { wert: 'kurz', label: 'Kürzeste' },
]

/** Längenklassen, wie sie jemand beim Suchen denkt — nicht in Metern. */
export type Laengenklasse = 'alle' | 'kurz' | 'mittel' | 'lang'

export const LAENGENKLASSEN: { wert: Laengenklasse; label: string; von: number; bis: number }[] = [
  { wert: 'alle', label: 'Alle Längen', von: 0, bis: Number.POSITIVE_INFINITY },
  { wert: 'kurz', label: 'bis 10 km', von: 0, bis: 10_000 },
  { wert: 'mittel', label: '10–30 km', von: 10_000, bis: 30_000 },
  { wert: 'lang', label: 'ab 30 km', von: 30_000, bis: Number.POSITIVE_INFINITY },
]

/** Ein Ort, an dem gesucht wird — angetippt auf der Karte. */
export interface Ortsfilter {
  name: string
  position: Position
  umkreisM: number
}

export interface CommunityFilter {
  suche: string
  /** Regionscode, oder null für „alle Regionen". */
  region: string | null
  laenge: Laengenklasse
  /** Nur Touren mit gezeichnetem Verlauf — die ohne haben kein Kartenbild. */
  nurMitWeg: boolean
  sortierung: Sortierung
  /**
   * Gesetzt, wenn von einem angetippten Ort aus gesucht wird. Dann entscheidet
   * die Entfernung über Auswahl und Reihenfolge — Sortierung und Längenklasse
   * treten zurück, weil „nächstgelegene zuerst" die eigentliche Frage ist.
   */
  ort: Ortsfilter | null
}

export const STANDARD_FILTER: CommunityFilter = {
  suche: '', region: null, laenge: 'alle', nurMitWeg: false, sortierung: 'neu', ort: null,
}

/** Wie viele Karten eine Seite trägt. Drei Spalten × vier Reihen. */
export const SEITENGROESSE = 12

export interface Seitenergebnis {
  touren: PublicTour[]
  /** Gibt es hinter dieser Seite noch etwas? */
  mehr: boolean
  /**
   * Geschätzte Gesamtzahl der Treffer. `estimated` lässt PostgREST bei
   * kleinen Mengen exakt zählen und bei grossen die Schätzung des Planers
   * nehmen — genau der Kompromiss, den eine Übersicht braucht: eine Zahl,
   * die stimmt, solange sie klein ist, und die nie teuer wird.
   */
  gesamt: number | null
}

/**
 * Eine Seite geteilter Touren. Braucht keine Anmeldung.
 */
export async function listCommunityTouren(
  filter: CommunityFilter,
  seite: number,
): Promise<Seitenergebnis> {
  const sb = getSupabase()
  if (!sb) return { touren: [], mehr: false, gesamt: 0 }

  /*
    Ortssuche geht einen anderen Weg: die Auswahl trifft `touren_bei` in der
    Datenbank, sortiert nach Entfernung. Eine Seitenaufteilung gibt es dort
    nicht — wer nach „Touren an dieser Hütte" fragt, will die nächsten
    zwanzig sehen, nicht Seite vier. Die Suche im Namen wird darüber noch
    angewandt, damit sich beides kombinieren lässt.
  */
  if (filter.ort) {
    const nah = await listTourenBei(filter.ort.position, filter.ort.umkreisM, 24)
    const suchbegriff = filter.suche.trim().toLowerCase()
    const gefiltert = nah.filter((t) => {
      if (filter.region && t.region !== filter.region) return false
      if (filter.nurMitWeg && t.distance_m == null) return false
      if (!suchbegriff) return true
      return `${t.name} ${t.beschreibung ?? ''}`.toLowerCase().includes(suchbegriff)
    })
    return { touren: gefiltert, mehr: false, gesamt: gefiltert.length }
  }

  let q = sb.from('oeffentliche_routen').select(LISTEN_SPALTEN, { count: 'estimated' })

  const suche = filter.suche.trim()
  if (suche) {
    // Beide Felder mit einem ODER, damit die Suche auch die Beschreibung
    // trifft. Kommas müssen raus: PostgREST trennt die Bedingungen daran.
    const muster = `%${suche.replace(/[,()]/g, ' ')}%`
    q = q.or(`name.ilike.${muster},beschreibung.ilike.${muster}`)
  }
  if (filter.region) q = q.eq('region', filter.region)
  if (filter.nurMitWeg) q = q.not('distance_m', 'is', null)

  const klasse = LAENGENKLASSEN.find((k) => k.wert === filter.laenge)
  if (klasse && filter.laenge !== 'alle') {
    q = q.gte('distance_m', klasse.von)
    if (Number.isFinite(klasse.bis)) q = q.lt('distance_m', klasse.bis)
  }

  switch (filter.sortierung) {
    case 'beliebt':
      q = q.order('likes_count', { ascending: false }).order('veroeffentlicht_am', { ascending: false, nullsFirst: false })
      break
    case 'besprochen':
      q = q.order('kommentare_count', { ascending: false }).order('veroeffentlicht_am', { ascending: false, nullsFirst: false })
      break
    case 'lang':
      q = q.order('distance_m', { ascending: false, nullsFirst: false })
      break
    case 'kurz':
      q = q.order('distance_m', { ascending: true, nullsFirst: false })
      break
    default:
      q = q.order('veroeffentlicht_am', { ascending: false, nullsFirst: false })
  }

  // Einer mehr als gezeigt wird: daran hängt der „Mehr laden"-Knopf, ohne
  // dass irgendetwas gezaehlt werden müsste.
  const von = seite * SEITENGROESSE
  const { data, error, count } = await q.range(von, von + SEITENGROESSE)

  if (istSchemaFehlt(error)) return { touren: [], mehr: false, gesamt: 0 }
  if (error) throw new Error(error.message)

  const zeilen = (data ?? []) as PublicTour[]
  return {
    touren: zeilen.slice(0, SEITENGROESSE),
    mehr: zeilen.length > SEITENGROESSE,
    gesamt: count ?? null,
  }
}

/** Welche Regionen kommen in geteilten Touren überhaupt vor? */
export async function verfuegbareRegionen(): Promise<string[]> {
  const sb = getSupabase()
  if (!sb) return []
  // Nur die Spalte, und die Menge begrenzt: das hier füllt ein Auswahlfeld,
  // es ist keine Auswertung.
  const { data, error } = await sb.from('oeffentliche_routen').select('region').limit(500)
  if (error) return []
  return [...new Set((data ?? []).map((r: { region: string }) => r.region))].sort()
}

/* ---------------------------------------------------------------- Likes */

export async function listLikeIds(): Promise<Set<string>> {
  const sb = getSupabase()
  if (!sb) return new Set()
  try {
    const zeilen = await alleZeilen<{ route_id: string }>((von, bis) =>
      sb.from('likes').select('route_id').range(von, bis))
    return new Set(zeilen.map((r) => r.route_id))
  } catch {
    return new Set()
  }
}

export async function setLike(routeId: string, mag: boolean): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  if (mag) {
    const { data: userData } = await sb.auth.getUser()
    const user_id = userData.user?.id
    if (!user_id) throw new Error('Nicht angemeldet')
    const { error } = await sb.from('likes').insert({ user_id, route_id: routeId })
    // Zweimal geliked ist kein Fehler, sondern ein Doppelklick.
    if (error && error.code !== '23505') throw new Error(uebersetze(error.message))
  } else {
    const { error } = await sb.from('likes').delete().eq('route_id', routeId)
    if (error) throw new Error(uebersetze(error.message))
  }
}

/* ----------------------------------------------------------- Kommentare */

export type KommentarSortierung = 'neu' | 'alt'

/**
 * Kommentare zu einer Tour, als verschachtelte Stränge.
 *
 * Seitenweise wird über die **Ursprünge** gezählt, nicht über alle Beiträge:
 * ein Strang gehört zusammen und darf nicht mitten in der Diskussion
 * abgeschnitten werden.
 *
 * Der ganze Strang kommt dann in *einer* zweiten Abfrage über `wurzel_id` —
 * unabhängig davon, wie tief er ist. Genau dafür trägt jeder Beitrag seine
 * Wurzel mit (Migration 0019): ohne sie bräuchte man je Ebene eine weitere
 * Abfrage, und bei sechs Ebenen wären das sieben statt zwei.
 */
export async function listKommentare(
  routeId: string,
  optionen: { sortierung?: KommentarSortierung; suche?: string; limit?: number; seite?: number } = {},
): Promise<{ straenge: KommentarKnoten[]; mehr: boolean }> {
  const sb = getSupabase()
  if (!sb) return { straenge: [], mehr: false }
  const limit = optionen.limit ?? 20
  const seite = optionen.seite ?? 0

  let q = sb.from('oeffentliche_kommentare').select('*')
    .eq('route_id', routeId)
    .is('eltern_id', null)
  const suche = optionen.suche?.trim()
  if (suche) q = q.ilike('text', `%${suche.replace(/[,()]/g, ' ')}%`)
  q = q.order('created_at', { ascending: optionen.sortierung === 'alt' })

  const von = seite * limit
  const { data, error } = await q.range(von, von + limit)
  if (istSchemaFehlt(error)) return { straenge: [], mehr: false }
  if (error) throw new Error(error.message)

  const zeilen = (data ?? []) as Kommentar[]
  const ursprunge = zeilen.slice(0, limit)
  if (ursprunge.length === 0) return { straenge: [], mehr: false }

  const { data: nachfahren } = await sb
    .from('oeffentliche_kommentare')
    .select('*')
    .in('wurzel_id', ursprunge.map((k) => k.id))
    // Antworten immer aufsteigend: innerhalb eines Strangs liest man von oben
    // nach unten, auch wenn die Ursprünge nach „neueste zuerst" sortiert sind.
    .order('created_at', { ascending: true })
    /*
      Gedeckelt, weil diese Abfrage sonst als einzige im Haus unbegrenzt wäre:
      zwanzig Stränge mal beliebig vielen Antworten. Bei den heutigen Mengen
      greift die Grenze nie; sie steht für den Tag, an dem unter einer Tour
      eine Diskussion mit tausend Beiträgen hängt — dann fehlen die letzten,
      statt dass die Seite stehenbleibt.
    */
    .limit(500)

  return {
    straenge: baumBauen(ursprunge, (nachfahren ?? []) as Kommentar[]),
    mehr: zeilen.length > limit,
  }
}

/**
 * Aus flachen Zeilen einen Baum machen.
 *
 * In einem Durchgang über eine Map statt mit einer Suche je Beitrag: bei einem
 * Strang mit hundert Antworten wäre das sonst quadratisch.
 *
 * Ein Beitrag, dessen Elternteil nicht in der Menge liegt, hängt sich an den
 * Ursprung. Das kann passieren, wenn zwischen den beiden Abfragen jemand einen
 * Kommentar löscht — dann soll die Antwort sichtbar bleiben statt still zu
 * verschwinden.
 */
function baumBauen(ursprunge: Kommentar[], nachfahren: Kommentar[]): KommentarKnoten[] {
  const knoten = new Map<string, KommentarKnoten>()
  for (const k of [...ursprunge, ...nachfahren]) knoten.set(k.id, { ...k, antworten: [] })

  for (const k of nachfahren) {
    const selbst = knoten.get(k.id)!
    const eltern = (k.eltern_id && knoten.get(k.eltern_id))
      || (k.wurzel_id ? knoten.get(k.wurzel_id) : undefined)
    if (eltern && eltern !== selbst) eltern.antworten.push(selbst)
  }

  return ursprunge.map((k) => knoten.get(k.id)!)
}

/** Alle Beiträge eines Strangs, flach — für Zähler und Like-Abfragen. */
export function flachKlopfen(knoten: KommentarKnoten[]): Kommentar[] {
  const raus: Kommentar[] = []
  const stapel = [...knoten]
  while (stapel.length > 0) {
    const k = stapel.pop()!
    raus.push(k)
    stapel.push(...k.antworten)
  }
  return raus
}

export async function schreibeKommentar(
  routeId: string, text: string, autor: string | null, elternId?: string | null,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')
  const { error } = await sb.from('kommentare').insert({
    route_id: routeId, user_id, text: text.trim(), autor: autor?.trim() || null,
    eltern_id: elternId ?? null,
  })
  if (error) throw new Error(uebersetze(error.message))
}

/* ------------------------------------------------- Likes auf Kommentare */

/**
 * Welche der gezeigten Kommentare habe ich geliked?
 *
 * Mit den sichtbaren IDs eingeschränkt statt „alle meine Likes": wer viel
 * kommentiert, hätte sonst mit jeder geöffneten Tour seine gesamte
 * Like-Geschichte im Gepäck.
 */
export async function listKommentarLikeIds(kommentarIds: string[]): Promise<Set<string>> {
  const sb = getSupabase()
  if (!sb || kommentarIds.length === 0) return new Set()
  const { data, error } = await sb
    .from('kommentar_likes')
    .select('kommentar_id')
    .in('kommentar_id', kommentarIds)
  if (error) return new Set()
  return new Set((data ?? []).map((r: { kommentar_id: string }) => r.kommentar_id))
}

export async function setKommentarLike(kommentarId: string, mag: boolean): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  if (mag) {
    const { data: userData } = await sb.auth.getUser()
    const user_id = userData.user?.id
    if (!user_id) throw new Error('Nicht angemeldet')
    const { error } = await sb.from('kommentar_likes').insert({ user_id, kommentar_id: kommentarId })
    // Zweimal geliked ist kein Fehler, sondern ein Doppelklick.
    if (error && error.code !== '23505') throw new Error(uebersetze(error.message))
  } else {
    const { error } = await sb.from('kommentar_likes').delete().eq('kommentar_id', kommentarId)
    if (error) throw new Error(uebersetze(error.message))
  }
}

export async function loescheKommentar(id: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('kommentare').delete().eq('id', id)
  if (error) throw new Error(uebersetze(error.message))
}

/**
 * Welche Kommentare unter dieser Tour sind meine?
 *
 * Kommt aus einer View mit genau zwei Spalten. Der Text steht schon in der
 * öffentlichen Liste; hier braucht es nur die Zuordnung, damit neben dem
 * eigenen Beitrag ein Löschen-Knopf erscheinen kann.
 */
export async function eigeneKommentarIds(routeId: string): Promise<Set<string>> {
  const sb = getSupabase()
  if (!sb) return new Set()
  const { data, error } = await sb.from('eigene_kommentar_ids').select('id').eq('route_id', routeId)
  if (error) return new Set()
  return new Set((data ?? []).map((r: { id: string }) => r.id))
}

/* ------------------------------------------------- Touren an einem Ort */

/** Standard-Umkreis: so weit, wie man von einer Tour aus noch hinläuft. */
export const ORT_UMKREIS_M = 3000

/**
 * Geteilte Touren, die an einem Ort vorbeikommen — nächstgelegene zuerst.
 *
 * Gerechnet wird in der Datenbank (`touren_bei`, Migration 0020): erst eine
 * Vorauswahl über das Umgebungsrechteck jeder Tour, dann die echte Entfernung
 * zum Verlauf. Im Browser wäre beides nicht machbar, ohne vorher alle
 * geteilten Touren zu laden.
 */
export async function listTourenBei(
  position: Position,
  umkreisM = ORT_UMKREIS_M,
  maxAnzahl = 12,
): Promise<PublicTour[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('touren_bei', {
    lon: position[0], lat: position[1], umkreis_m: umkreisM, max_anzahl: maxAnzahl,
  // Auch hier nur die Listenspalten: die Funktion gibt den vollen Zeilentyp
  // der View zurück, und ohne diese Auswahl käme die Geometrie doch wieder mit.
  }).select(LISTEN_SPALTEN)
  if (error) {
    if (istSchemaFehlt(error) || /function .* does not exist|schema cache/i.test(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as PublicTour[]
}

/** Postgres-Meldungen sind für Entwickler geschrieben, nicht für Wanderer. */
function uebersetze(meldung: string): string {
  if (/row-level security/i.test(meldung)) {
    return 'Dafür fehlt die Berechtigung — bist du noch angemeldet, und ist die Tour noch geteilt?'
  }
  if (/relation .* does not exist|schema cache|column .* does not exist/i.test(meldung)) {
    return 'Das klappt gerade nicht. Versuch es später noch einmal.'
  }
  return meldung
}

/* ------------------------------------------------------------- Verlauf */

/**
 * Den vollen Verlauf einer geteilten Tour nachholen.
 *
 * Die Übersicht kennt von jeder Tour nur die ausgedünnte `vorschau` — genug
 * fürs Bild, zu grob für die Karte. Dieser Aufruf steht deshalb an genau den
 * Stellen, an denen der Weg wirklich gebraucht wird: „Auf Karte", das
 * Höhenprofil, der GPX-Export. Eine Tour, keine Liste.
 *
 * Fehlt die Tour (inzwischen zurückgezogen), kommt ein leerer Verlauf zurück
 * statt eines Fehlers: die Karte bleibt dann stehen, wo sie ist.
 */
export async function ladeVerlauf(routeId: string): Promise<Verlauf> {
  return verlaufLaden('oeffentliche_routen', routeId)
}
