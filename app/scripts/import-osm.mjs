/**
 * Import-Skript für die KARTEN-/OSM-Schicht.
 *
 * Holt aus OpenStreetMap:
 *  - Punkte: Berghütten, Biwakhütten, Campingplätze  ->  src/data/points/<region>.json
 *  - Gipfel: benannte Gipfel mit Höhenangabe            ->  src/data/peaks/<region>.json
 *  - Zonen:  Schutzgebiete (Rohgeometrie)            ->  src/data/zones/<region>.osm.json
 *  - Natur:  Seen, Quellen, Trinkwasser, Wasserfälle, Aussichtspunkte
 *                                                    ->  src/data/nature/<region>.json
 *  - Alpen:  Umriss des Alpenbogens (Kartenrahmen)   ->  src/map/alpen.json
 *
 * WICHTIG: Das liefert nur GEOMETRIE + Sachdaten aus OSM.
 * Die RECHTLICHE Bewertung (erlaubt/verboten/geduldet) ist NICHT in OSM enthalten
 * und muss in src/data/zones/<region>.legal.json manuell gepflegt werden.
 *
 * Aufruf:  npm run import:osm            — alles
 *          npm run import:osm -- natur    — nur eine Gruppe (punkte|gipfel|zonen|natur)
 *
 * Die einzelne Gruppe ist kein Komfort, sondern eine Schutzmassnahme: ein
 * vollständiger Lauf schreibt zones/<region>.osm.json neu, und ändert sich
 * dabei eine OSM-ID, verliert die zugehörige rechtliche Einstufung in
 * <region>.legal.json ihren Anker. Wer nur Wasserstellen nachladen will,
 * soll die Rechtspflege nicht anfassen müssen.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const REGION = process.env.REGION ?? 'CH-VS'
const ENDPOINT = 'https://overpass-api.de/api/interpreter'

const round = (n) => Math.round(n * 1e5) / 1e5

/**
 * Overpass ist ein Gemeinschaftsserver und antwortet unter Last mit einem
 * Laufzeitfehler statt mit Daten. Deshalb mehrere Anläufe mit wachsender
 * Pause, bevor der Import aufgibt.
 */
async function overpass(query, versuche = 4) {
  for (let versuch = 1; ; versuch++) {
    try {
      return await overpassEinmal(query)
    } catch (e) {
      const letzterVersuch = versuch >= versuche
      if (letzterVersuch) throw e
      const pause = versuch * 20
      console.log(`   Overpass-Fehler (Versuch ${versuch}/${versuche}), warte ${pause}s …`)
      await new Promise((r) => setTimeout(r, pause * 1000))
    }
  }
}

async function overpassEinmal(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass lehnt Requests ohne aussagekräftigen User-Agent mit 406 ab.
      'User-Agent': 'CampBuddy-Import/0.1 (https://github.com/jannis-drng/campbuddy)',
    },
    body: 'data=' + encodeURIComponent(query),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  // Bei Überlast antwortet Overpass mit HTTP 200 und einer HTML-Fehlerseite.
  if (text.trimStart().startsWith('<')) throw new Error('Overpass überlastet')
  return JSON.parse(text)
}

/* ---------------- Punkte: Hütten & Campingplätze ---------------- */

const POINT_TYPES = {
  alpine_hut: 'hut',
  wilderness_hut: 'hut',
  camp_site: 'campsite',
  caravan_site: 'vehicle_spot',
}

