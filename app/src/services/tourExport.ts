/**
 * Die fertige Route in fremde Tourenplaner bringen (Abschnitt 4.2).
 *
 * Wichtig für die Erwartung: **es gibt hier keine Schnittstelle.** komoot
 * betreibt keine offene API — nur ein Partnerprogramm für Geräte-Hersteller —
 * und Stravas API kann Aktivitäten entgegennehmen, aber keine *geplante*
 * Route anlegen. Ein Knopf "direkt zu komoot senden" wäre also gelogen.
 *
 * Was tatsächlich geht, ist zweierlei:
 *
 *  1. **Teilen-Auswahl des Geräts** (`navigator.share` mit Datei). Auf Telefon
 *     und Tablet ist das der kurze Weg: eine Berührung, und komoot, Strava,
 *     Garmin oder Dateien stehen zur Auswahl — die Apps nehmen GPX entgegen.
 *     Das ist so nah an "Export to komoot", wie es ohne API kommt.
 *  2. **Datei bereitlegen und die Import-Seite öffnen.** Am Rechner gibt es
 *     keine Teilen-Auswahl; dort lädt CampBuddy die GPX-Datei herunter und
 *     öffnet im neuen Tab genau die Seite, auf der sie hingehört.
 *
 * Beides bleibt eine Datei-Übergabe. Deshalb sagt die Oberfläche das auch.
 */
import type { Position } from '../data/geo'
import type { Wegpunkt } from '../data/types'
import { toGpx } from './gpx'

/** Ein Dienst, der GPX-Dateien entgegennimmt. */
export interface ExportZiel {
  id: 'komoot' | 'strava' | 'garmin'
  name: string
  /** Die Seite, auf der der Import tatsächlich beginnt. */
  url: string
  /** Was dort zu tun ist — spart das Suchen im fremden Menü. */
  schritt: string
}

/**
 * Bewusst kurz gehalten: die drei, die Wanderer und Radfahrer im
 * deutschsprachigen Raum tatsächlich nutzen. Jede weitere Kachel macht die
 * Wahl langsamer, nicht besser.
 *
 * Die Adressen sind Einstiegsseiten, keine tiefen Links mit Parametern —
 * ein Upload lässt sich von aussen nicht anstossen, und tiefe Links in
 * fremden Oberflächen brechen bei jedem Redesign.
 */
export const EXPORT_ZIELE: ExportZiel[] = [
  {
    id: 'komoot',
    name: 'komoot',
    url: 'https://www.komoot.com/upload',
    schritt: 'Datei wählen — komoot legt sie als geplante Tour an.',
  },
  {
    id: 'strava',
    name: 'Strava',
    url: 'https://www.strava.com/maps/create',
    schritt: 'Im Routenplaner auf "Hochladen" — Strava rastet die Spur auf seine Wege.',
  },
  {
    id: 'garmin',
    name: 'Garmin Connect',
    url: 'https://connect.garmin.com/modern/import-data',
    schritt: 'Datei importieren, dann auf die Uhr übertragen.',
  },
]

/** Aus dem Tournamen einen brauchbaren Dateinamen machen. */
export function dateiname(name: string): string {
  const rein = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${rein || 'campbuddy-route'}.gpx`
}

/** Die Route als echte Datei — dieselbe, egal ob geteilt oder heruntergeladen. */
export function gpxDatei(route: Position[], wegpunkte: Wegpunkt[], name: string): File {
  return new File([toGpx(route, name, wegpunkte)], dateiname(name), {
    type: 'application/gpx+xml',
  })
}

/**
 * Kann dieses Gerät Dateien teilen?
 *
 * `navigator.share` allein genügt als Prüfung nicht: Desktop-Browser melden
 * die Methode, lehnen Dateien aber ab. Nur `canShare` mit der konkreten Datei
 * sagt die Wahrheit — deshalb wird die Datei vor der Prüfung gebaut.
 */
export function kannTeilen(datei: File): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [datei] })
  } catch {
    return false
  }
}

/**
 * Teilen-Auswahl öffnen. Muss direkt aus der Berührung heraus laufen,
 * sonst verweigert der Browser.
 *
 * Abbrechen ist kein Fehler: wer die Auswahl wieder zuzieht, hat sich
 * umentschieden und will keine rote Meldung sehen.
 */
export async function teile(datei: File, name: string): Promise<void> {
  try {
    await navigator.share({ files: [datei], title: name })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    throw e
  }
}

/** Datei im Download-Ordner ablegen. */
export function herunterladen(datei: File): void {
  const url = URL.createObjectURL(datei)
  const a = document.createElement('a')
  a.href = url
  a.download = datei.name
  a.click()
  // Erst freigeben, wenn der Browser den Download angefasst hat.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Der Weg am Rechner: Datei ablegen, Import-Seite öffnen.
 *
 * Die Reihenfolge ist nicht beliebig. Erst der Download, dann das neue Tab —
 * andersherum wechselt der Fokus, und manche Browser lassen den Download der
 * dann im Hintergrund liegenden Seite fallen.
 */
export function zumDienst(datei: File, ziel: ExportZiel): void {
  herunterladen(datei)
  window.open(ziel.url, '_blank', 'noopener,noreferrer')
}
