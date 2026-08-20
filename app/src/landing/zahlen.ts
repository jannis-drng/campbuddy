/**
 * Die Zahlen der Startseite — aus den Projektdaten, aber schlank geladen.
 *
 * Warum nicht einfach `legalData`? Weil dessen Zugriffs-API auch die
 * Gipfeldatei (rund 290 kB) und den Supabase-Client mitzieht. Beides braucht
 * die Karte, die Startseite nicht — und eine Startseite, die erst ein
 * Kartenpaket herunterlädt, bevor sie erklärt, worum es geht, verliert genau
 * die Besucher, für die sie gebaut ist.
 *
 * Gelesen wird deshalb direkt aus den beiden Dateien, die die Aussagen
 * tragen: der rechtlichen Einstufung und den Punkten. Abgeschrieben wird
 * nichts — ändert sich die Datenlage, ändert sich diese Seite mit.
 */
import type { LegalStatus, Permission, PointType, ReviewStatus } from '../data/types'
import legalVS from '../data/zones/CH-VS.legal.json'
import osmVS from '../data/zones/CH-VS.osm.json'
import pointsVS from '../data/points/CH-VS.json'

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
const punkte = pointsVS as unknown as { type: PointType }[]

export const zonenGesamt = Object.keys(eintraege).length
export const zonenEntwurf = Object.values(eintraege).filter((e) => e.review_status === 'entwurf').length
export const zonenBelegt = zonenGesamt - zonenEntwurf

export const punkteGesamt = punkte.length
export const punkteJeArt = (typ: PointType) => punkte.filter((p) => p.type === typ).length

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