async function importPoints() {
  const q = `
    [out:json][timeout:180];
    area["ISO3166-2"="${REGION}"]->.a;
    (
      node["tourism"~"^(alpine_hut|wilderness_hut|camp_site|caravan_site)$"](area.a);
      way["tourism"~"^(camp_site|caravan_site)$"](area.a);
    );
    out center tags;`
  const data = await overpass(q)

  const points = data.elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat
      const lng = el.lon ?? el.center?.lon
      if (lat == null || lng == null) return null
      const t = el.tags ?? {}
      return {
        id: `osm-${el.type}-${el.id}`,
        region: REGION,
        type: POINT_TYPES[t.tourism] ?? 'hut',
        name: t.name ?? t['name:de'] ?? '(unbenannt)',
        lat: round(lat),
        lng: round(lng),
        elevation: t.ele ? Math.round(Number(t.ele)) || null : null,
        info: {
          operator: t.operator ?? null,
          phone: t.phone ?? t['contact:phone'] ?? null,
          website: t.website ?? t['contact:website'] ?? null,
          capacity: t.capacity ?? t.beds ?? null,
          opening_hours: t.opening_hours ?? null,
          seasonal: t.seasonal ?? null,
        },
        source: 'OpenStreetMap',
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        last_verified: null, // bewusst leer: noch nicht selbst geprüft
      }
    })
    .filter(Boolean)
    .filter((p) => p.name !== '(unbenannt)')
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  const out = resolve(ROOT, 'src/data/points', `${REGION}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(points, null, 2) + '\n')
  console.log(`Punkte: ${points.length} -> ${out}`)
  const byType = points.reduce((m, p) => ({ ...m, [p.type]: (m[p.type] ?? 0) + 1 }), {})
  console.log('  ', byType)
}

/* ---------------- Gipfel ---------------- */

async function importPeaks() {
  // Nur benannte Gipfel mit Höhenangabe: ein namenloser Punkt ohne Höhe hilft
  // bei der Orientierung nicht und bläht die Karte nur auf.
  const q = `
    [out:json][timeout:180];
    area["ISO3166-2"="${REGION}"]->.a;
    node["natural"="peak"]["name"]["ele"](area.a);
    // 'out tags' liefert KEINE Koordinaten — für Knoten braucht es 'out body'.
    out body;`
  const data = await overpass(q)

  const peaks = data.elements
    .map((el) => {
      const ele = Math.round(Number(el.tags.ele))
      if (!Number.isFinite(ele)) return null
      if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) return null
      return {
        id: `osm-node-${el.id}`,
        region: REGION,
        name: el.tags.name,
        lat: round(el.lat),
        lng: round(el.lon),
        elevation: ele,
        source_url: `https://www.openstreetmap.org/node/${el.id}`,
      }
    })
    .filter(Boolean)
    // Die höchsten zuerst: so lassen sich später die prominenten zuerst zeigen.
    .sort((a, b) => b.elevation - a.elevation)

  const out = resolve(ROOT, 'src/data/peaks', `${REGION}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(peaks, null, 2) + '\n')
  console.log(`Gipfel: ${peaks.length} -> ${out}`)
  if (peaks.length > 0) console.log(`   höchster: ${peaks[0].name} (${peaks[0].elevation} m)`)
}

/* ---------------- Zonen: Schutzgebiete (Geometrie) ---------------- */

async function importProtectedAreas() {
  const q = `
    [out:json][timeout:300];
    area["ISO3166-2"="${REGION}"]->.a;
    (
      relation["boundary"="protected_area"]["name"](area.a);
      way["boundary"="protected_area"]["name"](area.a);
      relation["leisure"="nature_reserve"]["name"](area.a);
      way["leisure"="nature_reserve"]["name"](area.a);
    );
    out geom;`
  const data = await overpass(q)

  const features = []
  for (const el of data.elements) {
    const t = el.tags ?? {}
    let coords = null

    if (el.type === 'way' && el.geometry) {
      const ring = el.geometry.map((p) => [round(p.lon), round(p.lat)])
      if (ring.length > 3) coords = [closeRing(ring)]
    } else if (el.type === 'relation' && el.members) {
      const outers = el.members
        .filter((m) => m.role === 'outer' && m.geometry)
        .map((m) => m.geometry.map((p) => [round(p.lon), round(p.lat)]))
      const merged = mergeRings(outers).filter((r) => r.length > 3)
      if (merged.length) coords = merged.map(closeRing)
    }
    if (!coords) continue

    features.push({
      type: 'Feature',
      id: `osm-${el.type}-${el.id}`,
      properties: {
        osm_id: `${el.type}/${el.id}`,
        name: t.name ?? t['name:de'] ?? '(unbenannt)',
        protect_class: t.protect_class ?? null,
        protection_title: t.protection_title ?? null,
        operator: t.operator ?? null,
        source: 'OpenStreetMap',
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      },
      geometry: coords.length === 1
        ? { type: 'Polygon', coordinates: coords }
        : { type: 'MultiPolygon', coordinates: coords.map((c) => [c]) },
    })
  }

  const fc = { type: 'FeatureCollection', features }
  const out = resolve(ROOT, 'src/data/zones', `${REGION}.osm.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(fc) + '\n')
  const kb = Math.round(JSON.stringify(fc).length / 1024)
  console.log(`Schutzgebiete: ${features.length} Flächen, ${kb} KB -> ${out}`)
}

