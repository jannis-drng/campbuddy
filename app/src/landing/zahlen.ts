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
 * Die Beispiel-Infokarte zieht weiterhin eine echte Fläche aus den gebündelten
 * Walliser Daten. Die liegt auch in der Datenbank; sie ist hier nur die eine,
 * die ohne Netz schon da ist.
 */
import type { LegalStatus, Permission, ReviewStatus } from '../data/types'
import bestandRoh from '../data/bestand.json'
import legalVS from '../data/zones/CH-VS.legal.json'
import osmVS from '../data/zones/CH-VS.osm.json'

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

const eintraege = (legalVS as unknown as { zones: Record<string, Eintrag> }).zones
const namen = new Map(
  (osmVS as unknown as { features: { id: string; properties: { name: string } }[] }).features
    .map((f) => [f.id, f.properties.name] as const),
)

/**
 * Eine echte Fläche als Beispiel für die Infokarte. Bevorzugt der Aletschwald,
 * weil er die Aussage am deutlichsten trägt; fällt sonst auf die erste
 * verbotene Fläche zurück, damit das Beispiel nie leer bleibt.
 */
function waehleBeispiel() {
  const ids = Object.keys(eintraege)
  const id = ids.find((i) => i === 'osm-way-38781889')
    ?? ids.find((i) => eintraege[i].status === 'forbidden')
    ?? ids[0]
  if (!id) return null
  return { id, name: namen.get(id) ?? id, ...eintraege[id] }
}

export const beispielZone = waehleBeispiel()
