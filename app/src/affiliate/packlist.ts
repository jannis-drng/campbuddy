/**
 * SCHICHT 3 — Ausrüstungs- & Verpflegungs-Generator (Abschnitt 4.3).
 *
 * Reine Rechenlogik ohne UI und ohne Netzzugriff: aus Tour-Eckdaten und
 * optional der Wettervorhersage entsteht eine Packliste samt Verpflegungsmenge.
 * Alle Annahmen sind als Konstanten sichtbar und werden im UI offen ausgewiesen —
 * Faustformeln sollen als Faustformeln erkennbar bleiben.
 */
import type { TripParams } from '../data/types'
import { GEAR_ITEMS, type GearCategory, type GearItem } from './gearItems'

export interface PacklistEntry {
  item: GearItem
  quantity: number
  /** Gesamtgewicht dieser Position in Gramm, null wenn kein Gewicht hinterlegt. */
  weight_g: number | null
}

export interface FoodEstimate {
  kcalPerPersonPerDay: number
  totalKcal: number
  /** Geschätztes Lebensmittelgewicht in Gramm für die ganze Gruppe. */
  weight_g: number
  assumptions: string[]
}

export interface Packlist {
  categories: { category: GearCategory; entries: PacklistEntry[] }[]
  totalWeight_g: number
  food: FoodEstimate
  /** Auf welcher Temperatur die Auswahl beruht — Kernannahme, gehört sichtbar ins UI. */
  basedOnNightTemp: number
  /** true, wenn die Temperatur aus echter Vorhersage stammt statt aus der Jahreszeit. */
  fromForecast: boolean
}

/* ---------------- Annahmen, bewusst an einer Stelle ---------------- */

/** Grundumsatz pro Person und Tag. */
const BASE_KCAL = 2200
/** Zuschlag fürs Gehen mit Gepäck (ca. 5–7 h Marsch). */
const ACTIVITY_KCAL = 1400
/** Kälte kostet zusätzliche Energie. */
const WINTER_FACTOR = 1.15
/** Über 2000 m steigt der Umsatz messbar an. */
const ALTITUDE_FACTOR = 1.05
/** Energiedichte typischer Trekkingnahrung in kcal pro Gramm. */
const KCAL_PER_GRAM = 4.5
/** Eine 230-g-Gaskartusche reicht erfahrungsgemäss für rund 5 Personentage. */
const PERSON_DAYS_PER_CARTRIDGE = 5

/** Erwartete Nachttemperatur ohne Vorhersage — grobe Näherung aus Jahreszeit und Höhe. */
function estimateNightTemp(trip: TripParams): number {
  const seaLevel = { sommer: 16, uebergang: 8, winter: 0 }[trip.season]
  return seaLevel - (trip.elevation / 100) * 0.65
}

/**
 * Baut die Packliste.
 * `coldestNight` überschreibt die Jahreszeit-Schätzung, sobald echte Wetterdaten vorliegen.
 */
export function buildPacklist(trip: TripParams, coldestNight?: number): Packlist {
  const nightTemp = coldestNight ?? estimateNightTemp(trip)
  const fromForecast = coldestNight != null

  const relevant = GEAR_ITEMS.filter((item) => {
    if (!item.seasons.includes(trip.season)) return false
    if (item.shelter && !item.shelter.includes(trip.shelter)) return false
    if (item.group === 'schlafsack') return false // eigene Auswahl, siehe unten
    // Wärmeabhängige Teile fallen weg, wenn es dafür zu mild ist. Damit dabei keine
    // Pflichtausrüstung verschwindet, tragen essenzielle Teile entweder min_temp: null
    // oder eine Schwelle, die im Alpenraum praktisch immer greift (siehe gearItems).
    if (item.min_temp != null && nightTemp > item.min_temp) return false
    return true
  })

  const sleepingBag = pickSleepingBag(trip, nightTemp)
  const items = sleepingBag ? [...relevant, sleepingBag] : relevant

  const entries = items.map((item) => {
    const quantity = quantityFor(item, trip)
    return {
      item,
      quantity,
      weight_g: item.weight_g != null ? item.weight_g * quantity : null,
    }
  })

  // Kategorien in einer für den Packvorgang sinnvollen Reihenfolge.
  const ORDER: GearCategory[] = ['Schlafen', 'Rucksack', 'Kleidung', 'Kochen', 'Navigation', 'Sicherheit', 'Hygiene']
  const categories = ORDER
    .map((category) => ({ category, entries: entries.filter((e) => e.item.category === category) }))
    .filter((g) => g.entries.length > 0)

  return {
    categories,
    totalWeight_g: entries.reduce((sum, e) => sum + (e.weight_g ?? 0), 0),
    food: estimateFood(trip),
    basedOnNightTemp: Math.round(nightTemp * 10) / 10,
    fromForecast,
  }
}

/** Leichtester Schlafsack, der die erwartete kälteste Nacht noch abdeckt. */
function pickSleepingBag(trip: TripParams, nightTemp: number): GearItem | null {
  if (trip.shelter === 'huette') return null
  const candidates = GEAR_ITEMS
    .filter((i) => i.group === 'schlafsack' && i.seasons.includes(trip.season))
    .filter((i) => i.min_temp != null && i.min_temp <= nightTemp)
    // höchster Komfortwert = leichtester noch ausreichender Sack
    .sort((a, b) => (b.min_temp ?? 0) - (a.min_temp ?? 0))

  if (candidates.length > 0) return candidates[0]

  // Kälter als jeder katalogisierte Sack: den wärmsten nehmen statt gar keinen.
  const warmest = GEAR_ITEMS
    .filter((i) => i.group === 'schlafsack')
    .sort((a, b) => (a.min_temp ?? 0) - (b.min_temp ?? 0))[0]
  return warmest ?? null
}

function quantityFor(item: GearItem, trip: TripParams): number {
  if (item.id === 'gaskartusche') {
    return Math.max(1, Math.ceil((trip.persons * trip.days) / PERSON_DAYS_PER_CARTRIDGE))
  }
  return item.per === 'person' ? trip.persons : 1
}

export function estimateFood(trip: TripParams): FoodEstimate {
  let kcal = BASE_KCAL + ACTIVITY_KCAL
  const assumptions = [
    `${BASE_KCAL} kcal Grundumsatz + ${ACTIVITY_KCAL} kcal fürs Gehen mit Gepäck`,
  ]

  if (trip.season === 'winter') {
    kcal *= WINTER_FACTOR
    assumptions.push(`+${Math.round((WINTER_FACTOR - 1) * 100)} % für Kälte`)
  }
  if (trip.elevation > 2000) {
    kcal *= ALTITUDE_FACTOR
    assumptions.push(`+${Math.round((ALTITUDE_FACTOR - 1) * 100)} % für Höhe über 2000 m`)
  }

  const kcalPerPersonPerDay = Math.round(kcal / 50) * 50
  const totalKcal = kcalPerPersonPerDay * trip.days * trip.persons
  assumptions.push(`${KCAL_PER_GRAM} kcal pro Gramm Trekkingnahrung`)

  return {
    kcalPerPersonPerDay,
    totalKcal,
    weight_g: Math.round(totalKcal / KCAL_PER_GRAM),
    assumptions,
  }
}

export const formatWeight = (g: number): string =>
  g >= 1000 ? `${(g / 1000).toFixed(1).replace('.', ',')} kg` : `${Math.round(g)} g`
