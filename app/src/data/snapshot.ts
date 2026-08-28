/**
 * SCHICHT 1 — der Transportweg der Kartendaten.
 *
 * Vorher lagen Zonen, Punkte, Gipfel und Gemeindeflächen als `import` im
 * JavaScript-Bündel und wurden zusätzlich bei jedem Seitenaufruf aus Supabase
 * nachgeholt. Das war der teuerste Weg von beiden Seiten: 1,5 MB rohes JSON
 * mussten durch den JavaScript-Parser, jede gepflegte Einstufung machte das
 * ganze Bündel ungültig, und die Datenbank zahlte obendrein Egress für Daten,
 * die sich zwischen zwei Deploys nie ändern.
 *
 * Jetzt sind es das, was sie ihrer Natur nach sind: statische Dateien.
 * `scripts/snapshot-daten.mjs` erzeugt sie aus `import/`, Vite gibt jeder
 * einen Inhalts-Hash, und damit dürfen sie unbegrenzt im Browser-Cache liegen
 * (`Cache-Control: immutable`, siehe `_headers.vorlage`). Ändert sich eine
 * Datei, ändert sich ihr Name — es gibt keine veraltete Fassung, die jemand
 * ausliefern könnte.
 *
 * Was hier NICHT passiert: Rechtsauskunft. Dieses Modul kennt nur Dateien und
 * Ausschnitte. Was die Daten bedeuten, steht in `legalData.ts`, `gemeinden.ts`
 * und `kantone.ts`.
 */
import type { Ausschnitt } from './types'

/**
 * Alle Snapshot-Dateien mit ihrer gehashten Auslieferungsadresse.
 *
 * `eager` ist Absicht: das Ergebnis sind nur die Adressen, nicht die Inhalte —
 * 336 kurze Zeichenketten, wenige Kilobyte im Bündel. Das Gegenstück (`eager:
 * false`) wäre ein dynamischer Import pro Datei und damit 336 zusätzliche
 * JavaScript-Schnipsel im Build.
 */
const ADRESSEN = import.meta.glob('./snapshot/**/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Aus `punkte.CH.json` wird der Schlüssel, unter dem `import.meta.glob` ablegt. */
const adresse = (name: string): string | undefined => ADRESSEN[`./snapshot/${name}`]

/**
 * Jede Datei höchstens einmal holen — auch, wenn zwei Ebenen gleichzeitig
 * danach fragen. Gemerkt wird das Versprechen, nicht das Ergebnis: sonst
 * liefen zwei Anfragen los, bevor die erste zurück ist.
 */
const laufend = new Map<string, Promise<unknown>>()

export class SnapshotFehlt extends Error {
  constructor(name: string) {
    super(`Snapshot-Datei ${name} fehlt - 'npm run snapshot' vergessen?`)
  }
}

/**
 * Eine Snapshot-Datei laden.
 *
 * Fehler werden nicht verschluckt, sondern weitergereicht. Die Aufrufer
 * entscheiden, was eine fehlende Ebene bedeutet — bei den Zonen ist es ein
 * sichtbarer Hinweis, bei den Gipfeln bloss eine Ebene weniger.
 */
export async function ladeJson<T>(name: string): Promise<T> {
  const url = adresse(name)
  if (!url) throw new SnapshotFehlt(name)

  let anfrage = laufend.get(name)
  if (!anfrage) {
    anfrage = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
      return res.json()
    })
    // Ein Fehlschlag darf nicht dauerhaft gemerkt werden, sonst ist eine
    // Ebene nach einem einzelnen Funkloch für die ganze Sitzung verloren.
    anfrage.catch((f) => { laufend.delete(name); meckern(name, f) })
    laufend.set(name, anfrage)
  }
  return anfrage as Promise<T>
}

/**
 * In der Entwicklung laut werden.
 *
 * Die Aufrufer fangen Ladefehler bewusst ab — eine fehlende Gipfelebene darf
 * die Karte nicht mitreissen. Genau diese Nachsicht hat aber schon einmal
 * einen echten Fehler versteckt: Vite bettete alle Dateien unter 4 KB als
 * `data:`-URI ein, die eigene Content-Security-Policy verbot das Laden davon,
 * und sämtliche Kachelebenen blieben still leer. Kein Stacktrace, keine
 * Meldung, nur eine Karte ohne Gipfel.
 *
 * Deshalb hier eine Meldung, bevor der Fehler weitergereicht wird. Im Betrieb
 * schweigt sie: dort ist der Nutzer nicht der Adressat, und der sichtbare
 * Hinweis für die Zonen steht im InfoPanel.
 */
