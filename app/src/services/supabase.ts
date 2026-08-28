/**
 * Backend-Anbindung [BALD] — Abschnitt 6 und 8.3/8.4/8.6 der Spezifikation.
 *
 * Supabase im EU-Hosting, mit optionalem Login. Die App muss ohne Konto
 * vollständig nutzbar bleiben (Abschnitt 3: "Kein Login nötig zum Ansehen"),
 * deshalb ist der Client hier optional: fehlt die Konfiguration, liefert
 * `getSupabase()` null und das UI blendet alles Konto-Bezogene aus, statt
 * Fehler zu werfen.
 *
 * Verwendet wird ausschliesslich der *publishable* Schlüssel. Der ist dafür
 * gemacht, im Browser zu stehen — der Schutz kommt aus Row Level Security.
 * Ein `sb_secret_…`-Schlüssel gehört nie in dieses Bundle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && key)

let client: SupabaseClient | null = null

/**
 * Wie oft ein Leseversuch wiederholt wird, und mit welchem Abstand.
 *
 * Drei Versuche, dazwischen 400 und 1200 Millisekunden. Das überbrückt genau
 * die Sorte Störung, um die es hier geht: ein Funkloch beim Losfahren, ein
 * kurzer Aussetzer im Zug, ein Serverfehler beim Aufwachen der Instanz.
 * Länger zu warten hiesse, eine Oberfläche minutenlang im Ladezustand stehen
 * zu lassen — dann ist eine ehrliche Fehlermeldung das Bessere.
 */
const VERSUCHE = 3
const WARTEN_MS = [400, 1200]

/**
 * Ein `fetch`, das abgebrochene Leseversuche wiederholt.
 *
 * **Nur GET und HEAD.** Ein abgebrochener Schreibversuch sieht von hier aus
 * genauso aus wie ein nie angekommener — die Anfrage kann den Server längst
 * erreicht und die Zeile angelegt haben, bevor die Verbindung zusammenbrach.
 * Ein zweiter Versuch legte sie dann ein zweites Mal an. Bei jemandem, der im
 * Gebirge eine Tour speichert, hiesse das: dieselbe Tour zweimal in der
 * Liste, ohne dass er etwas falsch gemacht hätte. Lieber ein Fehler, den man
 * sieht, als ein Duplikat, das man erst später bemerkt.
 *
 * Wiederholt wird bei Transportfehlern (`fetch` wirft) und bei den
 * Antwortcodes, die ausdrücklich „gleich nochmal" bedeuten: 429, 502, 503,
 * 504. Ein 4xx wird nicht wiederholt — der Fehler liegt dann an der Anfrage
 * und der zweite Versuch scheitert genauso.
 */
async function fetchMitWiederholung(
  eingabe: RequestInfo | URL, init?: RequestInit,
): Promise<Response> {
  const methode = (init?.method ?? 'GET').toUpperCase()
  const wiederholbar = methode === 'GET' || methode === 'HEAD'

  let letzterFehler: unknown
  for (let versuch = 0; versuch < (wiederholbar ? VERSUCHE : 1); versuch++) {
    if (versuch > 0) {
      await new Promise((r) => setTimeout(r, WARTEN_MS[versuch - 1] ?? 1200))
    }
    try {
      const antwort = await fetch(eingabe, init)
      if (!wiederholbar || ![429, 502, 503, 504].includes(antwort.status)) return antwort
      letzterFehler = new Error(`HTTP ${antwort.status}`)
      // Der letzte Durchgang gibt die Antwort heraus statt zu werfen: die
      // Aufrufer übersetzen Supabase-Fehler in Sätze für Menschen, und ein
      // geworfener Transportfehler käme dort als Rohtext an.
      if (versuch === VERSUCHE - 1) return antwort
    } catch (e) {
      letzterFehler = e
    }
  }
  throw letzterFehler instanceof Error ? letzterFehler : new Error('Netzwerkfehler')
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: fetchMitWiederholung },
    })
  }
  return client
}

