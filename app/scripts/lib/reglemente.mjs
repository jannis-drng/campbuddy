/**
 * Was ein kommunales Reglement ausmacht — geteilt von beiden Rechercheläufern.
 *
 * Der eine holt die Seiten mit `fetch`, der andere mit einem echten Browser.
 * Was sie danach damit tun, ist identisch: die Reglementsammlung erkennen, das
 * Polizeireglement herausfischen, das PDF in Artikel zerlegen und die Stellen
 * zum Übernachten im Wortlaut ausschneiden. Diese Logik zweimal zu pflegen
 * hiesse, sie über kurz oder lang auseinanderlaufen zu lassen — und dann
 * hinge es vom Abrufweg ab, welche Rechtslage die Karte zeigt.
 */
import { PDFParse } from 'pdf-parse'

/* ------------------------------------------------------------- Erkennung */

/**
 * Wonach auf der Gemeindeseite gesucht wird — in vier Landessprachen.
 *
 * Die Reglementsammlung heisst je nach Kanton und CMS anders. Breit gefasst,
 * weil ein verpasster Link eine Gemeinde ganz verliert, ein überflüssiger aber
 * nur einen Abruf kostet.
 */
export const SAMMLUNG = [
  [/reglement|règlement|regolamento|erlass|rechtssammlung|gesetzessammlung/i, 10],
  [/l[ée]gislation|legislation|leggi|gesetz/i, 6],
  [/verwaltung|administration|amministrazione|behörde|gemeinde|commune/i, 3],
  [/dokument|document|publikation|publication|downloads?|merkblatt/i, 2],
]

/** Wie gut ein Link nach der Reglementsammlung aussieht. 0 = gar nicht. */
export function sammlungsRang(text) {
  let rang = 0
  for (const [muster, punkte] of SAMMLUNG) if (muster.test(text)) rang = Math.max(rang, punkte)
  // Häufige Sackgassen, die sonst die besten Plätze belegen.
  if (/baupublikation|todesfall|abfall|veranstaltung|news|aktuell/i.test(text)) rang = 0
  return rang
}

/** Welches Dokument gemeint ist: das Polizeireglement, hilfsweise Verwandtes. */
export const DOKUMENT = /polizei|police|polizia|gemeindeordnung|allgemeines\s*reglement|règlement\s*général|nutzungs|bau.*reglement|camping|campieren/i

/**
 * Die Stellen, an denen es um das Übernachten im Freien geht.
 *
 * Vier Sprachen, und bewusst auch die Umschreibungen: viele Reglemente sagen
 * nicht „Campieren", sondern „Nächtigen im Freien" oder „bivouac". Die
 * Wortgrenzen sind wichtig — ohne sie trifft „camp" auch „campagne" und
 * „Zelt" auch „Festzelt".
 */
export const TREFFER = new RegExp(
  '\\b(' + [
    // deutsch
    'campier\\w*', 'campieren', 'zelt', 'zelte[nr]?', 'zeltens', 'biwak\\w*',
    'wohnwagen', 'wohnmobil\\w*', 'n[äa]chtig\\w*', 'campingwagen', 'camping',
    // französisch
    'camper', 'campe[rz]', 'campement', 'bivouac\\w*', 'tente[s]?', 'caravane[s]?',
    'camping[-\\s]?car[s]?',
    // italienisch
    'campeggi\\w*', 'tenda', 'tende', 'roulotte[s]?', 'bivacc\\w*',
  ].join('|') + ')\\b',
  'i',
)

/**
 * Was ein Treffer sein muss, um mehr als ein Wort zu sein.
 *
 * „Camping" allein steht in jedem Reglement irgendwo — im Gebührenanhang, im
 * Verzeichnis der Betriebe. Interessant wird die Stelle erst, wenn sie etwas
 * anordnet. Ohne dieses zweite Sieb besteht die Ausbeute aus Fehlalarmen, und
 * eine Kandidatenliste, die man ohnehin alle wegwerfen muss, ist wertlos.
 */
export const NORMATIV = /verbot|verboten|untersagt|gestattet|erlaubt|bewilligung|bewilligungspflicht|zustimmung|nur mit|interdit|interdiction|autoris|permis|soumis|vietat|consentit|autorizzazione|divieto/i

/**
 * Ein Inhaltsverzeichnis erkennt man an den Punktreihen zur Seitenzahl.
 *
 * Ohne dieses Sieb besteht die halbe Ausbeute aus Verzeichniszeilen: dort steht
 * das Stichwort zwar, aber kein Satz, der etwas regelt.
 */
