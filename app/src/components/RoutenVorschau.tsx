/**
 * Der Kartenausschnitt einer Tour als Bild.
 *
 * Eine Liste geteilter Touren aus Namen und Zahlen ist nicht zu überfliegen —
 * man erkennt eine Tour am Verlauf, nicht am Titel. Deshalb trägt jede Karte
 * ihren eigenen Ausschnitt.
 *
 * Gebaut aus den Kacheln der Grundkarte plus einem SVG darüber, nicht aus
 * einer zweiten MapLibre-Instanz: zwölf Karten auf einer Seite wären zwölf
 * WebGL-Kontexte, und die meisten Browser geben nach etwa sechzehn keinen
 * mehr her. Ein <img>-Raster kostet nichts ausser den Kacheln selbst.
 *
 * Zur Kachellast — OpenTopoMap ist ein ehrenamtliches Projekt, und diese Datei
 * ist die Stelle, an der eine Übersichtsseite es am ehesten überfordert.
 * Drei Vorkehrungen dagegen:
 *   1. Die Kacheln werden auf die doppelte Grösse gezogen. Das kostet
 *      Schärfe, die ein Vorschaubild nicht braucht, und viertelt die Zahl der
 *      Anfragen — vier statt sechzehn pro Karte.
 *   2. Geladen wird erst, wenn die Karte in Sichtweite scrollt.
 *   3. Der Zoom ist gedeckelt. Eine Tour von zweihundert Metern soll kein
 *      Strassenschild zeigen.
 * Wird die Nutzung gross, gehört hier ein eigener Kachelserver hin — nicht
 * mehr Last auf fremde Infrastruktur. Derselbe Hinweis steht in `mapConfig.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Position } from '../data/geo'

/** Wie gross eine Kachel auf dem Bildschirm gezeichnet wird (nativ: 256). */
const KACHEL = 512
const MIN_ZOOM = 6
const MAX_ZOOM = 14

const KACHEL_URL = (z: number, x: number, y: number) =>
  `https://${['a', 'b', 'c'][(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`

/* ------------------------------------------------- Web-Mercator, minimal */

const lonZuX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const latZuY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

interface Ausschnitt {
  zoom: number
  /** Linke obere Ecke des Bildes in Kachelkoordinaten der Zoomstufe. */
  x0: number
  y0: number
}

/**
 * Die Zoomstufe, bei der die ganze Tour mit etwas Luft ins Bild passt.
 *
 * `polster` lässt den Verlauf nicht am Rand kleben — eine Linie, die den
 * Bildrand berührt, sieht abgeschnitten aus, auch wenn sie es nicht ist.
 */
function ausschnittFuer(
  punkte: Position[], breite: number, hoehe: number, polster = 0.82,
): Ausschnitt | null {
  if (punkte.length === 0) return null

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lon, lat] of punkte) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 85) continue
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  if (!Number.isFinite(minLon)) return null

  // Bei einer sehr kurzen Tour wäre die Spanne fast null und der Zoom liefe
  // ins Unendliche. Eine Mindestspanne hält das ab.
  const spanneLon = Math.max(maxLon - minLon, 0.002)
  const spanneLat = Math.max(maxLat - minLat, 0.002)

  const mitteLon = (minLon + maxLon) / 2
  const mitteLat = (minLat + maxLat) / 2

  let zoom = MAX_ZOOM
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const b = (lonZuX(mitteLon + spanneLon / 2, z) - lonZuX(mitteLon - spanneLon / 2, z)) * KACHEL
    const h = (latZuY(mitteLat - spanneLat / 2, z) - latZuY(mitteLat + spanneLat / 2, z)) * KACHEL
    if (b <= breite * polster && h <= hoehe * polster) { zoom = z; break }
    zoom = MIN_ZOOM
  }

  return {
    zoom,
    x0: lonZuX(mitteLon, zoom) - breite / 2 / KACHEL,
    y0: latZuY(mitteLat, zoom) - hoehe / 2 / KACHEL,
  }
}

/* ------------------------------------------------------------ Komponente */

interface Props {
  /** Der Verlauf. Leer heisst: Tour ohne gezeichneten Weg. */
  geometry: Position[]
  breite?: number
  hoehe?: number
  className?: string
  /** Rundet die Ecken nur oben — für Karten, unter denen Text folgt. */
  rund?: 'oben' | 'alle'
  /** Stärke des Verlaufs in Bildschirmpunkten. */
  linie?: number
  /** Dunkler Verlauf am unteren Rand — nur nötig, wenn Text darüber liegt. */
  abdunkeln?: boolean
}