/**
 * Eine gespeicherte Tour (Abschnitte 8.4 und 8.6 zusammengelegt).
 *
 * Verlauf und Eckdaten lagen bis Migration 0016 in zwei Tabellen (`routes`
 * und `trips`). Was jemand plant, ist aber eine Sache: ein Weg mit einem
 * Datum, einer Dauer und einer Packliste. Zweimal speichern hiess in der
 * Oberfläche zwei Listen und die unbeantwortbare Frage, ob die eigene Tour
 * nun die Route oder die Tour sei.
 *
 * Die Eckdaten sind optional: eine Tour darf gespeichert werden, bevor jemand
 * ein Datum gesetzt hat.
 */
export interface Tour {
  id: string
  user_id: string
  name: string
  region: string
  /**
   * GeoJSON-LineString des gerouteten Verlaufs. Leer = Tour ohne Weg.
   *
   * Ein gerouteter Alpenweg hat schnell mehrere tausend Stützpunkte und
   * wiegt vierzig Kilobyte. Übersichtslisten laden ihn deshalb **nicht**
   * mit — sie fragen `vorschau` und lassen dieses Feld undefiniert. Wer den
   * echten Verlauf braucht (auf die Karte legen, Höhenprofil, GPX), holt ihn
   * mit `ladeVerlauf()` nach.
   */
  geometry?: { type: 'LineString'; coordinates: [number, number][] }
  /**
   * Derselbe Verlauf, auf höchstens 120 Punkte ausgedünnt (Migration 0024).
   *
   * Genug für das Vorschaubild einer Tourkarte, ein Vierzigstel der Daten.
   * Null heisst: diese Tour hat gar keinen Weg.
   */
  vorschau: { type: 'LineString'; coordinates: [number, number][] } | null
  /**
   * Die vom Nutzer gesetzten Stützpunkte, damit die Route weiterbearbeitbar
   * bleibt. Wie `geometry` nur bei der einzelnen Tour geladen, nicht in Listen.
   */
  waypoints?: [number, number][] | null
  /** Opt-in: nur ausdrücklich veröffentlichte Touren sind für andere sichtbar. */
  is_public: boolean
  beschreibung: string | null
  /** Frei wählbarer Anzeigename — niemand muss seine Mailadresse veröffentlichen. */
  autor: string | null
  created_at: string
  /** Wann geteilt. Null, solange die Tour privat ist. */
  veroeffentlicht_am: string | null

  /* --- Eckdaten der Planung (vormals `trips`) --- */
  start_date: string | null
  days: number | null
  persons: number | null
  /** Geplante Schlafhöhe in Metern — bestimmt Temperatur und Ausrüstung. */
  elevation: number | null
  season: 'sommer' | 'uebergang' | 'winter' | null
  shelter: 'zelt' | 'biwak' | 'huette' | null

  /* --- Einmal beim Speichern berechnet, damit die Übersicht nicht rechnen muss --- */
  distance_m: number | null
  ascent_m: number | null
  duration_s: number | null

  /* --- Community-Zähler, von Triggern gepflegt (Migration 0016) --- */
  likes_count: number
  kommentare_count: number

  /* --- Rein persönlich, nicht in der öffentlichen View (Migration 0021) --- */
  /** Stand der Checkliste: Ausrüstungs-ID → habe / brauche / weglassen. */
  packliste: unknown
  /** Selbst gewählte Nachtlager. Null = automatischer Etappenvorschlag. */
  etappen: unknown
}

/**
 * Die Spalten, die eine Übersichtsliste braucht — und `geometry` ist keine.
 *
 * Bis Migration 0024 holte jede Liste `select *`. Zwölf Tourkarten waren
 * damit gut eine halbe Megabyte, obwohl davon nur zwölf Vorschaubildchen von
 * 640×360 gezeichnet wurden. Seither trägt jede Tour ihren Verlauf zweimal,
 * und die Liste nimmt die ausgedünnte Fassung.
 *
 * Wer hier `geometry` oder `waypoints` ergänzt, holt das Problem zurück:
 * beide gehören in `ladeVerlauf()`, das genau eine Tour nachlädt.
 */
