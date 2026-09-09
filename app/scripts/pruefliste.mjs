/**
 * Die Prüfliste erzeugen — den Stand jeder der 2119 Gemeinden in einer Datei.
 *
 * Die Liste läuft als Artefakt im Browser; sie zeigt je Kanton, wo eine
 * Gemeinde steht, und lässt die Vorschläge mit Ja/Nein entscheiden. Bisher
 * entstand ihr Datensatz von Hand — pro Runde neu, und jedes Mal war die
 * Frage, ob er noch zu den Quelldateien passt. Deshalb hier:
 *
 *   node scripts/pruefliste.mjs <stand.html>
 *
 * ersetzt in der Datei die Zeile `const DATEN = …` durch den aktuellen Stand.
 * Alles andere an der Seite bleibt unangetastet.
 *
 * Vier Zustände, feinster gewinnt:
 *   fertig        — steht in gemeinden.legal.json, ist auf der Karte
 *   pruefung      — ein Vorschlag liegt vor, die Entscheidung fehlt
 *   angeschrieben — Brief ist raus, Antwort steht aus
 *   offen         — noch nichts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ZIEL = process.argv[2]
if (!ZIEL) {
  console.log('Aufruf: node scripts/pruefliste.mjs <stand.html>')
  process.exit(1)
}

/** Die Gebühr als ein Satzstück — die Liste zeigt Text, nicht das Objekt. */
const gebuehrText = (g) =>
  g ? `${g.betrag.toFixed(2)} ${g.waehrung} je ${g.je} — ${g.wofuer}` : null

const lies = (p, ersatz) =>
  existsSync(resolve(ROOT, p)) ? JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')) : ersatz

const gemeinden = lies('import/CH/gemeinden/CH.json', { features: [] }).features
const recht = lies('src/data/gemeinden.legal.json', { gemeinden: {} }).gemeinden
const vorschlaege = lies('import/mail/vorschlaege.json', { vorschlaege: [] }).vorschlaege
const versandt = lies('import/mail/versandt.json', { eintraege: [] }).eintraege
const antworten = lies('import/mail/antworten.json', { eintraege: [] }).eintraege
const kontakte = lies('import/recherche/kontakte.json', { ergebnisse: [] }).ergebnisse
const manuell = lies('import/mail/adressen-manuell.json', {})
const abgemeldet = new Set(lies('import/mail/keine-anfragen.json', { bfs: [] }).bfs ?? [])

// Bibern hat keine BFS-Nummer. Ohne diesen Filter würde `null` zum Schlüssel,
// und jede unzuordenbare Zeile erschiene unter ihrem Namen.
const nachBfs = (liste, feld = 'bfs') => {
  const m = new Map()
  for (const e of liste) if (e?.[feld] != null) m.set(Number(e[feld]), e)
  return m
}

const briefe = nachBfs(versandt)
const post = new Map()
for (const a of antworten) {
  if (a.bfs == null) continue
  const bfs = Number(a.bfs)
  post.set(bfs, [...(post.get(bfs) ?? []), a])
}
const vorschlag = nachBfs(vorschlaege)
const kontakt = nachBfs(kontakte)
const adressen = nachBfs(manuell.gemeinden ?? [])

