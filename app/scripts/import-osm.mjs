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
/**
 * Overpass-Server, in dieser Reihenfolge.
 *
 * Der Hauptserver ist ein Gemeinschaftsangebot und unter Last knausrig — bei
 * landesweiten Abfragen bricht er die Verbindung ab, statt einen Fehler zu
 * schicken. Die Spiegel sind unabhängig betrieben und bringen dieselben Daten;
 * fällt einer aus, wird der nächste genommen, statt aufzugeben.
 */
const ENDPOINTS = [
  // Zuerst die Instanz der Schweizer OSM-Community: näher an den Daten, die
  // dieses Projekt braucht, und spürbar entspannter als die grossen Spiegel.
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

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
async function overpass(query, runden = 3) {
  let letzterFehler
  for (let runde = 1; runde <= runden; runde++) {
    for (const endpoint of ENDPOINTS) {
      try {
        return await overpassEinmal(query, endpoint)
      } catch (e) {
        letzterFehler = e
        const name = new URL(endpoint).host
        console.log(`\n   ${name}: ${e.message} — nächster Server …`)
      }
    }
    // Alle Server durch: einmal Luft holen, bevor es von vorn losgeht.
    const pause = runde * 30
    console.log(`   Alle Server abgelehnt (Runde ${runde}/${runden}), warte ${pause}s …`)
    await new Promise((r) => setTimeout(r, pause * 1000))
  }
  throw letzterFehler
}

async function overpassEinmal(query, endpoint) {
  const res = await fetch(endpoint, {
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

/**
 * Was als Schutzgebiet geholt wird.
 *
 * Vorher waren es nur `nature_reserve` und `protected_area` *mit Namen*. Das
 * hat zwei Dinge verschluckt, die für diese Karte besonders zählen:
 * eidgenössische Jagdbanngebiete und Wildruhezonen sind in OSM oft ohne
 * `name`, aber mit `protection_title` erfasst — und gerade dort ist Übernachten
 * das Problem, weil der Schutzzweck die Ruhe des Wildes ist. Nationalpark und
 * die Moor- und Auen-Inventare des Bundes fehlten ebenfalls.
 *
 * Namenlose Flächen bekommen ihren Schutztitel als Anzeigenamen: „Wildruhezone"
 * ist eine brauchbare Auskunft, „(unbenannt)" nicht.
 */
const SCHUTZ_SELEKTOREN = [
  '["boundary"="protected_area"]',
  '["leisure"="nature_reserve"]',
  '["boundary"="national_park"]',
]

async function importProtectedAreas() {
  const out = resolve(AUSGABE, 'zones', `${REGION}.osm.json`)

  /**
   * Dieselbe Mechanik wie beim Natur-Import: kachelweise, wiederaufnehmbar.
   *
   * Die erweiterte Abfrage — Jagdbanngebiete, Wildruhezonen, Moore, Nationalpark
   * — ist deutlich schwerer als die alte, und die öffentlichen Overpass-Server
   * lehnen sie landesweit am Stück ab. Neun kleine Abfragen kommen durch; was
   * eine Kachel liefert, bleibt auch dann erhalten, wenn die nächste scheitert.
   */
  const gefunden = new Map()
  if (existsSync(out)) {
    const alt = JSON.parse(readFileSync(out, 'utf8'))
    for (const f of alt.features ?? []) gefunden.set(f.id, f)
    console.log(`   ${gefunden.size} Flächen aus früherem Lauf übernommen`)
  }

  const sichern = () => {
    const features = [...gefunden.values()]
      .sort((x, y) => x.properties.name.localeCompare(y.properties.name, 'de'))
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }) + '\n')
    return features
  }

  const felder = kacheln(REGION)
  const luecken = []

  for (const [index, kachel] of felder.entries()) {
    const box = kachel ? `(${kachel.join(',')})` : ''
    const q = `
      [out:json][timeout:300];
      ${GEBIET}
      (
        ${SCHUTZ_SELEKTOREN.flatMap((sel) => [
          `relation${sel}(area.a)${box};`,
          `way${sel}(area.a)${box};`,
        ]).join('\n        ')}
      );
      out geom;`

    let data
    try {
      data = await overpass(q)
    } catch (e) {
      luecken.push(`Kachel ${index + 1}`)
      console.log(`\n   Kachel ${index + 1} übersprungen (${e.message})`)
      continue
    }

    let neuInKachel = 0
    for (const el of data.elements) {
      try {
      const id = `osm-${el.type}-${el.id}`
      // Eine Fläche kann an mehrere Kacheln grenzen; Overpass liefert sie dann
      // mehrfach, jedes Mal vollständig.
      if (gefunden.has(id)) continue
      const t = el.tags ?? {}
      let coords = null

      // Overpass setzt Platzhalter ohne Koordinaten, wo ein Knoten ausserhalb
      // des abgefragten Ausschnitts liegt — bei kachelweisen Abfragen also an
      // jeder Kachelkante. Unbehandelt reisst das den ganzen Lauf ab.
      const punkte = (g) => g.filter((p) => p && p.lon != null && p.lat != null)
        .map((p) => [round(p.lon), round(p.lat)])

      if (el.type === 'way' && el.geometry) {
        const ring = punkte(el.geometry)
        if (ring.length > 3) coords = [closeRing(ring)]
      } else if (el.type === 'relation' && el.members) {
        const outers = el.members
          .filter((m) => m.role === 'outer' && m.geometry)
          .map((m) => punkte(m.geometry))
          .filter((g) => g.length > 1)
        const merged = mergeRings(outers).filter((r) => r.length > 3)
        if (merged.length) coords = merged.map(closeRing)
      }
      if (!coords) continue
      coords = coords.map((ring) => vereinfacheRing(ring, ZONEN_TOLERANZ)).filter((r) => r.length > 3)
      if (coords.length === 0) continue

      gefunden.set(id, {
        type: 'Feature',
        id,
        properties: {
          osm_id: `${el.type}/${el.id}`,
          name: t.name ?? t['name:de'] ?? t.protection_title ?? '(unbenannt)',
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
      neuInKachel++
      } catch (e) {
        // Eine kaputte Fläche ist eine Fläche weniger, kein Grund, den Lauf
        // abzubrechen. Sie wird genannt, damit sie nicht lautlos verschwindet.
        console.log(`\n   ${el.type}/${el.id} übersprungen: ${e.message}`)
      }
    }

    console.log(`   Kachel ${index + 1}/${felder.length}: +${neuInKachel} (insgesamt ${gefunden.size})`)
    sichern()
    if (felder.length > 1) await new Promise((r) => setTimeout(r, 1500))
  }

  const features = sichern()
  const kb = Math.round(JSON.stringify(features).length / 1024)
  console.log(`Schutzgebiete: ${features.length} Flächen, ${kb} KB -> ${out}`)
  if (luecken.length > 0) {
    console.log(`   ${luecken.length} Lücke(n): ${luecken.join(', ')} — erneut laufen lassen.`)
  }
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

/**
 * Umschliessende Rechtecke der Regionen, für die kachelweise importiert wird.
 *
 * Spiegelt `bounds` aus src/data/regions.ts. Die Dopplung ist unschön, aber das
 * Skript ist reines Node und liest kein TypeScript; ein grober Kasten, der sich
 * nur mit einer neuen Region ändert, ist der billigere Preis als ein Übersetzer
 * nur für diesen Zweck. Fehlt ein Eintrag, läuft der Import in einem Stück.
 */
const REGION_BBOX = {
  CH: [5.96, 45.82, 10.49, 47.81],
}

/** In wie viele Spalten und Zeilen ein Gebiet zerlegt wird. */
const KACHELN = 3

/**
 * Ein Gebiet in Kacheln zerlegen.
 *
 * Landesweit ist allein Trinkwasser fünfstellig; die öffentliche
 * Overpass-Instanz bricht solche Antworten mit einem Verbindungsabbruch ab.
 * Neun kleine Abfragen kommen durch, wo eine grosse scheitert — und sie
 * belasten einen Gemeinschaftsserver auch weniger.
 */
function kacheln(region) {
  const box = REGION_BBOX[region]
  if (!box) return [null]
  const [west, sued, ost, nord] = box
  const dx = (ost - west) / KACHELN
  const dy = (nord - sued) / KACHELN
  const liste = []
  for (let i = 0; i < KACHELN; i++) {
    for (let j = 0; j < KACHELN; j++) {
      liste.push([sued + j * dy, west + i * dx, sued + (j + 1) * dy, west + (i + 1) * dx])
    }
  }
  return liste
}

async function importNature() {
  const out = resolve(AUSGABE, 'nature', `${REGION}.json`)

  /**
   * Was schon da ist, bleibt.
   *
   * Der Lauf besteht aus Dutzenden Abfragen an einen Gemeinschaftsserver, und
   * der antwortet unter Last auch mal mit 502. Früher warf ein einziger
   * Fehlschlag alles Bisherige weg — nach zwanzig Minuten stand man wieder bei
   * null. Jetzt wird nach jeder Gattung gespeichert und beim nächsten Lauf
   * darauf aufgebaut; fehlende Kacheln füllen sich über mehrere Anläufe.
   */
  const gefunden = new Map()
  if (existsSync(out)) {
    for (const eintrag of JSON.parse(readFileSync(out, 'utf8'))) gefunden.set(eintrag.id, eintrag)
    console.log(`   ${gefunden.size} Objekte aus früherem Lauf übernommen`)
  }

  const sichern = () => {
    const liste = [...gefunden.values()]
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'de'))
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(liste) + '\n')
    return liste
  }

  const felder = kacheln(REGION)
  /** Kacheln, die nicht durchkamen — beim nächsten Lauf erneut versucht. */
  const luecken = []

  for (const [type, ...selektoren] of NATURE_QUERIES) {
    let vorher = gefunden.size
    for (const [index, kachel] of felder.entries()) {
      // Der Gebietsfilter bleibt: die Kachel schneidet nur zu, sie ersetzt
      // nicht die Landesgrenze.
      const box = kachel ? `(${kachel.join(',')})` : ''
      const q = `
        [out:json][timeout:180];
        ${GEBIET}
        (
          ${selektoren.map((sel) => `${sel}(area.a)${box};`).join('\n          ')}
        );
        out center tags;`
      let data
      try {
        data = await overpass(q)
      } catch (e) {
        // Eine Kachel, die nicht kommt, ist ein Loch — kein Grund, die
        // achtunddreissig anderen wegzuwerfen. Sie wird gemerkt und beim
        // nächsten Lauf erneut versucht.
        luecken.push(`${type} Kachel ${index + 1}`)
        console.log(`\n   ${type}: Kachel ${index + 1} übersprungen (${e.message})`)
        continue
      }

      for (const el of data.elements) {
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        if (lat == null || lng == null) continue
        const t = el.tags ?? {}
        // Trinkwasser, das ausdrücklich als nicht trinkbar getaggt ist, wäre
        // eine gefährliche Auskunft — lieber gar nicht zeigen.
        if (type === 'drinking_water' && t.drinking_water === 'no') continue
        const id = `osm-${el.type}-${el.id}`
        // Kacheln überschneiden sich an den Rändern nicht, Relationen können
        // aber in zwei Antworten auftauchen.
        if (gefunden.has(id)) continue
        gefunden.set(id, {
          id,
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
      if (felder.length > 1) {
        process.stdout.write(`\r   ${type}: Kachel ${index + 1}/${felder.length}, ${gefunden.size - vorher} gefunden   `)
        // Der Gemeinschaftsserver soll Luft holen können.
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
    if (felder.length > 1) process.stdout.write('\n')
    console.log(`   ${type}: +${gefunden.size - vorher}`)
    vorher = gefunden.size
    // Nach jeder Gattung sichern: der nächste Ausfall kostet dann höchstens
    // eine Gattung, nicht den ganzen Lauf.
    sichern()
  }

  const features = sichern()
  const kb = Math.round(JSON.stringify(features).length / 1024)
  console.log(`Natur: ${features.length} Objekte, ${kb} KB -> ${out}`)
  if (luecken.length > 0) {
    console.log(`   ${luecken.length} Lücke(n): ${luecken.join(', ')}`)
    console.log('   Erneut laufen lassen — Vorhandenes bleibt, es wird nur ergänzt.')
  }
}

/* ---------------- BAFU: die amtlichen Inventare ---------------- */

/**
 * Wildruhezonen und eidgenössische Jagdbanngebiete vom Bund.
 *
 * Das ist der Unterschied zwischen Abschrift und Quelle. In OpenStreetMap
 * finden sich für die ganze Schweiz vier Wildruhezonen und kein einziges
 * benanntes Jagdbanngebiet — beim BAFU liegen beide Inventare vollständig,
 * mit Schutzzeit, Bestimmung, Rechtsgrundlage und Beschlussjahr.
 *
 * Diese Zonen sind deshalb die ersten in diesem Projekt, die nicht 'entwurf'
 * sind: sie tragen `review_status: 'quelle'`, weil hinter jeder eine benannte
 * amtliche Quelle steht. Geprüft im Sinne von „selbst vor Ort nachgesehen"
 * sind sie damit immer noch nicht.
 *
 * Lizenz: opendata.swiss „Open use. Must provide the source." — freie Nutzung
 * mit Quellenangabe. Die steht an jeder einzelnen Zone.
 */
const BAFU_BASIS = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify'
const BAFU_QUELLE = 'https://opendata.swiss/de/terms-of-use'
/** Die Schnittstelle gibt höchstens 50 Objekte pro Aufruf heraus. */
const BAFU_SEITE = 50

async function bafuSeiten(layer, kachel) {
  const [sued, west, nord, ost] = kachel
  const gefunden = []
  for (let offset = 0; ; offset += BAFU_SEITE) {
    const url = `${BAFU_BASIS}?geometry=${west},${sued},${ost},${nord}`
      + '&geometryType=esriGeometryEnvelope'
      + `&imageDisplay=100,100,96&mapExtent=${west},${sued},${ost},${nord}&tolerance=0`
      + `&layers=all:${layer}&returnGeometry=true&sr=4326&geometryFormat=geojson`
      + `&limit=${BAFU_SEITE}&offset=${offset}`
    const res = await fetch(url, { headers: { 'User-Agent': 'CampBuddy-Import/0.1' } })
    if (!res.ok) throw new Error(`geo.admin.ch ${res.status}`)
    const seite = (await res.json()).results ?? []
    gefunden.push(...seite)
    if (seite.length < BAFU_SEITE) return gefunden
    // Ein Bundesdienst, kein Selbstbedienungsladen.
    await new Promise((r) => setTimeout(r, 400))
  }
}

/**
 * Geometrie eines BAFU-Objekts auf Ringe herunterbrechen und vereinfachen.
 *
 * Auf `type` allein ist kein Verlass: im Bestand stecken vereinzelt Objekte,
 * deren Verschachtelung nicht zum angegebenen Typ passt. Deshalb wird die
 * Tiefe gemessen statt geglaubt — und alles, was keine Fläche ist, sauber
 * ausgelassen statt den Lauf abzubrechen.
 */
function bafuGeometrie(geometry) {
  if (!geometry?.coordinates) return null

  const tiefe = (a) => (Array.isArray(a) ? 1 + tiefe(a[0]) : 0)
  const t = tiefe(geometry.coordinates)
  let ringe
  if (t === 4) ringe = geometry.coordinates.flat()        // MultiPolygon
  else if (t === 3) ringe = geometry.coordinates          // Polygon
  else return null                                        // Punkt, Linie, Unfug

  const vereinfacht = ringe
    .filter((r) => Array.isArray(r) && r.length > 3 && Array.isArray(r[0]))
    .map((r) => vereinfacheRing(
      r.filter((pt) => Array.isArray(pt) && pt.length >= 2)
        .map(([x, y]) => [round(x), round(y)]),
      ZONEN_TOLERANZ,
    ))
    .filter((r) => r.length > 3)

  if (vereinfacht.length === 0) return null
  return vereinfacht.length === 1
    ? { type: 'Polygon', coordinates: vereinfacht }
    : { type: 'MultiPolygon', coordinates: vereinfacht.map((r) => [r]) }
}

async function importBafu() {
  const zonen = []
  const recht = {}
  const heute = new Date().toISOString().slice(0, 10)

  /* ---- Eidgenössische Jagdbanngebiete ---- */
  const jagd = []
  for (const kachel of kacheln(REGION)) {
    jagd.push(...await bafuSeiten('ch.bafu.bundesinventare-jagdbanngebiete', kachel))
  }
  const jagdEindeutig = new Map(jagd.map((f) => [f.featureId ?? f.id, f]))
  let wildschaden = 0

  for (const f of jagdEindeutig.values()) {
    const p = f.properties ?? {}
    // Ein Wildschadenperimeter regelt, wer für Wildschäden aufkommt — er sagt
    // nichts über Zutritt oder Übernachten. Ihn als Verbotszone zu zeigen wäre
    // schlicht falsch.
    if (/wildschaden/i.test(p.typ_de ?? '')) { wildschaden++; continue }
    const geometry = bafuGeometrie(f.geometry)
    if (!geometry) continue

    const integral = /integral/i.test(p.typ_de ?? '')
    const id = `bafu-jagdbann-${p.objektnummer ?? f.featureId}`
    zonen.push({
      type: 'Feature',
      id,
      properties: {
        name: `Jagdbanngebiet ${p.gebietsname ?? p.objektnummer}`,
        source: 'BAFU — Bundesinventar der eidgenössischen Jagdbanngebiete',
        source_url: p.refobjblatt ?? 'https://www.bafu.admin.ch/jagdbanngebiete',
      },
      geometry,
    })
    recht[id] = {
      status: 'forbidden',
      tent_allowed: 'no',
      vehicle_allowed: 'no',
      fire_allowed: 'no',
      conditions: `Eidgenössisches Jagdbanngebiet (${p.typ_de}), Objekt Nr. ${p.objektnummer}`
        + `${p.flaeche_ha ? `, ${Math.round(p.flaeche_ha)} ha` : ''}. `
        + (integral
          ? 'Integrale Schutzbestimmungen — der Schutz gilt uneingeschränkt.'
          : 'Partielle Schutzbestimmungen — welche im Einzelnen gelten, steht im Objektblatt.')
        + ' Diese Gebiete schützen Wild vor Störung (VEJ, SR 922.31); Übernachten im Gelände ist damit unvereinbar.',
      notes: 'Amtliches Bundesinventar. Nicht selbst vor Ort geprüft; die genauen Bestimmungen stehen im verlinkten Objektblatt.',
      review_status: 'quelle',
      last_verified: heute,
    }
  }
  console.log(`   Jagdbanngebiete: ${zonen.length} übernommen, ${wildschaden} Wildschadenperimeter ausgelassen`)

  /* ---- Wildruhezonen ---- */
  const wrz = []
  for (const kachel of kacheln(REGION)) {
    wrz.push(...await bafuSeiten('ch.bafu.wrz-wildruhezonen_portal', kachel))
  }
  const wrzEindeutig = new Map(wrz.map((f) => [f.featureId ?? f.id, f]))
  const vorher = zonen.length

  for (const f of wrzEindeutig.values()) {
    const p = f.properties ?? {}
    const geometry = bafuGeometrie(f.geometry)
    if (!geometry) continue

    const id = `bafu-wrz-${f.featureId ?? f.id}`
    const verbindlich = /rechtsverbindlich/i.test(p.schutzs_de ?? '')
    const zutrittsverbot = /zutritt/i.test(p.best_de ?? '')
    const zeit = (p.schutzzeit ?? '').trim()

    zonen.push({
      type: 'Feature',
      id,
      properties: {
        name: p.wrz_name ?? 'Wildruhezone',
        source: 'BAFU / Kantone — Wildruhezonen',
        source_url: 'https://www.wildruhezonen.ch/',
      },
      geometry,
    })
    recht[id] = {
      // Nur rechtsverbindliche Zonen mit Zutrittsverbot sind ein Verbot. Der
      // Rest ist eine dringende Bitte — und wird auch so benannt, statt zur
      // Sicherheit alles zu verbieten. Wer ständig zu Unrecht gewarnt wird,
      // hört irgendwann auf hinzusehen.
      status: verbindlich && zutrittsverbot ? 'forbidden' : 'tolerated',
      tent_allowed: verbindlich && zutrittsverbot ? 'no' : 'conditional',
      vehicle_allowed: 'no',
      fire_allowed: 'no',
      conditions: [
        p.best_de ? `Bestimmung: ${p.best_de}.` : null,
        p.schutzs_de ? `Status: ${p.schutzs_de}.` : null,
        zeit && zeit !== '-' ? `Schutzzeit: ${zeit}.` : 'Ganzjährig.',
        p.grundlage ? `Grundlage: ${p.grundlage}` : null,
        p.beschlussjahr ? `(${p.beschlussjahr}).` : null,
      ].filter(Boolean).join(' '),
      notes: 'Wildruhezonen schützen Wild in der Zeit, in der Störung tödlich sein kann. '
        + 'Ausserhalb der Schutzzeit gelten die Bestimmungen oft nicht — die Zeit steht oben.',
      review_status: 'quelle',
      last_verified: heute,
    }
  }
  console.log(`   Wildruhezonen: ${zonen.length - vorher}`)

  const ausZonen = resolve(AUSGABE, 'zones', `${REGION}.bafu.json`)
  const ausRecht = resolve(AUSGABE, 'zones', `${REGION}.bafu.legal.json`)
  mkdirSync(dirname(ausZonen), { recursive: true })
  writeFileSync(ausZonen, JSON.stringify({ type: 'FeatureCollection', features: zonen }) + '\n')
  writeFileSync(ausRecht, JSON.stringify({ lizenz: BAFU_QUELLE, zones: recht }, null, 2) + '\n')
  const kb = Math.round(JSON.stringify(zonen).length / 1024)
  console.log(`BAFU: ${zonen.length} Zonen, ${kb} KB -> ${ausZonen}`)
}

/* ---------------- Kantone: wer hier zuständig ist ---------------- */

/**
 * Die Kantonsgrenzen.
 *
 * Ausserhalb eingezeichneter Schutzgebiete gilt kantonales und kommunales
 * Recht — und das ist in der Schweiz der eigentliche Punkt: was im Wallis
 * oberhalb der Waldgrenze geduldet wird, ist anderswo ausdrücklich verboten.
 * Eine landesweite Auskunft ist dort bestenfalls unscharf.
 *
 * Mit dieser Ebene kann die Karte wenigstens sagen, *wer* zuständig ist, statt
 * pauschal zu antworten. Was in dem Kanton gilt, ist damit noch nicht bekannt:
 * das steht in `kantone.legal.json` und ist Handarbeit mit Quelle und Datum.
 *
 * Grob vereinfacht (~150 m): die Grenze dient der Zuordnung, nicht der
 * Vermessung. Wer davon abhängt, auf welcher Seite eines 150-m-Streifens er
 * steht, hat ohnehin ein Problem, das diese Karte nicht löst.
 */
const KANTON_TOLERANZ = 0.0015

async function importKantone() {
  const data = await overpass(`
    [out:json][timeout:300];
    ${GEBIET}
    relation["admin_level"="4"]["boundary"="administrative"](area.a);
    out geom;`)

  const features = []
  for (const el of data.elements) {
    const t = el.tags ?? {}
    if (!el.members) continue
    // Overpass setzt in `geometry` Platzhalter ohne Koordinaten, wenn ein Knoten
    // ausserhalb des abgefragten Gebiets liegt — bei Landesgrenzen also
    // regelmässig. Sie müssen raus, sonst zerfällt der Ring an dieser Stelle.
    const outers = el.members
      .filter((m) => m.role === 'outer' && m.geometry)
      .map((m) => m.geometry.filter((p) => p && p.lon != null && p.lat != null))
      .filter((g) => g.length > 1)
      .map((g) => g.map((p) => [round(p.lon), round(p.lat)]))
    const ringe = mergeRings(outers)
      .filter((r) => r.length > 3)
      .map(closeRing)
      .map((r) => vereinfacheRing(r, KANTON_TOLERANZ))
      .filter((r) => r.length > 3)
    if (ringe.length === 0) continue

    const code = t['ISO3166-2'] ?? null
    // Der Gebietsfilter zieht Nachbarregionen mit herein, sobald sie die Schweiz
    // berühren — die Lombardei etwa über die Enklave Campione. Eine falsche
    // Zuständigkeit an der Grenze wäre schlimmer als gar keine.
    if (REGION.length === 2 && code && !code.startsWith(`${REGION}-`)) continue

    features.push({
      type: 'Feature',
      id: `osm-relation-${el.id}`,
      properties: {
        // ISO-Code wie 'CH-BE' — der Schlüssel, unter dem die Rechtspflege liegt.
        code,
        name: t['name:de'] ?? t.name ?? '(unbenannt)',
        source_url: `https://www.openstreetmap.org/relation/${el.id}`,
      },
      geometry: ringe.length === 1
        ? { type: 'Polygon', coordinates: ringe }
        : { type: 'MultiPolygon', coordinates: ringe.map((r) => [r]) },
    })
  }

  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))

  const fc = { type: 'FeatureCollection', features }
  // Immer ins Bundle, unabhängig von BUNDLE_REGIONEN: 26 grob vereinfachte
  // Flächen sind klein, ändern sich praktisch nie, und die Zuordnung „welcher
  // Kanton ist hier zuständig" muss sofort da sein — auch ohne Netz.
  const out = resolve(ROOT, 'src/data/kantone', `${REGION}.json`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(fc) + '\n')
  const kb = Math.round(JSON.stringify(fc).length / 1024)
  console.log(`Kantone: ${features.length} Flächen, ${kb} KB -> ${out}`)
  const ohneCode = features.filter((f) => !f.properties.code)
  if (ohneCode.length > 0) {
    console.log(`   ohne ISO-Code: ${ohneCode.map((f) => f.properties.name).join(', ')}`)
  }
}

/* ---------------- Gemeinden ---------------- */

/**
 * Die Gemeindegrenzen — die Ebene, auf der die Frage tatsächlich entschieden wird.
 *
 * Bisher konnte die Karte ausserhalb der Schutzgebiete nur sagen, welcher
 * *Kanton* zuständig ist. Das ist zu grob: in der Schweiz regelt das Campieren
 * überwiegend die Gemeinde — über Polizeireglement, Nutzungsplanung oder
 * schlicht ein Verbot am Seeufer. Zwei Nachbargemeinden im selben Kanton können
 * es gegensätzlich halten. Eine kantonale Auskunft ist deshalb im Zweifel eine
 * falsche Auskunft.
 *
 * Geholt wird nur die Geometrie plus das, was die Gemeinde erreichbar macht:
 * BFS-Nummer (der stabile amtliche Schlüssel, unter dem die Rechtspflege liegt),
 * Webseite und E-Mail. Die Regeln selbst stehen nirgends maschinenlesbar — sie
 * werden von Hand in `gemeinden.legal.json` gepflegt, mit Quelle und Prüfdatum.
 * Genau deshalb trägt die Karte den Kontakt gleich mit: solange eine Gemeinde
 * ungeprüft ist, ist „frag hier nach" die einzige ehrliche Antwort, die wir
 * geben können — und sie soll wenigstens einen Klick weit weg sein.
 */
const GEMEINDE_TOLERANZ = 0.0006

async function importGemeinden() {
  const data = await overpass(`
    [out:json][timeout:600];
    ${GEBIET}
    relation["admin_level"="8"]["boundary"="administrative"](area.a);
    out geom;`)

  // Für die Zuordnung „welcher Kanton" — die Kantonsflächen liegen schon vor.
  const kantonePfad = resolve(ROOT, 'src/data/kantone', `${REGION}.json`)
  if (!existsSync(kantonePfad)) {
    throw new Error(`${kantonePfad} fehlt — erst 'kantone' importieren.`)
  }
  const kantone = JSON.parse(readFileSync(kantonePfad, 'utf8')).features

  const webseiten = await gemeindeWebseiten()
  console.log(`   Wikidata: ${webseiten.size} Gemeindewebseiten`)

  const features = []
  for (const el of data.elements) {
    const t = el.tags ?? {}
    if (!el.members) continue
    const outers = el.members
      .filter((m) => m.role === 'outer' && m.geometry)
      .map((m) => m.geometry.filter((p) => p && p.lon != null && p.lat != null))
      .filter((g) => g.length > 1)
      .map((g) => g.map((p) => [round(p.lon), round(p.lat)]))
    const ringe = mergeRings(outers)
      .filter((r) => r.length > 3)
      .map(closeRing)
      .map((r) => vereinfacheRing(r, GEMEINDE_TOLERANZ))
      .filter((r) => r.length > 3)
    if (ringe.length === 0) continue

    // Die BFS-Nummer ist der amtliche Schlüssel und überlebt Umbenennungen und
    // Fusionen sauberer als der Name. Ohne sie gibt es keinen stabilen Haken für
    // die Rechtspflege — dann lieber die OSM-Relation als Notschlüssel.
    const bfs = t['swisstopo:BFS_NUMMER'] ?? t['ref:BFS'] ?? null

    const geometry = ringe.length === 1
      ? { type: 'Polygon', coordinates: ringe }
      : { type: 'MultiPolygon', coordinates: ringe.map((r) => [r]) }

    const mittel = schwerpunkt(ringe[0])
    const kanton = kantone.find((k) => punktInGeometrie(mittel, k.geometry))
    // Der Gebietsfilter zieht Grenzgemeinden jenseits der Landesgrenze mit
    // herein. Ohne Kanton ist die Fläche für diese Karte wertlos — und eine
    // deutsche Gemeinde als Schweizer Zuständigkeit auszuweisen wäre falsch.
    if (!kanton) continue

    features.push({
      type: 'Feature',
      id: bfs ? `bfs-${bfs}` : `osm-relation-${el.id}`,
      properties: {
        bfs: bfs ? Number(bfs) : null,
        name: t['name:de'] ?? t.name ?? '(unbenannt)',
        kanton: kanton.properties.code,
        // OSM zuerst — dort steht die Adresse, wenn jemand sie vor Ort gepflegt
        // hat; Wikidata füllt den grossen Rest auf.
        website: t.website ?? t['contact:website'] ?? (bfs ? webseiten.get(Number(bfs)) ?? null : null),
        email: t.email ?? t['contact:email'] ?? null,
        source_url: `https://www.openstreetmap.org/relation/${el.id}`,
      },
      geometry,
    })
  }

  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))

  const schreibe = (pfad, liste) => {
    const fc = { type: 'FeatureCollection', features: liste }
    mkdirSync(dirname(pfad), { recursive: true })
    writeFileSync(pfad, JSON.stringify(fc) + '\n')
    return Math.round(JSON.stringify(fc).length / 1024)
  }

  const voll = resolve(AUSGABE, 'gemeinden', `${REGION}.json`)
  const kb = schreibe(voll, features)
  const ohneBfs = features.filter((f) => f.properties.bfs == null).length
  const mitKontakt = features.filter((f) => f.properties.website || f.properties.email).length
  console.log(`Gemeinden: ${features.length} Flächen, ${kb} KB -> ${voll}`)
  console.log(`   ohne BFS-Nummer: ${ohneBfs} · mit Kontakt: ${mitKontakt}`)

  // Die ganze Schweiz sind 2100 Flächen und gut 700 KB gepackt — das ist zu
  // viel, um es jedem Besucher vorab aufzuladen. Ins Bundle kommt deshalb nur
  // die Fokusregion; sie steht sofort und auch ohne Netz. Der Rest kommt aus
  // der Datenbank und ersetzt sie, sobald er da ist — dasselbe Verfahren wie
  // bei Zonen, Gipfeln und Natur.
  if (!IM_BUNDLE) {
    for (const kantonCode of BUNDLE_REGIONEN) {
      const teil = features.filter((f) => f.properties.kanton === kantonCode)
      if (teil.length === 0) continue
      const pfad = resolve(ROOT, 'src/data/gemeinden', `${kantonCode}.json`)
      console.log(`   Bundle ${kantonCode}: ${teil.length} Flächen, ${schreibe(pfad, teil)} KB`)
    }
  }
}

/**
 * Die offiziellen Gemeindewebseiten aus Wikidata nachtragen.
 *
 * OSM führt sie nur für gut 130 der 2119 Gemeinden — zu wenig, denn solange
 * eine Gemeinde nicht recherchiert ist, ist „frag dort nach" die einzige
 * ehrliche Auskunft, die diese Karte geben kann, und sie taugt nur mit einem
 * Link daran. Wikidata verknüpft die amtliche BFS-Nummer (P771) mit der
 * offiziellen Webseite (P856) und deckt fast alle ab.
 *
 * Geraten wird nichts: gibt Wikidata keine Adresse her, bleibt das Feld leer
 * und die Karte sagt schlicht nichts dazu. Eine zusammengereimte URL wäre
 * schlimmer als keine.
 */
const WIKIDATA_ABFRAGE = `SELECT ?bfs ?site WHERE { ?g wdt:P771 ?bfs . ?g wdt:P856 ?site . }`

async function gemeindeWebseiten() {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(WIKIDATA_ABFRAGE)
  const antwort = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'CampBuddy-Import/1.0 (https://github.com/jannis-drng/campbuddy)',
    },
  })
  if (!antwort.ok) throw new Error(`Wikidata: HTTP ${antwort.status}`)
  const daten = await antwort.json()

  const nach = new Map()
  for (const zeile of daten.results.bindings) {
    const bfs = Number(zeile.bfs.value)
    const site = zeile.site.value
    if (!Number.isFinite(bfs)) continue
    // Mehrere Sprachfassungen je Gemeinde: die kürzeste URL ist verlässlich
    // die Einstiegsseite, die längeren sind /fr, /en und Ähnliches.
    const bisher = nach.get(bfs)
    if (!bisher || site.length < bisher.length) nach.set(bfs, site)
  }
  return nach
}

