/**
 * Die Startseite — was ein neuer Besucher zuerst sieht.
 *
 * Zwei Regeln haben diese Seite geformt:
 *
 * 1. Sie verkauft die *Rechtsfrage*, nicht die Funktionsliste. Tourenplaner
 *    gibt es genug; die Lücke ist „darf ich hier überhaupt schlafen?".
 * 2. Jede Zahl auf dieser Seite kommt aus den echten Daten des Projekts
 *    (`legalData`), nicht aus einer Marketingtabelle — inklusive der
 *    unangenehmen: dass bislang keine einzige Fläche amtlich geprüft ist.
 *    Erfundene Nutzerstimmen gibt es aus demselben Grund nicht; an ihrer
 *    Stelle stehen Anwendungsfälle.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight, Ban, CloudSun, Compass, Flame, FileWarning, Code2, Map, MapPinned,
  Menu, MountainSnow, Route, ScrollText, ShieldCheck, Tent, TriangleAlert, Truck, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DEFAULT_REGION, REGIONS } from '../data/regions'
import { Badge, Button, Card, IconButton } from '../ui'
import { PermissionRow, ReviewBadge, StatusBadge } from '../components/ui'
import { Einblenden } from './Einblenden'
import { KartenSchema, Zeltmarke } from './Grafiken'
import {
  beispielZone, gipfelGesamt, punkteGesamt, punkteJeArt, zonenBelegt,
  zonenGesamt, zonenUngeklaert, zonenVorOrt,
} from './zahlen'

import heroBild from '../assets/landing/hero-biwak.webp'
import heroBildKlein from '../assets/landing/hero-biwak-960.webp'
import zoneBild from '../assets/landing/zone-schutzgebiet.webp'
import zoneBildKlein from '../assets/landing/zone-schutzgebiet-700.webp'
import routeBild from '../assets/landing/route-grat.webp'
import routeBildKlein from '../assets/landing/route-grat-700.webp'
import huetteBild from '../assets/landing/huette-abend.webp'
import huetteBildKlein from '../assets/landing/huette-abend-700.webp'
import wetterBild from '../assets/landing/wetter-front.webp'
import wetterBildKlein from '../assets/landing/wetter-front-700.webp'
import nachtBild from '../assets/landing/nacht-biwak.webp'
import nachtBildKlein from '../assets/landing/nacht-biwak-960.webp'

/* ------------------------------------------------------------------ Zahlen */

const region = REGIONS[DEFAULT_REGION]

/* ---------------------------------------------------------------- Bausteine */

const BREITE = 'mx-auto w-full max-w-6xl px-5 sm:px-8'

/** Auszeichnung über einer Abschnittsüberschrift. */
function Kapitel({ children }: { children: string }) {
  return (
    <p className="mb-3 text-mikro font-semibold uppercase text-gletscher-400">{children}</p>
  )
}

