/**
 * Die Weiche vor der Anwendung: Startseite oder Werkzeug.
 *
 * Regel (bewusst in dieser Reihenfolge):
 *  1. `#/start` erzwingt die Startseite — damit sie sich jederzeit verlinken
 *     und vorführen lässt, auch wenn man die Karte längst kennt.
 *  2. Eine Rückkehr von einem Bestätigungs- oder Anmeldelink geht sofort in die
 *     Anwendung; nur dort wird das Ergebnis des Links ausgewertet.
 *  3. Wer die Startseite schon gesehen hat (Cookie) oder angemeldet ist, landet
 *     direkt auf der Karte.
 *  4. Alle anderen — also neue Besucher — sehen die Startseite.
 *
 * Die Anwendung selbst kennt diese Weiche nicht und bleibt unverändert.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { LandingPage } from './landing/LandingPage'
import { kenntStartseite, startseiteGesehen } from './services/besuch'
import { isSupabaseConfigured } from './services/supabase'
import { useSession } from './services/account'

/**
 * Die Anwendung wird erst geladen, wenn sie gebraucht wird.
 *
 * Sie bringt MapLibre und die Gipfeldaten mit — zusammen ein Vielfaches der
 * Startseite. Ein neuer Besucher soll dafür nicht warten, bevor er überhaupt
 * weiss, worum es geht. Beim Klick auf „Karte öffnen" ist der Nachladeschritt
 * dann ein Wimpernschlag, weil er über dieselbe warme Verbindung läuft.
 */
const App = lazy(() => import('./App'))

/** Ruhige Fläche statt Ladebalken — die Karte ist in der Regel sofort da. */
const Ladeflaeche = <div className="h-dvh bg-flaeche-1" />

type Ziel = 'start' | 'app'

/** Ein Anmelde-/Bestätigungslink kommt als `#access_token=…`, `#error=…`, `#type=…` zurück. */
function istAuthRueckkehr(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash || hash.startsWith('/')) return false
  const p = new URLSearchParams(hash)
  return p.has('access_token') || p.has('error') || p.has('type')
}

function zielAusAdresse(): Ziel | null {
  if (window.location.hash === '#/start') return 'start'
  if (istAuthRueckkehr()) return 'app'
  if (window.location.hash.startsWith('#/')) return 'app'
  return null
}

export default function Root() {
  const [erzwungen, setErzwungen] = useState<Ziel | null>(zielAusAdresse)
  const { session, ready } = useSession()

  // Zurück-Taste und manuelle Adresseingabe sollen die Weiche neu stellen.
  useEffect(() => {
    const auf = () => setErzwungen(zielAusAdresse())
    window.addEventListener('hashchange', auf)
    return () => window.removeEventListener('hashchange', auf)
  }, [])

  // Die Startseite trägt den werbenden Titel, die App den der Ansicht (siehe
  // App.tsx). Ohne das bliebe der Titel der zuletzt besuchten Ansicht stehen.
  useEffect(() => {
    if (erzwungen === 'start') document.title = 'CampBuddy — Wo darf ich draussen übernachten?'
  }, [erzwungen])

  const kennt = kenntStartseite()

  const inDieApp = () => {
    startseiteGesehen()
    // Die Adresse mitzuführen ist wichtig: sonst zeigt ein geteilter Link nach
    // dem Neuladen wieder die Startseite.
    window.location.hash = '#/karte'
    setErzwungen('app')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  if (erzwungen === 'start') return <LandingPage onStart={inDieApp} />
  if (erzwungen === 'app' || kennt) return <Suspense fallback={Ladeflaeche}><App /></Suspense>

  // Nur dieser eine Fall muss warten: kein Cookie, aber vielleicht eine
  // bestehende Anmeldung. Er tritt praktisch nur nach gelöschten Cookies auf,
  // deshalb genügt eine ruhige Fläche statt eines Ladebalkens.
  if (isSupabaseConfigured && !ready) return Ladeflaeche
  if (session) return <Suspense fallback={Ladeflaeche}><App /></Suspense>

  return <LandingPage onStart={inDieApp} />
}
