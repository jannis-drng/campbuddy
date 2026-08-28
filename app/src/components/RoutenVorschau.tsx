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
 * Vier Vorkehrungen dagegen:
 *   1. Die Kacheln werden auf etwa die doppelte Grösse gezogen. Das kostet
 *      Schärfe, die ein Vorschaubild nicht braucht, und viertelt die Zahl der
 *      Anfragen — vier statt sechzehn pro Karte.
 *   2. Geladen wird erst, wenn die Karte in Sichtweite scrollt.
 *   3. Der Massstab ist gedeckelt. Eine Tour von zweihundert Metern soll kein
 *      Strassenschild zeigen — sie bekommt stattdessen Umland zu sehen, an
 *      dem man erkennt, wo sie liegt.
 *   4. Geholt wird über `map/kachelLader.ts` — mit Deckel auf die Zahl der
 *      gleichzeitigen Anfragen, mit zweitem Versuch und ohne dieselbe Kachel
 *      je zweimal zu holen. Ohne das gingen beim Aufschlagen der Seite
 *      fünfzig Anfragen auf einmal hinaus, ein Teil davon wurde abgewiesen,
 *      und weil ein <img> von sich aus nicht nachfragt, blieben genau diese
 *      Stellen dauerhaft leer: die Karte kam nur halb an.
 * Wird die Nutzung gross, gehört hier ein eigener Kachelserver hin — nicht
 * mehr Last auf fremde Infrastruktur. Derselbe Hinweis steht in `mapConfig.ts`.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ausduennen, type Position } from '../data/geo'
import { kachelBereit, ladeKachel } from '../map/kachelLader'
import { VORSCHAU_HINWEIS, vorschauKacheln } from '../map/mapConfig'

/**
 * Angestrebte Kantenlänge einer Kachel im Koordinatensystem des Bildes
 * (nativ: 256). Die tatsächliche liegt zwischen dem 0,7- und dem 1,4-fachen —
 * siehe `ausschnittFuer`.
 */
const KACHEL_ZIEL = 512
const MIN_ZOOM = 6
const MAX_ZOOM = 15

/** Wie weit vor dem Sichtfenster eine Vorschau zu laden beginnt. */
const VORLAUF_PX = 400

/* ------------------------------------------------- Web-Mercator, minimal */

/** Beide liefern Weltanteile in 0…1, mal 2^z die Kachelkoordinate. */
const lonZuX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const latZuY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

interface Ausschnitt {
  zoom: number
  /** Kantenlänge einer Kachel im Koordinatensystem des Bildes. */
  kachel: number
  /** Linke obere Ecke des Bildes in Kachelkoordinaten der Zoomstufe. */
  x0: number
  y0: number
}

/**
 * Der Ausschnitt, in dem die ganze Tour mit etwas Luft ins Bild passt.
 *
 * Der Zoom allein kann das nicht: er springt in Zweierschritten, und im
 * ungünstigsten Fall passt eine Tour bei Stufe 10 gerade nicht mehr, füllt
 * bei Stufe 9 dann aber nur noch die Hälfte des Bildes. Genau so lagen die
 * Verläufe auf der Community-Seite — klein und verloren in einer Karte, die
 * hauptsächlich Umland zeigte.
 *
 * Deshalb wird hier nicht nur die Zoomstufe gewählt, sondern auch, wie gross
 * eine Kachel gezeichnet wird. Der Zoom entscheidet über den Inhalt der
 * Kacheln, die Kachelgrösse über den Massstab — und die ist stufenlos. Das
 * Ergebnis passt genau, wie bei einer richtigen Karte.
 *
 * `polster` lässt den Verlauf nicht am Rand kleben — eine Linie, die den
 * Bildrand berührt, sieht abgeschnitten aus, auch wenn sie es nicht ist.
 */
