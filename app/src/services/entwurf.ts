/**
 * Die begonnene Tour über eine Anmeldung hinwegretten.
 *
 * „Speichern" braucht ein Konto — aber wer eine Stunde an einer Route
 * gezeichnet, die Etappen gelegt und die Packliste durchgegangen ist, darf das
 * nicht dadurch verlieren, dass er sich dafür erst anmeldet. Beim Wechsel in
 * den Kontobereich bleibt der Zustand ohnehin erhalten, weil die Karte montiert
 * bleibt; ein Bestätigungslink aus der E-Mail lädt die Seite jedoch neu, und
 * dann ist der Arbeitsspeicher leer.
 *
 * Deshalb liegt der Entwurf so lange im `localStorage` — nicht im
 * `sessionStorage`: ein Anmeldelink kann in einem anderen Tab landen, und
 * `sessionStorage` gilt nur für den einen.
 *
 * Gespeichert werden die *Entscheidungen*, nicht das Ergebnis: die gesetzten
 * Stopps, nicht die tausend Stützpunkte der gerouteten Spur. Die entsteht beim
 * Wiederherstellen von selbst neu. Nur eine importierte GPX-Spur kommt
 * vollständig mit — sie lässt sich aus nichts wiederherstellen.
 */
import type { Position } from '../data/geo'
import type { TripParams, Wegpunkt } from '../data/types'
import type { PackStaende } from '../affiliate/packlist'
import type { GespeicherteEtappe } from './account'

const SCHLUESSEL = 'campbuddy.tourentwurf'

/**
 * Wie lange ein Entwurf gilt.
 *
 * Sieben Tage sind grosszügig für eine Anmeldung und kurz genug, dass eine
 * längst vergessene Route nicht Monate später wieder auftaucht.
 */
const HALTBAR_MS = 7 * 24 * 60 * 60 * 1000

export interface Tourentwurf {
  gespeichert: string
  region: string
  /** Die gesetzten Stopps samt Namen — daraus entsteht die Route neu. */
  waypoints: Wegpunkt[]
  /** Eine importierte Spur, die sich nicht neu berechnen lässt. */
  gpxTrack: Position[] | null
  name: string
  trip: TripParams | null
  packliste: PackStaende
  etappen: GespeicherteEtappe[] | null
}

export function entwurfSichern(entwurf: Omit<Tourentwurf, 'gespeichert'>): void {
  try {
    localStorage.setItem(
      SCHLUESSEL,
      JSON.stringify({ ...entwurf, gespeichert: new Date().toISOString() }),
    )
  } catch {
    // Privater Modus, volle Ablage, abgeschaltete Speicherung: alles Gründe,
    // aus denen das scheitern darf. Dann ist die Tour nur nicht über einen
    // Seitenneuaufbau hinweg gerettet — der Weg zur Anmeldung bleibt gangbar.
  }
}

/**
 * Den Entwurf holen und dabei verbrauchen.
 *
 * Verbrauchend mit Absicht: ein Entwurf, der bei jedem Laden zurückkehrt,
 * wäre ein Gespenst. Wer die wiederhergestellte Tour verwirft, soll sie
 * verworfen haben.
 */
export function entwurfAbholen(): Tourentwurf | null {
  let roh: string | null = null
  try {
    roh = localStorage.getItem(SCHLUESSEL)
    if (roh) localStorage.removeItem(SCHLUESSEL)
  } catch {
    return null
  }
  if (!roh) return null

  try {
    const entwurf = JSON.parse(roh) as Tourentwurf
    if (!Array.isArray(entwurf.waypoints) && !entwurf.gpxTrack) return null
    const alter = Date.now() - new Date(entwurf.gespeichert).getTime()
    if (!Number.isFinite(alter) || alter > HALTBAR_MS) return null
    return entwurf
  } catch {
    return null
  }
}

export function entwurfVerwerfen(): void {
  try { localStorage.removeItem(SCHLUESSEL) } catch { /* siehe oben */ }
}

/** Liegt gerade eine Tour und wartet auf die Anmeldung? */
export function entwurfWartet(): boolean {
  try { return localStorage.getItem(SCHLUESSEL) != null } catch { return false }
}
