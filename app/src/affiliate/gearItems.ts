/**
 * SCHICHT 3 — Ausrüstungskatalog (Schema nach Abschnitt 8.5).
 *
 * Trägt den Ausrüstungsgenerator und die Affiliate-Ebene. `affiliate_url` ist
 * überall null: es wird bewusst kein erfundener Produktlink gezeigt. Sobald in
 * affiliateConfig eine Partner-ID steht, werden aus den Einträgen echte Links.
 */
import type { Season } from '../data/types'

export type GearCategory =
  | 'Schlafen' | 'Rucksack' | 'Kochen' | 'Kleidung' | 'Navigation' | 'Sicherheit' | 'Hygiene'

export interface GearItem {
  id: string
  name: string
  category: GearCategory
  /** Für welche Jahreszeiten das Teil sinnvoll ist. */
  seasons: Season[]
  /**
   * Bedeutung hängt von `group` ab:
   * - ohne group: Teil wird nötig, sobald die Nachttemperatur auf oder unter diesen Wert fällt.
   * - group 'schlafsack': Komfortbereich des Sacks — es wird der leichteste gewählt,
   *   der die erwartete kälteste Nacht noch abdeckt.
   * null = temperaturunabhängig.
   */
  min_temp: number | null
  /** Teile einer Gruppe schliessen sich aus; es wird genau eines ausgewählt. */
  group?: 'schlafsack'
  /** Nur bei dieser Übernachtungsart nötig. null = immer. */
  shelter: ('zelt' | 'biwak' | 'huette')[] | null
  /** Pro Person oder einmal pro Gruppe? Steuert die Mengenrechnung. */
  per: 'person' | 'gruppe'
  weight_g: number | null
  vendor: string | null
  affiliate_url: string | null
  price_hint: string | null
  /** Warum das Teil auf der Liste steht — der inhaltliche Aufhänger. */
  rationale: string
  /** Pflichtausrüstung, die nie wegfallen darf. */
  essential: boolean
}

const ALL: Season[] = ['sommer', 'uebergang', 'winter']

