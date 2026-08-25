/**
 * Die Zahlen der Startseite.
 *
 * Sie kommen aus `data/bestand.json` — einer 193 Bytes grossen Datei, die beim
 * Import mitgeschrieben wird und zählt, was tatsächlich in der Datenbank
 * liegt. Selbst nachzuzählen ginge nicht mehr: der vollständige Bestand für
 * die Schweiz liegt nicht im Bundle, und ausgedachte Zahlen sind in diesem
 * Projekt tabu. Ändert sich die Datenlage, ändert sich diese Seite mit — aber
 * erst, wenn jemand den Import laufen lässt, und genau das steht als `stand`
 * dabei.
 *
 * Die Beispiel-Infokarte zieht eine echte Fläche aus `snapshot/beispiel.CH.json`
 * — einer Datei von einem Kilobyte, die das Snapshot-Skript beim Bauen
 * aussucht. Vorher lag dafür die komplette Walliser Zonen-Datei im
 * Einstiegsbündel: 66 KB gepackt, für einen Namen und sechs Felder, auf der
 * Seite, die ein neuer Besucher als allererstes lädt.
 */
import type { LegalStatus, Permission, ReviewStatus } from '../data/types'
import bestandRoh from '../data/bestand.json'
import beispielRoh from '../data/snapshot/beispiel.CH.json'

interface Bestand {
  region: string
  stand: string
  zonen: number
  zonen_abgeleitet: number
  zonen_ungeklaert: number
  zonen_belegt: number
  zonen_geprueft: number
  zonen_amtlich: number
  punkte: number
  huetten: number
  campingplaetze: number
  stellplaetze: number
  gipfel: number | null
  gemeinden: number
  gemeinden_eingestuft: number
  gemeinden_belegt: number
  gemeinden_vor_ort: number
}

const bestand = bestandRoh as Bestand

export const STAND = bestand.stand

export const zonenGesamt = bestand.zonen
/** Mit einer benannten amtlichen Quelle belegt (BAFU-Inventare). */
export const zonenBelegt = bestand.zonen_belegt
/** Selbst vor Ort nachgesehen — die härteste Stufe, und weiterhin bei null. */
export const zonenVorOrt = bestand.zonen_geprueft
/** Ohne jeden Beleg: aus OSM-Merkmalen abgeleitet. */
export const zonenEntwurf = bestand.zonen - bestand.zonen_belegt - bestand.zonen_geprueft
export const zonenAmtlich = bestand.zonen_amtlich
/** Flächen, für die es überhaupt eine Einstufung gibt (der Rest bleibt „ungeklärt"). */
export const zonenEingestuft = bestand.zonen_abgeleitet
export const zonenUngeklaert = bestand.zonen_ungeklaert

/**
 * Die Gemeindeebene — und was daran wirklich zählt.
 *
 * Nicht „2119 Gemeinden erfasst": Grenzen zu laden ist keine Leistung, das ist
 * ein Nachmittag Arbeit an einem OSM-Import. Die Zahl, die etwas aussagt, ist
 * `gemeindenBelegt` — wie viele davon eine mit einem amtlichen Dokument
 * belegte Einstufung tragen. Solange das eine Handvoll ist, soll genau das
 * dastehen.
 */
export const gemeindenGesamt = bestand.gemeinden
export const gemeindenEingestuft = bestand.gemeinden_eingestuft
/** Mit einem benannten amtlichen Dokument belegt. Die einzige Zahl, die trägt. */
export const gemeindenBelegt = bestand.gemeinden_belegt
export const gemeindenVorOrt = bestand.gemeinden_vor_ort

export const punkteGesamt = bestand.punkte
export const gipfelGesamt = bestand.gipfel

const JE_ART: Record<string, number> = {
  hut: bestand.huetten,
  campsite: bestand.campingplaetze,
  vehicle_spot: bestand.stellplaetze,
}
export const punkteJeArt = (typ: string) => JE_ART[typ] ?? 0

/* -------------------------------------------------------- Beispielfläche */

interface Eintrag {
  status: LegalStatus
  tent_allowed: Permission
  vehicle_allowed: Permission
  fire_allowed: Permission
  conditions: string | null
  review_status: ReviewStatus
  last_verified: string | null
}

interface Beispiel extends Eintrag {
  id: string
  name: string
}

export const beispielZone = beispielRoh as unknown as Beispiel
