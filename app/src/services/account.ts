/**
 * Konto und gespeicherte Inhalte — Abschnitte 4.6, 8.3, 8.4, 8.6.
 *
 * Drei Wege hinein: Passwort, Magic Link und OAuth. Passwörter werden nie
 * gespeichert oder geloggt — sie gehen direkt an Supabase, das sie gehasht
 * ablegt. Die App selbst sieht sie nur im Formularfeld.
 *
 * Alle Funktionen sind no-ops, solange kein Backend konfiguriert ist. Die
 * Karte muss ohne Konto vollständig funktionieren (Abschnitt 3).
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Position } from '../data/geo'
import type { TripParams } from '../data/types'
import {
  getSupabase, verlaufLaden, EIGENE_LISTEN_SPALTEN, LISTEN_SPALTEN,
  type PublicTour, type Tour, type Verlauf,
} from './supabase'
import type { PackStaende } from '../affiliate/packlist'
import type { Uebernachtung } from '../data/hiking'
import { alleZeilen } from './deckel'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) { setReady(true); return }

    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, ready }
}

/** Wohin der Bestätigungs- bzw. Anmeldelink zurückführt. */
function rueckkehrAdresse(): string {
  return window.location.href.split('?')[0].split('#')[0]
}

/**
 * Registrierung mit Passwort. Supabase verlangt eine Mailbestätigung, bevor
 * die Sitzung gültig wird — deshalb kommt hier meist noch keine Session zurück.
 *
 * Bewusst ohne Benutzernamen (Migration 0022). Er wurde vorher hier abgefragt
 * und als Metadatum mitgeschickt; eingetragen hat ihn ein Trigger, wenn das
 * Konto entstand — also nach der Bestätigung, oft Minuten später. In dieser
 * Lücke konnte der Name vergeben sein, und weil ein Trigger niemandem etwas
 * erklären kann, bekam man wortlos „wanderer-3f9a1c". Der Name gehört deshalb
 * hinter die Anmeldung: dort wird er in derselben Abfrage geprüft, in der er
 * gespeichert wird, und ein Fehlschlag ist ein Fehler und kein Ersatzname.
 *
 * Den Übergangsnamen gibt es weiterhin — das Konto entsteht damit. Nur
 * überschreibt er jetzt nichts mehr, was jemand eingetippt hat.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ bestaetigungNoetig: boolean }> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: rueckkehrAdresse() },
  })
  if (error) throw new Error(uebersetzeFehler(error))
  return { bestaetigungNoetig: data.session == null }
}

/* ---------------- Benutzername ---------------- */

export type NamensUrteil = {
  ok: boolean
  art: 'ok' | 'zu_kurz' | 'zu_lang' | 'zeichen' | 'gesperrt' | 'vergeben' | 'unbekannt'
  meldung: string
}

/** Form und Länge, wie sie Migration 0017 als Constraint festhält. */
export const NAME_MIN = 3
export const NAME_MAX = 20
const NAME_FORM = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

/**
 * Sofortige Rückmeldung ohne Netz — Form und Länge.
 *
 * Bewusst nur das: ob ein Name gesperrt oder vergeben ist, weiss allein die
 * Datenbank. Die Sperrliste im Bundle mitzuliefern hiesse, eine Sammlung von
 * Schimpfwörtern auszuliefern und sie zugleich als Umgehungsanleitung zu
 * veröffentlichen.
 */
export function namensformPruefen(kandidat: string): NamensUrteil | null {
  const n = kandidat.trim()
  if (n.length === 0) return null
  if (n.length < NAME_MIN) return { ok: false, art: 'zu_kurz', meldung: `Mindestens ${NAME_MIN} Zeichen.` }
  if (n.length > NAME_MAX) return { ok: false, art: 'zu_lang', meldung: `Höchstens ${NAME_MAX} Zeichen.` }
  if (!NAME_FORM.test(n)) {
    return {
      ok: false, art: 'zeichen',
      meldung: 'Erlaubt sind Buchstaben, Ziffern, Punkt, Strich und Unterstrich — und das erste Zeichen muss ein Buchstabe oder eine Ziffer sein.',
    }
  }
  return null
}

/**
 * Die vollständige Prüfung: Form, Sperrliste und Verfügbarkeit, alles in der
 * Datenbank. Dieselbe Funktion hängt dort am Trigger — es gibt also keine
 * zweite, abweichende Wahrheit im Browser.
 */
