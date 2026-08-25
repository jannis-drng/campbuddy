/**
 * Selbst markierte Punkte und ihre Fotos.
 *
 * Setzt Migration 0007 voraus. Ohne Backend (oder ohne die Migration) ist
 * hier alles ein No-op beziehungsweise ein sprechender Fehler — die Karte
 * muss ohne Konto vollständig funktionieren (Abschnitt 3 der Spezifikation),
 * und ein fehlendes Backend darf sie nicht lahmlegen.
 *
 * Zur Abgrenzung, die dieses Projekt trägt: was hier gespeichert wird, ist
 * eine persönliche Notiz, keine Rechtsauskunft. Deshalb landet nichts davon
 * in `zones` oder `points`, und die Oberfläche kennzeichnet es als eigene
 * Markierung statt als geprüfte Angabe.
 */
import type { EigenerPunkt, EigenerPunktTyp, RegionCode } from '../data/types'
import { getSupabase } from './supabase'
import { alleZeilen } from './deckel'

const TABELLE = 'eigene_punkte'
const BUCKET = 'punkt-fotos'

export interface PunktEntwurf {
  region: RegionCode
  typ: EigenerPunktTyp
  name: string
  notiz: string | null
  lat: number
  lng: number
  foto_pfad?: string | null
  route_id?: string | null
  ist_oeffentlich?: boolean
}

/**
 * Alle sichtbaren Punkte einer Region: die eigenen und die ausdrücklich
 * veröffentlichten. Welche das sind, entscheidet die Datenbank über Row Level
 * Security — der Client fragt einfach alles ab, was er sehen darf.
 */
export async function ladeEigenePunkte(region: RegionCode): Promise<EigenerPunkt[]> {
  const sb = getSupabase()
  if (!sb) return []
  // Fehler werden bewusst geschluckt: fehlt die Migration noch, soll die Karte
  // trotzdem stehen. Der einzige Verlust sind die eigenen Markierungen.
  try {
    return await alleZeilen<EigenerPunkt>((von, bis) => sb
      .from(TABELLE)
      .select('*')
      .eq('region', region)
      .order('created_at', { ascending: false })
      .range(von, bis))
  } catch {
    return []
  }
}

export async function punktAnlegen(entwurf: PunktEntwurf): Promise<EigenerPunkt> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')

  const { data, error } = await sb
    .from(TABELLE)
    .insert({ ...entwurf, user_id })
    .select()
    .single()
  if (error) throw new Error(uebersetze(error.message))
  return data as EigenerPunkt
}

export async function punktAendern(
  id: string,
  felder: Partial<Pick<EigenerPunkt, 'name' | 'notiz' | 'typ' | 'ist_oeffentlich' | 'foto_pfad'>>,
): Promise<EigenerPunkt> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data, error } = await sb.from(TABELLE).update(felder).eq('id', id).select().single()
  if (error) throw new Error(uebersetze(error.message))
  return data as EigenerPunkt
}

/** Löscht den Punkt und, falls vorhanden, sein Foto — sonst bliebe eine Waise im Speicher. */
export async function punktLoeschen(punkt: EigenerPunkt): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  if (punkt.foto_pfad) await sb.storage.from(BUCKET).remove([punkt.foto_pfad])
  const { error } = await sb.from(TABELLE).delete().eq('id', punkt.id)
  if (error) throw new Error(uebersetze(error.message))
}

/* ------------------------------------------------------------------- Fotos */

export const FOTO_MAX_BYTES = 8 * 1024 * 1024
const ERLAUBTE_TYPEN = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Bild vor dem Hochladen verkleinern.
 *
 * Ein Handyfoto hat gern 4–8 MB. Auf der Karte wird es als Vorschau und im
 * Panel höchstens bildschirmbreit gezeigt — alles darüber kostet nur
 * Speicherplatz, Ladezeit und, unterwegs, echtes Datenvolumen.
 *
 * Nebeneffekt, der hier ausdrücklich erwünscht ist: das Neuzeichnen auf ein
 * Canvas verwirft sämtliche EXIF-Daten, also auch den GPS-Ort und die Uhrzeit
 * der Aufnahme. Der Ort des Punktes ist der, den man auf der Karte gesetzt
 * hat — nicht einer, den die Kamera unbemerkt mitliefert.
 */
