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
import { getSupabase, type StoredRoute, type StoredTrip } from './supabase'

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
): Promise<{ bestaetigungNoetig: boolean }> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: rueckkehrAdresse() },
  })
  if (error) throw new Error(uebersetzeFehler(error.message))
  return { bestaetigungNoetig: data.session == null }
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(uebersetzeFehler(error.message))
}

/** Anmeldung über einen externen Anbieter (Google, Apple, …). */
export async function signInWithProvider(provider: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
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
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: rueckkehrAdresse() })
  if (error) throw new Error(uebersetzeFehler(error.message))
}

/** Passwort ändern — setzt eine bestehende Anmeldung voraus. */
export async function passwortAendern(neu: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
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
  if (m.includes('provider is not enabled')) return 'Dieser Anmeldeweg ist im Projekt noch nicht eingerichtet.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Versuche. Warte einen Moment.'
  return nachricht
}

/** Schickt den Anmeldelink — der passwortlose Weg. */
export async function signInWithEmail(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('?')[0] },
  })
  if (error) throw new Error(uebersetzeFehler(error.message))
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

/* ---------------- Routen (8.4) ---------------- */

export async function listRoutes(): Promise<StoredRoute[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('routes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StoredRoute[]
}

export async function saveRoute(
  name: string,
  region: string,
  geometry: Position[],
  waypoints: Position[],
  optionen: { is_public?: boolean; beschreibung?: string; autor?: string } = {},
): Promise<StoredRoute> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')

  // Die Community-Spalten kommen erst mit Migration 0005. Sie werden nur
  // mitgeschickt, wenn sie auch gesetzt werden sollen — sonst schlüge das
  // Speichern fehl, solange die Migration noch aussteht.
  const zeile: Record<string, unknown> = {
    user_id,
    name,
    region,
    geometry: { type: 'LineString', coordinates: geometry },
    waypoints: waypoints.length > 0 ? waypoints : null,
  }
  if (optionen.is_public !== undefined) zeile.is_public = optionen.is_public
  if (optionen.beschreibung !== undefined) zeile.beschreibung = optionen.beschreibung
  if (optionen.autor !== undefined) zeile.autor = optionen.autor

  const { data, error } = await sb.from('routes').insert(zeile).select().single()
  if (error) throw new Error(error.message)
  return data as StoredRoute
}

export async function deleteRoute(id: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('routes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/* ---------------- Touren (8.6) ---------------- */

export async function listTrips(): Promise<StoredTrip[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as StoredTrip[]
}

export async function saveTrip(name: string, trip: TripParams, routeId?: string): Promise<StoredTrip> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')

  const { data, error } = await sb
    .from('trips')
    .insert({ user_id, route_id: routeId ?? null, name, ...trip })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as StoredTrip
}

export async function deleteTrip(id: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('trips').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/* ---------------- Community ---------------- */

/**
 * Fehlt die Tabelle oder Spalte, ist die zugehörige Migration schlicht noch
 * nicht eingespielt. Das ist ein Einrichtungszustand, kein Fehler des Nutzers —
 * eine rohe Postgres-Meldung gehört ihm nicht vor die Nase.
 */
function istSchemaFehlt(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST205' || error?.code === '42P01'
}

/**
 * Öffentlich geteilte Routen. Braucht keine Anmeldung — die Lese-Policy gibt
 * ausschliesslich als `is_public` markierte Zeilen frei.
 */
export async function listPublicRoutes(limit = 50): Promise<StoredRoute[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('routes')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (istSchemaFehlt(error)) return []
  if (error) throw new Error(error.message)
  return (data ?? []) as StoredRoute[]
}

/** Veröffentlichen oder zurückziehen. Nur für eigene Routen (RLS). */
export async function setRoutePublic(id: string, is_public: boolean, autor?: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const patch: Record<string, unknown> = { is_public }
  if (autor !== undefined) patch.autor = autor
  const { error } = await sb.from('routes').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/* ---------------- Favoriten ---------------- */

export async function listFavoriteIds(): Promise<Set<string>> {
  const sb = getSupabase()
  if (!sb) return new Set()
  const { data, error } = await sb.from('favorites').select('route_id')
  if (error) return new Set()
  return new Set((data ?? []).map((r: { route_id: string }) => r.route_id))
}

/** Die favorisierten Routen selbst — für den Bereich "Deine Touren". */
export async function listFavoriteRoutes(): Promise<StoredRoute[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from('favorites')
    .select('route_id, routes(*)')
    .order('created_at', { ascending: false })
  if (istSchemaFehlt(error)) return []
  if (error) throw new Error(error.message)
  // Supabase typisiert eingebettete Relationen als Array, liefert bei einer
  // 1:1-Beziehung aber ein Objekt. Beides abfangen.
  return (data ?? [])
    .flatMap((r: { routes: StoredRoute | StoredRoute[] | null }) =>
      Array.isArray(r.routes) ? r.routes : r.routes ? [r.routes] : [],
    )
}

export async function addFavorite(routeId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
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
}

export async function ladeProfil(): Promise<Profil | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: userData } = await sb.auth.getUser()
  const id = userData.user?.id
  if (!id) return null

  const { data, error } = await sb
    .from('profiles')
    .select('id, anzeigename, subscription_status, abo_bis')
    .eq('id', id)
    .maybeSingle()
  // Fehlt die Spalte, ist Migration 0006 noch nicht eingespielt — kein Grund,
  // die Kontoseite unbrauchbar zu machen.
  if (error) return { id, anzeigename: null, subscription_status: 'free', abo_bis: null }
  return (data as Profil) ?? { id, anzeigename: null, subscription_status: 'free', abo_bis: null }
}

export async function speichereAnzeigename(anzeigename: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data: userData } = await sb.auth.getUser()
  const id = userData.user?.id
  if (!id) throw new Error('Nicht angemeldet')
  const { error } = await sb
    .from('profiles')
    .upsert({ id, anzeigename: anzeigename.trim() || null })
  if (error) throw new Error(error.message)
}

/**
 * Konto und alle daran hängenden Daten löschen (DSGVO, Recht auf Löschung).
 * Die eigentliche Löschung macht eine Datenbankfunktion — ein Client kann
 * sich nicht selbst aus auth.users entfernen.
 */
export async function kontoLoeschen(): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { error } = await sb.rpc('delete_own_account')
  if (error) {
    throw new Error(
      error.message.includes('delete_own_account')
        ? 'Die Löschfunktion fehlt in der Datenbank — Migration 0006 noch nicht eingespielt.'
        : error.message,
    )
  }
  await sb.auth.signOut()
}