export async function namePruefen(kandidat: string): Promise<NamensUrteil> {
  const sofort = namensformPruefen(kandidat)
  if (sofort) return sofort

  const sb = getSupabase()
  if (!sb) return { ok: true, art: 'ok', meldung: '' }
  const { data, error } = await sb.rpc('name_pruefen', { kandidat: kandidat.trim() })
  if (error) {
    return {
      ok: false, art: 'unbekannt',
      meldung: /function .* does not exist|schema cache/i.test(error.message)
        ? 'Der Name lässt sich gerade nicht prüfen. Versuch es später noch einmal.'
        : error.message,
    }
  }
  return data as NamensUrteil
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(uebersetzeFehler(error))
}

/** Anmeldung über einen externen Anbieter (Google, Apple, …). */
export async function signInWithProvider(provider: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.signInWithOAuth({
    provider: provider as Parameters<typeof sb.auth.signInWithOAuth>[0]['provider'],
    options: { redirectTo: rueckkehrAdresse() },
  })
  if (error) throw new Error(uebersetzeFehler(error))
}

/**
 * Welche externen Anbieter sind im Projekt tatsächlich eingerichtet?
 *
 * Wird direkt beim Auth-Dienst erfragt, statt eine Liste im Code zu pflegen:
 * ein Knopf für einen nicht konfigurierten Anbieter führt sonst in eine
 * Fehlerseite.
 */
export async function verfuegbareAnbieter(): Promise<string[]> {
  const sb = getSupabase()
  if (!sb) return []
  try {
    const url = import.meta.env.VITE_SUPABASE_URL!.replace(/\/$/, '')
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    if (!res.ok) return []
    const json = await res.json()
    return Object.entries(json.external ?? {})
      .filter(([name, aktiv]) => aktiv === true && !['email', 'phone', 'anonymous_users'].includes(name))
      .map(([name]) => name)
  } catch {
    return []
  }
}

/** Passwort vergessen: Link zum Neusetzen anfordern. */
export async function passwortZuruecksetzen(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: rueckkehrAdresse() })
  if (error) throw new Error(uebersetzeFehler(error))
}

/** Passwort ändern — setzt eine bestehende Anmeldung voraus. */
export async function passwortAendern(neu: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.updateUser({ password: neu })
  if (error) throw new Error(uebersetzeFehler(error))
}

/**
 * Scheiterte nicht die Anmeldung, sondern nur der Versand?
 *
 * Der Auth-Dienst meldet das als 500 („error sending confirmation email"),
 * also in derselben Form wie einen echten Serverfehler. Für den Nutzer ist es
 * aber etwas ganz anderes: seine Eingabe war in Ordnung, es kam nur keine Post.
 */
function istMailfehler(nachricht: string): boolean {
  return /error sending|sending (confirmation|recovery|magic link|invite|email)/i.test(nachricht)
}

/**
 * Supabase antwortet auf Englisch — übersetzt, so gut es geht.
 *
 * Zuerst über `error.code`, erst danach über den Text. Der Code ist die
 * verlässlichere Auskunft: die englischen Sätze ändern sich zwischen
 * Auth-Versionen, die Codes nicht. Vorher hing alles am Text, und genau die
 * Fälle, die einem beim Registrieren und beim Passwortwechsel tatsächlich
 * begegnen (Status 422 — schwaches Passwort, unzulässige Adresse, gleiches
 * Passwort wie bisher), fielen durch und standen unübersetzt im Formular.
 */
