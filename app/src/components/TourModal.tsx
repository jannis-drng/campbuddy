/**
 * Eine geteilte Tour in ganzer Länge — mit Kommentaren.
 *
 * Die Übersicht zeigt bewusst wenig: Bild, Name, drei Kennzahlen. Alles
 * Weitere steht hier. Das hält die Liste überfliegbar und macht diese
 * Ansicht zu dem Ort, an dem man sich für eine Tour entscheidet.
 *
 * Zur Rechtslage: eine geteilte Tour sagt nichts darüber, ob entlang ihres
 * Verlaufs übernachtet werden darf. Das entscheidet die Legalitäts-Ebene auf
 * der Karte. Der Hinweis steht deshalb nicht im Kleingedruckten, sondern dort,
 * wo jemand gerade beschliesst, diese Tour zu gehen.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Bookmark, CalendarDays, Clock, CornerDownRight, Flag, Heart, MessageCircle, Moon, Mountain,
  Route as RouteIcon, Send, Tent, TriangleAlert, Trash2, Users, X,
} from 'lucide-react'
import type { Position } from '../data/geo'
import { formatDauer } from '../data/hiking'
import type { Kommentar, KommentarKnoten, PublicTour } from '../services/supabase'
import {
  eigeneKommentarIds, flachKlopfen, listKommentare, listKommentarLikeIds, loescheKommentar,
  schreibeKommentar, setKommentarLike, type KommentarSortierung,
} from '../services/community'
import { Button, Hinweis, IconButton, Label, Segmente, Eingabe } from '../ui'
import { AutorZeile, formatDatum, formatKm, seitdem, autorInitialen, ZaehlerKnopf } from './TourKarte'
import { RoutenVorschau } from './RoutenVorschau'
import { MeldeDialog } from './MeldeDialog'

const SHELTER_NAMEN = { zelt: 'Zelt', biwak: 'Biwak', huette: 'Hütte' } as const
const SEASON_NAMEN = { sommer: 'Sommer', uebergang: 'Übergang', winter: 'Winter' } as const

interface Props {
  tour: PublicTour | null
  session: Session | null
  anzeigename: string | null
  geliked: boolean
  gemerkt: boolean
  onLike: () => void
  onMerken: () => void
  onAufKarte: () => void
  onClose: () => void
  /** Damit die Karte in der Liste ihren Zähler mitbekommt. */
  onKommentarZahl: (routeId: string, delta: number) => void
}