export const VERZEICHNIS = /\.{4,}\s*\d+|…{2,}/

/**
 * Das Dokument in seine Artikel zerlegen.
 *
 * Der einzige verlässliche Anker in schweizerischen Reglementen ist die
 * Artikelzählung. Wer stattdessen ein festes Zeichenfenster um den Treffer
 * legt, schneidet regelmässig den Absatz mit der Ausnahme ab — und „Campieren
 * ist verboten" ohne den nächsten Satz ist eine irreführende Verkürzung.
 */
export function artikel(text) {
  const sauber = text
    .split('\n')
    .filter((z) => !VERZEICHNIS.test(z))
    .join('\n')
    .replace(/\u00ad/g, '')

  const kopf = /(?:^|\n)\s*(Art(?:icle|icolo)?\.?\s*\d+[a-z]?)\s*[:.\-–]?\s*([^\n]{0,80})/gi
  const stellen = []
  let m
  while ((m = kopf.exec(sauber)) !== null) {
    stellen.push({ nummer: m[1].replace(/\s+/g, ' ').trim(), titel: m[2].trim(), von: m.index })
  }
  return stellen.map((a, i) => ({
    nummer: a.nummer,
    titel: a.titel,
    text: sauber.slice(a.von, stellen[i + 1]?.von ?? Math.min(sauber.length, a.von + 2500))
      .replace(/\s+/g, ' ').trim(),
  }))
}

/**
 * Die Artikel heraussuchen, die vom Übernachten im Freien handeln.
 *
 * Zurück geht der Wortlaut, nicht eine Einstufung. Ob daraus „erlaubt" oder
 * „verboten" wird, entscheidet ein Mensch, der die Stelle gelesen hat — ein
 * Treffer auf „Campieren" sagt noch nicht, in welche Richtung der Satz geht,
 * und ein falsches Grün auf dieser Karte ist schlimmer als eine leere Fläche.
 */
export function fundstellen(text) {
  const gefunden = []
  for (const a of artikel(text)) {
    if (a.text.length < 40 || a.text.length > 4000) continue

    // Stichwort und Anordnung müssen zusammengehören. Beide bloss irgendwo im
    // selben Artikel zu verlangen genügt nicht: „interdit" steht in fast jedem
    // Artikel eines Polizeireglements, und „camping" irgendwo weiter unten im
    // Gebührenanhang. Was zählt, ist der Satz, der beides verbindet.
    const treffer = new RegExp(TREFFER.source, 'gi')
    let m
    let passt = false
    while ((m = treffer.exec(a.text)) !== null) {
      const umfeld = a.text.slice(Math.max(0, m.index - 220), m.index + 260)
      if (NORMATIV.test(umfeld)) { passt = true; break }
    }
    if (!passt) continue

    // Ein Artikel, dessen Überschrift schon das Thema nennt, ist der sicherste
    // Fund — er kommt zuerst, damit beim Sichten das Beste oben steht.
    const imTitel = TREFFER.test(a.titel ?? '')
    gefunden.push({
      artikel: a.titel ? `${a.nummer} ${a.titel}` : a.nummer,
      text: a.text.slice(0, 1400),
      im_titel: imTitel,
    })
    if (gefunden.length >= 6) break
  }
  gefunden.sort((a, b) => Number(b.im_titel) - Number(a.im_titel))
  return gefunden.slice(0, 4)
}

/* ------------------------------------------------------------- Werkzeuge */

export const HÖFLICH = 400
export const schlafe = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Ein Abruf mit Zeitlimit und ehrlichem Scheitern.
 *
 * Gemeindeseiten sind ein sehr gemischtes Feld: abgelaufene Zertifikate,
 * Server, die nie antworten, Weiterleitungen im Kreis. Jeder Fehler wird
 * festgehalten statt verschluckt — am Ende soll ablesbar sein, woran es lag.
 */
export async function hole(url, alsBinär = false) {
  const abbruch = AbortSignal.timeout(20000)
  const antwort = await fetch(url, {
    signal: abbruch,
    redirect: 'follow',
    headers: {
      'User-Agent': 'CampBuddy-Recherche/1.0 (+https://github.com/jannis-drng/campbuddy)',
      'Accept-Language': 'de,fr,it',
    },
  })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return alsBinär ? Buffer.from(await antwort.arrayBuffer()) : await antwort.text()
}

