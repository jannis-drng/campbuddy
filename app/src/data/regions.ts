/**
 * SCHICHT 1 — Regions-Register.
 *
 * Neue Region ergänzen = hier einen Eintrag hinzufügen + Daten unter
 * src/data/zones/ bzw. src/data/points/ ablegen. Kein UI-Umbau nötig.
 */
import type { Region } from './types'

export const REGIONS: Record<string, Region> = {
  'CH-VS': {
    code: 'CH-VS',
    name: 'Wallis',
    country: 'Schweiz',
    center: [7.75, 46.15],
    zoom: 8.4,
    bounds: [6.75, 45.85, 8.5, 46.65],
    legal_framework: {
      summary:
        'In der Schweiz gibt es kein landesweites Verbot des Biwakierens. Massgeblich sind ' +
        'Bundesrecht zu Schutzgebieten, kantonales Recht und kommunale Regelungen. Im Wallis ' +
        'gilt ein einzelnes Nachtbiwak oberhalb der Waldgrenze, ausserhalb von Schutzgebieten ' +
        'und abseits von Wildruhezonen, verbreitet als geduldet. Innerhalb von Naturschutz- ' +
        'gebieten, eidgenössischen Jagdbanngebieten und Wildruhezonen ist Übernachten in der ' +
        'Regel untersagt. Camping mit Fahrzeug ausserhalb bewilligter Plätze ist deutlich ' +
        'strenger geregelt als ein Zelt-Biwak.',
      baseline_status: 'tolerated',
      references: [
        { label: 'Bundesgesetz über den Natur- und Heimatschutz (NHG, SR 451)', url: 'https://www.fedlex.admin.ch/eli/cc/1966/1637_1694_1679/de' },
        { label: 'Verordnung über die eidgenössischen Jagdbanngebiete (VEJ, SR 922.31)', url: 'https://www.fedlex.admin.ch/eli/cc/1991/2570_2570_2570/de' },
        { label: 'Kanton Wallis — Geoportal / Dienststelle für Wald, Flussbau und Landschaft', url: 'https://www.vs.ch/de/web/sfcep' },
        { label: 'Wildruhezonen Schweiz (Bundesamt für Umwelt BAFU)', url: 'https://www.wildruhezonen.ch/' },
      ],
    },
  },
}

export const DEFAULT_REGION = 'CH-VS'