function meckern(name: string, fehler: unknown) {
  if (!import.meta.env.DEV) return
  console.warn(`[snapshot] ${name} konnte nicht geladen werden - diese Ebene bleibt leer.`, fehler)
}

/* ------------------------------------------------------------- Kacheln */

interface Verzeichnis {
  kachel: number
  kacheln: Record<string, number>
}

/**
 * Ein Lader für eine gekachelte Ebene.
 *
 * Gipfel, Naturobjekte und die genauen Gemeindeflächen liegen in einem
 * Gradgitter, weil sie landesweit mehrere Megabyte wären. Der Lader hält
 * zusammen, was schon da ist, und holt beim Verschieben der Karte nur die
 * Kacheln, die neu dazukommen. Wer über eine schon besuchte Gegend zurück
 * scrollt, löst keine einzige Anfrage aus — genau das war vorher das Leck:
 * jede Kartenbewegung ging als neue Abfrage an die Datenbank.
 */
export function kachelLader<T>(ordner: string, verzeichnisDatei: string) {
  const geladen = new Map<string, T[]>()
  let verzeichnis: Verzeichnis | null = null
  let gesamt: T[] = []

  async function kachelnFuer(a: Ausschnitt): Promise<string[]> {
    verzeichnis ??= await ladeJson<Verzeichnis>(verzeichnisDatei)
    const k = verzeichnis.kachel
    const schluessel: string[] = []
    for (let x = Math.floor(a.west / k); x <= Math.floor(a.ost / k); x++) {
      for (let y = Math.floor(a.sued / k); y <= Math.floor(a.nord / k); y++) {
        const s = `${x}_${y}`
        // Das Verzeichnis nennt nur die Kacheln, in denen etwas liegt. Ohne
        // diese Prüfung holte die Karte über Fels und Wasser lauter 404er.
        if (verzeichnis.kacheln[s] && !geladen.has(s)) schluessel.push(s)
      }
    }
    return schluessel
  }

  return {
    /**
     * Liefert alles, was für diesen Ausschnitt (und alle vorherigen) da ist —
     * oder null, wenn nichts Neues dazugekommen ist. Das null ist kein
     * Fehlerfall, sondern die Nachricht „nichts zu tun": React soll nicht neu
     * rendern, weil jemand die Karte um zehn Pixel verschoben hat.
     */
    async laden(a: Ausschnitt): Promise<T[] | null> {
      const fehlend = await kachelnFuer(a)
      if (fehlend.length === 0) return null

      const teile = await Promise.all(
        fehlend.map(async (s) => {
          // Vormerken, bevor die Anfrage läuft: zwei kurz aufeinander folgende
          // Kartenbewegungen dürfen dieselbe Kachel nicht zweimal holen.
          geladen.set(s, [])
          try {
            const inhalt = await ladeJson<T[] | { features: T[] }>(`${ordner}/${s}.json`)
            const liste = Array.isArray(inhalt) ? inhalt : inhalt.features
            geladen.set(s, liste)
            return liste
          } catch {
            geladen.delete(s)
            return []
          }
        }),
      )

      const neu = teile.flat()
      if (neu.length === 0) return null
      gesamt = [...gesamt, ...neu]
      return gesamt
    },
  }
}

/**
 * Doppelt gezählte Flächen aussortieren.
 *
 * Gemeindeflächen liegen in jeder Kachel, die ihr umschliessendes Rechteck
 * berührt — geschnitten wird nicht (siehe `flaechenGekachelt` im
 * Snapshot-Skript). Wer zwei benachbarte Kacheln geladen hat, hat die Fläche
 * an der Naht deshalb zweimal.
 */
export function ohneDoppelte<T extends { id: string }>(liste: T[]): T[] {
  const gesehen = new Set<string>()
  return liste.filter((o) => (gesehen.has(o.id) ? false : (gesehen.add(o.id), true)))
}