function ausschnittFuer(
  punkte: Position[], breite: number, hoehe: number, polster = 0.84,
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

  // Bei einer sehr kurzen Tour wäre die Spanne fast null und der Massstab
  // liefe ins Unendliche. Eine Mindestspanne hält das ab.
  const spanneLon = Math.max(maxLon - minLon, 0.002)
  const spanneLat = Math.max(maxLat - minLat, 0.002)

  const mitteLon = (minLon + maxLon) / 2
  const mitteLat = (minLat + maxLat) / 2

  // Die Ausdehnung der Tour als Anteil der ganzen Welt — zoomunabhängig.
  const anteilX = lonZuX(mitteLon + spanneLon / 2, 0) - lonZuX(mitteLon - spanneLon / 2, 0)
  const anteilY =
    latZuY(Math.max(mitteLat - spanneLat / 2, -85), 0) -
    latZuY(Math.min(mitteLat + spanneLat / 2, 85), 0)

  /*
    Wie breit die ganze Welt sein müsste, damit die Tour genau ins Bild passt —
    die engere der beiden Achsen entscheidet. Die Grenzen sind die alten
    Zoomstufen, nur stufenlos ausgedrückt.
  */
  const welt = Math.min(
    Math.max(
      Math.min((breite * polster) / anteilX, (hoehe * polster) / anteilY),
      2 ** MIN_ZOOM * KACHEL_ZIEL,
    ),
    2 ** MAX_ZOOM * KACHEL_ZIEL,
  )

  // Die Zoomstufe, deren Kacheln dem Zielmass am nächsten kommen.
  const zoom = Math.round(Math.log2(welt / KACHEL_ZIEL))
  const kachel = welt / 2 ** zoom

  return {
    zoom,
    kachel,
    x0: lonZuX(mitteLon, zoom) - breite / 2 / kachel,
    y0: latZuY(mitteLat, zoom) - hoehe / 2 / kachel,
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

/**
 * Mehr Punkte, als ein Bild von wenigen hundert Pixeln zeigen kann, sind
 * verschenkte Rechenzeit — und in einer Liste von Touren die teuerste
 * Verschwendung, die es hier gibt. Zweihundert genügen für jede Form, die
 * man auf einem Vorschaubild noch erkennt.
 */
const VORSCHAU_PUNKTE = 200

interface Kachel {
  key: string
  /** Dieselbe Kachel über mehrere Hosts, in der Reihenfolge der Versuche. */
  adressen: string[]
  /** Platz im Bild, fertig als CSS — alles in Prozent, siehe unten. */
  stil: { left: string; top: string; width: string; height: string }
}

function RoutenVorschauInnen({
  geometry: roh, breite = 600, hoehe = 300, className = '', rund = 'oben',
  linie = 3, abdunkeln = false,
}: Props) {
  const geometry = useMemo(() => ausduennen(roh, VORSCHAU_PUNKTE), [roh])
  const [sichtbar, setSichtbar] = useState(false)
  const huelle = useRef<HTMLDivElement>(null)

  /*
    Erst laden, wenn die Karte in die Nähe des Sichtfensters kommt. Ohne das
    holt eine Seite mit zwölf Karten sofort alle Kacheln, auch die, die
    niemand zu sehen bekommt.

    Was beim Aufbau schon im Bild steht, wird direkt gemeldet und wartet nicht
    auf den Beobachter: dessen erster Aufruf kommt frühestens beim nächsten
    Bildaufbau, und in einem Tab, der gerade nicht gezeichnet wird, unter
    Umständen sehr viel später. Für genau die Karten, die jemand ansieht, wäre
    das die falsche Verzögerung.
  */
  useEffect(() => {
    const el = huelle.current
    if (!el || sichtbar) return

    const imBild = () => {
      const r = el.getBoundingClientRect()
      const fensterHoehe = window.innerHeight || document.documentElement.clientHeight
      return r.bottom > -VORLAUF_PX && r.top < fensterHoehe + VORLAUF_PX
    }
    if (imBild() || typeof IntersectionObserver === 'undefined') { setSichtbar(true); return }

    const beobachter = new IntersectionObserver(
      (eintraege) => { if (eintraege.some((e) => e.isIntersecting)) setSichtbar(true) },
      { rootMargin: `${VORLAUF_PX}px` },
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [sichtbar])

  const ausschnitt = useMemo(
    () => ausschnittFuer(geometry, breite, hoehe),
    [geometry, breite, hoehe],
  )

  const kacheln = useMemo<Kachel[]>(() => {
    if (!ausschnitt || !sichtbar) return []
    const { zoom, kachel, x0, y0 } = ausschnitt
    const grenze = 2 ** zoom
    const liste: Kachel[] = []
    for (let x = Math.floor(x0); (x - x0) * kachel < breite; x++) {
      for (let y = Math.floor(y0); (y - y0) * kachel < hoehe; y++) {
        if (y < 0 || y >= grenze) continue
        // Ostwärts umlaufen statt abschneiden — an der Datumsgrenze bricht
        // die Vorschau sonst weg.
        const xx = ((x % grenze) + grenze) % grenze
        liste.push({
          key: `${zoom}/${xx}/${y}`,
          adressen: vorschauKacheln(zoom, xx, y),
          stil: {
            left: `${(((x - x0) * kachel) / breite) * 100}%`,
            top: `${(((y - y0) * kachel) / hoehe) * 100}%`,
            width: `calc(${(kachel / breite) * 100}% + 1px)`,
            height: `calc(${(kachel / hoehe) * 100}% + 1px)`,
          },
        })
      }
    }
    return liste
  }, [ausschnitt, sichtbar, breite, hoehe])

  /**
   * Welche Kachel unter welcher Adresse angekommen ist.
   *
   * Gezeichnet wird nur, was wirklich da ist. Ein <img> mit einer Adresse, die
   * der Server gerade abweist, wäre ein Loch im Bild, das nie mehr zugeht —
   * der Lader dagegen versucht es erneut und meldet sich, wenn es geklappt hat.
   */
  const [geladen, setGeladen] = useState<Record<string, string>>({})

  /*
    Was der Lader schon hat, wird ohne Umweg über den Zustand gezeichnet.
    Sonst blitzte eine neu aufgebaute Liste — nach einem Filter, einer anderen
    Sortierung, dem Zurückkommen aus der Detailansicht — grundlos wieder grau
    auf, obwohl alle Kacheln längst im Browser liegen.
  */
  const fertig = useMemo(
    () => kacheln.map((k) => ({ ...k, adresse: geladen[k.key] ?? kachelBereit(k.adressen[0]) })),
    [kacheln, geladen],
  )

  useEffect(() => {
    if (kacheln.length === 0) return
    let abgebrochen = false
    for (const k of kacheln) {
      if (kachelBereit(k.adressen[0])) continue
      void ladeKachel(k.adressen).then((adresse) => {
        if (abgebrochen || !adresse) return
        setGeladen((alt) => (alt[k.key] === adresse ? alt : { ...alt, [k.key]: adresse }))
      })
    }
    return () => { abgebrochen = true }
  }, [kacheln])

  /** Der Verlauf in Bildkoordinaten. */
  const pfad = useMemo(() => {
    if (!ausschnitt) return ''
    const { zoom, kachel, x0, y0 } = ausschnitt
    return geometry
      .map(([lon, lat]) =>
        `${((lonZuX(lon, zoom) - x0) * kachel).toFixed(1)},${((latZuY(lat, zoom) - y0) * kachel).toFixed(1)}`)
      .join(' ')
  }, [geometry, ausschnitt])

  const punktPos = (p: Position | undefined) => {
    if (!p || !ausschnitt) return null
    const { zoom, kachel, x0, y0 } = ausschnitt
    return { x: (lonZuX(p[0], zoom) - x0) * kachel, y: (latZuY(p[1], zoom) - y0) * kachel }
  }
  const start = punktPos(geometry[0])
  const ziel = punktPos(geometry[geometry.length - 1])

  const ecken = rund === 'alle' ? 'rounded-gross' : 'rounded-t-[calc(var(--radius-gross)-1px)]'
  const etwasDa = fertig.some((k) => k.adresse)

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

        Das `+ 1px` in Breite und Höhe ist kein Schönheitsfehler: Prozente
        eines gebrochenen Elternmasses treffen sich nicht auf ganzen Pixeln,
        und dazwischen stand je eine haarfeine dunkle Linie durchs Bild. Die
        Kacheln überlappen sich lieber um ein Pixel.
      */}
      <div className="absolute inset-0">
        {fertig.map((k) => (k.adresse ? (
          <img
            key={k.key}
            src={k.adresse}
            alt=""
            decoding="async"
            draggable={false}
            className="absolute max-w-none select-none"
            style={k.stil}
          />
        ) : null))}
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
        klein, aber vorhanden. Steht keine Kachel im Bild, gibt es auch nichts
        zuzuschreiben.
      */}
      {pfad && etwasDa && (
        <span className="absolute bottom-1 right-1.5 text-[9px] leading-none text-ink-50/70 [text-shadow:0_0_3px_rgba(7,10,11,0.95)]">
          {VORSCHAU_HINWEIS}
        </span>
      )}
    </div>
  )
}

/*
  Memoisiert, weil eine Übersichtsseite ein Dutzend davon trägt und jede
  Zustandsänderung darüber — ein anderer Stapel, ein geöffneter Dialog —
  sonst alle neu zeichnen liesse. Die Aufrufer geben `geometry` als stabile
  Referenz weiter (siehe `TourKarte`), sonst brächte das nichts.
*/
export const RoutenVorschau = memo(RoutenVorschauInnen)
