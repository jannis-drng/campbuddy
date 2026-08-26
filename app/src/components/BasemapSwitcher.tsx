/**
 * Wahl der Hintergrundkarte. Sitzt auf der Karte, nicht in der Kopfzeile —
 * es ist eine Karteneinstellung, keine Navigation.
 *
 * Wo sie sitzt, entscheidet `Kartenebenen`: sie stand einmal frei schwebend
 * über der unteren Kartenhälfte und wirkte dort wie ein Fremdkörper mitten im
 * Bild. Hier bleibt nur, was sie *ist* — die Wahl selbst.
 */
import { basemapsFor, type BasemapKey } from '../map/mapConfig'

interface Props {
  region: string
  value: BasemapKey
  onChange: (key: BasemapKey) => void
  /** Füllt die Breite — in der Ebenen-Blase auf dem Telefon. */
  breit?: boolean
  className?: string
}

export function BasemapSwitcher({ region, value, onChange, breit, className = '' }: Props) {
  const optionen = basemapsFor(region)
  if (optionen.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Hintergrundkarte"
      /*
        Nebeneinander am Zeiger, untereinander auf dem Telefon. „Landeskarte"
        neben zwei weiteren Namen in eine Blase von 17 rem zu zwängen ging nur
        mit abgeschnittener Schrift — und ein Kartenname, den man raten muss,
        ist keiner.
      */
      className={`overflow-hidden rounded-mittel border border-kante bg-flaeche-2/92
                  shadow-[var(--shadow-2)] backdrop-blur-md
                  ${breit ? 'flex w-full flex-col' : 'flex'} ${className}`}
    >
      {optionen.map((b, i) => (
        <button
          key={b.key}
          onClick={() => onChange(b.key)}
          aria-pressed={value === b.key}
          title={b.hint}
          className={`h-9 px-3 text-klein font-medium transition-colors duration-[160ms]
                      ${breit ? 'text-left' : ''}
                      ${i > 0 ? (breit ? 'border-t border-kante' : 'border-l border-kante') : ''}
                      ${value === b.key
                        ? 'bg-gletscher-500/18 text-gletscher-200'
                        : 'text-ink-400 hover:bg-flaeche-3 hover:text-ink-100'}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
