/**
 * Eine eigene, auffindbare Seite je eingestufter Gemeinde — plus Sitemap.
 *
 * Das Problem, das dieses Skript löst: CampBuddy routet über Rautenpfade
 * (`#/karte`), und alles hinter der Raute ist für eine Suchmaschine keine
 * eigene Adresse. Die ganze Anwendung war damit *ein* Dokument. Wer „Wildcampen
 * Sion" sucht, hatte keine Chance, hier zu landen — obwohl genau diese Antwort
 * belegt vorliegt.
 *
 * Drei Entscheidungen, die den Ausschlag gegeben haben:
 *
 *  1. **Nur Gemeinden mit Eintrag bekommen eine Seite.** Zweitausend Seiten mit
 *     „keine Angabe, frag die Gemeinde" wären genau die dünne Massenware, die
 *     eine Domain als Ganzes abwertet — und sie wären auch für Menschen
 *     nutzlos. Wächst die Abdeckung, wächst die Zahl der Seiten von selbst mit.
 *  2. **Fertiges HTML, kein JavaScript.** Die Seiten sind statisch und
 *     vollständig ohne Anwendung lesbar. Das ist nicht nur schnell, es ist auch
 *     die einzige Fassung, die unter der Sicherheitsrichtlinie dieser Seite
 *     überhaupt funktioniert: `script-src 'self'` verbietet jedes Skript im
 *     Dokument.
 *  3. **Auszeichnung als Microdata, nicht als JSON-LD.** JSON-LD steckt in
 *     einem `<script>`-Element, und genau die verbietet dieselbe Richtlinie —
 *     eine Ausnahme dafür wäre der teuerste denkbare Preis für eine Zeile
 *     Auszeichnung. Microdata hängt an gewöhnlichen Attributen und wird von
 *     Suchmaschinen genauso gelesen.
 *
 * Läuft nach dem Build (`postbuild`) und schreibt nach `dist/gemeinde/…`.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { kennung } from './lib/kennung.mjs'

const HIER = fileURLToPath(new URL('../', import.meta.url))
const DIST = `${HIER}dist/`

/**
 * Adresse und Basispfad — dieselben Werte wie in vite.config.ts.
 *
 * Sie stehen dort schon einmal, und genau deshalb werden sie hier aus
 * derselben Umgebung gelesen statt fest eingetragen: die Auslieferung liegt je
 * nach Ziel unter `/` (eigene Domain) oder unter `/campbuddy/` (GitHub Pages).
 * Ein hier hartkodiertes `/` erzeugte auf dem zweiten Ziel lauter Links ins
 * Leere — und zwar nur dort, also erst nach dem Veröffentlichen sichtbar.
 */
const ORIGIN = (process.env.VITE_ORIGIN ?? 'https://jannis-drng.github.io').replace(/\/+$/, '')
const BASIS = process.env.VITE_BASE ?? '/campbuddy/'

/*
 * Dasselbe Beacon wie in index.html (siehe vite.config.ts).
 *
 * Ohne diese Zeile zählten ausgerechnet die Seiten nicht mit, für die es die
 * ganze Vorrenderung gibt: wer über Google auf eine Gemeindeseite kommt und
 * dort bleibt, wäre in der Statistik nie erschienen. Ohne Kennzeichen bleibt
 * die Zeile leer.
 */
const BEACON = process.env.VITE_CF_BEACON_TOKEN?.trim()
  ? `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js"`
    + ` data-cf-beacon='{"token": "${process.env.VITE_CF_BEACON_TOKEN.trim()}"}'></script>`
  : ''

/* ------------------------------------------------------------------ Daten */

const gemeinden = JSON.parse(readFileSync(`${HIER}import/CH/gemeinden/CH.json`, 'utf8')).features
const recht = JSON.parse(readFileSync(`${HIER}src/data/gemeinden.legal.json`, 'utf8')).gemeinden
const kantonsrecht = JSON.parse(readFileSync(`${HIER}src/data/kantone.legal.json`, 'utf8')).kantone

/*
 * Die Ortsteile — das Register, das die Suche erst brauchbar macht.
 *
 * Eine Gemeinde ist eine Verwaltungseinheit, kein Ort: wer wissen will, ob er
 * bei Wengen übernachten darf, sucht nicht nach Lauterbrunnen. Diese Liste
 * verbindet beides.
 *
 * `hamlet` bleibt draussen, und zwar aus Rücksicht auf die Leitung: es sind
 * 6820 Weiler mit oft drei Häusern, sie machen die Suchliste viermal so
 * schwer und niemand sucht nach ihnen. Die vollständige Fassung liegt
 * weiterhin in `import/CH/orte/CH.json`, falls sich das je ändert.
 */
const ORTE = existsSync(`${HIER}import/CH/orte/CH.json`)
  ? JSON.parse(readFileSync(`${HIER}import/CH/orte/CH.json`, 'utf8'))
    .filter((o) => o.art !== 'hamlet' && o.bfs != null)
  : []

/** BFS-Nummer → die Ortsteile dieser Gemeinde, alphabetisch. */
const ORTE_JE_GEMEINDE = new Map()
for (const o of ORTE) {
  if (!ORTE_JE_GEMEINDE.has(o.bfs)) ORTE_JE_GEMEINDE.set(o.bfs, [])
  ORTE_JE_GEMEINDE.get(o.bfs).push(o.name)
}
for (const liste of ORTE_JE_GEMEINDE.values()) liste.sort((a, b) => a.localeCompare(b, 'de'))

/*
 * Der ortsübliche Kantonsname als Suchalias — „Valais", „Ticino", „Vaud".
 *
 * Er steht seit dem Kantonsimport in der Flächendatei und wird ausschliesslich
 * zum Suchen benutzt. Angezeigt wird weiterhin der deutsche Name; zwei Namen
 * für dieselbe Sache nebeneinander wären in der Oberfläche nur verwirrend.
 */
const KANTON_LOKAL = Object.fromEntries(
  JSON.parse(readFileSync(`${HIER}src/data/kantone/CH.json`, 'utf8')).features
    .filter((f) => f.properties.name_lokal)
    .map((f) => [f.properties.code, f.properties.name_lokal]),
)

