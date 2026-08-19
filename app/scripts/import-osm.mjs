/**
 * Import-Skript für die KARTEN-/OSM-Schicht.
 *
 * Holt aus OpenStreetMap:
 *  - Punkte: Berghütten, Biwakhütten, Campingplätze  ->  src/data/points/<region>.json
 *  - Zonen:  Schutzgebiete (Rohgeometrie)            ->  src/data/zones/<region>.osm.json
 *
 * WICHTIG: Das liefert nur GEOMETRIE + Sachdaten aus OSM.
 * Die RECHTLICHE Bewertung (erlaubt/verboten/geduldet) ist NICHT in OSM enthalten
 * und muss in src/data/zones/<region>.legal.json manuell gepflegt werden.
 *
 * Aufruf:  npm run import:osm
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const REGION = process.env.REGION ?? 'CH-VS'
const ENDPOINT = 'https://overpass-api.de/api/interpreter'

const round = (n) => Math.round(n * 1e5) / 1e5

async function overpass(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass lehnt Requests ohne aussagekräftigen User-Agent mit 406 ab.
      'User-Agent': 'CampBuddy-Import/0.1 (https://github.com/jannis-drng/campbuddy)',
    },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`)
  return res.json()
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

/* ---------------- main ---------------- */

console.log(`Import für Region ${REGION} …`)
await importPoints()
await importProtectedAreas()
console.log('Fertig. Rechtliche Bewertung der Zonen: src/data/zones/*.legal.json pflegen.')
