/**
 * Impressum und Datenschutzerklärung.
 *
 * Beides fehlte, und beides wurde mit dem Ko-fi-Link fällig, nicht erst mit
 * dem ersten verkauften Paket: sobald eine Seite um Geld bittet und Konten
 * führt, ist sie kein privates Basteln mehr.
 *
 * Zwei Grundsätze, die diesen Text von den üblichen Generatorseiten trennen:
 *
 *  1. **Hier steht nur, was die App wirklich tut.** Jede genannte Verbindung
 *     lässt sich in `_headers.vorlage` unter `connect-src` nachzählen, jeder
 *     genannte Speicherplatz im Quelltext. Eine Datenschutzerklärung, die
 *     vorsorglich Dinge aufzählt, die nie passieren, ist keine Auskunft,
 *     sondern eine Nebelwand.
 *  2. **Nichts wird erfunden.** Die Angaben zum Betreiber stehen in
 *     `betreiber.ts` und sind ausgefüllt oder eben sichtbar leer.
 *
 * Das ist eine sorgfältig zusammengestellte Selbstauskunft, keine
 * Rechtsberatung — vor dem ersten bezahlten Angebot gehört sie einmal
 * fachlich gegengelesen (siehe MONETARISIERUNG.md, Stufe 3).
 */
import { useEffect, type ReactNode } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import { Marke } from '../components/Marke'
import { BETREIBER, impressumVollstaendig } from './betreiber'

export type Rechtsseite = 'impressum' | 'datenschutz'

const TITEL: Record<Rechtsseite, string> = {
  impressum: 'Impressum',
  datenschutz: 'Datenschutzerklärung',
}

/* --------------------------------------------------------------- Bausteine */

function Absatz({ children }: { children: ReactNode }) {
  return <p className="text-fliess leading-relaxed text-ink-300">{children}</p>
}

function Kapitel({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-kante pt-8">
      <h2 className="text-ueberschrift font-semibold tracking-tight text-ink-50">{titel}</h2>
      {children}
    </section>
  )
}

function Aufzaehlung({ punkte }: { punkte: ReactNode[] }) {
  return (
    <ul className="space-y-2 text-fliess leading-relaxed text-ink-300">
      {punkte.map((p, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-500" />
          <span className="min-w-0">{p}</span>
        </li>
      ))}
    </ul>
  )
}

function Aussen({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href} target="_blank" rel="noreferrer noopener"
      className="text-gletscher-400 transition-colors duration-[160ms] hover:text-gletscher-300"
    >
      {children}
    </a>
  )
}

/**
 * Wenn eine Pflichtangabe noch fehlt, sagt die Seite das — statt die Lücke mit
 * einem Platzhalter zu füllen, der aussieht wie eine Angabe.
 */
function Fehlt({ was }: { was: string }) {
  return (
    <span className="rounded-klein bg-geduldet-500/[0.12] px-1.5 py-0.5 font-medium text-geduldet-400">
      {was} noch nicht eingetragen
    </span>
  )
}

/* --------------------------------------------------------------- Impressum */