/** Ring schließen (erster == letzter Punkt), wie GeoJSON es verlangt. */
function closeRing(ring) {
  const [a] = ring
  const b = ring[ring.length - 1]
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, a]
}

/** Zerlegte Relation-Wege zu geschlossenen Ringen zusammensetzen. */
function mergeRings(segments) {
  const open = segments.map((s) => [...s])
  const rings = []
  while (open.length) {
    let cur = open.shift()
    let extended = true
    while (extended && !samePoint(cur[0], cur[cur.length - 1])) {
      extended = false
      for (let i = 0; i < open.length; i++) {
        const seg = open[i]
        if (samePoint(cur[cur.length - 1], seg[0])) { cur = cur.concat(seg.slice(1)); open.splice(i, 1); extended = true; break }
        if (samePoint(cur[cur.length - 1], seg[seg.length - 1])) { cur = cur.concat(seg.slice().reverse().slice(1)); open.splice(i, 1); extended = true; break }
        if (samePoint(cur[0], seg[seg.length - 1])) { cur = seg.slice(0, -1).concat(cur); open.splice(i, 1); extended = true; break }
        if (samePoint(cur[0], seg[0])) { cur = seg.slice().reverse().slice(0, -1).concat(cur); open.splice(i, 1); extended = true; break }
      }
    }
    if (samePoint(cur[0], cur[cur.length - 1])) rings.push(cur)
  }
  return rings
}

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1]

/* ---------------- Natur: Wasser & Aussicht ---------------- */

/**
 * Was Komoot „Highlights" nennt, ist hier bewusst enger gefasst: nur, was
 * unterwegs eine Entscheidung beeinflusst. Trinkwasser bestimmt, wie viel man
 * schleppt; ein See, wo man pausiert; ein Aussichtspunkt, wo man das Zelt
 * hinstellt. Meinungen („schöner Weg") gehören nicht in die importierte
 * Schicht — die kommen von Nutzern (siehe eigene Punkte).
 */
const NATURE_QUERIES = [
  ['lake', 'way["natural"="water"]["name"]', 'relation["natural"="water"]["name"]'],
  ['spring', 'node["natural"="spring"]'],
  ['drinking_water', 'node["amenity"="drinking_water"]', 'node["man_made"="water_well"]["drinking_water"="yes"]'],
  ['waterfall', 'node["waterway"="waterfall"]'],
  ['viewpoint', 'node["tourism"="viewpoint"]'],
]

/** Fallback-Namen: eine unbenannte Quelle ist trotzdem eine Quelle. */
const NATURE_FALLBACK = {
  lake: 'See',
  spring: 'Quelle',
  drinking_water: 'Trinkwasser',
  waterfall: 'Wasserfall',
  viewpoint: 'Aussichtspunkt',
}