/** Kantonsnamen aus der TypeScript-Liste ziehen — sie ist die einzige Quelle. */
const KANTON = Object.fromEntries(
  [...readFileSync(`${HIER}src/data/kantoneNamen.ts`, 'utf8')
    .matchAll(/\['(CH-[A-Z]{2})', '([^']+)'\]/g)].map((m) => [m[1], m[2]]),
)

/* ----------------------------------------------------------- Formulierung */

const STATUS_TEXT = {
  allowed: ['Erlaubt', '#4E9B6B'],
  tolerated: ['Geduldet', '#C79A3C'],
  forbidden: ['Verboten', '#B4544A'],
  unknown: ['Ungeklärt', '#6B7B80'],
}

const REGEL_TEXT = {
  yes: ['erlaubt', '#4E9B6B'],
  no: ['verboten', '#B4544A'],
  conditional: ['bedingt', '#C79A3C'],
  unknown: ['ungeklärt', '#6B7B80'],
}

const PRUEFSTAND = {
  entwurf: 'Nicht amtlich belegt',
  quelle: 'Amtlich belegt',
  'vor-ort': 'Vor Ort geprüft',
}

/**
 * Der Satz, den ein Suchender lesen will — und den eine Suchmaschine als
 * Beschreibung anzeigt.
 *
 * Bewusst aus den Daten gebaut statt aus einer Vorlage mit Lückentext: er soll
 * für jede Gemeinde etwas anderes sagen, weil für jede Gemeinde etwas anderes
 * gilt. Wo nichts gilt, steht auch nichts.
 */
function beschreibung(name, e, bfs) {
  const teile = [
    `Zelten ${REGEL_TEXT[e.tent_allowed][0]}`,
    `Biwakieren ${REGEL_TEXT[e.bivouac_allowed ?? 'unknown'][0]}`,
    `Übernachten im Fahrzeug ${REGEL_TEXT[e.vehicle_allowed][0]}`,
    `offenes Feuer ${REGEL_TEXT[e.fire_allowed][0]}`,
  ]
  const orte = ORTE_JE_GEMEINDE.get(bfs) ?? []
  const dazu = orte.length > 0 ? ` Gilt auch für ${orte.slice(0, 4).join(', ')}.` : ''
  return `Übernachten in der Natur in ${name}: ${teile.join(', ')}. `
       + `Mit Quelle und Prüfdatum (${e.last_verified ?? 'ohne Datum'}).${dazu}`
}

const escape = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/**
 * Mittelpunkt der Fläche, grob.
 *
 * Der Durchschnitt aller Stützpunkte des grössten Rings — nicht der exakte
 * Flächenschwerpunkt. Für den Zweck genügt das vollkommen: die Karte fliegt
 * anschliessend auf Zoomstufe 14, und dort liegt der Punkt sicher in der
 * richtigen Gemeinde. Ein Schwerpunktalgorithmus für 166 Anflüge wäre Aufwand
 * ohne sichtbaren Unterschied.
 */
function mittelpunkt(geometry) {
  const ringe = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  const groesster = ringe.reduce((a, b) => (b.length > a.length ? b : a), ringe[0])
  const summe = groesster.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0])
  return [summe[0] / groesster.length, summe[1] / groesster.length]
}

/* --------------------------------------------------------------- Vorlage */

const STIL = `
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0C1113;color:#C6D0D3;font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;
     -webkit-text-size-adjust:100%}
a{color:#7FB3C8}
a:hover{color:#A5CBDA}
.huelle{max-width:44rem;margin:0 auto;padding:1.5rem 1.25rem 4rem}
header{border-bottom:1px solid #1F2A2E;margin-bottom:2rem;padding-bottom:1rem;
       display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
header a{font-weight:600;color:#E8EEF0;text-decoration:none}
h1{font-size:1.75rem;line-height:1.2;color:#E8EEF0;letter-spacing:-0.02em;font-weight:650}
.ort{color:#8A9A9F;font-size:.9rem;margin-top:.35rem}
.marke{display:inline-block;border-radius:999px;padding:.2rem .7rem;font-size:.8rem;font-weight:600;
       border:1px solid;margin-top:1rem}
table{width:100%;border-collapse:collapse;margin:1.75rem 0}
th,td{text-align:left;padding:.7rem 0;border-bottom:1px solid #1F2A2E;font-size:.95rem}
th{color:#C6D0D3;font-weight:400}
td{text-align:right;font-weight:600}
h2{font-size:1rem;color:#E8EEF0;margin:2rem 0 .6rem;font-weight:600}
p{margin:.6rem 0}
.kasten{border:1px solid #1F2A2E;border-radius:.625rem;padding:1rem;margin:1.75rem 0;
        background:#131B1E;font-size:.9rem}
.leise{color:#8A9A9F;font-size:.85rem}
.knopf{display:inline-block;background:#1E7A9C;color:#fff;text-decoration:none;font-weight:600;
       border-radius:.625rem;padding:.7rem 1.2rem;margin:1.5rem 0 .5rem}
.knopf:hover{background:#2A8FB4;color:#fff}
.warnung{border-color:rgba(199,154,60,.3);background:rgba(199,154,60,.07);color:#C79A3C}
nav.krumen{font-size:.8rem;color:#8A9A9F;margin-bottom:1.5rem}
nav.krumen span[aria-hidden]{margin:0 .4rem}
.nachbarn{font-size:.9rem;line-height:2}
.offen{font-size:.85rem;line-height:1.9;color:#8A9A9F}
.suche{margin:2rem 0 .5rem}
.suche label{display:block;margin-bottom:.4rem}
.suche input{width:100%;background:#131B1E;color:#E8EEF0;border:1px solid #1F2A2E;
             border-radius:.625rem;padding:.7rem .9rem;font:inherit;font-size:1rem}
.suche input:focus{outline:2px solid #1E7A9C;outline-offset:1px;border-color:#1E7A9C}
.suche p{margin:.45rem 0 0}
#suchergebnis:not(:empty){margin:1.25rem 0}
#suchergebnis ul{list-style:none}
#suchergebnis li{padding:.55rem 0;border-bottom:1px solid #1F2A2E;font-size:.95rem;
                 display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
#suchergebnis .wo{color:#8A9A9F;font-size:.85rem;text-align:right}
#suchergebnis .auch{color:#8A9A9F}
footer{border-top:1px solid #1F2A2E;margin-top:3rem;padding-top:1.25rem;font-size:.85rem;color:#8A9A9F}
footer a{margin-right:1.25rem}
`.trim()

function zeile(bezeichnung, wert) {
  const [text, farbe] = REGEL_TEXT[wert ?? 'unknown']
  return `<tr><th>${bezeichnung}</th><td style="color:${farbe}">${text}</td></tr>`
}