/** Grober Flächenschwerpunkt eines Rings — reicht, um den Kanton zu bestimmen. */
function schwerpunkt(ring) {
  let x = 0, y = 0
  for (const [lon, lat] of ring) { x += lon; y += lat }
  return [x / ring.length, y / ring.length]
}

/** Punkt-in-Polygon (Ray-Casting), nur fürs Zuordnen beim Import. */
function punktInGeometrie([lon, lat], geometry) {
  const polygone = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygone.some((poly) => {
    let drin = false
    const ring = poly[0]
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) drin = !drin
    }
    return drin
  })
}

/* ---------------- Kantonale Rechtsgrundlagen ---------------- */

/**
 * Welche kantonalen und kommunalen Erlasse in welchem Kanton auftauchen.
 *
 * Kantonale Campingregeln gibt es nirgends maschinenlesbar — das Bundesgeoportal
 * führt dazu keine einzige Ebene. Was es gibt, steckt in den BAFU-Daten selbst:
 * jede Wildruhezone nennt die Rechtsgrundlage, auf der sie beruht. Das sind
 * echte kantonale Verordnungen, Regierungsratsbeschlüsse, Waldentwicklungspläne
 * und Gemeindebeschlüsse — 68 verschiedene über die Schweiz.
 *
 * Daraus wird hier pro Kanton eine Liste. Das ist ausdrücklich **nicht** die
 * Antwort auf „darf ich hier zelten": es ist der Hinweis, welches kantonale
 * Recht den Wildschutz regelt — und damit der Faden, an dem die Recherche
 * anfängt. Die Oberfläche benennt das genau so.
 */
