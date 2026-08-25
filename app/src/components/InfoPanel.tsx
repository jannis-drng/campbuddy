/**
 * Die Infokarte — das Herz der Kartenansicht.
 *
 * Reihenfolge bewusst: erst der Status als grösstes Element, dann was konkret
 * gilt, dann unter welchen Bedingungen, dann woher die Angabe stammt und wie
 * gut sie belegt ist. Die Quelle steht unten, aber sie steht immer da.
 */
import { useEffect, useState } from 'react'
import {
  Building2, Camera, ChevronRight, Droplet, Eye, ExternalLink, FileWarning, Flame, Globe, Landmark,
  Lock, Mail, MapPin, Mountain, Phone, Pencil, Scale, ScrollText, Star, Tent, Trash2, Truck, Users,
  Footprints, Route as RouteIcon, Waves, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  EigenerPunkt, Gemeinde, GemeindeRecht, Kanton, KantonRecht, NatureFeature, Peak, Point, Region,
  WegpunktArt, Zone,
} from '../data/types'
import type { Position } from '../data/geo'
import type { PublicTour } from '../services/supabase'
import { listTourenBei, ORT_UMKREIS_M } from '../services/community'
import { formatKm, hatWeg, seitdem } from './TourKarte'
import { RoutenVorschau } from './RoutenVorschau'
import { Badge, Button, Hinweis, IconButton, Label } from '../ui'
import { PermissionRow, ReviewBadge, STATUS_LABEL, StatusBadge } from './ui'
import { GearHint } from '../affiliate/GearHint'
import { PunktFoto } from './PunktFoto'

export type Selection =
  /**
   * Der Rechtsrahmen der Region. Erscheint beim Tippen auf freie Fläche —
   * dort, wo keine eingezeichnete Zone liegt und deshalb der allgemeine
   * Rahmen gilt. Genau die Stelle, an der man sich die Frage stellt.
   */
  | {
      kind: 'region'
      region: Region
      stats: { total: number; entwurf: number }
      datenFehler: boolean
      /** Wer an der angetippten Stelle zuständig ist — null ausserhalb der Schweiz. */
      kanton: Kanton | null
      /** Dessen recherchierte Regelung — null heisst „noch nicht recherchiert". */
      kantonRecht: KantonRecht | null
      /** Belegte Erlasse des Kantons, aus den BAFU-Daten abgeleitet. */
      kantonGrundlagen: { grundlagen: { text: string; zonen: number }[]; quelle: string; stand: string } | null
      /** Die Gemeinde an dieser Stelle — die Ebene, die tatsächlich entscheidet. */
      gemeinde: Gemeinde | null
      /** Deren recherchierte Regelung — null heisst „noch nicht recherchiert". */
      gemeindeRecht: GemeindeRecht | null
    }
  | { kind: 'zone'; zone: Zone }
  | { kind: 'point'; point: Point }
  | { kind: 'natur'; feature: NatureFeature }
  | { kind: 'eigen'; punkt: EigenerPunkt }
  | { kind: 'peak'; peak: Peak }
  | null

const NATUR_ART: Record<NatureFeature['type'], { label: string; icon: LucideIcon }> = {
  lake: { label: 'Gewässer', icon: Waves },
  spring: { label: 'Quelle', icon: Droplet },
  drinking_water: { label: 'Trinkwasser', icon: Droplet },
  waterfall: { label: 'Wasserfall', icon: Waves },
  viewpoint: { label: 'Aussichtspunkt', icon: Eye },
}

const EIGEN_ART: Record<EigenerPunkt['typ'], { label: string; icon: LucideIcon }> = {
  viewpoint: { label: 'Aussichtspunkt', icon: Eye },
  campspot: { label: 'Schlafplatz', icon: Tent },
  water: { label: 'Wasserstelle', icon: Droplet },
  foto: { label: 'Foto', icon: Camera },
  sonstiges: { label: 'Markierung', icon: Star },
}

const PUNKT_ART: Record<Point['type'], { label: string; icon: LucideIcon }> = {
  hut: { label: 'Berghütte', icon: Building2 },
  campsite: { label: 'Campingplatz', icon: Tent },
  vehicle_spot: { label: 'Stellplatz', icon: Truck },
}

/**
 * Wo liegt das Angetippte? Nur Punkte haben einen Ort, an dem eine Tour
 * vorbeikommen kann — eine Zone ist eine Fläche, und der Rechtsrahmen einer
 * Region gar kein Ort.
 */
