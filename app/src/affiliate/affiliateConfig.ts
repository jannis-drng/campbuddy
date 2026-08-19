/**
 * SCHICHT 3 — AFFILIATE-/PRODUKT-SCHICHT.
 *
 * Abschnitt 7 der Spezifikation: Struktur jetzt, Anbindung später.
 * Hier stehen ausschliesslich Konfigurationswerte — kein Code der UI
 * kennt einen Händler direkt. Echte Partner-IDs eintragen, `enabled`
 * auf true setzen, fertig: kein Umbau, nur Konfiguration.
 */

export interface Vendor {
  key: string
  label: string
  /** Partner-/Publisher-ID. Leer = noch nicht angebunden. */
  partnerId: string
  /** {url} und {pid} werden ersetzt. */
  linkTemplate: string
  commissionHint: string
}

export const AFFILIATE_ENABLED = false

export const VENDORS: Record<string, Vendor> = {
  bergfreunde: {
    key: 'bergfreunde',
    label: 'Bergfreunde',
    partnerId: '',
    linkTemplate: '{url}?partner={pid}',
    commissionHint: 'ca. 7–9 %',
  },
  decathlon: {
    key: 'decathlon',
    label: 'Decathlon',
    partnerId: '',
    linkTemplate: '{url}?aff={pid}',
    commissionHint: 'ca. 4–6 %',
  },
  generic: {
    key: 'generic',
    label: 'Händler',
    partnerId: '',
    linkTemplate: '{url}',
    commissionHint: '—',
  },
}

/**
 * Baut den Kauf-Link. Solange die Anbindung fehlt, liefert die Funktion
 * bewusst `null` — die UI zeigt dann "bald verfügbar" statt eines toten Links.
 */
export function buildAffiliateUrl(vendorKey: string | null, productUrl: string | null): string | null {
  if (!AFFILIATE_ENABLED || !productUrl) return null
  const vendor = VENDORS[vendorKey ?? 'generic'] ?? VENDORS.generic
  if (!vendor.partnerId) return null
  return vendor.linkTemplate.replace('{url}', productUrl).replace('{pid}', vendor.partnerId)
}