export async function bildVerkleinern(datei: File, maxKante = 1600): Promise<Blob> {
  if (!ERLAUBTE_TYPEN.includes(datei.type)) {
    throw new Error('Nur JPEG, PNG oder WebP.')
  }
  const bild = await ladeBild(datei)
  const skala = Math.min(1, maxKante / Math.max(bild.width, bild.height))
  const breite = Math.round(bild.width * skala)
  const hoehe = Math.round(bild.height * skala)

  const c = document.createElement('canvas')
  c.width = breite
  c.height = hoehe
  const g = c.getContext('2d')
  if (!g) throw new Error('Bild konnte nicht verarbeitet werden.')
  g.drawImage(bild, 0, 0, breite, hoehe)
  if ('close' in bild) bild.close()

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.82))
  if (!blob) throw new Error('Bild konnte nicht verarbeitet werden.')
  return blob
}

async function ladeBild(datei: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    // imageOrientation: 'from-image' dreht hochkant aufgenommene Fotos richtig;
    // ohne das läge jedes Handyfoto quer.
    return createImageBitmap(datei, { imageOrientation: 'from-image' })
  }
  const url = URL.createObjectURL(datei)
  try {
    const img = new Image()
    await new Promise((ok, fehler) => {
      img.onload = ok
      img.onerror = () => fehler(new Error('Bild konnte nicht gelesen werden.'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Lädt das Foto hoch und gibt seinen Pfad im Bucket zurück. */
export async function fotoHochladen(datei: File): Promise<string> {
  const sb = getSupabase()
  if (!sb) throw new Error('Kein Backend konfiguriert')
  const { data: userData } = await sb.auth.getUser()
  const user_id = userData.user?.id
  if (!user_id) throw new Error('Nicht angemeldet')

  const blob = await bildVerkleinern(datei)
  if (blob.size > FOTO_MAX_BYTES) throw new Error('Bild ist auch verkleinert zu gross.')

  // Der Ordner ist die Nutzer-ID — genau das prüft die Storage-Policy.
  const pfad = `${user_id}/${crypto.randomUUID()}.webp`
  const { error } = await sb.storage.from(BUCKET).upload(pfad, blob, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) throw new Error(uebersetze(error.message))
  return pfad
}

// Signierte Adressen laufen ab; im Speicher gehalten, damit dieselbe Ansicht
// nicht bei jedem Rendern eine neue Signatur anfordert.
const adressen = new Map<string, { url: string; bis: number }>()
const GUELTIG_S = 60 * 60

export async function fotoAdresse(pfad: string): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null
  const gemerkt = adressen.get(pfad)
  if (gemerkt && gemerkt.bis > Date.now()) return gemerkt.url

  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(pfad, GUELTIG_S)
  if (error || !data) return null
  // Fünf Minuten Sicherheitsabstand, damit keine Adresse benutzt wird, die
  // während des Ladens abläuft.
  adressen.set(pfad, { url: data.signedUrl, bis: Date.now() + (GUELTIG_S - 300) * 1000 })
  return data.signedUrl
}

function uebersetze(meldung: string): string {
  if (/row-level security|violates row-level/i.test(meldung)) {
    return 'Dafür fehlt die Berechtigung — bist du angemeldet?'
  }
  if (/relation .* does not exist|schema cache/i.test(meldung)) {
    return 'Die Tabelle fehlt noch. Migration 0007 im SQL-Editor ausführen.'
  }
  if (/Bucket not found/i.test(meldung)) {
    return 'Der Fotospeicher fehlt noch. Migration 0007 im SQL-Editor ausführen.'
  }
  if (/exceeded the maximum allowed size|Payload too large/i.test(meldung)) {
    return 'Das Bild ist zu gross.'
  }
  return meldung
}
