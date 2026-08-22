/**
 * SCHICHT 1 — Regions-Register.
 *
 * Neue Region ergänzen = hier einen Eintrag hinzufügen + Daten unter
 * src/data/zones/ bzw. src/data/points/ ablegen. Kein UI-Umbau nötig.
 */
import type { Region } from './types'

export const REGIONS: Record<string, Region> = {
  CH: {
    code: 'CH',
    name: 'Schweiz',
    country: 'Schweiz',
    center: [8.23, 46.8],
    zoom: 7.2,
    bounds: [5.96, 45.82, 10.49, 47.81],
    legal_framework: {
      summary:
        'In der Schweiz gibt es kein landesweites Verbot des Biwakierens — aber auch keine ' +
        'landesweite Erlaubnis. Massgeblich sind drei Ebenen: Bundesrecht zu Schutzgebieten ' +
        '(Naturschutzgebiete, eidgenössische Jagdbanngebiete, Moorlandschaften), kantonales ' +
        'Recht und kommunale Regelungen. Die Kantone handhaben das sehr unterschiedlich: in ' +
        'weiten Teilen der Alpen gilt ein einzelnes Nachtbiwak oberhalb der Waldgrenze, ' +
        'ausserhalb von Schutzgebieten und abseits von Wildruhezonen, als geduldet — anderswo ' +
        'bestehen ausdrückliche Verbote. Innerhalb von Naturschutzgebieten, eidgenössischen ' +
        'Jagdbanngebieten und Wildruhezonen ist Übernachten in der Regel untersagt. Camping ' +
        'mit Fahrzeug ausserhalb bewilligter Plätze ist durchgehend strenger geregelt als ein ' +
        'Zelt-Biwak.',
      // Bewusst 'unknown' und nicht 'tolerated': was im Wallis oberhalb der Waldgrenze
      // verbreitet geduldet wird, ist in anderen Kantonen ausdrücklich verboten. Eine
      // landesweite Duldung zu behaupten wäre die bequeme Antwort und die falsche.
      baseline_status: 'unknown',
      references: [
        { label: 'Bundesgesetz über den Natur- und Heimatschutz (NHG, SR 451)', url: 'https://www.fedlex.admin.ch/eli/cc/1966/1637_1694_1679/de' },
        { label: 'Verordnung über die eidgenössischen Jagdbanngebiete (VEJ, SR 922.31)', url: 'https://www.fedlex.admin.ch/eli/cc/1991/2570_2570_2570/de' },
        { label: 'Verordnung über den Schutz der Hoch- und Übergangsmoore (SR 451.32)', url: 'https://www.fedlex.admin.ch/eli/cc/1991/350_350_350/de' },
        { label: 'Wildruhezonen Schweiz (Bundesamt für Umwelt BAFU)', url: 'https://www.wildruhezonen.ch/' },
        { label: 'Schweizerischer Alpen-Club SAC — Biwakieren', url: 'https://www.sac-cas.ch/de/ausbildung-und-sicherheit/tourenplanung/' },
      ],
    },
  },

}

export const DEFAULT_REGION = 'CH'