function uebersetzeFehler(fehler: { message: string; code?: string } | string): string {
  const nachricht = typeof fehler === 'string' ? fehler : fehler.message
  const code = typeof fehler === 'string' ? '' : fehler.code ?? ''

  switch (code) {
    case 'invalid_credentials':
      return 'E-Mail oder Passwort stimmt nicht.'
    case 'email_not_confirmed':
      return 'Bitte bestätige zuerst den Link in deiner E-Mail.'
    case 'user_already_exists':
      return 'Für diese Adresse gibt es schon ein Konto. Melde dich an oder setze das Passwort zurück.'
    // Die Regel steht im Auth-Dienst, nicht hier — deshalb den Originalsatz
    // anhängen: nur er sagt, ob es an der Länge, an den Zeichenarten oder
    // daran liegt, dass das Passwort in einem Leak auftaucht.
    case 'weak_password':
      return `Dieses Passwort lässt der Anmeldedienst nicht zu. ${nachricht}`
    case 'same_password':
      return 'Das ist dein bisheriges Passwort. Wähle ein anderes.'
    case 'email_address_invalid':
      return 'Diese E-Mail-Adresse akzeptiert der Anmeldedienst nicht. Wegwerf- und Testdomains (example.com, test.com) sind gesperrt.'
    case 'email_address_not_authorized':
      return 'An diese Adresse darf gerade keine E-Mail verschickt werden. Nimm eine andere Adresse.'
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Neue Konten lassen sich gerade nicht anlegen.'
    case 'provider_disabled':
      return 'Dieser Anmeldeweg steht hier nicht zur Verfügung.'
    case 'session_not_found':
    case 'no_authorization':
      return 'Deine Anmeldung ist abgelaufen. Melde dich neu an und versuch es noch einmal.'
    case 'over_email_send_rate_limit':
      return 'Zu viele E-Mails in kurzer Zeit. Warte ein paar Minuten.'
    case 'over_request_rate_limit':
      return 'Zu viele Versuche. Warte einen Moment.'
    case 'validation_failed':
      return `Die Eingabe hat der Anmeldedienst abgelehnt. ${nachricht}`
    // Der Mailversand ist ausgefallen — das Konto ist deswegen nicht angelegt.
    // Für den Nutzer ist das kein Eingabefehler, und er soll nicht anfangen,
    // Passwörter oder Adressen zu variieren, weil ihm etwas Rotes entgegenkommt.
    case 'unexpected_failure':
      return istMailfehler(nachricht)
        ? 'Die E-Mail konnte nicht verschickt werden — das liegt am Mailversand, nicht an deiner Eingabe. Versuch es in ein paar Minuten noch einmal.'
        : nachricht
  }

  if (istMailfehler(nachricht)) {
    return 'Die E-Mail konnte nicht verschickt werden — das liegt am Mailversand, nicht an deiner Eingabe. Versuch es in ein paar Minuten noch einmal.'
  }

  // Ältere Auth-Versionen liefern keinen Code — dann bleibt der Text.
  const m = nachricht.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-Mail oder Passwort stimmt nicht.'
  if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst den Link in deiner E-Mail.'
  if (m.includes('user already registered')) return 'Für diese Adresse gibt es schon ein Konto. Melde dich an oder setze das Passwort zurück.'
  if (m.includes('password should be at least')) return 'Das Passwort ist zu kurz.'
  if (m.includes('should be different from the old password')) return 'Das ist dein bisheriges Passwort. Wähle ein anderes.'
  if (m.includes('is invalid') && m.includes('email')) return 'Diese E-Mail-Adresse akzeptiert der Anmeldedienst nicht.'
  if (m.includes('provider is not enabled')) return 'Dieser Anmeldeweg steht hier nicht zur Verfügung.'
  if (m.includes('api key')) return 'Die Verbindung zum Anmeldedienst ist nicht richtig eingerichtet.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Versuche. Warte einen Moment.'
  return nachricht
}

/** Schickt den Anmeldelink — der passwortlose Weg. */
export async function signInWithEmail(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('?')[0] },
  })
  if (error) throw new Error(uebersetzeFehler(error))
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

/* ---------------- Touren (8.4 + 8.6, zusammengelegt) ---------------- */

/**
 * Eine Tour ist der Weg *und* seine Eckdaten.
 *
 * Bis Migration 0016 waren das zwei Tabellen und zwei Speicherknöpfe. Wer
 * eine Mehrtagestour plant, denkt aber nicht in „Route" und „Tour" — er denkt
 * in einer Tour, die einen Verlauf hat. Die Trennung kostete zwei Listen in
 * der Oberfläche und erklärte sich niemandem.
 */
export interface TourEckdaten extends Partial<TripParams> {
  distance_m?: number | null
  ascent_m?: number | null
  duration_s?: number | null
  /** Stand der Checkliste; `null` löscht ihn. Siehe Migration 0021. */
  packliste?: PackStaende | null
  /** Selbst gewählte Nachtlager; `null` heisst „automatischer Vorschlag". */
  etappen?: GespeicherteEtappe[] | null
}

