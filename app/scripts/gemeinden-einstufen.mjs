/**
 * Aus recherchierten Fundstellen belegte Einstufungen machen.
 *
 * Der Trick, mit dem das überhaupt in vernünftiger Zeit geht: nicht Gemeinden
 * einstufen, sondern **Formulierungen**. Sehr viele Schweizer Gemeinden
 * übernehmen das Musterreglement ihres Kantons oder Verbands wortgleich —
 * „Le camping, le caravaning et ce qui leur est assimilable sont interdits en
 * dehors des emplacements autorisés" steht im Wallis in Dutzenden Reglementen.
 * Wer diesen einen Satz einmal gelesen und eingeordnet hat, hat ihn für alle
 * gelesen.
 *
 * Deshalb: ein Mensch pflegt in `gemeinden.muster.json` die Formulierungen und
 * ihre rechtliche Lesart. Dieses Skript trägt sie auf die Gemeinden auf, deren
 * gefundener Artikel dazu passt — **mit deren eigenem Reglement als Quelle**,
 * nicht mit dem Muster. Belegt ist am Ende jede Gemeinde durch ihr eigenes
 * Dokument, mit Artikelnummer und Adresse.
 *
 * Was nicht passt, bleibt liegen. Eine Gemeinde ohne Einstufung ist ein
 * gültiger Zustand; eine geratene wäre es nicht.
 *
 * Aufruf:  node scripts/gemeinden-einstufen.mjs [--schreiben]
 * Ohne --schreiben wird nur berichtet, was passieren würde.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SCHREIBEN = process.argv.includes('--schreiben')
const NEU_BERECHNEN = process.argv.includes('--neu-berechnen')
const HEUTE = new Date().toISOString().slice(0, 10)

const KANDIDATEN = resolve(ROOT, 'import/recherche/kandidaten.json')
const MUSTER = resolve(ROOT, 'src/data/gemeinden.muster.json')
const RECHT = resolve(ROOT, 'src/data/gemeinden.legal.json')

for (const p of [KANDIDATEN, MUSTER, RECHT]) {
  if (!existsSync(p)) throw new Error(`${p} fehlt.`)
}

/**
 * Text auf seinen Kern reduzieren, damit Fassungen zusammenfinden.
 *
 * Reglemente unterscheiden sich in Absatzziffern, Bindestrichen, Anführungs-
 * zeichen und Trennungen — inhaltlich aber nicht. Ohne diese Normalisierung
 * fände ein Muster nur die eine Gemeinde, aus der es abgeschrieben wurde.
 */