function seite(g, e, nachbarn = []) {
  const name = g.properties.name
  const ortsteile = ORTE_JE_GEMEINDE.get(g.properties.bfs) ?? []
  const kantonName = KANTON[g.properties.kanton] ?? null
  const [lng, lat] = mittelpunkt(g.geometry)
  const pfad = `${BASIS}gemeinde/${g.properties.bfs}-${kennung(name)}`
  const titel = `Wildcampen in ${name}${kantonName ? ` (${kantonName})` : ''} — was gilt?`
  const [statusText, statusFarbe] = STATUS_TEXT[e.status] ?? STATUS_TEXT.unknown

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0C1113">
<title>${escape(titel)}</title>
<meta name="description" content="${escape(beschreibung(name, e, g.properties.bfs))}">
<link rel="canonical" href="${ORIGIN}${pfad}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="CampBuddy">
<meta property="og:title" content="${escape(titel)}">
<meta property="og:description" content="${escape(beschreibung(name, e, g.properties.bfs))}">
<meta property="og:url" content="${ORIGIN}${pfad}">
<meta property="og:image" content="${ORIGIN}${BASIS}og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${BASIS}icon.svg">
<link rel="apple-touch-icon" href="${BASIS}apple-touch-icon.png">
<style>${STIL}</style>
</head>
<body>
<div class="huelle" itemscope itemtype="https://schema.org/Article">
<header>
  <a href="${BASIS}">CampBuddy</a>
  <a href="${BASIS}#/karte" style="font-weight:400;font-size:.9rem;color:#7FB3C8">Karte öffnen</a>
</header>

<nav class="krumen" aria-label="Pfad" itemscope itemtype="https://schema.org/BreadcrumbList">
  <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
    <a itemprop="item" href="${BASIS}gemeinden"><span itemprop="name">Gemeinden</span></a>
    <meta itemprop="position" content="1">
  </span>
  ${kantonName ? `<span aria-hidden>›</span>
  <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
    <a itemprop="item" href="${BASIS}kanton/${kennung(kantonName)}"><span itemprop="name">${escape(kantonName)}</span></a>
    <meta itemprop="position" content="2">
  </span>` : ''}
  <span aria-hidden>›</span>
  <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
    <span itemprop="name">${escape(name)}</span>
    <meta itemprop="position" content="${kantonName ? 3 : 2}">
  </span>
</nav>

<main>
  <h1 itemprop="headline">Übernachten in der Natur in <span itemprop="about">${escape(name)}</span></h1>
  <p class="ort">${kantonName ? `Kanton ${escape(kantonName)} · ` : ''}Gemeinde-Nr. ${g.properties.bfs}</p>
  <span class="marke" style="color:${statusFarbe};border-color:${statusFarbe}66">${statusText}</span>

  <table>
    <caption class="leise" style="text-align:left;padding-bottom:.5rem">Was hier gilt</caption>
    ${zeile('Zelt', e.tent_allowed)}
    ${zeile('Biwak', e.bivouac_allowed)}
    ${zeile('Auto / Camper', e.vehicle_allowed)}
    ${zeile('Offenes Feuer', e.fire_allowed)}
  </table>

  <h2>Was das bedeutet</h2>
  <p itemprop="description">${escape(e.summary)}</p>
  ${e.conditions ? `<p>${escape(e.conditions)}</p>` : ''}

  ${e.bivouac_allowed ? '' : `<p class="leise">Zum Biwakieren — dem Übernachten
    ohne Zelt, im Schlafsack — sagt die vorliegende Quelle nichts. Das ist keine
    stillschweigende Erlaubnis und kein stillschweigendes Verbot: es ist
    ungeklärt, und die Auskunft der Gemeinde entscheidet.</p>`}

  <div class="kasten">
    <strong style="color:#E8EEF0">Quelle &amp; Stand</strong><br>
    ${escape(e.source)}
    ${e.source_url ? ` · <a href="${escape(e.source_url)}" rel="nofollow noopener" target="_blank">Originaldokument</a>` : ''}
    <br>
    <span class="leise">
      ${PRUEFSTAND[e.review_status]}${e.last_verified
        ? ` · zuletzt geprüft am <time itemprop="dateModified" datetime="${e.last_verified}">${e.last_verified}</time>`
        : ''}
    </span>
  </div>

  ${e.review_status === 'entwurf' ? `<div class="kasten warnung">
    Diese Einstufung ist aus dem allgemeinen Rechtsrahmen abgeleitet und
    <strong>nicht mit einem amtlichen Dokument belegt</strong>. Frag im Zweifel
    bei der Gemeinde nach.</div>` : ''}

  <a class="knopf" href="${BASIS}#/karte/ort/${lat.toFixed(4)},${lng.toFixed(4)}">Auf der Karte ansehen</a>

  ${g.properties.website ? `<p class="leise">Im Zweifel entscheidet die Gemeinde:
    <a href="${escape(g.properties.website)}" rel="nofollow noopener" target="_blank">${escape(name)}</a>${
      g.properties.email ? ` · <a href="mailto:${escape(g.properties.email)}">${escape(g.properties.email)}</a>` : ''
    }</p>` : ''}

  <div class="kasten warnung">
    <strong>Orientierungshilfe, keine Rechtsgarantie.</strong> Verordnungen,
    saisonale Verbote und Gemeindebeschlüsse ändern die Lage teils kurzfristig.
    Beschilderung vor Ort und die Auskunft der Gemeinde gehen dieser Seite vor.
  </div>
</main>

  ${ortsteile.length > 0 ? `<h2>Orte in dieser Gemeinde</h2>
  <p class="leise">Für alle diese Orte gilt, was oben steht — die Rechtslage hängt an der
  Gemeinde, nicht am Ortsteil. Sie stehen hier, weil man nach ihnen sucht:</p>
  <p class="offen">${ortsteile.map((n) => escape(n)).join(' · ')}</p>` : ''}

  ${nachbarn.length > 0 ? `<h2>Weitere Gemeinden${kantonName ? ` im Kanton ${escape(kantonName)}` : ''}</h2>
  <p class="nachbarn">${nachbarn.map((n) =>
    `<a href="${BASIS}${n.pfad}">${escape(n.name)}</a>`).join(' · ')}</p>
  <p class="leise"><a href="${BASIS}kanton/${kennung(kantonName)}">Was der Kanton ${escape(kantonName)} dazu sagt</a>
  · <a href="${BASIS}gemeinden">Alle eingestuften Gemeinden</a></p>` : ''}

<footer>
  <a href="${BASIS}">Startseite</a><a href="${BASIS}#/karte">Karte</a>
  <a href="${BASIS}gemeinden">Gemeinden</a>
  <a href="${BASIS}#/impressum">Impressum</a><a href="${BASIS}#/datenschutz">Datenschutz</a>
  <p style="margin-top:.75rem">Flächen © OpenStreetMap-Mitwirkende (ODbL). Rechtliche
  Einstufung: eigene Recherche, Quelle oben genannt.</p>
</footer>
</div>
${BEACON}
</body>
</html>
`
}

/* ---------------------------------------------------------------- Schreiben */

// Frisch anlegen: eine Gemeinde, deren Eintrag zurückgezogen wurde, muss auch
// ihre Seite verlieren — sonst steht eine Auskunft im Netz, die es nicht mehr
// gibt, und die Sitemap verweist ins Leere.
rmSync(`${DIST}gemeinde`, { recursive: true, force: true })
rmSync(`${DIST}gemeinden.html`, { force: true })

const heute = new Date().toISOString().slice(0, 10)
const adressen = []
let uebersprungen = 0

/*
 * Erst sammeln, dann schreiben.
 *
 * Jede Seite verlinkt die anderen eingestuften Gemeinden ihres Kantons, und die
 * Übersicht verlinkt alle. Beides setzt voraus, dass die vollständige Liste
 * schon steht, bevor die erste Datei geschrieben wird. Ohne diese Querverweise
 * wären die dreihundert Seiten verwaist: sie stünden nur in der Sitemap, und
 * eine Suchmaschine misst den Wert einer Seite auch daran, ob überhaupt jemand
 * auf sie zeigt.
 */
const eingestuft = gemeinden
  .filter((g) => {
    const hat = Boolean(recht[String(g.properties.bfs)] && g.geometry)
    if (!hat) uebersprungen++
    return hat
  })
  .map((g) => ({
    g,
    e: recht[String(g.properties.bfs)],
    name: g.properties.name,
    kanton: g.properties.kanton,
    pfad: `gemeinde/${g.properties.bfs}-${kennung(g.properties.name)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'de'))

