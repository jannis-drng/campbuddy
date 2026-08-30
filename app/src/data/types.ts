/**
 * SCHICHT 1 — LEGALITÄTS-DATENSCHICHT (Typen)
 *
 * Das Datenmodell folgt Abschnitt 8 der Spezifikation. Es ist bewusst
 * datenbank-nah gehalten, damit der spätere Umzug von statischem JSON
 * nach Supabase/PostGIS ein Austausch der Zugriffs-Funktionen bleibt
 * und keine Änderung an der UI erfordert.
 */

import type { Position } from './geo'

export type LegalStatus = 'allowed' | 'forbidden' | 'tolerated' | 'unknown'

/** Für Zelt / Biwak / Fahrzeug / Feuer: erlaubt, verboten oder an Bedingungen geknüpft. */
export type Permission = 'yes' | 'no' | 'conditional' | 'unknown'

/**
 * Prüfstand der rechtlichen Einstufung. Steuert direkt die Warnhinweise im UI.
 * - 'entwurf'    = aus allgemeinem Rechtsrahmen abgeleitet, NICHT amtlich geprüft
 * - 'quelle'     = mit benannter offizieller Quelle belegt
 * - 'vor-ort'    = zusätzlich selbst vor Ort verifiziert
 */
export type ReviewStatus = 'entwurf' | 'quelle' | 'vor-ort'

