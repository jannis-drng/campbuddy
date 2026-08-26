/**
 * Community — geteilte Touren [SPÄTER, vorgezogen], Abschnitt 4.6.
 *
 * Zeigt Touren, die andere ausdrücklich veröffentlicht haben. Lesen geht
 * ohne Konto; liken, merken und kommentieren brauchen eines.
 *
 * Der Entwurf ist auf Menge gebaut, nicht auf die zwölf Touren des Anfangs.
 * Drei Entscheidungen tragen das:
 *
 *   1. **Gesucht, gefiltert und sortiert wird in der Datenbank.** Die Liste
 *      holt nie „alles" und siebt dann im Browser. Was hier ankommt, ist
 *      bereits die Antwort. (Siehe `services/community.ts`.)
 *   2. **Seitenweise mit Nachladen am Ende.** Kein Sprung auf Seite 7, kein
 *      Zählen der Gesamtmenge auf jeder Anfrage — nur „gibt es noch mehr?",
 *      und das beantwortet ein einziger zusätzlich geholter Eintrag.
 *   3. **Karten statt Zeilen.** Man erkennt eine Tour am Verlauf. Die
 *      Vorschau lädt erst, wenn sie in Sichtweite kommt.
 *
 * Der Filterbereich bleibt sichtbar, wenn nichts gefunden wurde — sonst
 * steht man vor einer leeren Seite ohne den Weg zurück.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Bookmark, Compass, Heart, MapPin, MessageCircle, Search, SlidersHorizontal, TriangleAlert, X,
} from 'lucide-react'
import type { Position } from '../data/geo'
import { REGIONS } from '../data/regions'
import { isSupabaseConfigured, type PublicTour } from '../services/supabase'
import {
  addFavorite, hatBenutzername, ladeProfil, listFavoriteIds, removeFavorite,
} from '../services/account'
import {
  listCommunityTouren, listLikeIds, setLike, verfuegbareRegionen,
  LAENGENKLASSEN, SORTIERUNGEN, STANDARD_FILTER,
  type CommunityFilter, type Laengenklasse, type Ortsfilter, type Sortierung,
} from '../services/community'
import { Auswahl, Button, Eingabe, Hinweis, Leer, Seite, Segmente } from '../ui'
import { AufKarteKnopf, hatWeg, TourKarte, ZaehlerKnopf } from './TourKarte'
import { TourModal } from './TourModal'

interface Props {
  session: Session | null
  onLoadRoute: (geometry: Position[], waypoints: Position[]) => void
  /**
   * Ein von der Karte mitgebrachter Ort — gesetzt, wenn jemand auf ein Symbol
   * getippt und „Alle Touren hier" gewählt hat.
   */
  ort?: Ortsfilter | null
  onOrtLoesen?: () => void
}