/** Kanton -> seine eingestuften Gemeinden, für Querverweise und Übersicht. */
const NACH_KANTON = new Map()
for (const eintrag of eingestuft) {
  if (!NACH_KANTON.has(eintrag.kanton)) NACH_KANTON.set(eintrag.kanton, [])
  NACH_KANTON.get(eintrag.kanton).push(eintrag)
}

for (const { g, e: eintrag, kanton, pfad: eigenerPfad } of eingestuft) {
  /*
   * Höchstens dreissig Nachbarn, und zwar die des eigenen Kantons.
   *
   * Nicht alle: eine Seite, die dreihundert andere verlinkt, verteilt ihr
   * Gewicht auf dreihundert Ziele und liest sich für einen Menschen wie ein
   * Telefonbuch. Der Kanton ist die richtige Nachbarschaft, weil er auch
   * rechtlich eine ist — wer wissen will, was nebenan gilt, meint fast immer
   * denselben Kanton.
   */
  const nachbarn = (NACH_KANTON.get(kanton) ?? [])
    .filter((n) => n.pfad !== eigenerPfad)
    .slice(0, 30)


  /*
   * Flach als `<nr>-<name>.html`, nicht als Verzeichnis mit `index.html`.
   *
   * Der Unterschied ist nicht kosmetisch. Cloudflare löst unter
   * `auto-trailing-slash` beide Formen auf, aber in verschiedene Richtungen:
   * bei einem Verzeichnis leitet `/gemeinde/x` mit 307 auf `/gemeinde/x/` um,
   * bei einer flachen Datei antwortet `/gemeinde/x` direkt mit 200 und der
   * Schrägstrich wird umgeleitet. Da die kanonische Adresse dieser Seiten
   * keinen Schrägstrich trägt, hiesse die erste Variante: der Canonical zeigt
   * auf eine Adresse, die weiterleitet. Genau das soll ein Canonical nicht.
   */
  const pfad = `gemeinde/${g.properties.bfs}-${kennung(g.properties.name)}`
  mkdirSync(`${DIST}gemeinde`, { recursive: true })
  writeFileSync(`${DIST}${pfad}.html`, seite(g, eintrag, nachbarn))
  adressen.push({ pfad: `${BASIS}${pfad}`, stand: eintrag.last_verified })
}

/* --------------------------------------------------------------- Kantone */

/*
 * Eine Seite je Kanton — die Ebene über der Gemeinde, und die mit den
 * grösseren Suchvolumen.
 *
 * „Wildcampen Kanton Bern" wird ungleich häufiger gesucht als „Wildcampen
 * Aarberg", und bis hierher gab es dafür keine Adresse. Möglich sind diese
 * Seiten erst, seit alle 26 Kantone geprüft sind: vorher hätten sie
 * zwanzigmal denselben Satz gesagt, dass nichts recherchiert ist.
 *
 * Ihre eigentliche Aussage ist überraschend und trägt eine Seite für sich:
 * 25 von 26 Kantonen regeln das Übernachten im Freien gar nicht — zuständig
 * ist die Gemeinde. Genau diese Auskunft sucht jemand, der wissen will, „was
 * im Kanton X gilt", und genau sie bekommt er sonst nirgends belegt.
 */
