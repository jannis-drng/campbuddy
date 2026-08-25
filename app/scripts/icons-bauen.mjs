/**
 * Erzeugt die Icon-Dateien aus der Bildmarke.
 *
 * Warum ein Skript und nicht ein paar von Hand exportierte PNGs: die Marke
 * steckt sonst in vier Dateien gleichzeitig, und beim nächsten Feinschliff
 * ändert man drei davon. Hier steht die Geometrie einmal, alles andere fällt
 * heraus. Das Gegenstück in der Oberfläche ist `src/components/Marke.tsx` —
 * wer dort etwas ändert, ändert es auch hier (und umgekehrt).
 *
 *   node scripts/icons-bauen.mjs
 *
 * Gerastert wird mit dem installierten Chrome über playwright-core, aus
 * demselben Grund wie bei `kaltstart-messen.mjs`: kein zusätzliches
 * Bildwerkzeug, das jeder erst installieren müsste.
 *
 * Erzeugt:
 *   public/icon.svg            — App-Icon, Vektor (Manifest, „any maskable")
 *   public/apple-touch-icon.png — 180 px, iOS-Startbildschirm
 *   public/favicon-32.png      — 32 px, Browser-Tab (reduzierte Marke)
 *   public/icon-512.png        — 512 px, Installationsdialog und Social-Profilbild
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const OEFFENTLICH = resolve(HIER, '../public')

/* --- Die Marke, einmal ---------------------------------------------------- */

const FARBE = { grund: '#0C1113', grat: '#24749B', zelt: '#5AAFD4', tuer: '#8CCAE6' }

/**
 * Zelt vor zwei Graten, in einem 32er-Raster.
 *
 * `umriss` ist der tatsächlich bemalte Bereich inklusive der halben
 * Strichbreite an den runden Enden — ohne ihn sässe die Marke sichtbar zu tief
 * und zu klein in ihrer Fläche, weil das Raster unten und oben Luft hat.
 */
const VOLL = `
    <path d="M2.4 26 6.2 16.6 9.1 21M19.5 20 24.6 6.8 29.6 26"
          fill="none" stroke="${FARBE.grat}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M14.6 11.6 23 26H6.2Z" fill="none" stroke="${FARBE.zelt}" stroke-width="2.1" stroke-linejoin="round"/>
    <path d="M14.6 18.6 17.9 26h-6.6Z" fill="${FARBE.tuer}"/>
    <path d="M2.4 26h27.2" stroke="${FARBE.zelt}" stroke-width="2.2" stroke-linecap="round"/>`
const VOLL_UMRISS = { x: 1.3, y: 5.9, breite: 29.4, hoehe: 21.2 }

/** Nur das Zelt — unter etwa 40 px zerfallen die Grate zu Grieß. */
const REDUZIERT = `
    <path d="M16 8 26.4 26H5.6Z" fill="none" stroke="${FARBE.zelt}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M16 16.6 20 26h-8Z" fill="${FARBE.tuer}"/>
    <path d="M3.4 26h25.2" stroke="${FARBE.zelt}" stroke-width="2.4" stroke-linecap="round"/>`
const REDUZIERT_UMRISS = { x: 2.2, y: 6.8, breite: 27.6, hoehe: 20.4 }

/**
 * Marke auf dunkler, abgerundeter Fläche.
 *
 * Die Fläche ist nötig, nicht hübsch: das Icon landet auf fremdem Grund —
 * hellem Browser-Tab, hellem Startbildschirm — und die helle Zelttür wäre
 * dort sonst unsichtbar.
 *
 * `fuellung` ist die Breite der Marke im Verhältnis zur Kantenlänge. Sie ist
 * je Datei verschieden, weil die Ziele verschieden sind: Android schneidet aus
 * einem „maskable"-Icon einen Kreis, dessen Durchmesser 80 % der Kante misst —
 * dort muss die halbe Diagonale der Marke hineinpassen, sonst fehlen die Enden
 * der Bodenlinie. Ein Favicon wird nie beschnitten und darf fast bis an den
 * Rand laufen.
 */
const badge = (inhalt, umriss, { kante = 48, fuellung = 0.72 } = {}) => {
  const skala = (fuellung * kante) / umriss.breite
  const x = kante / 2 - skala * (umriss.x + umriss.breite / 2)
  const y = kante / 2 - skala * (umriss.y + umriss.hoehe / 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${kante} ${kante}" width="${kante}" height="${kante}">
  <rect width="${kante}" height="${kante}" rx="${(kante * 0.23).toFixed(2)}" fill="${FARBE.grund}"/>
  <g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${skala.toFixed(4)})">${inhalt}
  </g>
</svg>`
}

/* --- Vektor schreiben ----------------------------------------------------- */

const kopf = `<!--
  Erzeugt von scripts/icons-bauen.mjs — nicht von Hand ändern.
  Die Marke selbst liegt in src/components/Marke.tsx und in jenem Skript.
-->
`
writeFileSync(resolve(OEFFENTLICH, 'icon.svg'), kopf + badge(VOLL, VOLL_UMRISS, { fuellung: 0.64 }) + '\n')
console.log('icon.svg')

/* --- Rastern -------------------------------------------------------------- */

const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ channel: 'chrome', headless: true })

const AUFTRAEGE = [
  { datei: 'apple-touch-icon.png', kante: 180, inhalt: VOLL, umriss: VOLL_UMRISS, fuellung: 0.76 },
  { datei: 'icon-512.png', kante: 512, inhalt: VOLL, umriss: VOLL_UMRISS, fuellung: 0.76 },
  { datei: 'favicon-32.png', kante: 32, inhalt: REDUZIERT, umriss: REDUZIERT_UMRISS, fuellung: 0.84 },
]

for (const { datei, kante, inhalt, umriss, fuellung } of AUFTRAEGE) {
  const seite = await browser.newPage({ viewport: { width: kante, height: kante } })
  await seite.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${badge(inhalt, umriss, { kante, fuellung })}`,
  )
  await seite.screenshot({
    path: resolve(OEFFENTLICH, datei),
    omitBackground: true,
    clip: { x: 0, y: 0, width: kante, height: kante },
  })
  await seite.close()
  console.log(datei, `— ${kante}×${kante}`)
}

await browser.close()