function ortDerAuswahl(
  selection: NonNullable<Selection>,
): { name: string; position: Position; art: WegpunktArt } | null {
  switch (selection.kind) {
    case 'point':
      return {
        name: selection.point.name,
        position: [selection.point.lng, selection.point.lat],
        art: selection.point.type,
      }
    case 'natur':
      return {
        name: selection.feature.name,
        position: [selection.feature.lng, selection.feature.lat],
        art: selection.feature.type === 'viewpoint' ? 'aussicht' : 'wasser',
      }
    case 'eigen':
      return {
        name: selection.punkt.name,
        position: [selection.punkt.lng, selection.punkt.lat],
        art: 'eigen',
      }
    case 'peak':
      return { name: selection.peak.name, position: [selection.peak.lng, selection.peak.lat], art: 'peak' }
    default:
      return null
  }
}

interface InfoPanelProps {
  selection: Selection
  onClose: () => void
  onOpenPlanner: () => void
  /** Wer gerade angemeldet ist — entscheidet, ob eine Markierung bearbeitbar ist. */
  nutzerId?: string | null
  onPunktBearbeiten?: (punkt: EigenerPunkt) => void
  onPunktLoeschen?: (punkt: EigenerPunkt) => void
  /** Lädt eine geteilte Tour auf die Karte. */
  onTourOeffnen?: (tour: PublicTour) => void
  /** Wechselt in die Community und sucht dort ab diesem Ort. */
  onAlleTouren?: (name: string, position: Position) => void
  /**
   * Haengt diesen Ort als Wegpunkt an die Route und schaltet das Zeichnen ein.
   * Der zweite Weg zu derselben Sache: auf der Karte geht es durch Antippen im
   * Zeichenmodus, hier ohne ihn vorher einschalten zu muessen.
   */
  onAlsWegpunkt?: (position: Position, ort: { name: string; art: WegpunktArt }) => void
  /** Steht die Route schon offen? Entscheidet nur ueber die Beschriftung. */
  zeichnetGerade?: boolean
}

function kopfDaten(selection: NonNullable<Selection>): { art: string; icon: LucideIcon; titel: string } {
  switch (selection.kind) {
    case 'region':
      return selection.kanton
        ? { art: 'Rechtslage · zuständig', icon: Scale, titel: selection.kanton.name }
        : { art: 'Rechtslage', icon: Scale, titel: selection.region.name }
    case 'zone':
      return { art: 'Zone', icon: MapPin, titel: selection.zone.name }
    case 'point':
      return {
        art: PUNKT_ART[selection.point.type].label,
        icon: PUNKT_ART[selection.point.type].icon,
        titel: selection.point.name,
      }
    case 'natur':
      return {
        art: NATUR_ART[selection.feature.type].label,
        icon: NATUR_ART[selection.feature.type].icon,
        titel: selection.feature.name,
      }
    case 'eigen':
      return {
        art: `Eigene Markierung · ${EIGEN_ART[selection.punkt.typ].label}`,
        icon: EIGEN_ART[selection.punkt.typ].icon,
        titel: selection.punkt.name,
      }
    case 'peak':
      return { art: `Gipfel · ${selection.peak.elevation} m`, icon: Mountain, titel: selection.peak.name }
  }
}

export function InfoPanel({
  selection, onClose, onOpenPlanner, nutzerId, onPunktBearbeiten, onPunktLoeschen,
  onTourOeffnen, onAlleTouren, onAlsWegpunkt, zeichnetGerade,
}: InfoPanelProps) {
  if (!selection) return null

  const kopf = kopfDaten(selection)
  const KopfIcon = kopf.icon
  const ort = ortDerAuswahl(selection)

  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[72vh] flex-col rounded-t-riesig border
                 border-kante bg-flaeche-2/97 shadow-[var(--shadow-4)] backdrop-blur-md
                 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-gross"
      aria-label="Details"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-kante px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-mikro font-medium uppercase text-ink-500">
            <KopfIcon size={12} strokeWidth={2} aria-hidden />
            {kopf.art}
          </p>
          <h2 className="mt-1 text-titel font-semibold leading-tight text-ink-50">{kopf.titel}</h2>
        </div>
        <IconButton icon={X} label="Schliessen" onClick={onClose} className="-mr-1.5 -mt-1" />
      </header>

      {/*
        Der schnellste Weg von „was ist das?" zu „da will ich hin": direkt
        unter dem Namen, nicht unten nach allem anderen.
      */}
      {ort && onAlsWegpunkt && (
        <div className="shrink-0 border-b border-kante px-5 py-3">
          <Button
            variante="sekundaer" breit icon={Footprints}
            onClick={() => onAlsWegpunkt(ort.position, { name: ort.name, art: ort.art })}
          >
            {zeichnetGerade ? 'An die Route anhängen' : 'Route hier beginnen'}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selection.kind === 'region' && (
          <RegionBody
            region={selection.region}
            stats={selection.stats}
            datenFehler={selection.datenFehler}
            kanton={selection.kanton}
            recht={selection.kantonRecht}
            grundlagen={selection.kantonGrundlagen}
            gemeinde={selection.gemeinde}
            gemeindeRecht={selection.gemeindeRecht}
          />
        )}
        {selection.kind === 'zone' && <ZoneBody zone={selection.zone} onOpenPlanner={onOpenPlanner} />}
        {selection.kind === 'point' && <PointBody point={selection.point} />}
        {selection.kind === 'natur' && <NaturBody feature={selection.feature} />}
        {selection.kind === 'eigen' && (
          <EigenBody
            punkt={selection.punkt}
            darfBearbeiten={Boolean(nutzerId) && selection.punkt.user_id === nutzerId}
            onBearbeiten={onPunktBearbeiten}
            onLoeschen={onPunktLoeschen}
          />
        )}
        {selection.kind === 'peak' && <PeakBody peak={selection.peak} />}

        {/*
          Zuletzt: was der Ort für die Planung hergibt. Die Auskunft über den
          Ort selbst steht darüber — sie ist der Grund, warum jemand getippt hat.
        */}
        {ort && (
          <TourenHier ort={ort} onTourOeffnen={onTourOeffnen} onAlleTouren={onAlleTouren} />
        )}
      </div>
    </aside>
  )
}

