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
import { getSupabase, type PublicTour, type Tour } from './supabase'
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
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  benutzername: string,
): Promise<{ bestaetigungNoetig: boolean }> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    // Der Name reist als Metadatum mit. Ihn erst nach der Anmeldung ins
    // Profil zu schreiben, ginge nicht: solange die E-Mail unbestätigt ist,
    // gibt es keine Sitzung — das Konto entstünde namenlos und bekäme seinen
    // Namen erst Stunden später, wenn überhaupt. Der Trigger
    // `handle_new_user` (Migration 0017) setzt ihn beim Anlegen.
    options: { emailRedirectTo: rueckkehrAdresse(), data: { anzeigename: benutzername } },
  })
  if (error) throw new Error(uebersetzeFehler(error.message))
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
  if (error) throw new Error(uebersetzeFehler(error.message))
}

/** Anmeldung über einen externen Anbieter (Google, Apple, …). */
export async function signInWithProvider(provider: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.signInWithOAuth({
    provider: provider as Parameters<typeof sb.auth.signInWithOAuth>[0]['provider'],
    options: { redirectTo: rueckkehrAdresse() },
  })
  if (error) throw new Error(uebersetzeFehler(error.message))
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
  if (error) throw new Error(uebersetzeFehler(error.message))
}

/** Passwort ändern — setzt eine bestehende Anmeldung voraus. */
export async function passwortAendern(neu: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const { error } = await sb.auth.updateUser({ password: neu })
  if (error) throw new Error(uebersetzeFehler(error.message))
}

/** Supabase antwortet auf Englisch; die häufigen Fälle übersetzt. */
function uebersetzeFehler(nachricht: string): string {
  const m = nachricht.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-Mail oder Passwort stimmt nicht.'
  if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst den Link in deiner E-Mail.'
  if (m.includes('user already registered')) return 'Für diese Adresse gibt es schon ein Konto. Melde dich an oder setze das Passwort zurück.'
  if (m.includes('password should be at least')) return 'Das Passwort ist zu kurz.'
  if (m.includes('provider is not enabled')) return 'Dieser Anmeldeweg steht hier nicht zur Verfügung.'
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
  if (error) throw new Error(uebersetzeFehler(error.message))
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

export async function listTouren(): Promise<Tour[]> {
  const sb = getSupabase()
  if (!sb) return []
  // Geblättert, nicht abgeschnitten: PostgREST hört von sich aus bei 1000
  // Zeilen auf, ohne das zu sagen (siehe deckel.ts).
  return alleZeilen<Tour>((von, bis) => sb
    .from('routes')
    .select('*')
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

/** Nachträglich ändern: Name, Beschreibung, Eckdaten. Nur eigene (RLS). */
export async function aktualisiereTour(
  id: string,
  patch: { name?: string; beschreibung?: string | null } & TourEckdaten,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Diese Funktion steht gerade nicht zur Verfügung.')
  const zeile: Record<string, unknown> = eckdatenZeile(patch)
  if (patch.name !== undefined) zeile.name = patch.name
  if (patch.beschreibung !== undefined) zeile.beschreibung = patch.beschreibung
  if (Object.keys(zeile).length === 0) return
  const { error } = await sb.from('routes').update(zeile).eq('id', id)
  if (error) throw new Error(uebersetzeSpeicherfehler(error.message))
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
    .select('*')
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
  // Fehlt die Spalte, ist Migration 0006 noch nicht eingespielt — kein Grund,
  // die Kontoseite unbrauchbar zu machen.
  const leer: Profil = {
    id, anzeigename: null, subscription_status: 'free', abo_bis: null, umbenannt_am: null,
  }
  if (error) return leer
  return (data as Profil) ?? leer
}

/**
 * Umbenennen.
 *
 * Kein Löschen mehr: seit Migration 0017 hat jedes Konto einen Namen, weil
 * geteilte Touren sonst wieder namenlos dastünden. Die Meldungen des Triggers
 * sind für Menschen geschrieben und werden unverändert durchgereicht.
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
