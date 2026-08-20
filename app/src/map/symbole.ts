/**
 * SCHICHT 2 — Kartensymbole.
 *
 * Vorher waren alle Punkte farbige Kreise. Das zwang dazu, die Legende zu
 * lesen, bevor man die Karte lesen konnte — und im Gelände, mit Handschuhen
 * und in der Sonne, ist ein violetter Kreis neben einem blauen keine
 * Information, sondern eine Zumutung. Ein Zelt sieht aus wie ein Zelt.
 *
 * Gezeichnet wird auf ein Canvas und als Bild in den Style gelegt, nicht als
 * DOM-Marker: bei über tausend Punkten wären Marker-Elemente spürbar langsamer,
 * und nur Style-Bilder lassen sich mit MapLibre-Ausdrücken zoomabhängig
 * skalieren und ausblenden.
 *
 * Zwei Formen, mit einer Bedeutung dahinter:
 *  - **Nadel** für Orte, an denen man etwas *tut* — schlafen, stehen, halten.
 *    Sie zeigt mit der Spitze auf die genaue Stelle.
 *  - **Plakette** (Kreis) für Dinge, die *da sind* — See, Quelle, Aussicht.
 *    Sie sitzt mittig über dem Ort und drängt sich weniger auf.
 */
import type { Map as MlMap } from 'maplibre-gl'

/* ------------------------------------------------------------------ Farben */

/**
 * Grün, Gelb und Rot bleiben der Rechtslage vorbehalten (siehe index.css).
 * Deshalb tragen die Symbole eigene, davon klar unterscheidbare Töne.
 */
export const SYMBOL_FARBEN = {
  hut: '#38BDF8',
  campsite: '#A78BFA',
  vehicle_spot: '#FB923C',

  lake: '#2E8FD4',
  spring: '#22B8CF',
  drinking_water: '#0EA5E9',
  waterfall: '#38A3D1',
  viewpoint: '#C084FC',

  eigen: '#5AAFD4',
  foto: '#E4A11B',
} as const

export type SymbolKey = keyof typeof SYMBOL_FARBEN

/* ------------------------------------------------------------------ Glyphen */

/**
 * Pfade in einem 24×24-Feld, gedacht als Strich (nicht als Fläche) — dieselbe
 * Bauart wie die Lucide-Symbole der Oberfläche, damit Karte und Panel
 * dieselbe Formsprache sprechen.
 */
