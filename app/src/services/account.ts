/**
 * Konto und gespeicherte Inhalte [BALD] — Abschnitte 4.6, 8.4, 8.6.
 *
 * Anmeldung per Magic Link: es werden keine Passwörter erfasst, gespeichert
 * oder übertragen. Das ist für ein Solo-Projekt die sicherste Variante —
 * es gibt schlicht kein Passwort, das man falsch behandeln könnte.
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

/** Schickt den Anmeldelink. Kein Passwort, kein Konto-Anlegen-Formular. */
export async function signInWithEmail(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('?')[0] },
  })
  if (error) throw new Error(error.message)
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