/** Alle Links einer Seite als [absoluteAdresse, Linktext]. */
export function links(html, basis) {
  const gefunden = []
  const muster = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = muster.exec(html)) !== null) {
    const roh = m[1]
    if (/^(#|mailto:|tel:|javascript:)/i.test(roh)) continue
    let absolut
    try { absolut = new URL(roh, basis).href } catch { continue }
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    gefunden.push([absolut, text])
  }
  return gefunden
}

/** Den Text eines PDF holen. Gescannte Bilder liefern nichts — das ist kein Fehler. */
export async function pdfText(daten) {
  const p = new PDFParse({ data: daten })
  try {
    const { text } = await p.getText()
    return text
  } finally {
    await p.destroy().catch(() => {})
  }
}

/**
 * Was hinter einer Adresse steckt — PDF oder Webseite, am Inhalt erkannt.
 *
 * Die Dateiendung taugt nicht als Merkmal. Viele Gemeinde-CMS liefern ihre
 * Reglemente unter Adressen wie `/_doc/4711` oder `download.php?id=12` aus,
 * ohne jedes `.pdf` — Aaraus Rechtssammlung verlinkt 741 Dokumente und kein
 * einziges davon mit Endung. Wer nur auf `.pdf` prüft, übersieht genau die
 * Gemeinden, die ihre Erlasse ordentlich publizieren.
 *
 * Entschieden wird deshalb an den ersten Bytes: ein PDF beginnt mit `%PDF`.
 * Das ist billiger und ehrlicher als dem Content-Type zu glauben, den manche
 * Server falsch setzen.
 */
export async function holeDokument(url) {
  const daten = await hole(url, true)
  const kopf = daten.subarray(0, 5).toString('latin1')
  if (kopf.startsWith('%PDF')) return { typ: 'pdf', daten }
  return { typ: 'html', html: daten.toString('utf8'), url }
}

/**
 * Links, die auf ein Reglement zeigen könnten — mit und ohne Dateiendung.
 *
 * Zurück kommt eine Rangfolge: was schon in der Adresse nach einem Dokument
 * aussieht, zuerst; dann, was im Linktext danach klingt. Geprüft wird
 * anschliessend am Inhalt, nicht am Namen.
 */
/**
 * Adressen, die thematisch passen, aber nie ein Erlass sind.
 *
 * Eine Neuigkeit mit dem Titel „Polizei-/Veranstaltungsbewilligung: Schiessen"
 * trifft jedes Polizei-Muster und ist doch bloss eine Meldung von letzter
 * Woche. Solche Treffer sind schlimmer als gar keine: sie sehen nach einem
 * Fund aus und verdrängen die echte Rechtssammlung von Platz eins.
 */
const KEIN_ERLASS = /\/news\/|\/aktuell|\/veranstaltung|\/anlaess|\/agenda|\/mitteilung|\/medien|\/protokoll|\/traktand|\/stellen|\/jobs?\b/i

export function dokumentKandidaten(gefundene) {
  const bewertet = []
  for (const [u, t] of gefundene) {
    const zusammen = `${u} ${t}`
    const endung = /\.pdf($|\?)/i.test(u)
    const passt = DOKUMENT.test(zusammen)
    const polizei = /polizei|police|polizia/i.test(zusammen)
    if (!endung && !passt) continue
    // Nur die Endung ohne thematischen Bezug ist zu schwach — sonst landet
    // jedes Formular und jedes Protokoll in der Liste.
    if (endung && !passt) continue
    if (KEIN_ERLASS.test(u) && !endung) continue
    // „Reglement" oder „Ordnung" im Linktext ist das stärkste Einzelmerkmal:
    // so heisst der Erlass selbst, nicht die Seite, die von ihm handelt.
    const erlassWort = /reglement|règlement|regolamento|verordnung|ordnung|gesetz|erlass|statut/i.test(zusammen)
    bewertet.push([u, t, (erlassWort ? 8 : 0) + (polizei ? 4 : 0) + (endung ? 2 : 0) + (passt ? 1 : 0)])
  }
  bewertet.sort((a, b) => b[2] - a[2])
  // Doppelte Adressen fliegen raus, die Reihenfolge bleibt.
  const gesehen = new Set()
  return bewertet.filter(([u]) => !gesehen.has(u) && gesehen.add(u)).map(([u, t]) => [u, t])
}
