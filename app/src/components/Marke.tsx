/*
  Die Bildmarke von CampBuddy.

  Sie zeigt, was das Vorschaubild der Seite fotografisch zeigt: ein beleuchtetes
  Zelt vor Graten in der Dämmerung. Drei Entscheidungen stecken darin, und alle
  drei haben einen Grund, der über Geschmack hinausgeht:

  1. Die **Bodenlinie**. Ohne sie ist ein Dreieck ein Berg. Erst der Boden, der
     links und rechts über das Zelt hinausläuft, macht daraus ein Zelt — das war
     in den Entwürfen der Unterschied zwischen "irgendein Outdoor-Logo" und
     "hier übernachtet jemand".
  2. Die **helle Tür**. Licht im Zelt heisst: da schläft jemand, und zwar heute
     Nacht. Das ist die Aussage des Produkts in einer Fläche.
  3. **Gletscherblau, nichts sonst.** Grün, Gelb und Rot gehören in diesem
     Produkt der Rechtslage (siehe die Farbtokens in `index.css`). Eine
     Marke in einer dieser Farben würde mit der Information konkurrieren,
     für die es die App überhaupt gibt.

  Zwei Dichten, dieselbe Handschrift: `Marke` überall dort, wo Platz ist, und
  `MarkeKlein` unter ~24 px. Die Grate lösen sich in dieser Grösse ohnehin in
  Matsch auf; das Zelt allein bleibt lesbar.
*/

type Eigenschaften = { className?: string }

/** Zelt vor zwei Graten — die volle Marke, ab etwa 24 px. */
export function Marke({ className = '' }: Eigenschaften) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {/* Die Grate laufen hinter dem Zelt aus: sie enden exakt auf dessen
          Schrägen, damit keine Linie sichtbar durch die Zeltwand schneidet. */}
      <path
        d="M2.4 26 6.2 16.6 9.1 21M19.5 20 24.6 6.8 29.6 26"
        fill="none" stroke="var(--color-gletscher-600)"
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
      />
      <path
        d="M14.6 11.6 23 26H6.2Z" fill="none"
        stroke="var(--color-gletscher-400)" strokeWidth="2.1" strokeLinejoin="round"
      />
      <path d="M14.6 18.6 17.9 26h-6.6Z" fill="var(--color-gletscher-300)" />
      <path
        d="M2.4 26h27.2" stroke="var(--color-gletscher-400)"
        strokeWidth="2.2" strokeLinecap="round"
      />
    </svg>
  )
}

/** Nur das Zelt — für Favicon-Grössen und enge Stellen unter ~24 px. */
export function MarkeKlein({ className = '' }: Eigenschaften) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M16 8 26.4 26H5.6Z" fill="none"
        stroke="var(--color-gletscher-400)" strokeWidth="2.4" strokeLinejoin="round"
      />
      <path d="M16 16.6 20 26h-8Z" fill="var(--color-gletscher-300)" />
      <path
        d="M3.4 26h25.2" stroke="var(--color-gletscher-400)"
        strokeWidth="2.4" strokeLinecap="round"
      />
    </svg>
  )
}
