/**
 * Erzeugt die ausgelieferten Kartendaten aus dem Import.
 *
 * Warum es dieses Skript gibt
 * ---------------------------
 * Bis hierher holte die App Zonen, Punkte und Gemeindeflächen bei jedem
 * Seitenaufruf aus Supabase — rund 630 KB pro Besuch, für Daten, die sich nur
 * ändern, wenn jemand von Hand eine Einstufung pflegt. Das kostete doppelt:
 * Egress-Kontingent auf der einen Seite, Wartezeit auf der anderen. Und es war
 * obendrein falsch: PostgREST liefert höchstens 1000 Zeilen, die Abfragen
 * paginierten nicht, und so fehlten live über tausend Gemeinden und mehrere
 * hundert Schutzgebiete — ohne Fehlermeldung.
 *
 * Beides verschwindet, wenn die Kartendaten das sind, was sie ihrer Natur nach
 * sind: statische Dateien. Sie entstehen hier aus `import/<REGION>/` und der
 * von Hand gepflegten Rechtsschicht in `src/data/`, werden von Vite mit einem
 * Inhalts-Hash versehen und dürfen deshalb unbegrenzt im Browser-Cache liegen.
 * Supabase bleibt für das zuständig, was wirklich pro Nutzer verschieden ist:
 * Konten, Touren, Kommentare, Meldungen, eigene Punkte.
 *
 * Der Import ist die bessere Quelle als die Datenbank — nicht nur die
 * billigere. Die Datenbank wird von Hand nachgeseedet und hinkt hinterher:
 * beim Schreiben dieses Skripts lagen dort 1457 Zonen, im Import 1836.
 *
 * Aufruf:  node scripts/snapshot-daten.mjs        (oder: npm run snapshot)
 *          REGION=CH node scripts/snapshot-daten.mjs
 *
 * Läuft automatisch vor `npm run dev` und `npm run build` (pre-Skripte in
 * package.json). Die Ausgabe ist erzeugt und gehört nicht ins Git — sie steht
 * in .gitignore, damit niemand sie von Hand pflegt.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGION = process.env.REGION ?? 'CH'
const IMPORT = resolve(ROOT, 'import', REGION)
const DATEN = resolve(ROOT, 'src/data')
const ZIEL = resolve(DATEN, 'snapshot')

/**
 * Nachkommastellen der Koordinaten.
 *
 * Fünf Stellen sind 1,1 m, vier sind 11 m. Für Verwaltungsgrenzen ist das
 * folgenlos — die Auskunft dort lautet ohnehin „frag die Gemeinde", und der
 * OSM-Grenzverlauf ist selbst nicht auf elf Meter genau. Es spart ein Sechstel
 * der übertragenen Bytes.
 *
 * Schutzgebiete behalten fünf Stellen. Sie sind der rechtliche Kern dieser
 * Karte; wo die Aussage „hier ist es verboten" an einer Kante hängt, wird
 * nicht zugunsten der Dateigrösse gerundet. Der Gewinn wäre auch klein: der
 * grosse Hebel ist, dass diese Dateien überhaupt aus dem JavaScript-Bündel
 * verschwinden.
 *
 * Vereinfachen (Douglas-Peucker) bringt hier nichts und ist deshalb bewusst
 * nicht eingebaut: gemessen liegen die Stützpunkte der Gemeindegrenzen im
 * Mittel 580 m auseinander, die der Zonen 33 m. Der Import hat bereits
 * ausgedünnt, es ist kein Spielraum mehr da.
 */
const STELLEN_VERWALTUNG = 4
const STELLEN_ZONEN = 5