/**
 * Ein selbst gewähltes Nachtlager, wie es in der Tour liegt.
 *
 * Gespeichert wird die Stelle auf der Strecke (`bei_m`) und nicht der Index
 * eines Profilpunkts: das Höhenprofil wird bei jedem Öffnen neu geholt und
 * kann eine andere Auflösung haben — ein Index zeigte danach woandershin, ein
 * Streckenmeter nicht.
 */
export interface GespeicherteEtappe {
  bei_m: number
  name: string
  art: Uebernachtung['art']
  position: [number, number]
}

const ETAPPEN_ARTEN: Uebernachtung['art'][] = ['hut', 'campsite', 'vehicle_spot', 'eigen', 'stopp']

/**
 * Gewählte Nachtlager aus einer gespeicherten Tour lesen.
 *
 * Die Spalte ist `jsonb` und kommt als `unknown` zurück — geschrieben hat sie
 * eine frühere Fassung dieser App, und was dort einmal drinsteht, bleibt
 * drin. Deshalb wird jede Zeile geprüft statt geglaubt: eine kaputte Zeile
 * fällt weg, eine kaputte Liste macht kein Fenster kaputt.
 */
export function etappenLesen(roh: unknown): GespeicherteEtappe[] | null {
  if (!Array.isArray(roh)) return null
  const liste = roh.flatMap((eintrag): GespeicherteEtappe[] => {
    if (!eintrag || typeof eintrag !== 'object') return []
    const e = eintrag as Record<string, unknown>
    const position = e.position
    if (typeof e.bei_m !== 'number' || typeof e.name !== 'string') return []
    if (!ETAPPEN_ARTEN.includes(e.art as Uebernachtung['art'])) return []
    if (!Array.isArray(position) || position.length < 2) return []
    if (typeof position[0] !== 'number' || typeof position[1] !== 'number') return []
    return [{
      bei_m: e.bei_m,
      name: e.name,
      art: e.art as Uebernachtung['art'],
      position: [position[0], position[1]],
    }]
  })
  return liste.length > 0 ? liste : null
}

export async function listTouren(): Promise<Tour[]> {
  const sb = getSupabase()
  if (!sb) return []
  // Geblättert, nicht abgeschnitten: PostgREST hört von sich aus bei 1000
  // Zeilen auf, ohne das zu sagen (siehe deckel.ts).
  // Ohne `geometry` und `waypoints`: die Liste zeichnet nur Vorschaubilder,
  // und wer vierzig gespeicherte Touren hat, lud bisher anderthalb Megabyte
  // für vierzig Bildchen (Migration 0024). Der Weg kommt über `ladeVerlauf`.
  return alleZeilen<Tour>((von, bis) => sb
    .from('routes')
    .select(EIGENE_LISTEN_SPALTEN)
    .order('created_at', { ascending: false })
    .range(von, bis))
}

/**
 * Zahlenfeld auf den Bereich bringen, den die Tabelle zulässt.
 *
 * Der Client soll die Prüfung der Datenbank nicht ersetzen, aber ihr auch
 * nichts vorlegen, was sie zwangsläufig ablehnt. Fehlt ein Wert, bleibt das
 * Feld leer — eine Tour ohne geplantes Datum ist ein normaler Fall und darf
 * nicht am Speichern scheitern.
 */
function zahlImBereich(wert: unknown, min: number, max: number): number | null {
  if (wert === undefined || wert === null) return null
  const zahl = typeof wert === 'number' ? wert : Number(wert)
  if (!Number.isFinite(zahl)) return null
  return Math.min(max, Math.max(min, Math.round(zahl)))
}

/** Die Eckdaten in die Form bringen, die die Tabelle akzeptiert. */
function eckdatenZeile(eck: TourEckdaten | undefined): Record<string, unknown> {
  if (!eck) return {}
  const zeile: Record<string, unknown> = {}
  if (eck.start_date) zeile.start_date = eck.start_date
  if (eck.season) zeile.season = eck.season
  if (eck.shelter) zeile.shelter = eck.shelter
  const days = zahlImBereich(eck.days, 1, 60)
  const persons = zahlImBereich(eck.persons, 1, 20)
  const elevation = zahlImBereich(eck.elevation, 0, 5000)
  if (days !== null) zeile.days = days
  if (persons !== null) zeile.persons = persons
  if (elevation !== null) zeile.elevation = elevation
  // Kenngrössen dürfen 0 sein (Rundkurs ohne Aufstieg), deshalb hier
  // ausdrücklich gegen null prüfen statt gegen falsy.
  if (eck.distance_m != null) zeile.distance_m = Math.round(eck.distance_m)
  if (eck.ascent_m != null) zeile.ascent_m = Math.round(eck.ascent_m)
  if (eck.duration_s != null) zeile.duration_s = Math.round(eck.duration_s)
  // Ausdrücklich gegen `undefined` geprüft: `null` ist hier eine Aussage —
  // „Checkliste zurücksetzen" beziehungsweise „wieder automatisch einteilen".
  if (eck.packliste !== undefined) zeile.packliste = eck.packliste
  if (eck.etappen !== undefined) zeile.etappen = eck.etappen
  return zeile
}