async function importNature() {
  const features = []

  for (const [type, ...selektoren] of NATURE_QUERIES) {
    const q = `
      [out:json][timeout:180];
      area["ISO3166-2"="${REGION}"]->.a;
      (
        ${selektoren.map((sel) => `${sel}(area.a);`).join('\n        ')}
      );
      out center tags;`
    const data = await overpass(q)

    for (const el of data.elements) {
      const lat = el.lat ?? el.center?.lat
      const lng = el.lon ?? el.center?.lon
      if (lat == null || lng == null) continue
      const t = el.tags ?? {}
      // Trinkwasser, das ausdrücklich als nicht trinkbar getaggt ist, wäre
      // eine gefährliche Auskunft — lieber gar nicht zeigen.
      if (type === 'drinking_water' && t.drinking_water === 'no') continue
      features.push({
        id: `osm-${el.type}-${el.id}`,
        region: REGION,
        type,
        name: t.name ?? t['name:de'] ?? NATURE_FALLBACK[type],
        benannt: Boolean(t.name ?? t['name:de']),
        lat: round(lat),
        lng: round(lng),
        elevation: t.ele ? Math.round(Number(t.ele)) || null : null,
        source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      })
    }
    console.log(`   ${type}: ${features.filter((f) => f.type === type).length}`)
  }

  features.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'de'))

  const out = resolve(ROOT, 'src/data/nature', `${REGION}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(features) + '\n')
  const kb = Math.round(JSON.stringify(features).length / 1024)
  console.log(`Natur: ${features.length} Objekte, ${kb} KB -> ${out}`)
}

/* ---------------- Alpen: Umriss für den Kartenrahmen ---------------- */

/**
 * Der Alpenbogen als Fläche — nicht als Datenschicht, sondern als Rahmen.
 *
 * Die Karte endet an diesem Umriss; ausserhalb liegt Dunkelheit statt einer
 * Weltkarte, über die diese App nichts zu sagen hat. Deshalb landet die Datei
 * auch unter `src/map/` und nicht bei den Legalitäts-Daten: sie behauptet
 * nichts über Recht, sie beschreibt nur, wo das Blatt aufhört.
 *
 * OSM-Relation 2698607, `natural=mountain_range`, Wikidata Q1286.
 */
const ALPEN_RELATION = 2698607

/**
 * Wie grob der Umriss sein darf, in Grad. Rund 500 m — auf den Zoomstufen, auf
 * denen er als Kartenrand dient, sieht man das nicht.
 */
const ALPEN_TOLERANZ = 0.005

/**
 * Wie weit der Umriss nach aussen wächst, in Grad.
 *
 * Gemeint ist der *Alpenraum*, nicht der Gebirgskamm: die Städte, aus denen man
 * losfährt, gehören aufs Blatt. Bei 1,1° sind das rund 120 km nach Norden und
 * Süden, 85 km nach Osten und Westen — genug für München, Mailand, Lyon, Wien,
 * Zürich, Turin und Ljubljana, mit Luft dahinter.
 */
const ALPEN_WACHSTUM = 1.1

/** Kantenlänge einer Rasterzelle beim Aufblasen, in Grad (~2 km). */
const RASTER = 0.02

async function importAlpen() {
  const data = await overpass(`
    [out:json][timeout:300];
    relation(${ALPEN_RELATION});
    out geom;`)

  const rel = data.elements.find((e) => e.type === 'relation')
  if (!rel) throw new Error('Alpen-Relation nicht gefunden')

  const segmente = (rel.members ?? [])
    .filter((m) => m.role === 'outer' && m.geometry)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]))

  const rohPunkte = segmente.reduce((s, r) => s + r.length, 0)
  const ringe = mergeRings(segmente)
    .filter((r) => r.length > 3)
    .map(closeRing)
    .filter((r) => ringFlaeche(r) > 0.01)
    .sort((a, b) => ringFlaeche(b) - ringFlaeche(a))

  if (ringe.length === 0) throw new Error('Kein brauchbarer Ring aus der Relation')

  console.log(`   Rohumriss: ${ringe.length} Ring(e), ${rohPunkte} Punkte`)
  const gewachsen = aufblasen(ringe[0], ALPEN_WACHSTUM)
  const vereinfacht = vereinfacheRing(gewachsen, ALPEN_TOLERANZ)
  const gerundet = [vereinfacht.map(([x, y]) => [round(x), round(y)])]

  const alle = gerundet.flat()
  const bbox = [
    Math.min(...alle.map((p) => p[0])), Math.min(...alle.map((p) => p[1])),
    Math.max(...alle.map((p) => p[0])), Math.max(...alle.map((p) => p[1])),
  ].map(round)

  const inhalt = {
    quelle: 'OpenStreetMap',
    source_url: `https://www.openstreetmap.org/relation/${ALPEN_RELATION}`,
    lizenz: 'ODbL',
    hinweis: `Gebirgsumriss, um ${ALPEN_WACHSTUM}° nach aussen erweitert — gedacht als Kartenrahmen, nicht als Gebietsgrenze.`,
    wachstum_grad: ALPEN_WACHSTUM,
    bbox,
    geometry: { type: 'MultiPolygon', coordinates: gerundet.map((r) => [r]) },
  }

  const out = resolve(ROOT, 'src/map', 'alpen.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(inhalt) + '\n')
  const kb = Math.round(JSON.stringify(inhalt).length / 1024)
  console.log(`Alpen: ${rohPunkte} -> ${vereinfacht.length} Punkte, ${kb} KB -> ${out}`)
  console.log(`   Umschliessend: ${bbox.join(', ')}`)
  for (const [name, lng, lat] of PROBESTAEDTE) {
    const drin = lng > bbox[0] && lng < bbox[2] && lat > bbox[1] && lat < bbox[3]
    console.log(`   ${drin ? '✓' : '✗'} ${name}`)
  }
}

