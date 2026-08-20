/**
 * Grafiken der Startseite — bewusst als SVG statt als Bild.
 *
 * Ein Screenshot der Karte veraltet mit jedem Datenimport und lädt schwer;
 * ein Schema zeigt den Mechanismus (Route quer durch eingefärbte Flächen)
 * deutlicher, skaliert verlustfrei und trägt die Design-Tokens mit, also auch
 * die eine Regel dieses Projekts: Grün, Gelb und Rot bedeuten Rechtslage.
 */

/** Schematische Karte: Zonen, Punkte und eine Route, die sie durchquert. */
export function KartenSchema({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 250"
      className={className}
      role="img"
      aria-label="Schema einer Karte: eine Route führt durch eine verbotene, eine geduldete und eine ungeprüfte Fläche, dazwischen liegen Hütten und Plätze."
    >
      <defs>
        <linearGradient id="cb-grund" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-flaeche-2)" />
          <stop offset="100%" stopColor="var(--color-flaeche-1)" />
        </linearGradient>
      </defs>

      <rect width="400" height="250" rx="14" fill="url(#cb-grund)" />

      {/* Höhenlinien — nur Andeutung von Gelände, tief im Hintergrund. */}
      <g fill="none" stroke="var(--color-kante)" strokeWidth="1" opacity="0.75">
        <path d="M-10 62 C 60 40, 120 92, 190 70 S 320 30, 410 58" />
        <path d="M-10 96 C 70 76, 130 126, 200 104 S 330 66, 410 92" />
        <path d="M-10 132 C 60 116, 140 162, 210 140 S 330 104, 410 128" />
        <path d="M-10 172 C 80 154, 140 196, 220 176 S 330 146, 410 166" />
        <path d="M-10 210 C 70 196, 150 232, 230 212 S 340 186, 410 202" />
      </g>

      {/* Verboten: Naturschutzgebiet, durchgezogene Kante = belegte Aussage. */}
      <path
        d="M30 34 L142 22 L168 84 L120 128 L44 112 Z"
        fill="var(--color-verboten-500)" fillOpacity="0.16"
        stroke="var(--color-verboten-500)" strokeOpacity="0.55" strokeWidth="1.5"
      />
      {/* Geduldet: der grosse Graubereich, um den es eigentlich geht. */}
      <path
        d="M186 96 L296 74 L344 132 L286 196 L196 174 Z"
        fill="var(--color-geduldet-500)" fillOpacity="0.14"
        stroke="var(--color-geduldet-500)" strokeOpacity="0.5" strokeWidth="1.5"
      />
      {/* Ungeprüft: gestrichelt — genau wie in der App. */}
      <path
        d="M52 156 L136 148 L152 206 L74 224 Z"
        fill="var(--color-ungeklaert-500)" fillOpacity="0.1"
        stroke="var(--color-ungeklaert-400)" strokeOpacity="0.55" strokeWidth="1.5"
        strokeDasharray="5 4"
      />

      {/* Die Route: folgt Wegen, quert die Flächen, endet an einem Schlafpunkt. */}
      <path
        d="M24 214 C 70 190, 86 150, 128 138 S 196 140, 226 118 S 286 108, 322 78"
        fill="none" stroke="var(--color-gletscher-400)" strokeWidth="3"
        strokeLinecap="round" strokeOpacity="0.95"
      />
      <g fill="var(--color-flaeche-1)" stroke="var(--color-gletscher-300)" strokeWidth="2.5">
        <circle cx="24" cy="214" r="5" />
        <circle cx="322" cy="78" r="5" />
      </g>

      {/* Punktarten in ihren Kartenfarben. */}
      <g stroke="var(--color-flaeche-1)" strokeWidth="1.5">
        <circle cx="228" cy="118" r="5.5" fill="var(--color-huette)" />
        <circle cx="96" cy="184" r="5.5" fill="var(--color-zeltplatz)" />
        <circle cx="300" cy="158" r="5.5" fill="var(--color-stellplatz)" />
        <circle cx="132" cy="60" r="5.5" fill="var(--color-huette)" />
      </g>
    </svg>
  )
}

/** Die Wortmarke — dasselbe Zelt-Dreieck wie in der Kopfzeile der App. */
export function Zeltmarke({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 3.5 3 20h18L12 3.5Z" fill="none"
        stroke="var(--color-gletscher-400)" strokeWidth="1.75" strokeLinejoin="round"
      />
      <path d="M12 10.5 17 20H7l5-9.5Z" fill="var(--color-gletscher-400)" opacity="0.28" />
    </svg>
  )
}
