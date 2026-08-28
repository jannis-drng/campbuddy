/**
 * Der Service Worker — die Antwort auf „schlechtes Netz".
 *
 * Die Karte wird da benutzt, wo es keine gibt: im Tal vor dem Aufstieg, auf
 * dem Parkplatz am Ende der Strasse, an der Hütte mit einem Balken Empfang.
 * Ohne diese Datei kostete jeder Wiederbesuch dieselbe gute Megabyte wie der
 * erste — obwohl sich in der Zwischenzeit nichts geändert hatte.
 *
 * Die Strategie in drei Sätzen:
 *
 *  1. Alles unter /assets/ trägt einen Inhalts-Hash im Namen. Ändert sich der
 *     Inhalt, ändert sich der Name. Deshalb darf es aus dem Cache kommen, ohne
 *     zu fragen — es kann gar keine veraltete Fassung sein.
 *  2. Das Einstiegsdokument kommt zuerst aus dem Netz, mit dem Cache als
 *     Rückfall. Andersherum zeigte ein Wiederbesuch nach einem Deploy die
 *     alten Asset-Namen und die Seite bliebe weiss.
 *  3. Alles Fremde — Kartenkacheln, Wetter, Routing, Supabase — wird
 *     durchgereicht und nicht angefasst. Kacheln zu cachen wäre eine eigene,
 *     grössere Entscheidung (Offline-Karte, [SPÄTER] in der Spezifikation) mit
 *     eigenen Fragen zu Speicherplatz und Lizenz.
 *
 * Bewusst von Hand geschrieben statt Workbox: es sind sechzig Zeilen, und eine
 * Abhängigkeit, die im Fehlerfall zwischen der App und dem Netz steht, will
 * man lesen können.
 */

/** Wird beim Bauen ersetzt (siehe `adressenEinsetzen` in vite.config.ts). */
const BAU = '20260828224444'
const CACHE = `campbuddy-${BAU}`

const BASIS = new URL(self.registration.scope).pathname
const EINSTIEG = `${BASIS}index.html`

/**
 * Die Dateien, ohne die die Karte nichts aussagt.
 *
 * Wird beim Bauen eingesetzt (`kernAssets` in vite.config.ts), weil die Namen
 * einen Inhalts-Hash tragen und erst dann feststehen. Die Kacheln sind
 * absichtlich nicht dabei — über dreihundert Stück, und welche jemand braucht,
 * weiss man erst, wenn er hinsieht.
 */
const KERN = ["/campbuddy/assets/App-B2k4QVOw.css","/campbuddy/assets/App-C63Y_nfy.js","/campbuddy/assets/gemeinden.CH-IkkqpjBB.json","/campbuddy/assets/gemeinden.uebersicht.CH-DAq8Q0vq.json","/campbuddy/assets/gipfel.CH-DuvUoqPC.json","/campbuddy/assets/gipfel.hoch.CH-BkJNkZhY.json","/campbuddy/assets/index-CyNn_Qoa.css","/campbuddy/assets/index-V8IwOte9.js","/campbuddy/assets/inter-latin-opsz-normal-BwkfbSeq.woff2","/campbuddy/assets/kantone.CH-DoggMh7_.json","/campbuddy/assets/natur.CH-C_nfML-8.json","/campbuddy/assets/punkte.CH-C64Et8sY.json","/campbuddy/assets/zonen.CH-BwNOl-Mi.json"]

self.addEventListener('install', (e) => {
  // Nur die Hülle, und sofort übernehmen. Das Vorwärmen der grossen Dateien
  // passiert bewusst NICHT hier — siehe `vorwaermen`.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all([BASIS, EINSTIEG].map((u) => c.add(u).catch(() => {}))))
      .catch(() => {})
      // Nicht auf das Schliessen aller Tabs warten. Bei einer Seite, die man
      // im Gehen benutzt, ist „beim nächsten Mal" praktisch nie.
      .then(() => self.skipWaiting()),
  )
})