function kantonsSeite(code, kantonName, liste, gesamtImKanton, offen) {
  const e = kantonsrecht[code]
  const pfad = `${BASIS}kanton/${kennung(kantonName)}`
  const titel = `Wildcampen im Kanton ${kantonName} — was gilt?`
  const beschr = e
    ? `${e.summary.slice(0, 150).trim()}… ${liste.length} von ${gesamtImKanton} Gemeinden `
      + 'im Kanton sind einzeln belegt.'
    : `Übernachten in der Natur im Kanton ${kantonName}: ${liste.length} von ${gesamtImKanton} `
      + 'Gemeinden mit belegter Rechtslage.'
  const [statusText, statusFarbe] = e ? (STATUS_TEXT[e.status] ?? STATUS_TEXT.unknown) : STATUS_TEXT.unknown

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0C1113">
<title>${escape(titel)}</title>
<meta name="description" content="${escape(beschr)}">
<link rel="canonical" href="${ORIGIN}${pfad}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="CampBuddy">
<meta property="og:title" content="${escape(titel)}">
<meta property="og:description" content="${escape(beschr)}">
<meta property="og:url" content="${ORIGIN}${pfad}">
<meta property="og:image" content="${ORIGIN}${BASIS}og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${BASIS}icon.svg">
<link rel="apple-touch-icon" href="${BASIS}apple-touch-icon.png">
<style>${STIL}</style>
</head>
<body>
<div class="huelle" itemscope itemtype="https://schema.org/Article">
<header>
  <a href="${BASIS}">CampBuddy</a>
  <a href="${BASIS}#/karte" style="font-weight:400;font-size:.9rem;color:#7FB3C8">Karte öffnen</a>
</header>

<nav class="krumen" aria-label="Pfad" itemscope itemtype="https://schema.org/BreadcrumbList">
  <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
    <a itemprop="item" href="${BASIS}gemeinden"><span itemprop="name">Gemeinden</span></a>
    <meta itemprop="position" content="1">
  </span>
  <span aria-hidden>›</span>
  <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
    <span itemprop="name">${escape(kantonName)}</span>
    <meta itemprop="position" content="2">
  </span>
</nav>

<main>
  <h1 itemprop="headline">Übernachten in der Natur im Kanton ${escape(kantonName)}</h1>
  <p class="ort">${liste.length} von ${gesamtImKanton} Gemeinden einzeln belegt</p>
  <span class="marke" style="color:${statusFarbe};border-color:${statusFarbe}66">Kantonal: ${statusText}</span>

  ${e ? `<table>
    <caption class="leise" style="text-align:left;padding-bottom:.5rem">Was der Kanton selbst regelt</caption>
    ${zeile('Zelt', e.tent_allowed)}
    ${zeile('Biwak', e.bivouac_allowed)}
    ${zeile('Auto / Camper', e.vehicle_allowed)}
    ${zeile('Offenes Feuer', e.fire_allowed)}
  </table>

  <h2>Was das bedeutet</h2>
  <p itemprop="description">${escape(e.summary)}</p>
  ${e.conditions ? `<p>${escape(e.conditions)}</p>` : ''}

  <div class="kasten">
    <strong style="color:#E8EEF0">Quelle &amp; Stand</strong><br>
    ${escape(e.source)}
    ${e.source_url ? ` · <a href="${escape(e.source_url)}" rel="nofollow noopener" target="_blank">Originaldokument</a>` : ''}
    <br>
    <span class="leise">
      ${PRUEFSTAND[e.review_status]}${e.last_verified
        ? ` · zuletzt geprüft am <time itemprop="dateModified" datetime="${e.last_verified}">${e.last_verified}</time>`
        : ''}
    </span>
  </div>` : ''}

  <h2>Gemeinden mit eigener Auskunft</h2>
  ${liste.length > 0 ? `<p class="leise">Ausserhalb der Schutzgebiete entscheidet die Gemeinde. Für diese
  ${liste.length} ist ihr Reglement nachgeschlagen:</p>
  <p class="nachbarn">${liste.map((n) =>
    `<a href="${BASIS}${n.pfad}">${escape(n.name)}</a>`).join(' · ')}</p>
  <p class="leise">Für die übrigen ${gesamtImKanton - liste.length} Gemeinden des Kantons ist noch
  nichts recherchiert. Die Karte lässt sie deshalb ungefüllt und nennt stattdessen den
  Kontakt der Gemeinde — kein Eintrag heisst nie „erlaubt".</p>`
  : `<p class="leise">Für die ${gesamtImKanton} Gemeinden dieses Kantons ist noch keine
  einzelne Recherche eingetragen. Ausserhalb der Schutzgebiete entscheidet trotzdem die
  Gemeinde — die Karte nennt dort ihren Kontakt, statt eine Farbe zu raten. Kein Eintrag
  heisst nie „erlaubt".</p>`}

  ${offen.length > 0 ? `<h2>Noch nicht nachgeschlagen</h2>
  <p class="leise">Diese Gemeinden des Kantons haben noch keinen eigenen Eintrag. Sie stehen
  hier trotzdem, weil die Antwort „für ${escape(kantonName)} ist nichts Kantonales geregelt,
  und für deine Gemeinde ist noch nichts nachgeschlagen" eine Antwort ist — und weil auf der
  Karte der Kontakt der jeweiligen Gemeinde hinterlegt ist.</p>
  <p class="offen">${offen.map((n) => escape(n)).join(' · ')}</p>` : ''}

  <a class="knopf" href="${BASIS}#/karte">Auf der Karte ansehen</a>

  <div class="kasten warnung">
    <strong>Orientierungshilfe, keine Rechtsgarantie.</strong> Beschilderung vor Ort und die
    Auskunft der Gemeinde gehen dieser Seite vor.
  </div>
</main>

<footer>
  <a href="${BASIS}">Startseite</a><a href="${BASIS}#/karte">Karte</a>
  <a href="${BASIS}gemeinden">Gemeinden</a>
  <a href="${BASIS}#/impressum">Impressum</a><a href="${BASIS}#/datenschutz">Datenschutz</a>
  <p style="margin-top:.75rem">Flächen © OpenStreetMap-Mitwirkende (ODbL). Rechtliche
  Einstufung: eigene Recherche, Quelle oben genannt.</p>
</footer>
</div>
${BEACON}
</body>
</html>
`
}

/** Wie viele Gemeinden hat ein Kanton insgesamt — für die ehrliche Quote. */
const GESAMT_JE_KANTON = new Map()
for (const g of gemeinden) {
  const k = g.properties.kanton
  GESAMT_JE_KANTON.set(k, (GESAMT_JE_KANTON.get(k) ?? 0) + 1)
}

rmSync(`${DIST}kanton`, { recursive: true, force: true })
mkdirSync(`${DIST}kanton`, { recursive: true })

/*
 * Alle 26 bekommen eine Seite, nicht nur die mit eingestufter Gemeinde.
 *
 * Die kantonale Auskunft steht für sich: „dieser Kanton regelt das Übernachten
 * im Freien nicht, zuständig ist die Gemeinde" ist belegt, überraschend und
 * genau das, was jemand sucht, der nach dem Kanton fragt. Sie hängt nicht
 * daran, ob dort schon eine Gemeinde nachgeschlagen ist — sonst hätten
 * ausgerechnet die unbearbeiteten Kantone keine Seite, obwohl die Frage dort
 * am häufigsten offen ist.
 */
const kantonsAdressen = []
for (const code of Object.keys(kantonsrecht)) {
  const kantonName = KANTON[code]
  if (!kantonName) continue
  const liste = NACH_KANTON.get(code) ?? []
  const datei = `kanton/${kennung(kantonName)}`
  /*
   * Die Namen der noch nicht nachgeschlagenen Gemeinden — als Text, nicht als Links.
   *
   * Das ist die Antwort auf die naheliegende Frage, warum nicht gleich jede der
   * 2119 Gemeinden eine eigene Seite bekommt: 1819 Seiten, die sich nur im Namen
   * unterscheiden und alle dasselbe sagen, sind für eine Suchmaschine
   * massenhaft erzeugte dünne Inhalte — und das Urteil darüber trifft die ganze
   * Domain, also auch die dreihundert guten Seiten. Hier stehen dieselben Namen
   * im richtigen Zusammenhang, auf einer Seite, die etwas zu sagen hat.
   *
   * Wächst die Abdeckung, wandert ein Name von dieser Liste in die obere und
   * bekommt seine eigene Seite. Ganz von selbst, beim nächsten Bauen.
   */
  const offen = gemeinden
    .filter((g) => g.properties.kanton === code && !recht[String(g.properties.bfs)])
    .map((g) => g.properties.name)
    .sort((a, b) => a.localeCompare(b, 'de'))

  writeFileSync(`${DIST}${datei}.html`,
    kantonsSeite(code, kantonName, liste, GESAMT_JE_KANTON.get(code) ?? liste.length, offen))
  kantonsAdressen.push({
    pfad: `${BASIS}${datei}`,
    stand: kantonsrecht[code]?.last_verified ?? null,
  })
}

/* --------------------------------------------------------------- Übersicht */

/*
 * Die Seite, ohne die die anderen dreihundert verwaist wären.
 *
 * Eine Sitemap sagt einer Suchmaschine, dass es eine Adresse *gibt*. Sie sagt
 * nichts darüber, ob sie wichtig ist — das entscheidet sich daran, wer auf sie
 * zeigt. Bis hierher zeigte niemand: die Gemeindeseiten hingen an keinem Link
 * der Seite. Diese Übersicht hängt sie an die Startseite und aneinander.
 *
 * Sie ist zugleich das ehrlichste Bild des Projektstands: dreihundert von 2119,
 * nach Kanton geordnet, mit der Zahl daneben.
 */
function uebersichtsSeite() {
  /*
   * Alle 26 Kantone, auch die ohne eingestufte Gemeinde.
   *
   * Sonst wären ausgerechnet die 14 Kantonsseiten verwaist, die es zu Kantonen
   * ohne Gemeindearbeit gibt — dasselbe Loch, das diese Übersicht für die
   * Gemeindeseiten gerade schliesst. Und die Liste ist so zugleich eine
   * ehrliche Landkarte des Arbeitsstands.
   */
  const kantone = Object.keys(kantonsrecht)
    .filter((code) => KANTON[code])
    .map((code) => [KANTON[code], NACH_KANTON.get(code) ?? []])
    .sort((a, b) => a[0].localeCompare(b[0], 'de'))

  const titel = `Übernachten in der Natur — ${eingestuft.length} Schweizer Gemeinden mit belegter Rechtslage`
  const beschr = `Für ${eingestuft.length} von ${gemeinden.length} Schweizer Gemeinden ist belegt, `
    + 'ob Zelten, Biwakieren, Übernachten im Fahrzeug und offenes Feuer erlaubt sind — '
    + 'mit Quelle und Prüfdatum.'

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0C1113">
<title>${escape(titel)}</title>
<meta name="description" content="${escape(beschr)}">
<link rel="canonical" href="${ORIGIN}${BASIS}gemeinden">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CampBuddy">
<meta property="og:title" content="${escape(titel)}">
<meta property="og:description" content="${escape(beschr)}">
<meta property="og:url" content="${ORIGIN}${BASIS}gemeinden">
<meta property="og:image" content="${ORIGIN}${BASIS}og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${BASIS}icon.svg">
<link rel="apple-touch-icon" href="${BASIS}apple-touch-icon.png">
<style>${STIL}</style>
</head>
<body>
<div class="huelle">
<header>
  <a href="${BASIS}">CampBuddy</a>
  <a href="${BASIS}#/karte" style="font-weight:400;font-size:.9rem;color:#7FB3C8">Karte öffnen</a>
</header>

<main>
  <h1>Gemeinden und Kantone mit belegter Rechtslage</h1>
  <p class="ort">${eingestuft.length} von ${gemeinden.length} Gemeinden · alle 26 Kantone · Stand ${heute}</p>

  <p>Für diese Gemeinden ist im Wortlaut ihres Reglements nachgeschlagen, ob und unter
  welchen Bedingungen dort im Freien übernachtet werden darf — getrennt nach Zelt, Biwak,
  Fahrzeug und offenem Feuer, jeweils mit Quelle und Prüfdatum.</p>

  <p class="leise">Die übrigen Gemeinden fehlen hier nicht aus Versehen: für sie ist noch
  nichts recherchiert, und die Karte sagt das dort auch offen, statt eine Farbe zu raten.
  Kein Eintrag heisst nie „erlaubt".</p>

  <a class="knopf" href="${BASIS}#/karte">Auf der Karte ansehen</a>

  <!--
    Die Suche.

    Sie findet alle 2119 Gemeinden, nicht nur die eingestuften — und das ist
    der Punkt. Wer „Zermatt" eingibt und nichts findet, weiss nicht, ob er sich
    vertippt hat oder ob dort noch nichts recherchiert ist. Die Suche sagt es
    ihm. Ein Ergebnis ohne Seite ist eine Auskunft, kein Fehlschlag.

    Das Skript liegt als eigene Datei, nicht inline: script-src 'self'
    verbietet Inline-Skripte, und diese Regel wird fuer eine Suchfunktion
    ganz sicher nicht aufgeweicht. Die Namensliste kommt als eigene Datei
    nach — sie wiegt mehr als diese ganze Seite und wird nur gebraucht,
    wenn jemand wirklich tippt.
  -->
  <form class="suche" onsubmit="return false">
    <label for="suchfeld" class="leise">Gemeinde suchen</label>
    <input id="suchfeld" type="search" autocomplete="off" spellcheck="false"
           placeholder="Name der Gemeinde …" aria-describedby="suchhinweis">
    <p id="suchhinweis" class="leise">Alle 26 Kantone, ${gemeinden.length} Gemeinden und
    ${ORTE.length} Orte — auch die noch nicht nachgeschlagenen. Ein Ortsteil führt zur
    Seite seiner Gemeinde: dort wird über das Übernachten entschieden.</p>
  </form>
  <div id="suchergebnis" role="status" aria-live="polite"></div>

  <div id="volleListe">
  ${kantone.map(([kantonName, liste]) => `
  <h2 id="${kennung(kantonName)}"><a href="${BASIS}kanton/${kennung(kantonName)}">${escape(kantonName)}</a> <span class="leise">· ${liste.length}</span></h2>
  ${liste.length > 0
    ? `<p class="nachbarn">${liste.map((n) => `<a href="${BASIS}${n.pfad}">${escape(n.name)}</a>`).join(' · ')}</p>`
    : `<p class="leise">Noch keine Gemeinde einzeln nachgeschlagen — was der Kanton selbst
       regelt, steht auf <a href="${BASIS}kanton/${kennung(kantonName)}">seiner Seite</a>.</p>`}`).join('')}

  </div>

  <div class="kasten warnung">
    <strong>Orientierungshilfe, keine Rechtsgarantie.</strong> Beschilderung vor Ort und die
    Auskunft der Gemeinde gehen dieser Seite vor.
  </div>
</main>

<footer>
  <a href="${BASIS}">Startseite</a><a href="${BASIS}#/karte">Karte</a>
  <a href="${BASIS}#/impressum">Impressum</a><a href="${BASIS}#/datenschutz">Datenschutz</a>
  <p style="margin-top:.75rem">Flächen © OpenStreetMap-Mitwirkende (ODbL). Rechtliche
  Einstufung: eigene Recherche, Quelle auf der jeweiligen Seite.</p>
</footer>
</div>
<script src="${BASIS}gemeinden-suche.js" defer></script>
${BEACON}
</body>
</html>
`
}