function Impressum() {
  return (
    <>
      <Kapitel titel="Angaben gemäss § 5 DDG">
        {impressumVollstaendig ? (
          <address className="not-italic text-fliess leading-relaxed text-ink-300">
            {BETREIBER.name}<br />
            {BETREIBER.strasse}<br />
            {BETREIBER.ort}<br />
            {BETREIBER.land}
          </address>
        ) : (
          <Absatz><Fehlt was="Name und Anschrift des Betreibers sind" /></Absatz>
        )}
      </Kapitel>

      <Kapitel titel="Kontakt">
        {BETREIBER.email ? (
          <Absatz>
            <span className="inline-flex items-center gap-1.5">
              <Mail size={14} strokeWidth={2} aria-hidden />
              <a
                href={`mailto:${BETREIBER.email}`}
                className="text-gletscher-400 transition-colors duration-[160ms] hover:text-gletscher-300"
              >
                {BETREIBER.email}
              </a>
            </span>
            {BETREIBER.telefon && <><br />Telefon: {BETREIBER.telefon}</>}
          </Absatz>
        ) : (
          <Absatz><Fehlt was="Eine Kontaktadresse ist" /></Absatz>
        )}
      </Kapitel>

      {BETREIBER.ustId && (
        <Kapitel titel="Umsatzsteuer-Identifikationsnummer">
          <Absatz>{BETREIBER.ustId}</Absatz>
        </Kapitel>
      )}

      <Kapitel titel="Verantwortlich für den Inhalt">
        <Absatz>
          {impressumVollstaendig
            ? `${BETREIBER.name}, ${BETREIBER.strasse}, ${BETREIBER.ort}`
            : 'Siehe oben.'}
        </Absatz>
      </Kapitel>

      <Kapitel titel="Was CampBuddy ist — und was nicht">
        <Absatz>
          CampBuddy stellt Regeln zum Übernachten in der Natur dar und nennt zu jeder Angabe
          die Quelle und das Datum der letzten Prüfung. Das ist eine Orientierungshilfe und
          ausdrücklich <strong className="font-semibold text-ink-100">keine Rechtsberatung
          und keine Rechtsgarantie</strong>.
        </Absatz>
        <Absatz>
          Rechtslagen ändern sich durch Verordnungen, saisonale Verbote und Gemeindebeschlüsse,
          teils kurzfristig. Beschilderung vor Ort und die Auskunft der zuständigen Gemeinde
          gehen jeder Darstellung auf dieser Karte vor. Flächen ohne Eintrag werden nicht
          eingefärbt — fehlende Auskunft ist nicht dasselbe wie „erlaubt".
        </Absatz>
      </Kapitel>

      <Kapitel titel="Karten- und Datenquellen">
        <Absatz>
          Die Geometrien stammen aus <Aussen href="https://www.openstreetmap.org/copyright">
          OpenStreetMap</Aussen> und stehen unter der Open Database License (ODbL). Kartenbilder
          liefern <Aussen href="https://opentopomap.org/">OpenTopoMap</Aussen>,{' '}
          <Aussen href="https://openfreemap.org/">OpenFreeMap</Aussen> und{' '}
          <Aussen href="https://www.swisstopo.admin.ch/">swisstopo</Aussen>. Wetterdaten kommen
          von <Aussen href="https://open-meteo.com/">Open-Meteo</Aussen>. Die rechtlichen
          Einstufungen sind eigene Arbeit; ihre Belege stehen an jeder Fläche.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Streitbeilegung">
        <Absatz>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit:{' '}
          <Aussen href="https://ec.europa.eu/consumers/odr/">ec.europa.eu/consumers/odr</Aussen>.
          Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucher­schlichtungs­stelle
          sind wir nicht verpflichtet und nicht bereit.
        </Absatz>
      </Kapitel>
    </>
  )
}

/* ----------------------------------------------------------- Datenschutz */

