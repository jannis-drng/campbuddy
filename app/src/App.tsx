import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_REGION, REGIONS } from './data/regions'
import {
  filterNature, filterPoints, getRegion, ladeGipfel, ladeGipfelUebersicht, ladeNatur, ladePunkte,
  ladeZonen, verificationStats,
} from './data/legalData'
import type {
  Ausschnitt, EigenerPunkt, LegalStatus, MapFilters, NatureFeature, Peak, Point, TripParams,
  Wegpunkt, WegpunktArt, Zone,
} from './data/types'
import { MapView } from './map/MapView'
import { Haftungshinweis } from './components/Disclaimer'
import { Ladehinweis, Ladeschleier } from './components/Laden'
import { FilterBar } from './components/FilterBar'
import { InfoPanel, type Selection } from './components/InfoPanel'
import { MyToursPanel } from './components/MyToursPanel'
import { CommunityPanel } from './components/CommunityPanel'
import { TourDetailModal } from './components/TourDetailModal'
import { RoutePanel } from './components/RoutePanel'
import { analyseRoute, NEARBY_RADIUS_M } from './data/routeAnalysis'
import { distanceToLine, lineLength, pointInGeometry, type Position } from './data/geo'
import { einfuegeStelle, umkehren, verschieben, wegpunktName } from './data/wegpunkte'
import { parseGpx } from './services/gpx'
import { loadElevationProfile, type ElevationPoint } from './services/elevation'
import { analyseProfil, planeEtappen, type Schlafmoeglichkeit } from './data/hiking'
import { routeWaypoints, type RoutedPath, type RoutingProfile } from './map/routing'
import { AccountPanel } from './components/AccountPanel'
import { PunktDialog } from './components/PunktDialog'
import { ladeEigenePunkte, punktLoeschen } from './services/eigenePunkte'
import { kantonAn, kantonGrundlagen, kantonRecht, ladeKantone } from './data/kantone'
import {
  gemeindeAn, gemeindeRecht, gemeindenGeoJSON, ladeGemeindenDetail, ladeGemeindenUebersicht,
} from './data/gemeinden'
import { Kartenebenen } from './components/Kartenebenen'
import { ZeichenLeiste } from './components/ZeichenLeiste'
import { Marke } from './components/Marke'
import { UnterstuetzenKnopf } from './components/Unterstuetzen'
import { DEFAULT_BASEMAP, ZOOM_AB, type BasemapKey } from './map/mapConfig'
import { isSupabaseConfigured, type Tour } from './services/supabase'
import { serviceWorkerVorwaermen } from './services/sw'
import {
  entwurfAbholen, entwurfSichern, entwurfVerwerfen, entwurfWartet, type Tourentwurf,
} from './services/entwurf'
import {
  aktualisiereTour, brauchtNamenswahl, ladeEigenenVerlauf, ladeProfil, linkErgebnisAuslesen,
  saveTour, useSession,
  type GespeicherteEtappe, type LinkErgebnis, type Profil,
} from './services/account'
import { BenutzernameDialog } from './components/BenutzernameDialog'
import type { PackStaende } from './affiliate/packlist'
import { ladeVerlauf, ORT_UMKREIS_M, type Ortsfilter } from './services/community'
import { Bookmark, Compass, List, LogIn, Map, Route, UserRound } from 'lucide-react'
import { Auswahl, Button, Segmente } from './ui'

/**
 * Die Karte startet ohne Symbolebenen.
 *
 * Sieben Ebenen gleichzeitig überdecken auf einem Telefonbildschirm genau
 * das, weswegen jemand hier ist: die Einfärbung der Rechtslage. Wer Hütten,
 * Wasser oder Gipfel sucht, schaltet sie über „Symbole" gezielt zu — das ist
 * ein Griff, während das Wegräumen von sieben Ebenen sieben waren.
 *
 * Ausgenommen `showEigene`: selbst gesetzte Punkte und Fotos sind kein
 * Kartenrauschen, sondern die eigene Arbeit. Sie unaufgefordert zu verstecken
 * sähe aus, als wären sie verloren gegangen.
 */
const INITIAL_FILTERS: MapFilters = {
  activity: 'all',
  showHuts: false,
  showCampsites: false,
  showVehicleSpots: false,
  showPeaks: false,
  showWater: false,
  showViewpoints: false,
  showEigene: true,
}

type View = 'karte' | 'community' | 'touren' | 'konto'

const mehrereRegionen = Object.keys(REGIONS).length > 1

/**
 * Der verlinkte Ort aus der Adresse: `#/karte/ort/<breite>,<laenge>`.
 *
 * Streng geprüft, weil die Zahlen aus einer Adresszeile kommen: nur zwei
 * Dezimalzahlen, nur innerhalb gültiger Erdkoordinaten. Alles andere wird
 * still verworfen und die Karte startet wie immer — eine kaputte Adresse
 * soll die Anwendung nicht aufhalten.
 */
function ortAusAdresse(): Position | null {
  const treffer = /^#\/karte\/ort\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(window.location.hash)
  if (!treffer) return null
  const breite = Number(treffer[1])
  const laenge = Number(treffer[2])
  if (!Number.isFinite(breite) || !Number.isFinite(laenge)) return null
  if (Math.abs(breite) > 90 || Math.abs(laenge) > 180) return null
  return [laenge, breite]
}