writeFileSync(`${DIST}gemeinden.html`, uebersichtsSeite())

/* ----------------------------------------------------------------- Suche */

/*
 * Die Namensliste für die Suche — alle Gemeinden, nicht nur die eingestuften.
 *
 * Kurze Schlüssel, weil die Datei 2119 Einträge trägt: `n` Name, `k` Kanton,
 * `p` Pfad zur Seite (fehlt, wenn es noch keine gibt). Das ist keine
 * Sparsamkeit um ihrer selbst willen — mit ausgeschriebenen Schlüsseln wäre
 * sie rund ein Drittel grösser, und sie wird über eine Mobilverbindung geholt.
 */
const suchEintraege = gemeinden
  .filter((g) => g.properties.name)
  .map((g) => {
    const eintrag = recht[String(g.properties.bfs)]
    return {
      n: g.properties.name,
      k: KANTON[g.properties.kanton] ?? '',
      // Der deutsche Zweitname, wo er abweicht — „Sitten" findet Sion,
      // „Genf" findet Genève. Siehe `name_de` im Import.
      ...(g.properties.name_de ? { a: g.properties.name_de } : {}),
      ...(eintrag ? { p: `${BASIS}gemeinde/${g.properties.bfs}-${kennung(g.properties.name)}` } : {}),
    }
  })

