/** Wahl der Hintergrundkarte. Sitzt auf der Karte, nicht in der Kopfzeile — es ist eine Karteneinstellung. */
import { basemapsFor, type BasemapKey } from '../map/mapConfig'

interface Props {
  region: string
  value: BasemapKey
  onChange: (key: BasemapKey) => void
}

export function BasemapSwitcher({ region, value, onChange }: Props) {
  const options = basemapsFor(region)
  if (options.length < 2) return null

  return (
    <div className="absolute right-3 top-28 z-10 flex flex-col gap-1 rounded-lg border border-white/10 bg-slate-900/85 p-1 shadow-lg backdrop-blur">
      {options.map((b) => (
        <button
          key={b.key}
          onClick={() => onChange(b.key)}
          aria-pressed={value === b.key}
          title={b.hint}
          className={`min-h-9 rounded-md px-2.5 py-1.5 text-xs transition ${
            value === b.key ? 'bg-emerald-500/25 text-emerald-100' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}
