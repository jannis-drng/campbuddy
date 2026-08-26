/**
 * "Deine Touren" — alles Gespeicherte an einer Stelle (Abschnitt 4.6).
 *
 * Hier stand vorher dreierlei nebeneinander: Routen, Favoriten, Touren. Das
 * war die Datenbank, nicht der Kopf des Nutzers. Seit Migration 0016 ist eine
 * Tour eine Sache — ein Weg mit Eckdaten — und diese Seite zeigt genau zwei
 * Stapel: was ich geplant habe, und was ich mir gemerkt habe.
 *
 * Geplant wird weiterhin ausschliesslich auf der Karte: dort entsteht der
 * Verlauf, und die Auswertung dazu enthält Ausrüstung, Verpflegung und
 * Wetter. Hier liegt nur, was daraus gespeichert wurde.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Bookmark, Globe, Heart, Lock, Map as MapIcon, MessageCircle, Share2,
  Trash2, TriangleAlert, X,
} from 'lucide-react'
import type { Position } from '../data/geo'
import { isSupabaseConfigured, type PublicTour, type Tour } from '../services/supabase'
import {
  deleteTour, ladeProfil, listFavoriteTouren, listTouren, removeFavorite,
  setTourPublic, tourKopieren,
} from '../services/account'
import { Badge, Button, Hinweis, IconButton, Leer, Segmente, Seite } from '../ui'
import { AufKarteKnopf, hatWeg, TourKarte, ZaehlerKnopf } from './TourKarte'
import { TourFenster } from './TourFenster'

interface Props {
  session: Session | null
  onLoadRoute: (geometry: Position[], waypoints: Position[]) => void
  onAnmelden: () => void
  /** Führt zur Karte, wo Touren entstehen. */
  onZurKarte: () => void
  /**
   * Eine eigene Tour auf der Karte weiterbearbeiten.
   *
   * Verlauf und Nachtlager hängen am Höhenprofil und an dem, was entlang der
   * Route liegt — beides kennt nur die Karte. Gespeichert wird danach in
   * dieselbe Tour, nicht als zweite (siehe App.tsx).
   */
  onBearbeiten: (tour: Tour) => void
}

type Stapel = 'eigene' | 'gemerkt'

