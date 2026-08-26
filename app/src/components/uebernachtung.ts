/**
 * Wie ein Nachtlager heisst und aussieht.
 *
 * Steht getrennt, weil es zwei Stellen braucht: den Etappenplaner auf der
 * Karte, wo Nächte gewählt werden, und das Tourfenster, wo die gewählten
 * später nachgeschlagen werden. Zwei Listen mit denselben fünf Zeilen wären
 * beim ersten neuen Ort auseinandergelaufen.
 *
 * Bewusst ohne JSX in einer `.ts`-Datei: so bleibt der Etappenplaner ein
 * Modul, das nur Komponenten ausliefert, und behält sein schnelles Neuladen
 * im Entwicklungsmodus.
 */
import { Building2, MapPin, Star, Tent, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Uebernachtung } from '../data/hiking'

export const UEBERNACHTUNG_ICON: Record<Uebernachtung['art'], LucideIcon> = {
  hut: Building2,
  campsite: Tent,
  vehicle_spot: Truck,
  eigen: Star,
  stopp: MapPin,
}

export const UEBERNACHTUNG_LABEL: Record<Uebernachtung['art'], string> = {
  hut: 'Hütte',
  campsite: 'Campingplatz',
  vehicle_spot: 'Stellplatz',
  eigen: 'Markierter Schlafplatz',
  stopp: 'Dein Stopp',
}