/** Kontrolle, dass der Rahmen tatsächlich den Alpenraum umfasst. */
const PROBESTAEDTE = [
  ['München', 11.58, 48.14],
  ['Mailand', 9.19, 45.46],
  ['Lyon', 4.83, 45.76],
  ['Wien', 16.37, 48.21],
  ['Zürich', 8.54, 47.37],
  ['Turin', 7.69, 45.07],
  ['Ljubljana', 14.51, 46.06],
]

/**
 * Den Umriss nach aussen wachsen lassen.
 *
 * Die Ecken einzeln nach aussen zu schieben wäre kürzer gewesen, erzeugt an
 * einspringenden Stellen aber Schlaufen — und der Alpenbogen ist voller
 * einspringender Täler. Der Weg über ein Raster kann das nicht: was gefüllt
 * ist, ist gefüllt.
 *
 * Drei Schritte: die Fläche in ein Raster füllen, jede Zelle mit ihrem Abstand
 * zur Fläche versehen (exakte euklidische Distanztransformation nach
 * Felzenszwalb/Huttenlocher), dann die Kante des gewachsenen Bereichs ablaufen.
 */
function aufblasen(ring, wachstum) {
  const rand = wachstum + 4 * RASTER
  const minX = Math.min(...ring.map((p) => p[0])) - rand
  const maxX = Math.max(...ring.map((p) => p[0])) + rand
  const minY = Math.min(...ring.map((p) => p[1])) - rand
  const maxY = Math.max(...ring.map((p) => p[1])) + rand

  const breite = Math.ceil((maxX - minX) / RASTER) + 1
  const hoehe = Math.ceil((maxY - minY) / RASTER) + 1
  const zellX = (i) => minX + i * RASTER
  const zellY = (j) => minY + j * RASTER

  // --- 1. Füllen per Scanlinie: pro Rasterzeile die Schnittpunkte mit dem Ring.
  const innen = new Uint8Array(breite * hoehe)
  for (let j = 0; j < hoehe; j++) {
    const y = zellY(j)
    const schnitte = []
    for (let k = 1; k < ring.length; k++) {
      const [x1, y1] = ring[k - 1]
      const [x2, y2] = ring[k]
      if ((y1 > y) === (y2 > y)) continue
      schnitte.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
    }
    schnitte.sort((a, b) => a - b)
    for (let s = 0; s + 1 < schnitte.length; s += 2) {
      const von = Math.max(0, Math.ceil((schnitte[s] - minX) / RASTER))
      const bis = Math.min(breite - 1, Math.floor((schnitte[s + 1] - minX) / RASTER))
      for (let i = von; i <= bis; i++) innen[j * breite + i] = 1
    }
  }

  // --- 2. Abstand jeder Zelle zur gefüllten Fläche.
  const grenze = Math.pow(wachstum / RASTER, 2)
  const dist = distanzQuadrate(innen, breite, hoehe)
  const gross = new Uint8Array(breite * hoehe)
  for (let n = 0; n < gross.length; n++) gross[n] = dist[n] <= grenze ? 1 : 0

  // --- 3. Kante ablaufen (Moore-Nachbarschaft).
  const kante = randVerfolgen(gross, breite, hoehe)
  if (!kante) throw new Error('Kante des gewachsenen Umrisses nicht gefunden')
  const punkte = kante.map(([i, j]) => [zellX(i), zellY(j)])
  return closeRing(punkte)
}

/**
 * Exakte euklidische Distanztransformation in Zellen zum Quadrat.
 * Zwei Durchgänge über Spalten und Zeilen, je linear — Felzenszwalb/Huttenlocher.
 */
