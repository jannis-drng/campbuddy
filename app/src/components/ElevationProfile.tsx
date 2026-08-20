/**
 * Höhenprofil der Route.
 *
 * Als reines SVG gezeichnet statt mit einer Diagrammbibliothek: es ist eine
 * einzige Fläche, und jede Bibliothek wäre grösser als der Code hier.
 */
import type { ElevationPoint } from '../services/elevation'

interface Props {
  profil: ElevationPoint[]
  /** Etappengrenzen in Metern, werden als Trennlinien eingezeichnet. */
  etappenGrenzen?: number[]
}

const B = 320 // Zeichenbreite im ViewBox-Koordinatensystem
const H = 90

export function ElevationProfile({ profil, etappenGrenzen = [] }: Props) {
  if (profil.length < 2) return null

  const hoehen = profil.map((p) => p.elevation)
  const minEle = Math.min(...hoehen)
  const maxEle = Math.max(...hoehen)
  const gesamt = profil[profil.length - 1].distance_m
  // Flache Profile brauchen trotzdem eine Spanne, sonst teilt man durch null.
  const spanne = Math.max(maxEle - minEle, 50)

  const x = (d: number) => (d / gesamt) * B
  const y = (e: number) => H - ((e - minEle) / spanne) * (H - 12) - 6

  const linie = profil.map((p) => `${x(p.distance_m).toFixed(1)},${y(p.elevation).toFixed(1)}`).join(' ')
  const flaeche = `0,${H} ${linie} ${B},${H}`

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${B} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label={`Höhenprofil: ${Math.round(minEle)} bis ${Math.round(maxEle)} Meter über ${(gesamt / 1000).toFixed(1)} Kilometer`}
      >
        <defs>
          <linearGradient id="hoehenverlauf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <polygon points={flaeche} fill="url(#hoehenverlauf)" />
        <polyline points={linie} fill="none" stroke="#34d399" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

        {etappenGrenzen.map((d) => (
          <line
            key={d}
            x1={x(d)} y1="0" x2={x(d)} y2={H}
            stroke="#f8fafc" strokeWidth="1" strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke" opacity="0.5"
          />
        ))}
      </svg>

      <figcaption className="mt-1 flex justify-between text-mikro text-ink-500">
        <span>0 km</span>
        <span>{Math.round(minEle)}–{Math.round(maxEle)} m</span>
        <span>{(gesamt / 1000).toFixed(1).replace('.', ',')} km</span>
      </figcaption>
    </figure>
  )
}
