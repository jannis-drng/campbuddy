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
const STUECK = { zones: 200, points: 2000, peaks: 4000, nature: 4000, gemeinden: 300 }

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

/**
 * Zonen aus beiden Quellen: OpenStreetMap und die amtlichen BAFU-Inventare.
 *
 * Sie liegen in getrennten Dateien und behalten getrennte Herkunft — eine
 * OSM-Fläche mit abgeleiteter Einstufung und ein eidgenössisches Jagdbanngebiet
 * sind nicht dasselbe, auch wenn beide in derselben Tabelle landen. Der
 * Unterschied steht in `source`, `review_status` und `last_verified`.
 */
function zonenQuellen() {
  const lade = (name) => {
    const pfad = resolve(QUELLE, 'zones', name)
    return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : null
  }
  const osm = lade(`${REGION}.osm.json`)
  const bafu = lade(`${REGION}.bafu.json`)
  const osmRecht = lade(`${REGION}.legal.json`)?.zones ?? {}
  const bafuRecht = lade(`${REGION}.bafu.legal.json`)?.zones ?? {}
  return {
    features: [...(osm?.features ?? []), ...(bafu?.features ?? [])],
    legal: { ...osmRecht, ...bafuRecht },
    ausBafu: bafu?.features?.length ?? 0,
  }
}

function zonen() {
  const quellen = zonenQuellen()
  const geo = { features: quellen.features }
  const legal = quellen.legal

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
  const belegt = Object.values(legal).filter((e) => e.review_status !== 'entwurf').length
  schreibe(
    `0008_seed_zones_${REGION.toLowerCase()}`,
    `-- CampBuddy — Zonen für die Region ${REGION}.\n` +
    '-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.\n' +
    '--\n' +
    `-- ${geo.features.length} Flächen, auf ~40 m vereinfacht.\n` +
    `-- Davon ${quellen.ausBafu} aus den amtlichen BAFU-Inventaren (Jagdbanngebiete,\n` +
    '-- Wildruhezonen; opendata.swiss, Quellenangabe Pflicht) — diese tragen\n' +
    `-- review_status 'quelle' mit Prüfdatum: ${belegt} Stück.\n` +
    `-- Der Rest stammt aus OpenStreetMap (ODbL) mit regelbasiert abgeleiteter\n` +
    `-- Einstufung, review_status 'entwurf' ohne Prüfdatum.\n` +
    '--\n' +
    `-- ${geo.features.length - abgeleitet} Flächen sind ausdrücklich 'unknown'.\n` +
    '-- „Geprüft" heisst hier: gegen eine benannte amtliche Quelle abgeglichen —\n' +
    '-- nicht vor Ort nachgesehen.',
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
  const quellen = zonenQuellen()
  const geo = { features: quellen.features }
  const legal = quellen.legal
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
    // „Belegt" heisst: gegen eine benannte amtliche Quelle abgeglichen.
    // „Vor Ort" wäre die nächste Stufe und steht weiterhin auf null.
    zonen_belegt: eintraege.filter((e) => e.review_status === 'quelle').length,
    zonen_geprueft: eintraege.filter((e) => e.review_status === 'vor-ort').length,
    zonen_amtlich: quellen.ausBafu,
    punkte: punkteListe.length,
    huetten: punkteListe.filter((p) => p.type === 'hut').length,
    campingplaetze: punkteListe.filter((p) => p.type === 'campsite').length,
    stellplaetze: punkteListe.filter((p) => p.type === 'vehicle_spot').length,
    gipfel,
    natur: naturZahl,
    ...gemeindeBestand(),
  }

  const datei = resolve(ROOT, 'src/data', 'bestand.json')
  writeFileSync(datei, JSON.stringify(inhalt, null, 2) + '\n')
  console.log(`${datei}  (${JSON.stringify(inhalt).length} Bytes)`)
}

/**
 * Wie weit die kommunale Rechtspflege gediehen ist.
 *
 * Die Zahl, die zählt, ist nicht „2119 Gemeinden erfasst" — Grenzen zu laden
 * ist keine Leistung. Sie ist, wie viele davon eine mit einer amtlichen Quelle
 * belegte Einstufung tragen. Solange das eine Handvoll ist, soll genau das
 * dastehen.
 */
function gemeindeBestand() {
  const flaechen = JSON.parse(readFileSync(resolve(QUELLE, 'gemeinden', `${REGION}.json`), 'utf8'))
  const recht = JSON.parse(readFileSync(resolve(ROOT, 'src/data/gemeinden.legal.json'), 'utf8'))
  const eintraege = Object.values(recht.gemeinden ?? {})
  return {
    gemeinden: flaechen.features.length,
    gemeinden_eingestuft: eintraege.length,
    gemeinden_belegt: eintraege.filter((e) => e.review_status === 'quelle').length,
    gemeinden_vor_ort: eintraege.filter((e) => e.review_status === 'vor-ort').length,
  }
}

/* ------------------------------------------------------------ Gemeinden */

/**
 * Die Gemeindeflächen — nur Geometrie und Kontakt, keine Rechtslage.
 *
 * Die Einstufung bleibt in `gemeinden.legal.json` im Repo: von Hand gepflegt,
 * versioniert, und von einem Neu-Import nicht zu überschreiben. Dieselbe
 * Trennung wie bei den Zonen, und aus demselben Grund — die Rechtspflege ist
 * die Arbeit, die man kein zweites Mal machen will.
 */
function gemeinden() {
  const pfad = resolve(QUELLE, 'gemeinden', `${REGION}.json`)
  const daten = JSON.parse(readFileSync(pfad, 'utf8'))

  const spalten = 'id, bfs, name, kanton, website, email, source_url, geometry'
  const tupel = daten.features.map((f) => {
    const p = f.properties
    return [
      q(f.id), p.bfs ?? 'null', q(p.name), q(p.kanton), q(p.website), q(p.email),
      q(p.source_url), `${q(JSON.stringify(f.geometry))}::jsonb`,
    ].join(', ')
  })

  const mitKontakt = daten.features.filter((f) => f.properties.website || f.properties.email).length
  schreibe(
    `0014_seed_gemeinden_${REGION.toLowerCase()}`,
    [
      '-- CampBuddy — Gemeindeflächen.',
      '--',
      `-- ${daten.features.length} Gemeinden, davon ${mitKontakt} mit Kontakt.`,
      '-- Nur Geometrie und Kontakt; die Rechtslage steht in gemeinden.legal.json.',
      '--',
      '-- Voraussetzung: 0013_gemeinden.sql ist gelaufen.',
    ].join('\n'),
    { tabelle: 'public.gemeinden', liste: spalten },
    tupel,
    ['bfs', 'name', 'kanton', 'website', 'email', 'source_url', 'geometry'],
    STUECK.gemeinden,
  )
}

/* ----------------------------------------------------------------- main */

const GRUPPEN = { zonen, punkte, gipfel, natur, gemeinden, bestand }
const gewaehlt = process.argv.slice(2).filter((a) => a in GRUPPEN)
const laufen = gewaehlt.length ? gewaehlt : Object.keys(GRUPPEN)

if (!existsSync(QUELLE)) {
  throw new Error(`${QUELLE} fehlt — erst 'REGION=${REGION} npm run import:osm' laufen lassen.`)
}
console.log(`Seed-SQL für ${REGION} aus ${QUELLE} …`)
for (const name of laufen) GRUPPEN[name]()
console.log('Fertig. Dateien der Reihe nach im SQL-Editor ausführen.')
