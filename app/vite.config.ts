import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HIER = fileURLToPath(new URL('.', import.meta.url))

/**
 * Wo die App liegt — und unter welcher Adresse sie erreichbar ist.
 *
 * GitHub Pages liefert unter /<repo>/ aus, eine eigene Domain unter /. Beides
 * muss gleichzeitig funktionieren können, solange der Umzug läuft und beide
 * Adressen live sind. Deshalb steht der Pfad an genau einer Stelle und wird
 * überall eingesetzt, statt in drei Dateien getippt zu werden.
 *
 * Cloudflare Pages:  VITE_BASE=/  VITE_ORIGIN=https://<domain>
 * GitHub Pages:      nichts setzen — die Vorgaben unten passen.
 */
/**
 * `loadEnv` statt `process.env`: Vite reicht Werte aus `.env.local` nur an den
 * Anwendungscode weiter, nicht an diese Konfigurationsdatei. Über
 * `process.env` gelesen wäre die Supabase-Adresse beim gewöhnlichen
 * `npm run build` also leer — und die CSP fiele still auf ein Platzhalter-
 * zeichen zurück. Die lokale Prüfung träfe dann auf eine schwächere Regel als
 * die ausgelieferte, was eine Prüfung wertlos macht. `loadEnv` liest beides:
 * die Dateien hier und die echten Umgebungsvariablen des Bau-Servers.
 */
const umgebung = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'VITE_')

const BASIS = umgebung.VITE_BASE ?? '/campbuddy/'

/**
 * Ein Stempel je Build, für den Cache-Namen des Service Workers.
 *
 * Er entscheidet, wann alte Einträge weggeräumt werden. Dass dabei auch
 * unveränderte Dateien aus dem Cache fliegen, kostet nichts: sie tragen einen
 * Inhalts-Hash und liegen unbegrenzt im HTTP-Cache des Browsers — sie kommen
 * von dort zurück, nicht aus dem Netz.
 */
const BAU = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const ORIGIN = (umgebung.VITE_ORIGIN ?? 'https://jannis-drng.github.io').replace(/\/+$/, '')

/**
 * Der Zähler von Cloudflare Web Analytics — als Schnipsel, nicht automatisch.
 *
 * Cloudflare kann das Beacon beim Ausliefern selbst in die Seite schreiben,
 * aber nur bei Seiten, die durch den Proxy laufen. CampBuddy liegt hinter einem
 * Worker mit statischen Dateien; dort geschieht das nicht, und genau deshalb
 * hat die Messung monatelang nichts erhoben, obwohl sie im Dashboard
 * eingeschaltet war. Der Schnipsel von Hand ist der Weg, der hier funktioniert.
 *
 * Das Kennzeichen steht im Dashboard unter Web Analytics und ist kein Geheimnis
 * — es steht anschliessend im ausgelieferten HTML. Es kommt trotzdem aus der
 * Umgebung und nicht aus dem Quelltext, weil Vorschau und Entwicklung sonst in
 * dieselbe Statistik zählten wie die echte Seite.
 *
 * `type="module"` gehört dazu: es hält das Beacon von Browsern fern, die seine
 * Syntax nicht verstehen. Ohne Kennzeichen bleibt die Zeile leer — die Seite
 * lädt dann schlicht nichts nach.
 */
const BEACON = umgebung.VITE_CF_BEACON_TOKEN?.trim()
  ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js"`
    + ` data-cf-beacon='{"token": "${umgebung.VITE_CF_BEACON_TOKEN.trim()}"}'></script>`
  : ''

/**
 * Die Herkunft des Supabase-Projekts für die CSP.
 *
 * Ohne konfigurierte Umgebung bliebe sonst ein Platzhalter in der Kopfzeile
 * stehen und die Anmeldung wäre im Browser blockiert — mit einer Fehlermeldung,
 * die auf alles Mögliche zeigt, nur nicht auf die Ursache. Der Rückfall auf das
 * Platzhalterzeichen ist weiter gefasst als nötig, aber er hält die Seite
 * funktionsfähig; der Regelfall ist die exakte Adresse aus der Umgebung.
 */
function supabaseHerkunft(): string {
  const roh = umgebung.VITE_SUPABASE_URL?.trim()
  if (!roh) return 'https://*.supabase.co'
  try {
    return new URL(roh).origin
  } catch {
    return 'https://*.supabase.co'
  }
}

