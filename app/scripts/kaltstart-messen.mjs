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
 */
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
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

/* ------------------------------------------------------------- Messung */

/** Was schon komprimiert ist, wird durch gzip nicht kleiner — nur die Zahl falsch. */
function schonGepackt(pfad) {
  return /\.(webp|png|jpe?g|woff2?|avif)$/.test(pfad)
}

/** Die drei Kachelserver von OpenTopoMap sind einer, für die Bilanz. */
function kurzerHost(host) {
  return host.replace(/^[abc]\.tile\./, 'tile.')
}


const browser = await chromium.launch({ channel: 'chrome', headless: true })

/**
 * Ein Durchgang.
 *
 * Gezählt wird die gepackte Grösse, weil das ist, was über die Leitung geht.
 * Der Vorschauserver packt nicht selbst (er ist ein Prüfwerkzeug, kein CDN),
 * deshalb packen wir hier — dieselbe Zahl, die Cloudflare senden würde, eher
 * etwas pessimistischer als brotli.
 */
async function durchgang(seite, beschriftung) {
  const posten = new Map()

  const zaehler = async (antwort) => {
    // blob: und data: sind keine Netzanfragen — MapLibre baut daraus seinen
    // Web Worker. Sie mitzuzählen hätte im ersten Lauf 466 KB erfunden.
    if (!/^https?:/.test(antwort.url())) return

    const url = new URL(antwort.url())
    const fremd = url.host !== `localhost:${PORT}`
    const gruppe = fremd ? `fremd: ${kurzerHost(url.host)}` : gruppeFuer(url.pathname)
    let bytes = 0
    try {
      const roh = await antwort.body()
      bytes = schonGepackt(url.pathname) || fremd ? roh.length : gzipSync(roh, { level: 9 }).length
    } catch { /* abgebrochene oder aus dem Cache bediente Antwort */ }
    const alt = posten.get(gruppe) ?? { anzahl: 0, bytes: 0 }
    posten.set(gruppe, { anzahl: alt.anzahl + 1, bytes: alt.bytes + bytes })
  }

  /*
   * Ruhe heisst: nichts mehr unterwegs, und seit einer Weile nichts Neues.
   *
   * Beide Hälften sind nötig, und beide sind teuer erkauft. Nur auf `response`
   * zu hören war falsch, weil das schon beim Kopf feuert — unter Drosselung
   * liegen zwischen Kopf und fertigem Körper zweistellige Sekunden. Nur auf
   * `requestfinished` zu hören war ebenfalls falsch, weil eine einzelne lange
   * Übertragung dann wie eine Pause aussieht. Also wird mitgezählt, was offen
   * ist.
   */
  let offen = 0
  let zuletzt = Date.now()
  const auf = () => { offen++; zuletzt = Date.now() }
  const zu = () => { offen = Math.max(0, offen - 1); zuletzt = Date.now() }
  seite.on('request', auf)
  seite.on('requestfinished', zu)
  seite.on('requestfailed', zu)
  seite.on('response', zaehler)

  const start = Date.now()
  await seite.goto(ADRESSE, { waitUntil: 'load', timeout: 180_000 })
  const geladen = Date.now() - start

  // Warten, bis das Netz ruhig ist, statt eine feste Zeit abzusitzen. Eine
  // feste Wartezeit ist bei jedem Netzprofil falsch: auf schnellem Netz
  // verschenkt sie Zeit, auf gedrosseltem schneidet sie die Messung mitten im
  // Laden ab und meldet dann zu wenig Bytes als Erfolg.
  const RUHE = netz ? 6_000 : 2_500
  const FRIST = netz ? 240_000 : 45_000
  while ((offen > 0 || Date.now() - zuletzt < RUHE) && Date.now() - start < FRIST) {
    await seite.waitForTimeout(500)
  }
  const fertig = Date.now() - start

  seite.off('request', auf)
  seite.off('requestfinished', zu)
  seite.off('requestfailed', zu)
  seite.off('response', zaehler)

  return { beschriftung, geladen, fertig: fertig - RUHE, posten }
}

/** Grobe Einordnung eines Pfads, damit die Ausgabe lesbar bleibt. */
function gruppeFuer(pfad) {
  if (/\/assets\/-?\d+_-?\d+-/.test(pfad)) return 'eigene Kacheln (Gipfel/Natur/Gemeinden)'
  if (/\/assets\/(zonen|punkte|gemeinden|kantone|gipfel|natur|beispiel)\./.test(pfad)) return 'eigene Kartendaten'
  if (pfad.endsWith('.js')) return 'eigenes JavaScript'
  if (pfad.endsWith('.css')) return 'eigenes CSS'
  if (pfad.endsWith('.woff2')) return 'eigene Schrift'
  if (/\.(webp|png|jpe?g|svg)$/.test(pfad)) return 'eigene Bilder'
  return 'eigenes Übriges'
}

const kontext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const seite = await kontext.newPage()

// Die Drosselung gilt pro Seite, nicht pro Kontext — sie muss deshalb an
// genau die Seite, die danach gemessen wird. Hing sie an einer anderen, lief
// die Messung stillschweigend ungedrosselt und meldete Traumwerte.
if (netz) {
  const cdp = await kontext.newCDPSession(seite)
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: netz.latenz,
    downloadThroughput: netz.download,
    uploadThroughput: netz.upload,
  })
}
const kalt = await durchgang(seite, 'kalt (neuer Besucher)')
// Zweiter Durchgang im selben Kontext: HTTP-Cache und Service Worker stehen.
const warm = await durchgang(seite, 'warm (Wiederbesuch)')

await browser.close()
server.kill()

/* --------------------------------------------------------------- Bericht */

const kb = (b) => (b / 1024).toFixed(0)

function zeige({ beschriftung, geladen, fertig, posten }) {
  const reihen = [...posten.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
  const gesamt = reihen.reduce((s, [, v]) => s + v.bytes, 0)
  const eigen = reihen.filter(([k]) => !k.startsWith('fremd:'))
    .reduce((s, [, v]) => s + v.bytes, 0)

  console.log(`\n  ${beschriftung}`)
  console.log(`  ${'—'.repeat(58)}`)
  for (const [name, v] of reihen) {
    if (v.bytes < 1024 && v.anzahl < 3) continue
    console.log(`   ${name.padEnd(42)} ${String(kb(v.bytes)).padStart(5)} KB  ${String(v.anzahl).padStart(3)}×`)
  }
  console.log(`   ${'davon von uns'.padEnd(42)} ${String(kb(eigen)).padStart(5)} KB`)
  console.log(`   ${'insgesamt über die Leitung'.padEnd(42)} ${String(kb(gesamt)).padStart(5)} KB`)
  console.log(`   ${'bis load-Ereignis'.padEnd(42)} ${String(geladen).padStart(5)} ms`)
  console.log(`   ${'bis die Karte vollständig ist'.padEnd(42)} ${String(Math.max(fertig, geladen)).padStart(5)} ms`)
  return { gesamt, eigen }
}

console.log(`\n  Kaltstart-Messung — Netzprofil: ${netzName}`)
const k = zeige(kalt)
const w = zeige(warm)

const gespart = k.eigen > 0 ? Math.round((1 - w.eigen / k.eigen) * 100) : 0
console.log(`\n  Der Wiederbesuch holt ${gespart} % unserer eigenen Bytes nicht mehr.`)
console.log('  Bleibt dieser Wert klein, arbeitet der Service Worker nicht — dann')
console.log('  zuerst prüfen, ob sw.js ausgeliefert und angemeldet wird.\n')