// Eine einzige Zeichenkette, kein zusammengesetztes Array: die Typen von
// supabase-js lesen die Spaltenliste zur Übersetzungszeit und können mit
// etwas, das erst zur Laufzeit entsteht, nichts anfangen.
export const LISTEN_SPALTEN = 'id,name,region,vorschau,created_at,is_public,beschreibung,autor,veroeffentlicht_am,start_date,days,persons,elevation,season,shelter,distance_m,ascent_m,duration_s,likes_count,kommentare_count' as const

/** Dasselbe für eigene Touren: die Planungsfelder kommen dazu, sie sind klein. */
export const EIGENE_LISTEN_SPALTEN = 'id,user_id,name,region,vorschau,created_at,is_public,beschreibung,autor,veroeffentlicht_am,start_date,days,persons,elevation,season,shelter,distance_m,ascent_m,duration_s,likes_count,kommentare_count,packliste,etappen' as const

/** Was `ladeVerlauf()` nachholt — der schwere Teil, für genau eine Tour. */
export const VERLAUF_SPALTEN = 'id,geometry,waypoints' as const

/** Der nachgeladene Weg einer Tour. Beide Felder null = Tour ohne Verlauf. */
export interface Verlauf {
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null
  waypoints: [number, number][] | null
}

/**
 * Den vollen Verlauf einer Tour nachholen — der Rumpf hinter `ladeVerlauf`
 * (community.ts) und `ladeEigenenVerlauf` (account.ts).
 *
 * Er steht hier und nicht in einer der beiden Dateien, weil beide ihn
 * brauchen und `account` und `community` sich sonst gegenseitig importieren
 * müssten. Der Unterschied zwischen ihnen ist nur die Quelle: die öffentliche
 * View für fremde Touren, die Basistabelle für eigene — letztere muss auch
 * dann ladbar sein, wenn die Tour nie geteilt wurde.
 *
 * Findet sich nichts (Tour gelöscht oder zurückgezogen), kommt ein leerer
 * Verlauf zurück statt eines Fehlers. Die Aufrufer weichen dann auf die
 * Vorschau aus: ein grober Weg auf der Karte ist besser als keiner.
 */
export async function verlaufLaden(
  quelle: 'oeffentliche_routen' | 'routes',
  routeId: string,
): Promise<Verlauf> {
  const sb = getSupabase()
  if (!sb) return { geometry: null, waypoints: null }
  const { data, error } = await sb
    .from(quelle)
    .select(VERLAUF_SPALTEN)
    .eq('id', routeId)
    .maybeSingle()
  if (error || !data) return { geometry: null, waypoints: null }
  const zeile = data as unknown as Verlauf
  return { geometry: zeile.geometry ?? null, waypoints: zeile.waypoints ?? null }
}

/**
 * Eine geteilte Tour, wie sie Fremde zu sehen bekommen.
 *
 * Bewusst ohne `user_id`: die View `oeffentliche_routen` gibt sie nicht heraus.
 * Der Typ hält das fest, damit niemand versehentlich wieder danach greift und
 * die Spalte zurückholt.
 */
export type PublicTour = Omit<Tour, 'user_id' | 'packliste' | 'etappen'>

/** Ein Kommentar, wie ihn die View `oeffentliche_kommentare` herausgibt. */
export interface Kommentar {
  id: string
  route_id: string
  /** Der Beitrag, auf den geantwortet wurde. Null = eigenständiger Beitrag. */
  eltern_id: string | null
  /** Oberster Beitrag des Strangs. Null bei einem Ursprung selbst. */
  wurzel_id: string | null
  /** 0 = Ursprung, 1 = Antwort darauf, und so fort. Gedeckelt bei 6. */
  tiefe: number
  autor: string | null
  text: string
  created_at: string
  likes_count: number
}

/** Ein Kommentar samt der Antworten darunter — beliebig tief verschachtelt. */
export interface KommentarKnoten extends Kommentar {
  antworten: KommentarKnoten[]
}