/**
 * Die Übersichtsfassung der Gemeindeflächen.
 *
 * Sie sind mit 617 KB gepackt der grösste Einzelposten — und beim Zeichnen
 * tragen sie nur Farbe: der Rechtstext hängt an `gemeinden.legal.json`, nicht
 * an der Geometrie. Deshalb zwei Auflösungen. Bis Zoom 9,5 genügt eine grob
 * vereinfachte Fassung (148 KB), darüber kommen die Detailkacheln des
 * Ausschnitts dazu.
 *
 * 550 m Toleranz klingt viel und ist es nicht: bei Zoom 8 misst ein Bildpunkt
 * auf dieser Breite rund 420 m, die Abweichung bleibt also unter zwei Pixeln.
 * Ab Zoom 9,5 zeigt ohnehin die volle Fassung.
 *
 * Die Zonen bekommen diese Behandlung bewusst *nicht*. Sie sind der
 * rechtliche Kern: jede Fläche ist anklickbar und trägt eine Aussage darüber,
 * was dort gilt. Wo eine Kante die Grenze zwischen „erlaubt" und „verboten"
 * ist, wird nicht zugunsten der Dateigrösse verschoben.
 */
const UEBERSICHT_TOLERANZ = 0.005
const STELLEN_UEBERSICHT = 3

/**
 * Kantenlänge der Punktkacheln in Grad.
 *
 * Gipfel (7274) und Naturobjekte (23 753) landesweit auszuliefern wären gut
 * 6 MB — für Ebenen, die erst ab Zoom 9,5 beziehungsweise 12,5 gezeichnet
 * werden. Sie werden deshalb in ein Gitter geschnitten, und der Browser holt
 * nur die Kacheln des sichtbaren Ausschnitts. 0,25° sind rund 28 km in der
 * Breite: gross genug, dass beim Scrollen selten nachgeladen wird, klein
 * genug, dass eine Kachel wenige zehn Kilobyte wiegt.
 */
const KACHEL = 0.25

const lies = (pfad) => JSON.parse(readFileSync(pfad, 'utf8'))
const kb = (text) => Math.round(text.length / 1024)
const gzkb = (text) => Math.round(gzipSync(text, { level: 9 }).length / 1024)

/** Koordinaten rekursiv runden — Punkt, Ring, Polygon und MultiPolygon in einem. */
function runde(koordinaten, stellen) {
  return typeof koordinaten[0] === 'number'
    ? [Number(koordinaten[0].toFixed(stellen)), Number(koordinaten[1].toFixed(stellen))]
    : koordinaten.map((k) => runde(k, stellen))
}

const rundeGeometrie = (geometry, stellen) => ({
  ...geometry,
  coordinates: runde(geometry.coordinates, stellen),
})

/**
 * Douglas-Peucker auf einem Ring: behalte den Punkt mit dem grössten Abstand
 * zur Sehne, wenn er weiter als `toleranz` weg liegt, und teile dort.
 *
 * Die Toleranz ist in Grad, nicht in Metern — für die eine Frage, die dieses
 * Skript stellt („sieht man den Unterschied bei Zoom 8?"), ist die Verzerrung
 * durch die Breitengrade kleiner als der Fehler, den wir ohnehin zulassen.
 */
function ausduennen(punkte, toleranz) {
  if (punkte.length < 3) return punkte
  const [ax, ay] = punkte[0]
  const [bx, by] = punkte[punkte.length - 1]
  const dx = bx - ax
  const dy = by - ay
  const laenge = dx * dx + dy * dy

  let groesster = 0
  let stelle = 0
  for (let i = 1; i < punkte.length - 1; i++) {
    const [px, py] = punkte[i]
    const t = laenge ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / laenge)) : 0
    const abstand = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (abstand > groesster) { groesster = abstand; stelle = i }
  }

  if (groesster <= toleranz) return [punkte[0], punkte[punkte.length - 1]]
  return [
    ...ausduennen(punkte.slice(0, stelle + 1), toleranz).slice(0, -1),
    ...ausduennen(punkte.slice(stelle), toleranz),
  ]
}

/**
 * Vereinfacht rekursiv, hält aber jeden Ring bei mindestens vier Punkten.
 * Ein zu einer Linie zusammengefallenes Polygon wäre keine kleinere Fläche,
 * sondern eine verschwundene — auf dieser Karte ein Loch ohne Auskunft.
 */
