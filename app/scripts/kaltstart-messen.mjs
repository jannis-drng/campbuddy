/**
 * Was ein Kaltstart wirklich kostet — gemessen, nicht geschätzt.
 *
 * Das Grössenbudget (`groessen-budget.mjs`) prüft einzelne Dateien. Es kann
 * aber nicht sagen, wie viele davon ein Besuch tatsächlich anfasst, wie viele
 * Anfragen an fremde Dienste dazukommen und wie lange es dauert, bis etwas zu
 * sehen ist. Genau das macht dieses Skript: es startet den Vorschauserver mit
 * den echten Kopfzeilen, fährt einen echten Browser auf, und zählt mit.
 *
 * Zwei Durchgänge, und der zweite ist der wichtigere:
 *
 *   kalt — leerer Cache, kein Service Worker. Was ein neuer Besucher zahlt.
 *   warm — derselbe Browser noch einmal. Was ein Wiederbesuch zahlt; ohne
 *          Service Worker war das früher fast dasselbe wie kalt.
 *
 * Aufruf:  npm run build && node scripts/kaltstart-messen.mjs
 *          NETZ=3g node scripts/kaltstart-messen.mjs   (gedrosselt)
 *
 * Gearbeitet wird mit dem installierten Chrome (playwright-core, `channel:
 * 'chrome'`) — wie in scripts/recherche-gemeinden-browser.mjs, damit kein
 * zusätzlicher Browser heruntergeladen werden muss.
 *
 * Gezählt wird über das Netzwerk-Protokoll des Browsers (`encodedDataLength`
 * aus dem Chrome DevTools Protocol), nicht über die Antwortkörper. Der
 * Unterschied ist nicht akademisch: ein Körper sagt, wie schwer eine Datei
 * ist, aber nicht, ob sie überhaupt über die Leitung ging. Beim Wiederbesuch
 * liefert der Browser jeden Körper aus dem Cache — eine Zählung auf dieser
 * Grundlage sah einen perfekten Cache-Treffer genauso an wie ein vollständiges
 * Neuladen.
 */
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const HIER = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(HIER, '../dist')
const PORT = 4179
const ADRESSE = `http://localhost:${PORT}/campbuddy/#/karte`

/**
 * Netzprofile.
 *
 * „3g" ist bewusst pessimistisch: 400 kbit/s bei 300 ms Latenz ist kein
 * kaputtes Netz, sondern ein normales im Tal. Wer die Karte dort öffnet, ist
 * der Nutzer, für den dieses Produkt gebaut ist.
 */
const NETZE = {
  schnell: null,
  '3g': { download: (400 * 1024) / 8, upload: (200 * 1024) / 8, latenz: 300 },
  '2g': { download: (128 * 1024) / 8, upload: (64 * 1024) / 8, latenz: 600 },
}

const netzName = process.env.NETZ ?? 'schnell'
const netz = NETZE[netzName]
if (netz === undefined) {
  throw new Error(`Unbekanntes Netz '${netzName}'. Bekannt: ${Object.keys(NETZE).join(', ')}`)
}

if (!existsSync(resolve(DIST, 'index.html'))) {
  throw new Error('dist/ fehlt oder ist leer — erst `npm run build` laufen lassen.')
}

/* ------------------------------------------------------- Vorschauserver */

const server = spawn(process.execPath, [resolve(HIER, 'vorschau-kopfzeilen.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'ignore', 'inherit'],
})
const aufraeumen = () => server.kill()
process.on('exit', aufraeumen)
process.on('SIGINT', () => { aufraeumen(); process.exit(130) })

// Warten, bis der Server antwortet — ein fester Schlaf wäre entweder zu kurz
// (Fehlschlag) oder zu lang (Wartezeit bei jedem Aufruf).
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://localhost:${PORT}/campbuddy/`)
    if (r.ok) break
  } catch { /* noch nicht da */ }
  await new Promise((f) => setTimeout(f, 100))
}

/* --------------------------------------------------------------- Helfer */

/** Die drei Kachelserver von OpenTopoMap sind einer, für die Bilanz. */
const kurzerHost = (host) => host.replace(/^[abc]\.tile\./, 'tile.')

