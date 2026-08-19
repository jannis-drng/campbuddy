/**
 * SCHICHT 3 — Ausrüstungskatalog (Schema nach Abschnitt 8.5).
 *
 * Trägt später den Ausrüstungsgenerator [BALD]. Jetzt: Datenmodell steht,
 * `affiliate_url` ist überall null — es wird bewusst kein Fantasie-Link gezeigt.
 */
import type { LegalStatus } from '../data/types'

export interface GearItem {
  id: string
  name: string
  category: 'Schlafen' | 'Kochen' | 'Kleidung' | 'Navigation' | 'Sicherheit'
  season: 'sommer' | 'winter' | 'ganzjährig'
  min_temp: number | null
  vendor: string | null
  affiliate_url: string | null
  price_hint: string | null
  /** Warum das Teil zur Legalitäts-Lage passt — der inhaltliche Aufhänger. */
  rationale: string
}

export const GEAR_ITEMS: GearItem[] = [
  {
    id: 'biwaksack',
    name: 'Biwaksack',
    category: 'Schlafen',
    season: 'ganzjährig',
    min_temp: -5,
    vendor: 'bergfreunde',
    affiliate_url: null,
    price_hint: '60–160 €',
    rationale: 'Biwakieren ohne aufgebautes Zelt ist rechtlich oft die mildere Variante — ein Biwaksack fällt kaum auf und ist schnell abgebaut.',
  },
  {
    id: 'leichtzelt',
    name: 'Leichtes 1–2-Personen-Zelt',
    category: 'Schlafen',
    season: 'sommer',
    min_temp: 0,
    vendor: 'bergfreunde',
    affiliate_url: null,
    price_hint: '180–500 €',
    rationale: 'Nur dort sinnvoll, wo Zelten ausdrücklich erlaubt oder geduldet ist.',
  },
  {
    id: 'isomatte',
    name: 'Isomatte (R-Wert ≥ 3)',
    category: 'Schlafen',
    season: 'ganzjährig',
    min_temp: -10,
    vendor: 'decathlon',
    affiliate_url: null,
    price_hint: '40–200 €',
    rationale: 'Oberhalb der Waldgrenze — wo Biwakieren am ehesten geduldet ist — kühlt der Boden stark aus.',
  },
  {
    id: 'gaskocher',
    name: 'Gaskocher',
    category: 'Kochen',
    season: 'ganzjährig',
    min_temp: null,
    vendor: 'decathlon',
    affiliate_url: null,
    price_hint: '25–90 €',
    rationale: 'In Zonen mit Feuerverbot die einzige zulässige Art zu kochen — deshalb praktisch überall nötig.',
  },
  {
    id: 'wasserfilter',
    name: 'Wasserfilter',
    category: 'Sicherheit',
    season: 'ganzjährig',
    min_temp: null,
    vendor: 'bergfreunde',
    affiliate_url: null,
    price_hint: '30–110 €',
    rationale: 'Macht unabhängig von Hütten und erlaubt Standorte abseits der Infrastruktur.',
  },
  {
    id: 'stirnlampe',
    name: 'Stirnlampe',
    category: 'Navigation',
    season: 'ganzjährig',
    min_temp: null,
    vendor: 'decathlon',
    affiliate_url: null,
    price_hint: '20–80 €',
    rationale: 'Spätes Aufbauen und frühes Abbauen ist Teil des rücksichtsvollen Biwakierens.',
  },
]

/** [BALD] Vorstufe des Generators aus Abschnitt 4.3. */
export function suggestGear(status: LegalStatus): GearItem[] {
  if (status === 'forbidden') return []
  if (status === 'tolerated') return GEAR_ITEMS.filter((g) => g.id !== 'leichtzelt')
  return GEAR_ITEMS
}