/**
 * Der allgemeine Rechtsrahmen der Region.
 *
 * Er stand früher als Dauerpanel über der Karte. Das war die falsche Stelle:
 * er beantwortet keine Frage, solange man nicht auf eine bestimmte Fläche
 * schaut, und verdeckte dabei ausgerechnet die Karte. Jetzt erscheint er beim
 * Tippen auf eine Stelle *ohne* eingezeichnete Zone — also genau dann, wenn
 * der allgemeine Rahmen die einzige Auskunft ist, die es gibt.
 */
function RegionBody({
  region, stats, datenFehler, kanton, recht, grundlagen, gemeinde, gemeindeRecht,
}: {
  region: Region
  stats: { total: number; entwurf: number }
  datenFehler: boolean
  kanton: Kanton | null
  recht: KantonRecht | null
  grundlagen: { grundlagen: { text: string; zonen: number }[]; quelle: string; stand: string } | null
  gemeinde: Gemeinde | null
  gemeindeRecht: GemeindeRecht | null
}) {
  const [quellenOffen, setQuellenOffen] = useState(false)

  return (
    <div className="space-y-5 px-5 py-4">
      {/*
        Die wichtigste einzelne Aussage — deshalb zuerst und als eigene Fläche.
        Die Reihenfolge ist die der Zuständigkeit: was die Gemeinde geregelt
        hat, schlägt die kantonale Auskunft, und beide schlagen den landesweiten
        Rahmen. Nur wenn nichts davon recherchiert ist, bleibt der Rahmen übrig —
        und dann steht auch dabei, dass er die Auskunft nicht ersetzt.
      */}
      <div className="rounded-mittel border border-kante bg-flaeche-1 px-3 py-2.5">
        <Label>
          {gemeinde ? `Hier entscheidet ${gemeinde.name}` : 'Hier ist keine Fläche eingezeichnet, es gilt'}
        </Label>
        <p className="mt-1 text-titel font-semibold text-ink-50">
          {STATUS_LABEL[
            gemeindeRecht?.status ?? recht?.status ?? region.legal_framework.baseline_status
          ]}
        </p>
        {gemeinde && (
          <p className="mt-0.5 text-mikro normal-case tracking-normal text-ink-500">
            Gemeinde {gemeinde.name}
            {gemeinde.bfs && ` · BFS ${gemeinde.bfs}`}
            {kanton && ` · Kanton ${kanton.name}`}
          </p>
        )}
      </div>

      {/*
        Die kommunale Ebene ist die, auf der die Frage tatsächlich entschieden
        wird: Polizeireglement, Nutzungsplanung, ein Verbot am Seeufer. Zwei
        Nachbargemeinden im selben Kanton können es gegensätzlich halten.
      */}
      {gemeinde && gemeindeRecht && (
        <section>
          <Label className="mb-1">Was in {gemeinde.name} gilt</Label>
          <PermissionRow label="Zelt / Biwak" value={gemeindeRecht.tent_allowed} icon={Tent} />
          <PermissionRow label="Auto / Camper" value={gemeindeRecht.vehicle_allowed} icon={Truck} />
          <PermissionRow label="Offenes Feuer" value={gemeindeRecht.fire_allowed} icon={Flame} />
          <p className="mt-2.5 text-klein leading-relaxed text-ink-300">{gemeindeRecht.summary}</p>
          {gemeindeRecht.conditions && (
            <p className="mt-1.5 text-klein leading-relaxed text-ink-400">{gemeindeRecht.conditions}</p>
          )}
          <div className="mt-2.5">
            <ReviewBadge status={gemeindeRecht.review_status} lastVerified={gemeindeRecht.last_verified} />
          </div>
          {gemeindeRecht.source_url && (
            <a
              href={gemeindeRecht.source_url} target="_blank" rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 text-klein text-gletscher-400
                         transition-colors duration-[160ms] hover:text-gletscher-300"
            >
              {gemeindeRecht.source} <ExternalLink size={11} strokeWidth={2.5} aria-hidden />
            </a>
          )}
        </section>
      )}

      {/*
        Ungeprüfte Gemeinde. Hier eine Farbe zu raten wäre das Schlimmste, was
        diese Karte tun könnte — also sagt sie es offen und gibt stattdessen
        das Einzige mit, was hier wirklich weiterhilft: den Weg zur Gemeinde.
      */}
      {gemeinde && (!gemeindeRecht || gemeindeRecht.status === 'unknown') && (
        <Hinweis ton="warnung" icon={Landmark}>
          <strong className="font-semibold">
            {gemeindeRecht
              ? `Für ${gemeinde.name} ist die Frage nur teilweise geklärt.`
              : `Für ${gemeinde.name} liegt kein Reglement vor.`}
          </strong>{' '}
          {gemeindeRecht
            ? 'Das gefundene Reglement regelt nur einen Teil — was oben steht, ist alles, was es hergibt.'
            : 'Über das Übernachten im Freien entscheidet hier die Gemeinde — was unten steht, ist der übergeordnete Rahmen und ersetzt ihre Auskunft nicht.'}
          {' '}Am schnellsten kommst du weiter, indem du direkt dort nachfragst.
          {(gemeinde.website || gemeinde.email) && (
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {gemeinde.website && (
                <a
                  href={gemeinde.website} target="_blank" rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-medium text-gletscher-400
                             transition-colors duration-[160ms] hover:text-gletscher-300"
                >
                  <Globe size={11} strokeWidth={2.5} aria-hidden /> Gemeindewebseite
                </a>
              )}
              {gemeinde.email && (
                <a
                  href={`mailto:${gemeinde.email}`}
                  className="inline-flex items-center gap-1 font-medium text-gletscher-400
                             transition-colors duration-[160ms] hover:text-gletscher-300"
                >
                  <Mail size={11} strokeWidth={2.5} aria-hidden /> {gemeinde.email}
                </a>
              )}
            </span>
          )}
        </Hinweis>
      )}

      {/*
        Ausserhalb der Schutzgebiete regeln Kanton und Gemeinde — und die tun
        das sehr unterschiedlich. Wenn die Karte dazu nichts weiss, sagt sie
        genau das, statt eine landesweite Faustregel als kantonale Auskunft
        auszugeben.
      */}
      {kanton && !recht && !gemeinde && (
        <Hinweis ton="warnung" icon={Scale}>
          <strong className="font-semibold">Für diesen Kanton liegt keine eigene Regelung vor.</strong>{' '}
          Zuständig ist hier {kanton.name}
          {kanton.code && ` (${kanton.code})`}, dazu die Gemeinde. Was unten steht, ist der
          landesweite Rahmen — er ersetzt die kantonale Auskunft nicht. Erkundige dich vor
          Ort oder beim Kanton.
        </Hinweis>
      )}

      {kanton && recht && (
        <section>
          <Label className="mb-1">Was in {kanton.name} gilt</Label>
          <PermissionRow label="Zelt / Biwak" value={recht.tent_allowed} icon={Tent} />
          <PermissionRow label="Auto / Camper" value={recht.vehicle_allowed} icon={Truck} />
          <PermissionRow label="Offenes Feuer" value={recht.fire_allowed} icon={Flame} />
          <p className="mt-2.5 text-klein leading-relaxed text-ink-300">{recht.summary}</p>
          {recht.conditions && (
            <p className="mt-1.5 text-klein leading-relaxed text-ink-400">{recht.conditions}</p>
          )}
          <div className="mt-2.5">
            <ReviewBadge status={recht.review_status} lastVerified={recht.last_verified} />
          </div>
          {recht.source_url && (
            <a
              href={recht.source_url} target="_blank" rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-1 text-klein text-gletscher-400
                         transition-colors duration-[160ms] hover:text-gletscher-300"
            >
              {recht.source} <ExternalLink size={11} strokeWidth={2.5} aria-hidden />
            </a>
          )}
        </section>
      )}

      {/*
        Kein Ersatz für die kantonale Auskunft, aber der Faden, an dem sie
        anfängt: welches Recht in diesem Kanton den Wildschutz regelt, steht in
        den amtlichen Daten selbst — jede Wildruhezone nennt ihre Grundlage.
      */}
      {kanton && grundlagen && (
        <section>
          <Label className="mb-1.5">Erlasse in {kanton.name}</Label>
          <ul className="space-y-1.5">
            {grundlagen.grundlagen.slice(0, 6).map((g) => (
              <li key={g.text} className="flex items-start gap-2 text-klein leading-snug text-ink-300">
                <ScrollText size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-500" aria-hidden />
                <span className="min-w-0">
                  {g.text}
                  <span className="text-ink-500"> · {g.zonen} {g.zonen === 1 ? 'Zone' : 'Zonen'}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
            Rechtsgrundlagen der Wildruhezonen in diesem Kanton, aus {grundlagen.quelle}
            {' '}(Stand {grundlagen.stand}). Sie sagen, welches Recht hier den Wildschutz
            regelt — nicht, ob und wo gezeltet werden darf.
          </p>
        </section>
      )}

      <div>
        <Label className="mb-1.5">Landesweiter Rahmen</Label>
        <p className="text-klein leading-relaxed text-ink-300">{region.legal_framework.summary}</p>
      </div>

      <div>
        <button
          onClick={() => setQuellenOffen((v) => !v)}
          aria-expanded={quellenOffen}
          className="flex items-center gap-1 text-klein font-medium text-gletscher-400
                     transition-colors duration-[160ms] hover:text-gletscher-300"
        >
          <ChevronRight
            size={14} strokeWidth={2.5} aria-hidden
            className={`transition-transform duration-[160ms] ease-[var(--ease-heraus)] ${quellenOffen ? 'rotate-90' : ''}`}
          />
          Rechtsgrundlagen &amp; Quellen
        </button>
        {quellenOffen && (
          <ul className="mt-2 space-y-2 pl-5">
            {region.legal_framework.references.map((r) => (
              <li key={r.url}>
                <a
                  href={r.url} target="_blank" rel="noreferrer noopener"
                  className="group flex items-start gap-1.5 text-klein leading-snug text-ink-400
                             transition-colors duration-[160ms] hover:text-gletscher-300"
                >
                  <span className="min-w-0">{r.label}</span>
                  <ExternalLink size={12} strokeWidth={2} aria-hidden
                                className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        Wenn die Zonendatei nicht ankommt, sieht die Karte aus wie eine Karte
        ohne Schutzgebiete — also wie „hier gilt nichts". Das ist die eine
        Verwechslung, die diese Anwendung sich nicht leisten darf, und deshalb
        steht sie hier ausdrücklich da, statt sich hinter einer leeren Fläche
        zu verstecken.
      */}
      {datenFehler ? (
        <Hinweis ton="warnung" icon={FileWarning}>
          <strong className="font-semibold">Die Schutzgebiete konnten nicht geladen werden.</strong>{' '}
          Was du siehst, ist deshalb unvollständig — eine leere Fläche heisst hier
          nicht, dass dort nichts gilt. Lade die Seite neu, sobald du wieder Netz hast.
        </Hinweis>
      ) : (
        <Hinweis ton="warnung" icon={FileWarning}>
          Von {stats.total} Schutzgebieten auf dieser Karte sind{' '}
          <strong className="font-semibold">{stats.entwurf} nicht amtlich belegt</strong> — sie
          tragen einen gestrichelten Rand.
        </Hinweis>
      )}

      <p className="rounded-mittel border border-geduldet-500/20 bg-geduldet-500/[0.07] px-3 py-2.5
                    text-mikro normal-case leading-relaxed tracking-normal text-geduldet-400/90">
        Orientierungshilfe, keine Rechtsgarantie. Beschilderung vor Ort und Auskünfte von
        Gemeinde oder Wildhut gehen dieser Angabe vor.
      </p>
    </div>
  )
}

function ZoneBody({ zone, onOpenPlanner }: { zone: Zone; onOpenPlanner: () => void }) {
  return (
    <div className="space-y-5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={zone.status} />
        <ReviewBadge status={zone.review_status} lastVerified={zone.last_verified} />
      </div>

      <section>
        <Label className="mb-1">Was gilt hier</Label>
        <PermissionRow label="Zelt / Biwak" value={zone.tent_allowed} icon={Tent} />
        <PermissionRow label="Auto / Camper" value={zone.vehicle_allowed} icon={Truck} />
        <PermissionRow label="Offenes Feuer" value={zone.fire_allowed} icon={Flame} />
      </section>

      {zone.conditions && (
        <section>
          <Label className="mb-1.5">Bedingungen</Label>
          <p className="text-klein leading-relaxed text-ink-300">{zone.conditions}</p>
        </section>
      )}

      {zone.notes && (
        <section>
          <Label className="mb-1.5">Hinweise</Label>
          <p className="text-klein leading-relaxed text-ink-400">{zone.notes}</p>
        </section>
      )}

      <GearHint status={zone.status} onOpenPlanner={onOpenPlanner} />

      <QuellenBlock
        source={zone.source}
        url={zone.source_url}
        lastVerified={zone.last_verified}
        nurGeometrie
      />

      <p className="rounded-mittel border border-geduldet-500/20 bg-geduldet-500/[0.07] px-3 py-2.5
                    text-mikro normal-case leading-relaxed tracking-normal text-geduldet-400/90">
        Orientierungshilfe, keine Rechtsgarantie. Beschilderung vor Ort und Auskünfte von
        Gemeinde oder Wildhut gehen dieser Angabe vor.
      </p>
    </div>
  )
}

function PointBody({ point }: { point: Point }) {
  const zeilen = ([
    ['Betreiber', point.info.operator, Building2],
    ['Kapazität', point.info.capacity, Users],
    ['Öffnung', point.info.opening_hours ?? point.info.seasonal, null],
    ['Telefon', point.info.phone, Phone],
    ['Höhe', point.elevation ? `${point.elevation} m` : null, Mountain],
  ] as [string, string | null | undefined, LucideIcon | null][]).filter(([, v]) => v)

  /**
   * Die Telefonnummer einer Hütte ist der Grund, warum sie hier steht: man
   * will anrufen und fragen, ob ein Platz frei ist. Auf dem Telefon eine
   * Nummer zum Abtippen zu zeigen, ist eine verpasste Gelegenheit.
   */
  const waehlbar = (wert: string) => wert.replace(/[^\d+]/g, '')

  return (
    <div className="space-y-5 px-5 py-4">
      {zeilen.length > 0 ? (
        <section>
          {zeilen.map(([label, wert, Icon]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-kante py-2.5 last:border-0">
              <span className="flex items-center gap-2 text-fliess text-ink-400">
                {Icon && <Icon size={15} strokeWidth={1.75} className="text-ink-500" aria-hidden />}
                {label}
              </span>
              {label === 'Telefon' ? (
                <a
                  href={`tel:${waehlbar(String(wert))}`}
                  className="text-right text-fliess font-medium text-gletscher-400
                             transition-colors duration-[160ms] hover:text-gletscher-300"
                >
                  {wert}
                </a>
              ) : (
                <span className="text-right text-fliess font-medium text-ink-100">{wert}</span>
              )}
            </div>
          ))}
        </section>
      ) : (
        <p className="text-klein leading-relaxed text-ink-400">
          Zu diesem Punkt liegen ausser Name und Lage noch keine Angaben vor.
        </p>
      )}

      {point.info.website && (
        <Button
          variante="sekundaer"
          icon={ExternalLink}
          onClick={() => window.open(point.info.website!, '_blank', 'noopener,noreferrer')}
        >
          Website öffnen
        </Button>
      )}

      <p className="font-mono text-mikro normal-case tracking-normal text-ink-500">
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </p>

      <QuellenBlock source={point.source} url={point.source_url} lastVerified={point.last_verified} />
    </div>
  )
}

/**
 * Natur-Objekte aus OpenStreetMap.
 *
 * Kurz gehalten — und mit einem Satz, der wichtiger ist als alles andere auf
 * dieser Karte: eine Trinkwasser-Markierung in OSM ist die Angabe eines
 * Mappers, keine Laboranalyse. Wer danach seine Flasche füllt, soll das
 * wissen.
 */
function NaturBody({ feature }: { feature: NatureFeature }) {
  const trinkbar = feature.type === 'drinking_water' || feature.type === 'spring'
  return (
    <div className="space-y-5 px-5 py-4">
      {!feature.benannt && (
        <p className="text-klein leading-relaxed text-ink-400">
          In OpenStreetMap ohne Namen erfasst — angezeigt wird die Gattung.
        </p>
      )}

      {feature.elevation != null && (
        <div className="flex items-center justify-between gap-3 border-b border-kante py-2.5">
          <span className="flex items-center gap-2 text-fliess text-ink-400">
            <Mountain size={15} strokeWidth={1.75} className="text-ink-500" aria-hidden />
            Höhe
          </span>
          <span className="text-fliess font-medium text-ink-100">{feature.elevation} m</span>
        </div>
      )}

      {trinkbar && (
        <Hinweis ton="warnung" icon={Droplet}>
          <strong className="font-semibold">Keine Trinkwasserprüfung.</strong> Die Markierung
          stammt aus OpenStreetMap und sagt nur, dass dort jemand eine Wasserstelle eingetragen
          hat. Ob sie fliesst, gefasst oder trinkbar ist, entscheidet sich vor Ort.
        </Hinweis>
      )}

      <p className="font-mono text-mikro normal-case tracking-normal text-ink-500">
        {feature.lat.toFixed(5)}, {feature.lng.toFixed(5)}
      </p>

      <QuellenBlock source="OpenStreetMap" url={feature.source_url} lastVerified={null} />
    </div>
  )
}

/**
 * Eine selbst gesetzte Markierung.
 *
 * Der erste sichtbare Hinweis sagt, was sie ist: eine persönliche Notiz. Das
 * ist keine Förmlichkeit — die ganze Karte lebt davon, dass geprüfte Auskunft
 * und private Meinung nie gleich aussehen.
 */
function EigenBody({
  punkt, darfBearbeiten, onBearbeiten, onLoeschen,
}: {
  punkt: EigenerPunkt
  darfBearbeiten: boolean
  onBearbeiten?: (p: EigenerPunkt) => void
  onLoeschen?: (p: EigenerPunkt) => void
}) {
  return (
    <div className="space-y-5 px-5 py-4">
      {punkt.foto_pfad && <PunktFoto pfad={punkt.foto_pfad} alt={punkt.name} />}

      <div className="flex flex-wrap items-center gap-2">
        <Badge ton="akzent" icon={EIGEN_ART[punkt.typ].icon}>{EIGEN_ART[punkt.typ].label}</Badge>
        <Badge icon={punkt.ist_oeffentlich ? Globe : Lock}>
          {punkt.ist_oeffentlich ? 'Öffentlich' : 'Privat'}
        </Badge>
      </div>

      {punkt.notiz && (
        <section>
          <Label className="mb-1.5">Notiz</Label>
          <p className="whitespace-pre-line text-klein leading-relaxed text-ink-300">{punkt.notiz}</p>
        </section>
      )}

      <p className="font-mono text-mikro normal-case tracking-normal text-ink-500">
        {punkt.lat.toFixed(5)}, {punkt.lng.toFixed(5)}
      </p>

      {darfBearbeiten && (
        <div className="flex gap-2">
          <Button variante="sekundaer" icon={Pencil} onClick={() => onBearbeiten?.(punkt)} className="flex-1">
            Bearbeiten
          </Button>
          <Button variante="gefahr" icon={Trash2} onClick={() => onLoeschen?.(punkt)}>
            Löschen
          </Button>
        </div>
      )}

      <p className="rounded-mittel border border-kante bg-flaeche-1 px-3 py-2.5 text-mikro
                    normal-case leading-relaxed tracking-normal text-ink-400">
        Eigene Markierung — keine geprüfte Angabe und keine Aussage über die Rechtslage.
        Was an dieser Stelle rechtlich gilt, steht in der Zone darunter.
      </p>
    </div>
  )
}

/** Quelle + Stand bei jeder Angabe [FUNDAMENT] — Abschnitt 9. */
function QuellenBlock({
  source, url, lastVerified, nurGeometrie = false,
}: { source: string | null; url: string | null; lastVerified: string | null; nurGeometrie?: boolean }) {
  return (
    <section className="rounded-mittel border border-kante bg-flaeche-1 px-3 py-2.5">
      <Label className="mb-1.5">Quelle &amp; Stand</Label>
      <p className="text-mikro normal-case leading-relaxed tracking-normal text-ink-400">
        {nurGeometrie ? 'Geometrie: ' : 'Daten: '}
        {source ?? 'keine Angabe'}
        {url && (
          <>
            {' · '}
            <a
              href={url} target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-gletscher-400 transition-colors
                         duration-[160ms] hover:text-gletscher-300"
            >
              Original <ExternalLink size={10} strokeWidth={2.5} aria-hidden />
            </a>
          </>
        )}
      </p>
      {nurGeometrie && (
        <p className="mt-1 text-mikro normal-case leading-relaxed tracking-normal text-ink-500">
          Die Geometrie stammt aus offenen Kartendaten; die rechtliche Einstufung wird
          separat gepflegt und belegt.
        </p>
      )}
      <p className="mt-1 text-mikro normal-case tracking-normal text-ink-500">
        {lastVerified ? `Zuletzt geprüft: ${lastVerified}` : 'Vor Ort noch nicht nachgeprüft'}
      </p>
    </section>
  )
}

/* ---------------------------------------------------------------- */
/* Touren, die hier vorbeikommen                                      */
/* ---------------------------------------------------------------- */

/**
 * Wer auf eine Hütte, einen Gipfel oder eine Quelle tippt, will oft nicht die
 * Rechtslage wissen, sondern: geht da jemand lang?
 *
 * Geladen wird erst, wenn ein Ort ausgewählt ist, und höchstens vier Einträge —
 * das hier ist ein Fingerzeig in die Community, keine zweite Übersicht. Wer
 * mehr sehen will, geht über den Knopf darunter dorthin.
 */
function TourenHier({
  ort, onTourOeffnen, onAlleTouren,
}: {
  ort: { name: string; position: Position }
  onTourOeffnen?: (tour: PublicTour) => void
  onAlleTouren?: (name: string, position: Position) => void
}) {
  const [touren, setTouren] = useState<PublicTour[] | null>(null)
  const [fehler, setFehler] = useState(false)

  const [lon, lat] = ort.position
  useEffect(() => {
    let abgemeldet = false
    setTouren(null); setFehler(false)
    listTourenBei([lon, lat], ORT_UMKREIS_M, 4)
      .then((t) => { if (!abgemeldet) setTouren(t) })
      .catch(() => { if (!abgemeldet) { setFehler(true); setTouren([]) } })
    return () => { abgemeldet = true }
  }, [lon, lat])

  // Solange nichts da ist, nimmt der Abschnitt auch keinen Platz weg: eine
  // Überschrift über einer leeren Liste sieht aus wie ein Fehler.
  if (fehler) return null
  if (touren !== null && touren.length === 0) return null

  return (
    <section className="border-t border-kante px-5 py-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-mikro font-medium uppercase text-ink-500">
          <RouteIcon size={12} strokeWidth={2} aria-hidden />
          Touren hier vorbei
        </h3>
        <span className="text-mikro normal-case tracking-normal text-ink-600">
          {ORT_UMKREIS_M / 1000} km Umkreis
        </span>
      </div>

      {touren === null ? (
        <div className="space-y-1.5" aria-label="Touren werden gesucht">
          {[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-mittel bg-flaeche-1" />)}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {touren.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onTourOeffnen?.(t)}
                disabled={!hatWeg(t) || !onTourOeffnen}
                className="flex w-full items-center gap-2.5 rounded-mittel bg-flaeche-1 p-2 text-left transition-colors duration-[160ms] hover:bg-flaeche-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RoutenVorschau
                  geometry={(t.geometry?.coordinates ?? []) as Position[]}
                  breite={160} hoehe={100} rund="alle" linie={2}
                  className="w-16 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-klein font-medium text-ink-100">{t.name}</span>
                  <span className="block truncate text-mikro normal-case tracking-normal text-ink-500">
                    {t.autor ?? 'gelöschtes Konto'}
                    {t.distance_m != null && ` · ${formatKm(t.distance_m)}`}
                    {` · ${seitdem(t.veroeffentlicht_am ?? t.created_at)}`}
                  </span>
                </span>
                <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-ink-600" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {onAlleTouren && touren !== null && (
        <Button
          variante="sekundaer" breit className="mt-2.5"
          onClick={() => onAlleTouren(ort.name, ort.position)}
        >
          Alle Touren bei {ort.name}
        </Button>
      )}
    </section>
  )
}

/**
 * Ein Gipfel. Wenig zu sagen — Höhe und Herkunft —, aber der Klick lohnt sich
 * trotzdem: darunter steht, wer hier vorbeigeht.
 */
function PeakBody({ peak }: { peak: Peak }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-baseline gap-2">
        <span className="text-display font-semibold text-ink-50">{peak.elevation}</span>
        <span className="text-fliess text-ink-400">m ü. M.</span>
      </div>
      <p className="text-klein leading-relaxed text-ink-400">
        Gipfel aus OpenStreetMap. Ob in der Nähe übernachtet werden darf, sagt die
        Legalitäts-Ebene — ein Gipfel ist keine Erlaubnis.
      </p>
      {peak.source_url && (
        <a
          href={peak.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-klein text-gletscher-400 underline underline-offset-2 hover:text-gletscher-300"
        >
          Bei OpenStreetMap ansehen
          <ExternalLink size={12} strokeWidth={2} aria-hidden />
        </a>
      )}
    </div>
  )
}