function vereinfache(koordinaten, toleranz) {
  if (typeof koordinaten[0][0] !== 'number') {
    return koordinaten.map((k) => vereinfache(k, toleranz))
  }
  if (koordinaten.length <= 5) return koordinaten
  const duenn = ausduennen(koordinaten, toleranz)
  return duenn.length >= 4 ? duenn : koordinaten
}

/** Umschliessendes Rechteck — für die Zuordnung einer Fläche zu Kacheln. */
function huelle(koordinaten, rechteck = { west: Infinity, sued: Infinity, ost: -Infinity, nord: -Infinity }) {
  if (typeof koordinaten[0] === 'number') {
    rechteck.west = Math.min(rechteck.west, koordinaten[0])
    rechteck.ost = Math.max(rechteck.ost, koordinaten[0])
    rechteck.sued = Math.min(rechteck.sued, koordinaten[1])
    rechteck.nord = Math.max(rechteck.nord, koordinaten[1])
    return rechteck
  }
  koordinaten.forEach((k) => huelle(k, rechteck))
  return rechteck
}

const geschrieben = []

function schreibe(name, inhalt) {
  const text = JSON.stringify(inhalt)
  const pfad = resolve(ZIEL, name)
  mkdirSync(dirname(pfad), { recursive: true })
  writeFileSync(pfad, text)
  geschrieben.push({ name, kb: kb(text), gz: gzkb(text) })
  return text
}

/* ------------------------------------------------------------------ Zonen */

/**
 * Geometrie und Rechtseinstufung zusammensetzen.
 *
 * In `src/data/` liegen beide getrennt, und das bleibt auch so: ein Neu-Import
 * darf die von Hand gepflegte Rechtsschicht nicht überschreiben (siehe
 * CLAUDE.md). Zusammengefügt wird erst hier, für die Auslieferung — die
 * Trennung ist eine Frage der Pflege, nicht des Transports.
 *
 * Flächen ohne Einstufung bleiben drin und werden 'unknown'. Eine ungeprüfte
 * Fläche ist eine Information, keine Lücke; sie verschwinden zu lassen wäre
 * die eine Sorte Unehrlichkeit, die diese Karte sich nicht leisten kann.
 */
function zonen() {
  const quellen = [
    { geo: 'zones/CH.osm.json', recht: 'zones/CH.legal.json' },
    { geo: 'zones/CH.bafu.json', recht: 'zones/CH.bafu.legal.json' },
  ]

  const alle = []
  for (const q of quellen) {
    const geoPfad = resolve(IMPORT, q.geo.replace('CH.', `${REGION}.`))
    const rechtPfad = resolve(IMPORT, q.recht.replace('CH.', `${REGION}.`))
    if (!existsSync(geoPfad)) continue
    const geo = lies(geoPfad)
    const recht = existsSync(rechtPfad) ? lies(rechtPfad).zones : {}

    for (const f of geo.features) {
      const e = recht[f.id]
      alle.push({
        id: f.id,
        region: REGION,
        name: f.properties.name,
        status: e?.status ?? 'unknown',
        tent_allowed: e?.tent_allowed ?? 'unknown',
        vehicle_allowed: e?.vehicle_allowed ?? 'unknown',
        fire_allowed: e?.fire_allowed ?? 'unknown',
        conditions: e?.conditions ?? null,
        // OSM bleibt die Geometriequelle. Für eine von Hand belegte
        // Rechtseinstufung muss aber die Rechtsquelle gezeigt werden — nicht
        // bloss der Dienst, von dem der Umriss stammt.
        source: e?.source ?? f.properties.source,
        source_url: e?.source_url ?? f.properties.source_url,
        last_verified: e?.last_verified ?? null,
        review_status: e?.review_status ?? 'entwurf',
        notes: e?.notes ?? null,
        geometry: rundeGeometrie(f.geometry, STELLEN_ZONEN),
      })
    }
  }

  schreibe(`zonen.${REGION}.json`, alle)
  beispielZone(alle)
  return alle.length
}

