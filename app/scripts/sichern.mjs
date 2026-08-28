/**
 * Sichert die Nutzerdaten als JSON.
 *
 *     SUPABASE_SECRET_KEY=sb_secret_… npm run sichern --prefix app
 *
 * Warum es das gibt: auf dem Free-Plan ist kein Wiederherstellungsweg
 * zugesichert. Es werden zwar Tagessicherungen genommen, aber sie sind erst
 * nach einem Upgrade zugänglich, und die Supabase-Dokumentation sagt
 * ausdrücklich, dass das nicht so bleiben muss. Praktisch heisst das heute:
 * kein Restore.
 *
 * Die Rechtsdaten sind davon nicht betroffen — die liegen in Git und im
 * Import-Verzeichnis, die kann man neu einspielen. Unersetzlich ist das, was
 * Menschen selbst angelegt haben: Touren, Kommentare, eigene Punkte, Profile.
 * Genau das holt dieses Skript.
 *
 * Es braucht den **geheimen** Schlüssel, weil es absichtlich an der RLS
 * vorbeigeht: gesichert werden alle Zeilen, nicht die eines Kontos. Der
 * Schlüssel steht in den Projekteinstellungen unter „API Keys" und gehört
 * nicht in eine Datei im Repo — er wird hier nur aus der Umgebung gelesen.
 *
 * Geblättert wird über `range`, weil PostgREST sonst stillschweigend bei 1000
 * Zeilen aufhört (siehe `app/src/services/deckel.ts`). Eine Sicherung, die
 * ohne Fehlermeldung unvollständig ist, wäre schlimmer als keine.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const hier = dirname(fileURLToPath(import.meta.url))

/**
 * Was gesichert wird — und was ausdrücklich nicht.
 *
 * Nicht dabei sind die Kartentabellen (`zones`, `gemeinden`, `points`,
 * `nature`, `peaks`): die entstehen aus `app/import/` neu und stehen in Git.
 * Sie hier mitzunehmen bliese jede Sicherung auf 15 MB auf, ohne etwas zu
 * retten, was nicht schon gerettet wäre.
 */
/*
  Jede Zeile trägt ihren Primärschlüssel mit, weil danach sortiert wird.

  Das ist keine Kosmetik: Blättern ohne feste Reihenfolge ist kaputt.
  PostgreSQL darf Zeilen bei zwei Abfragen in verschiedener Reihenfolge
  liefern, und dann enthält Seite 2 Zeilen aus Seite 1, während andere ganz
  fehlen — in einer Sicherung der schlimmstmögliche Fehler, weil er
  aussieht wie Erfolg.

  Die drei Verknüpfungstabellen haben einen zusammengesetzten Schlüssel und
  gar keine `id`-Spalte. Genau daran ist der erste Lauf gescheitert.
*/
const TABELLEN = [
  { name: 'profiles',        schluessel: 'id' },
  { name: 'routes',          schluessel: 'id' },
  { name: 'trips',           schluessel: 'id' },
  { name: 'kommentare',      schluessel: 'id' },
  { name: 'likes',           schluessel: 'user_id,route_id' },
  { name: 'kommentar_likes', schluessel: 'user_id,kommentar_id' },
  { name: 'favorites',       schluessel: 'user_id,route_id' },
  { name: 'eigene_punkte',   schluessel: 'id' },
  { name: 'meldungen',       schluessel: 'id' },
]

const SEITE = 1000

function umgebung() {
  const werte = { ...process.env }
  for (const datei of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(hier, '..', datei), 'utf8')
      for (const zeile of text.split('\n')) {
        const z = zeile.trim()
        if (!z || z.startsWith('#')) continue
        const i = z.indexOf('=')
        const name = z.slice(0, i).trim()
        if (!werte[name]) werte[name] = z.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      }
    } catch { /* Datei muss es nicht geben */ }
  }
  return werte
}

const env = umgebung()
const URL_ = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SECRET = env.SUPABASE_SECRET_KEY || ''

if (!URL_) {
  console.error('VITE_SUPABASE_URL fehlt (.env.local).')
  process.exit(2)
}
if (!SECRET) {
  console.error(`
  SUPABASE_SECRET_KEY fehlt.

  Der geheime Schlüssel steht im Supabase-Projekt unter Settings -> API Keys.
  Er gehört nicht in eine Datei im Repo — gib ihn für den einen Aufruf mit:

      SUPABASE_SECRET_KEY=sb_secret_… npm run sichern --prefix app
`)
  process.exit(2)
}

async function alleZeilen(tabelle, schluessel) {
  const alle = []
  const sortierung = schluessel.split(',').map((s) => `${s}.asc`).join(',')
  for (let n = 0; n < 1000; n++) {
    const von = n * SEITE
    const antwort = await fetch(
      `${URL_}/rest/v1/${tabelle}?select=*&order=${sortierung}&offset=${von}&limit=${SEITE}`,
      { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } },
    )
    if (!antwort.ok) {
      const text = await antwort.text()
      throw new Error(`${tabelle}: HTTP ${antwort.status} ${text.slice(0, 160)}`)
    }
    const teil = await antwort.json()
    alle.push(...teil)
    if (teil.length < SEITE) break
  }
  return alle
}

const stempel = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const ziel = join(hier, '..', '..', 'sicherung', stempel)
mkdirSync(ziel, { recursive: true })

const gruen = '\x1b[32m', rot = '\x1b[31m', grau = '\x1b[90m', aus = '\x1b[0m'
console.log(`\n  Sicherung  ${grau}${ziel}${aus}\n`)

let gesamt = 0
const uebersicht = {}
const gescheitert = {}

for (const { name, schluessel } of TABELLEN) {
  try {
    const zeilen = await alleZeilen(name, schluessel)
    const text = JSON.stringify(zeilen, null, 2)
    writeFileSync(join(ziel, `${name}.json`), text)
    uebersicht[name] = zeilen.length
    gesamt += text.length
    console.log(`  ${gruen}✓${aus} ${name.padEnd(18)} ${String(zeilen.length).padStart(6)} Zeilen`)
  } catch (e) {
    gescheitert[name] = e.message
    console.log(`  ${rot}✗ ${name.padEnd(18)}${aus} ${grau}${e.message}${aus}`)
  }
}

/*
  Die Übersicht sagt ausdrücklich, ob die Sicherung vollständig ist.

  Eine halbe Sicherung ist gefährlicher als gar keine: das Verzeichnis sieht
  in einem halben Jahr genauso aus wie ein vollständiges, und wer daraus
  wiederherstellt, merkt das Fehlende erst, wenn es weg ist. Deshalb steht
  das Urteil in der Datei, nicht nur im Terminal, das längst geschlossen ist.
*/
const vollstaendig = Object.keys(gescheitert).length === 0
writeFileSync(join(ziel, 'uebersicht.json'), JSON.stringify({
  zeitpunkt: new Date().toISOString(),
  projekt: URL_,
  vollstaendig,
  zeilen: uebersicht,
  ...(vollstaendig ? {} : { gescheitert }),
}, null, 2))

console.log(`\n  ${(gesamt / 1024 / 1024).toFixed(2)} MB in ${ziel}\n`)
if (!vollstaendig) {
  console.error(`  ${rot}Unvollständig — ${Object.keys(gescheitert).join(', ')} fehlen.${aus}`)
  console.error(`  ${grau}Steht auch in uebersicht.json unter "vollstaendig": false.${aus}\n`)
  process.exit(1)
}