export function RoutenVorschau({
  geometry, breite = 600, hoehe = 300, className = '', rund = 'oben',
  linie = 3, abdunkeln = false,
}: Props) {
  const [sichtbar, setSichtbar] = useState(false)
  const [kachelnDa, setKachelnDa] = useState(true)
  const huelle = useRef<HTMLDivElement>(null)

  // Erst laden, wenn die Karte in die Nähe des Sichtfensters kommt. Ohne das
  // holt eine Seite mit zwölf Karten sofort alle Kacheln, auch die, die
  // niemand zu sehen bekommt.
  useEffect(() => {
    const el = huelle.current
    if (!el || sichtbar) return
    if (typeof IntersectionObserver === 'undefined') { setSichtbar(true); return }
    const beobachter = new IntersectionObserver(
      (eintraege) => { if (eintraege.some((e) => e.isIntersecting)) setSichtbar(true) },
      { rootMargin: '300px' },
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [sichtbar])

  const ausschnitt = useMemo(
    () => ausschnittFuer(geometry, breite, hoehe),
    [geometry, breite, hoehe],
  )

  const kacheln = useMemo(() => {
    if (!ausschnitt || !sichtbar) return []
    const { zoom, x0, y0 } = ausschnitt
    const grenze = 2 ** zoom
    const liste: { key: string; url: string; links: number; oben: number }[] = []
    for (let x = Math.floor(x0); x * KACHEL < x0 * KACHEL + breite; x++) {
      for (let y = Math.floor(y0); y * KACHEL < y0 * KACHEL + hoehe; y++) {
        if (y < 0 || y >= grenze) continue
        // Ostwärts umlaufen statt abschneiden — an der Datumsgrenze bricht
        // die Vorschau sonst weg.
        const xx = ((x % grenze) + grenze) % grenze
        liste.push({
          key: `${zoom}/${x}/${y}`,
          url: KACHEL_URL(zoom, xx, y),
          links: Math.round((x - x0) * KACHEL),
          oben: Math.round((y - y0) * KACHEL),
        })
      }
    }
    return liste
  }, [ausschnitt, sichtbar, breite, hoehe])

  /** Der Verlauf in Bildkoordinaten. */
  const pfad = useMemo(() => {
    if (!ausschnitt) return ''
    const { zoom, x0, y0 } = ausschnitt
    return geometry
      .map(([lon, lat]) =>
        `${((lonZuX(lon, zoom) - x0) * KACHEL).toFixed(1)},${((latZuY(lat, zoom) - y0) * KACHEL).toFixed(1)}`)
      .join(' ')
  }, [geometry, ausschnitt])

  const punktPos = (p: Position | undefined) => {
    if (!p || !ausschnitt) return null
    const { zoom, x0, y0 } = ausschnitt
    return { x: (lonZuX(p[0], zoom) - x0) * KACHEL, y: (latZuY(p[1], zoom) - y0) * KACHEL }
  }
  const start = punktPos(geometry[0])
  const ziel = punktPos(geometry[geometry.length - 1])

  const ecken = rund === 'alle' ? 'rounded-gross' : 'rounded-t-[calc(var(--radius-gross)-1px)]'

  return (
    <div
      ref={huelle}
      className={`relative overflow-hidden bg-ink-800 ${ecken} ${className}`}
      style={{ aspectRatio: `${breite} / ${hoehe}` }}
      aria-hidden
    >
      {/*
        Kacheln. Bricht eine weg, bleibt der Verlauf trotzdem lesbar.

        Gesetzt wird in Prozent, nicht in Pixeln: `breite`/`hoehe` sind das
        Koordinatensystem, in dem gerechnet wurde, nicht die Grösse auf dem
        Bildschirm — die hängt von der Spaltenbreite ab. In Pixeln wäre das
        Kachelbild starr und der Verlauf darüber (der als SVG mitskaliert)
        würde daneben liegen.
      */}
      <div className="absolute inset-0">
        {kacheln.map((k) => (
          <img
            key={k.key}
            src={k.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setKachelnDa(false)}
            className="absolute max-w-none select-none"
            style={{
              left: `${(k.links / breite) * 100}%`,
              top: `${(k.oben / hoehe) * 100}%`,
              width: `${(KACHEL / breite) * 100}%`,
              height: `${(KACHEL / hoehe) * 100}%`,
            }}
          />
        ))}
      </div>

      {/*
        Die Karte ist hell, das Chrome dunkel. Ohne diesen Schleier springt
        jede Vorschau als weisser Block aus der Seite, und die Linie darauf
        hätte zu wenig Halt.
      */}
      <div className="absolute inset-0 bg-ink-950/15" />
      {abdunkeln && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950/70 to-transparent" />
      )}

      {pfad && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${breite} ${hoehe}`}
          preserveAspectRatio="none"
        >
          {/*
            Erst der dunkle Saum, dann die Linie: auf hellem Fels und in
            grünem Wald trägt eine einfarbige Linie sonst nicht.

            `non-scaling-stroke` hält die Stärke in Bildschirmpunkten. Ohne
            das schrumpft die Linie mit dem Bild — auf einer Kachel von 240 px
            wäre sie ein Haar, im Detailfenster ein Balken.
          */}
          <polyline points={pfad} fill="none" stroke="rgba(7,10,11,0.6)" strokeWidth={linie + 3}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pfad} fill="none" stroke="var(--color-gletscher-300)" strokeWidth={linie}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round" strokeLinejoin="round" />
          {start && (
            <circle cx={start.x} cy={start.y} r={linie * 1.6} vectorEffect="non-scaling-stroke"
                    fill="var(--color-ink-50)" stroke="rgba(7,10,11,0.7)" strokeWidth={1.5} />
          )}
          {ziel && (
            <circle cx={ziel.x} cy={ziel.y} r={linie * 1.6} vectorEffect="non-scaling-stroke"
                    fill="var(--color-gletscher-400)" stroke="rgba(7,10,11,0.7)" strokeWidth={1.5} />
          )}
        </svg>
      )}

      {/* Ohne Verlauf gibt es nichts zu zeigen — dann sagt das Bild das auch. */}
      {!pfad && (
        <div className="absolute inset-0 flex items-center justify-center bg-flaeche-1">
          <span className="text-mikro uppercase text-ink-600">Kein Weg gezeichnet</span>
        </div>
      )}

      {/*
        Kartendaten sind CC-BY-SA. Auch ein Vorschaubild trägt die Herkunft —
        klein, aber vorhanden.
      */}
      {pfad && kachelnDa && (
        <span className="absolute bottom-1 right-1.5 text-[9px] leading-none text-ink-50/70 [text-shadow:0_0_3px_rgba(7,10,11,0.95)]">
          © OpenTopoMap, OSM
        </span>
      )}
    </div>
  )
}