const GLYPHEN: Record<SymbolKey, string[]> = {
  // Berghütte: Satteldach über einem Baukörper.
  hut: ['M3 12.5 12 5l9 7.5', 'M5.5 11.5V19h13v-7.5', 'M10.5 19v-4h3v4'],
  // Zelt: Firstlinie und zwei Bahnen.
  campsite: ['M12 4.5 3.5 19.5h17L12 4.5Z', 'M12 4.5V19.5', 'M8 19.5l4-6 4 6'],
  // Kastenwagen mit zwei Rädern.
  vehicle_spot: ['M3 15.5V8.5h11l4 3.5v3.5', 'M3 15.5h18', 'M7.5 15.5a2 2 0 1 0 4 0', 'M14.5 15.5a2 2 0 1 0 4 0'],
  // See: drei Wellen.
  lake: ['M3 9c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0', 'M3 14c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0', 'M3 19c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0'],
  // Quelle: Tropfen über einer Welle.
  spring: ['M12 3.5c0 0 5 5.5 5 8.5a5 5 0 0 1-10 0c0-3 5-8.5 5-8.5Z', 'M4 20c2-1.6 4-1.6 6 0s4 1.6 6 0'],
  // Trinkwasser: Tropfen.
  drinking_water: ['M12 3s6 6.8 6 10.4A6 6 0 0 1 6 13.4C6 9.8 12 3 12 3Z'],
  // Wasserfall: Kante mit fallenden Strähnen.
  waterfall: ['M3 5.5h18', 'M7 5.5v10', 'M12 5.5v13', 'M17 5.5v10', 'M4 20c2-1.6 4-1.6 6 0s4 1.6 6 0'],
  // Aussichtspunkt: Auge.
  viewpoint: ['M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  // Eigener Punkt: Stern — bewusst neutral, die Bedeutung steckt im Namen.
  eigen: ['M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 17.3l-5.3 2.9 1.1-6.1L3.4 9.9l6-.8L12 3.5Z'],
  // Foto: Kamera.
  foto: ['M3 8.5h4l1.5-2.5h7L17 8.5h4v10H3v-10Z', 'M12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
}

/* ------------------------------------------------------- Zeichnen der Bilder */

const DPR = 2
/** Kantenfarbe aller Symbole — dasselbe fast-Schwarz wie die Oberfläche. */
const KANTE = '#0B1214'

function canvas(breite: number, hoehe: number) {
  const c = document.createElement('canvas')
  c.width = breite * DPR
  c.height = hoehe * DPR
  const g = c.getContext('2d')
  if (!g) return null
  g.scale(DPR, DPR)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  return { c, g }
}

/** Glyph mittig in ein Feld der Grösse `feld` an Position (mx,my) setzen. */
function glyphZeichnen(
  g: CanvasRenderingContext2D, key: SymbolKey, mx: number, my: number, feld: number, farbe: string,
) {
  const skala = feld / 24
  g.save()
  g.translate(mx - feld / 2, my - feld / 2)
  g.scale(skala, skala)
  g.strokeStyle = farbe
  // Im 24er-Feld gemessen: die Skalierung verjüngt den Strich mit, sodass ein
  // kleines Symbol nicht plump und ein grosses nicht fadenscheinig wirkt.
  g.lineWidth = 2.1
  for (const d of GLYPHEN[key]) g.stroke(new Path2D(d))
  g.restore()
}

/** Nadel: 24 breit, 30 hoch, Spitze unten — Ankerpunkt ist der Ort selbst. */
function nadel(key: SymbolKey): { data: Uint8Array; w: number; h: number } | null {
  const B = 26, H = 34
  const gefunden = canvas(B, H)
  if (!gefunden) return null
  const { c, g } = gefunden

  const koerper = new Path2D(
    'M13 1.2C6.7 1.2 1.6 6.3 1.6 12.6c0 8 11.4 20.2 11.4 20.2S24.4 20.6 24.4 12.6C24.4 6.3 19.3 1.2 13 1.2Z',
  )
  g.fillStyle = SYMBOL_FARBEN[key]
  g.fill(koerper)
  g.strokeStyle = KANTE
  g.lineWidth = 1.6
  g.stroke(koerper)

  glyphZeichnen(g, key, 13, 12.6, 14, '#0B1214')

  const bild = g.getImageData(0, 0, c.width, c.height)
  return { data: new Uint8Array(bild.data), w: c.width, h: c.height }
}

/** Plakette: runder Knopf, sitzt mittig über dem Ort. */
function plakette(key: SymbolKey): { data: Uint8Array; w: number; h: number } | null {
  const K = 24
  const gefunden = canvas(K, K)
  if (!gefunden) return null
  const { c, g } = gefunden

  g.beginPath()
  g.arc(K / 2, K / 2, 10.2, 0, Math.PI * 2)
  g.fillStyle = SYMBOL_FARBEN[key]
  g.fill()
  g.strokeStyle = KANTE
  g.lineWidth = 1.5
  g.stroke()

  glyphZeichnen(g, key, K / 2, K / 2, 13, '#0B1214')

  const bild = g.getImageData(0, 0, c.width, c.height)
  return { data: new Uint8Array(bild.data), w: c.width, h: c.height }
}

/** Welche Art Symbol trägt welcher Schlüssel. */
const FORM: Record<SymbolKey, 'nadel' | 'plakette'> = {
  hut: 'nadel',
  campsite: 'nadel',
  vehicle_spot: 'nadel',
  eigen: 'nadel',
  foto: 'nadel',
  lake: 'plakette',
  spring: 'plakette',
  drinking_water: 'plakette',
  waterfall: 'plakette',
  viewpoint: 'plakette',
}

/**
 * Alle Symbole in den Style legen.
 *
 * Nach einem Wechsel der Hintergrundkarte sind Bilder mit dem alten Style
 * verworfen — deshalb idempotent und aus `setupLayers` heraus aufgerufen.
 */
export function symboleAnlegen(m: MlMap) {
  for (const key of Object.keys(FORM) as SymbolKey[]) {
    const name = `cb-${key}`
    if (m.hasImage(name)) continue
    const bild = FORM[key] === 'nadel' ? nadel(key) : plakette(key)
    if (!bild) continue
    m.addImage(name, { width: bild.w, height: bild.h, data: bild.data }, { pixelRatio: DPR })
  }
}
