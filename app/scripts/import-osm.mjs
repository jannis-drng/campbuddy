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
 * Wie grob der Umriss sein darf, in Grad.
 *
 * Roh sind es 58 000 Punkte — für eine Linie, die bei Zoom 5 bis 9 als
 * Kartenrand dient, ist das absurd genau und würde das Bundle unnötig
 * aufblähen. Rund 500 m Toleranz sieht man auf dieser Zoomstufe nicht.
 */
const ALPEN_TOLERANZ = 0.005

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
    .map((r) => vereinfacheRing(r, ALPEN_TOLERANZ))
    // Winzige Nebenringe tragen nichts zum Rahmen bei und kosten nur Bytes.
    .filter((r) => r.length >= 6 && ringFlaeche(r) > 0.01)
    .sort((a, b) => ringFlaeche(b) - ringFlaeche(a))

  if (ringe.length === 0) throw new Error('Kein brauchbarer Ring aus der Relation')

  const gerundet = ringe.map((r) => r.map(([x, y]) => [round(x), round(y)]))
  const alle = gerundet.flat()
  const bbox = [
    Math.min(...alle.map((p) => p[0])), Math.min(...alle.map((p) => p[1])),
    Math.max(...alle.map((p) => p[0])), Math.max(...alle.map((p) => p[1])),
  ].map(round)

  const inhalt = {
    quelle: 'OpenStreetMap',
    source_url: `https://www.openstreetmap.org/relation/${ALPEN_RELATION}`,
    lizenz: 'ODbL',
    bbox,
    geometry: { type: 'MultiPolygon', coordinates: gerundet.map((r) => [r]) },
  }

  const out = resolve(ROOT, 'src/map', 'alpen.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(inhalt) + '\n')
  const kb = Math.round(JSON.stringify(inhalt).length / 1024)
  const punkte = gerundet.reduce((s, r) => s + r.length, 0)
  console.log(`Alpen: ${ringe.length} Ring(e), ${rohPunkte} -> ${punkte} Punkte, ${kb} KB -> ${out}`)
  console.log(`   Umschliessend: ${bbox.join(', ')}`)
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