export async function saveTour(
  name: string,
  region: string,
  geometry: Position[],
  waypoints: Position[],
  eckdaten?: TourEckdaten,
  optionen: { is_public?: boolean; beschreibung?: string; autor?: string } = {},
): Promise<Tour> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')

  const zeile: Record<string, unknown> = {
    user_id,
    name,
    region,
    geometry: { type: 'LineString', coordinates: geometry },
    waypoints: waypoints.length > 0 ? waypoints : null,
    ...eckdatenZeile(eckdaten),
  }
  if (optionen.is_public !== undefined) zeile.is_public = optionen.is_public
  if (optionen.beschreibung !== undefined) zeile.beschreibung = optionen.beschreibung
  if (optionen.autor !== undefined) zeile.autor = optionen.autor

  const { data, error } = await sb.from('routes').insert(zeile).select().single()
  if (error) throw new Error(uebersetzeSpeicherfehler(error.message))
  return data as Tour
}

/**
 * Nachträglich ändern: Name, Beschreibung, Eckdaten — und der Verlauf selbst.
 * Nur eigene (RLS).
 *
 * Dass auch die Geometrie mitkommt, ist der Unterschied zwischen „ändern" und
 * „noch einmal speichern". Vorher legte jedes Bearbeiten auf der Karte eine
 * zweite Tour an, weil `saveTour` immer einfügt; wer eine Etappe verschob,
 * hatte danach zwei fast gleiche Touren in der Liste und musste raten, welche
 * die neue ist.
 */
export async function aktualisiereTour(
  id: string,
  patch: {
    name?: string
    beschreibung?: string | null
    geometry?: Position[]
    waypoints?: Position[]
  } & TourEckdaten,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const zeile: Record<string, unknown> = eckdatenZeile(patch)
  if (patch.name !== undefined) zeile.name = patch.name
  if (patch.beschreibung !== undefined) zeile.beschreibung = patch.beschreibung
  if (patch.geometry !== undefined) {
    zeile.geometry = { type: 'LineString', coordinates: patch.geometry }
  }
  if (patch.waypoints !== undefined) {
    zeile.waypoints = patch.waypoints.length > 0 ? patch.waypoints : null
  }
  if (Object.keys(zeile).length === 0) return
  const { error } = await sb.from('routes').update(zeile).eq('id', id)
  if (error) throw new Error(uebersetzeSpeicherfehler(error.message))
}

/**
 * Eine fremde Tour als eigene übernehmen.
 *
 * Kopiert wird der Verlauf und was daran öffentlich hängt — Name, Beschreibung,
 * Kenngrössen — plus die Eckdaten, die sich der Übernehmende gerade selbst
 * eingestellt hat. Nicht kopiert wird, was privat ist: Packliste und Nachtlager
 * der Urheberin stehen gar nicht in der öffentlichen Sicht, und das ist auch
 * richtig so — wo jemand schlafen will, ist seine Planung, nicht ihre.
 *
 * Die Kopie ist immer privat. Wer sie selbst teilen will, tut das ausdrücklich;
 * sonst stünde dieselbe Tour nach zwei Klicks zweimal in der Community.
 */
export async function tourKopieren(
  vorlage: PublicTour,
  name: string,
  eckdaten?: TourEckdaten,
): Promise<Tour> {
  // Nachgeladen, nicht aus der Vorlage genommen: kommt sie aus einer
  // Übersichtsliste, trägt sie nur die ausgedünnte Vorschau — und eine Kopie
  // mit hundertzwanzig statt viertausend Punkten wäre eine andere Tour.
  const verlauf = await verlaufLaden('oeffentliche_routen', vorlage.id)
  const geometry = ((verlauf.geometry ?? vorlage.geometry)?.coordinates ?? []) as Position[]
  const waypoints = (verlauf.waypoints ?? vorlage.waypoints ?? []) as Position[]
  return saveTour(name, vorlage.region, geometry, waypoints, {
    distance_m: vorlage.distance_m,
    ascent_m: vorlage.ascent_m,
    duration_s: vorlage.duration_s,
    ...eckdaten,
  }, {
    is_public: false,
    beschreibung: vorlage.beschreibung ?? undefined,
  })
}