const kern = (s) => s
  .toLowerCase()
  .replace(/[’´`]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/[^a-zäöüàâçéèêëîïôùûœ' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/**
 * Den Linktext zu einer brauchbaren Quellenangabe machen.
 *
 * Was auf Gemeindeseiten am PDF hängt, ist selten ein Titel: „Polizeiverordnung
 * Polizeiverordnung.pdf 489,68 KB", eine blosse Erlassnummer, oder gar nichts.
 * Das ist die Zeile, an der jemand die Aussage nachprüft — sie muss sagen,
 * welches Dokument gemeint ist, sonst trägt der Beleg nicht.
 */
/**
 * HTML-Reste aus einem Linktext entfernen.
 *
 * Gemeindeseiten liefern Linktexte samt Entitaeten: &shy; fuer weiche
 * Trennung, &nbsp; als Fuellzeichen, &emsp; als Einzug. Roh uebernommen
 * stehen sie mitten in der Quellenangabe, die jemand lesen soll.
 */
function entschaerft(s) {
  return s
    .replace(/&shy;?/gi, '')
    .replace(/&(nbsp|emsp|ensp|thinsp|#160);?/gi, ' ')
    .replace(/&amp;?/gi, '&')
    .replace(/&(quot|#34);?/gi, '"')
    .replace(/&(apos|#39);?/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
}

/**
 * Aus der Artikelzeile eine Ueberschrift machen, keinen Textanfang.
 *
 * Der Rechercheläufer schneidet nach der Artikelnummer bis zu 80 Zeichen mit —
 * hat der Artikel gar keine Ueberschrift, ist das schon der erste Satz. In der
 * Quellenangabe soll aber „Art. 12 Campieren" stehen und nicht „Art. 12
 * Campieren Das Campieren sowie das Uebernachten in Wohnmobilen und anderen".
 * Abgeschnitten wird am Absatzbeginn: eine angeklebte oder alleinstehende
 * Ziffer ist in schweizerischen Reglementen die Absatznummer.
 */
function artikelLabel(roh) {
  let t = entschaerft(roh ?? '').replace(/\s+/g, ' ').trim()
  const nummer = t.match(/^(Art(?:icle|icolo)?\.?\s*\d+[a-z]?)\s*[:.\-–]?\s*/i)
  const kopf = nummer ? nummer[1].replace(/\s+/g, ' ') : ''
  let rest = nummer ? t.slice(nummer[0].length) : t
  // Absatzbeginn: „1Auf", „1 Auf", „1. Auf" — ab hier faengt der Text an.
  rest = rest.split(/\s*\d+[.)]?\s*(?=[A-ZÄÖÜ])/)[0]

  // Hat der Artikel keine Absatznummer, faengt der Text ohne Trennzeichen an:
  // „Campieren Das Campieren sowie das Uebernachten in ...". Eine Ueberschrift
  // wiederholt kein Wort, eine Ueberschrift samt Textanfang tut es fast immer —
  // beim ersten wiederholten Wort ist die Ueberschrift zu Ende.
  const gesehen = new Set()
  const worte = []
  for (const wort of rest.split(' ').filter(Boolean).slice(0, 6)) {
    const schluessel = wort.toLowerCase().replace(/[^a-zäöüàâçéèêëîïôùûœ]/g, '')
    if (schluessel.length > 3 && gesehen.has(schluessel)) break
    gesehen.add(schluessel)
    worte.push(wort)
  }
  // Beim Abbruch bleibt gern der Artikel des naechsten Satzes haengen —
  // „Campieren Das" statt „Campieren". Fuellwoerter am Ende gehoeren weg.
  const FUELLWORT = /^(das|der|die|den|dem|des|ein|eine|einer|le|la|les|un|une|il|lo|gli|the)$/i
  while (worte.length > 1 && FUELLWORT.test(worte[worte.length - 1])) worte.pop()
  const label = [kopf, worte.join(' ')].filter(Boolean).join(' ').replace(/[\s,;.:\-–]+$/, '')
  return label || t.slice(0, 40)
}

function dokumentTitel(roh, url) {
  let t = entschaerft(roh ?? '')
    // Was Gemeinde-CMS an den Linktext hängen: Dateigrösse, Format, Lesehilfen
    // für Bildschirmleser. Nichts davon benennt das Dokument.
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(?\s*\d+[.,]?\d*\s*(KB|MB|kB|Bytes?)\s*\)?/gi, ' ')
    .replace(/externer\s+link[^,]*|wird\s+in\s+einem\s+neuen\s+fenster\s+ge[öo]ffnet\.?/gi, ' ')
    .replace(/\bdownload\b|\bpdf-?datei\b/gi, ' ')
    .replace(/\.pdf\b/gi, '')
    .replace(/^[\d.]+\s+(?=[A-Za-zÄÖÜ])/, '')
    .replace(/[\s,;.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  // „Polizeiverordnung Polizeiverordnung" — der Linktext wiederholt oft den Dateinamen.
  const worte = t.split(' ')
  if (worte.length > 1 && worte.length % 2 === 0) {
    const halb = worte.length / 2
    if (worte.slice(0, halb).join(' ') === worte.slice(halb).join(' ')) t = worte.slice(0, halb).join(' ')
  }
  // Eine nackte Erlassnummer wie „510.1" benennt das Dokument nicht.
  if (!t || /^[\d.\-\s]+$/.test(t) || t.length < 4) {
    const datei = decodeURIComponent(url.split('/').pop() ?? '')
      .replace(/\.pdf.*$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    t = datei && datei.length > 3 ? datei : 'Kommunales Reglement'
  }
  // Manche Seiten hängen Metadaten mit Trennstrich an. Abgeschnitten mitten im
  // Wort sähe es nach Fehler aus — lieber sauber vor dem Trenner enden.
  t = t.split(/\s+[|·–]\s+/)[0].replace(/\s+PDF$/i, '').trim()
  if (t.length > 80) t = t.slice(0, 80).replace(/\s+\S*$/, '') + '…'
  return t
}

const muster = JSON.parse(readFileSync(MUSTER, 'utf8'))
/**
 * Beide Läufe zusammen: der schlichte Abruf und der Browserlauf.
 *
 * Welchen Weg ein Fund genommen hat, ist für die Einstufung ohne Belang — es
 * zählt das Dokument, nicht die Abrufart. Bei doppelten Gemeinden gewinnt der
 * Eintrag mit Fundstelle.
 */
const BROWSER = resolve(ROOT, 'import/recherche/browser.json')
const ausBrowser = existsSync(BROWSER)
  ? JSON.parse(readFileSync(BROWSER, 'utf8')).ergebnisse.filter((r) => r.stellen?.length)
  : []
const ausAbruf = JSON.parse(readFileSync(KANDIDATEN, 'utf8')).ergebnisse
const kandidaten = [
  ...ausAbruf.filter((a) => !ausBrowser.some((b) => b.bfs === a.bfs && !a.stellen?.length)),
  ...ausBrowser.filter((b) => !ausAbruf.some((a) => a.bfs === b.bfs && a.stellen?.length)),
]
const recht = JSON.parse(readFileSync(RECHT, 'utf8'))

/**
 * Welches Muster passt auf diese Fundstelle? Das erste, das greift.
 *
 * `nur_im_titel` ist die Notbremse für weit gefasste Muster. Die
 * Artikeltrennung scheitert bei manchen PDF-Layouts — dann klebt die
 * Randüberschrift des nächsten Artikels am vorherigen, und ein Block über
 * Veranstaltungen enthält plötzlich auch den Campingsatz. Das Muster würde
 * greifen und die Regel unter der falschen Artikelnummer ablegen. Eine falsche
 * Fundstellenangabe ist schlimmer als eine fehlende: sie behauptet Belegbarkeit,
 * die bei der Nachprüfung zerfällt. Solche Muster greifen deshalb nur, wenn
 * schon die Überschrift vom Campieren handelt.
 */
// `camp` als Wortanfang deckt campieren, camping, camper, campement und
// campeggio zugleich ab. Vorher fehlte die franzoesische Verbform "camper" -
// dadurch fielen gerade die eindeutigsten Artikel durch die Pruefung.
const TITEL_THEMA = /camp|zelt|n[äa]chtig|biwak|bivouac|tende|tenda|roulotte|wohnwagen|wohnmobil/i

function passendesMuster(stelle) {
  const k = kern(stelle.text)
  for (const m of muster.muster) {
    if ((m.erkennt ?? []).length === 0) continue
    if (m.nur_im_titel && !TITEL_THEMA.test(stelle.artikel ?? '')) continue
    // Die zweite Notbremse gegen zusammengeklebte Artikel, und die feinere:
    // ein sauber getrennter Artikel ueber Wohnwagen ist kurz. Wo die
    // Artikeltrennung versagt hat, entsteht ein Block von vielen hundert
    // Zeichen, in dem das Stichwort irgendwo steht - und die Artikelnummer am
    // Anfang gehoert dann nicht mehr dazu.
    if (m.hoechstlaenge && stelle.text.length > m.hoechstlaenge) continue
    const alle = m.erkennt.every((teil) => k.includes(kern(teil)))
    const keins = (m.erkennt_nicht ?? []).some((teil) => k.includes(kern(teil)))
    if (alle && !keins) return m
  }
  return null
}

const neu = {}
const zaehler = {}
let ohneMuster = 0

for (const r of kandidaten) {
  if (!r.bfs || !r.stellen?.length || !r.dokument) continue
  const vorhanden = recht.gemeinden[String(r.bfs)]
  // Von Hand gepflegte Einträge bleiben unangetastet — sie sind an der
  // fehlenden `_muster`-Spur zu erkennen. Maschinell aufgetragene dürfen mit
  // --neu-berechnen neu abgeleitet werden, wenn ein Muster geschärft wurde.
  //
  // Diese Unterscheidung ist nicht kosmetisch: der Eintrag zu Zermatt entstand
  // aus einem Reglement, das der Läufer nie erreicht hat. Wer die Datei
  // pauschal leert und neu ableitet, verliert genau solche Einträge — und
  // merkt es nicht, weil die Gesamtzahl kaum sinkt.
  if (vorhanden && !(NEU_BERECHNEN && vorhanden._muster)) continue

  // Artikel mit dem Stichwort in der Überschrift zuerst — das ist der Artikel,
  // der das Thema wirklich regelt, und nicht der, der es streift.
  const stellen = [...r.stellen].sort((a, b) => Number(b.im_titel) - Number(a.im_titel))
  let getroffen = null
  for (const s of stellen) {
    const m = passendesMuster(s)
    if (m) { getroffen = { m, s }; break }
  }
  if (!getroffen) { ohneMuster++; continue }

  const { m, s } = getroffen
  neu[String(r.bfs)] = {
    status: m.status,
    tent_allowed: m.tent_allowed,
    vehicle_allowed: m.vehicle_allowed,
    fire_allowed: m.fire_allowed,
    summary: m.summary,
    conditions: m.conditions ?? null,
    // Die Quelle ist immer das Reglement dieser Gemeinde, nie das Muster.
    source: `${dokumentTitel(r.dokument_titel, r.dokument)}, ${artikelLabel(s.artikel)}`,
    source_url: r.dokument,
    review_status: m.review_status ?? 'entwurf',
    last_verified: HEUTE,
    // Welches Muster die Lesart geliefert hat. Ohne diese Spur liesse sich
    // später nicht mehr feststellen, welche Einträge von einer korrigierten
    // Formulierung betroffen sind — und ein stiller Fehler im Muster bliebe
    // in hunderten Gemeinden stehen.
    _muster: m.id,
  }
  zaehler[m.id] = (zaehler[m.id] ?? 0) + 1
}

console.log(`Kandidaten mit Fundstelle: ${kandidaten.filter((r) => r.stellen?.length).length}`)
console.log(`Neu eingestuft: ${Object.keys(neu).length}`)
console.log(`Fundstelle, aber kein Muster passt: ${ohneMuster}`)
console.log('')
for (const [id, n] of Object.entries(zaehler).sort((a, b) => b[1] - a[1])) {
  const m = muster.muster.find((x) => x.id === id)
  console.log(`  ${String(n).padStart(4)}×  ${id}  (${m.status}, ${m.review_status})`)
}

/**
 * Das Bundle so nachziehen, dass jede eingestufte Gemeinde auch sichtbar ist.
 *
 * Gebündelt war bisher allein die Fokusregion. Das reichte, solange die
 * Rechtspflege dort stattfand — jetzt liegen die Einstufungen über acht Kantone
 * verstreut, und zwei Drittel davon wären ohne Datenbankverbindung unsichtbar.
 * Eine recherchierte Gemeinde, die auf der Karte nicht erscheint, ist verlorene
 * Arbeit.
 *
 * Die Regel lautet deshalb: Fokusregion **plus** alles, was eingestuft ist. Das
 * wächst mit der Recherche und bleibt dabei klein, weil es genau die Flächen
 * sind, die etwas zu sagen haben.
 */
function bundleNachziehen(rechtGemeinden) {
  const voll = resolve(ROOT, 'import/CH/gemeinden/CH.json')
  const ziel = resolve(ROOT, 'src/data/gemeinden/CH-VS.json')
  if (!existsSync(voll)) {
    console.log('\nimport/CH/gemeinden/CH.json fehlt — Bundle unverändert.')
    return
  }
  const alle = JSON.parse(readFileSync(voll, 'utf8')).features
  const teil = alle.filter((f) => (
    f.properties.kanton === 'CH-VS' || rechtGemeinden[String(f.properties.bfs)]
  ))
  const fc = { type: 'FeatureCollection', features: teil }
  writeFileSync(ziel, JSON.stringify(fc) + '\n')
  const kb = Math.round(JSON.stringify(fc).length / 1024)
  const auswaerts = teil.filter((f) => f.properties.kanton !== 'CH-VS').length
  console.log(`Bundle: ${teil.length} Flächen (${auswaerts} ausserhalb des Wallis), ${kb} KB`)
}

const vonHand = Object.values(recht.gemeinden).filter((e) => !e._muster).length
if (vonHand > 0) console.log(`\nVon Hand gepflegt und unangetastet: ${vonHand}`)

if (!SCHREIBEN) {
  console.log('\nNur Bericht. Mit --schreiben wird gemeinden.legal.json ergänzt.')
} else {
  recht.gemeinden = { ...recht.gemeinden, ...neu }
  recht._stand = HEUTE
  writeFileSync(RECHT, JSON.stringify(recht, null, 2) + '\n')
  console.log(`\n${RECHT} ergänzt — jetzt ${Object.keys(recht.gemeinden).length} Gemeinden.`)
  bundleNachziehen(recht.gemeinden)
}