/** Grobe Einordnung eines Pfads, damit die Ausgabe lesbar bleibt. */
function gruppeFuer(pfad) {
  if (/\/assets\/-?\d+_-?\d+-/.test(pfad)) return 'eigene Kacheln (Gipfel/Natur/Gemeinden)'
  if (/\/assets\/(zonen|punkte|gemeinden|kantone|gipfel|natur|beispiel)\./.test(pfad)) {
    return 'eigene Kartendaten'
  }
  if (pfad.endsWith('.js')) return 'eigenes JavaScript'
  if (pfad.endsWith('.css')) return 'eigenes CSS'
  if (pfad.endsWith('.woff2')) return 'eigene Schrift'
  if (/\.(webp|png|jpe?g|svg)$/.test(pfad)) return 'eigene Bilder'
  return 'eigenes Übriges'
}

/* ------------------------------------------------------------- Messung */

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const kontext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const seite = await kontext.newPage()
const cdp = await kontext.newCDPSession(seite)
await cdp.send('Network.enable')

// Die Drosselung gilt pro Seite, nicht pro Kontext — sie muss deshalb an
// genau die Seite, die danach gemessen wird. Hing sie an einer anderen, lief
// die Messung stillschweigend ungedrosselt und meldete Traumwerte.
if (netz) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: netz.latenz,
    downloadThroughput: netz.download,
    uploadThroughput: netz.upload,
  })
}

const adressen = new Map()
let posten = new Map()
let offen = 0
let zuletzt = Date.now()
let zaehlen = false

/*
 * Nur fremde Bytes werden im Browser gezählt.
 *
 * Die eigenen kommen vom Vorschauserver (`/__messung`), und zwar aus einem
 * handfesten Grund: Der Service Worker holt Dateien in seinem eigenen Prozess,
 * und die Netzwerk-Sicht einer Seite endet an dieser Grenze. Gemessen sah der
 * erste Besuch dadurch so aus, als hätte er die 584 KB Kartendaten gratis
 * bekommen — sie waren geladen, nur eben nebenan. Was der Server gesendet hat,
 * ist dagegen eindeutig.
 */
function buchen(url, bytes) {
  const u = new URL(url)
  if (u.host === `localhost:${PORT}`) return
  const gruppe = `fremd: ${kurzerHost(u.host)}`
  const alt = posten.get(gruppe) ?? { anzahl: 0, bytes: 0 }
  posten.set(gruppe, { anzahl: alt.anzahl + 1, bytes: alt.bytes + bytes })
}

/** Zählstand des Servers holen und zurücksetzen. */
async function serverBytes(zuruecksetzen = false) {
  const res = await fetch(`http://localhost:${PORT}/__messung${zuruecksetzen ? '?reset=1' : ''}`)
  return res.json()
}

const zaehlbar = (url) => zaehlen && url && /^https?:/.test(url)
const teilmengen = new Map()

cdp.on('Network.requestWillBeSent', (e) => {
  adressen.set(e.requestId, e.request.url)
  if (zaehlbar(e.request.url)) { offen++; zuletzt = Date.now() }
})

/*
 * Die Bytes stückweise mitzählen.
 *
 * `loadingFinished.encodedDataLength` sollte die Gesamtmenge tragen, tut es
 * aber nicht zuverlässig: für Dateien, die über `fetch` oder von der
 * Stil-Engine geholt werden — also gerade für unsere Kartendaten und die
 * Schrift — steht dort null. Gemessen sah der erste Besuch dadurch so aus, als
 * hätte er die 584 KB Kartendaten gratis bekommen.
 *
 * `dataReceived` feuert dagegen pro Datenpaket und stimmt. Genommen wird das
 * Grössere von beidem, damit auch Antworten ohne Paket-Ereignisse zählen.
 */
cdp.on('Network.dataReceived', (e) => {
  if (!zaehlbar(adressen.get(e.requestId))) return
  teilmengen.set(e.requestId, (teilmengen.get(e.requestId) ?? 0) + (e.encodedDataLength || 0))
  zuletzt = Date.now()
})

cdp.on('Network.loadingFinished', (e) => {
  const url = adressen.get(e.requestId)
  if (!zaehlbar(url)) return
  offen = Math.max(0, offen - 1)
  zuletzt = Date.now()
  buchen(url, Math.max(e.encodedDataLength ?? 0, teilmengen.get(e.requestId) ?? 0))
  teilmengen.delete(e.requestId)
})