export async function deleteTour(id: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('routes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Datenbankmeldungen sind für Entwickler geschrieben, nicht für Wanderer. */
function uebersetzeSpeicherfehler(meldung: string): string {
  if (/null value in column|violates not-null/i.test(meldung)) {
    return 'Ein Pflichtfeld der Tour war leer. Gib ihr einen Namen und versuche es noch einmal.'
  }
  // Die Grössenbremsen aus Migration 0025 zuerst, sonst fielen sie unter die
  // allgemeine Antwort darunter und schickten jemanden zu Dauer und
  // Personenzahl, während in Wahrheit der Weg zu lang ist.
  if (/routes_geometry_klein|routes_waypoints_klein/i.test(meldung)) {
    return 'Dieser Verlauf ist zu gross zum Speichern. Teile die Tour in Etappen auf.'
  }
  if (/routes_beschreibung_check/i.test(meldung)) {
    return 'Die Beschreibung ist zu lang — höchstens 2000 Zeichen.'
  }
  if (/violates check constraint/i.test(meldung)) {
    return 'Ein Wert liegt ausserhalb des zulässigen Bereichs — prüfe Dauer, Personenzahl und Schlafhöhe.'
  }
  if (/row-level security/i.test(meldung)) {
    return 'Dafür fehlt die Berechtigung — bist du noch angemeldet?'
  }
  if (/column .* does not exist|schema cache/i.test(meldung)) {
    return 'Die Tour lässt sich gerade nicht speichern. Versuch es später noch einmal.'
  }
  return meldung
}

/* ---------------- Veröffentlichen ---------------- */

/**
 * Fehlt die Tabelle oder Spalte, ist die zugehörige Migration schlicht noch
 * nicht eingespielt. Das ist ein Einrichtungszustand, kein Fehler des Nutzers —
 * eine rohe Postgres-Meldung gehört ihm nicht vor die Nase.
 */
export function istSchemaFehlt(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST205' || error?.code === '42P01'
}

/** Veröffentlichen oder zurückziehen. Nur für eigene Touren (RLS). */
export async function setTourPublic(
  id: string,
  is_public: boolean,
  zusatz: { beschreibung?: string } = {},
): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  // Kein `autor` mehr: den holt die View seit Migration 0017 live aus dem
  // Profil. Mitkopiert hiesse, dass eine Umbenennung alte Touren unter dem
  // alten Namen stehen lässt.
  const patch: Record<string, unknown> = { is_public }
  if (zusatz.beschreibung !== undefined) patch.beschreibung = zusatz.beschreibung
  const { error } = await sb.from('routes').update(patch).eq('id', id)
  if (error) throw new Error(uebersetzeSpeicherfehler(error.message))
}

/* ---------------- Favoriten (die eigene Merkliste) ---------------- */

/**
 * Bewusst getrennt von den Likes: ein Like ist ein Zuruf an die Urheberin und
 * öffentlich gezählt, ein Favorit ist die eigene Merkliste und geht
 * niemanden etwas an. Siehe Migration 0016.
 */
export async function listFavoriteIds(): Promise<Set<string>> {
  const sb = getSupabase()
  if (!sb) return new Set()
  try {
    const zeilen = await alleZeilen<{ route_id: string }>((von, bis) =>
      sb.from('favorites').select('route_id').range(von, bis))
    return new Set(zeilen.map((r) => r.route_id))
  } catch {
    return new Set()
  }
}

/**
 * Die gemerkten Touren selbst — für den Bereich "Deine Touren".
 *
 * Zwei Abfragen statt einer eingebetteten: die Merkliste steht in `favorites`,
 * die Touren kommen aus der View `oeffentliche_routen`. PostgREST kann über
 * eine View zwar oft einbetten, aber nur solange es die Beziehung aus der
 * Basistabelle ableiten kann — das ist eine Zusicherung, auf die man eine
 * Seite nicht bauen sollte. Zwei klare Abfragen halten immer.
 *
 * Wer eine Tour gemerkt hat, die inzwischen zurückgezogen wurde, sieht sie
 * hier nicht mehr. Das ist richtig so: sie ist nicht mehr geteilt. Der Eintrag
 * in `favorites` bleibt — wird sie wieder geteilt, ist sie wieder da.
 */
export async function listFavoriteTouren(): Promise<PublicTour[]> {
  const sb = getSupabase()
  if (!sb) return []
  const ids = [...(await listFavoriteIds())]
  if (ids.length === 0) return []
  const { data, error } = await sb
    .from('oeffentliche_routen')
    .select(LISTEN_SPALTEN)
    .in('id', ids)
    .order('veroeffentlicht_am', { ascending: false, nullsFirst: false })
  if (istSchemaFehlt(error)) return []
  if (error) throw new Error(error.message)
  return (data ?? []) as PublicTour[]
}

export async function addFavorite(routeId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')
  const { error } = await sb.from('favorites').insert({ user_id, route_id: routeId })
  if (error) throw new Error(error.message)
}

export async function removeFavorite(routeId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('favorites').delete().eq('route_id', routeId)
  if (error) throw new Error(error.message)
}

/* ---------------- Profil und Abo ---------------- */

export interface Profil {
  id: string
  anzeigename: string | null
  subscription_status: 'free' | 'paid'
  abo_bis: string | null
  /** Wann zuletzt umbenannt. Null = noch nie, dann ist der nächste Wechsel frei. */
  umbenannt_am: string | null
}

/** Sperrfrist fürs Umbenennen — derselbe Wert wie in Migration 0018. */
export const UMBENENNEN_SPERRE_TAGE = 30

/**
 * Ab wann darf wieder umbenannt werden? Null = jetzt.
 *
 * Der Wert wird auch serverseitig geprüft; hier steht er, damit der Knopf
 * nicht erst nach einem Fehlschlag verrät, dass er nichts tut.
 */
export function umbenennenFreiAb(profil: Profil | null): Date | null {
  if (!profil?.umbenannt_am) return null
  const frei = new Date(profil.umbenannt_am)
  frei.setDate(frei.getDate() + UMBENENNEN_SPERRE_TAGE)
  return frei > new Date() ? frei : null
}

/**
 * Das eigene Profil, oder `null`, wenn es sich nicht sagen lässt.
 *
 * Der Unterschied ist seit Migration 0022 wichtig geworden: „Konto ohne
 * Benutzernamen" ist jetzt ein echter Zustand, an dem die Oberfläche etwas
 * festmacht. Ein fehlgeschlagener Lesevorgang darf deshalb nicht als Profil
 * ohne Namen zurückkommen — sonst fragt die App jemanden nach einem Namen, den
 * er längst hat, bloss weil das Netz gerade weg war. Kein Profil heisst hier
 * ausdrücklich: unbekannt.
 */
export async function ladeProfil(): Promise<Profil | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: userData } = await sb.auth.getUser()
  const id = userData.user?.id
  if (!id) return null

  const { data, error } = await sb
    .from('profiles')
    .select('id, anzeigename, subscription_status, abo_bis, umbenannt_am')
    .eq('id', id)
    .maybeSingle()
  if (error) return null
  // Keine Zeile: das Konto ist gerade erst entstanden. Für die Oberfläche ist
  // das dasselbe wie ein Profil ohne Namen.
  return (data as Profil) ?? {
    id, anzeigename: null, subscription_status: 'free', abo_bis: null, umbenannt_am: null,
  }
}