export function CommunityPanel({ session, onLoadRoute, ort, onOrtLoesen }: Props) {
  const [filter, setFilter] = useState<CommunityFilter>(STANDARD_FILTER)
  const [sucheRoh, setSucheRoh] = useState('')
  const [touren, setTouren] = useState<PublicTour[]>([])
  const [seite, setSeite] = useState(0)
  const [mehr, setMehr] = useState(false)
  const [gesamt, setGesamt] = useState<number | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  const [likes, setLikes] = useState<Set<string>>(new Set())
  const [favoriten, setFavoriten] = useState<Set<string>>(new Set())
  const [anzeigename, setAnzeigename] = useState<string | null>(null)
  /* Erst wenn das Profil wirklich gelesen ist, steht fest, dass ein Name fehlt. */
  const [nameFehlt, setNameFehlt] = useState(false)
  const [regionen, setRegionen] = useState<string[]>([])
  const [offen, setOffen] = useState<PublicTour | null>(null)
  const [filterOffen, setFilterOffen] = useState(false)

  // Ein von der Karte mitgebrachter Ort ersetzt den bisherigen Ortsfilter.
  useEffect(() => {
    setFilter((f) => (f.ort?.name === (ort?.name ?? null) ? f : { ...f, ort: ort ?? null }))
  }, [ort])

  /*
    Getippte Suche entprellen: sonst geht pro Tastenanschlag eine Abfrage
    hinaus. Bei zehn Zeichen sind das zehn Abfragen für ein Ergebnis.
  */
  useEffect(() => {
    const t = setTimeout(
      () => setFilter((f) => (f.suche === sucheRoh ? f : { ...f, suche: sucheRoh })),
      300,
    )
    return () => clearTimeout(t)
  }, [sucheRoh])

  /*
    Jede Abfrage bekommt eine Marke, und nur die jüngste darf schreiben.

    Ohne das gewinnt die *langsamste* Antwort, nicht die neueste: wer einen
    Filter setzt, während die vorige Abfrage noch läuft, sieht danach wieder
    das alte Ergebnis — mit der neuen Filterzeile darüber. Genau so ist es
    beim Wechsel von der Gesamtliste auf eine Ortssuche aufgetreten.
  */
  const laufendeAnfrage = useRef(0)

  const laden = useCallback(async (s: number, anhaengen: boolean) => {
    const marke = ++laufendeAnfrage.current
    setLaedt(true)
    try {
      const ergebnis = await listCommunityTouren(filter, s)
      if (marke !== laufendeAnfrage.current) return
      setTouren((alt) => (anhaengen ? [...alt, ...ergebnis.touren] : ergebnis.touren))
      setMehr(ergebnis.mehr)
      setGesamt(ergebnis.gesamt)
      setFehler(null)
    } catch (e) {
      if (marke !== laufendeAnfrage.current) return
      setFehler((e as Error).message)
    } finally {
      if (marke === laufendeAnfrage.current) setLaedt(false)
    }
  }, [filter])

  // Jede Filteränderung beginnt wieder bei Seite eins — alles andere ergäbe
  // eine Liste aus zwei verschiedenen Abfragen.
  useEffect(() => {
    if (!isSupabaseConfigured) { setLaedt(false); return }
    setSeite(0)
    void laden(0, false)
  }, [laden])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    verfuegbareRegionen().then(setRegionen).catch(() => {})
  }, [])

  useEffect(() => {
    if (!session) { setLikes(new Set()); setFavoriten(new Set()); setAnzeigename(null); return }
    listLikeIds().then(setLikes).catch(() => {})
    listFavoriteIds().then(setFavoriten).catch(() => {})
    ladeProfil().then((p) => {
      setAnzeigename(p?.anzeigename ?? null)
      setNameFehlt(p != null && !hatBenutzername(p))
    }).catch(() => {})
  }, [session])

  /**
   * Umschalten mit sofortiger Anzeige und Rücknahme im Fehlerfall.
   *
   * Ein Herz, das erst nach der Serverantwort reagiert, fühlt sich kaputt an.
   * Der Zähler wandert gleich mit, sonst stünde „gefällt mir" an einer
   * Karte, die weiter 12 zeigt.
   */
  const likeUmschalten = async (tour: PublicTour) => {
    if (!session) return
    const mag = !likes.has(tour.id)
    setLikes((l) => { const n = new Set(l); if (mag) n.add(tour.id); else n.delete(tour.id); return n })
    zaehlerAendern(tour.id, 'likes_count', mag ? 1 : -1)
    try {
      await setLike(tour.id, mag)
    } catch (e) {
      setFehler((e as Error).message)
      setLikes((l) => { const n = new Set(l); if (mag) n.delete(tour.id); else n.add(tour.id); return n })
      zaehlerAendern(tour.id, 'likes_count', mag ? -1 : 1)
    }
  }

  const merkenUmschalten = async (tour: PublicTour) => {
    if (!session) return
    const merken = !favoriten.has(tour.id)
    setFavoriten((f) => { const n = new Set(f); if (merken) n.add(tour.id); else n.delete(tour.id); return n })
    try {
      if (merken) await addFavorite(tour.id)
      else await removeFavorite(tour.id)
    } catch (e) {
      setFehler((e as Error).message)
      setFavoriten((f) => { const n = new Set(f); if (merken) n.delete(tour.id); else n.add(tour.id); return n })
    }
  }

  const zaehlerAendern = (id: string, feld: 'likes_count' | 'kommentare_count', delta: number) => {
    const anpassen = (t: PublicTour) =>
      t.id === id ? { ...t, [feld]: Math.max(0, t[feld] + delta) } : t
    setTouren((liste) => liste.map(anpassen))
    setOffen((o) => (o && o.id === id ? anpassen(o) : o))
  }

  const aufKarte = (tour: PublicTour) => {
    setOffen(null)
    onLoadRoute(
      (tour.geometry?.coordinates ?? []) as Position[],
      (tour.waypoints ?? []) as Position[],
    )
  }

  const filterAktiv =
    filter.suche !== '' || filter.region !== null || filter.laenge !== 'alle'
    || filter.nurMitWeg || filter.ort !== null

  const ortLoesen = () => {
    setFilter((f) => ({ ...f, ort: null }))
    onOrtLoesen?.()
  }

  if (!isSupabaseConfigured) {
    return (
      <Seite titel="Community" beschreibung="Touren, die andere geteilt haben.">
        <Leer
          icon={Compass}
          titel="Noch keine geteilten Touren"
          text="Sobald jemand eine Tour teilt, steht sie hier. Karte und Tourenplanung funktionieren unabhängig davon."
        />
      </Seite>
    )
  }

  return (
    <Seite
      titel="Community"
      beschreibung="Touren, die andere geteilt haben — mit Verlauf, Kenndaten und dem, was Leute dazu sagen."
      breite="breit"
    >
      {/* ---- Suche und Filter ---- */}
      <div className="space-y-3">
        {/*
          Der Ort steht über der Suche, nicht in der Filterzeile: er ist keine
          Verfeinerung, sondern bestimmt, was hier überhaupt gezeigt wird.
        */}
        {filter.ort && (
          <div className="flex flex-wrap items-center gap-2 rounded-mittel border border-gletscher-500/25 bg-gletscher-500/10 px-3 py-2.5">
            <MapPin size={14} strokeWidth={2} className="shrink-0 text-gletscher-300" aria-hidden />
            <p className="min-w-0 flex-1 text-klein text-ink-200">
              Touren bei <span className="font-medium text-ink-50">{filter.ort.name}</span>
              <span className="text-ink-500"> · {filter.ort.umkreisM / 1000} km Umkreis, nächstgelegene zuerst</span>
            </p>
            <button
              onClick={ortLoesen}
              className="inline-flex h-7 items-center gap-1 rounded-klein px-2 text-klein text-ink-400 transition-colors duration-[160ms] hover:bg-flaeche-3 hover:text-ink-100"
            >
              Aufheben
              <X size={13} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={15} strokeWidth={2} aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
            />
            <Eingabe
              value={sucheRoh}
              onChange={(e) => setSucheRoh(e.target.value)}
              placeholder="Nach Namen oder Beschreibung suchen …"
              aria-label="Touren durchsuchen"
              className="pl-9 pr-9"
            />
            {sucheRoh && (
              <button
                onClick={() => setSucheRoh('')}
                aria-label="Suche leeren"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-klein text-ink-500 hover:text-ink-100"
              >
                <X size={14} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </div>
          <Button
            variante={filterOffen || filterAktiv ? 'primaer' : 'sekundaer'}
            groesse="gross"
            icon={SlidersHorizontal}
            onClick={() => setFilterOffen((o) => !o)}
            aria-expanded={filterOffen}
            className="sm:hidden"
          >
            Filter
          </Button>
        </div>

        {/*
          Auf dem Telefon zugeklappt, ab Tablet immer da: dort ist Platz, und
          ein Filter, den man erst aufklappen muss, wird nicht benutzt.
        */}
        <div className={`${filterOffen ? 'grid' : 'hidden'} grid-cols-1 gap-3 sm:grid sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center`}>
          <Auswahl
            value={filter.region ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, region: e.target.value || null }))}
            aria-label="Region"
            className="w-full sm:w-auto"
          >
            <option value="">Alle Regionen</option>
            {regionen.map((r) => (
              <option key={r} value={r}>{REGIONS[r]?.name ?? r}</option>
            ))}
          </Auswahl>

          <Auswahl
            value={filter.laenge}
            onChange={(e) => setFilter((f) => ({ ...f, laenge: e.target.value as Laengenklasse }))}
            aria-label="Länge"
            className="w-full sm:w-auto"
          >
            {LAENGENKLASSEN.map((k) => (
              <option key={k.wert} value={k.wert}>{k.label}</option>
            ))}
          </Auswahl>

          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
            <Segmente
              groesse="klein"
              ariaLabel="Sortierung"
              wert={filter.sortierung}
              onWaehlen={(w: Sortierung) => setFilter((f) => ({ ...f, sortierung: w }))}
              optionen={SORTIERUNGEN}
              // Fünf Optionen passen auf dem Telefon nicht nebeneinander. Sie
              // brechen aber auch nicht um — dann wären die Felder verschieden
              // hoch. Stattdessen schiebbar.
              //
              // Bei einer Ortssuche ausgegraut: dort entscheidet die Entfernung
              // über die Reihenfolge, eine zweite Sortierung wäre eine Lüge.
              className={`max-w-full overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap${
                filter.ort ? ' pointer-events-none opacity-40' : ''}`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-klein text-ink-500" role="status">
            {laedt && touren.length === 0
              ? 'Wird geladen …'
              : filter.ort
                ? `${touren.length} ${touren.length === 1 ? 'Tour' : 'Touren'} in der Nähe`
                : gesamt != null
                  ? `${gesamt.toLocaleString('de-DE')} ${gesamt === 1 ? 'geteilte Tour' : 'geteilte Touren'}`
                  : `${touren.length} geteilte Touren`}
          </p>
          {filterAktiv && (
            <Button
              variante="geist" groesse="klein"
              onClick={() => { setSucheRoh(''); setFilter(STANDARD_FILTER); onOrtLoesen?.() }}
            >
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}

      {/* ---- Die Liste ---- */}
      {laedt && touren.length === 0 && <Platzhalter />}

      {!laedt && touren.length === 0 && !fehler && (
        filter.ort ? (
          <Leer
            icon={MapPin}
            titel={`Noch keine Tour bei ${filter.ort.name}`}
            text={`Im Umkreis von ${filter.ort.umkreisM / 1000} km hat noch niemand eine Tour geteilt. Plane eine auf der Karte — dann steht hier deine.`}
            aktion={<Button variante="sekundaer" onClick={ortLoesen}>Alle Touren zeigen</Button>}
          />
        ) : filterAktiv ? (
          <Leer
            icon={Search}
            titel="Nichts gefunden"
            text="Keine geteilte Tour passt auf diese Suche. Weniger Filter zeigt mehr."
            aktion={
              <Button variante="sekundaer" onClick={() => { setSucheRoh(''); setFilter(STANDARD_FILTER) }}>
                Filter zurücksetzen
              </Button>
            }
          />
        ) : (
          <Leer
            icon={Compass}
            titel="Noch keine geteilten Touren"
            text="Das ist der erwartete Anfang: hier steht nur, was jemand ausdrücklich veröffentlicht. Plane eine Tour auf der Karte, speichere sie, und teile sie unter „Deine Touren“."
          />
        )
      )}

      {touren.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {touren.map((t) => (
              <TourKarte
                key={t.id}
                tour={t}
                onOeffnen={() => setOffen(t)}
                aktionen={
                  <>
                    <ZaehlerKnopf
                      icon={Heart}
                      zahl={t.likes_count}
                      aktiv={likes.has(t.id)}
                      tonAktiv="warm"
                      disabled={!session}
                      label={session
                        ? likes.has(t.id) ? `„${t.name}" nicht mehr liken` : `„${t.name}" liken`
                        : 'Zum Liken anmelden'}
                      onClick={() => likeUmschalten(t)}
                    />
                    <ZaehlerKnopf
                      icon={MessageCircle}
                      zahl={t.kommentare_count}
                      label={`Kommentare zu „${t.name}" lesen`}
                      onClick={() => setOffen(t)}
                    />
                    <ZaehlerKnopf
                      icon={Bookmark}
                      aktiv={favoriten.has(t.id)}
                      disabled={!session}
                      label={session
                        ? favoriten.has(t.id) ? `„${t.name}" nicht mehr merken` : `„${t.name}" merken`
                        : 'Zum Merken anmelden'}
                      onClick={() => merkenUmschalten(t)}
                    />
                    <AufKarteKnopf onClick={() => aufKarte(t)} disabled={!hatWeg(t)} />
                  </>
                }
              />
            ))}
          </div>

          <NachladeRand
            aktiv={mehr}
            laedt={laedt}
            onNachladen={() => { const n = seite + 1; setSeite(n); void laden(n, true) }}
          />
        </>
      )}

      {!session && touren.length > 0 && (
        <p className="text-klein leading-relaxed text-ink-500">
          Liken, Merken und Kommentieren brauchen ein Konto. Ansehen und auf die Karte laden
          geht ohne.
        </p>
      )}

      <Hinweis ton="warnung" icon={TriangleAlert}>
        Geteilte Touren stammen von Nutzern, nicht von CampBuddy. Ob Übernachten entlang einer
        Tour zulässig ist, sagt dir die Legalitäts-Ebene auf der Karte — nicht die Tatsache,
        dass jemand die Tour geteilt hat.
      </Hinweis>

      <TourModal
        tour={offen}
        session={session}
        anzeigename={anzeigename}
        nameFehlt={nameFehlt}
        geliked={offen ? likes.has(offen.id) : false}
        gemerkt={offen ? favoriten.has(offen.id) : false}
        onLike={() => offen && likeUmschalten(offen)}
        onMerken={() => offen && merkenUmschalten(offen)}
        onAufKarte={() => offen && aufKarte(offen)}
        onClose={() => setOffen(null)}
        onKommentarZahl={(id, delta) => zaehlerAendern(id, 'kommentare_count', delta)}
      />
    </Seite>
  )
}

/* ------------------------------------------------------------ Bausteine */

/** Platzhalterkarten in der Form der echten — kein Springen beim Eintreffen. */
function Platzhalter() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Touren werden geladen">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="overflow-hidden rounded-gross border border-kante bg-flaeche-2">
          <div className="aspect-[16/9] animate-pulse bg-flaeche-3" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-flaeche-3" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-flaeche-3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Nachladen am Listenende.
 *
 * Lädt von selbst, sobald der Rand ins Bild kommt — und trägt trotzdem einen
 * Knopf. Der ist nicht nur die Notlösung ohne IntersectionObserver: mit der
 * Tastatur gibt es kein „scrollt in Sicht", und ohne den Knopf endete die
 * Liste dort für immer.
 */
function NachladeRand({
  aktiv, laedt, onNachladen,
}: { aktiv: boolean; laedt: boolean; onNachladen: () => void }) {
  const rand = useRef<HTMLDivElement>(null)
  // In einem Ref, damit der Beobachter nicht bei jeder Neuzeichnung neu
  // aufgesetzt werden muss.
  const handler = useRef(onNachladen)
  handler.current = onNachladen
  const bereit = aktiv && !laedt

  useEffect(() => {
    const el = rand.current
    if (!el || !bereit || typeof IntersectionObserver === 'undefined') return
    const beobachter = new IntersectionObserver(
      (eintraege) => { if (eintraege.some((e) => e.isIntersecting)) handler.current() },
      { rootMargin: '400px' },
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [bereit])

  if (!aktiv) return null

  return (
    <div ref={rand} className="flex justify-center">
      <Button variante="sekundaer" groesse="gross" disabled={laedt} onClick={onNachladen}>
        {laedt ? 'Lädt …' : 'Mehr Touren laden'}
      </Button>
    </div>
  )
}