export function MyToursPanel({
  session, onLoadRoute, onAnmelden, onZurKarte, onBearbeiten,
}: Props) {
  const [stapel, setStapel] = useState<Stapel>('eigene')
  const [eigene, setEigene] = useState<Tour[]>([])
  const [gemerkt, setGemerkt] = useState<PublicTour[]>([])
  const [anzeigename, setAnzeigename] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)

  /** Welche Tour gerade geteilt bzw. bearbeitet wird — null heisst: kein Dialog. */
  const [teilt, setTeilt] = useState<Tour | null>(null)
  const [loescht, setLoescht] = useState<Tour | null>(null)
  /**
   * Welche Tour gerade aufgeschlagen ist — und ob sie mir gehört.
   *
   * Dasselbe Fenster trägt beide Stapel. Der Unterschied liegt nicht darin,
   * was zu sehen ist, sondern wohin eine Änderung geht: bei einer eigenen
   * Tour in die Zeile, bei einer gemerkten in eine Kopie, wenn man sie
   * übernimmt.
   */
  const [detail, setDetail] = useState<{ tour: Tour | PublicTour; eigen: boolean } | null>(null)

  const laden = useCallback(async () => {
    if (!session) { setEigene([]); setGemerkt([]); setLaedt(false); return }
    setLaedt(true)
    try {
      const [meine, favoriten, profil] = await Promise.all([
        listTouren(), listFavoriteTouren(), ladeProfil(),
      ])
      setEigene(meine)
      setGemerkt(favoriten)
      setAnzeigename(profil?.anzeigename ?? null)
      setFehler(null)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setLaedt(false)
    }
  }, [session])

  useEffect(() => { void laden() }, [laden])

  const aufKarte = (t: Tour | PublicTour) =>
    onLoadRoute(
      (t.geometry?.coordinates ?? []) as Position[],
      (t.waypoints ?? []) as Position[],
    )

  const zuruecknehmen = async (t: Tour) => {
    try {
      await setTourPublic(t.id, false)
      setEigene((liste) => liste.map((x) => (x.id === t.id ? { ...x, is_public: false } : x)))
    } catch (e) { setFehler((e as Error).message) }
  }

  const vergessen = async (t: PublicTour) => {
    try {
      await removeFavorite(t.id)
      setGemerkt((liste) => liste.filter((x) => x.id !== t.id))
    } catch (e) { setFehler((e as Error).message) }
  }

  const entfernen = async (t: Tour) => {
    try {
      await deleteTour(t.id)
      setEigene((liste) => liste.filter((x) => x.id !== t.id))
      setLoescht(null)
    } catch (e) { setFehler((e as Error).message) }
  }

  const liste = stapel === 'eigene' ? eigene : gemerkt

  return (
    <Seite
      titel="Deine Touren"
      beschreibung="Was du geplant und was du dir gemerkt hast. Geplant wird auf der Karte."
      breite="breit"
      aktion={<Button variante="primaer" icon={MapIcon} onClick={onZurKarte}>Zur Karte</Button>}
    >
      {fehler && <Hinweis ton="fehler" icon={TriangleAlert}>{fehler}</Hinweis>}

      {!session && isSupabaseConfigured && (
        <Leer
          icon={Bookmark}
          titel="Zum Speichern ist eine Anmeldung nötig"
          text="Karte, Routenplanung und Auswertung funktionieren ohne Konto. Gespeichert wird nur, was du selbst anlegst."
          aktion={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variante="primaer" onClick={onAnmelden}>Anmelden</Button>
              <Button variante="sekundaer" icon={MapIcon} onClick={onZurKarte}>Zur Karte</Button>
            </div>
          }
        />
      )}

      {session && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmente
              ariaLabel="Welche Touren"
              wert={stapel}
              onWaehlen={setStapel}
              optionen={[
                { wert: 'eigene' as const, label: `Eigene (${eigene.length})` },
                { wert: 'gemerkt' as const, label: `Gemerkt (${gemerkt.length})` },
              ]}
            />
          </div>

          {laedt && <p className="text-klein text-ink-500">Wird geladen …</p>}

          {!laedt && liste.length === 0 && (
            stapel === 'eigene' ? (
              <Leer
                icon={MapIcon}
                titel="Noch keine Tour gespeichert"
                text="Zeichne auf der Karte einen Verlauf, öffne „Tour auswerten“ und speichere sie dort — samt Dauer, Ausrüstung und Wetter."
                aktion={<Button variante="primaer" icon={MapIcon} onClick={onZurKarte}>Zur Karte</Button>}
              />
            ) : (
              <Leer
                icon={Bookmark}
                titel="Noch nichts gemerkt"
                text="Im Community-Bereich lassen sich fremde Touren mit dem Lesezeichen merken. Sie landen dann hier."
              />
            )
          )}

          {liste.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stapel === 'eigene'
                ? eigene.map((t) => (
                    <TourKarte
                      key={t.id}
                      tour={t}
                      /*
                        Die Tour öffnet die Tour — nicht die Karte. Der Verlauf
                        ist einer von fünf Gründen, eine gespeicherte Tour
                        aufzuschlagen; die anderen vier standen hinter einem
                        Listensymbol in der Fussleiste oder gar nicht. Auf die
                        Karte führt von dort aus weiterhin ein Weg, und der
                        Knopf in der Fussleiste bleibt als Abkürzung.
                      */
                      onOeffnen={() => setDetail({ tour: t, eigen: true })}
                      autorZeigen={false}
                      marke={
                        // Unterlage, sonst verschwindet die Marke im Kartenbild.
                        <Badge
                          ton={t.is_public ? 'akzent' : 'neutral'}
                          icon={t.is_public ? Globe : Lock}
                          className="bg-flaeche-1/85 backdrop-blur-sm"
                        >
                          {t.is_public ? 'Geteilt' : 'Privat'}
                        </Badge>
                      }
                      aktionen={
                        <>
                          {t.is_public ? (
                            <>
                              <ZaehlerKnopf icon={Heart} zahl={t.likes_count} tonAktiv="warm"
                                            label={`${t.likes_count} Likes`} />
                              <ZaehlerKnopf icon={MessageCircle} zahl={t.kommentare_count}
                                            label={`${t.kommentare_count} Kommentare`} />
                              <IconButton icon={Lock} groesse="klein" label="Nicht mehr teilen"
                                          onClick={() => zuruecknehmen(t)} />
                            </>
                          ) : (
                            <Button variante="sekundaer" groesse="klein" icon={Share2}
                                    onClick={() => setTeilt(t)}>
                              Teilen
                            </Button>
                          )}
                          <IconButton icon={Trash2} groesse="klein" label={`„${t.name}" löschen`}
                                      onClick={() => setLoescht(t)} />
                          <AufKarteKnopf onClick={() => aufKarte(t)} disabled={!hatWeg(t)} />
                        </>
                      }
                    />
                  ))
                : gemerkt.map((t) => (
                    <TourKarte
                      key={t.id}
                      tour={t}
                      onOeffnen={() => setDetail({ tour: t, eigen: false })}
                      aktionen={
                        <>
                          <ZaehlerKnopf icon={Heart} zahl={t.likes_count} tonAktiv="warm"
                                        label={`${t.likes_count} Likes`} />
                          <ZaehlerKnopf icon={MessageCircle} zahl={t.kommentare_count}
                                        label={`${t.kommentare_count} Kommentare`} />
                          <ZaehlerKnopf icon={Bookmark} aktiv label={`„${t.name}" nicht mehr merken`}
                                        onClick={() => vergessen(t)} />
                          <AufKarteKnopf onClick={() => aufKarte(t)} disabled={!hatWeg(t)} />
                        </>
                      }
                    />
                  ))}
            </div>
          )}

          <p className="border-t border-kante pt-5 text-klein leading-relaxed text-ink-500">
            Neue Touren entstehen auf der Karte: Verlauf zeichnen, „Tour auswerten“ öffnen und
            dort speichern.{' '}
            <button onClick={onZurKarte} className="text-gletscher-400 underline underline-offset-2 hover:text-gletscher-300">
              Zur Karte
            </button>
          </p>
        </>
      )}

      <TeilenDialog
        tour={teilt}
        anzeigename={anzeigename}
        onClose={() => setTeilt(null)}
        onGeteilt={(id, beschreibung) => {
          setEigene((l) => l.map((x) => (x.id === id ? { ...x, is_public: true, beschreibung } : x)))
          setTeilt(null)
        }}
        onFehler={setFehler}
      />

      <LoeschDialog
        tour={loescht}
        onClose={() => setLoescht(null)}
        onBestaetigt={() => loescht && entfernen(loescht)}
      />

      {detail && (
        <TourFenster
          /*
            Der Schlüssel wechselt mit der Tour: sonst behielte das Fenster
            beim Übernehmen einer gemerkten Tour die Zustände der Vorlage —
            Name und Angaben stünden dann auf der fremden Tour, obwohl die
            eigene Kopie darin liegt.
          */
          key={detail.tour.id}
          tour={detail.tour}
          eigen={detail.eigen}
          onClose={() => setDetail(null)}
          onAufKarte={(geometry, wegpunkte) => {
            setDetail(null)
            onLoadRoute(geometry, wegpunkte)
          }}
          onBearbeiten={detail.eigen
            ? () => { setDetail(null); onBearbeiten(detail.tour as Tour) }
            : undefined}
          onKopieren={detail.eigen ? undefined : async (name, trip) => {
            const kopie = await tourKopieren(detail.tour as PublicTour, name, trip)
            setEigene((liste) => [kopie, ...liste])
            setStapel('eigene')
            setDetail({ tour: kopie, eigen: true })
          }}
          onGeaendert={(patch) =>
            setEigene((liste) =>
              liste.map((x) => (x.id === detail.tour.id ? { ...x, ...patch } : x)))}
        />
      )}
    </Seite>
  )
}