/**
 * Die Kerndateien in den eigenen Speicher holen — ohne sie neu herunterzuladen.
 *
 * Der springende Punkt ist `cache: 'force-cache'`. Der Service Worker meldet
 * sich an, während die Seite noch lädt; ein gewöhnliches `fetch` holte genau
 * die Dateien ein zweites Mal, die die Seite in derselben Sekunde selbst
 * anfordert — gemessen kostete das den ersten Besuch rund 350 KB umsonst.
 *
 * `force-cache` sagt dem Browser: nimm, was du hast, und geh nur ans Netz,
 * wenn du nichts hast. Weil alles unter /assets/ einen Inhalts-Hash trägt,
 * ist das immer die richtige Datei — es gibt keine veraltete Fassung unter
 * demselben Namen.
 *
 * `force-cache` allein reicht aber nicht: solange die Anfrage der Seite noch
 * unterwegs ist, liegt die Datei eben *noch nicht* im Cache, und dann geht
 * auch force-cache ans Netz. Das Vorwärmen muss also warten, bis die Seite
 * fertig geladen hat.
 *
 * Wann das ist, weiss nur die Seite selbst — sie sagt es per `postMessage`,
 * sobald ihre Kartendaten stehen (siehe `services/sw.ts`). Zwei einfachere
 * Versuche waren vorher da und beide falsch: eine feste Wartezeit muss raten
 * und kommt auf langsamen Leitungen zu früh; „seit drei Sekunden lief nichts
 * durch den fetch-Handler" hält die lange Übertragung des Kartenbündels für
 * eine Pause. Gemessen holte der Service Worker dann die Zonendatei ein
 * zweites Mal — 346 KB umsonst, ausgerechnet auf der langsamen Leitung.
 *
 * Was durch den fetch-Handler gelaufen ist, wird übersprungen; es liegt dort
 * bereits. Nacheinander statt gleichzeitig: das läuft neben dem, was der
 * Nutzer gerade tut, und soll ihm die Leitung nicht wegnehmen.
 */
const gesehen = new Set()
let laeuft = false

async function vorwaermen() {
  if (!Array.isArray(KERN) || laeuft) return
  laeuft = true
  const c = await caches.open(CACHE)
  for (const u of KERN) {
    if (gesehen.has(u) || await c.match(u)) continue
    try {
      const res = await fetch(u, { cache: 'force-cache' })
      if (res.ok && res.status === 200) await c.put(u, res)
    } catch { /* eine Ebene weniger im Cache ist besser als kein Cache */ }
  }
}

/**
 * Die Seite meldet, dass sie durch ist.
 *
 * Bleibt die Meldung aus — jemand schliesst den Tab beim Laden —, wird
 * einfach nicht vorgewärmt. Der Cache ist dann so voll, wie der fetch-Handler
 * ihn gefüllt hat, und das ist genau das, was die Seite tatsächlich brauchte.
 */
self.addEventListener('message', (e) => {
  if (e.data?.typ === 'vorwaermen') e.waitUntil(vorwaermen())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => n.startsWith('campbuddy-') && n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigationen: Netz zuerst, Cache als Rückfall. Ohne Netz landet man auf
  // der zuletzt ausgelieferten Fassung statt auf der Fehlerseite des Browsers.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const kopie = res.clone()
          caches.open(CACHE).then((c) => c.put(EINSTIEG, kopie)).catch(() => {})
          return res
        })
        .catch(() => caches.match(EINSTIEG).then((t) => t ?? Response.error())),
    )
    return
  }

  // Gehashte Dateien: aus dem Cache, ohne Rückfrage. Das ist der ganze Gewinn —
  // MapLibre, die Zonen, die Gemeindekacheln, alles kommt beim zweiten Besuch
  // ohne eine einzige Netzanfrage.
  if (url.pathname.startsWith(`${BASIS}assets/`)) {
    // Mitschreiben, was hier durchläuft: `vorwaermen` überspringt es dann und
    // holt es nicht ein zweites Mal, während die Seite noch daran zieht.
    gesehen.add(url.pathname)

    e.respondWith(
      caches.match(request).then((treffer) => treffer ?? fetch(request).then((res) => {
        // Nur Vollantworten aufheben. Eine 206 oder ein Fehler im Cache wäre
        // schlimmer als kein Cache: er käme bei jedem Aufruf zurück.
        if (res.ok && res.status === 200) {
          const kopie = res.clone()
          caches.open(CACHE).then((c) => c.put(request, kopie)).catch(() => {})
        }
        return res
      })),
    )
  }
})
