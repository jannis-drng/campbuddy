/**
 * Erzeugt Seed-Migrationen aus einem Import.
 *
 * Warum SQL-Dateien und kein direkter Schreibzugriff: `zones` und `points` sind
 * öffentliche Referenzdaten, in die niemand über die API schreiben darf (siehe
 * Migration 0002). Das ist Absicht — die Rechtsebene ist der Wert dieses
 * Projekts und soll nicht an einem Schlüssel hängen, der im Browser landet.
 * Gepflegt wird sie über den SQL-Editor, so wie die ersten Seeds auch.
 *
 * Aufruf:  REGION=CH node scripts/seed-sql.mjs
 *
 * Die Ausgabe wird bewusst gestückelt: der SQL-Editor von Supabase mag keine
 * Megabyte-Einfügungen, und eine Datei, die zur Hälfte durchläuft, ist
 * schlimmer als vier, die einzeln durchlaufen. Mehrfaches Ausführen ist
 * gefahrlos — jede Zeile ist ein Upsert.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const REPO = resolve(ROOT, '..')

const REGION = process.env.REGION ?? 'CH'
const QUELLE = resolve(ROOT, 'import', REGION)
const ZIEL = resolve(REPO, 'supabase/migrations')
/** Zeilen pro Datei — bei Zonen zählt die Geometrie, deshalb klein gehalten. */
const STUECK = { zones: 200, points: 2000, peaks: 4000, nature: 4000 }

/** Einfache Anführungszeichen verdoppeln; das ist die einzige nötige Maskierung. */
const q = (wert) => (wert == null ? 'null' : `'${String(wert).replace(/'/g, "''")}'`)

/**
 * Schreibt die Seed-Dateien.
 *
 * Ein `insert` pro Datei mit vielen Wertetupeln, nicht eines pro Zeile: die
 * Einfüge- und `on conflict`-Klausel ist länger als die Nutzdaten einer Zeile,
 * und siebentausend Wiederholungen davon sind ein Mehrfaches der eigentlichen
 * Daten. Weniger Bytes heisst hier vor allem: weniger Dateien, die jemand von
 * Hand in den SQL-Editor kopieren muss.
 */
function schreibe(name, kopf, spalten, tupel, aktualisieren, proDatei) {
  mkdirSync(ZIEL, { recursive: true })
  const teile = []
  for (let i = 0; i < tupel.length; i += proDatei) teile.push(tupel.slice(i, i + proDatei))

  const setzen = aktualisieren.map((sp) => `${sp} = excluded.${sp}`).join(', ')

  teile.forEach((teil, index) => {
    const nummer = teile.length > 1 ? `_${index + 1}von${teile.length}` : ''
    const datei = resolve(ZIEL, `${name}${nummer}.sql`)
    const inhalt = [
      kopf,
      teile.length > 1 ? `-- Teil ${index + 1} von ${teile.length}.` : '',
      '',
      'begin;',
      `insert into ${spalten.tabelle} (${spalten.liste}) values`,
      teil.map((t) => `  (${t})`).join(',\n'),
      `on conflict (id) do update set ${setzen}, updated_at = now();`,
      'commit;',
      '',
    ].join('\n')
    writeFileSync(datei, inhalt)
    console.log(`${datei}  (${teil.length} Zeilen, ${Math.round(inhalt.length / 1024)} KB)`)
  })
}

/* ---------------------------------------------------------------- Zonen */