/*
 * Ortsteile kommen mit in die Suche — mit `g` als Verweis auf ihre Gemeinde.
 *
 * Das ist der eigentliche Gewinn des Ortsregisters: „Wengen" führt zur Seite
 * von Lauterbrunnen, und die Zeile sagt dazu, warum. Ohne diesen Hinweis
 * stünde da ein fremder Gemeindename ohne Erklärung.
 *
 * Der Ort erbt den Pfad seiner Gemeinde, wenn es dort eine Seite gibt. Eine
 * eigene bekommt er nicht: die Rechtslage hängt an der Gemeinde, und eine
 * zweite Seite mit demselben Inhalt unter anderem Namen wäre genau die
 * doppelte Massenware, die diese Seiten sonst meiden.
 */
const gemeindePfade = new Map(
  gemeinden.filter((g) => recht[String(g.properties.bfs)])
    .map((g) => [g.properties.bfs, `${BASIS}gemeinde/${g.properties.bfs}-${kennung(g.properties.name)}`]),
)
const gemeindeKanton = new Map(gemeinden.map((g) => [g.properties.bfs, KANTON[g.properties.kanton] ?? '']))

for (const o of ORTE) {
  suchEintraege.push({
    n: o.name,
    k: gemeindeKanton.get(o.bfs) ?? '',
    g: o.gemeinde,
    ...(gemeindePfade.has(o.bfs) ? { p: gemeindePfade.get(o.bfs) } : {}),
  })
}

/*
 * Und die 26 Kantone.
 *
 * Sie gehören in dieselbe Suche, weil dort dieselbe Frage gestellt wird — nur
 * eine Ebene höher. Wer „Wallis" tippt, will nicht durch 122 Walliser
 * Gemeinden scrollen, sondern wissen, was der Kanton regelt. Jeder hat eine
 * Seite, also trägt jeder Eintrag einen Pfad; ein Kanton ohne Auskunft gibt es
 * nicht mehr, seit alle 26 geprüft sind.
 *
 * `a` ist der ortsübliche Zweitname, den die Suche mitdurchsucht, ohne ihn
 * anzuzeigen.
 */
for (const code of Object.keys(kantonsrecht)) {
  const name = KANTON[code]
  if (!name) continue
  suchEintraege.push({
    n: name,
    t: 'kanton',
    p: `${BASIS}kanton/${kennung(name)}`,
    ...(KANTON_LOKAL[code] && KANTON_LOKAL[code] !== name ? { a: KANTON_LOKAL[code] } : {}),
  })
}

writeFileSync(`${DIST}gemeinden-suche.json`, JSON.stringify(
  suchEintraege.sort((a, b) => a.n.localeCompare(b.n, 'de')),
))

/*
 * Das Suchskript. Bewusst schlicht und ohne Abhängigkeiten:
 *
 *  - Es lädt die Namensliste erst beim ersten Tastendruck. Wer die Seite nur
 *    liest, holt sie nie.
 *  - Verglichen wird auf einer vereinfachten Fassung des Namens (klein, ohne
 *    Umlaute und Akzente). „Zurich", „zuerich" und „Zürich" finden dasselbe,
 *    und das ist keine Spielerei: auf einer Telefontastatur tippt kaum jemand
 *    Akzente, und ein Viertel der Schweizer Gemeindenamen trägt welche.
 *  - Höchstens 40 Treffer. Wer „a" tippt, will keine tausend Zeilen.
 *  - Ohne Treffer sagt es das, statt eine leere Liste zu zeigen.
 */
