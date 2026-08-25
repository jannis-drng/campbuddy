/**
 * Missbrauchsmeldungen zu öffentlichen Inhalten.
 *
 * Die Karte lebt davon, dass ihre Angaben stimmen — und sobald Fremde Inhalte
 * sehen, die andere hochgeladen haben, braucht es einen Weg, Falsches und
 * Anstössiges zu melden. Ohne den ist die einzige Handhabe, dass jemand dir
 * schreibt und hofft, dass du es liest.
 *
 * Melden darf auch, wer kein Konto hat: wer ein anstössiges Foto sieht, legt
 * dafür selten erst eines an. Gelesen werden die Meldungen nicht über die API,
 * sondern im Supabase-Dashboard — sie enthalten Vorwürfe gegen Dritte.
 */
import { getSupabase } from './supabase'

export type MeldeGrund =
  | 'falsche_rechtsangabe'
  | 'privatgrund'
  | 'schutzgebiet'
  | 'anstoessig'
  | 'spam'
  | 'sonstiges'

export const MELDE_GRUENDE: { wert: MeldeGrund; label: string; hilfe: string }[] = [
  {
    wert: 'falsche_rechtsangabe',
    label: 'Falsche Rechtsangabe',
    hilfe: 'Hier gilt etwas anderes, als der Eintrag behauptet.',
  },
  { wert: 'privatgrund', label: 'Privatgrund', hilfe: 'Der Ort darf nicht betreten werden.' },
  { wert: 'schutzgebiet', label: 'Schutzgebiet', hilfe: 'Der Ort liegt in einem geschützten Gebiet.' },
  { wert: 'anstoessig', label: 'Anstössig', hilfe: 'Beleidigend, gefährlich oder nicht jugendfrei.' },
  { wert: 'spam', label: 'Spam', hilfe: 'Werbung oder sinnloser Inhalt.' },
  { wert: 'sonstiges', label: 'Etwas anderes', hilfe: 'Bitte kurz beschreiben.' },
]

/** Worauf sich eine Meldung beziehen kann — Spiegel des Checks in Migration 0016. */
export type ZielArt = 'route' | 'punkt' | 'kommentar'

export const BESCHREIBUNG_MAX = 1000

/**
 * Sendet eine Meldung ab.
 *
 * `melder` wird nur gesetzt, wenn jemand angemeldet ist — die Policy lässt
 * ausschliesslich die eigene ID zu, niemand kann eine Meldung einem anderen
 * Konto unterschieben.
 */
export async function meldungAbsenden(
  zielArt: ZielArt,
  zielId: string,
  grund: MeldeGrund,
  beschreibung: string,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Melden ist gerade nicht möglich.')

  const { data } = await sb.auth.getUser()
  const text = beschreibung.trim()

  const { error } = await sb.from('meldungen').insert({
    ziel_art: zielArt,
    ziel_id: zielId,
    grund,
    beschreibung: text ? text.slice(0, BESCHREIBUNG_MAX) : null,
    melder: data.user?.id ?? null,
  })

  if (error) {
    // Fehlt die Tabelle, ist die Migration noch nicht eingespielt. Das ist
    // kein Fehler des Meldenden — aber verschweigen wäre schlimmer, denn er
    // ginge davon aus, die Meldung sei angekommen.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      throw new Error('Meldungen lassen sich gerade nicht entgegennehmen. Versuch es später noch einmal.')
    }
    throw new Error('Die Meldung konnte nicht gesendet werden.')
  }
}