function zonen() {
  const geo = JSON.parse(readFileSync(resolve(QUELLE, 'zones', `${REGION}.osm.json`), 'utf8'))
  const legalPfad = resolve(QUELLE, 'zones', `${REGION}.legal.json`)
  const legal = existsSync(legalPfad) ? JSON.parse(readFileSync(legalPfad, 'utf8')).zones ?? {} : {}

  const spalten = 'id, region, name, status, tent_allowed, vehicle_allowed, fire_allowed, ' +
    'conditions, notes, source, source_url, review_status, last_verified, geometry'

  const zeilen = geo.features.map((f) => {
    // Flächen ohne Eintrag bleiben ausdrücklich 'unknown' — eine ungeprüfte
    // Fläche ist eine Information, keine Lücke.
    const e = legal[f.id] ?? {
      status: 'unknown', tent_allowed: 'unknown', vehicle_allowed: 'unknown',
      fire_allowed: 'unknown', conditions: null, notes: null,
      review_status: 'entwurf', last_verified: null,
    }
    const werte = [
      q(f.id), q(REGION), q(f.properties.name), q(e.status), q(e.tent_allowed),
      q(e.vehicle_allowed), q(e.fire_allowed), q(e.conditions), q(e.notes),
      q(f.properties.source), q(f.properties.source_url), q(e.review_status),
      e.last_verified ? q(e.last_verified) : 'null',
      `${q(JSON.stringify(f.geometry))}::jsonb`,
    ].join(', ')
    return werte
  })

  const abgeleitet = geo.features.filter((f) => legal[f.id]).length
  schreibe(
    `0008_seed_zones_${REGION.toLowerCase()}`,
    `-- CampBuddy — Zonen für die Region ${REGION}.\n` +
    '-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.\n' +
    '--\n' +
    `-- ${geo.features.length} Flächen, Geometrie aus OpenStreetMap (ODbL), auf ~40 m vereinfacht.\n` +
    `-- ${abgeleitet} davon mit regelbasiert abgeleiteter Einstufung, ` +
    `${geo.features.length - abgeleitet} ausdrücklich 'unknown'.\n` +
    '--\n' +
    '-- KEINE dieser Einstufungen ist geprüft: alle tragen review_status \'entwurf\'\n' +
    '-- und kein Prüfdatum. Abgeleitet wird nur, wo OSM ein eindeutiges Signal\n' +
    '-- liefert, und der Fehler geht immer in die sichere Richtung (verboten).',
    { tabelle: 'public.zones', liste: spalten },
    zeilen,
    ['region', 'name', 'status', 'tent_allowed', 'vehicle_allowed', 'fire_allowed',
      'conditions', 'notes', 'source', 'source_url', 'review_status', 'last_verified', 'geometry'],
    STUECK.zones,
  )
}

/* --------------------------------------------------------------- Punkte */

function punkte() {
  const punkte = JSON.parse(readFileSync(resolve(QUELLE, 'points', `${REGION}.json`), 'utf8'))
  const spalten = 'id, region, type, name, lat, lng, elevation, info, source, source_url, last_verified'

  const zeilen = punkte.map((p) => {
    const werte = [
      q(p.id), q(REGION), q(p.type), q(p.name), p.lat, p.lng,
      p.elevation == null ? 'null' : p.elevation,
      `${q(JSON.stringify(p.info))}::jsonb`,
      q(p.source), q(p.source_url), p.last_verified ? q(p.last_verified) : 'null',
    ].join(', ')
    return werte
  })

  const jeArt = punkte.reduce((m, p) => ({ ...m, [p.type]: (m[p.type] ?? 0) + 1 }), {})
  schreibe(
    `0009_seed_points_${REGION.toLowerCase()}`,
    `-- CampBuddy — Punkte für die Region ${REGION}.\n` +
    '-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.\n' +
    '--\n' +
    `-- ${punkte.length} Punkte aus OpenStreetMap (ODbL): ` +
    Object.entries(jeArt).map(([k, v]) => `${v} ${k}`).join(', ') + '.\n' +
    '-- Kein Prüfdatum: keiner dieser Punkte ist selbst nachgesehen.',
    { tabelle: 'public.points', liste: spalten },
    zeilen,
    ['region', 'type', 'name', 'lat', 'lng', 'elevation', 'info', 'source', 'source_url'],
    STUECK.points,
  )
}

/* --------------------------------------------------------------- Gipfel */

function gipfel() {
  const liste = JSON.parse(readFileSync(resolve(QUELLE, 'peaks', `${REGION}.json`), 'utf8'))
  const spalten = 'id, region, name, lat, lng, elevation, source_url'

  const zeilen = liste.map((g) => {
    const werte = [q(g.id), q(REGION), q(g.name), g.lat, g.lng, g.elevation, q(g.source_url)].join(', ')
    return werte
  })

  schreibe(
    `0011_seed_peaks_${REGION.toLowerCase()}`,
    `-- CampBuddy — Gipfel für die Region ${REGION}.\n` +
    '-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.\n' +
    '-- Setzt Migration 0010 voraus.\n' +
    '--\n' +
    `-- ${liste.length} benannte Gipfel mit Höhe aus OpenStreetMap (ODbL).\n` +
    '-- Reine Orientierung, keine Rechtsaussage.',
    { tabelle: 'public.peaks', liste: spalten },
    zeilen,
    ['region', 'name', 'lat', 'lng', 'elevation', 'source_url'],
    STUECK.peaks,
  )
}

/* ---------------------------------------------------------------- Natur */