writeFileSync(`${DIST}gemeinden-suche.js`, `(function () {
  var feld = document.getElementById('suchfeld')
  var raum = document.getElementById('suchergebnis')
  var liste = document.getElementById('volleListe')
  if (!feld || !raum) return

  var daten = null
  var laedt = false

  /*
    Zwei Schreibweisen, weil Menschen beide tippen.

    Wer den Umlaut nicht auf der Tastatur hat, schreibt entweder 'zuerich' oder
    'zurich' — und das sind zwei verschiedene Vereinfachungen desselben Namens.
    Wird nur eine gebildet, findet die jeweils andere Eingabe nichts, und die
    Suche wirkt kaputt, obwohl der Ort in der Liste steht. Also beide bilden
    und beide vergleichen.
  */
  function ausgeschrieben(t) {
    return t.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
  }

  function entblaettert(t) {
    return t.toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
  }

  function zeichne(begriff) {
    if (!begriff) { raum.innerHTML = ''; if (liste) liste.hidden = false; return }
    if (liste) liste.hidden = true
    if (!daten) { raum.textContent = 'Einen Moment …'; return }

    var a = ausgeschrieben(begriff)
    var e = entblaettert(begriff)

    /*
      Rangfolge, sonst steht das Falsche oben.

      Reines Enthalten reicht nicht: 'sion' kommt in 'La Conversion' und
      'Mission' vor, und alphabetisch sortiert standen die vor Sion selbst.
      Wer einen Ortsnamen eintippt, meint fast immer genau diesen Ort.

      0 = genau dieser Name, 1 = beginnt damit, 2 = enthält es irgendwo.
      Innerhalb desselben Rangs zählt die Länge: der kürzere Name enthält den
      Suchbegriff zu einem grösseren Teil und ist damit näher dran. Und eine
      Gemeinde schlägt einen gleichrangigen Ortsteil, weil die Rechtslage an
      ihr hängt.
    */
    function passtAufNamen(g, a2, e2) {
      return g._na.indexOf(a2) !== -1 || g._ne.indexOf(e2) !== -1
    }

    function rang(g) {
      // Gegen die einzelnen Namen geprüft, nicht gegen die zusammengesetzte
      // Zeile: sonst wäre kein Name mehr ein genauer Treffer, sobald ein
      // zweiter danebensteht.
      var genau = false
      var anfang = false
      for (var i = 0; i < g._teile.length; i++) {
        var t = g._teile[i]
        if (t.a === a || t.e === e) genau = true
        if (t.a.indexOf(a) === 0 || t.e.indexOf(e) === 0) anfang = true
      }
      if (genau) return 0
      if (anfang) return 1
      return 2
    }

    /*
      Bei gleichem Rang: Gemeinde, dann Kanton, dann Ortsteil.

      'Bern' ist beides — Gemeinde und Kanton. Wer den Namen allein eintippt,
      meint meist die Stadt; der Kanton steht direkt darunter. Ein Ortsteil
      kommt zuletzt, weil er keine eigene Rechtslage hat.
    */
    function art(g) { return g.g ? 2 : (g.t === 'kanton' ? 1 : 0) }
    var treffer = daten
      .filter(function (g) { return g._a.indexOf(a) !== -1 || g._e.indexOf(e) !== -1 })
      .map(function (g) { return { g: g, r: rang(g) } })
      .sort(function (x, y) {
        if (x.r !== y.r) return x.r - y.r
        if (art(x.g) !== art(y.g)) return art(x.g) - art(y.g)
        if (x.g.n.length !== y.g.n.length) return x.g.n.length - y.g.n.length
        return x.g.n.localeCompare(y.g.n, 'de')
      })
      .map(function (t) { return t.g })
    if (treffer.length === 0) {
      raum.textContent = 'Keine Gemeinde dieses Namens. Vielleicht ein Ortsteil? '
        + 'Auf der Karte findest du die zuständige Gemeinde über den Ort selbst.'
      return
    }

    var ul = document.createElement('ul')
    treffer.slice(0, 40).forEach(function (g) {
      var li = document.createElement('li')
      var links = document.createElement('span')
      if (g.p) {
        var ziel = document.createElement('a')
        ziel.href = g.p
        ziel.textContent = g.n
        links.appendChild(ziel)
      } else {
        links.textContent = g.n
      }

      /*
        Kam der Treffer ueber den Zweitnamen, steht er in Klammern dahinter.

        Wer 'Sitten' eintippt und 'Sion' zurueckbekommt, saehe sonst einen
        fremden Namen und wuesste nicht, ob das seine Gemeinde ist. Er steht
        am Namen und nicht in der Spalte rechts, weil er zum Namen gehoert —
        rechts stuende bei Genève sonst 'auch Genf · Genf'.

        Nur die Teile, die nicht ohnehin dastehen: OSM schreibt
        'Valais/Wallis', und '(Valais/Wallis)' hinter 'Wallis' waere zur
        Haelfte Wiederholung.
      */
      if (g.a && !passtAufNamen(g, a, e)) {
        var andere = g.a.split('/')
          .map(function (t) { return t.trim() })
          .filter(function (t) { return t && t !== g.n })
        if (andere.length > 0) {
          var zusatz = document.createElement('span')
          zusatz.className = 'auch'
          zusatz.textContent = ' (' + andere.join(', ') + ')'
          links.appendChild(zusatz)
        }
      }
      var rechts = document.createElement('span')
      rechts.className = 'wo'
      var wo
      if (g.t === 'kanton') {
        wo = 'Kanton'
      } else {
        wo = g.g ? 'Ortsteil von ' + g.g : g.k
        if (g.g && g.k) wo += ' · ' + g.k
        if (!g.p) wo += ' · noch nicht nachgeschlagen'
      }
      rechts.textContent = wo
      li.appendChild(links)
      li.appendChild(rechts)
      ul.appendChild(li)
    })
    raum.innerHTML = ''
    if (treffer.length > 40) {
      var mehr = document.createElement('p')
      mehr.className = 'leise'
      mehr.textContent = treffer.length + ' Treffer, die ersten 40 stehen hier.'
      raum.appendChild(mehr)
    }
    raum.appendChild(ul)
  }

  function hole() {
    if (daten || laedt) return Promise.resolve()
    laedt = true
    return fetch('${BASIS}gemeinden-suche.json')
      .then(function (r) { return r.json() })
      .then(function (j) {
        daten = j.map(function (g) {
          /*
            Der Zweitname wird an den Suchtext angehängt, nicht getrennt
            geführt: gesucht wird auf einer Zeichenkette, und 'Wallis Valais'
            enthält beides. Angezeigt wird weiterhin nur g.n.
          */
          var voll = g.a ? g.n + ' ' + g.a.replace(/\\//g, ' ') : g.n
          g._a = ausgeschrieben(voll)
          g._e = entblaettert(voll)
          /*
            Jeder Name einzeln, zusaetzlich zur gemeinsamen Zeile.

            OSM schreibt mehrsprachige Namen als Liste mit Schraegstrich:
            'Valais/Wallis', 'Graubuenden/Grischun/Grigioni'. Als ein Stueck
            verglichen ist 'valais' darin nur enthalten, nicht gleich — und
            landete damit hinter 'Port-Valais'. Aufgeteilt ist es ein genauer
            Treffer, und der Kanton steht oben.
          */
          g._teile = (g.a ? g.n + '/' + g.a : g.n).split('/').map(function (t) {
            return { a: ausgeschrieben(t.trim()), e: entblaettert(t.trim()) }
          })
          g._na = ausgeschrieben(g.n)
          g._ne = entblaettert(g.n)
          return g
        })
      })
      .catch(function () {
        raum.textContent = 'Die Suche lässt sich gerade nicht laden. Die Liste darunter steht weiterhin.'
        if (liste) liste.hidden = false
      })
      .then(function () { laedt = false })
  }

  feld.addEventListener('input', function () {
    var begriff = feld.value.trim()
    if (!begriff) { zeichne(''); return }
    hole().then(function () { zeichne(feld.value.trim()) })
  })
})()
`)


/* ----------------------------------------------------------------- Sitemap */

const eintraege = [
  `  <url><loc>${ORIGIN}${BASIS}</loc><lastmod>${heute}</lastmod><priority>1.0</priority></url>`,
  `  <url><loc>${ORIGIN}${BASIS}gemeinden</loc><lastmod>${heute}</lastmod><priority>0.9</priority></url>`,
  ...kantonsAdressen.map(({ pfad, stand }) =>
    `  <url><loc>${ORIGIN}${pfad}</loc><lastmod>${stand ?? heute}</lastmod><priority>0.8</priority></url>`),
  ...adressen.map(({ pfad, stand }) =>
    `  <url><loc>${ORIGIN}${pfad}</loc><lastmod>${stand ?? heute}</lastmod><priority>0.7</priority></url>`),
]

writeFileSync(`${DIST}sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n`
  + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${eintraege.join('\n')}\n</urlset>\n`)

/* ------------------------------------------------------------- robots.txt */

/*
 * Wird hier geschrieben und nicht als Datei in `public/` abgelegt, weil sie den
 * Verweis auf die Sitemap trägt — und der braucht die absolute Adresse, die
 * erst beim Bauen feststeht. Eine Datei mit fest eingetragener Domain wäre auf
 * dem jeweils anderen Ziel schlicht falsch.
 *
 * Cloudflare liefert bislang eine selbst verwaltete robots.txt aus; ist die
 * Verwaltung im Dashboard eingeschaltet, hängt sie ihren Block an diesen hier
 * an. Beides nebeneinander ist gültig — was hier steht, geht dabei nicht
 * verloren.
 */
writeFileSync(`${DIST}robots.txt`, `User-agent: *
Allow: /

Sitemap: ${ORIGIN}${BASIS}sitemap.xml
`)

console.log(
  `\n  \x1b[32m✓\x1b[0m ${adressen.length} Gemeindeseiten, ${kantonsAdressen.length} Kantonsseiten, `
  + `die Übersicht und die Sitemap geschrieben.\n`
  + `    \x1b[90m${uebersprungen} Gemeinden ohne Eintrag bekommen bewusst keine Seite.\x1b[0m\n`
  + `    \x1b[90mrobots.txt verweist auf ${ORIGIN}${BASIS}sitemap.xml\x1b[0m\n`
  + `    \x1b[90mSuchliste: 26 Kantone + ${gemeinden.length} Gemeinden + ${ORTE.length} Orte, `
  + `${(statSync(`${DIST}gemeinden-suche.json`).size / 1024).toFixed(0)} KB\x1b[0m\n`,
)