/**
 * Der Übergangsname, den ein neues Konto trägt — dieselbe Bildung wie in
 * `erzeugter_name()` (Migration 0022).
 *
 * Dass er sich aus der Konto-ID ergibt, ist der Trick: „noch nicht gewählt"
 * steht damit im Namen selbst und braucht kein zusätzliches Feld, das ein
 * Client umschreiben könnte.
 */
export function erzeugterName(id: string, laenge = 6): string {
  return `wanderer-${id.replace(/-/g, '').slice(0, laenge)}`
}

/** Trägt das Konto noch den Übergangsnamen — lohnt sich also die Frage danach? */
export function brauchtNamenswahl(profil: Profil | null): boolean {
  if (!profil) return false
  const name = profil.anzeigename?.trim()
  if (!name) return true
  return name === erzeugterName(profil.id) || name === erzeugterName(profil.id, 11)
}

/**
 * Den Benutzernamen setzen — die erste eigene Wahl wie jede spätere Umbenennung.
 *
 * Kein Löschen: jedes Konto hat einen Namen, notfalls den erzeugten, weil
 * geteilte Touren und Kommentare sonst wieder namenlos dastünden. Den
 * Übergangsnamen abzulegen zählt nicht als Umbenennung und startet die
 * Sperrfrist nicht (Migration 0022) — ein Tippfehler in der ersten Wahl sperrt
 * niemanden 30 Tage aus. Die Meldungen des Triggers sind für Menschen
 * geschrieben und werden unverändert durchgereicht.
 */