async function importKantonsrecht() {
  const kantonePfad = resolve(ROOT, 'src/data/kantone', `${REGION}.json`)
  const bafuPfad = resolve(AUSGABE, 'zones', `${REGION}.bafu.json`)
  const rechtPfad = resolve(AUSGABE, 'zones', `${REGION}.bafu.legal.json`)
  for (const pfad of [kantonePfad, bafuPfad, rechtPfad]) {
    if (!existsSync(pfad)) throw new Error(`${pfad} fehlt — erst 'kantone' und 'bafu' importieren.`)
  }

  const kantone = JSON.parse(readFileSync(kantonePfad, 'utf8')).features
  const zonen = JSON.parse(readFileSync(bafuPfad, 'utf8')).features
  const recht = JSON.parse(readFileSync(rechtPfad, 'utf8')).zones

  /** Schwerpunkt des ersten Rings — für die Zuordnung genau genug. */
  const mitte = (g) => {
    const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]
    return [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ]
  }

  const drin = (p, g) => {
    const polygone = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    return polygone.some((poly) => {
      const ring = poly[0]
      let c = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    })
  }

  const jeKanton = {}
  let ohneKanton = 0

  for (const z of zonen) {
    if (!z.id.startsWith('bafu-wrz')) continue
    const e = recht[z.id]
    const treffer = (e?.conditions ?? '').match(/Grundlage: (.+?)(?: \(\d{4}\)\.| \(\)\.|$)/)
    if (!treffer) continue
    const grundlage = treffer[1].trim()
    if (!grundlage || grundlage === '-') continue

    const punkt = mitte(z.geometry)
    const kanton = kantone.find((k) => drin(punkt, k.geometry))
    if (!kanton?.properties.code) { ohneKanton++; continue }

    const code = kanton.properties.code
    jeKanton[code] ??= { name: kanton.properties.name, grundlagen: {} }
    jeKanton[code].grundlagen[grundlage] = (jeKanton[code].grundlagen[grundlage] ?? 0) + 1
  }

  // Jede Liste absteigend nach Häufigkeit, damit oben steht, was den Kanton prägt.
  const inhalt = {
    hinweis: 'Rechtsgrundlagen, auf denen die Wildruhezonen im jeweiligen Kanton beruhen. '
      + 'Abgeleitet aus dem BAFU-Datensatz — KEINE Aussage darüber, ob und wo im Kanton '
      + 'gezeltet werden darf. Das ist der Ausgangspunkt der Recherche, nicht ihr Ergebnis.',
    quelle: 'BAFU / Kantone — Wildruhezonen (opendata.swiss)',
    stand: new Date().toISOString().slice(0, 10),
    kantone: Object.fromEntries(
      Object.entries(jeKanton)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, k]) => [code, {
          name: k.name,
          grundlagen: Object.entries(k.grundlagen)
            .sort((a, b) => b[1] - a[1])
            .map(([text, anzahl]) => ({ text, zonen: anzahl })),
        }]),
    ),
  }

  const out = resolve(ROOT, 'src/data', 'kantone.grundlagen.json')
  writeFileSync(out, JSON.stringify(inhalt, null, 2) + '\n')
  const kb = Math.round(JSON.stringify(inhalt).length / 1024)
  console.log(`Kantonale Grundlagen: ${Object.keys(jeKanton).length} Kantone, ${kb} KB -> ${out}`)
  if (ohneKanton > 0) console.log(`   ${ohneKanton} Zonen keinem Kanton zugeordnet`)
  const ohne = kantone.filter((k) => k.properties.code && !jeKanton[k.properties.code])
  if (ohne.length > 0) {
    console.log(`   ohne Fundstelle: ${ohne.map((k) => k.properties.code).join(', ')}`)
  }
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