export const GEAR_ITEMS: GearItem[] = [
  // ---- Schlafen ----
  {
    id: 'biwaksack', name: 'Biwaksack', category: 'Schlafen', seasons: ALL, min_temp: null,
    shelter: ['biwak'], per: 'person', weight_g: 400, vendor: 'bergfreunde', affiliate_url: null,
    price_hint: '60–160 €', essential: true,
    rationale: 'Biwakieren ohne aufgebautes Zelt ist rechtlich meist die mildere Variante — schnell abgebaut und kaum sichtbar.',
  },
  {
    id: 'leichtzelt', name: 'Leichtes Zelt', category: 'Schlafen', seasons: ALL, min_temp: null,
    shelter: ['zelt'], per: 'gruppe', weight_g: 1900, vendor: 'bergfreunde', affiliate_url: null,
    price_hint: '180–500 €', essential: true,
    rationale: 'Nur dort aufstellen, wo Zelten erlaubt oder ausdrücklich geduldet ist — die Karte zeigt es dir.',
  },
  {
    id: 'schlafsack-sommer', group: 'schlafsack', name: 'Schlafsack (Komfort ca. 5 °C)', category: 'Schlafen',
    seasons: ['sommer'], min_temp: 3, shelter: null, per: 'person', weight_g: 800,
    vendor: 'bergfreunde', affiliate_url: null, price_hint: '90–250 €', essential: true,
    rationale: 'Reicht für milde Sommernächte im Tal und auf mittlerer Höhe.',
  },
  {
    id: 'schlafsack-3jahres', group: 'schlafsack', name: 'Schlafsack (Komfort ca. -5 °C)', category: 'Schlafen',
    seasons: ALL, min_temp: -8, shelter: null, per: 'person', weight_g: 1200,
    vendor: 'bergfreunde', affiliate_url: null, price_hint: '150–400 €', essential: true,
    rationale: 'Oberhalb der Waldgrenze fällt die Temperatur auch im Hochsommer nachts oft unter null.',
  },
  {
    id: 'schlafsack-winter', group: 'schlafsack', name: 'Winterschlafsack (Komfort ca. -15 °C)', category: 'Schlafen',
    seasons: ['winter'], min_temp: -25, shelter: null, per: 'person', weight_g: 1700,
    vendor: 'bergfreunde', affiliate_url: null, price_hint: '250–600 €', essential: true,
    rationale: 'Bei erwarteten Nachttemperaturen deutlich unter dem Gefrierpunkt.',
  },
  {
    id: 'huettenschlafsack', name: 'Hüttenschlafsack', category: 'Schlafen', seasons: ALL,
    min_temp: null, shelter: ['huette'], per: 'person', weight_g: 200, vendor: 'decathlon',
    affiliate_url: null, price_hint: '15–40 €', essential: true,
    rationale: 'In bewirtschafteten Hütten Pflicht — Decken sind vorhanden, ein eigener Inlett-Sack aber vorgeschrieben.',
  },
  {
    id: 'isomatte', name: 'Isomatte (R-Wert ≥ 3)', category: 'Schlafen', seasons: ALL,
    min_temp: null, shelter: ['zelt', 'biwak'], per: 'person', weight_g: 500, vendor: 'decathlon',
    affiliate_url: null, price_hint: '40–200 €', essential: true,
    rationale: 'Der Boden zieht mehr Wärme als die Luft. Ohne ausreichenden R-Wert nützt der beste Schlafsack wenig.',
  },

  // ---- Rucksack ----
  {
    id: 'rucksack', name: 'Trekkingrucksack', category: 'Rucksack', seasons: ALL, min_temp: null,
    shelter: null, per: 'person', weight_g: 1600, vendor: 'bergfreunde', affiliate_url: null,
    price_hint: '120–350 €', essential: true,
    rationale: 'Für mehrtägige Touren mit Schlafausrüstung brauchst du 45–65 Liter.',
  },
  {
    id: 'packsack', name: 'Wasserdichte Packsäcke', category: 'Rucksack', seasons: ALL,
    min_temp: null, shelter: null, per: 'person', weight_g: 120, vendor: 'decathlon',
    affiliate_url: null, price_hint: '15–40 €', essential: false,
    rationale: 'Ein nasser Schlafsack beendet die Tour — Trockenhalten ist wichtiger als Regenschutz aussen.',
  },

  // ---- Kochen ----
  {
    id: 'gaskocher', name: 'Gaskocher', category: 'Kochen', seasons: ALL, min_temp: null,
    shelter: ['zelt', 'biwak'], per: 'gruppe', weight_g: 300, vendor: 'decathlon',
    affiliate_url: null, price_hint: '25–90 €', essential: true,
    rationale: 'In Zonen mit Feuerverbot die einzige zulässige Art zu kochen — und das ist im Wallis die Regel, nicht die Ausnahme.',
  },
  {
    id: 'gaskartusche', name: 'Gaskartuschen', category: 'Kochen', seasons: ALL, min_temp: null,
    shelter: ['zelt', 'biwak'], per: 'gruppe', weight_g: 200, vendor: 'decathlon',
    affiliate_url: null, price_hint: '5–9 € je Stück', essential: true,
    rationale: 'Faustregel: eine 230-g-Kartusche reicht für rund 5 Personentage Kochen.',
  },
  {
    id: 'topf', name: 'Topf & Besteck', category: 'Kochen', seasons: ALL, min_temp: null,
    shelter: ['zelt', 'biwak'], per: 'gruppe', weight_g: 350, vendor: 'decathlon',
    affiliate_url: null, price_hint: '25–70 €', essential: true,
    rationale: 'Ein Topf pro Gruppe genügt, wenn ihr gemeinsam kocht.',
  },
  {
    id: 'wasserfilter', name: 'Wasserfilter', category: 'Sicherheit', seasons: ALL, min_temp: null,
    shelter: null, per: 'gruppe', weight_g: 250, vendor: 'bergfreunde', affiliate_url: null,
    price_hint: '30–110 €', essential: false,
    rationale: 'Macht unabhängig von Hütten und erlaubt Schlafplätze abseits der Infrastruktur.',
  },
  {
    id: 'trinkflasche', name: 'Trinkflaschen (min. 2 l)', category: 'Kochen', seasons: ALL,
    min_temp: null, shelter: null, per: 'person', weight_g: 200, vendor: 'decathlon',
    affiliate_url: null, price_hint: '10–30 €', essential: true,
    rationale: 'Oberhalb der Waldgrenze liegen Quellen oft weit auseinander.',
  },

  // ---- Kleidung ----
  {
    id: 'hardshell', name: 'Regenjacke (Hardshell)', category: 'Kleidung', seasons: ALL,
    min_temp: null, shelter: null, per: 'person', weight_g: 400, vendor: 'bergfreunde',
    affiliate_url: null, price_hint: '120–400 €', essential: true,
    rationale: 'Im Gebirge schlägt das Wetter schnell um — auch bei bester Vorhersage.',
  },
  {
    id: 'daunenjacke', name: 'Isolationsjacke', category: 'Kleidung', seasons: ALL, min_temp: 12,
    shelter: null, per: 'person', weight_g: 400, vendor: 'bergfreunde', affiliate_url: null,
    price_hint: '100–350 €', essential: true,
    rationale: 'Für die Stunden im Lager, wenn du nicht mehr in Bewegung bist und schnell auskühlst.',
  },
  {
    id: 'muetze-handschuhe', name: 'Mütze & Handschuhe', category: 'Kleidung', seasons: ALL,
    min_temp: 10, shelter: null, per: 'person', weight_g: 150, vendor: 'decathlon',
    affiliate_url: null, price_hint: '25–70 €', essential: true,
    rationale: 'Über den Kopf geht ein erheblicher Teil der Wärme verloren — auch im Schlafsack.',
  },
  {
    id: 'wechselwaesche', name: 'Wechselwäsche & Wandersocken', category: 'Kleidung', seasons: ALL,
    min_temp: null, shelter: null, per: 'person', weight_g: 400, vendor: 'decathlon',
    affiliate_url: null, price_hint: '30–80 €', essential: true,
    rationale: 'Trockene Socken sind der wirksamste Blasenschutz.',
  },
  {
    id: 'gamaschen', name: 'Gamaschen', category: 'Kleidung', seasons: ['winter', 'uebergang'],
    min_temp: 2, shelter: null, per: 'person', weight_g: 200, vendor: 'bergfreunde',
    affiliate_url: null, price_hint: '30–80 €', essential: false,
    rationale: 'Hält Schnee und Geröll aus dem Schuh, sobald Altschneefelder im Spiel sind.',
  },

  // ---- Navigation & Sicherheit ----
  {
    id: 'stirnlampe', name: 'Stirnlampe', category: 'Navigation', seasons: ALL, min_temp: null,
    shelter: null, per: 'person', weight_g: 90, vendor: 'decathlon', affiliate_url: null,
    price_hint: '20–80 €', essential: true,
    rationale: 'Spät aufbauen, früh abbauen: rücksichtsvolles Biwakieren findet im Dämmerlicht statt.',
  },
  {
    id: 'karte-kompass', name: 'Karte & Kompass', category: 'Navigation', seasons: ALL,
    min_temp: null, shelter: null, per: 'gruppe', weight_g: 150, vendor: 'bergfreunde',
    affiliate_url: null, price_hint: '20–50 €', essential: true,
    rationale: 'Akkus gehen leer, Papier nicht. Im Wallis ist Mobilfunk in Seitentälern oft weg.',
  },
  {
    id: 'powerbank', name: 'Powerbank', category: 'Navigation', seasons: ALL, min_temp: null,
    shelter: null, per: 'person', weight_g: 250, vendor: 'decathlon', affiliate_url: null,
    price_hint: '25–70 €', essential: false,
    rationale: 'Kälte halbiert die Akkulaufzeit — im Winter Gerät und Powerbank körpernah tragen.',
  },
  {
    id: 'erste-hilfe', name: 'Erste-Hilfe-Set', category: 'Sicherheit', seasons: ALL,
    min_temp: null, shelter: null, per: 'gruppe', weight_g: 300, vendor: 'bergfreunde',
    affiliate_url: null, price_hint: '25–60 €', essential: true,
    rationale: 'Mit Blasenpflaster und Rettungsdecke. Die Rettung braucht im Gebirge Zeit.',
  },
  {
    id: 'sonnenschutz', name: 'Sonnencreme & Brille', category: 'Sicherheit', seasons: ALL,
    min_temp: null, shelter: null, per: 'person', weight_g: 150, vendor: 'decathlon',
    affiliate_url: null, price_hint: '20–60 €', essential: true,
    rationale: 'Auf 2500 m ist die UV-Strahlung rund 50 % stärker als im Flachland, auf Schnee zusätzlich reflektiert.',
  },
  {
    id: 'muellbeutel', name: 'Müllbeutel', category: 'Hygiene', seasons: ALL, min_temp: null,
    shelter: ['zelt', 'biwak'], per: 'gruppe', weight_g: 50, vendor: null, affiliate_url: null,
    price_hint: null, essential: true,
    rationale: 'Alles kommt wieder mit runter. Nichts gefährdet die Duldung des Biwakierens so sehr wie hinterlassener Müll.',
  },
  {
    id: 'trowel', name: 'Kleine Schaufel', category: 'Hygiene', seasons: ALL, min_temp: null,
    shelter: ['zelt', 'biwak'], per: 'gruppe', weight_g: 60, vendor: 'bergfreunde',
    affiliate_url: null, price_hint: '10–25 €', essential: false,
    rationale: 'Notdurft mindestens 60 m von Gewässern entfernt vergraben — Teil des Grundes, warum Biwakieren geduldet bleibt.',
  },
]
