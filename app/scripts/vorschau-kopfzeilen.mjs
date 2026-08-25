/**
 * Vorschau des Builds — mit den Kopfzeilen, die Cloudflare später sendet.
 *
 * `vite preview` liefert dist/ aus, ignoriert aber `_headers`. Genau daran
 * scheitert der interessante Teil einer strengen Content-Security-Policy: sie
 * fällt erst auf, wenn sie tatsächlich mitgeschickt wird, und dann steht sie
 * bereits live. Dieser Server liest `dist/_headers`, wendet die Regeln an und
 * verhält sich damit so wie Cloudflare Pages — inklusive 404.html für
 * unbekannte Pfade.
 *
 * Nutzung:  node scripts/vorschau-kopfzeilen.mjs   (nach einem Build)
 *
 * Bewusst schlicht: das ist ein Prüfwerkzeug, kein Produktionsserver. Es
 * unterstützt vom `_headers`-Format nur, was wir benutzen — Pfadmuster mit
 * höchstens einem abschliessenden `*`.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const PORT = Number(process.env.PORT ?? 4178)

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/** Liest `_headers` in Regeln: [Pfadmuster, {Kopfzeile: Wert}]. */
function regelnLesen() {
  const pfad = join(DIST, '_headers')
  if (!existsSync(pfad)) {
    console.warn('Kein dist/_headers — erst bauen. Server läuft ohne Kopfzeilen.')
    return []
  }
  const regeln = []
  for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
    if (!zeile.trim() || zeile.trimStart().startsWith('#')) continue
    if (!zeile.startsWith(' ') && !zeile.startsWith('\t')) {
      regeln.push([zeile.trim(), {}])
      continue
    }
    const trenner = zeile.indexOf(':')
    if (trenner < 0 || regeln.length === 0) continue
    regeln.at(-1)[1][zeile.slice(0, trenner).trim()] = zeile.slice(trenner + 1).trim()
  }
  return regeln
}

const REGELN = regelnLesen()

/**
 * Unter welchem Pfad der Build ausgeliefert werden will.
 *
 * GitHub Pages liefert unter /<repo>/, eine eigene Domain unter /. Der Build
 * schreibt den Pfad fest in die Asset-Adressen, und dieser Server lieferte
 * bisher stur ab dist/ — ein Build mit `/campbuddy/` liess sich damit gar
 * nicht ansehen, alle Anfragen liefen in die 404. Statt den Pfad hier ein
 * zweites Mal zu konfigurieren, wird er aus index.html abgelesen: dort steht
 * er, und dort stimmt er per Konstruktion.
 */
function basisLesen() {
  const pfad = join(DIST, 'index.html')
  if (!existsSync(pfad)) return '/'
  const treffer = readFileSync(pfad, 'utf8').match(/(?:src|href)="(\/[^"]*?\/)assets\//)
  return treffer ? treffer[1] : '/'
}

const BASIS = basisLesen()

const passt = (muster, pfad) =>
  muster.endsWith('*') ? pfad.startsWith(muster.slice(0, -1)) : muster === pfad

createServer(async (anfrage, antwort) => {
  const pfad = decodeURIComponent(new URL(anfrage.url, 'http://x').pathname)
  // Den Basispfad abstreifen, bevor im Verzeichnis gesucht wird — die Regeln
  // aus _headers gelten dagegen für den ungekürzten Pfad, so wie beim CDN.
  const ohneBasis = BASIS !== '/' && pfad.startsWith(BASIS) ? pfad.slice(BASIS.length - 1) : pfad
  const sicher = normalize(ohneBasis).replace(/^(\.\.[/\\])+/, '')
  let datei = join(DIST, sicher.endsWith('/') ? `${sicher}index.html` : sicher)

  let inhalt
  try {
    inhalt = await readFile(datei)
  } catch {
    datei = join(DIST, '404.html')
    inhalt = await readFile(datei).catch(() => Buffer.from('Nicht gefunden'))
    antwort.statusCode = 404
  }

  for (const [muster, kopfzeilen] of REGELN) {
    if (!passt(muster, pfad)) continue
    for (const [name, wert] of Object.entries(kopfzeilen)) antwort.setHeader(name, wert)
  }
  antwort.setHeader('Content-Type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  antwort.end(inhalt)
}).listen(PORT, () => {
  console.log(`Vorschau mit Kopfzeilen: http://localhost:${PORT}${BASIS}`)
  console.log(`${REGELN.length} Regel(n) aus dist/_headers übernommen.`)
})