/**
 * Die eine echte Fläche, die auf der Startseite als Beispiel-Infokarte steht.
 *
 * Sie bekommt eine eigene Datei von einem Kilobyte, und das ist der ganze
 * Zweck: bisher zog die Startseite dafür die komplette Walliser Zonen-Datei
 * ins Einstiegsbündel — 66 KB gepackt, für einen Namen und sechs Felder. Das
 * war der grösste einzelne Posten auf der Seite, die ein neuer Besucher als
 * allererstes sieht.
 *
 * Bevorzugt der Aletschwald, weil er die Aussage am deutlichsten trägt; fällt
 * sonst auf die erste verbotene Fläche zurück, damit das Beispiel nie leer
 * bleibt. Ausgedacht wird hier nichts — es ist eine Fläche aus dem Bestand.
 */
function beispielZone(alle) {
  const z = alle.find((x) => x.id === 'osm-way-38781889')
    ?? alle.find((x) => x.status === 'forbidden' && x.review_status !== 'entwurf')
    ?? alle.find((x) => x.status === 'forbidden')
    ?? alle[0]
  if (!z) return
  const { geometry: _weg, ...ohneGeometrie } = z
  schreibe(`beispiel.${REGION}.json`, ohneGeometrie)
}

/* ----------------------------------------------------------------- Punkte */

function punkte() {
  const liste = lies(resolve(IMPORT, 'points', `${REGION}.json`))
  schreibe(`punkte.${REGION}.json`, liste)
  return liste.length
}

/* ------------------------------------------------- Gemeinden und Kantone */

/**
 * Die Flächen der Zuständigkeitsebenen — ohne die Rechtsschicht.
 *
 * Die bleibt getrennt (`gemeinden.legal.json`, `kantone.legal.json`) und wird
 * eigens geladen: sie ist klein, ändert sich bei jeder Recherche, und sie an
 * die Geometrie zu heften hiesse, bei jeder gepflegten Gemeinde ein Megabyte
 * Grenzverläufe neu auszuliefern.
 */
function flaechen(quelle, name, stellen) {
  const datei = lies(quelle)
  const features = datei.features.map((f) => ({
    ...f,
    geometry: rundeGeometrie(f.geometry, stellen),
  }))
  schreibe(name, { type: 'FeatureCollection', features })
  return features.length
}

/**
 * Dieselben Flächen ein zweites Mal, in zwei Auflösungen.
 *
 * Eine Fläche liegt in jeder Kachel, die ihr umschliessendes Rechteck
 * berührt — geschnitten wird nicht. Das erzeugt Doppelungen an den
 * Kachelgrenzen, aber Polygone zu zerschneiden hiesse, aus einer Gemeinde
 * mehrere zu machen und die Punkt-in-Fläche-Abfrage zu verkomplizieren.
 * Gemessen kostet die Doppelung deutlich weniger, als das Schneiden an
 * Klarheit nähme.
 */
