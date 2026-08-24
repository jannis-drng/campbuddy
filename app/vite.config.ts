import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
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
const BASIS = process.env.VITE_BASE ?? '/campbuddy/'
const ORIGIN = (process.env.VITE_ORIGIN ?? 'https://jannis-drng.github.io').replace(/\/+$/, '')

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
  const roh = process.env.VITE_SUPABASE_URL?.trim()
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
function adressenEinsetzen(): Plugin {
  const ersetzen = (text: string) =>
    text
      .replaceAll('%BASIS%', BASIS)
      .replaceAll('%ORIGIN%', ORIGIN)
      .replaceAll('%SUPABASE%', supabaseHerkunft())

  return {
    name: 'campbuddy-adressen',
    transformIndexHtml: { order: 'pre', handler: ersetzen },
    closeBundle() {
      const dist = (datei: string) => new URL(`dist/${datei}`, `file://${HIER}`)
      const seite = dist('404.html')
      writeFileSync(seite, ersetzen(readFileSync(seite, 'utf8')))
      writeFileSync(dist('_headers'), ersetzen(readFileSync(`${HIER}_headers.vorlage`, 'utf8')))
    },
  }
}

export default defineConfig({
  base: BASIS,
  plugins: [react(), tailwindcss(), adressenEinsetzen()],
  build: { outDir: 'dist' },
})
