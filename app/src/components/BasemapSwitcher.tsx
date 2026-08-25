/**
 * Wahl der Hintergrundkarte. Sitzt auf der Karte, nicht in der Kopfzeile —
 * es ist eine Karteneinstellung, keine Navigation.
 */
import { basemapsFor, type BasemapKey } from '../map/mapConfig'

interface Props {
  region: string
  value: BasemapKey
  onChange: (key: BasemapKey) => void
}

export function BasemapSwitcher({ region, value, onChange }: Props) {
  const optionen = basemapsFor(region)
  if (optionen.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Hintergrundkarte"
      /*
        Auf dem Telefon unten rechts: oben teilt sich der Platz mit der
        Rechtslage-Pille, und 375 px reichen nicht für beides. Ab Tablet oben
        rechts — die Zoomstufen von MapLibre rücken dafür nach unten (siehe
        `.maplibregl-ctrl-top-right` in index.css). Weicht wie die Legende
        einer offenen Infokarte aus.
      */
      style={{ right: 'calc(var(--karte-rechts, 0px) + 0.75rem)' }}
      className="absolute bottom-20 z-10 flex overflow-hidden rounded-mittel border
                 border-kante bg-flaeche-2/92 shadow-[var(--shadow-2)] backdrop-blur-md
                 transition-[right] duration-200 ease-[var(--ease-heraus)]
                 sm:bottom-auto sm:top-3"
    >
      {optionen.map((b, i) => (
        <button
          key={b.key}
          onClick={() => onChange(b.key)}
          aria-pressed={value === b.key}
          title={b.hint}
          className={`h-9 px-3 text-klein font-medium transition-colors duration-[160ms]
                      ${i > 0 ? 'border-l border-kante' : ''}
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
