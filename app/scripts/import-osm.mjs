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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const REGION = process.env.REGION ?? 'CH-VS'
const ENDPOINT = 'https://overpass-api.de/api/interpreter'

/**
 * Welche Regionen ins Bundle gebacken werden.
 *
 * Das Wallis bleibt drin: es ist die Sofortanzeige, die auch ohne Netz und ohne
 * Backend steht. Alles Grössere gehört nicht ins Bundle — die Schweiz als
 * Ganzes wäre zweistellig megabyteschwer und würde die Startseite ausbremsen,
 * für Daten, die die meisten Besucher nie brauchen. Solche Regionen landen
 * unter `import/` und von dort über eine Seed-Migration in die Datenbank.
 */
const BUNDLE_REGIONEN = new Set(['CH-VS'])
const IM_BUNDLE = BUNDLE_REGIONEN.has(REGION)
const AUSGABE = IM_BUNDLE ? resolve(ROOT, 'src/data') : resolve(ROOT, 'import', REGION)

/**
 * Ganze Länder tragen ISO3166-1, Kantone und Bundesländer ISO3166-2.
 * `admin_level=2` schliesst gleichnamige Gebiete unterhalb der Landesebene aus.
 */
const GEBIET = REGION.includes('-')
  ? `area["ISO3166-2"="${REGION}"]->.a;`
  : `area["ISO3166-1"="${REGION}"][admin_level=2]->.a;`

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
    ${GEBIET}
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

  const out = resolve(AUSGABE, 'points', `${REGION}.json`)
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
    ${GEBIET}
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

  const out = resolve(AUSGABE, 'peaks', `${REGION}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(peaks, null, 2) + '\n')
  console.log(`Gipfel: ${peaks.length} -> ${out}`)
  if (peaks.length > 0) console.log(`   höchster: ${peaks[0].name} (${peaks[0].elevation} m)`)
}

/* ---------------- Zonen: Schutzgebiete (Geometrie) ---------------- */

/**
 * Wie grob die Umrisse der Schutzgebiete sein dürfen, in Grad (~40 m).
 *
 * OSM liefert Schutzgebietsgrenzen metergenau. Für die Frage „liegt mein
 * Schlafplatz drin?" ist das eine Scheingenauigkeit: die Auskunft ist ohnehin
 * ein ungeprüfter Entwurf, und vor Ort entscheidet die Beschilderung. Über
 * eine ganze Landesfläche macht der Unterschied aber Megabytes aus, und ein
 * Megabyte, das über die Leitung muss, kostet echte Wartezeit im Funkloch.
 */
const ZONEN_TOLERANZ = 0.0004

/** Ramer-Douglas-Peucker, iterativ statt rekursiv — grosse Ringe sprengen den Stack. */
function vereinfacheRing(punkte, toleranz) {
  if (punkte.length < 5) return punkte
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

async function importProtectedAreas() {
  const q = `
    [out:json][timeout:300];
    ${GEBIET}
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
    coords = coords.map((ring) => vereinfacheRing(ring, ZONEN_TOLERANZ)).filter((r) => r.length > 3)
    if (coords.length === 0) continue

    features.push({
      type: 'Feature',
      id: `osm-${el.type}-${el.id}`,
      properties: {
        osm_id: `${el.type}/${el.id}`,
        name: t.name ?? t['name:de'] ?? '(unbenannt)',
        protect_class: t.protect_class ?? null,
        protection_title: t.protection_title ?? null,
        // Für die regelbasierte Ableitung der Rechtslage gebraucht.
        leisure: t.leisure ?? null,
        boundary: t.boundary ?? null,
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
  const out = resolve(AUSGABE, 'zones', `${REGION}.osm.json`)
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
      ${GEBIET}
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

  const out = resolve(AUSGABE, 'nature', `${REGION}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(features) + '\n')
  const kb = Math.round(JSON.stringify(features).length / 1024)
  console.log(`Natur: ${features.length} Objekte, ${kb} KB -> ${out}`)
}

/* ---------------- Rechtslage: konservativ ableiten ---------------- */

/**
 * Rechtliche Ersteinstufung aus den OSM-Merkmalen — und nur so weit, wie die
 * Merkmale tragen.
 *
 * Vierhundert Schutzgebiete lassen sich nicht einzeln recherchieren, und
 * Erfundenes ist in diesem Projekt tabu. Also wird nur dort etwas behauptet,
 * wo OpenStreetMap ein eindeutiges Signal liefert, und der Fehler geht immer
 * in die sichere Richtung: im Zweifel „verboten" statt „erlaubt". Eine Karte,
 * die zu Unrecht warnt, kostet einen Umweg; eine, die zu Unrecht erlaubt,
 * kostet eine Anzeige.
 *
 * Alles andere bleibt ohne Eintrag und erscheint dadurch als „ungeklärt" —
 * das ist eine Information, keine Lücke.
 *
 * Jeder abgeleitete Eintrag trägt `review_status: 'entwurf'`, kein Prüfdatum
 * und im Bedingungstext die Regel, aus der er stammt. Handgeschriebene
 * Einträge werden nie überschrieben.
 */
const STRENGE_SCHUTZKLASSEN = new Set(['1a', '1b', '2', '4'])

function ableitung(f) {
  const t = f.properties
  if (t.leisure === 'nature_reserve') {
    return {
      grund: 'als Naturschutzgebiet erfasst (leisure=nature_reserve)',
      folgerung: 'In Naturschutzgebieten ist Übernachten im Freien in der Schweiz in der Regel untersagt.',
    }
  }
  if (t.protect_class && STRENGE_SCHUTZKLASSEN.has(String(t.protect_class))) {
    return {
      grund: `als Schutzgebiet der Klasse ${t.protect_class} erfasst (IUCN-Kategorie)`,
      folgerung: 'Schutzgebiete dieser Klassen sind streng geschützt; Übernachten im Freien ist dort in der Regel untersagt.',
    }
  }
  return null
}

async function importRecht() {
  const quelle = resolve(AUSGABE, 'zones', `${REGION}.osm.json`)
  if (!existsSync(quelle)) {
    throw new Error(`${quelle} fehlt — erst 'zonen' importieren.`)
  }
  const geo = JSON.parse(readFileSync(quelle, 'utf8'))

  const ziel = resolve(AUSGABE, 'zones', `${REGION}.legal.json`)
  const bestand = existsSync(ziel) ? JSON.parse(readFileSync(ziel, 'utf8')).zones ?? {} : {}

  let neu = 0
  let behalten = 0
  let ungeklaert = 0

  for (const f of geo.features) {
    if (bestand[f.id]) { behalten++; continue }
    const ab = ableitung(f)
    if (!ab) { ungeklaert++; continue }
    bestand[f.id] = {
      status: 'forbidden',
      tent_allowed: 'no',
      vehicle_allowed: 'no',
      fire_allowed: 'no',
      conditions: `Aus OpenStreetMap abgeleitet: ${ab.grund}. ${ab.folgerung}`,
      notes: 'Regelbasiert abgeleitet, nicht einzeln recherchiert und nicht amtlich geprüft. Beschilderung vor Ort und Auskunft der Gemeinde gehen dieser Einstufung vor.',
      review_status: 'entwurf',
      last_verified: null,
    }
    neu++
  }

  mkdirSync(dirname(ziel), { recursive: true })
  writeFileSync(ziel, JSON.stringify({ zones: bestand }, null, 2) + '\n')
  console.log(`Rechtslage: ${neu} abgeleitet, ${behalten} bestehende unverändert, ${ungeklaert} bleiben ungeklärt -> ${ziel}`)
}

/* ---------------- Alpen: umschliessendes Rechteck ---------------- */

/**
 * Wie weit die Karte reicht — als Rechteck, nicht als Umriss.
 *
 * Gebraucht wird nur die umschliessende Box: die Karte selbst wird nirgends
 * beschnitten, sie lässt sich bloss nicht beliebig weit von den Alpen
 * wegschieben. Der Puffer ringsum steht in `src/map/alpenRahmen.ts`, weil er
 * eine Gestaltungsfrage ist und keine Eigenschaft der OSM-Daten.
 *
 * Die Datei liegt unter `src/map/` und nicht bei den Legalitäts-Daten: sie
 * behauptet nichts über Recht, sie beschreibt nur, wohin man scrollen kann.
 *
 * OSM-Relation 2698607, `natural=mountain_range`, Wikidata Q1286.
 */
const ALPEN_RELATION = 2698607

async function importAlpen() {
  const data = await overpass(`
    [out:json][timeout:300];
    relation(${ALPEN_RELATION});
    out geom;`)

  const rel = data.elements.find((e) => e.type === 'relation')
  if (!rel) throw new Error('Alpen-Relation nicht gefunden')

  const punkte = (rel.members ?? [])
    .filter((m) => m.role === 'outer' && m.geometry)
    .flatMap((m) => m.geometry)
  if (punkte.length === 0) throw new Error('Relation ohne Geometrie')

  const bbox = [
    Math.min(...punkte.map((p) => p.lon)), Math.min(...punkte.map((p) => p.lat)),
    Math.max(...punkte.map((p) => p.lon)), Math.max(...punkte.map((p) => p.lat)),
  ].map(round)

  const inhalt = {
    quelle: 'OpenStreetMap',
    source_url: `https://www.openstreetmap.org/relation/${ALPEN_RELATION}`,
    lizenz: 'ODbL',
    hinweis: 'Umschliessendes Rechteck des Alpenbogens — begrenzt den Kartenausschnitt, ist aber keine Gebietsgrenze.',
    bbox,
  }

  const out = resolve(ROOT, 'src/map', 'alpen.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(inhalt, null, 2) + '\n')
  console.log(`Alpen: ${punkte.length} Punkte ausgewertet -> ${out}`)
  console.log(`   Umschliessend: ${bbox.join(', ')}`)
}

/* ---------------- main ---------------- */

const GRUPPEN = {
  punkte: importPoints,
  gipfel: importPeaks,
  zonen: importProtectedAreas,
  natur: importNature,
  recht: importRecht,
  alpen: importAlpen,
}

const gewaehlt = process.argv.slice(2).filter((a) => a in GRUPPEN)
const laufen = gewaehlt.length ? gewaehlt : Object.keys(GRUPPEN)

console.log(`Import für Region ${REGION}: ${laufen.join(', ')} …`)
for (const name of laufen) await GRUPPEN[name]()
console.log('Fertig. Rechtliche Bewertung der Zonen: src/data/zones/*.legal.json pflegen.')