export function TourModal({
  tour, session, anzeigename, geliked, gemerkt,
  onLike, onMerken, onAufKarte, onClose, onKommentarZahl,
}: Props) {
  useEffect(() => {
    if (!tour) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tour, onClose])

  const [meldet, setMeldet] = useState<{ art: 'route' | 'kommentar'; id: string; name: string } | null>(null)

  if (!tour) return null

  const geometrie = ((tour.vorschau ?? tour.geometry)?.coordinates ?? []) as Position[]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={tour.name}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-riesig border border-kante bg-flaeche-2 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <div className="overflow-y-auto overflow-x-hidden">
          {/* ---- Bild als Kopf, mit dem Titel darin ---- */}
          <div className="relative">
            <RoutenVorschau geometry={geometrie} breite={800} hoehe={340} rund="alle"
                            linie={4} abdunkeln className="!rounded-none" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-flaeche-2 via-flaeche-2/10 to-transparent" />
            <IconButton
              icon={X} label="Schliessen" onClick={onClose}
              className="absolute right-2.5 top-2.5 bg-flaeche-1/80 backdrop-blur-sm"
            />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <h2 className="text-titel font-semibold leading-tight text-ink-50 drop-shadow-[0_1px_6px_rgba(7,10,11,0.8)]">
                {tour.name}
              </h2>
              <AutorZeile autor={tour.autor} zeit={tour.veroeffentlicht_am ?? tour.created_at}
                          className="mt-2" />
            </div>
          </div>

          <div className="space-y-6 p-5">
            {/* ---- Handlungsleiste ---- */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variante={geliked ? 'primaer' : 'sekundaer'}
                icon={Heart}
                onClick={onLike}
                disabled={!session}
                aria-pressed={geliked}
                title={session ? undefined : 'Zum Liken anmelden'}
              >
                {tour.likes_count}
              </Button>
              <Button
                variante={gemerkt ? 'primaer' : 'sekundaer'}
                icon={Bookmark}
                onClick={onMerken}
                disabled={!session}
                aria-pressed={gemerkt}
                title={session ? undefined : 'Zum Merken anmelden'}
              >
                {gemerkt ? 'Gemerkt' : 'Merken'}
              </Button>
              <Button variante="sekundaer" icon={RouteIcon} onClick={onAufKarte}>
                Auf Karte öffnen
              </Button>
              <IconButton
                icon={Flag} label="Tour melden" className="ml-auto"
                onClick={() => setMeldet({ art: 'route', id: tour.id, name: tour.name })}
              />
            </div>

            {!session && (
              <p className="-mt-3 text-mikro normal-case tracking-normal text-ink-600">
                Liken und Merken brauchen ein Konto. Ansehen und auf die Karte laden nicht.
              </p>
            )}

            {tour.beschreibung && (
              <p className="whitespace-pre-line text-fliess leading-relaxed text-ink-200">
                {tour.beschreibung}
              </p>
            )}

            {/* ---- Kenndaten ---- */}
            <Kenndaten tour={tour} />

            {/* ---- Was hier NICHT drinsteht ---- */}
            <Hinweis ton="warnung" icon={TriangleAlert}>
              Diese Tour stammt von einem Nutzer, nicht von CampBuddy. Ob entlang des Verlaufs
              übernachtet werden darf, sagt dir die Legalitäts-Ebene auf der Karte - nicht die
              Tatsache, dass jemand die Tour geteilt hat.
            </Hinweis>

            {/* ---- Kommentare ---- */}
            <Kommentare
              tour={tour}
              session={session}
              anzeigename={anzeigename}
              onKommentarZahl={onKommentarZahl}
              onMelden={(k) => setMeldet({ art: 'kommentar', id: k.id, name: `Kommentar von ${k.autor ?? 'unbekannt'}` })}
            />
          </div>
        </div>
      </div>

      <MeldeDialog
        offen={meldet !== null}
        zielArt={meldet?.art ?? 'route'}
        zielId={meldet?.id ?? ''}
        zielName={meldet?.name ?? ''}
        onClose={() => setMeldet(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------ Kenndaten */

function Kenndaten({ tour }: { tour: PublicTour }) {
  const werte: { icon: typeof Clock; label: string; wert: string }[] = []
  if (tour.distance_m != null) werte.push({ icon: RouteIcon, label: 'Länge', wert: formatKm(tour.distance_m) })
  if (tour.ascent_m != null) werte.push({ icon: Mountain, label: 'Aufstieg', wert: `${tour.ascent_m} hm` })
  if (tour.duration_s != null) werte.push({ icon: Clock, label: 'Gehzeit', wert: formatDauer(tour.duration_s) })
  if (tour.days != null) werte.push({ icon: CalendarDays, label: 'Dauer', wert: `${tour.days} ${tour.days === 1 ? 'Tag' : 'Tage'}` })
  if (tour.persons != null) werte.push({ icon: Users, label: 'Personen', wert: String(tour.persons) })
  if (tour.elevation != null) werte.push({ icon: Moon, label: 'Schlafhöhe', wert: `${tour.elevation} m` })
  if (tour.shelter) werte.push({ icon: Tent, label: 'Übernachtung', wert: SHELTER_NAMEN[tour.shelter] })
  if (tour.season) werte.push({ icon: CalendarDays, label: 'Jahreszeit', wert: SEASON_NAMEN[tour.season] })

  if (werte.length === 0) {
    return (
      <p className="rounded-mittel border border-dashed border-kante px-4 py-3 text-klein text-ink-500">
        Zu dieser Tour sind keine Kenndaten hinterlegt.
      </p>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-gross border border-kante bg-flaeche-1 p-4 sm:grid-cols-4">
        {werte.map((w) => (
          <div key={w.label}>
            <Label className="mb-1 flex items-center gap-1.5">
              <w.icon size={11} strokeWidth={2} className="text-ink-600" aria-hidden />
              {w.label}
            </Label>
            <p className="text-fliess font-semibold text-ink-50">{w.wert}</p>
          </div>
        ))}
      </div>
      {tour.start_date && (
        <p className="mt-2 text-mikro normal-case tracking-normal text-ink-500">
          Geplanter Start: {formatDatum(tour.start_date)}
        </p>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- Kommentare */

const PRO_SEITE = 10

function Kommentare({
  tour, session, anzeigename, onKommentarZahl, onMelden,
}: {
  tour: PublicTour
  session: Session | null
  anzeigename: string | null
  onKommentarZahl: (routeId: string, delta: number) => void
  onMelden: (k: Kommentar) => void
}) {
  const [straenge, setStraenge] = useState<KommentarKnoten[]>([])
  const [mehr, setMehr] = useState(false)
  const [seite, setSeite] = useState(0)
  const [sortierung, setSortierung] = useState<KommentarSortierung>('neu')
  const [suche, setSuche] = useState('')
  const [laedt, setLaedt] = useState(true)
  const [eigene, setEigene] = useState<Set<string>>(new Set())
  const [likes, setLikes] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  /** Auf welchen Kommentar gerade geantwortet wird — null heisst: auf keinen. */
  const [antwortetAuf, setAntwortetAuf] = useState<string | null>(null)

  /**
   * Getippte Suche entprellen. Ohne das ginge pro Tastenanschlag eine Abfrage
   * hinaus — bei einer Volltextsuche auf einer wachsenden Tabelle ist das der
   * Unterschied zwischen „reagiert" und „liegt".
   */
  const [sucheAktiv, setSucheAktiv] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setSucheAktiv(suche); setSeite(0) }, 300)
    return () => clearTimeout(t)
  }, [suche])

  const laden = useCallback(async (anhaengen: boolean, s: number) => {
    setLaedt(true)
    try {
      const { straenge: neu, mehr: hatMehr } = await listKommentare(tour.id, {
        sortierung, suche: sucheAktiv, limit: PRO_SEITE, seite: s,
      })
      setStraenge((alt) => (anhaengen ? [...alt, ...neu] : neu))
      setMehr(hatMehr)
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaedt(false)
    }
  }, [tour.id, sortierung, sucheAktiv])

  useEffect(() => { setSeite(0); void laden(false, 0) }, [laden])

  useEffect(() => {
    if (!session) { setEigene(new Set()); return }
    eigeneKommentarIds(tour.id).then(setEigene).catch(() => {})
  }, [session, tour.id])

  // Eigene Likes nur für das, was gerade auf dem Schirm ist.
  const sichtbareIds = flachKlopfen(straenge).map((k) => k.id)
  const idSchluessel = sichtbareIds.join(',')
  useEffect(() => {
    if (!session || sichtbareIds.length === 0) { setLikes(new Set()); return }
    listKommentarLikeIds(sichtbareIds).then(setLikes).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, idSchluessel])

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    const inhalt = text.trim()
    if (!inhalt) return
    setSendet(true); setFehler(null)
    try {
      await schreibeKommentar(tour.id, inhalt, anzeigename, antwortetAuf)
      setText(''); setAntwortetAuf(null)
      onKommentarZahl(tour.id, 1)
      // Neu laden statt anhängen: der eigene Beitrag soll an der Stelle
      // stehen, an die ihn die gewählte Sortierung setzt.
      setSeite(0)
      await laden(false, 0)
      eigeneKommentarIds(tour.id).then(setEigene).catch(() => {})
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setSendet(false)
    }
  }

  const loeschen = async (k: Kommentar) => {
    try {
      await loescheKommentar(k.id)
      // Rekursiv: der Beitrag kann auf jeder Ebene hängen. Seine eigenen
      // Antworten verschwinden mit ihm — die Datenbank kaskadiert genauso.
      const entfernen = (liste: KommentarKnoten[]): KommentarKnoten[] =>
        liste.filter((x) => x.id !== k.id).map((x) => ({ ...x, antworten: entfernen(x.antworten) }))
      setStraenge(entfernen)
      onKommentarZahl(tour.id, -1)
    } catch (err) {
      setFehler((err as Error).message)
    }
  }

  /**
   * Like sofort anzeigen, im Fehlerfall zurücknehmen. Ein Herz, das erst nach
   * der Serverantwort reagiert, fühlt sich kaputt an.
   */
  const likeUmschalten = async (k: Kommentar) => {
    if (!session) return
    const mag = !likes.has(k.id)

    /** Zahl an genau einem Knoten verschieben, egal wie tief er hängt. */
    const verschieben = (um: number) => (liste: KommentarKnoten[]): KommentarKnoten[] =>
      liste.map((x) => ({
        ...x,
        likes_count: x.id === k.id ? Math.max(0, x.likes_count + um) : x.likes_count,
        antworten: verschieben(um)(x.antworten),
      }))

    setLikes((l) => { const n = new Set(l); if (mag) n.add(k.id); else n.delete(k.id); return n })
    setStraenge(verschieben(mag ? 1 : -1))
    try {
      await setKommentarLike(k.id, mag)
    } catch (err) {
      setFehler((err as Error).message)
      setLikes((l) => { const n = new Set(l); if (mag) n.delete(k.id); else n.add(k.id); return n })
      setStraenge(verschieben(mag ? -1 : 1))
    }
  }

  const anzahl = tour.kommentare_count
  const gefiltert = sucheAktiv.trim().length > 0
  const antwortZiel = antwortetAuf
    ? flachKlopfen(straenge).find((k) => k.id === antwortetAuf) ?? null
    : null

  /**
   * Einen Beitrag samt allem, was darunter hängt.
   *
   * Eingerückt wird nach `tiefe`, nicht nach der Rekursionstiefe: die Spalte
   * ist in der Datenbank gedeckelt (Migration 0019). So bleibt der Bezug
   * korrekt — eine Antwort hängt immer am echten Elternteil —, während die
   * Einrückung nicht ins Uferlose läuft. Ohne Deckel wäre der Text auf einem
   * Telefon nach sechs Ebenen schmaler als ein Wort.
   */
  const strang = (k: KommentarKnoten): React.ReactNode => (
    <li key={k.id}>
      <KommentarZeile
        kommentar={k}
        eigen={eigene.has(k.id)}
        geliked={likes.has(k.id)}
        kannHandeln={session !== null}
        onLike={() => likeUmschalten(k)}
        onAntworten={() => {
          setAntwortetAuf(k.id)
          // Das Eingabefeld steht oben; ohne diesen Sprung tippt man ins Leere.
          document.getElementById('kommentar-eingabe')?.focus()
        }}
        onLoeschen={() => loeschen(k)}
        onMelden={() => onMelden(k)}
      />
      {k.antworten.length > 0 && (
        // Eingerückt mit einer Linie statt nur mit Abstand: bei zwei Antworten
        // reicht Abstand, bei zehn sieht man ohne Linie nicht mehr, wo der
        // Strang endet. Auf dem Telefon fällt die Einrückung kleiner aus.
        <ul className="mt-2 space-y-2 border-l border-kante pl-2.5 sm:pl-4">
          {k.antworten.map(strang)}
        </ul>
      )}
    </li>
  )

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-ueberschrift font-semibold text-ink-50">
          <MessageCircle size={16} strokeWidth={2} className="text-ink-500" aria-hidden />
          Kommentare
          <span className="text-fliess font-normal text-ink-500">{anzahl}</span>
        </h3>
        {anzahl > 1 && (
          <Segmente
            groesse="klein"
            ariaLabel="Kommentare sortieren"
            wert={sortierung}
            onWaehlen={(w) => { setSortierung(w); setSeite(0) }}
            optionen={[
              { wert: 'neu' as const, label: 'Neueste' },
              { wert: 'alt' as const, label: 'Älteste' },
            ]}
          />
        )}
      </div>

      {/* Filter erst ab einer Menge, in der Suchen überhaupt Sinn ergibt. */}
      {anzahl > PRO_SEITE && (
        <Eingabe
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="In den Kommentaren suchen …"
          aria-label="Kommentare durchsuchen"
          className="mb-3"
        />
      )}

      {session ? (
        <form onSubmit={absenden} className="mb-4">
          {antwortZiel && (
            <div className="mb-2 flex items-center gap-2 rounded-mittel bg-flaeche-1 px-3 py-2 text-klein text-ink-400">
              <CornerDownRight size={13} strokeWidth={2} className="shrink-0 text-ink-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Antwort an <span className="font-medium text-ink-200">{antwortZiel.autor ?? 'gelöschtes Konto'}</span>
              </span>
              <IconButton icon={X} groesse="klein" label="Antwort abbrechen"
                          onClick={() => setAntwortetAuf(null)} />
            </div>
          )}
          <div className="flex gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gletscher-500/30 bg-gletscher-500/12 text-[11px] font-semibold text-gletscher-200"
            >
              {autorInitialen(anzeigename)}
            </span>
            <div className="min-w-0 flex-1">
              <textarea
                id="kommentar-eingabe"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={antwortZiel
                  ? 'Deine Antwort …'
                  : 'Warst du dort? Schreib, was andere wissen sollten.'}
                className="w-full resize-y rounded-mittel border border-kante bg-flaeche-1 px-3 py-2 text-fliess leading-relaxed text-ink-100 placeholder:text-ink-500 transition-colors duration-[160ms] hover:border-kante-stark focus:border-gletscher-500 focus:outline-none focus:ring-2 focus:ring-gletscher-500/25"
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="text-mikro normal-case tracking-normal text-ink-600">
                  {text.length > 1800 ? `${2000 - text.length} Zeichen übrig` : ''}
                </span>
                <Button type="submit" variante="primaer" icon={Send} disabled={!text.trim() || sendet}>
                  {sendet ? 'Sendet …' : antwortZiel ? 'Antworten' : 'Abschicken'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <p className="mb-4 rounded-mittel border border-dashed border-kante px-4 py-3 text-klein text-ink-500">
          Zum Kommentieren ist eine Anmeldung nötig. Mitlesen geht ohne.
        </p>
      )}

      {fehler && <Hinweis ton="fehler" icon={TriangleAlert} className="mb-3">{fehler}</Hinweis>}

      {laedt && straenge.length === 0 && (
        <div className="space-y-2" aria-label="Kommentare werden geladen">
          {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-mittel bg-flaeche-1" />)}
        </div>
      )}

      {!laedt && straenge.length === 0 && (
        <p className="rounded-mittel border border-dashed border-kante px-4 py-5 text-center text-klein text-ink-500">
          {gefiltert
            ? 'Kein Kommentar enthält diesen Text.'
            : 'Noch nichts gesagt. Der erste Hinweis hilft am meisten.'}
        </p>
      )}

      <ul className="space-y-2.5">
        {straenge.map(strang)}
      </ul>

      {mehr && (
        <Button
          variante="sekundaer" breit className="mt-3"
          disabled={laedt}
          onClick={() => { const n = seite + 1; setSeite(n); void laden(true, n) }}
        >
          {laedt ? 'Lädt …' : 'Weitere Kommentare'}
        </Button>
      )}
    </section>
  )
}

/** Ein einzelner Beitrag — Ursprung wie Antwort, nur anders eingefasst. */
function KommentarZeile({
  kommentar: k, eigen, geliked, kannHandeln,
  onLike, onAntworten, onLoeschen, onMelden,
}: {
  kommentar: Kommentar
  eigen: boolean
  geliked: boolean
  kannHandeln: boolean
  onLike: () => void
  onAntworten: () => void
  onLoeschen: () => void
  onMelden: () => void
}) {
  return (
    <div className={`rounded-mittel p-3.5 ${k.tiefe > 0 ? 'bg-flaeche-1/60' : 'bg-flaeche-1'}`}>
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full border border-kante bg-flaeche-3 font-semibold text-ink-300 ${
            k.tiefe > 0 ? 'h-6 w-6 text-[9px]' : 'h-7 w-7 text-[10px]'}`}
        >
          {autorInitialen(k.autor)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-klein">
            <span className="font-medium text-ink-100">{k.autor?.trim() || 'gelöschtes Konto'}</span>
            <span className="text-ink-600">{seitdem(k.created_at)}</span>
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-fliess leading-relaxed text-ink-200">
            {k.text}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
            <ZaehlerKnopf
              icon={Heart}
              zahl={k.likes_count > 0 ? k.likes_count : undefined}
              aktiv={geliked}
              tonAktiv="warm"
              disabled={!kannHandeln}
              label={kannHandeln
                ? geliked ? 'Like zurücknehmen' : 'Kommentar liken'
                : 'Zum Liken anmelden'}
              onClick={onLike}
            />
            {kannHandeln && (
              <button
                type="button"
                onClick={onAntworten}
                className="inline-flex h-8 items-center gap-1.5 rounded-mittel px-2 text-klein font-medium text-ink-400 transition-colors duration-[160ms] hover:bg-flaeche-3 hover:text-ink-100"
              >
                <CornerDownRight size={14} strokeWidth={2} aria-hidden />
                Antworten
              </button>
            )}
          </div>
        </div>
        {eigen ? (
          <IconButton icon={Trash2} groesse="klein" label="Eigenen Kommentar löschen" onClick={onLoeschen} />
        ) : (
          <IconButton icon={Flag} groesse="klein" label="Kommentar melden" onClick={onMelden} />
        )}
      </div>
    </div>
  )
}
