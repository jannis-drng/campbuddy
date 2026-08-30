/**
 * Wer diese Seite betreibt — die einzige Stelle, an der das steht.
 *
 * Ein Impressum ist keine Textsorte, sondern eine Pflichtangabe: Name, ladungs-
 * fähige Anschrift und ein Weg, auf dem man den Betreiber tatsächlich erreicht.
 * Genau deshalb steht hier nichts Erfundenes und nichts Ungefähres. Was fehlt,
 * bleibt leer, und die Seite sagt dann offen, dass es fehlt.
 *
 * **Diese Datei ist auszufüllen.** Solange etwas fehlt, sind die Seiten trotzdem
 * verlinkt und benennen die Lücke im Klartext — das ist besser als ein
 * versteckter Pflichttext und deutlich besser als eine erfundene Anschrift.
 * `npm run pflichtangaben` (läuft nach jedem Build) sagt beim Bauen an, was
 * noch fehlt.
 *
 * Ein Postfach genügt nicht; es muss eine Anschrift sein, an der eine Zustellung
 * ankommt. Wer das an der eigenen Wohnanschrift nicht will, mietet eine
 * ladungsfähige Adresse — das ist der übliche Weg bei Einzelprojekten und
 * kostet im Jahr weniger als ein Wanderschuh.
 */
export interface Betreiber {
  /** Vor- und Nachname, oder die Firma samt Rechtsform. */
  name: string
  /** Strasse und Hausnummer. */
  strasse: string
  /** Postleitzahl und Ort. */
  ort: string
  /** Land, ausgeschrieben. */
  land: string
  /** Erreichbar und regelmässig gelesen — eine Wegwerfadresse erfüllt die Pflicht nicht. */
  email: string
  /**
   * Telefonnummer.
   *
   * Nicht zwingend, solange die E-Mail-Adresse eine zügige Antwort ermöglicht.
   * Leer lassen ist also in Ordnung; eine Nummer, die nie abgehoben wird,
   * wäre schlechter als keine.
   */
  telefon: string
  /**
   * Umsatzsteuer-Identifikationsnummer, falls vorhanden.
   *
   * Für ein Projekt ohne Umsätze gibt es keine — dann bleibt das Feld leer und
   * die Zeile erscheint nicht. Wird das Komfort-Paket aus dem
   * Monetarisierungs-Fahrplan verkauft, gehört sie nachgetragen.
   */
  ustId: string
}

export const BETREIBER: Betreiber = {
  name: '',
  strasse: '',
  ort: '',
  land: 'Deutschland',
  email: '',
  telefon: '',
  ustId: '',
}

/**
 * Reicht das für ein Impressum?
 *
 * Nur wenn Name, Anschrift und ein Kontaktweg dastehen. Die Rechtsseiten fragen
 * das ab und benennen fehlende Angaben offen, statt sie mit Platzhaltern zu
 * füllen, die aussehen wie Angaben.
 */
export const impressumVollstaendig: boolean = Boolean(
  BETREIBER.name && BETREIBER.strasse && BETREIBER.ort && BETREIBER.email,
)

/** Der Verantwortliche im Sinne der DSGVO ist derselbe — nur einmal gepflegt. */
export const VERANTWORTLICH = BETREIBER