function Datenschutz() {
  return (
    <>
      <Kapitel titel="Das Wichtigste zuerst">
        <Absatz>
          Die Karte lässt sich vollständig ohne Konto benutzen. Ohne Anmeldung entsteht kein
          Nutzerprofil, es wird nichts über Seiten hinweg wiedererkannt, und es läuft kein
          Werbenetzwerk mit. Gemessen wird nur, wie oft welche Seite aufgerufen wird — ohne
          Cookie und ohne Kennung (siehe „Reichweitenmessung"). Wer sich anmeldet, gibt genau
          das her, was zum Speichern eigener Touren nötig ist — und kann es jederzeit
          vollständig löschen.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Verantwortlich">
        {impressumVollstaendig ? (
          <address className="not-italic text-fliess leading-relaxed text-ink-300">
            {BETREIBER.name}<br />
            {BETREIBER.strasse}<br />
            {BETREIBER.ort}<br />
            {BETREIBER.land}<br />
            <a
              href={`mailto:${BETREIBER.email}`}
              className="text-gletscher-400 transition-colors duration-[160ms] hover:text-gletscher-300"
            >
              {BETREIBER.email}
            </a>
          </address>
        ) : (
          <Absatz><Fehlt was="Der Verantwortliche ist" /> — siehe Impressum.</Absatz>
        )}
      </Kapitel>

      <Kapitel titel="Beim blossen Aufruf der Seite">
        <Absatz>
          Die Seite wird von Cloudflare ausgeliefert (Cloudflare, Inc.). Dabei verarbeitet
          Cloudflare technisch notwendige Verbindungsdaten — insbesondere die IP-Adresse, den
          Zeitpunkt, die angeforderte Datei und die Browserkennung. Ohne diese Verarbeitung
          lässt sich eine Webseite nicht ausliefern. Rechtsgrundlage ist unser berechtigtes
          Interesse an einem sicheren und funktionierenden Betrieb
          (Art. 6 Abs. 1 lit. f DSGVO).
        </Absatz>
        <Absatz>
          Cloudflare verarbeitet dabei auch ausserhalb der EU. Für diese Übermittlung gelten die
          Standardvertragsklauseln der EU-Kommission. Einzelheiten:{' '}
          <Aussen href="https://www.cloudflare.com/privacypolicy/">Datenschutzerklärung von
          Cloudflare</Aussen>.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Reichweitenmessung">
        <Absatz>
          Um zu sehen, ob die Karte überhaupt benutzt wird, läuft Cloudflare Web Analytics mit.
          Dieses Werkzeug setzt <strong className="font-semibold text-ink-100">kein Cookie</strong>,
          liest nichts aus dem Browserspeicher und erzeugt keine gerätübergreifende Kennung. Es
          meldet den Seitenaufruf, die Herkunftsseite, das grobe Land und technische Eckdaten wie
          Bildschirmgrösse und Browser. Ein Wiedererkennen einzelner Personen ist damit nicht
          möglich, und es findet kein Zusammenführen mit Kontodaten statt.
        </Absatz>
        <Absatz>
          Rechtsgrundlage ist unser berechtigtes Interesse an einer groben Reichweitenmessung
          (Art. 6 Abs. 1 lit. f DSGVO). Weil kein Zugriff auf Informationen im Endgerät
          stattfindet, ist dafür keine Einwilligung erforderlich — deshalb gibt es hier auch
          kein Einwilligungsbanner. Einzelheiten:{' '}
          <Aussen href="https://www.cloudflare.com/web-analytics/">Cloudflare Web Analytics</Aussen>.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Was im Browser gespeichert wird">
        <Absatz>
          Es werden keine Cookies zu Werbe- oder Analysezwecken gesetzt. Gespeichert wird
          ausschliesslich Folgendes, und alles davon bleibt auf dem Gerät:
        </Absatz>
        <Aufzaehlung punkte={[
          <><strong className="font-medium text-ink-100">Ein technisches Cookie</strong>{' '}
            (<code className="font-mono text-klein">campbuddy_kennt_start</code>, ein Jahr).
            Es merkt sich, dass die Startseite schon gezeigt wurde, damit wiederkehrende
            Besucher gleich auf der Karte landen. Es enthält nur den Wert „1" und lässt keinen
            Rückschluss auf eine Person zu.</>,
          <><strong className="font-medium text-ink-100">Ein Routenentwurf</strong> im lokalen
            Speicher, damit eine begonnene Planung eine Anmeldung überlebt. Er wird beim
            Speichern oder Verwerfen der Route gelöscht.</>,
          <><strong className="font-medium text-ink-100">Die Anmeldesitzung</strong> im lokalen
            Speicher, sofern ein Konto benutzt wird. Beim Abmelden verschwindet sie.</>,
        ]} />
      </Kapitel>

      <Kapitel titel="Dienste, die die Karte beim Benutzen anspricht">
        <Absatz>
          Diese Dienste laufen direkt zwischen dem Browser und dem jeweiligen Anbieter; dabei
          wird technisch bedingt die IP-Adresse übertragen. Sie werden nur angesprochen, wenn
          die jeweilige Funktion benutzt wird — die Liste ist vollständig und entspricht
          genau dem, was die Sicherheitsrichtlinie der Seite überhaupt zulässt.
        </Absatz>
        <Aufzaehlung punkte={[
          <><strong className="font-medium text-ink-100">Kartenbilder:</strong> OpenTopoMap,
            OpenFreeMap, swisstopo (Bundesamt für Landestopografie).</>,
          <><strong className="font-medium text-ink-100">Wetter:</strong>{' '}
            <Aussen href="https://open-meteo.com/">Open-Meteo</Aussen> — nur beim Öffnen der
            Wetteransicht, mit den Koordinaten der Tour, ohne Kennung.</>,
          <><strong className="font-medium text-ink-100">Routenberechnung:</strong> Valhalla und
            OSRM (OpenStreetMap-Infrastruktur), openrouteservice, GraphHopper — nur beim
            Zeichnen einer Route, mit den gesetzten Wegpunkten.</>,
          <><strong className="font-medium text-ink-100">Konto und gespeicherte Inhalte:</strong>{' '}
            Supabase (siehe unten).</>,
          <><strong className="font-medium text-ink-100">Ko-fi:</strong> nur, wenn der
            Unterstützungs-Link angeklickt wird. Bis dahin wird nichts geladen und nichts
            gemeldet — es ist ein gewöhnlicher Link, kein eingebettetes Fenster.</>,
        ]} />
        <Absatz>
          Schriftarten werden von dieser Seite selbst ausgeliefert, nicht von einem fremden
          Anbieter. Es sind keine Werbenetzwerke, Zählpixel oder Einbettungen sozialer Netzwerke
          vorhanden.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Konto und eigene Inhalte">
        <Absatz>
          Ein Konto ist freiwillig und nur nötig, um eigene Touren, Kommentare und Markierungen
          zu speichern. Die Daten liegen bei Supabase (Supabase, Inc.) in der Region Frankfurt
          am Main, Deutschland. Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses
          (Art. 6 Abs. 1 lit. b DSGVO).
        </Absatz>
        <Aufzaehlung punkte={[
          <><strong className="font-medium text-ink-100">Bei der Registrierung:</strong>{' '}
            E-Mail-Adresse und Passwort — oder, bei der Anmeldung über Google, die von Google
            übermittelte Kennung und E-Mail-Adresse. In diesem Fall erfährt Google, dass hier
            angemeldet wurde; es gilt die{' '}
            <Aussen href="https://policies.google.com/privacy">Datenschutzerklärung von
            Google</Aussen>.</>,
          <><strong className="font-medium text-ink-100">Im Konto:</strong> ein selbst gewählter
            Anzeigename. Der echte Name wird nicht abgefragt.</>,
          <><strong className="font-medium text-ink-100">Gespeicherte Inhalte:</strong> Touren
            samt Verlauf, Etappen und Packliste, eigene Markierungen und dazu hochgeladene
            Fotos, Kommentare und Bewertungen.</>,
        ]} />
        <Absatz>
          Eigene Markierungen und Touren sind zunächst privat. Sie werden erst öffentlich, wenn
          das ausdrücklich gewählt wird. Bei einer veröffentlichten Tour sehen andere den
          Anzeigenamen, nicht die E-Mail-Adresse und nicht die Konto-Kennung.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Meldungen zur Datenpflege">
        <Absatz>
          Wer einen Fehler an einer Fläche meldet, kann das ohne Konto tun. Gespeichert werden
          dann nur die Meldung selbst und die betroffene Fläche — keine IP-Adresse, keine
          Kennung. Bei angemeldeten Meldungen wird die Konto-Kennung mitgespeichert, damit
          Rückfragen möglich sind.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Wie lange gespeichert wird">
        <Absatz>
          Kontodaten und eigene Inhalte bleiben, solange das Konto besteht. Das Konto lässt sich
          in den Kontoeinstellungen selbst und endgültig löschen; dabei werden die zugehörigen
          Touren, Markierungen, Fotos und Kommentare mitgelöscht. Verbindungsdaten der
          Auslieferung werden bei Cloudflare nach dessen Fristen gelöscht.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Rechte">
        <Absatz>
          Es bestehen die Rechte auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
          Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit
          (Art. 20) und Widerspruch gegen eine Verarbeitung auf Grundlage berechtigter
          Interessen (Art. 21). Dazu genügt eine Nachricht an die im Impressum genannte Adresse.
        </Absatz>
        <Absatz>
          Ausserdem besteht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde.
        </Absatz>
      </Kapitel>

      <Kapitel titel="Stand">
        <Absatz>
          Diese Erklärung beschreibt den Stand der Anwendung zum unten genannten Datum. Kommt
          ein Dienst hinzu, muss er zugleich in der Sicherheitsrichtlinie der Seite freigegeben
          werden — beides wird zusammen gepflegt, damit diese Aufzählung nicht veraltet.
        </Absatz>
      </Kapitel>
    </>
  )
}

/* ------------------------------------------------------------------ Rahmen */

/** Datum der letzten inhaltlichen Änderung dieser Texte. Bei Änderungen mitziehen. */
export const RECHTSSTAND = '30.08.2026'

export function Rechtsseiten({ seite, onZurueck }: { seite: Rechtsseite; onZurueck: () => void }) {
  useEffect(() => {
    document.title = `${TITEL[seite]} — CampBuddy`
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [seite])

  return (
    <div className="min-h-dvh bg-flaeche-1">
      <header className="border-b border-kante bg-flaeche-2">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="#/karte" className="flex items-center gap-2.5">
            <Marke className="h-7 w-7" />
            <span className="text-ueberschrift font-semibold tracking-tight text-ink-50">CampBuddy</span>
          </a>
          <button
            onClick={onZurueck}
            className="flex items-center gap-1.5 text-klein text-ink-400 transition-colors
                       duration-[160ms] hover:text-gletscher-300"
          >
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            Zur Karte
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <h1 className="text-titel font-semibold tracking-tight text-ink-50">{TITEL[seite]}</h1>
        <p className="mt-2 text-klein text-ink-500">Stand: {RECHTSSTAND}</p>

        <div className="mt-10 space-y-8">
          {seite === 'impressum' ? <Impressum /> : <Datenschutz />}
        </div>

        <nav className="mt-12 flex gap-5 border-t border-kante pt-6 text-klein text-ink-400">
          <a
            href={seite === 'impressum' ? '#/datenschutz' : '#/impressum'}
            className="transition-colors duration-[160ms] hover:text-gletscher-300"
          >
            {seite === 'impressum' ? 'Datenschutzerklärung' : 'Impressum'}
          </a>
          <a href="#/karte" className="transition-colors duration-[160ms] hover:text-gletscher-300">
            Karte öffnen
          </a>
        </nav>
      </main>
    </div>
  )
}