cdp.on('Network.loadingFailed', (e) => {
  if (!zaehlbar(adressen.get(e.requestId))) return
  offen = Math.max(0, offen - 1)
  zuletzt = Date.now()
})

async function durchgang(beschriftung) {
  posten = new Map()
  teilmengen.clear()
  offen = 0
  zuletzt = Date.now()
  zaehlen = true

  await serverBytes(true)
  const start = Date.now()
  await seite.goto(ADRESSE, { waitUntil: 'load', timeout: 180_000 })
  const geladen = Date.now() - start

  /*
   * Warten, bis das Netz ruhig ist, statt eine feste Zeit abzusitzen.
   *
   * Ruhe heisst: nichts mehr unterwegs, und seit einer Weile nichts Neues.
   * Beide Hälften sind nötig. Nur auf neue Anfragen zu achten übersieht eine
   * einzelne lange Übertragung; nur auf abgeschlossene zu achten hält eine
   * laufende für eine Pause. Unter Drosselung liegen zwischen dem Beginn einer
   * Anfrage und ihrem Ende zweistellige Sekunden.
   */
  const RUHE = netz ? 6_000 : 2_500
  const FRIST = netz ? 240_000 : 60_000
  while ((offen > 0 || Date.now() - zuletzt < RUHE) && Date.now() - start < FRIST) {
    await seite.waitForTimeout(500)
  }
  const fertig = Date.now() - start - RUHE

  zaehlen = false

  // Die eigenen Bytes aus dem Server nachtragen, gruppiert wie die fremden.
  for (const [pfad, bytes] of Object.entries(await serverBytes(true))) {
    const gruppe = gruppeFuer(pfad)
    const alt = posten.get(gruppe) ?? { anzahl: 0, bytes: 0 }
    posten.set(gruppe, { anzahl: alt.anzahl + 1, bytes: alt.bytes + bytes })
  }

  return { beschriftung, geladen, fertig: Math.max(fertig, geladen), posten }
}

const kalt = await durchgang('kalt (neuer Besucher)')
const warm = await durchgang('warm (Wiederbesuch)')

await browser.close()
server.kill()

/* --------------------------------------------------------------- Bericht */

const kb = (b) => Math.round(b / 1024)

function zeige({ beschriftung, geladen, fertig, posten: p }) {
  const reihen = [...p.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
  const summe = (nurEigen) => reihen
    .filter(([k]) => !nurEigen || !k.startsWith('fremd:'))
    .reduce((s, [, v]) => s + v.bytes, 0)

  console.log(`\n  ${beschriftung}`)
  console.log(`  ${'—'.repeat(60)}`)
  for (const [name, v] of reihen) {
    console.log(`   ${name.padEnd(42)} ${String(kb(v.bytes)).padStart(5)} KB  ${String(v.anzahl).padStart(3)}×`)
  }
  const eigen = summe(true)
  console.log(`   ${'davon von uns'.padEnd(42)} ${String(kb(eigen)).padStart(5)} KB`)
  console.log(`   ${'insgesamt über die Leitung'.padEnd(42)} ${String(kb(summe(false))).padStart(5)} KB`)
  console.log(`   ${'bis load-Ereignis'.padEnd(42)} ${String(geladen).padStart(5)} ms`)
  console.log(`   ${'bis die Karte vollständig ist'.padEnd(42)} ${String(fertig).padStart(5)} ms`)
  return eigen
}

console.log(`\n  Kaltstart-Messung — Netzprofil: ${netzName}`)
console.log('  Gezählt werden Bytes über die Leitung, komprimiert und mit Kopfzeilen.')
const k = zeige(kalt)
const w = zeige(warm)

const gespart = k > 0 ? Math.round((1 - w / k) * 100) : 0
console.log(`\n  Der Wiederbesuch holt ${gespart} % unserer eigenen Bytes nicht mehr aus dem Netz.`)
console.log('  Bleibt dieser Wert klein, arbeitet der Service Worker nicht — dann')
console.log('  zuerst prüfen, ob sw.js ausgeliefert und angemeldet wird.\n')
