/**
 * Prüft von aussen, ob das Backend noch das tut, was es tun soll.
 *
 *     npm run pruefen --prefix app
 *
 * Der Sinn: die tragenden Sicherheitsaussagen dieses Projekts stehen heute in
 * Kommentaren in Migrationsdateien. Ein Kommentar merkt nicht, wenn jemand
 * eine Policy ändert. Dieses Skript merkt es — es fragt mit demselben
 * öffentlichen Schlüssel, den auch der Browser hat, und behauptet nichts über
 * das Schema, sondern probiert es aus.
 *
 * Es braucht ausdrücklich **keinen** geheimen Schlüssel. Wer den einsetzen
 * müsste, prüfte etwas anderes als das, was ein Angreifer sieht.
 *
 * Pflichtschritt, bevor eine Änderung an Regeln, Rechten oder Views live
 * geht — genauso wie `vorschau-kopfzeilen.mjs` vor einer CSP-Änderung.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const hier = dirname(fileURLToPath(import.meta.url))

/** Liest die Zugangsdaten aus .env.local — dieselbe Quelle wie beim Bauen. */
function umgebung() {
  for (const datei of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(hier, '..', datei), 'utf8')
      const werte = Object.fromEntries(
        text.split('\n')
          .map((z) => z.trim())
          .filter((z) => z && !z.startsWith('#'))
          .map((z) => {
            const i = z.indexOf('=')
            return [z.slice(0, i).trim(), z.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
          }),
      )
      if (werte.VITE_SUPABASE_URL) return werte
    } catch { /* nächste Datei */ }
  }
  return process.env
}

const env = umgebung()
const URL_ = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

if (!URL_ || !KEY) {
  console.error('Keine Supabase-Zugangsdaten gefunden (.env.local).')
  process.exit(2)
}

const pruefungen = []
const pruefe = (name, fn) => pruefungen.push({ name, fn })

