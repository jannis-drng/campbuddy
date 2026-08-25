/**
 * Den Service Worker anmelden — und zwar erst, wenn die Seite steht.
 *
 * Die Anmeldung selbst kostet eine Anfrage und einen Startvorgang. Beides
 * während des ersten Ladens ist genau der falsche Moment: es konkurriert mit
 * dem, was der Nutzer sehen will. Nach `load` ist die Leitung frei, und der
 * Gewinn kommt ohnehin erst beim nächsten Besuch.
 *
 * Nur in der gebauten Fassung. Im Entwicklungsmodus stünde ein Cache zwischen
 * Änderung und Browser — die verlässlichste Art, eine Stunde mit einem Fehler
 * zu verbringen, den es nicht mehr gibt.
 */
export function serviceWorkerAnmelden() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const basis = import.meta.env.BASE_URL
    navigator.serviceWorker
      .register(`${basis}sw.js`, { scope: basis })
      // Ein fehlgeschlagener Service Worker ist kein Grund, die Anwendung
      // scheitern zu lassen: ohne ihn ist sie langsamer, nicht kaputt.
      .catch(() => {})
  })
}

/**
 * Dem Service Worker sagen, dass die Seite durch ist.
 *
 * Er wärmt seinen Cache erst danach vor. Das klingt nach einer Feinheit und
 * ist keine: wärmt er früher vor, holt er genau die Dateien ein zweites Mal,
 * die die Seite gerade selbst lädt. Gemessen kostete das auf gedrosseltem Netz
 * 346 KB umsonst — für die Zonendatei, ausgerechnet.
 *
 * Aufgerufen wird das, wenn die Kartendaten stehen (siehe App.tsx). Kommt kein
 * Service Worker zustande, passiert schlicht nichts.
 */
export function serviceWorkerVorwaermen() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ typ: 'vorwaermen' }))
    .catch(() => {})
}