function natur() {
  const pfad = resolve(QUELLE, 'nature', `${REGION}.json`)
  if (!existsSync(pfad)) {
    console.log(`   (übersprungen: ${pfad} fehlt)`)
    return
  }
  const liste = JSON.parse(readFileSync(pfad, 'utf8'))
  const spalten = 'id, region, type, name, benannt, lat, lng, elevation, source_url'

  const zeilen = liste.map((n) => {
    const werte = [
      q(n.id), q(REGION), q(n.type), q(n.name), n.benannt ? 'true' : 'false',
      n.lat, n.lng, n.elevation == null ? 'null' : n.elevation, q(n.source_url),
    ].join(', ')
    return werte
  })

  const jeArt = liste.reduce((m, n) => ({ ...m, [n.type]: (m[n.type] ?? 0) + 1 }), {})
  schreibe(
    `0012_seed_nature_${REGION.toLowerCase()}`,
    `-- CampBuddy — Wasser und Aussicht für die Region ${REGION}.\n` +
    '-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.\n' +
    '-- Setzt Migration 0010 voraus.\n' +
    '--\n' +
    `-- ${liste.length} Objekte aus OpenStreetMap (ODbL): ` +
    Object.entries(jeArt).map(([k, v]) => `${v} ${k}`).join(', ') + '.\n' +
    '--\n' +
    '-- Eine Trinkwasser-Markierung in OSM ist die Angabe einer Mapperin, keine\n' +
    '-- Laboranalyse. Die Infokarte sagt das auch so.',
    { tabelle: 'public.nature', liste: spalten },
    zeilen,
    ['region', 'type', 'name', 'benannt', 'lat', 'lng', 'elevation', 'source_url'],
    STUECK.nature,
  )
}

/* ------------------------------------------------------------- Bestand */

/**
 * Die Kennzahlen des Imports als winzige Datei fürs Bundle.
 *
 * Die Startseite nennt Zahlen — wie viele Flächen erfasst sind, wie viele
 * davon geprüft. Sie kann sie nicht mehr aus den gebündelten Daten zählen,
 * seit die vollständige Fassung in der Datenbank liegt, und ausgedachte Zahlen
 * sind in diesem Projekt tabu. Also werden sie beim Import mitgeschrieben:
 * eine Zeile Wahrheit statt megabyteweise Daten, nur um sie zu zählen.
 */
function bestand() {
  const geo = JSON.parse(readFileSync(resolve(QUELLE, 'zones', `${REGION}.osm.json`), 'utf8'))
  const legalPfad = resolve(QUELLE, 'zones', `${REGION}.legal.json`)
  const legal = existsSync(legalPfad) ? JSON.parse(readFileSync(legalPfad, 'utf8')).zones ?? {} : {}
  const punkteListe = JSON.parse(readFileSync(resolve(QUELLE, 'points', `${REGION}.json`), 'utf8'))

  const zaehle = (unterordner) => {
    const pfad = resolve(QUELLE, unterordner, `${REGION}.json`)
    return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')).length : null
  }
  const gipfel = zaehle('peaks')
  const naturZahl = zaehle('nature')

  const eintraege = Object.values(legal)
  const inhalt = {
    region: REGION,
    stand: new Date().toISOString().slice(0, 10),
    zonen: geo.features.length,
    zonen_abgeleitet: eintraege.length,
    zonen_ungeklaert: geo.features.length - eintraege.length,
    // Die unbequeme Zahl gehört genauso dazu wie die schmeichelhaften.
    zonen_geprueft: eintraege.filter((e) => e.review_status !== 'entwurf').length,
    punkte: punkteListe.length,
    huetten: punkteListe.filter((p) => p.type === 'hut').length,
    campingplaetze: punkteListe.filter((p) => p.type === 'campsite').length,
    stellplaetze: punkteListe.filter((p) => p.type === 'vehicle_spot').length,
    gipfel,
    natur: naturZahl,
  }

  const datei = resolve(ROOT, 'src/data', 'bestand.json')
  writeFileSync(datei, JSON.stringify(inhalt, null, 2) + '\n')
  console.log(`${datei}  (${JSON.stringify(inhalt).length} Bytes)`)
}

/* ----------------------------------------------------------------- main */

const GRUPPEN = { zonen, punkte, gipfel, natur, bestand }
const gewaehlt = process.argv.slice(2).filter((a) => a in GRUPPEN)
const laufen = gewaehlt.length ? gewaehlt : Object.keys(GRUPPEN)

if (!existsSync(QUELLE)) {
  throw new Error(`${QUELLE} fehlt — erst 'REGION=${REGION} npm run import:osm' laufen lassen.`)
}
console.log(`Seed-SQL für ${REGION} aus ${QUELLE} …`)
for (const name of laufen) GRUPPEN[name]()
console.log('Fertig. Dateien der Reihe nach im SQL-Editor ausführen.')