async function hole(pfad, init = {}) {
  const antwort = await fetch(`${URL_}/rest/v1/${pfad}`, {
    ...init,
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  let koerper = null
  try { koerper = await antwort.json() } catch { /* leerer Körper ist in Ordnung */ }
  return { status: antwort.status, koerper }
}

/* ---------------------------------------------------------------------------
   1. Die Kartendaten dürfen nicht über die API zu haben sein (Migration 0023)
--------------------------------------------------------------------------- */
for (const tabelle of ['zones', 'points', 'gemeinden', 'nature', 'peaks', 'gear_items', 'gesperrte_namen']) {
  pruefe(`${tabelle} ist ohne Konto nicht lesbar`, async () => {
    const { status, koerper } = await hole(`${tabelle}?select=*&limit=1`)
    if (status === 200) throw new Error(`liefert Daten (${JSON.stringify(koerper).slice(0, 80)})`)
    if (koerper?.code !== '42501' && status !== 404) {
      throw new Error(`unerwartete Antwort ${status} ${koerper?.code ?? ''}`)
    }
  })
}

/* ---------------------------------------------------------------------------
   2. Die Views dürfen keine user_id herausgeben (Migration 0014)
--------------------------------------------------------------------------- */
// Das ist die tragendste Aussage im ganzen Schema: eine RLS-Regel kann Zeilen
// einschränken, keine Spalten. Wenn jemand die View neu baut und `user_id`
// mitnimmt, hängt die Zuordnung „wer hat was geschrieben" plötzlich öffentlich.
for (const view of ['oeffentliche_routen', 'oeffentliche_kommentare']) {
  pruefe(`${view} gibt keine user_id heraus`, async () => {
    const { status, koerper } = await hole(`${view}?select=user_id&limit=1`)
    if (status === 200) throw new Error('user_id ist abfragbar')
    if (koerper?.code !== '42703') throw new Error(`unerwartete Antwort ${status} ${koerper?.code ?? ''}`)
  })

  pruefe(`${view} ist ohne Konto lesbar`, async () => {
    const { status } = await hole(`${view}?select=id&limit=1`)
    if (status !== 200) throw new Error(`liefert ${status} — die Community wäre leer`)
  })
}

/* ---------------------------------------------------------------------------
   3. Ohne Konto darf nichts geschrieben werden (Migration 0025)
--------------------------------------------------------------------------- */
for (const tabelle of ['routes', 'kommentare', 'likes', 'favorites', 'profiles', 'eigene_punkte']) {
  pruefe(`${tabelle} nimmt ohne Konto nichts an`, async () => {
    const { status } = await hole(tabelle, {
      method: 'POST',
      body: JSON.stringify({ name: 'pruefung' }),
    })
    if (status >= 200 && status < 300) throw new Error('Schreiben ohne Konto ging durch')
  })
}

pruefe('routes ist ohne Konto nicht lesbar', async () => {
  const { status, koerper } = await hole('routes?select=id&limit=1')
  // Entweder das Recht fehlt (42501) oder RLS liefert eine leere Menge.
  // Beides ist richtig; eine gefüllte Antwort wäre der Fehler.
  if (status === 200 && Array.isArray(koerper) && koerper.length > 0) {
    throw new Error('private Touren sind ohne Konto lesbar')
  }
})

pruefe('profiles ist ohne Konto nicht lesbar', async () => {
  const { status, koerper } = await hole('profiles?select=id&limit=1')
  if (status === 200 && Array.isArray(koerper) && koerper.length > 0) {
    throw new Error('Profile sind ohne Konto lesbar')
  }
})

/* ---------------------------------------------------------------------------
   3b. Was entfernt wurde, muss auch weg sein (Migration 0026)
---------------------------------------------------------------------------- */
// `trips` hatte vier RLS-Regeln und seit 0025 keine Rechte mehr — eine Tabelle,
// die niemand erreichen konnte und die niemand meinte. Ihre Aufgabe trägt
// `routes`. Diese Prüfung unterscheidet „ist weg" von „ist nur verschlossen",
// weil genau das der Unterschied zwischen aufgeräumt und vergessen ist.
pruefe('trips gibt es nicht mehr', async () => {
  const { status, koerper } = await hole('trips?select=id&limit=1')
  if (status === 200) throw new Error('liefert Daten')
  if (koerper?.code === '42501') {
    throw new Error('Tabelle steht noch — Migration 0026 ausführen')
  }
  if (status !== 404) throw new Error(`unerwartete Antwort ${status} ${koerper?.code ?? ''}`)
})

// `name_pruefen` sagt, ob ein Anzeigename frei ist. Angemeldet ist das eine
// Ausfüllhilfe; ohne Konto wäre es ein Verzeichnisdienst über die Namen aller
// Nutzer. Beide Aufrufstellen im Frontend haben eine Sitzung.
pruefe('name_pruefen braucht ein Konto', async () => {
  const { status } = await hole('rpc/name_pruefen', {
    method: 'POST',
    body: JSON.stringify({ kandidat: 'pruefstand' }),
  })
  if (status >= 200 && status < 300) {
    throw new Error('liess sich ohne Konto aufrufen — Migration 0026 ausführen')
  }
})

/* ---------------------------------------------------------------------------
   4. Was nur Trigger ist, darf kein RPC sein (Migration 0023)
--------------------------------------------------------------------------- */
for (const fn of ['handle_new_user', 'zaehler_pflegen', 'kommentar_einhaengen', 'rls_auto_enable']) {
  pruefe(`${fn} ist kein aufrufbares RPC`, async () => {
    const { status } = await hole(`rpc/${fn}`, { method: 'POST', body: '{}' })
    if (status >= 200 && status < 300) throw new Error('liess sich aufrufen')
  })
}

/* ---------------------------------------------------------------------------
   5. Die Ortssuche muss ohne Konto gehen (Migration 0020)
--------------------------------------------------------------------------- */
pruefe('touren_bei antwortet ohne Konto', async () => {
  const { status, koerper } = await hole('rpc/touren_bei', {
    method: 'POST',
    body: JSON.stringify({ lon: 7.75, lat: 46.4, umkreis_m: 3000 }),
  })
  if (status !== 200) throw new Error(`liefert ${status}`)
  if (Array.isArray(koerper) && koerper.some((z) => 'user_id' in z)) {
    throw new Error('gibt user_id heraus')
  }
})

/* ---------------------------------------------------------------------------
   6. Die Übersicht darf keine vollen Verläufe holen (Migration 0024)
--------------------------------------------------------------------------- */
pruefe('vorschau ist deutlich kleiner als geometry', async () => {
  const klein = await fetch(`${URL_}/rest/v1/oeffentliche_routen?select=id,vorschau&limit=5`,
    { headers: { apikey: KEY } }).then((a) => a.text())
  const gross = await fetch(`${URL_}/rest/v1/oeffentliche_routen?select=id,geometry&limit=5`,
    { headers: { apikey: KEY } }).then((a) => a.text())
  if (gross.length < 2000) return   // zu wenig Bestand für eine Aussage
  if (klein.length > gross.length / 5) {
    throw new Error(`Vorschau ${klein.length} B gegen Verlauf ${gross.length} B — zu nah beieinander`)
  }
})

/* ------------------------------------------------------------------ Lauf */

const gruen = '\x1b[32m', rot = '\x1b[31m', grau = '\x1b[90m', aus = '\x1b[0m'
console.log(`\n  Backend-Prüfung  ${grau}${URL_}${aus}\n`)

let fehler = 0
for (const { name, fn } of pruefungen) {
  try {
    await fn()
    console.log(`  ${gruen}✓${aus} ${name}`)
  } catch (e) {
    fehler++
    console.log(`  ${rot}✗ ${name}${aus}`)
    console.log(`      ${grau}${e.message}${aus}`)
  }
}

console.log()
if (fehler > 0) {
  console.error(`  ${rot}${fehler} von ${pruefungen.length} Prüfungen fehlgeschlagen.${aus}\n`)
  process.exit(1)
}
console.log(`  ${gruen}Alle ${pruefungen.length} Prüfungen bestanden.${aus}\n`)