function flaechenGekachelt(quelle, name, ordner, verzeichnisName, stellen) {
  const datei = lies(quelle)

  const uebersicht = datei.features.map((f) => ({
    ...f,
    geometry: rundeGeometrie(
      { ...f.geometry, coordinates: vereinfache(f.geometry.coordinates, UEBERSICHT_TOLERANZ) },
      STELLEN_UEBERSICHT,
    ),
  }))
  schreibe(name, { type: 'FeatureCollection', features: uebersicht })

  const nach = new Map()
  for (const f of datei.features) {
    const genau = { ...f, geometry: rundeGeometrie(f.geometry, stellen) }
    const h = huelle(genau.geometry.coordinates)
    for (let x = Math.floor(h.west / KACHEL); x <= Math.floor(h.ost / KACHEL); x++) {
      for (let y = Math.floor(h.sued / KACHEL); y <= Math.floor(h.nord / KACHEL); y++) {
        const schluessel = `${x}_${y}`
        const eimer = nach.get(schluessel)
        if (eimer) eimer.push(genau)
        else nach.set(schluessel, [genau])
      }
    }
  }

  const verzeichnis = {}
  for (const [schluessel, features] of nach) {
    schreibe(`${ordner}/${schluessel}.json`, { type: 'FeatureCollection', features })
    verzeichnis[schluessel] = features.length
  }
  schreibe(verzeichnisName, { kachel: KACHEL, kacheln: verzeichnis })

  const groessen = geschrieben.filter((g) => g.name.startsWith(`${ordner}/`)).map((g) => g.gz)
  return {
    flaechen: datei.features.length,
    uebersicht: geschrieben.find((g) => g.name === name).gz,
    kacheln: nach.size,
    mittel: Math.round(groessen.reduce((a, b) => a + b, 0) / groessen.length),
    groesste: Math.max(...groessen),
  }
}

/* ---------------------------------------------------- Gipfel und Natur */

const kachelIndex = (lng, lat) => `${Math.floor(lng / KACHEL)}_${Math.floor(lat / KACHEL)}`

/**
 * Punktdaten ins Gitter schneiden.
 *
 * Zusätzlich zu den Kacheln entsteht ein Verzeichnis: welche Kacheln es gibt
 * und wie viele Objekte darin liegen. Ohne das würde der Browser für jeden
 * leeren Ausschnitt einen 404 holen — über der halben Landesfläche, die aus
 * Fels und Wasser besteht, wäre das der Normalfall.
 */
function kacheln(quelle, ordner, verzeichnisName) {
  const liste = lies(quelle)
  const nach = new Map()
  for (const o of liste) {
    const schluessel = kachelIndex(o.lng, o.lat)
    const eimer = nach.get(schluessel)
    if (eimer) eimer.push(o)
    else nach.set(schluessel, [o])
  }

  const verzeichnis = {}
  for (const [schluessel, objekte] of nach) {
    schreibe(`${ordner}/${schluessel}.json`, objekte)
    verzeichnis[schluessel] = objekte.length
  }
  schreibe(verzeichnisName, { kachel: KACHEL, kacheln: verzeichnis })

  const groessen = geschrieben.filter((g) => g.name.startsWith(`${ordner}/`)).map((g) => g.gz)
  return {
    objekte: liste.length,
    kacheln: nach.size,
    groesste: Math.max(...groessen),
    mittel: Math.round(groessen.reduce((a, b) => a + b, 0) / groessen.length),
  }
}

/* -------------------------------------------------------------- Ausführen */

if (!existsSync(IMPORT)) {
  throw new Error(`${IMPORT} fehlt — erst 'npm run import:osm' laufen lassen.`)
}

// Vollständig neu bauen: eine Kachel, die nach einem Import leer geworden ist,
// bliebe sonst als Leiche liegen und würde weiter ausgeliefert.
rmSync(ZIEL, { recursive: true, force: true })
mkdirSync(ZIEL, { recursive: true })

console.log(`→ Snapshot ${REGION} aus ${IMPORT.replace(ROOT, 'app')}`)

const anzahlZonen = zonen()
const anzahlPunkte = punkte()
const gemeinden = flaechenGekachelt(
  resolve(IMPORT, 'gemeinden', `${REGION}.json`),
  `gemeinden.uebersicht.${REGION}.json`,
  'gemeinden',
  `gemeinden.${REGION}.json`,
  STELLEN_VERWALTUNG,
)
const anzahlKantone = flaechen(
  resolve(DATEN, 'kantone', `${REGION}.json`),
  `kantone.${REGION}.json`,
  STELLEN_VERWALTUNG,
)
const gipfel = kacheln(resolve(IMPORT, 'peaks', `${REGION}.json`), 'gipfel', `gipfel.${REGION}.json`)
const gipfelHoch = uebersichtGipfel()
const natur = kacheln(resolve(IMPORT, 'nature', `${REGION}.json`), 'natur', `natur.${REGION}.json`)