function Sektionstitel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-sektion font-semibold text-ink-50 ${className}`}>{children}</h2>
  )
}

/**
 * Ein Foto der Startseite. Zwei Auflösungen, feste Seitenverhältnisse und
 * `lazy` überall ausser im Hero — auf einer bildlastigen Seite ist das der
 * Unterschied zwischen „lädt sofort" und „lädt irgendwann".
 */
function Foto({
  src, klein, alt, breite, hoehe, sizes, className = '', eager = false,
}: {
  src: string; klein: string; alt: string
  breite: number; hoehe: number; sizes: string; className?: string; eager?: boolean
}) {
  return (
    <img
      src={src}
      srcSet={`${klein} ${Math.round(breite / 2)}w, ${src} ${breite}w`}
      sizes={sizes}
      width={breite}
      height={hoehe}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      className={className}
    />
  )
}

/* -------------------------------------------------------------------- Seite */

export function LandingPage({ onStart }: { onStart: () => void }) {
  const zuAnker = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="min-h-dvh bg-flaeche-1 text-ink-100">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                   focus:rounded-mittel focus:bg-gletscher-300 focus:px-4 focus:py-2
                   focus:text-fliess focus:font-semibold focus:text-ink-950"
      >
        Zum Inhalt springen
      </a>

      <Kopfzeile onStart={onStart} />

      <main id="inhalt">
        <Hero onStart={onStart} zuAnker={zuAnker} />
        <Haftungsstreifen />
        <Kennzahlen />
        <Luecke />
        <Funktionen />
        <Ablauf />
        <Anwendungsfaelle />
        <Pruefstand />
        <Schluss onStart={onStart} />
      </main>

      <Fusszeile onStart={onStart} />
    </div>
  )
}

/* ---------------------------------------------------------------- Kopfzeile */

const ABSCHNITTE: [string, string][] = [
  ['funktionen', 'Funktionen'],
  ['ablauf', 'Ablauf'],
  ['pruefstand', 'Prüfstand'],
]

function Kopfzeile({ onStart }: { onStart: () => void }) {
  const [menuOffen, setMenuOffen] = useState(false)

  // Escape schliesst, und ein Sprung zu einem Abschnitt auch — ein Menü, das
  // über dem Ziel liegen bleibt, ist schlimmer als keins.
  useEffect(() => {
    if (!menuOffen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOffen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOffen])

  return (
    <header className="sticky top-0 z-40 border-b border-kante/70 bg-flaeche-1/80 backdrop-blur-lg">
      <div className={`${BREITE} flex h-16 items-center gap-4`}>
        <a href="#inhalt" className="flex shrink-0 items-center gap-2.5" aria-label="CampBuddy, Seitenanfang">
          <Zeltmarke className="h-7 w-7" />
          <span className="text-ueberschrift font-semibold tracking-tight text-ink-50">CampBuddy</span>
        </a>

        <nav aria-label="Abschnitte" className="ml-auto hidden items-center gap-7 md:flex">
          {ABSCHNITTE.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-klein font-medium text-ink-300 transition-colors duration-[160ms] hover:text-ink-50"
            >
              {label}
            </a>
          ))}
        </nav>

        <Button variante="primaer" icon={Map} onClick={onStart} className="ml-auto md:ml-0">
          Karte öffnen
        </Button>

        {/*
          Auf dem Telefon war die Abschnittsnavigation schlicht ausgeblendet —
          drei Kapitel der Seite waren dort nur durch Scrollen erreichbar.
        */}
        <IconButton
          icon={menuOffen ? X : Menu}
          label={menuOffen ? 'Menü schliessen' : 'Menü öffnen'}
          onClick={() => setMenuOffen((v) => !v)}
          aria-expanded={menuOffen}
          className="-mr-1.5 md:hidden"
        />
      </div>

      {menuOffen && (
        <nav
          aria-label="Abschnitte"
          className="border-t border-kante bg-flaeche-1/95 backdrop-blur-lg md:hidden"
        >
          <ul className={`${BREITE} flex flex-col py-2`}>
            {ABSCHNITTE.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={() => setMenuOffen(false)}
                  className="block py-3 text-fliess font-medium text-ink-200
                             transition-colors duration-[160ms] hover:text-ink-50"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}

/* --------------------------------------------------------------------- Hero */

function Hero({ onStart, zuAnker }: { onStart: () => void; zuAnker: (id: string) => void }) {
  return (
    <section className="relative isolate overflow-hidden">
      <Foto
        src={heroBild}
        klein={heroBildKlein}
        breite={1920}
        hoehe={1080}
        sizes="100vw"
        eager
        alt="Ein beleuchtetes Zelt steht in der Dämmerung auf einer Wiese oberhalb der Waldgrenze, dahinter eine vergletscherte Bergkette."
        className="absolute inset-0 -z-10 h-full w-full object-cover object-center"
      />
      {/* Zwei Verläufe statt einer flächigen Abdunklung: links trägt die Fläche
          die Schrift, rechts bleibt das Bild ein Bild. Der zweite Verlauf ist
          nur die Naht zum nächsten Abschnitt. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-flaeche-1 from-0% via-flaeche-1/80 via-38% to-flaeche-1/15"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-flaeche-1 from-0% to-transparent to-26%"
      />

      <div className={`${BREITE} flex min-h-[min(46rem,88vh)] flex-col justify-center py-24 sm:py-28`}>
        <Einblenden als="div" className="max-w-2xl">
          <Badge ton="akzent" icon={MountainSnow}>
            {region.name} — die erste Region
          </Badge>

          <h1 className="mt-6 text-held font-semibold text-ink-50">
            Draussen schlafen,
            <br />
            ohne zu raten.
          </h1>

          <p className="mt-6 max-w-xl text-vorspann text-ink-200">
            CampBuddy zeigt dir flächenscharf auf der Karte, wo Übernachten in der Natur
            <strong className="font-semibold text-erlaubt-400"> erlaubt</strong>,
            <strong className="font-semibold text-geduldet-400"> geduldet</strong> oder
            <strong className="font-semibold text-verboten-400"> verboten</strong> ist —
            mit Quelle und Prüfstand an jeder einzelnen Fläche.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button variante="primaer" groesse="gross" icon={Map} onClick={onStart}>
              Karte öffnen
            </Button>
            <Button variante="sekundaer" groesse="gross" icon={Compass} onClick={() => zuAnker('ablauf')}>
              So funktioniert&rsquo;s
            </Button>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-klein text-ink-400">
            {['Kostenlos', 'Ohne Konto nutzbar', 'Offene Daten, keine Kartenlizenz'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gletscher-400" />
                {t}
              </li>
            ))}
          </ul>
        </Einblenden>
      </div>
    </section>
  )
}

/* -------------------------------------------------------- Haftungsstreifen */

/** Wortgleich zum Streifen in der App — der Hinweis darf nicht erst drinnen auftauchen. */
function Haftungsstreifen() {
  return (
    <div className="border-y border-geduldet-500/15 bg-geduldet-500/[0.06]">
      <div className={`${BREITE} flex items-start gap-2.5 py-3 sm:items-center`}>
        <TriangleAlert size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-geduldet-400 sm:mt-0" aria-hidden />
        <p className="text-klein leading-relaxed text-geduldet-400">
          <span className="font-semibold">Orientierungshilfe, keine Rechtsgarantie.</span>{' '}
          <span className="text-geduldet-400/75">
            Beschilderung vor Ort und Auskünfte von Gemeinde oder Wildhut gehen dieser Karte immer vor.
          </span>
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Kennzahlen */

const QUELLEN = [
  'OpenStreetMap', 'swisstopo', 'OpenTopoMap', 'Open-Meteo', 'Fedlex', 'BAFU Wildruhezonen',
]

function Kennzahlen() {
  const zahlen: { wert: string; label: string; hinweis: string; ton?: 'warnung' }[] = [
    {
      wert: String(zonenGesamt),
      label: 'Schutzgebietsflächen',
      hinweis: 'Geometrie aus OpenStreetMap, Einstufung selbst gepflegt',
    },
    {
      wert: String(punkteGesamt),
      label: 'Schlafmöglichkeiten',
      hinweis: `${punkteJeArt('hut')} Hütten · ${punkteJeArt('campsite')} Campingplätze · ${punkteJeArt('vehicle_spot')} Stellplätze`,
    },
    {
      wert: String(region.legal_framework.references.length),
      label: 'Rechtsgrundlagen',
      hinweis: 'Bundesrecht, Kanton und Wildruhezonen, direkt verlinkt',
    },
    {
      wert: zonenBelegt.toLocaleString('de-CH'),
      label: 'mit amtlicher Quelle',
      hinweis: `BAFU-Inventare. ${zonenVorOrt} davon selbst vor Ort nachgesehen`,
      ton: zonenBelegt > 0 ? undefined : 'warnung',
    },
  ]

  return (
    <section className={`${BREITE} py-16 sm:py-20`}>
      <Einblenden als="div">
        <dl className="grid gap-px overflow-hidden rounded-riesig border border-kante bg-kante sm:grid-cols-2 lg:grid-cols-4">
          {zahlen.map((z) => (
            <div key={z.label} className="bg-flaeche-2 px-6 py-7">
              <dt className="text-mikro font-medium uppercase text-ink-500">{z.label}</dt>
              <dd>
                <p
                  className={`mt-1.5 text-display font-semibold ${
                    z.ton === 'warnung' ? 'text-geduldet-400' : 'text-ink-50'
                  }`}
                >
                  {z.wert}
                </p>
                <p className="mt-2 text-klein leading-relaxed text-ink-400">{z.hinweis}</p>
              </dd>
            </div>
          ))}
        </dl>
      </Einblenden>

      <Einblenden als="div" verzoegerung={80} className="mt-10">
        <p className="text-center text-mikro font-medium uppercase text-ink-500">
          Gebaut auf offenen Daten und amtlichen Quellen
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {QUELLEN.map((q) => (
            <li key={q} className="text-ueberschrift font-semibold tracking-tight text-ink-500">
              {q}
            </li>
          ))}
        </ul>
      </Einblenden>
    </section>
  )
}

/* ------------------------------------------------------------------- Lücke */

const LUECKE: { icon: LucideIcon; titel: string; text: string }[] = [
  {
    icon: Route,
    titel: 'Tourenplaner planen den Weg',
    text: 'Komoot, AllTrails und Co. bringen dich hin und zurück. Ob du unterwegs die Nacht verbringen darfst, steht dort nirgends.',
  },
  {
    icon: MapPinned,
    titel: 'Spot-Sammlungen zeigen Erfahrungen',
    text: 'Park4Night und iOverlander sagen dir, wo schon jemand geschlafen hat. Nicht, ob er es durfte — und nicht, was seither beschlossen wurde.',
  },
  {
    icon: ScrollText,
    titel: 'Amtliche Karten kennen die Regel',
    text: 'Geoportale und Verordnungen haben die Antwort. Nur eben verteilt auf Bund, Kanton und Gemeinde — nicht auf deiner Route.',
  },
]

function Luecke() {
  return (
    <section className="border-y border-kante bg-flaeche-2/40">
      <div className={`${BREITE} py-16 sm:py-20`}>
        <Einblenden als="div" className="max-w-2xl">
          <Kapitel>Die Lücke</Kapitel>
          <Sektionstitel>Die Frage, die dir keine App beantwortet</Sektionstitel>
          <p className="mt-4 text-vorspann text-ink-300">
            Wer draussen übernachtet, sucht sich die Antwort heute aus Forenbeiträgen,
            Verordnungstexten und Bauchgefühl zusammen. CampBuddy legt sie auf die Karte.
          </p>
        </Einblenden>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {LUECKE.map((l, i) => (
            <Einblenden key={l.titel} verzoegerung={i * 90}>
              <Card className="h-full p-6">
                <l.icon size={22} strokeWidth={1.75} className="text-gletscher-400" aria-hidden />
                <h3 className="mt-4 text-ueberschrift font-semibold text-ink-50">{l.titel}</h3>
                <p className="mt-2 text-fliess leading-relaxed text-ink-400">{l.text}</p>
              </Card>
            </Einblenden>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- Funktionen */

/** Ein Funktionsabschnitt: Text und Bild tauschen zeilenweise die Seite. */
function Funktion({
  kapitel, titel, text, punkte: liste, gedreht, visual,
}: {
  kapitel: string
  titel: string
  text: string
  punkte: string[]
  gedreht?: boolean
  visual: ReactNode
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Einblenden als="div" className={gedreht ? 'lg:order-2' : ''}>
        <Kapitel>{kapitel}</Kapitel>
        <Sektionstitel>{titel}</Sektionstitel>
        <p className="mt-4 text-vorspann text-ink-300">{text}</p>
        <ul className="mt-6 space-y-3">
          {liste.map((p) => (
            <li key={p} className="flex gap-3 text-fliess leading-relaxed text-ink-300">
              <ArrowRight size={16} strokeWidth={2.25} className="mt-1 shrink-0 text-gletscher-400" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </Einblenden>

      <Einblenden als="div" verzoegerung={90} className={gedreht ? 'lg:order-1' : ''}>
        {visual}
      </Einblenden>
    </div>
  )
}

/** Zeigt eine echte Fläche aus den Projektdaten — inklusive ihres Prüfstands. */
function Infokarte() {
  if (!beispielZone) return null
  return (
    <Card className="w-full max-w-[19.5rem] p-4 shadow-[var(--shadow-4)] backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-ueberschrift font-semibold leading-snug text-ink-50">{beispielZone.name}</h3>
        <StatusBadge status={beispielZone.status} />
      </div>
      <div className="mt-3">
        <PermissionRow label="Zelt / Biwak" value={beispielZone.tent_allowed} icon={Tent} />
        <PermissionRow label="Fahrzeug" value={beispielZone.vehicle_allowed} icon={Truck} />
        <PermissionRow label="Feuer" value={beispielZone.fire_allowed} icon={Flame} />
      </div>
      {beispielZone.conditions && (
        <p className="mt-3 text-klein leading-relaxed text-ink-400">{beispielZone.conditions}</p>
      )}
      <div className="mt-3.5">
        <ReviewBadge status={beispielZone.review_status} lastVerified={beispielZone.last_verified} />
      </div>
    </Card>
  )
}

function Funktionen() {
  return (
    <section id="funktionen" className={`${BREITE} space-y-20 py-20 sm:space-y-28 sm:py-28`}>
      <Funktion
        kapitel="Legalitäts-Ebene"
        titel="Jede Fläche sagt dir, was gilt"
        text="Antippen genügt. Zelt, Fahrzeug und Feuer stehen einzeln da — erlaubt, bedingt, verboten oder ehrlich als ungeklärt markiert."
        punkte={[
          'Bedingungen im Klartext statt im Verordnungsdeutsch: „nur oberhalb der Waldgrenze", „ausserhalb der Kernzonen".',
          'Die Rechtsgrundlage steht als Link daneben — du kannst jede Aussage nachlesen.',
          'Ausserhalb eingezeichneter Flächen gilt der Rahmen der Region, nicht stillschweigend „erlaubt".',
        ]}
        visual={
          <div className="relative">
            <Foto
              src={zoneBild}
              klein={zoneBildKlein}
              breite={1200}
              hoehe={900}
              sizes="(min-width: 1024px) 560px, 100vw"
              alt="Nebel zieht bei Morgengrauen über ein Hochmoor am Rand eines lichten Lärchenwaldes, davor steht ein verwitterter Grenzpfosten."
              className="w-full rounded-riesig border border-kante object-cover shadow-[var(--shadow-3)]"
            />
            <div className="mt-[-3.5rem] px-4 sm:mt-0 sm:absolute sm:-bottom-9 sm:-left-8 sm:px-0">
              <Infokarte />
            </div>
          </div>
        }
      />

      <Funktion
        gedreht
        kapitel="Route & Auswertung"
        titel="Deine Route, rechtlich ausgewertet"
        text="Zeichne die Strecke auf der Karte oder importiere die GPX-Datei aus deinem Tourenplaner. Die Legalitäts-Ebene legt sich darüber."
        punkte={[
          'Welche Zonen die Route quert und wie viel der Strecke in Verbotsgebieten liegt.',
          'Welche Hütten, Campingplätze und Stellplätze in Routennähe zum Übernachten taugen.',
          'Höhenprofil, Etappenvorschlag und GPX-Export für das Gerät, das ohnehin mitkommt.',
        ]}
        visual={
          <div className="relative">
            <Foto
              src={routeBild}
              klein={routeBildKlein}
              breite={1200}
              hoehe={900}
              sizes="(min-width: 1024px) 560px, 100vw"
              alt="Ein schmaler Wanderweg quert einen steilen Alpengrat, tief darunter füllt ein Wolkenmeer das Tal."
              className="w-full rounded-riesig border border-kante object-cover shadow-[var(--shadow-3)]"
            />
            <div className="mt-4 sm:absolute sm:-bottom-10 sm:-right-4 sm:mt-0 sm:w-[62%]">
              <div className="overflow-hidden rounded-gross border border-kante bg-flaeche-2 p-2 shadow-[var(--shadow-4)]">
                <KartenSchema className="h-auto w-full" />
              </div>
            </div>
          </div>
        }
      />

      <Funktion
        kapitel="Punkte"
        titel={`Hütte, Zeltplatz, Stellplatz — ${punkteGesamt} Punkte`}
        text={`${punkteJeArt('hut')} Hütten, ${punkteJeArt('campsite')} Campingplätze und ${punkteJeArt('vehicle_spot')} Stellplätze fürs Fahrzeug, aus OpenStreetMap importiert und filterbar nach dem, wie du unterwegs bist.`}
        punkte={[
          'Filter nach Übernachtungsart: nur Zelt, nur Fahrzeug, nur wo Feuer erlaubt ist.',
          'Etappenplanung setzt jeden Tag an einem Punkt mit Dach oder legalem Platz ab.',
          `${gipfelGesamt?.toLocaleString('de-CH') ?? 'Tausende'} benannte Gipfel als Orientierung auf der Outdoor-Karte mit Höhenlinien.`,
        ]}
        visual={
          <Foto
            src={huetteBild}
            klein={huetteBildKlein}
            breite={1200}
            hoehe={900}
            sizes="(min-width: 1024px) 560px, 100vw"
            alt="Eine kleine Steinhütte auf einem Felssattel in der Dämmerung, in zwei Fenstern brennt warmes Licht, dahinter schneebedeckte Gipfel."
            className="w-full rounded-riesig border border-kante object-cover shadow-[var(--shadow-3)]"
          />
        }
      />

      <Funktion
        gedreht
        kapitel="Vorbereitung"
        titel="Wetter und Packliste aus deinen Eckdaten"
        text="Startdatum, Dauer, Personenzahl, Schlafhöhe und Übernachtungsart genügen — daraus entstehen Packliste und Verpflegungsmenge."
        punkte={[
          'Die Vorhersage für deinen Reisezeitraum bestimmt Schlafsack und Kleidung mit.',
          'Verpflegung grob gerechnet: Kalorien pro Tag mal Tage mal Personen.',
          'Kaufempfehlungen sind strukturell vorbereitet, aber bewusst noch nicht angebunden — du siehst Platzhalter, keine getarnte Werbung.',
        ]}
        visual={
          <Foto
            src={wetterBild}
            klein={wetterBildKlein}
            breite={1200}
            hoehe={900}
            sizes="(min-width: 1024px) 560px, 100vw"
            alt="Eine Wetterfront zieht über einen Gletscher, Lichtstrahlen brechen durch dichte Wolken auf das Eis."
            className="w-full rounded-riesig border border-kante object-cover shadow-[var(--shadow-3)]"
          />
        }
      />
    </section>
  )
}

/* ------------------------------------------------------------------ Ablauf */

const SCHRITTE: { icon: LucideIcon; titel: string; text: string }[] = [
  {
    icon: MountainSnow,
    titel: 'Region öffnen',
    text: 'Die Karte startet in der Schweiz — ohne Konto, ohne Einwilligungsdialog, ohne Umweg.',
  },
  {
    icon: ShieldCheck,
    titel: 'Fläche antippen',
    text: 'Rechtslage, Bedingungen, Quelle und Prüfstand stehen in der Infokarte. Ungeprüftes ist als solches markiert.',
  },
  {
    icon: Route,
    titel: 'Route zeichnen oder laden',
    text: 'Wegpunkte auf der Karte setzen — oder die GPX-Datei aus deinem Tourenplaner importieren.',
  },
  {
    icon: CloudSun,
    titel: 'Auswerten und mitnehmen',
    text: 'Zonen entlang der Route, Höhenprofil, Etappen, Wetter und Packliste. Als GPX heraus, optional im Konto gespeichert.',
  },
]

function Ablauf() {
  return (
    <section id="ablauf" className="border-y border-kante bg-flaeche-2/40">
      <div className={`${BREITE} py-20 sm:py-24`}>
        <Einblenden als="div" className="max-w-2xl">
          <Kapitel>Ablauf</Kapitel>
          <Sektionstitel>In vier Schritten zur geplanten Nacht</Sektionstitel>
        </Einblenden>

        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {SCHRITTE.map((s, i) => (
            <Einblenden als="li" key={s.titel} verzoegerung={i * 80} className="relative">
              {/* Verbindungslinie nur dort, wo tatsächlich ein nächster Schritt folgt. */}
              {i < SCHRITTE.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-11 top-5 hidden h-px w-[calc(100%-1.5rem)] bg-gradient-to-r from-kante-stark to-transparent lg:block"
                />
              )}
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-kante-stark bg-flaeche-1">
                <s.icon size={18} strokeWidth={1.9} className="text-gletscher-300" aria-hidden />
              </div>
              <p className="mt-5 text-mikro font-semibold uppercase text-ink-500">Schritt {i + 1}</p>
              <h3 className="mt-1 text-ueberschrift font-semibold text-ink-50">{s.titel}</h3>
              <p className="mt-2 text-fliess leading-relaxed text-ink-400">{s.text}</p>
            </Einblenden>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- Anwendungsfälle */

const FAELLE: { icon: LucideIcon; titel: string; text: string; marke: string }[] = [
  {
    icon: Tent,
    titel: 'Das spontane Wochenend-Biwak',
    marke: 'Zelt',
    text: 'Freitagabend, eine Nacht oberhalb der Waldgrenze. Du prüfst, ob dein Wunschplatz in einem Reservat oder einer Wildruhezone liegt — und findest die nächste geduldete Fläche, falls doch.',
  },
  {
    icon: Route,
    titel: 'Die Mehrtagestour aus dem Tourenplaner',
    marke: 'GPX',
    text: 'Die Route steht schon. Du lädst die GPX-Datei hoch und siehst, welche Etappe durch Verbotsgebiet führt und an welchen Hütten sich die Nächte sinnvoll teilen lassen.',
  },
  {
    icon: Truck,
    titel: 'Die Nacht im Fahrzeug',
    marke: 'Camper',
    text: 'Für Fahrzeuge gelten strengere Regeln als fürs Zelt — die Karte trennt das. Du filterst auf legale Stellplätze statt auf Wiesen, auf denen dich morgens jemand weckt.',
  },
]

function Anwendungsfaelle() {
  return (
    <section className={`${BREITE} py-20 sm:py-24`}>
      <Einblenden als="div" className="max-w-2xl">
        <Kapitel>Anwendungsfälle</Kapitel>
        <Sektionstitel>Drei Wege, wie die Karte benutzt wird</Sektionstitel>
        <p className="mt-4 text-vorspann text-ink-300">
          Hier stehen bewusst keine Nutzerstimmen: die Karte ist neu, und erfundene Zitate wären
          das genaue Gegenteil dessen, wofür dieses Projekt existiert.
        </p>
      </Einblenden>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {FAELLE.map((f, i) => (
          <Einblenden key={f.titel} verzoegerung={i * 90}>
            <Card className="flex h-full flex-col p-6">
              <div className="flex items-center gap-3">
                <f.icon size={20} strokeWidth={1.9} className="text-gletscher-400" aria-hidden />
                <Badge>{f.marke}</Badge>
              </div>
              <h3 className="mt-4 text-ueberschrift font-semibold text-ink-50">{f.titel}</h3>
              <p className="mt-2 text-fliess leading-relaxed text-ink-400">{f.text}</p>
            </Card>
          </Einblenden>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- Prüfstand */

function Pruefstand() {
  return (
    <section id="pruefstand" className="border-y border-kante bg-flaeche-2/40">
      <div className={`${BREITE} grid gap-12 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16`}>
        <Einblenden als="div">
          <Kapitel>Prüfstand</Kapitel>
          <Sektionstitel>Was hier steht, steht mit Prüfstand da</Sektionstitel>
          <p className="mt-4 text-vorspann text-ink-300">
            Der Wert dieser Karte liegt nicht im Code, sondern in der Rechtsrecherche. Also wird
            offengelegt, wie weit sie ist — an jeder Fläche, nicht im Kleingedruckten.
          </p>

          <div className="mt-7 space-y-3">
            {[
              { status: 'entwurf' as const, datum: null, text: 'Aus dem allgemeinen Rechtsrahmen abgeleitet, nicht amtlich bestätigt. Gestrichelter Rand auf der Karte.' },
              { status: 'quelle' as const, datum: '2026-08-19', text: 'Mit einer benannten Quelle belegt, Prüfdatum sichtbar.' },
              { status: 'vor-ort' as const, datum: '2026-08-19', text: 'Selbst vor Ort verifiziert — Beschilderung und Lage geprüft.' },
            ].map((s) => (
              <div key={s.status} className="flex flex-col gap-2 rounded-mittel border border-kante bg-flaeche-1 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4">
                <div className="shrink-0">
                  <ReviewBadge status={s.status} lastVerified={s.datum} />
                </div>
                <p className="text-klein leading-relaxed text-ink-400">{s.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-2.5 rounded-mittel border border-geduldet-500/20 bg-geduldet-500/[0.07] px-4 py-3.5">
            <FileWarning size={16} strokeWidth={2} className="mt-px shrink-0 text-geduldet-400" aria-hidden />
            <p className="text-klein leading-relaxed text-geduldet-400/90">
              Ehrlicher Stand heute: von {zonenGesamt.toLocaleString('de-CH')} erfassten Flächen sind{' '}
              <strong className="font-semibold">{zonenBelegt.toLocaleString('de-CH')} mit einer
              amtlichen Quelle belegt</strong> — den Bundesinventaren für Jagdbanngebiete und
              Wildruhezonen. Der Rest ist aus OpenStreetMap-Merkmalen abgeleitet, und{' '}
              {zonenUngeklaert} sind ausdrücklich ungeklärt.{' '}
              <strong className="font-semibold">Selbst vor Ort nachgesehen: {zonenVorOrt}.</strong>{' '}
              Die Karte weist das an jeder Fläche aus, statt es zu verstecken.
            </p>
          </div>
        </Einblenden>

        <Einblenden als="div" verzoegerung={90}>
          <Card className="p-6 sm:p-7">
            <h3 className="text-ueberschrift font-semibold text-ink-50">Rechtsrahmen {region.name}</h3>
            <p className="mt-3 text-fliess leading-relaxed text-ink-300">
              {region.legal_framework.summary}
            </p>

            <h4 className="mt-6 text-mikro font-medium uppercase text-ink-500">Rechtsgrundlagen</h4>
            <ul className="mt-3 space-y-2.5">
              {region.legal_framework.references.map((r) => (
                <li key={r.url}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-start gap-2 text-klein leading-snug text-ink-400
                               transition-colors duration-[160ms] hover:text-gletscher-300"
                  >
                    <ArrowRight size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-gletscher-500" aria-hidden />
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </Einblenden>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- Abschluss-CTA */

function Schluss({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative isolate overflow-hidden">
      <Foto
        src={nachtBild}
        klein={nachtBildKlein}
        breite={1920}
        hoehe={1080}
        sizes="100vw"
        alt="Die Milchstrasse steht über einem Bergkamm, auf einem Felsplateau leuchtet ein einzelnes kleines Zelt."
        className="absolute inset-0 -z-10 h-full w-full object-cover object-center"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-flaeche-1/72" />

      <div className={`${BREITE} py-24 text-center sm:py-32`}>
        <Einblenden als="div" className="mx-auto max-w-2xl">
          <Sektionstitel>Die nächste Nacht ist geplant.<br />Die Rechtslage auch.</Sektionstitel>
          <p className="mt-5 text-vorspann text-ink-200">
            Karte öffnen, Fläche antippen, Route ziehen. Kein Konto nötig — das brauchst du erst,
            wenn du Touren speichern willst.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button variante="primaer" groesse="gross" icon={Map} onClick={onStart}>
              Karte öffnen
            </Button>
            <Button
              variante="sekundaer"
              groesse="gross"
              icon={Code2}
              onClick={() => window.open('https://github.com/jannis-drng/campbuddy', '_blank', 'noopener')}
            >
              Projekt auf GitHub
            </Button>
          </div>
        </Einblenden>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- Fusszeile */

function Fusszeile({ onStart }: { onStart: () => void }) {
  return (
    <footer className="border-t border-kante bg-flaeche-1">
      <div className={`${BREITE} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <div className="flex items-center gap-2.5">
            <Zeltmarke className="h-6 w-6" />
            <span className="text-ueberschrift font-semibold tracking-tight text-ink-50">CampBuddy</span>
          </div>
          <p className="mt-3 max-w-xs text-klein leading-relaxed text-ink-400">
            Die Legalitätskarte fürs Übernachten in der Natur — plus die Tourplanung drumherum.
          </p>
        </div>

        <nav aria-label="Produkt">
          <h2 className="text-mikro font-medium uppercase text-ink-500">Produkt</h2>
          <ul className="mt-3 space-y-2 text-klein text-ink-400">
            <li>
              <button onClick={onStart} className="transition-colors duration-[160ms] hover:text-gletscher-300">
                Karte öffnen
              </button>
            </li>
            <li><a href="#funktionen" className="transition-colors duration-[160ms] hover:text-gletscher-300">Funktionen</a></li>
            <li><a href="#ablauf" className="transition-colors duration-[160ms] hover:text-gletscher-300">Ablauf</a></li>
            <li><a href="#pruefstand" className="transition-colors duration-[160ms] hover:text-gletscher-300">Prüfstand</a></li>
          </ul>
        </nav>

        <nav aria-label="Daten und Quellen">
          <h2 className="text-mikro font-medium uppercase text-ink-500">Daten &amp; Quellen</h2>
          <ul className="mt-3 space-y-2 text-klein text-ink-400">
            <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener" className="transition-colors duration-[160ms] hover:text-gletscher-300">OpenStreetMap-Mitwirkende</a></li>
            <li><a href="https://opentopomap.org/" target="_blank" rel="noreferrer noopener" className="transition-colors duration-[160ms] hover:text-gletscher-300">OpenTopoMap</a></li>
            <li><a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noreferrer noopener" className="transition-colors duration-[160ms] hover:text-gletscher-300">swisstopo</a></li>
            <li><a href="https://open-meteo.com/" target="_blank" rel="noreferrer noopener" className="transition-colors duration-[160ms] hover:text-gletscher-300">Open-Meteo</a></li>
            <li><a href="https://www.wildruhezonen.ch/" target="_blank" rel="noreferrer noopener" className="transition-colors duration-[160ms] hover:text-gletscher-300">Wildruhezonen (BAFU)</a></li>
          </ul>
        </nav>

        <div>
          <h2 className="text-mikro font-medium uppercase text-ink-500">Rechtliches</h2>
          <p className="mt-3 text-klein leading-relaxed text-ink-400">
            CampBuddy stellt Rechtsinformationen dar und ersetzt keine Rechtsberatung. Einstufungen
            können sich durch Verordnungen, saisonale Verbote und Gemeindebeschlüsse jederzeit ändern.
          </p>
          <a
            href="https://github.com/jannis-drng/campbuddy"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-2 text-klein font-medium text-gletscher-400
                       transition-colors duration-[160ms] hover:text-gletscher-300"
          >
            <Code2 size={15} strokeWidth={2} aria-hidden />
            Quellcode ansehen
          </a>
        </div>
      </div>

      <div className="border-t border-kante">
        <div className={`${BREITE} flex flex-wrap items-center justify-between gap-3 py-5 text-mikro normal-case tracking-normal text-ink-500`}>
          <p>
            © {new Date().getFullYear()} CampBuddy · Kartendaten © OpenStreetMap-Mitwirkende (ODbL).
            Rechtliche Einstufung: eigene Pflege.
          </p>
          <p className="flex items-center gap-1.5">
            <Ban size={12} strokeWidth={2.5} aria-hidden />
            Keine Rechtsgarantie — prüfe die Lage vor Ort.
          </p>
        </div>
      </div>
    </footer>
  )
}
