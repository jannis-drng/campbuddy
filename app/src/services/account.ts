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
): Promise<StoredRoute> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')

  const { data, error } = await sb
    .from('routes')
    .insert({
      user_id,
      name,
      region,
      geometry: { type: 'LineString', coordinates: geometry },
      waypoints: waypoints.length > 0 ? waypoints : null,
    })
    .select()
    .single()
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