export interface Zone {
  id: string
  region: RegionCode
  name: string
  status: LegalStatus
  tent_allowed: Permission
  /**
   * Biwakieren — bewusst getrennt vom Zelt.
   *
   * Der wichtigste Unterschied im schweizerischen Recht und lange die grösste
   * Unehrlichkeit dieser Karte: sie zeigte eine Zeile „Zelt / Biwak" und
   * behauptete damit, die Zeltregel gelte fürs Biwak mit. Das stimmt gerade
   * dort nicht, wo es zählt — oberhalb der Waldgrenze ist das Biwakieren
   * vielerorts geduldet, während das Aufstellen eines Zelts untersagt bleibt.
   * Reglemente sprechen von „Campieren" und „Zelten", das blosse Übernachten
   * im Schlafsack fassen sie oft gar nicht.
   *
   * Fehlt das Feld, gilt `unknown` — und das ist der Normalfall, nicht die
   * Ausnahme: die meisten Reglemente sagen zum Biwak schlicht nichts. Genau
   * das darf die Karte dann auch sagen. Ein fehlendes Feld auf den Zeltwert
   * zurückfallen zu lassen wäre die alte Unehrlichkeit mit mehr Schritten.
   */
  bivouac_allowed?: Permission
  vehicle_allowed: Permission
  fire_allowed: Permission
  /** Freitext-Bedingungen, z.B. "nur oberhalb der Waldgrenze, eine Nacht". */
  conditions: string | null
  source: string | null
  source_url: string | null
  /** ISO-Datum der letzten eigenen Prüfung. null = noch nie geprüft. */
  last_verified: string | null
  review_status: ReviewStatus
  notes: string | null
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export type PointType = 'hut' | 'campsite' | 'vehicle_spot'

export interface Point {
  id: string
  region: RegionCode
  type: PointType
  name: string
  lat: number
  lng: number
  elevation: number | null
  info: {
    operator?: string | null
    phone?: string | null
    website?: string | null
    capacity?: string | null
    opening_hours?: string | null
    seasonal?: string | null
  }
  source: string | null
  source_url: string | null
  last_verified: string | null
}

/**
 * Natur-Objekte aus OpenStreetMap: Wasser und Aussicht.
 *
 * Bewusst getrennt von `Point`: `Point` sind Orte zum Übernachten und tragen
 * deshalb eine rechtliche Relevanz und ein Prüfdatum. Ein Brunnen hat beides
 * nicht — er ist Orientierung, keine Aussage über die Rechtslage.
 */
export type NatureType = 'lake' | 'spring' | 'drinking_water' | 'waterfall' | 'viewpoint'

export interface NatureFeature {
  id: string
  region: RegionCode
  type: NatureType
  name: string
  /** false = der Name ist nur die Gattung („Quelle"), nicht aus OSM. */
  benannt: boolean
  lat: number
  lng: number
  elevation: number | null
  source_url: string
}

/** Benannter Gipfel mit Höhe — Orientierung und später Etappenbenennung. */
export interface Peak {
  id: string
  region: RegionCode
  name: string
  lat: number
  lng: number
  elevation: number
  source_url: string
}

/**
 * Ein selbst markierter Punkt.
 *
 * Der bewusste Unterschied zu `Point` und `NatureFeature`: das hier ist eine
 * *Meinung* („schöner Aussichtspunkt"), keine Auskunft. Deshalb steht sie nie
 * in derselben Ebene wie die Rechtsdaten, trägt kein Prüfdatum und ist
 * standardmässig privat — Veröffentlichen ist ausdrücklich opt-in, wie bei
 * den Routen.
 */
export type EigenerPunktTyp = 'viewpoint' | 'campspot' | 'water' | 'foto' | 'sonstiges'

export interface EigenerPunkt {
  id: string
  user_id?: string
  region: RegionCode
  typ: EigenerPunktTyp
  name: string
  notiz: string | null
  lat: number
  lng: number
  /** Pfad im Storage-Bucket, nicht die fertige URL — die ist zeitlich begrenzt. */
  foto_pfad: string | null
  /** Bezug zu einer Route, wenn der Punkt beim Planen entstanden ist. */
  route_id: string | null
  ist_oeffentlich: boolean
  created_at?: string
}

/**
 * Ein Kanton — beziehungsweise allgemein die Ebene, die ausserhalb
 * eingezeichneter Schutzgebiete zuständig ist.
 *
 * Das ist in der Schweiz der eigentliche Punkt: Bundesrecht regelt die
 * Schutzgebiete, alles andere regeln Kanton und Gemeinde. Eine landesweite
 * Auskunft ist dort bestenfalls unscharf. Diese Ebene sagt deshalb wenigstens,
 * *wer* zuständig ist — und wo die Recherche dazu steht.
 */
export interface Kanton {
  id: string
  /** ISO-Code wie 'CH-BE'. Schlüssel der Rechtspflege. */
  code: string | null
  name: string
  source_url: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/**
 * Die kantonale Regelung zum Übernachten im Freien.
 *
 * Fehlt ein Eintrag, ist das keine Lücke im Code, sondern der wahrheitsgemässe
 * Zustand: für diesen Kanton wurde noch nicht recherchiert. Die Oberfläche
 * sagt das auch so, statt eine landesweite Faustregel als kantonale Auskunft
 * auszugeben.
 */
export interface KantonRecht {
  status: LegalStatus
  tent_allowed: Permission
  /** Biwakieren, getrennt vom Zelt — siehe `Zone.bivouac_allowed`. */
  bivouac_allowed?: Permission
  vehicle_allowed: Permission
  fire_allowed: Permission
  /** Was gilt, in zwei bis vier Sätzen. */
  summary: string
  conditions: string | null
  source: string
  source_url: string
  review_status: ReviewStatus
  last_verified: string | null
}

/**
 * Eine Gemeinde — die Ebene, auf der über das Campieren tatsächlich entschieden wird.
 *
 * Der Kanton war die falsche Auflösung. In der Schweiz regelt das Übernachten
 * im Freien überwiegend die Gemeinde: über Polizeireglement, Nutzungsplanung
 * oder ein Verbot am Seeufer. Zwei Nachbargemeinden im selben Kanton können es
 * gegensätzlich halten — eine kantonale Auskunft ist dann im Zweifel eine
 * falsche Auskunft.
 *
 * `website` und `email` sind nicht Beiwerk, sondern Teil der Antwort: solange
 * eine Gemeinde ungeprüft ist, ist "frag dort nach" das Ehrlichste, was diese
 * Karte sagen kann — und der Kontakt soll dann einen Klick weit weg sein.
 */
export interface Gemeinde {
  id: string
  /** Amtliche BFS-Nummer. Überlebt Umbenennungen und Fusionen; Schlüssel der Rechtspflege. */
  bfs: number | null
  name: string
  /** ISO-Code des Kantons, z. B. 'CH-VS'. */
  kanton: string | null
  website: string | null
  email: string | null
  source_url: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/**
 * Die kommunale Regelung zum Übernachten im Freien.
 *
 * Fehlt ein Eintrag, ist das kein Fehler, sondern der wahrheitsgemässe Zustand:
 * für diese Gemeinde wurde noch nicht recherchiert. Die Karte färbt solche
 * Flächen deshalb neutral ein und sagt es offen — sie rät nicht.
 *
 * Bewusst dieselbe Form wie `KantonRecht`, damit die Oberfläche beide Ebenen
 * gleich darstellen kann und die feinere die gröbere nur überschreibt.
 */
export interface GemeindeRecht {
  status: LegalStatus
  tent_allowed: Permission
  /** Biwakieren, getrennt vom Zelt — siehe `Zone.bivouac_allowed`. */
  bivouac_allowed?: Permission
  vehicle_allowed: Permission
  fire_allowed: Permission
  /** Was gilt, in zwei bis vier Sätzen. */
  summary: string
  conditions: string | null
  source: string
  source_url: string
  review_status: ReviewStatus
  last_verified: string | null
}

export type RegionCode = string

export interface Region {
  code: RegionCode
  name: string
  country: string
  center: [number, number]
  zoom: number
  /**
   * Umschliessendes Rechteck [West, Süd, Ost, Nord].
   *
   * Begrenzt den Kartenausschnitt: gepolstert um einen festen Spielraum ergibt
   * es den Bereich, in dem sich die Karte bewegen lässt (siehe
   * `kartenGrenzen` in map/mapConfig.ts). Wer eine Region einträgt, legt damit
   * zugleich fest, wohin man scrollen kann.
   */
  bounds: [number, number, number, number]
  /** Der allgemeine Rechtsrahmen der Region — wird im UI als Kontext gezeigt. */
  legal_framework: {
    summary: string
    baseline_status: LegalStatus
    references: { label: string; url: string }[]
  }
}

/**
 * Wofür die Karte gerade eingefärbt wird.
 * 'all' zeigt die Gesamteinstufung der Zone, sonst die Regel für genau diese Aktivität.
 */
export type ActivityMode = 'all' | 'tent' | 'bivouac' | 'vehicle' | 'fire'

/** Filterzustand der Kartenansicht. */
export interface MapFilters {
  activity: ActivityMode
  showHuts: boolean
  showCampsites: boolean
  showVehicleSpots: boolean
  showPeaks: boolean
  /** Trinkwasser, Quellen, Wasserfälle und Seen. */
  showWater: boolean
  showViewpoints: boolean
  /** Selbst markierte Punkte und Fotos entlang der Route. */
  showEigene: boolean
}

/** Jahreszeit-Einstufung für die Ausrüstungswahl. */
export type Season = 'sommer' | 'uebergang' | 'winter'

/**
 * Eckdaten einer geplanten Tour (Schema nach Abschnitt 8.6).
 *
 * Noch ohne `id`/`user_id`: gespeichert wird erst mit Login [BALD].
 * Die Felder sind bewusst schon so benannt wie die spätere Tabelle.
 */
export interface TripParams {
  start_date: string
  days: number
  persons: number
  /** Geplante Schlafhöhe in Metern — bestimmt Temperatur und Ausrüstung. */
  elevation: number
  season: Season
  /** Übernachtungsart — entscheidet, ob Zelt/Biwak überhaupt nötig ist. */
  shelter: 'zelt' | 'biwak' | 'huette'
}

/**
 * Ein gesetzter Wegpunkt.
 *
 * Trägt neben dem Ort auch, *was* dort steht, wenn er durch Antippen eines
 * Symbols entstanden ist. Vorher war ein Wegpunkt eine nackte Koordinate, und
 * die Liste im Routenpanel konnte nur „Zwischenstopp 2" sagen — obwohl der
 * Nutzer gerade bewusst eine bestimmte Hütte angetippt hatte.
 *
 * `ort` ist optional: ein Klick auf freie Fläche ist weiterhin ein gültiger
 * Wegpunkt, er heisst nur nicht.
 */
export type WegpunktArt = 'hut' | 'campsite' | 'vehicle_spot' | 'peak' | 'wasser' | 'aussicht' | 'eigen'

export interface Wegpunkt {
  position: Position
  ort?: { name: string; art: WegpunktArt }
  /**
   * Selbst vergebener Name, zum Beispiel „Schlafplatz" oder „Wasser holen".
   *
   * Schlägt den Namen des übernommenen Ortes: wer eine Hütte antippt und sie
   * „Nacht 2" nennt, meint das auch so. Siehe `data/wegpunkte.ts`.
   */
  name?: string
}

/**
 * Der sichtbare Kartenausschnitt.
 *
 * Gipfel, Naturobjekte und die genauen Gemeindeflächen werden nicht
 * landesweit geladen, sondern immer nur für das, was gerade auf dem Schirm
 * ist. Landesweit sind das zusammen über dreissigtausend Objekte und mehrere
 * Megabyte — für Ebenen, die ohnehin erst ab Zoom 9,5 beziehungsweise 12,5
 * gezeichnet werden. Wer die Schweiz als Ganzes ansieht, braucht keinen
 * einzigen Brunnen.
 */
export interface Ausschnitt {
  west: number
  sued: number
  ost: number
  nord: number
  /**
   * Die Zoomstufe gehört dazu, weil sonst Kacheln geladen werden, die niemand
   * sieht. Bei der Landesansicht deckt der Ausschnitt über hundert Kacheln ab
   * — für Ebenen, die dort gar nicht gezeichnet werden. Ohne diesen Wert wäre
   * das Kacheln ein Rückschritt gegenüber den Datenbankabfragen gewesen, nicht
   * ein Fortschritt.
   */
  zoom: number
}