/* -------------------------------------------------------------- Dialoge */

/** Gemeinsame Hülle: abgedunkelter Grund, Karte in der Mitte, Escape schliesst. */
function Dialog({
  offen, titel, onClose, children,
}: { offen: boolean; titel: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [offen, onClose])

  if (!offen) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-flaeche-1/70 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-label={titel}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-t-riesig border border-kante bg-flaeche-2 p-5 shadow-[var(--shadow-4)] sm:rounded-riesig">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-titel font-semibold text-ink-50">{titel}</h2>
          <IconButton icon={X} label="Schliessen" onClick={onClose} className="-mr-1.5 -mt-1" />
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Teilen ist der einzige Schritt, mit dem etwas den eigenen Bereich verlässt.
 * Deshalb ein eigener Dialog statt eines Umschalters: hier steht, was genau
 * sichtbar wird, und hier lässt sich die Beschreibung mitgeben, die die Tour
 * in der Community erst lesbar macht.
 */
function TeilenDialog({
  tour, anzeigename, onClose, onGeteilt, onFehler,
}: {
  tour: Tour | null
  anzeigename: string | null
  onClose: () => void
  onGeteilt: (id: string, beschreibung: string | null) => void
  onFehler: (m: string) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setText(tour?.beschreibung ?? '') }, [tour])

  const teilen = async () => {
    if (!tour) return
    setBusy(true)
    try {
      const beschreibung = text.trim() || null
      await setTourPublic(tour.id, true, { beschreibung: beschreibung ?? undefined })
      onGeteilt(tour.id, beschreibung)
    } catch (e) {
      onFehler((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog offen={tour !== null} titel="Tour teilen" onClose={onClose}>
      <p className="text-fliess leading-relaxed text-ink-300">
        Sichtbar werden Name, Verlauf, Kenndaten und deine Beschreibung — als
        {' '}<span className="font-medium text-ink-100">{anzeigename?.trim() || 'dein Benutzername'}</span>.
        Deine E-Mail-Adresse wird nie veröffentlicht. Zurücknehmen kannst du das jederzeit.
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-mikro font-medium uppercase text-ink-500">
          Beschreibung (optional)
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Wo geht es lang, was sollte man wissen, wo hast du geschlafen?"
          className="w-full resize-y rounded-mittel border border-kante bg-flaeche-1 px-3 py-2 text-fliess leading-relaxed text-ink-100 placeholder:text-ink-500 transition-colors duration-[160ms] hover:border-kante-stark focus:border-gletscher-500 focus:outline-none focus:ring-2 focus:ring-gletscher-500/25"
        />
      </label>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variante="geist" onClick={onClose}>Abbrechen</Button>
        <Button variante="primaer" icon={Share2} onClick={teilen} disabled={busy}>
          {busy ? 'Teilt …' : 'Jetzt teilen'}
        </Button>
      </div>
    </Dialog>
  )
}

function LoeschDialog({
  tour, onClose, onBestaetigt,
}: { tour: Tour | null; onClose: () => void; onBestaetigt: () => void }) {
  return (
    <Dialog offen={tour !== null} titel="Tour löschen" onClose={onClose}>
      <p className="text-fliess leading-relaxed text-ink-300">
        „{tour?.name}“ wird endgültig gelöscht — mit Verlauf, Kenndaten und, falls geteilt,
        allen Likes und Kommentaren dazu. Das lässt sich nicht rückgängig machen.
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variante="geist" onClick={onClose}>Abbrechen</Button>
        <Button variante="gefahr" icon={Trash2} onClick={onBestaetigt}>Endgültig löschen</Button>
      </div>
    </Dialog>
  )
}