/**
 * Die hohen Gipfel als eine kleine Datei — gegen die Kachel-Lawine.
 *
 * Bei Zoom 8 zeichnet die Karte nur Gipfel über 3500 m (peaks-hoch), aber der
 * sichtbare Ausschnitt deckt dort über achtzig Kacheln ab. Gemessen: einmal
 * von der Landesansicht bis Zoom 13 durchzoomen holte 91 Kacheln, für ein paar
 * Dreitausender-Namen.
 *
 * 291 Gipfel über 3500 m sind zusammen 8 KB gepackt. Die kommen einmal mit
 * und decken alles bis Zoom 11 ab; erst darüber, wo der Ausschnitt auf zwei
 * Kacheln schrumpft, lohnt das Gitter.
 */
function uebersichtGipfel() {
  const alle = lies(resolve(IMPORT, 'peaks', `${REGION}.json`))
  const hoch = alle.filter((p) => (p.elevation ?? 0) >= 3500)
  schreibe(`gipfel.hoch.${REGION}.json`, hoch)
  return hoch.length
}

/* -------------------------------------------------------------- Bilanz */

const einzeln = geschrieben.filter((g) => !g.name.includes('/'))
const gesamtGz = geschrieben.reduce((s, g) => s + g.gz, 0)

const gz = (praefix) => einzeln.find((g) => g.name.startsWith(praefix)).gz
const sofort = gz('zonen') + gz('punkte') + gz('gemeinden.uebersicht') + gz('kantone') + gz('gipfel.hoch')

console.log(`
  Sofort beim Öffnen der Karte
    Zonen        ${String(anzahlZonen).padStart(5)}  →  ${gz('zonen')} KB gz
    Punkte       ${String(anzahlPunkte).padStart(5)}  →  ${gz('punkte')} KB gz
    Gemeinden    ${String(gemeinden.flaechen).padStart(5)}  →  ${gemeinden.uebersicht} KB gz  (Übersicht, bis Zoom 9,5)
    Kantone      ${String(anzahlKantone).padStart(5)}  →  ${gz('kantone')} KB gz
    Gipfel > 3500 ${String(gipfelHoch).padStart(4)}  →  ${gz('gipfel.hoch')} KB gz  (Übersicht, bis Zoom 11)
                                ${String(sofort).padStart(4)} KB gz zusammen

  Nach Ausschnitt nachgeladen
    Gemeinden (Detail)  ${gemeinden.kacheln} Kacheln, Ø ${gemeinden.mittel} KB gz, grösste ${gemeinden.groesste} KB
    Gipfel  ${String(gipfel.objekte).padStart(5)}       ${gipfel.kacheln} Kacheln, Ø ${gipfel.mittel} KB gz, grösste ${gipfel.groesste} KB
    Natur   ${String(natur.objekte).padStart(5)}       ${natur.kacheln} Kacheln, Ø ${natur.mittel} KB gz, grösste ${natur.groesste} KB

  ${geschrieben.length} Dateien, ${gesamtGz} KB gz insgesamt — der Vorrat, nicht die Last.`)

// Ein leerer Snapshot fällt sonst erst im Browser auf, als leere Karte.
const leer = [anzahlZonen, anzahlPunkte, gemeinden.flaechen, anzahlKantone].some((n) => n === 0)
if (leer) throw new Error('Snapshot unvollständig — eine der Ebenen ist leer.')

const bytes = readdirSync(ZIEL, { recursive: true })
  .map((n) => resolve(ZIEL, String(n)))
  .filter((p) => statSync(p).isFile())
  .reduce((s, p) => s + statSync(p).size, 0)
console.log(`✓ ${(bytes / 1024 / 1024).toFixed(1)} MB in src/data/snapshot/ (nicht im Git).\n`)
