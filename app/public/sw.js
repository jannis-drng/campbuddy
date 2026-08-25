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
const BAU = '%BUILD%'
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
const KERN = "%PRECACHE%"

self.addEventListener('install', (e) => {
  // Vorwärmen, damit schon der zweite Aufruf ohne Netz auskommt. Das kostet
  // hier fast nichts: die Dateien liegen bereits im HTTP-Cache des Browsers
  // (sie tragen `immutable`), der Service Worker holt sie also nicht neu aus
  // dem Netz, sondern nur in seinen eigenen Speicher.
  //
  // Einzeln statt `addAll`, weil `addAll` bei einem einzigen Fehlschlag alles
  // verwirft. Eine Ebene weniger im Cache ist besser als gar kein Cache.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(
        [BASIS, EINSTIEG, ...(Array.isArray(KERN) ? KERN : [])]
          .map((u) => c.add(u).catch(() => {})),
      ))
      .catch(() => {})
      // Nicht auf das Schliessen aller Tabs warten. Bei einer Seite, die man
      // im Gehen benutzt, ist „beim nächsten Mal" praktisch nie.
      .then(() => self.skipWaiting()),
  )
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