// Die Namen stehen in kantoneNamen.ts, weil die Oberfläche sie ohne die
// 131 KB Geometrie braucht. Hier reicht die Zuordnung Code → Name.
const KANTONSNAMEN = Object.fromEntries(
  [...readFileSync(resolve(ROOT, 'src/data/kantoneNamen.ts'), 'utf8')
    .matchAll(/\['(CH-[A-Z]{2})', '([^']+)'\]/g)].map((m) => [m[1], m[2]]),
)

/** Warum eine Gemeinde noch offen ist — das entscheidet, was als Nächstes zu tun ist. */
function grundOffen(bfs) {
  if (abgemeldet.has(bfs)) return 'hat um keine weiteren Anfragen gebeten'
  const k = kontakt.get(bfs)
  if (adressen.get(bfs)?.email) return 'Adresse von Hand ergänzt, noch nicht angeschrieben'
  if (k?.email) return 'Adresse bekannt, noch nicht angeschrieben'
  if (k?.website) return 'keine Adresse gefunden'
  return 'keine Webseite bekannt'
}

const kantone = {}
for (const f of gemeinden) {
  const p = f.properties
  const bfs = p.bfs == null ? null : Number(p.bfs)
  const code = p.kanton
  const k = (kantone[code] ??= {
    name: KANTONSNAMEN[code] ?? code.replace('CH-', ''),
    gemeinden: [],
    zahlen: { fertig: 0, pruefung: 0, angeschrieben: 0, offen: 0 },
  })

  const e = bfs != null ? recht[String(bfs)] : null
  const v = bfs != null ? vorschlag.get(bfs) : null
  const b = bfs != null ? briefe.get(bfs) : null
  const antwort = (bfs != null ? post.get(bfs) : null) ?? []

  let eintrag
  if (e) {
    eintrag = {
      bfs, name: p.name, stand: 'fertig',
      status: e.status, zelt: e.tent_allowed, biwak: e.bivouac_allowed ?? 'unknown',
      gebuehr: gebuehrText(e.gebuehr),
      ohne_eigene_regel: e.ohne_eigene_regel ?? false,
      quelle: e.source, geprueft: e.last_verified,
      weg: e._aus_mail ? 'Antwort der Gemeinde' : 'Recherche',
    }
  } else if (v) {
    const s = v.vorschlag
    const a = antwort.find((x) => !x.nur_bestaetigung) ?? antwort[0]
    eintrag = {
      bfs, name: p.name, stand: 'pruefung',
      status: s.status, zelt: s.tent_allowed, biwak: s.bivouac_allowed ?? 'unknown',
      fahrzeug: s.vehicle_allowed, feuer: s.fire_allowed,
      gebuehr: gebuehrText(s.gebuehr),
      ohne_eigene_regel: s.ohne_eigene_regel ?? false,
      summary: s.summary, conditions: s.conditions ?? null,
      quelle: s.source,
      von: a?.von ?? null,
      antworttext: a?.text ? a.text.slice(0, 800).replace(/\s+/g, ' ') + '…' : null,
    }
  } else if (b) {
    eintrag = {
      bfs, name: p.name, stand: 'angeschrieben',
      am: String(b.am).slice(0, 10), an: b.an, sprache: b.sprache,
      antwort: antwort.some((x) => !x.nur_bestaetigung),
      bestaetigung: antwort.some((x) => x.nur_bestaetigung),
      verweis: antwort.find((x) => x.verweis_an)?.verweis_an ?? null,
      abgemeldet: abgemeldet.has(bfs),
    }
  } else {
    eintrag = {
      bfs, name: p.name, stand: 'offen',
      grund: bfs == null ? 'keine BFS-Nummer' : grundOffen(bfs),
      website: kontakt.get(bfs)?.website ?? p.website ?? null,
    }
  }
  k.gemeinden.push(eintrag)
  k.zahlen[eintrag.stand]++
}

for (const k of Object.values(kantone)) {
  k.gemeinden.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

const DATEN = {
  stand: new Date().toISOString().slice(0, 10),
  kantone: Object.fromEntries(Object.entries(kantone).sort(([a], [b]) => a.localeCompare(b))),
}

const zeilen = readFileSync(ZIEL, 'utf8').split('\n')
const i = zeilen.findIndex((z) => z.startsWith('const DATEN = '))
if (i < 0) {
  console.error(`In ${ZIEL} steht keine Zeile «const DATEN = …».`)
  process.exit(1)
}
zeilen[i] = 'const DATEN = ' + JSON.stringify(DATEN)
writeFileSync(ZIEL, zeilen.join('\n'))

const summe = { fertig: 0, pruefung: 0, angeschrieben: 0, offen: 0 }
for (const k of Object.values(kantone)) for (const [s, n] of Object.entries(k.zahlen)) summe[s] += n
console.log(`${ZIEL} aktualisiert:`)
console.log(`  fertig ${summe.fertig} · Prüfung ${summe.pruefung} · angeschrieben ${summe.angeschrieben} · offen ${summe.offen}`)
console.log(`  = ${Object.values(summe).reduce((a, b) => a + b, 0)} Gemeinden in ${Object.keys(kantone).length} Kantonen`)