/**
 * Die Ableitungsregeln, von streng nach mild.
 *
 * Jede Regel nennt, woran sie erkennt, und was daraus folgt — beides landet
 * wörtlich im Bedingungstext der Zone, damit jede Behauptung ihre Herkunft
 * mitträgt. Geprüft wird der Reihe nach; die erste passende Regel gewinnt.
 *
 * Warum Jagdbanngebiete und Wildruhezonen streng behandelt werden: ihr
 * Schutzzweck ist ausdrücklich die Ruhe des Wildes. Eine Nacht im Gelände ist
 * genau die Störung, gegen die sie erlassen wurden — auch dort, wo kein
 * Schild „Zelten verboten" steht.
 */
const REGELN = [
  {
    trifft: (t) => t.leisure === 'nature_reserve' || t.boundary === 'national_park',
    status: 'forbidden', zelt: 'no', fahrzeug: 'no', feuer: 'no',
    grund: 'als Naturschutzgebiet beziehungsweise Nationalpark erfasst',
    folgerung: 'Dort ist Übernachten im Freien in der Schweiz in der Regel untersagt.',
  },
  {
    trifft: (t) => /jagdbann/i.test(String(t.protection_title ?? '') + String(t.name ?? '')),
    status: 'forbidden', zelt: 'no', fahrzeug: 'no', feuer: 'no',
    grund: 'als eidgenössisches Jagdbanngebiet erfasst',
    folgerung: 'Diese Gebiete schützen Wild vor Störung (VEJ, SR 922.31); Übernachten im Gelände ist damit in aller Regel unvereinbar.',
  },
  {
    trifft: (t) => /wildruhe|wildschutz/i.test(String(t.protection_title ?? '') + String(t.name ?? '')),
    status: 'forbidden', zelt: 'no', fahrzeug: 'no', feuer: 'no',
    grund: 'als Wildruhezone beziehungsweise Wildschutzgebiet erfasst',
    folgerung: 'Wildruhezonen sind gerade dafür da, dass Wild ungestört bleibt — vielerorts nur im Winterhalbjahr, aber dann verbindlich.',
  },
  {
    trifft: (t) => /moor|ried|auengebiet|aue\b/i.test(String(t.protection_title ?? '') + String(t.name ?? '')),
    status: 'forbidden', zelt: 'no', fahrzeug: 'no', feuer: 'no',
    grund: 'als Moor-, Ried- oder Auengebiet erfasst',
    folgerung: 'Moor- und Auenflächen von nationaler Bedeutung sind bundesrechtlich geschützt und trittempfindlich; Zelten und Feuer sind dort untersagt.',
  },
  {
    trifft: (t) => STRENGE_SCHUTZKLASSEN.has(String(t.protect_class ?? '')),
    status: 'forbidden', zelt: 'no', fahrzeug: 'no', feuer: 'no',
    grund: (t) => `als Schutzgebiet der IUCN-Klasse ${t.protect_class} erfasst`,
    folgerung: 'Schutzgebiete dieser Klassen sind streng geschützt; Übernachten im Freien ist dort in der Regel untersagt.',
  },
  {
    // Die einzige Regel, die nicht auf „verboten" hinausläuft: Landschaftsschutz
    // und regionale Naturpärke sind grossflächig und kennen kein pauschales
    // Zeltverbot — aber Kernzonen und Reservate darin sehr wohl.
    trifft: (t) => String(t.protect_class ?? '') === '5'
      || /landschaftsschutz|naturpark|landschaftspark/i.test(String(t.protection_title ?? '') + String(t.name ?? '')),
    status: 'tolerated', zelt: 'conditional', fahrzeug: 'no', feuer: 'conditional',
    grund: 'als Landschaftsschutzgebiet beziehungsweise regionaler Naturpark erfasst',
    folgerung: 'Kein pauschales Zeltverbot, aber Kernzonen, Reservate und Wildruhezonen innerhalb der Fläche sind ausgenommen. Fahrzeuge ausserhalb bewilligter Plätze bleiben untersagt.',
  },
]

function ableitung(f) {
  const t = f.properties
  const regel = REGELN.find((r) => r.trifft(t))
  if (!regel) return null
  return {
    status: regel.status,
    zelt: regel.zelt,
    fahrzeug: regel.fahrzeug,
    feuer: regel.feuer,
    grund: typeof regel.grund === 'function' ? regel.grund(t) : regel.grund,
    folgerung: regel.folgerung,
  }
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
      status: ab.status,
      tent_allowed: ab.zelt,
      vehicle_allowed: ab.fahrzeug,
      fire_allowed: ab.feuer,
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
  kantone: importKantone,
  gemeinden: importGemeinden,
  bafu: importBafu,
  kantonsrecht: importKantonsrecht,
  recht: importRecht,
  alpen: importAlpen,
}

const gewaehlt = process.argv.slice(2).filter((a) => a in GRUPPEN)
const laufen = gewaehlt.length ? gewaehlt : Object.keys(GRUPPEN)

console.log(`Import für Region ${REGION}: ${laufen.join(', ')} …`)
for (const name of laufen) await GRUPPEN[name]()
console.log('Fertig. Rechtliche Bewertung der Zonen: src/data/zones/*.legal.json pflegen.')