function distanzQuadrate(maske, breite, hoehe) {
  const UNENDLICH = 1e12
  const f = new Float64Array(Math.max(breite, hoehe))
  const d = new Float64Array(breite * hoehe)

  for (let n = 0; n < d.length; n++) d[n] = maske[n] ? 0 : UNENDLICH

  const spalte = new Float64Array(hoehe)
  for (let i = 0; i < breite; i++) {
    for (let j = 0; j < hoehe; j++) f[j] = d[j * breite + i]
    eindimensional(f, spalte, hoehe)
    for (let j = 0; j < hoehe; j++) d[j * breite + i] = spalte[j]
  }
  const zeile = new Float64Array(breite)
  for (let j = 0; j < hoehe; j++) {
    for (let i = 0; i < breite; i++) f[i] = d[j * breite + i]
    eindimensional(f, zeile, breite)
    for (let i = 0; i < breite; i++) d[j * breite + i] = zeile[i]
  }
  return d
}

/** Untere Einhüllende von Parabeln — der Kern der Distanztransformation. */
function eindimensional(f, aus, n) {
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  let k = 0
  v[0] = 0
  z[0] = -1e20
  z[1] = 1e20
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = 1e20
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    aus[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** Aussenkante einer Rastermaske ablaufen (Moore-Nachbarschaft, im Uhrzeigersinn). */
function randVerfolgen(maske, breite, hoehe) {
  const gefuellt = (i, j) => i >= 0 && j >= 0 && i < breite && j < hoehe && maske[j * breite + i] === 1

  let start = null
  for (let j = 0; j < hoehe && !start; j++) {
    for (let i = 0; i < breite; i++) {
      if (maske[j * breite + i]) { start = [i, j]; break }
    }
  }
  if (!start) return null

  const nachbarn = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const rand = [start]
  let [ci, cj] = start
  let richtung = 6
  // Grosszügige Obergrenze: der Umfang kann die Zellzahl nie überschreiten.
  const maxSchritte = breite * hoehe * 4

  for (let schritt = 0; schritt < maxSchritte; schritt++) {
    let gefunden = false
    for (let n = 0; n < 8; n++) {
      const r = (richtung + n) % 8
      const ni = ci + nachbarn[r][0]
      const nj = cj + nachbarn[r][1]
      if (!gefuellt(ni, nj)) continue
      ci = ni; cj = nj
      // Um zwei zurückdrehen: von dort aus weitersuchen, wo man herkam.
      richtung = (r + 6) % 8
      rand.push([ci, cj])
      gefunden = true
      break
    }
    if (!gefunden) break
    if (ci === start[0] && cj === start[1] && rand.length > 3) break
  }
  return rand
}

/** Ramer-Douglas-Peucker, iterativ statt rekursiv — 58 000 Punkte sprengen den Stack. */
function vereinfacheRing(punkte, toleranz) {
  if (punkte.length < 4) return punkte
  const behalten = new Uint8Array(punkte.length)
  behalten[0] = 1
  behalten[punkte.length - 1] = 1

  const stapel = [[0, punkte.length - 1]]
  while (stapel.length) {
    const [start, ende] = stapel.pop()
    let maxAbstand = 0
    let index = -1
    for (let i = start + 1; i < ende; i++) {
      const d = abstandZurGeraden(punkte[i], punkte[start], punkte[ende])
      if (d > maxAbstand) { maxAbstand = d; index = i }
    }
    if (maxAbstand > toleranz && index > 0) {
      behalten[index] = 1
      stapel.push([start, index], [index, ende])
    }
  }
  return punkte.filter((_, i) => behalten[i])
}

function abstandZurGeraden(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const laengeQ = dx * dx + dy * dy
  if (laengeQ === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / laengeQ))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Flächeninhalt in Quadratgrad — reicht, um Krümel von Hauptringen zu trennen. */
function ringFlaeche(ring) {
  let summe = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    summe += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(summe / 2)
}

/* ---------------- main ---------------- */

const GRUPPEN = {
  punkte: importPoints,
  gipfel: importPeaks,
  zonen: importProtectedAreas,
  natur: importNature,
  alpen: importAlpen,
}

const gewaehlt = process.argv.slice(2).filter((a) => a in GRUPPEN)
const laufen = gewaehlt.length ? gewaehlt : Object.keys(GRUPPEN)

console.log(`Import für Region ${REGION}: ${laufen.join(', ')} …`)
for (const name of laufen) await GRUPPEN[name]()
console.log('Fertig. Rechtliche Bewertung der Zonen: src/data/zones/*.legal.json pflegen.')