/**
 * Setzt Basispfad, Domain und Supabase-Herkunft in die Dateien ein, die Vite
 * sonst unangetastet liesse: die 404-Seite (liegt in public/ und wird roh
 * kopiert) und die Kopfzeilen-Vorlage für Cloudflare.
 */
/**
 * Welche Dateien der Service Worker beim Einrichten mitnehmen soll.
 *
 * Er kann sie nicht selbst kennen: ihre Namen tragen einen Inhalts-Hash und
 * stehen erst nach dem Bauen fest. Ohne diese Liste cachte er nur, was nach
 * seiner Übernahme noch angefragt wird — und weil er sich erst nach `load`
 * anmeldet, war das beim ersten Besuch nichts. Offline stand dann die Hülle
 * ohne eine einzige Zone darin.
 *
 * Bewusst nur der Kern: die Bündel, die vier Datendateien, die beim Öffnen
 * gebraucht werden, die Kachelverzeichnisse und die lateinische Schrift. Die
 * Kacheln selbst bleiben draussen — es sind über dreihundert, und welche
 * jemand braucht, hängt davon ab, wo er hinsieht. Sie landen im Cache, wenn
 * sie zum ersten Mal geholt werden.
 */
function kernAssets(): string[] {
  const verzeichnis = fileURLToPath(new URL('dist/assets/', `file://${HIER}`))
  const muster = [
    /^index-.*\.(js|css)$/, /^App-.*\.(js|css)$/,
    /^zonen\./, /^punkte\./, /^gemeinden\.uebersicht\./, /^kantone\./, /^gipfel\.hoch\./,
    /^(gipfel|natur|gemeinden)\.CH-/,
    /^inter-latin-opsz-normal-.*\.woff2$/,
  ]
  return readdirSync(verzeichnis)
    .filter((n) => muster.some((m) => m.test(n)))
    .map((n) => `${BASIS}assets/${n}`)
}

function adressenEinsetzen(): Plugin {
  const ersetzen = (text: string) =>
    text
      .replaceAll('%BASIS%', BASIS)
      .replaceAll('%ORIGIN%', ORIGIN)
      .replaceAll('%SUPABASE%', supabaseHerkunft())
      .replaceAll('%BUILD%', BAU)
      .replaceAll('%BEACON%', BEACON)

  return {
    name: 'campbuddy-adressen',
    transformIndexHtml: { order: 'pre', handler: ersetzen },
    closeBundle() {
      const dist = (datei: string) => new URL(`dist/${datei}`, `file://${HIER}`)
      writeFileSync(dist('404.html'), ersetzen(readFileSync(dist('404.html'), 'utf8')))
      const sw = ersetzen(readFileSync(dist('sw.js'), 'utf8'))
      writeFileSync(dist('sw.js'), sw.replace('"%PRECACHE%"', JSON.stringify(kernAssets())))
      writeFileSync(dist('_headers'), ersetzen(readFileSync(`${HIER}_headers.vorlage`, 'utf8')))
    },
  }
}

export default defineConfig({
  base: BASIS,
  plugins: [react(), tailwindcss(), adressenEinsetzen()],
  build: {
    outDir: 'dist',
    /**
     * Snapshot-Dateien werden nie eingebettet.
     *
     * Vite steckt Assets unter 4 KB als `data:`-URI ins JavaScript. Für ein
     * Symbolbild ist das richtig — für unsere Datendateien war es doppelt
     * falsch: die kleinen Kachelverzeichnisse landeten im Bündel (also genau
     * dort, wo sie nicht hinsollen), und ein `fetch` darauf scheiterte an der
     * eigenen Content-Security-Policy, weil `connect-src` kein `data:` erlaubt.
     *
     * Das Ergebnis war ein Fehler ohne Fehlermeldung: die Kachelebenen blieben
     * einfach leer. Genau deshalb steht diese Regel hier und nicht als
     * Ausnahme in `connect-src` — eingebettete Datendateien wollen wir gar
     * nicht, unabhängig davon, ob man sie laden könnte.
     */
    assetsInlineLimit: (datei) => (datei.includes('/data/snapshot/') ? false : undefined),
  },
})