export default function App() {
  const [view, setView] = useState<View>('karte')
  const { session, ready } = useSession()
  // Rückkehr von einem Bestätigungs-, Anmelde- oder Passwortlink auswerten,
  // bevor die Adresszeile aufgeräumt wird.
  const [linkErgebnis, setLinkErgebnis] = useState<LinkErgebnis | null>(null)
  useEffect(() => {
    const ergebnis = linkErgebnisAuslesen()
    if (ergebnis) { setLinkErgebnis(ergebnis); setView('konto') }
  }, [])
  /*
    Der Benutzername wird seit Migration 0022 nicht mehr bei der Registrierung
    verlangt: das Konto entsteht mit dem Übergangsnamen aus seiner ID, und der
    eigene wird nach der Mailbestätigung angeboten. Damit dieses Angebot nicht
    in einem Menü versauert, holt die App das Profil einmal je Anmeldung und
    fragt gleich danach. Wer „Später" tippt, wird bis zur nächsten Anmeldung
    nicht mehr gefragt und heisst so lange `wanderer-…` — gesperrt ist dadurch
    nichts.
  */
  const [kontoProfil, setKontoProfil] = useState<Profil | null>(null)
  const [namenSpaeter, setNamenSpaeter] = useState(false)
  const nutzerId = session?.user.id
  useEffect(() => {
    if (!nutzerId) { setKontoProfil(null); setNamenSpaeter(false); return }
    let abgebrochen = false
    ladeProfil().then((p) => { if (!abgebrochen) setKontoProfil(p) }).catch(() => {})
    return () => { abgebrochen = true }
  }, [nutzerId])

  const [regionCode, setRegionCode] = useState(DEFAULT_REGION)
  const [basemap, setBasemap] = useState<BasemapKey>(DEFAULT_BASEMAP)
  const [filters, setFilters] = useState<MapFilters>(INITIAL_FILTERS)
  const [selection, setSelection] = useState<Selection>(null)

  // Selbst markierte Punkte: eigene und veröffentlichte, aus dem Backend.
  const [eigenePunkte, setEigenePunkte] = useState<EigenerPunkt[]>([])
  const [markieren, setMarkieren] = useState(false)
  const [dialogPosition, setDialogPosition] = useState<Position | null>(null)
  const [dialogPunkt, setDialogPunkt] = useState<EigenerPunkt | null>(null)

  const [routeOpen, setRouteOpen] = useState(false)
  const [auswertungOffen, setAuswertungOffen] = useState(false)
  /**
   * Die eigene Tour, die gerade auf der Karte bearbeitet wird.
   *
   * Ohne sie legte jedes Speichern eine neue Tour an — `saveTour` fügt immer
   * ein. Wer eine gespeicherte Tour zum Ändern öffnete und danach speicherte,
   * hatte zwei fast gleiche Touren in der Liste und musste raten, welche die
   * neue ist. Steht hier eine Tour, geht das Speichern in ihre Zeile.
   *
   * Sie wird verworfen, sobald der Verlauf ein anderer wird, ohne dass er von
   * ihr abstammt: eine gelöschte Route und eine importierte GPX-Spur sind
   * beide keine Änderung *dieser* Tour mehr.
   */
  const [bearbeiteteTour, setBearbeiteteTour] = useState<{ id: string; name: string } | null>(null)
  /**
   * Eine über die Anmeldung gerettete Tour.
   *
   * Sie wird beim Start genau einmal abgeholt (`entwurfAbholen` verbraucht
   * sie) und dient hier zweierlei: die Auswertung bekommt Name, Etappen und
   * Packliste als Vorbelegung, und ihr `key` wechselt damit — so entstehen die
   * Zustände dort frisch daraus, statt nachträglich überschrieben zu werden.
   */
  const [entwurf, setEntwurf] = useState<Tourentwurf | null>(null)
  /** Wartet gerade eine Tour auf die Anmeldung? Nur für den Hinweis im Konto. */
  const [tourWartet, setTourWartet] = useState(entwurfWartet)
  const [drawing, setDrawing] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  // Die vom Nutzer gesetzten Stützpunkte …
  /*
    Wegpunkte tragen jetzt mit, *was* an ihrer Stelle steht, wenn sie durch
    Antippen eines Symbols entstanden sind. Die Koordinaten allein reichten
    nicht: die Liste im Routenpanel konnte danach nur „Zwischenstopp 2" sagen,
    obwohl gerade bewusst eine bestimmte Hütte angetippt worden war.
  */
  const [waypoints, setWaypoints] = useState<Wegpunkt[]>([])

  /** Nur die Koordinaten — für Routing, Karte und Speichern. */
  const wegpunktOrte = useMemo(() => waypoints.map((w) => w.position), [waypoints])
  /** Was an ihnen steht — für die Beschriftung auf der Karte. */
  const wegpunktBeschriftungen = useMemo(
    () => waypoints.map((w, i) => wegpunktName(w, i, waypoints.length)),
    [waypoints],
  )
  // … das Ergebnis des Weg-Routings dazwischen …
  const [routed, setRouted] = useState<RoutedPath | null>(null)
  const [routingBusy, setRoutingBusy] = useState(false)
  const [profile, setProfile] = useState<RoutingProfile>('foot')
  // … und eine importierte GPX-Spur, die unverändert übernommen wird.
  const [gpxTrack, setGpxTrack] = useState<Position[] | null>(null)
  const [profil, setProfil] = useState<ElevationPoint[]>([])
  const [hoehenBusy, setHoehenBusy] = useState(false)
  const [hoehenFehler, setHoehenFehler] = useState<string | null>(null)

  // Escape beendet den aktiven Modus — die übliche Fluchttaste, und ohne sie
  // klebt man im Zeichenmodus fest, sobald das Panel zugeschoben ist.
  useEffect(() => {
    if (!drawing && !markieren) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setDrawing(false)
      setMarkieren(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawing, markieren])

  /**
   * Der Seitentitel folgt der Ansicht.
   *
   * Eine Einzelseiten-App behält sonst denselben Titel, egal wo man ist —
   * in der Verlaufsliste und in einer Leiste voller Tabs sind dann alle
   * Einträge gleich, und Lesezeichen tragen den falschen Namen.
   */
  useEffect(() => {
    const titel = {
      karte: 'Karte',
      community: 'Community',
      touren: 'Deine Touren',
      konto: session ? 'Konto' : 'Anmelden',
    }[view]
    document.title = `${titel} - CampBuddy`
  }, [view, session])

  const region = getRegion(regionCode)

  /*
   * Die Kartendaten kommen aus statischen Snapshot-Dateien, nicht mehr aus der
   * Datenbank. Was das ändert, steht ausführlich in `data/snapshot.ts`; kurz:
   * jede Datei trägt einen Inhalts-Hash, liegt danach unbegrenzt im Cache, und
   * ein Wiederbesuch lädt keinen einzigen Byte davon neu.
   *
   * Zonen und Punkte gelten landesweit und kommen in einem Stück. Gipfel und
   * Naturobjekte hängen am Ausschnitt: landesweit wären es einunddreissigtausend
   * Objekte für Ebenen, die erst ab Zoom 9,5 beziehungsweise 12,5 gezeichnet
   * werden.
   */
  const [allZones, setAllZones] = useState<Zone[]>([])
  const [allPoints, setAllPoints] = useState<Point[]>([])
  const [ausschnitt, setAusschnitt] = useState<Ausschnitt | null>(null)
  const [allPeaks, setAllPeaks] = useState<Peak[]>([])
  const [allNature, setAllNature] = useState<NatureFeature[]>([])
  const [datenFehler, setDatenFehler] = useState(false)

  useEffect(() => {
    let aktuell = true
    setAllZones([]); setAllPoints([]); setDatenFehler(false)
    // Zonen sind der Kern: bleiben sie aus, ist die Karte keine Legalitätskarte
    // mehr und muss das sagen, statt leer und zuversichtlich auszusehen.
    ladeZonen(regionCode)
      .then((z) => {
        if (!aktuell) return
        setAllZones(z)
        // Erst jetzt darf der Service Worker seinen Cache füllen: vorher
        // konkurrierte er mit genau diesem Ladevorgang.
        serviceWorkerVorwaermen()
      })
      .catch(() => { if (aktuell) setDatenFehler(true) })
    ladePunkte(regionCode)
      .then((p) => { if (aktuell) setAllPoints(p) })
      .catch(() => {})
    ladeKantone(regionCode).catch(() => {})
    ladeGipfelUebersicht(regionCode)
      .then((g) => { if (aktuell) setAllPeaks((bisher) => (bisher.length > g.length ? bisher : g)) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [regionCode])

  // Neu laden, wenn die Region wechselt oder sich die Anmeldung ändert: nach
  // dem Anmelden kommen die eigenen, privaten Punkte dazu.
  useEffect(() => {
    let aktuell = true
    ladeEigenePunkte(regionCode)
      .then((p) => { if (aktuell) setEigenePunkte(p) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [regionCode, session?.user.id])

  // Nachladen, sobald sich Ausschnitt oder Region ändern — und nur für Ebenen,
  // die überhaupt eingeschaltet sind. Wer kein Wasser sehen will, soll auch
  // keins herunterladen.
  useEffect(() => {
    if (!ausschnitt) return
    let aktuell = true
    // Die Lader liefern null, wenn der Ausschnitt keine neue Kachel berührt —
    // beim blossen Verschieben passiert dann gar nichts. Genau das war vorher
    // das Leck: jede Kartenbewegung ging als frische Abfrage an die Datenbank.
    // Die Zoomschwelle ist kein Feinschliff, sondern der Unterschied zwischen
    // zwei und hundert Kacheln: in der Landesansicht deckt der Ausschnitt fast
    // die ganze Schweiz ab, gezeichnet wird von diesen Ebenen dort aber nichts.
    if (filters.showPeaks && ausschnitt.zoom >= ZOOM_AB.gipfelKacheln) {
      ladeGipfel(regionCode, ausschnitt)
        .then((p) => { if (aktuell && p) setAllPeaks(p) })
        .catch(() => {})
    }
    if ((filters.showWater || filters.showViewpoints) && ausschnitt.zoom >= ZOOM_AB.natur) {
      ladeNatur(regionCode, ausschnitt)
        .then((n) => { if (aktuell && n) setAllNature(n) })
        .catch(() => {})
    }
    return () => { aktuell = false }
  }, [regionCode, ausschnitt, filters.showPeaks, filters.showWater, filters.showViewpoints])

  // Zonen werden nie gefiltert — nur umgefärbt (siehe effectiveStatus).
  const points = useMemo(() => filterPoints(allPoints, filters), [allPoints, filters])
  const nature = useMemo(() => filterNature(allNature, filters), [allNature, filters])
  const sichtbareEigene = useMemo(
    () => (filters.showEigene ? eigenePunkte : []),
    [eigenePunkte, filters.showEigene],
  )
  const stats = useMemo(() => verificationStats(allZones), [allZones])

  /*
   * Die Gemeindeflächen in zwei Auflösungen.
   *
   * Die Übersicht kommt einmal und färbt sofort das ganze Land; die genauen
   * Grenzen kommen kachelweise nach, sobald jemand hineinzoomt. Warum das
   * beides braucht, steht in `data/gemeinden.ts` — kurz: die 2119 Grenzen sind
   * in voller Auflösung der grösste Einzelposten der Anwendung, beim Zeichnen
   * tragen sie aber nur Farbe, und die Frage „in welcher Gemeinde stehe ich"
   * wird erst beim Hineinzoomen gestellt.
   */
  const [gemeindenUebersichtStand, setGemeindenUebersichtStand] = useState(0)
  const [gemeindenDetailStand, setGemeindenDetailStand] = useState(0)

  useEffect(() => {
    let aktuell = true
    ladeGemeindenUebersicht(regionCode)
      .then(() => { if (aktuell) setGemeindenUebersichtStand((n) => n + 1) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [regionCode])

  useEffect(() => {
    // Unterhalb der Umschaltstufe zeichnet die Karte ohnehin die Übersicht;
    // die genauen Flächen dort zu holen hiesse, 617 KB in Scheiben zu laden,
    // um sie nicht anzuzeigen.
    if (!ausschnitt || ausschnitt.zoom < ZOOM_AB.gemeindenGenau) return
    let aktuell = true
    ladeGemeindenDetail(ausschnitt)
      .then((neu) => { if (aktuell && neu) setGemeindenDetailStand((n) => n + 1) })
      .catch(() => {})
    return () => { aktuell = false }
  }, [ausschnitt])

  // Nur neu bauen, wenn tatsächlich andere Flächen vorliegen: zweitausend
  // Polygone bei jedem Rendern durchzurechnen wäre reine Verschwendung.
  const gemeindenFern = useMemo(
    () => gemeindenGeoJSON('uebersicht'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gemeindenUebersichtStand],
  )
  const gemeindenGeo = useMemo(
    () => gemeindenGeoJSON('genau'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gemeindenDetailStand],
  )
  // Die Analyse läuft über alle Punkte, nicht die gefilterten: eine ausgeblendete
  // Hütte ist trotzdem eine Schlafmöglichkeit an der Route.
  // Eine importierte Spur folgt bereits realen Wegen und wird nicht neu geroutet.
  const routeGeometry = useMemo<Position[]>(
    () => gpxTrack ?? routed?.coordinates ?? wegpunktOrte,
    [gpxTrack, routed, wegpunktOrte],
  )

  const analysis = useMemo(
    () => analyseRoute(routeGeometry, allZones, allPoints),
    [routeGeometry, allZones, allPoints],
  )

  // Höhenprofil nachladen, sobald der Streckenverlauf steht. Entprellt, damit
  // beim Setzen mehrerer Wegpunkte nicht jedes Zwischenergebnis abgefragt wird.
  useEffect(() => {
    if (routeGeometry.length < 2) { setProfil([]); setHoehenFehler(null); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setHoehenBusy(true)
      setHoehenFehler(null)
      loadElevationProfile(routeGeometry, controller.signal)
        .then(setProfil)
        .catch((e: unknown) => {
          if ((e as Error).name === 'AbortError') return
          setHoehenFehler((e as Error).message)
          setProfil([])
        })
        .finally(() => setHoehenBusy(false))
    }, 600)
    return () => { clearTimeout(timer); controller.abort() }
  }, [routeGeometry])

  const wanderStats = useMemo(() => analyseProfil(profil), [profil])

  /**
   * Was an einer bestimmten Stelle gilt — feinste zuständige Ebene zuerst.
   *
   * Dieselbe Reihenfolge wie in der Infokarte: Schutzgebiet schlägt Gemeinde,
   * Gemeinde schlägt Kanton, Kanton schlägt den landesweiten Rahmen. Bei
   * überlappenden Schutzgebieten gewinnt das strengste — zwei Flächen
   * übereinander heben einander nicht auf.
   */
  const statusAn = useCallback((position: Position): LegalStatus => {
    let gefunden: LegalStatus | null = null
    for (const zone of allZones) {
      if (!pointInGeometry(position, zone.geometry)) continue
      if (zone.status === 'forbidden') return 'forbidden'
      if (zone.status === 'tolerated' || gefunden === null) gefunden = zone.status
    }
    if (gefunden) return gefunden
    return gemeindeRecht(gemeindeAn(position))?.status
      ?? kantonRecht(kantonAn(position))?.status
      ?? region.legal_framework.baseline_status
  }, [allZones, region])

  /**
   * Alle Orte entlang der Route, an denen die Nacht möglich wäre.
   *
   * Der Etappenvorschlag zog früher ausschliesslich Hütten und Campingplätze
   * heran — in einer App fürs Wildcampen ausgerechnet die zwei Arten, um die
   * es dort am wenigsten geht. Jetzt stehen markierte Schlafplätze
   * gleichberechtigt daneben: eigene und die, die andere geteilt haben. Was
   * davon der Vorschlag nimmt, entscheidet nicht die Art, sondern Entfernung
   * und Rechtslage (siehe `bestesLager` in hiking.ts).
   */
  const schlafmoeglichkeiten = useMemo<Schlafmoeglichkeit[]>(() => {
    if (routeGeometry.length < 2) return []
    const ausPunkten = analysis.nearby.map(({ point }) => ({
      id: `punkt-${point.id}`,
      name: point.name,
      position: [point.lng, point.lat] as Position,
      art: point.type as Schlafmoeglichkeit['art'],
      status: statusAn([point.lng, point.lat]),
    }))
    // Nur ausdrückliche Schlafplätze: eine Aussicht oder eine Wasserstelle ist
    // kein Nachtlager, und sie als eines vorzuschlagen wäre geraten.
    const ausEigenen = eigenePunkte
      .filter((p) => p.typ === 'campspot')
      .map((p) => ({ p, abstand: distanceToLine([p.lng, p.lat], routeGeometry) }))
      .filter(({ abstand }) => abstand <= NEARBY_RADIUS_M)
      .map(({ p }) => ({
        id: `eigen-${p.id}`,
        name: p.name,
        position: [p.lng, p.lat] as Position,
        art: 'eigen' as const,
        status: statusAn([p.lng, p.lat]),
      }))
    return [...ausEigenen, ...ausPunkten]
  }, [analysis.nearby, eigenePunkte, routeGeometry, statusAn])

  const etappen = useMemo(
    () => planeEtappen(profil, schlafmoeglichkeiten),
    [profil, schlafmoeglichkeiten],
  )

  // Wegpunkte auf reale Wege rastern. Entprellt, weil die genutzte
  // OSRM-Instanz von der OSM-Community bereitgestellt wird.
  useEffect(() => {
    if (gpxTrack || waypoints.length < 2) { setRouted(null); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setRoutingBusy(true)
      routeWaypoints(wegpunktOrte, profile, controller.signal)
        .then(setRouted)
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setRouteError((e as Error).message)
        })
        .finally(() => setRoutingBusy(false))
    }, 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [wegpunktOrte, profile, gpxTrack])

  const importGpx = async (file: File) => {
    try {
      const { points } = parseGpx(await file.text())
      setGpxTrack(points)
      setWaypoints([])
      setRouted(null)
      setDrawing(false)
      setRouteError(null)
      // Eine importierte Spur ist keine Änderung an der geladenen Tour mehr.
      setBearbeiteteTour(null)
    } catch (e) {
      setRouteError(`GPX konnte nicht gelesen werden: ${(e as Error).message}`)
    }
  }

  /*
    Nur angemeldet wird zum Speichern eingeladen — sonst wäre der Knopf eine
    Sackgasse.

    Es gibt genau einen Speicherweg. Vorher waren es zwei („Route speichern"
    und „Tour speichern"), die in zwei Tabellen führten und in der Übersicht
    als zwei Listen wieder auftauchten. Gespeichert wird jetzt der Verlauf
    zusammen mit den Eckdaten und den Kennzahlen, die die Auswertung ohnehin
    schon berechnet hat — sonst müsste jede Karte in der Übersicht das
    Höhenprofil neu abfragen.
  */
  const handleSaveTour = session
    ? async (
        name: string,
        trip: TripParams,
        packliste: PackStaende,
        etappen: GespeicherteEtappe[] | null,
      ) => {
        const eck = {
          ...trip,
          distance_m: routeGeometry.length > 1 ? lineLength(routeGeometry) : null,
          ascent_m: wanderStats?.ascent_m ?? null,
          duration_s: wanderStats?.duration_s ?? null,
          // Ein leerer Stand ist keine Angabe — dann bleibt die Spalte leer,
          // statt ein leeres Objekt in jede Zeile zu schreiben.
          packliste: Object.keys(packliste).length > 0 ? packliste : null,
          etappen,
        }
        const wegpunkte = gpxTrack ? [] : wegpunktOrte
        /*
          Gespeichert wird der Kanton, nicht das Land.

          `region` trug bisher immer „CH" - die Region, in der die Karte
          gerade stand. Damit war das Feld in der Community ein Filter über
          genau einen Wert. Der Kanton des Startpunkts ist die Angabe, nach
          der jemand tatsächlich sucht („was gibt es im Wallis"), und die
          Kantonsflächen liegen auf dieser Ansicht ohnehin schon geladen.

          Ausserhalb der Schweiz oder ohne gezeichneten Weg bleibt es beim
          Regionscode: eine erfundene Zuordnung wäre schlechter als eine
          grobe.
        */
        const tourRegion = kantonAn(routeGeometry[0] ?? [0, 0])?.code ?? regionCode
        if (bearbeiteteTour) {
          await aktualisiereTour(bearbeiteteTour.id, {
            name, region: tourRegion, geometry: routeGeometry, waypoints: wegpunkte, ...eck,
          })
          setBearbeiteteTour({ id: bearbeiteteTour.id, name })
        } else {
          await saveTour(name, tourRegion, routeGeometry, wegpunkte, eck)
        }
        // Die Tour liegt jetzt in der Datenbank; der Zwischenspeicher hat
        // seinen Zweck erfüllt und darf nicht beim nächsten Laden wieder
        // dieselbe Route hervorholen.
        entwurfVerwerfen()
        setTourWartet(false)
      }
    : null

  /**
   * Eine gespeicherte oder geteilte Tour auf die Karte holen.
   *
   * Der Sprung auf ihren Ausschnitt gehört dazu: wer in der Community auf eine
   * Tour klickt, hat gerade ihr Vorschaubild gesehen. Landete er danach auf
   * dem zuletzt betrachteten Ausschnitt — womöglich am anderen Ende der Alpen
   * —, müsste er die eben angesehene Tour erst suchen.
   *
   * Der Zähler unterscheidet zwei Klicks auf dieselbe Tour voneinander.
   */
  const [kameraZiel, setKameraZiel] = useState<{ geometry: Position[]; zaehler: number } | null>(null)

  /**
   * Ein von aussen verlinkter Ort — `#/karte/ort/46.2276,7.3589`.
   *
   * So kommen die vorgerenderten Gemeindeseiten (`scripts/gemeindeseiten.mjs`)
   * an die Karte: sie sind statische Dateien ohne Anwendung, und ihr Knopf
   * „Auf der Karte ansehen" wäre ohne das hier eine Landung irgendwo im
   * Wallis. Eine Suchmaschine schickt jemanden auf die Seite einer bestimmten
   * Gemeinde; die Karte muss dann dieselbe Gemeinde zeigen.
   *
   * Die Auflösung geschieht in zwei Schritten, und das ist keine Umständlich-
   * keit, sondern die Folge des Kachelladens: `gemeindeAn` kann erst
   * antworten, wenn die genauen Flächen für diesen Ausschnitt da sind. Also
   * erst die Kamera hinschicken, und die Auskunft aufschlagen, sobald die
   * Kacheln nachgekommen sind.
   */
  /**
   * Läuft gerade ein Tourabruf?
   *
   * Sitzt hier und nicht in den einzelnen Panels, weil der Vorgang die Ansicht
   * wechselt: er beginnt in der Liste und endet auf der Karte. Eine Anzeige,
   * die im Panel steht, verschwindet mitten im Warten mit dem Panel.
   */
  const [tourLaedt, setTourLaedt] = useState(false)

  /**
   * Einen Tourabruf mit Anzeige umschliessen.
   *
   * `finally`, damit ein Fehler die Anzeige nicht stehen lässt — ein Schleier,
   * der nicht mehr weggeht, ist schlimmer als gar keiner: er sperrt die
   * Bedienung, und man kommt nur noch mit Neuladen heraus.
   */
  const beimLaden = async <T,>(vorgang: () => Promise<T>): Promise<T> => {
    setTourLaedt(true)
    try {
      return await vorgang()
    } finally {
      setTourLaedt(false)
    }
  }

  const [verlinkterOrt, setVerlinkterOrt] = useState<Position | null>(ortAusAdresse)

  useEffect(() => {
    if (!verlinkterOrt) return
    /*
     * Ein Fenster um den Punkt, kein Punkt.
     *
     * Die Kamera rechnet ihren Anflug aus einem umschliessenden Rechteck. Bei
     * einem einzelnen Punkt ist das Rechteck flächenlos, und die Rechnung
     * liefert keine endliche Zoomstufe — die Karte bleibt dann wortlos stehen,
     * wo sie war. Zwei gegenüberliegende Ecken in rund zwei Kilometern Abstand
     * ergeben einen gültigen Rahmen und landen auf Gemeindegrösse.
     */
    const [lng, lat] = verlinkterOrt
    const d = 0.02
    setKameraZiel((z) => ({
      geometry: [[lng - d, lat - d], [lng + d, lat + d]],
      zaehler: (z?.zaehler ?? 0) + 1,
    }))
    // Die Adresse wieder aufräumen: sonst springt ein Neuladen nach dem
    // Weiterscrollen zurück an den verlinkten Ort, und die Zurück-Taste
    // führte in eine Schleife.
    history.replaceState(null, '', `${location.pathname}${location.search}#/karte`)
  }, [verlinkterOrt])

  useEffect(() => {
    if (!verlinkterOrt) return
    const gemeinde = gemeindeAn(verlinkterOrt)
    // Noch keine Fläche unter dem Punkt: die Kacheln sind unterwegs, der
    // nächste Stand löst es aus. Aufgegeben wird nicht — bleibt es leer,
    // bleibt eben die Karte stehen, wo sie hingeflogen ist.
    if (!gemeinde) return
    const kanton = kantonAn(verlinkterOrt)
    setSelection({
      kind: 'region', region, stats, datenFehler,
      kanton,
      kantonRecht: kantonRecht(kanton),
      kantonGrundlagen: kantonGrundlagen(kanton),
      gemeinde,
      gemeindeRecht: gemeindeRecht(gemeinde),
    })
    setVerlinkterOrt(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gemeindenDetailStand, verlinkterOrt])

  /**
   * Von der Karte in die Community mitgenommener Ort.
   *
   * Wer auf eine Huette tippt und dort „Alle Touren hier" waehlt, sucht nicht
   * nach einem Namen, sondern nach einer Stelle. Der Filter lebt deshalb hier
   * und nicht im Community-Panel: er entsteht auf der Karte.
   */
  const [ortsfilter, setOrtsfilter] = useState<Ortsfilter | null>(null)

  const tourenBeiOrt = (name: string, position: Position) => {
    setOrtsfilter({ name, position, umkreisM: ORT_UMKREIS_M })
    setSelection(null)
    setView('community')
  }

  const routeLaden = (
    geometry: Position[],
    wps: Position[],
    /** Gehört der Verlauf einer eigenen Tour, die jetzt geändert werden soll? */
    bearbeiten?: { id: string; name: string },
  ) => {
    setGpxTrack(geometry)
    setWaypoints(wps.map((position) => ({ position })))
    setRouted(null)
    setView('karte')
    setRouteOpen(true)
    setBearbeiteteTour(bearbeiten ?? null)
    // Beim Bearbeiten geht die Auswertung gleich auf: dort stehen Nachtlager,
    // Ausrüstung und der Knopf, mit dem die Änderung in die Tour zurückgeht.
    setAuswertungOffen(bearbeiten != null)
    if (geometry.length > 0) {
      setKameraZiel((z) => ({ geometry, zaehler: (z?.zaehler ?? 0) + 1 }))
    }
  }

  /**
   * Eine eigene Tour zum Ändern auf die Karte holen.
   *
   * Der Verlauf wird nachgeladen: die Tourenliste kennt seit Migration 0024
   * nur die ausgedünnte Vorschau, und wer eine Tour *bearbeitet*, bekäme
   * sonst eine Route, die schon beim Öffnen ihre Kehren verloren hat.
   */
  const tourBearbeiten = async (tour: Tour) => {
    const verlauf = await beimLaden(() => ladeEigenenVerlauf(tour.id))
    routeLaden(
      (verlauf.geometry?.coordinates ?? []) as Position[],
      (verlauf.waypoints ?? []) as Position[],
      { id: tour.id, name: tour.name },
    )
  }

  const clearRoute = () => {
    setWaypoints([]); setGpxTrack(null); setRouted(null); setRouteError(null)
    setBearbeiteteTour(null)
  }

  /**
   * Eine über die Anmeldung gerettete Tour zurückholen.
   *
   * Läuft genau einmal beim Start und nur, wenn tatsächlich etwas hinterlegt
   * ist. Die gerouteten Stützpunkte stehen nicht im Entwurf — sie entstehen
   * aus den Stopps von selbst neu, sobald das Routing angelaufen ist. Nur eine
   * importierte Spur kommt vollständig zurück, weil sie sich aus nichts
   * berechnen lässt.
   *
   * Die Auswertung geht gleich wieder auf: dort ist der Nutzer stehen
   * geblieben, als er auf „Speichern" getippt hat.
   */
  const wiederhergestellt = useRef(false)
  useEffect(() => {
    /*
      Genau einmal, und der Merker steht davor.

      `entwurfAbholen` liest und löscht in einem Zug — beim zweiten Aufruf ist
      nichts mehr da. React ruft Effekte im Entwicklungsmodus aber absichtlich
      doppelt auf, und der zweite Lauf hielt das leere Ergebnis für „es wartet
      keine Tour" und nahm die Zusage im Kontobereich wieder weg.
    */
    if (wiederhergestellt.current) return
    wiederhergestellt.current = true

    const gerettet = entwurfAbholen()
    if (!gerettet) { setTourWartet(false); return }
    // Der Zwischenspeicher ist verbraucht, die Absicht nicht: diese Tour will
    // immer noch gespeichert werden. Deshalb bleibt der Merker stehen — er
    // entscheidet weiter unten, wohin die Anmeldung führt, und trägt im
    // Kontobereich die Zusage, dass nichts verloren ist.
    setTourWartet(true)
    setEntwurf(gerettet)
    setRegionCode(gerettet.region)
    setWaypoints(gerettet.waypoints ?? [])
    setGpxTrack(gerettet.gpxTrack)
    setRouteOpen(true)
    setAuswertungOffen(true)
    const spur = gerettet.gpxTrack ?? (gerettet.waypoints ?? []).map((w) => w.position)
    if (spur.length > 0) setKameraZiel((z) => ({ geometry: spur, zaehler: (z?.zaehler ?? 0) + 1 }))
  }, [])

  /**
   * Wohin nach einer Anmeldung.
   *
   * Zwei Ziele, und die Reihenfolge ist keine Geschmacksfrage: wer auf
   * „Speichern" getippt hat, kam wegen dieser einen Tour hierher — er landet
   * wieder in ihrer Auswertung, wo der Speicherknopf steht. „Deine Touren"
   * wäre dort das falsche Ziel: die Tour ist ja noch nicht gespeichert und
   * stünde nicht in der Liste. Alle anderen landen in „Deine Touren" — dem
   * einzigen Ort, der ohne Konto nichts zu zeigen hat und mit Konto alles.
   *
   * Erkannt wird die frische Anmeldung daran, dass die Sitzung *nach* dem
   * Bereitsein eintrifft. Beim Seitenaufbau kommen beide zusammen; ohne diese
   * Unterscheidung würde jeder Neuaufbau mit bestehender Sitzung den Nutzer
   * ungefragt in „Deine Touren" werfen — auch wenn er gerade die Karte
   * geöffnet hat.
   *
   * Die Rückkehr von einem Bestätigungslink zählt bewusst nicht dazu: dort
   * steht eine Meldung im Kontobereich, die gelesen werden soll.
   */
  const hatteSession = useRef(session != null)
  const warBereit = useRef(false)
  const weitergeleitet = useRef(false)
  useEffect(() => {
    const jetzt = session != null
    const vorherSession = hatteSession.current
    const vorherBereit = warBereit.current
    hatteSession.current = jetzt
    warBereit.current = ready

    // Abgemeldet heisst: die nächste Anmeldung darf wieder weiterleiten.
    if (!jetzt) { weitergeleitet.current = false; return }
    if (weitergeleitet.current) return

    /*
      Zwei Wege führen zu einer frischen Anmeldung, und beide müssen sich vom
      blossen Seitenaufbau mit bestehender Sitzung unterscheiden lassen:

      - im selben Dokument (Passwort, Anbieter): die Sitzung trifft *nach* dem
        Bereitsein ein. Beim Seitenaufbau kommen beide zusammen.
      - über einen Bestätigungslink: dort lädt die Seite neu, die Sitzung ist
        also sofort da — erkennbar ist er am ausgewerteten Link.

      Ein abgelaufener Link und ein Passwort-Neusetzen zählen ausdrücklich
      nicht dazu: beide verlangen noch etwas vom Nutzer, und zwar im
      Kontobereich.
    */
    const imDokument = !vorherSession && vorherBereit
    const ueberLink = linkErgebnis?.art === 'bestaetigt'
    if (!imDokument && !ueberLink) return
    weitergeleitet.current = true

    if (tourWartet) {
      // Der Zwischenspeicher war für einen Seitenneuaufbau gedacht, und der
      // ist ausgeblieben — die Tour liegt unverändert im Arbeitsspeicher.
      entwurfVerwerfen()
      setTourWartet(false)
      setView('karte')
      setRouteOpen(true)
      setAuswertungOffen(true)
      return
    }
    setView('touren')
  }, [session, ready, tourWartet, linkErgebnis])

  /**
   * Wer die Anmeldung abbricht, lässt keinen Zwischenspeicher zurück.
   *
   * Sonst entstünde ein Gespenst: der Entwurf ist eine Momentaufnahme vom
   * Klick auf „Speichern". Wer danach zur Karte zurückgeht und weiterzeichnet,
   * bekäme bei einem späteren Neuaufbau die ältere Fassung zurück — und zwar
   * über die neuere hinweg. Im Arbeitsspeicher ist die Tour ohnehin noch da,
   * solange die Seite steht; der Zwischenspeicher ist nur für den Weg durch
   * einen Bestätigungslink gedacht, und den verlässt man hier gerade.
   *
   * Nur *verlassen* zählt: eine gerade wiederhergestellte Tour wartet
   * weiterhin auf ihren Speicherknopf, obwohl ihr Besitzer den Kontobereich
   * noch gar nicht gesehen hat.
   */
  const warImKonto = useRef(false)
  useEffect(() => {
    if (view === 'konto') { warImKonto.current = true; return }
    if (!warImKonto.current || session || !tourWartet) return
    entwurfVerwerfen()
    setTourWartet(false)
  }, [view, session, tourWartet])

  /**
   * Ohne Konto führt „Speichern" zur Anmeldung — mit der Tour im Gepäck.
   *
   * Beim blossen Wechsel in den Kontobereich bliebe sie ohnehin erhalten, weil
   * die Karte montiert bleibt. Der Bestätigungslink aus der E-Mail lädt die
   * Seite aber neu, und dann ist nur noch da, was vorher weggeschrieben wurde.
   */
  const zurAnmeldung = (teil: {
    name: string
    trip: TripParams | null
    packliste: PackStaende
    etappen: GespeicherteEtappe[] | null
  }) => {
    entwurfSichern({
      region: regionCode,
      waypoints: gpxTrack ? [] : waypoints,
      gpxTrack,
      ...teil,
    })
    setTourWartet(true)
    setAuswertungOffen(false)
    setView('konto')
  }

  /**
   * Route öffnen heisst zeichnen.
   *
   * Vorher musste man das Panel öffnen *und* dann noch „Route zeichnen"
   * drücken — ein Schritt, den niemand freiwillig macht und der auf jede
   * Rückfrage „warum passiert nichts, wenn ich klicke?" hinauslief. Wer das
   * Panel öffnet, will zeichnen; abschalten lässt es sich weiterhin.
   */
  const routeOeffnen = () => {
    setRouteOpen(true)
    setDrawing(true)
    setMarkieren(false)
  }

  // Zeichnen und Markieren schliessen einander aus: beide belegen den
  // Kartenklick, und ein Klick mit zwei Bedeutungen ist keiner.
  const markierenUmschalten = () => {
    setMarkieren((m) => {
      if (!m) setDrawing(false)
      return !m
    })
  }

  /**
   * Einen Ort aus der Auswertung in die Route übernehmen.
   *
   * Einsortiert statt angehängt: eine Hütte auf halber Strecke ist eine
   * Station, nicht das neue Ziel. Eine importierte GPX-Spur verträgt sich
   * nicht mit gesetzten Stopps — dieselbe Regel wie beim Zeichnen auf der
   * Karte, deshalb tritt sie hier zurück.
   */
  const alsStopp = (position: Position, ort: { name: string; art: WegpunktArt }) => {
    const stelle = einfuegeStelle(position, routeGeometry, wegpunktOrte)
    setGpxTrack(null)
    setWaypoints((w) => {
      const kopie = [...w]
      kopie.splice(stelle, 0, { position, ort })
      return kopie
    })
    setRouteOpen(true)
  }

  const punktGespeichert = (punkt: EigenerPunkt) => {
    setEigenePunkte((liste) => {
      const ohne = liste.filter((p) => p.id !== punkt.id)
      return [punkt, ...ohne]
    })
    setSelection({ kind: 'eigen', punkt })
  }

  const punktEntfernen = async (punkt: EigenerPunkt) => {
    try {
      await punktLoeschen(punkt)
      setEigenePunkte((liste) => liste.filter((p) => p.id !== punkt.id))
      setSelection(null)
    } catch (e) {
      setRouteError((e as Error).message)
    }
  }

  return (
    /*
      `overflow-hidden` ist hier kein Zierrat: die Kartenansicht darf unter
      keinen Umständen die Seite scrollen lassen. Panels über der Karte legen
      sich darüber und scrollen innen; wenn eines doch zu gross gerät, wird es
      beschnitten statt die ganze Seite zu verschieben. Die Vollseiten-Ansichten
      (Touren, Community, Konto) bringen ihr eigenes `overflow-y-auto` mit.
    */
    <div className="flex h-dvh flex-col overflow-hidden bg-flaeche-1 text-ink-100">
      {/*
        Enger auf dem Telefon: dort teilen sich Logo, Haftungshinweis und Herz
        eine Zeile von 375 px, und jede der drei 16-px-Lücken ging vom
        Hinweistext ab — er brach als „…keine Rechtsg…" um.
      */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-kante bg-flaeche-2 px-3 sm:gap-4 sm:px-4">
        {/*
          Wortmarke: das Zelt als Form, nicht als Emoji — und zugleich der Weg
          zurück zur Startseite.

          Sie zeigte vorher auf `./`, was die Anwendung neu lud und, weil der
          Besuchsmerker gesetzt ist, wieder auf der Karte landete: ein Klick,
          der sichtbar nichts tat ausser zu warten. `#/start` erzwingt die
          Startseite ohne Neuladen (siehe `Root.tsx`) — dort steht, was das
          Projekt ist, wie weit es ist und wo die Gemeindeliste liegt.
        */}
        <a
          href="#/start"
          title="Zur Startseite"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="CampBuddy, zur Startseite"
        >
          <Marke className="h-7 w-7 shrink-0" />
          <span className="hidden text-ueberschrift font-semibold tracking-tight text-ink-50 sm:block">
            CampBuddy
          </span>
        </a>

        {/*
          Der Haftungshinweis steht neben dem Logo, nicht als eigenes Band
          darunter — siehe `components/Disclaimer.tsx`. `min-w-0` ist nötig,
          damit er auf schmalen Bildschirmen kürzt statt die Kopfzeile zu
          sprengen.
        */}
        <Haftungshinweis className="min-w-0 shrink" />

        {/* Ab Tablet in der Kopfzeile; auf dem Telefon liegt die Navigation
            unten in Daumenreichweite (siehe Tableiste am Seitenende). */}
        <nav className={`hidden sm:block ${mehrereRegionen ? 'mx-auto' : 'ml-auto'}`} aria-label="Ansicht">
          <Segmente
            ariaLabel="Ansicht wählen"
            wert={view}
            onWaehlen={setView}
            optionen={[
              { wert: 'karte' as View, label: 'Karte', icon: Map },
              { wert: 'community' as View, label: 'Community', icon: Compass },
              { wert: 'touren' as View, label: 'Deine Touren', icon: Bookmark },
              ...(isSupabaseConfigured
                ? [{ wert: 'konto' as View, label: session ? 'Konto' : 'Anmelden', icon: session ? UserRound : LogIn }]
                : []),
            ]}
          />
        </nav>

        {/*
          Der Weg zur Gemeindeliste — bewusst neben der Ansichtswahl und nicht
          darin.

          Die vier Segmente schalten die Ansicht um; dieser Link verlässt die
          Anwendung und lädt eine vorgerenderte Seite. Ihn als fünftes Segment
          einzureihen hiesse, zwei verschiedene Dinge gleich aussehen zu lassen:
          drei Segmente kommen zurück, wenn man sie wieder antippt, dieses eine
          nicht.

          Er steht trotzdem hier oben, weil es einen zweiten Weg zur selben
          Auskunft gibt: manche wissen den Namen ihrer Gemeinde und wollen ihn
          eintippen, statt auf einer Karte danach zu suchen. Auf dem Telefon
          liegt er unten in der Leiste, wo auch die Ansichten liegen.
        */}
        <a
          href={`${import.meta.env.BASE_URL}gemeinden`}
          title="Alle eingestuften Gemeinden als Liste, mit Suche"
          className="hidden shrink-0 items-center gap-1.5 rounded-mittel px-2.5 py-1.5 text-klein
                     text-ink-400 transition-colors duration-[160ms] hover:bg-flaeche-3
                     hover:text-ink-100 sm:flex"
        >
          <List size={15} strokeWidth={1.75} aria-hidden />
          Gemeinden
        </a>

        {/*
          Die Regionswahl erscheint erst, wenn es etwas zu wählen gibt. Bei
          einer einzigen Region war sie ein Aufklappmenü mit genau einem
          Eintrag — belegter Platz ohne Nutzen, und der Name der Region steht
          ohnehin in der Infokarte. Sobald die zweite Region dazukommt, ist sie
          von selbst wieder da.
        */}
        {mehrereRegionen && (
          <label className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <span className="sr-only">Region</span>
            <Auswahl
              value={regionCode}
              onChange={(e) => { setRegionCode(e.target.value); setSelection(null) }}
              className="w-auto"
            >
              {Object.values(REGIONS).map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </Auswahl>
          </label>
        )}

        {/*
          Ganz rechts, absichtlich leise: ein Herz, ab Laptop mit Wort. Auf dem
          Telefon holt es sich den freien Platz selbst — dort ist die Navigation
          unten, die Kopfzeile also leer. Steht die Regionswahl daneben, hat die
          den Rand schon gesetzt; zwei `ml-auto` würden den Platz unter sich
          aufteilen und die Wahl in die Mitte schieben.
        */}
        <UnterstuetzenKnopf className={mehrereRegionen ? '' : 'ml-auto sm:ml-0'} />
      </header>


      {/*
        Beide Ansichten bleiben montiert und werden nur ein-/ausgeblendet.
        Würde die Karte beim Wechsel abgebaut, ginge bei jeder Rückkehr die
        Kartenposition verloren und alle Kacheln müssten neu geladen werden.
      */}
      <div className={view === 'karte' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          counts={{ zones: allZones.length, points: allPoints.length }}
        />
        {/*
          Die beiden Klassen sagen den Kartenbedienelementen, wie viel Rand
          gerade von einem Panel belegt ist (siehe `.karte` in index.css).
          Ohne sie liegen Massstab, Zoomstufen und Herkunftsangabe unter dem
          Routenpanel beziehungsweise der Infokarte.
        */}
        <main
          className={`karte relative flex-1
                      ${routeOpen ? 'karte-panel-links' : ''}
                      ${selection ? 'karte-panel-rechts' : ''}
                      ${routeOpen && (drawing || markieren) ? 'karte-leiste-unten' : ''}`}
        >
          {/*
            Schwebt über der Karte, blockiert nichts: wer einen weiteren Stopp
            setzen will, während noch gerechnet wird, soll das können.
          */}
          {routingBusy && <Ladehinweis text="Weg wird berechnet …" />}

          <MapView
            region={region}
            zones={allZones}
            points={points}
            peaks={filters.showPeaks ? allPeaks : []}
            nature={nature}
            eigene={sichtbareEigene}
            gemeinden={gemeindenGeo}
            gemeindenFern={gemeindenFern}
            activity={filters.activity}
            basemap={basemap}
            visible={view === 'karte'}
            route={routeGeometry}
            waypoints={gpxTrack ? [] : wegpunktOrte}
            waypointLabels={gpxTrack ? [] : wegpunktBeschriftungen}
            kameraZiel={kameraZiel}
            drawing={drawing}
            markieren={markieren}
            onZoneClick={(zone) => setSelection({ kind: 'zone', zone })}
            onPointClick={(point) => setSelection({ kind: 'point', point })}
            onNatureClick={(feature) => setSelection({ kind: 'natur', feature })}
            onPeakClick={(peak) => setSelection({ kind: 'peak', peak })}
            onEigenClick={(punkt) => setSelection({ kind: 'eigen', punkt })}
            onLeerClick={(position) => {
              // Wer an dieser Stelle zuständig ist, entscheidet die Auskunft —
              // ausserhalb der Schutzgebiete regeln Kanton und Gemeinde.
              const kanton = kantonAn(position)
              const gemeinde = gemeindeAn(position)
              setSelection({
                kind: 'region', region, stats, datenFehler,
                kanton,
                kantonRecht: kantonRecht(kanton),
                kantonGrundlagen: kantonGrundlagen(kanton),
                gemeinde,
                gemeindeRecht: gemeindeRecht(gemeinde),
              })
            }}
            onAusschnitt={setAusschnitt}
            onMarkieren={(position) => {
              setDialogPunkt(null)
              setDialogPosition(position)
              setMarkieren(false)
            }}
            onAddWaypoint={(position, ort) => {
              // Ein neuer Klick beginnt eine gezeichnete Route; eine importierte
              // Spur würde sonst stillschweigend mit Wegpunkten vermischt.
              setGpxTrack(null)
              setWaypoints((w) => [...w, { position, ort }])
            }}
            onInsertWaypoint={(index, position) =>
              setWaypoints((w) => {
                const kopie = [...w]
                kopie.splice(index, 0, { position })
                return kopie
              })
            }
            onMoveWaypoint={(index, position) =>
              // Verschoben heisst: nicht mehr an dem Symbol, das den Namen gab.
              setWaypoints((w) => w.map((p, i) => (i === index ? { position } : p)))
            }
            onRemoveWaypoint={(index) => setWaypoints((w) => w.filter((_, i) => i !== index))}
          />
          {routeOpen ? (
            <RoutePanel
              /*
                Auf dem Telefon sind Routenpanel und Infokarte beide Blätter
                von unten. Standen beide offen, lagen sie deckungsgleich
                übereinander und man bediente blind das obere. Solange etwas
                ausgewählt ist, tritt das Routenpanel dort zurück; es bleibt
                offen und kommt beim Schliessen der Infokarte wieder.
              */
              verdeckt={selection != null}
              /*
                Wer auf dem Telefon zeichnet oder markiert, braucht die Karte —
                das Blatt tritt so lange ganz zurück und die `ZeichenLeiste`
                unten übernimmt. „Fertig" holt es zurück.
              */
              aufKarte={drawing || markieren}
              route={routeGeometry}
              waypoints={gpxTrack ? [] : waypoints}
              waypointCount={gpxTrack ? 0 : waypoints.length}
              onRemoveWaypoint={(index) => setWaypoints((w) => w.filter((_, i) => i !== index))}
              onMoveWaypointTo={(von, nach) => setWaypoints((w) => verschieben(w, von, nach))}
              onReverseWaypoints={() => setWaypoints((w) => umkehren(w))}
              onRenameWaypoint={(index, name) =>
                setWaypoints((w) => w.map((p, i) => (i === index ? { ...p, name: name.trim() || undefined } : p)))
              }
              routed={routed}
              routingBusy={routingBusy}
              stats={wanderStats}
              hoehenBusy={hoehenBusy}
              profile={profile}
              isImported={gpxTrack != null}
              drawing={drawing}
              error={routeError}
              onProfileChange={setProfile}
              onToggleDrawing={() => setDrawing((d) => !d)}
              onUndo={() => setWaypoints((w) => w.slice(0, -1))}
              onClear={clearRoute}
              onImportGpx={importGpx}
              onAuswerten={() => { setDrawing(false); setMarkieren(false); setAuswertungOffen(true) }}
              onClose={() => { setRouteOpen(false); setDrawing(false); setMarkieren(false) }}
              markieren={markieren}
              onToggleMarkieren={session ? markierenUmschalten : null}
            />
          ) : (
            <>
              {/* Die eine primäre Aktion der Kartenansicht — deshalb gefüllt
                  und als einziges Element hier in Akzentfarbe. */}
              <Button
                variante="primaer"
                groesse="gross"
                icon={Route}
                onClick={routeOeffnen}
                className="absolute bottom-4 left-4 z-10 shadow-[var(--shadow-3)]"
              >
                Route planen
              </Button>
            </>
          )}
          {routeOpen && (drawing || markieren) && (
            <ZeichenLeiste
              modus={markieren ? 'markieren' : 'zeichnen'}
              stopps={gpxTrack ? 0 : waypoints.length}
              hatRoute={routeGeometry.length > 0}
              onUndo={() => setWaypoints((w) => w.slice(0, -1))}
              onClear={clearRoute}
              onFertig={() => { setMarkieren(false); setDrawing(false) }}
            />
          )}
          <Kartenebenen
            region={regionCode}
            basemap={basemap}
            onBasemapChange={setBasemap}
            activity={filters.activity}
          />
          <InfoPanel
            selection={selection}
            onClose={() => setSelection(null)}
            onOpenPlanner={() => { setSelection(null); setView('touren') }}
            nutzerId={session?.user.id}
            onPunktBearbeiten={(punkt) => { setDialogPosition(null); setDialogPunkt(punkt) }}
            onPunktLoeschen={(punkt) => void punktEntfernen(punkt)}
            onTourOeffnen={(tour) => {
              setSelection(null)
              // Erst hier den echten Weg holen — die Liste im Infofenster
              // trägt nur die Vorschau.
              void beimLaden(() => ladeVerlauf(tour.id)).then((verlauf) => routeLaden(
                ((verlauf.geometry ?? tour.vorschau)?.coordinates ?? []) as Position[],
                (verlauf.waypoints ?? []) as Position[],
              ))
            }}
            onAlleTouren={tourenBeiOrt}
            onAlsWegpunkt={(position, ort) => {
              // Eine importierte Spur und gesetzte Wegpunkte vertragen sich
              // nicht — dieselbe Regel wie beim Zeichnen auf der Karte.
              setGpxTrack(null)
              setWaypoints((w) => [...w, { position, ort }])
              setDrawing(true)
              setRouteOpen(true)
              setSelection(null)
            }}
            zeichnetGerade={drawing || waypoints.length > 0}
          />
        </main>
      </div>

      {/*
        Eine geladene Route wird als fertige Spur übernommen und nicht neu
        geroutet — sie folgt bereits realen Wegen.
      */}

      {/*
        Anders als die Karte wird diese Ansicht beim Verlassen abgebaut — wie
        die Community daneben.

        Sie hing vorher als verstecktes `hidden` in der Seite und lud genau
        einmal, beim ersten Öffnen. Wer danach eine Tour speicherte, sie teilte
        oder auf einem anderen Gerät etwas änderte, sah hier weiter den alten
        Stand, bis er die Seite neu lud. Ein Aufbau kostet eine Abfrage; ein
        falscher Stand kostet Vertrauen.
      */}
      {view === 'touren' && (
        <main className="flex-1 overflow-y-auto">
          <MyToursPanel
            session={session}
            onLoadRoute={routeLaden}
            onLadenWechsel={setTourLaedt}
            onAnmelden={() => setView('konto')}
            onZurKarte={() => setView('karte')}
            onBearbeiten={tourBearbeiten}
          />
        </main>
      )}

      {view === 'community' && (
        <main className="flex-1 overflow-y-auto">
          <CommunityPanel
            session={session}
            onLoadRoute={routeLaden}
            onLadenWechsel={setTourLaedt}
            ort={ortsfilter}
            onOrtLoesen={() => setOrtsfilter(null)}
          />
        </main>
      )}

      {view === 'konto' && (
        <main className="flex-1 overflow-y-auto">
          <AccountPanel
            session={session}
            tourWartet={tourWartet}
            onZuTouren={() => setView('touren')}
            linkErgebnis={linkErgebnis}
            onLinkErgebnisGelesen={() => setLinkErgebnis(null)}
          />
        </main>
      )}

      {/* Mobile Navigation: unten, Daumenreichweite, immer sichtbar. */}
      <nav
        aria-label="Ansicht"
        className="flex shrink-0 border-t border-kante bg-flaeche-2 sm:hidden"
      >
        {([
          ['karte', 'Karte', Map],
          ['community', 'Community', Compass],
          ['touren', 'Touren', Bookmark],
          ...(isSupabaseConfigured
            ? [['konto', session ? 'Konto' : 'Anmelden', session ? UserRound : LogIn] as const]
            : []),
        ] as const).map(([key, label, Icon]) => {
          const aktiv = view === key
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-current={aktiv ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-mikro font-medium
                          normal-case tracking-normal transition-colors duration-[160ms]
                          ${aktiv ? 'text-gletscher-300' : 'text-ink-400 hover:text-ink-200'}`}
            >
              <Icon size={19} strokeWidth={aktiv ? 2.25 : 1.75} aria-hidden />
              {label}
            </button>
          )
        })}

        {/*
          Dieselbe Überlegung wie oben in der Kopfzeile, nur enger: hier ist er
          ein Link zwischen Knöpfen. Er trägt deshalb nie den aktiven Zustand —
          man ist nie „auf" ihm, man geht darüber weg.
        */}
        <a
          href={`${import.meta.env.BASE_URL}gemeinden`}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-mikro font-medium
                     normal-case tracking-normal text-ink-400 transition-colors
                     duration-[160ms] hover:text-ink-200"
        >
          <List size={19} strokeWidth={1.75} aria-hidden />
          Gemeinden
        </a>
      </nav>

      {/*
        Steht über allem, weil es dazwischenkommt — der Moment direkt nach der
        Bestätigung ist der einzige, in dem diese Frage niemanden unterbricht.
        `kontoProfil != null` ist wichtig: ein fehlgeschlagener Lesevorgang darf
        nicht als „heisst noch wanderer-…" durchgehen (siehe `ladeProfil`).
      */}
      <BenutzernameDialog
        offen={session != null && brauchtNamenswahl(kontoProfil) && !namenSpaeter}
        bisher={kontoProfil?.anzeigename ?? null}
        onSpaeter={() => setNamenSpaeter(true)}
        onGespeichert={(name) => setKontoProfil((p) => (p ? { ...p, anzeigename: name } : p))}
      />

      <PunktDialog
        offen={dialogPosition != null || dialogPunkt != null}
        region={regionCode}
        position={dialogPosition}
        punkt={dialogPunkt}
        onClose={() => { setDialogPosition(null); setDialogPunkt(null) }}
        onGespeichert={punktGespeichert}
      />

      <TourDetailModal
        /*
          Der Schlüssel wechselt, sobald eine gerettete Tour zurückkommt. Ohne
          ihn behielte das Fenster seine bereits angelegten Zustände — Name,
          Etappen und Packliste stünden dann leer da, obwohl sie im Entwurf
          liegen.
        */
        key={entwurf ? entwurf.gespeichert : bearbeiteteTour?.id ?? 'neu'}
        offen={auswertungOffen}
        onClose={() => setAuswertungOffen(false)}
        region={region}
        route={routeGeometry}
        analysis={analysis}
        stats={wanderStats}
        profil={profil}
        etappen={etappen}
        hoehenBusy={hoehenBusy}
        hoehenFehler={hoehenFehler}
        wegpunkte={gpxTrack ? [] : waypoints}
        points={allPoints}
        peaks={allPeaks}
        schlafmoeglichkeiten={schlafmoeglichkeiten}
        statusAn={statusAn}
        onAlsStopp={gpxTrack ? null : alsStopp}
        onSaveTour={handleSaveTour}
        bearbeitet={bearbeiteteTour}
        onAnmelden={zurAnmeldung}
        entwurf={entwurf
          ? {
              name: entwurf.name,
              trip: entwurf.trip,
              packliste: entwurf.packliste,
              etappen: entwurf.etappen,
            }
          : undefined}
      />

      {/*
        Ganz aussen und ohne Bedingung an die Ansicht: der Vorgang beginnt in
        einer Liste und endet auf der Karte, der Schleier muss beide überdauern.
      */}
      {tourLaedt && <Ladeschleier text="Tour wird geladen …" />}
    </div>
  )
}