export async function speichereAnzeigename(anzeigename: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const name = anzeigename.trim()
  if (!name) throw new Error('Der Benutzername darf nicht leer sein.')
  const { data: userData } = await sb.auth.getUser()
  const id = userData.user?.id
  if (!id) throw new Error('Nicht angemeldet')
  const { error } = await sb.from('profiles').upsert({ id, anzeigename: name })
  if (error) {
    // 23505 = unique_violation. Die kommt vom Index, nicht vom Trigger, wenn
    // zwei Umbenennungen im selben Moment auf denselben Namen zielen.
    if (error.code === '23505') throw new Error('Dieser Name ist schon vergeben.')
    throw new Error(error.message)
  }
}

/**
 * Konto und alle daran hängenden Daten löschen (DSGVO, Recht auf Löschung).
 * Die eigentliche Löschung macht eine Datenbankfunktion — ein Client kann
 * sich nicht selbst aus auth.users entfernen.
 */
export async function kontoLoeschen(): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.rpc('delete_own_account')
  if (error) {
    throw new Error(
      error.message.includes('delete_own_account')
        ? 'Das Konto lässt sich gerade nicht löschen. Versuch es später noch einmal.'
        : error.message,
    )
  }
  await sb.auth.signOut()
}

/* ---------------- Rückkehr von einem E-Mail-Link ---------------- */

export interface LinkErgebnis {
  art: 'fehler' | 'passwort-neu' | 'bestaetigt'
  meldung: string
}

/**
 * Wertet aus, was Supabase beim Zurückspringen von einem E-Mail-Link in die
 * Adresszeile schreibt, und räumt sie danach auf.
 *
 * Ohne das bliebe ein abgelaufener Link vollkommen stumm: die Seite lädt
 * normal, man ist nicht angemeldet, und im URL-Fragment steht unsichtbar der
 * Grund.
 */
export function linkErgebnisAuslesen(): LinkErgebnis | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!hash) return null

  const p = new URLSearchParams(hash)
  const fehlerCode = p.get('error_code')
  const fehler = p.get('error')
  const typ = p.get('type')
  if (!fehler && !typ) return null

  const aufraeumen = () =>
    window.history.replaceState(null, '', window.location.pathname + window.location.search)

  if (fehler) {
    aufraeumen()
    const meldung =
      fehlerCode === 'otp_expired'
        ? 'Der Link ist abgelaufen oder wurde schon benutzt. E-Mail-Links gelten nur begrenzt und nur einmal — fordere unten einen neuen an.'
        : fehlerCode === 'access_denied'
          ? 'Die Anmeldung wurde abgebrochen oder abgelehnt.'
          : (p.get('error_description') ?? 'Der Link konnte nicht eingelöst werden.').replace(/\+/g, ' ')
    return { art: 'fehler', meldung }
  }

  aufraeumen()
  if (typ === 'recovery') {
    return { art: 'passwort-neu', meldung: 'Du bist angemeldet. Setze jetzt unten ein neues Passwort.' }
  }
  return { art: 'bestaetigt', meldung: 'E-Mail bestätigt. Du bist angemeldet.' }
}

/**
 * Den vollen Verlauf einer eigenen Tour nachholen.
 *
 * Gegenstück zu `ladeVerlauf` in `community.ts`, nur über die Basistabelle
 * statt über die View — eine eigene Tour muss auch dann ladbar sein, wenn sie
 * nie geteilt wurde. Die RLS sorgt dafür, dass es die eigene bleibt.
 */
export async function ladeEigenenVerlauf(routeId: string): Promise<Verlauf> {
  return verlaufLaden('routes', routeId)
}
