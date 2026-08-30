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
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
function beschreibung(name, e) {
  const teile = [
    `Zelten ${REGEL_TEXT[e.tent_allowed][0]}`,
    `Biwakieren ${REGEL_TEXT[e.bivouac_allowed ?? 'unknown'][0]}`,
    `Übernachten im Fahrzeug ${REGEL_TEXT[e.vehicle_allowed][0]}`,
    `offenes Feuer ${REGEL_TEXT[e.fire_allowed][0]}`,
  ]
  return `Übernachten in der Natur in ${name}: ${teile.join(', ')}. `
       + `Mit Quelle und Prüfdatum (${e.last_verified ?? 'ohne Datum'}).`
}

/** Adresstauglicher Name: „Val-de-Travers" → „val-de-travers". */
function kennung(name) {
  return name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
footer{border-top:1px solid #1F2A2E;margin-top:3rem;padding-top:1.25rem;font-size:.85rem;color:#8A9A9F}
footer a{margin-right:1.25rem}
`.trim()

function zeile(bezeichnung, wert) {
  const [text, farbe] = REGEL_TEXT[wert ?? 'unknown']
  return `<tr><th>${bezeichnung}</th><td style="color:${farbe}">${text}</td></tr>`
}

function seite(g, e, nachbarn = []) {
  const name = g.properties.name
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
<meta name="description" content="${escape(beschreibung(name, e))}">
<link rel="canonical" href="${ORIGIN}${pfad}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="CampBuddy">
<meta property="og:title" content="${escape(titel)}">
<meta property="og:description" content="${escape(beschreibung(name, e))}">
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
    <a itemprop="item" href="${BASIS}gemeinden#${kennung(kantonName)}"><span itemprop="name">${escape(kantonName)}</span></a>
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

  ${nachbarn.length > 0 ? `<h2>Weitere Gemeinden${kantonName ? ` im Kanton ${escape(kantonName)}` : ''}</h2>
  <p class="nachbarn">${nachbarn.map((n) =>
    `<a href="${BASIS}${n.pfad}">${escape(n.name)}</a>`).join(' · ')}</p>
  <p class="leise"><a href="${BASIS}gemeinden">Alle eingestuften Gemeinden ansehen</a></p>` : ''}

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
  const kantone = [...NACH_KANTON.entries()]
    .map(([code, liste]) => [KANTON[code] ?? code ?? 'Ohne Kanton', liste])
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
  <h1>Gemeinden mit belegter Rechtslage</h1>
  <p class="ort">${eingestuft.length} von ${gemeinden.length} Schweizer Gemeinden · Stand ${heute}</p>

  <p>Für diese Gemeinden ist im Wortlaut ihres Reglements nachgeschlagen, ob und unter
  welchen Bedingungen dort im Freien übernachtet werden darf — getrennt nach Zelt, Biwak,
  Fahrzeug und offenem Feuer, jeweils mit Quelle und Prüfdatum.</p>

  <p class="leise">Die übrigen Gemeinden fehlen hier nicht aus Versehen: für sie ist noch
  nichts recherchiert, und die Karte sagt das dort auch offen, statt eine Farbe zu raten.
  Kein Eintrag heisst nie „erlaubt".</p>

  <a class="knopf" href="${BASIS}#/karte">Auf der Karte ansehen</a>

  ${kantone.map(([kantonName, liste]) => `
  <h2 id="${kennung(kantonName)}">${escape(kantonName)} <span class="leise">· ${liste.length}</span></h2>
  <p class="nachbarn">${liste.map((n) =>
    `<a href="${BASIS}${n.pfad}">${escape(n.name)}</a>`).join(' · ')}</p>`).join('')}

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
${BEACON}
</body>
</html>
`
}

writeFileSync(`${DIST}gemeinden.html`, uebersichtsSeite())

/* ----------------------------------------------------------------- Sitemap */

const eintraege = [
  `  <url><loc>${ORIGIN}${BASIS}</loc><lastmod>${heute}</lastmod><priority>1.0</priority></url>`,
  `  <url><loc>${ORIGIN}${BASIS}gemeinden</loc><lastmod>${heute}</lastmod><priority>0.9</priority></url>`,
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
  `\n  \x1b[32m✓\x1b[0m ${adressen.length} Gemeindeseiten, die Übersicht und die Sitemap geschrieben.\n`
  + `    \x1b[90m${uebersprungen} Gemeinden ohne Eintrag bekommen bewusst keine Seite.\x1b[0m\n`
  + `    \x1b[90mrobots.txt verweist auf ${ORIGIN}${BASIS}sitemap.xml\x1b[0m\n`,
)
