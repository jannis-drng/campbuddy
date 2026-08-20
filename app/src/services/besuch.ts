/**
 * Merkt sich, dass jemand die Startseite schon gesehen hat.
 *
 * Zweck: Erstbesucher sollen die Startseite bekommen (Erklärung, Vertrauen,
 * Einstieg), wiederkehrende und angemeldete Nutzer direkt die Karte — ein
 * Werkzeug, das man täglich benutzt, soll einen nicht jedes Mal erst bewerben.
 *
 * Bewusst ein einzelnes technisches Cookie ohne Personenbezug: ein Zeichen,
 * kein Identifikator, keine Weitergabe, keine Auswertung. Es lässt keinen
 * Rückschluss auf eine Person zu und dient allein der Bedienung der Seite.
 * `SameSite=Lax` verhindert Mitsenden bei fremden Einbindungen.
 */

const NAME = 'campbuddy_kennt_start'
const EIN_JAHR = 60 * 60 * 24 * 365

export function kenntStartseite(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((c) => c.startsWith(`${NAME}=`))
}

export function startseiteGesehen(): void {
  if (typeof document === 'undefined') return
  // Ohne `Secure`, weil die Entwicklungsumgebung über http läuft und das Cookie
  // sonst dort nie gesetzt würde. Es enthält nichts Schützenswertes.
  document.cookie = `${NAME}=1; path=/; max-age=${EIN_JAHR}; SameSite=Lax`
}

/** Nur für die Vorführung der Startseite gedacht („nochmal ansehen"). */
export function startseiteVergessen(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${NAME}=; path=/; max-age=0; SameSite=Lax`
}
