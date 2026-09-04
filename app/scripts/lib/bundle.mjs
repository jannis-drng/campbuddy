/**
 * Das gebündelte Kartenmaterial nachziehen.
 *
 * Ins Bundle kommt die Fokusregion **plus** jede eingestufte Gemeinde. Das
 * wächst mit der Recherche und bleibt dabei klein, weil es genau die Flächen
 * sind, die etwas zu sagen haben.
 *
 * Warum das hier steht und nicht in einem der Läufer: eine Gemeinde kann auf
 * zwei Wegen eingestuft werden — aus einem gefundenen Reglement oder aus der
 * Antwort der Gemeinde. Lag die Funktion nur beim ersten, war eine per Mail
 * eingestufte Gemeinde zwar in der Rechtsdatei, ihre Fläche aber nicht im
 * Bundle: eingestuft und trotzdem unsichtbar, ohne dass es irgendwo auffällt.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Die Region, die immer vollständig mitkommt — auch ungeprüft. */
const FOKUS = 'CH-VS'

export function bundleNachziehen(rechtGemeinden, { still = false } = {}) {
  const voll = resolve(ROOT, 'import/CH/gemeinden/CH.json')
  const ziel = resolve(ROOT, 'src/data/gemeinden', `${FOKUS}.json`)
  if (!existsSync(voll)) {
    if (!still) console.log(`\n${voll} fehlt — Bundle unverändert.`)
    return null
  }

  const alle = JSON.parse(readFileSync(voll, 'utf8')).features
  const teil = alle.filter((f) => (
    f.properties.kanton === FOKUS || rechtGemeinden[String(f.properties.bfs)]
  ))
  const fc = { type: 'FeatureCollection', features: teil }
  writeFileSync(ziel, JSON.stringify(fc) + '\n')

  const kb = Math.round(JSON.stringify(fc).length / 1024)
  const auswaerts = teil.filter((f) => f.properties.kanton !== FOKUS).length
  if (!still) console.log(`Bundle: ${teil.length} Flächen (${auswaerts} ausserhalb des Wallis), ${kb} KB`)
  return { flaechen: teil.length, kb }
}
