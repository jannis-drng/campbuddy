# CampBuddy — Legalitätskarte fürs Wildcampen

Zeigt auf einer Karte, wo Übernachten in der Natur **erlaubt, verboten oder geduldet** ist —
mit Quelle und Prüfstand zu jeder Fläche.

**Live:** https://jannis-drng.github.io/campbuddy/

> Orientierungshilfe, keine Rechtsgarantie. Die rechtliche Einstufung ist derzeit ein
> **unverifizierter Entwurf** aus dem allgemeinen Rechtsrahmen — noch keine Fläche ist
> amtlich geprüft. Die App weist das an jeder Zone offen aus.

Vollständige Produktspezifikation: [Freistehen_Spezifikation.md](./Freistehen_Spezifikation.md)

## Stand

**`[JETZT]` (Abschnitt 3) — fertig:** eine Region (Wallis, CH-VS), eine Kartenansicht,
Zonen + Punkte, Infokarten, Filter, Haftungshinweis.

**`[BALD]` — umgesetzt:** Ausrüstungs- und Verpflegungs-Generator (4.3) und Wetter (4.5)
in der Ansicht „Tour planen". Aus Startdatum, Dauer, Personenzahl, Schlafhöhe und
Übernachtungsart entsteht eine Packliste samt Verpflegungsmenge; die Wettervorhersage
für den Reisezeitraum bestimmt dabei Schlafsack und Kleidung.

**`[BALD]` — umgesetzt:** Route + Legalitäts-Ebene (4.2). Route auf der Karte zeichnen
oder als GPX aus einem beliebigen Tourenplaner importieren; CampBuddy wertet aus, welche
Zonen sie durchquert, wie viel der Strecke in Verbotsgebieten liegt und welche Hütten und
Campingplätze in Routennähe liegen. Export als GPX.

**`[BALD]` — umgesetzt:** Konto und Speichern (4.6) über Supabase, siehe unten.

**`[BALD]` — offen:** weitere Regionen (braucht Rechtsrecherche, nicht Code).

| Ebene | Inhalt (Schweiz) | Quelle |
|---|---|---|
| Zonen | **1836** Flächen — 1172 mit amtlicher Quelle belegt, 562 abgeleitet, 102 ungeklärt, 0 vor Ort geprüft | BAFU-Bundesinventare + OpenStreetMap |
| Kantone | 26 Flächen für die Zuständigkeit ausserhalb der Schutzgebiete | OpenStreetMap; Rechtspflege offen |
| Punkte | 955 (318 Hütten, 438 Campingplätze, 199 Stellplätze) | OpenStreetMap |
| Gipfel | 7274 benannte Gipfel mit Höhe | OpenStreetMap |
| Natur | 23 753: 15 009 Trinkwasser, 4351 Aussichtspunkte, 2339 Seen, 1489 Wasserfälle, 565 Quellen | OpenStreetMap |
| Natur | 1830 Objekte: 297 Gewässer, 957 Trinkwasserstellen, 37 Quellen, 106 Wasserfälle, 433 Aussichtspunkte | OpenStreetMap |
| Eigene Punkte | selbst markierte Orte und Fotos | Nutzer, privat bis ausdrücklich veröffentlicht |

## Hintergrundkarten

Wählbar direkt auf der Karte. Voreinstellung ist **Outdoor**, weil Höhenlinien,
Wanderwege und Gipfel für dieses Projekt wichtiger sind als Strassennamen.

| Karte | Quelle | Hinweis |
|---|---|---|
| Outdoor | [OpenTopoMap](https://opentopomap.org/) | Höhenlinien, Wege, Gipfel, Hütten. Ehrenamtliches Projekt — bei stark steigender Nutzung gehört ein eigener Kachelserver her |
| Landeskarte | [swisstopo](https://www.swisstopo.admin.ch/) | amtliche Schweizer Karte, nur für CH-Regionen |
| Standard | [OpenFreeMap](https://openfreemap.org/) | Strassenkarte |

Reine Rasterkarten bringen keine Schriftquelle mit. Ohne den `glyphs`-Eintrag in
`mapConfig.ts` blieben alle Zonen-, Punkt- und Gipfelnamen unsichtbar.

## Architektur

Die drei Schichten aus Abschnitt 6 der Spezifikation sind bewusst getrennt, weil sie sich
unabhängig voneinander ändern:

```
app/src/
  data/       SCHICHT 1 — Legalitäts-Daten (der eigentliche Wert)
    types.ts      Datenmodell nach Abschnitt 8
    regions.ts    Regions-Register + Rechtsrahmen je Region
    legalData.ts  Zugriffs-API — einzige Schnittstelle der UI zu den Daten
    zones/        <REGION>.osm.json   = Geometrie (importiert)
                  <REGION>.legal.json = rechtliche Einstufung (manuell gepflegt)
    points/       <REGION>.json       = Hütten/Plätze (importiert)
  map/        SCHICHT 2 — Karte & Routing (austauschbare externe Dienste)
  services/   SCHICHT 2 — weitere externe Open-Data-Dienste (Wetter via Open-Meteo)
  affiliate/  SCHICHT 3 — Ausrüstung & Affiliate
    gearItems.ts   Katalog nach Abschnitt 8.5, affiliate_url überall noch null
    packlist.ts    Generator: Packliste + Verpflegung aus den Tour-Eckdaten
    affiliateConfig.ts  zentrale Partner-Konfiguration — hier wird später scharf geschaltet
```

Geometrie und Rechtslage sind absichtlich **getrennte Dateien**: die Geometrie lässt sich
jederzeit neu importieren, ohne die mühsam gepflegte rechtliche Bewertung zu überschreiben.

## Entwicklung

```bash
npm install --prefix app
npm run dev --prefix app
```

## Daten pflegen

Eine Zone rechtlich prüfen und belegen:

1. `app/src/data/zones/CH-VS.legal.json` öffnen, Eintrag zur OSM-ID suchen.
2. `status`, `tent_allowed`, `vehicle_allowed`, `fire_allowed`, `conditions` setzen.
3. `review_status` von `"entwurf"` auf `"quelle"` (belegt) bzw. `"vor-ort"` (selbst geprüft) heben.
4. `last_verified` auf das Prüfdatum setzen (`"2026-08-19"`).

Die Karte zeigt ungeprüfte Flächen mit gestricheltem Rand und blendet den Prüfstand in
jeder Infokarte ein. Ohne Prüfdatum steht dort ausdrücklich „noch nicht erfolgt".

Geometrie und Punkte neu aus OpenStreetMap holen:

```bash
npm run import:osm --prefix app
```

Andere Region: `REGION=DE-BY npm run import:osm --prefix app`, dann Eintrag in `regions.ts`.

Einzelne Gruppen: `npm run import:osm --prefix app -- natur` (auch `punkte`, `gipfel`,
`zonen`). Das ist kein Komfort, sondern eine Schutzmassnahme — ein vollständiger Lauf
schreibt `zones/<region>.osm.json` neu, und ändert sich dabei eine OSM-ID, verliert die
zugehörige rechtliche Einstufung in `<region>.legal.json` ihren Anker.

## Deployment

Die Seite liegt auf GitHub Pages und läuft unabhängig von jedem lokalen Rechner.

```bash
npm run deploy --prefix app
```

Das baut `app/dist` und pusht den Build auf den Branch `gh-pages`.

## Route und Legalität

Der eigentliche Mehrwert aus Abschnitt 4.2 ist nicht die Route, sondern die Legalitäts-Ebene
darauf. Beides funktioniert ohne fremden Dienst:

- **Zeichnen** setzt Wegpunkte per Kartenklick.
- **GPX-Import** nimmt Routen aus Komoot, AllTrails oder vom Gerät entgegen — statt gegen
  diese Planer anzutreten (Abschnitt 2), verwertet CampBuddy deren Ergebnis.
- **Analyse** verdichtet die Route auf 250-Meter-Schritte, damit keine schmale Zone
  zwischen zwei Stützpunkten durchfällt, und weist Streckenanteile je Zone aus.

- **Weg-Routing** rastet gezeichnete Wegpunkte auf reale Wege ein, mit Profil für
  Fuss, Rad und Auto.
- **Höhenprofil** entlang der Route über die Elevation-API von Open-Meteo, daraus
  Auf- und Abstieg, Gehzeit, Schwierigkeit und ein Etappenvorschlag.

### Gehzeit und Schwierigkeit

Die Zeit der Routing-Engine kennt keine Höhenmeter und ist im Gebirge deutlich zu
optimistisch. Gerechnet wird deshalb nach der **Alpenvereinsformel** (DIN 33466):
4 km/h eben, 300 hm/h aufwärts, 500 hm/h abwärts; die grössere der beiden Zeiten voll,
die kleinere zur Hälfte. Pausen sind nicht enthalten.

Höhenmodelle rauschen. Ohne Gegenmassnahme summierte sich jedes Rastergezappel zu
erfundenen Höhenmetern — eine flache Talwanderung käme auf mehrere hundert. Das Profil
wird deshalb geglättet, und Höhenänderungen zählen erst ab 8 Metern.

Die Schwierigkeit bewertet **nur die Kondition** aus Länge und Aufstieg. Ob ein Weg
ausgesetzt oder seilversichert ist, steht nicht in den Daten; eine SAC-Bergwanderskala
daraus abzuleiten wäre geraten.

Etappen werden nach Gehzeit geteilt, nicht nach Kilometern — 12 km im Flachen und 12 km
mit 1200 Höhenmetern sind nicht derselbe Tag. Zu jedem Etappenende sucht die App die
nächste erfasste Übernachtungsmöglichkeit.

Das Routing läuft über zwei Dienste der FOSSGIS e.V., beide **ohne API-Schlüssel**:

**Valhalla** ist der Hauptanbieter, weil nur sein Fussgänger-Modell echte Bergwege zulässt.

| Einstellung | Wirkung |
|---|---|
| `max_hiking_difficulty: 4` | erlaubt Steige bis SAC T4. **Der entscheidende Wert.** Voreinstellung ist 1 und schliesst alles ab T3 aus |
| `walking_speed: 4.0` | realistischer als die voreingestellten 5,1 km/h |

Gemessen an vier in OSM als Bergweg getaggten Steigen im Wallis, jeweils zwischen den
Endpunkten des Steigs geroutet (Faktor 1,00 = der Router folgt ihm exakt):

| Konfiguration | mittlerer Umweg |
|---|---|
| Valhalla-Voreinstellung | ×9,11 — in einem Fall ×30 |
| mit `max_hiking_difficulty: 4` | **×1,01** |

Zwei Optionen fehlen bewusst, beide nach Messung verworfen:

- **`use_hills: 1.0`** klingt richtig fürs Gebirge („Steigungen nicht meiden"), verschlechterte
  das Ergebnis aber auf ×1,26 — ein Steig wurde damit doppelt so weit umfahren wie nötig.
- **`walkway_factor`** wirkt auf `highway=footway`, nicht auf `highway=path`, und blieb in
  allen Messungen wirkungslos.

Höher als T4 wird nicht gesetzt: T5 und T6 verlangen Kletterei.

**OSRM** ist die Rückfallebene. Sein Fuss-Profil gewichtet ausschliesslich nach Distanz und
nimmt im Gebirge deshalb oft die kürzere Talstrasse statt des Steigs. Springt die App darauf
zurück, sagt sie das im Routenpanel.

Gemessen auf Zermatt → Gornergrat, 24 Stichproben gegen die OSM-Wegtypen: Valhalla läuft auf
27 `path`-Segmenten, OSRM auf 13 und stützt sich stattdessen auf `track`. Im besiedelten
Gebiet nehmen sich beide wenig — dort gibt es Gehwege statt Steige.

Der Versatz der Wegpunkte auf das Wegenetz wird selbst berechnet statt vom Anbieter
übernommen: so funktioniert die Prüfung für beide Dienste identisch.

Beide Instanzen laufen auf Spendenbasis. Anfragen sind deshalb entprellt.


## Datenbestand: Schweiz

Die Region ist die **ganze Schweiz** (`CH`). Der Bestand liegt nicht mehr im Bundle,
sondern in Supabase — 382 Zonen mit Geometrie wären zweistellig megabyteschwer und würden
jeden Besucher belasten, auch den, der nur die Startseite ansieht.

| | wo | wie viel |
|---|---|---|
| Gebündelt (Sofortanzeige, ohne Netz) | `app/src/data/` | Wallis: 10 Zonen, 148 Punkte, 1291 Gipfel |
| Vollständig | Supabase: `zones`, `points`, `peaks`, `nature` | Schweiz: 622 Zonen, 955 Punkte, 7274 Gipfel, 23 753 Natur-Objekte |

**Zonen und Punkte** kommen regionsweit (382 bzw. 955 Zeilen — überschaubar).
**Gipfel und Natur-Objekte** kommen dagegen immer nur für den **sichtbaren Ausschnitt**:
landesweit sind das zusammen Zehntausende Zeilen und mehrere Megabyte, für Ebenen, die
ohnehin erst ab Zoom 9,5 beziehungsweise 12,5 gezeichnet werden. Wer die Schweiz als
Ganzes ansieht, braucht keinen einzigen Brunnen. `MapView` meldet den Ausschnitt nach
jeder Bewegung (entprellt), `fetchRemotePeaks`/`fetchRemoteNature` holen dazu passend
nach — und nur für Ebenen, die eingeschaltet sind.

Die App zeigt zuerst die gebündelte Fassung und ersetzt sie, sobald die Datenbank
antwortet; die Infokarte weist aus, welche gerade gilt. Fehlt das Backend oder liefert es
nichts, bleibt die gebündelte Fassung stehen — die Karte funktioniert immer.

### Rechtliche Einstufung: regelbasiert abgeleitet

382 Schutzgebiete lassen sich nicht einzeln recherchieren. Abgeleitet wird deshalb **nur,
wo OpenStreetMap ein eindeutiges Signal liefert**, und der Fehler geht immer in die sichere
Richtung:

| OSM-Merkmal | Einstufung |
|---|---|
| `leisure=nature_reserve`, `boundary=national_park` | verboten (Zelt, Fahrzeug, Feuer) |
| Titel enthält „Jagdbann" | verboten — Schutzzweck ist die Ruhe des Wildes (VEJ, SR 922.31) |
| Titel enthält „Wildruhe" oder „Wildschutz" | verboten |
| Titel enthält „Moor", „Ried", „Aue" | verboten — Bundesinventar, trittempfindlich |
| `protect_class` 1a, 1b, 2 oder 4 | verboten |
| `protect_class` 5, Landschaftsschutz, regionaler Naturpark | geduldet/bedingt, Fahrzeug verboten |
| alles andere | **ohne Eintrag** → erscheint als „ungeklärt" |

Die Regeln werden der Reihe nach geprüft, die erste passende gewinnt. Nur eine läuft nicht
auf „verboten" hinaus: Landschaftsschutz und regionale Naturpärke sind grossflächig und
kennen kein pauschales Zeltverbot — Kernzonen darin sehr wohl.

> Eine Karte, die zu Unrecht warnt, kostet einen Umweg. Eine, die zu Unrecht erlaubt,
> kostet eine Anzeige.

Jeder abgeleitete Eintrag trägt `review_status: 'entwurf'`, kein Prüfdatum und im
Bedingungstext die Regel, aus der er stammt. Handgeschriebene Einträge (die zehn Walliser)
werden vom Ableiten **nie überschrieben**. Der landesweite `baseline_status` ist bewusst
`unknown`: was im Wallis oberhalb der Waldgrenze verbreitet geduldet wird, ist in anderen
Kantonen ausdrücklich verboten.

### Wer ausserhalb der Schutzgebiete zuständig ist

Ein Klick auf unmarkiertes Gelände zeigte bisher den landesweiten Rahmen. Für die Schweiz
ist das die schwächste mögliche Auskunft: Bundesrecht regelt die Schutzgebiete, alles
andere regeln **Kanton und Gemeinde** — und die tun das sehr unterschiedlich.

Jetzt liegen die 26 Kantonsgrenzen gebündelt in `app/src/data/kantone/CH.json` (grob
vereinfacht, ~150 m — die Grenze dient der Zuordnung, nicht der Vermessung). Ein Klick
sagt: „Zuständig ist hier Graubünden (CH-GR), dazu die Gemeinde."

Was dort *gilt*, steht in `app/src/data/kantone.legal.json` — und die ist **leer**. Das ist
kein Versehen, sondern der wahrheitsgemässe Zustand: kantonale Regelungen gibt es nirgends
maschinenlesbar, sie sind Rechtsrecherche. Fehlt ein Eintrag, sagt die Karte „noch nicht
recherchiert", statt eine landesweite Faustregel als kantonale Auskunft auszugeben.

Einen Kanton eintragen — nur mit Quelle und Prüfdatum:

```json
{ "kantone": { "CH-GR": {
  "status": "tolerated", "tent_allowed": "conditional",
  "vehicle_allowed": "no", "fire_allowed": "conditional",
  "summary": "…", "conditions": "…",
  "source": "Kantonales Gesetz …", "source_url": "https://…",
  "review_status": "quelle", "last_verified": "2026-08-22"
} } }
```

### Amtliche Inventare vom Bund

Die zweite Datenquelle neben OpenStreetMap — und die einzige mit Rechtsverbindlichkeit.
Geholt über die Schnittstelle von geo.admin.ch (`npm run import:osm -- bafu`), Lizenz
[opendata.swiss „Open use. Must provide the source."](https://opendata.swiss/de/terms-of-use);
die Quellenangabe steht an jeder einzelnen Zone.

| Inventar | Flächen | zum Vergleich in OSM |
|---|---|---|
| Eidgenössische Jagdbanngebiete | **85** | 0 |
| Wildruhezonen | **1129** | 4 |

Diese Zonen sind die ersten im Projekt mit `review_status: 'quelle'` statt `entwurf` —
hinter jeder steht eine benannte amtliche Quelle mit Prüfdatum. „Vor Ort nachgesehen" sind
sie damit weiterhin nicht; das bleibt eine eigene, höhere Stufe und steht auf null.

Drei Entscheidungen dabei:

- **Wildschadenperimeter werden ausgelassen** (29 Stück). Sie regeln, wer für Wildschäden
  aufkommt, und sagen nichts über Zutritt. Als Verbotsfläche wären sie schlicht falsch.
- **Nicht alles wird „verboten".** Von den 1129 Wildruhezonen tragen 593 ein
  rechtsverbindliches Zutrittsverbot; die übrigen 536 haben eine schwächere Bestimmung und
  erscheinen als „geduldet, bedingt". Wer ständig zu Unrecht gewarnt wird, hört auf
  hinzusehen — und übersieht dann das echte Verbot.
- **Die Schutzzeit steht dabei.** Wildruhezonen gelten oft nur im Winterhalbjahr
  („Schutzzeit: 10.01. – 31.07."); die Bedingung nennt sie wörtlich, dazu Bestimmung,
  Rechtsgrundlage und Beschlussjahr.

### Was die Karte NICHT zeigt

Ehrlichkeit über die Grenzen gehört hier zur Funktion:

- **Kantonale und kommunale Regeln**: noch keine einzige recherchiert (siehe oben).
- **Alles, was nur in OSM steht**, hängt davon ab, ob es jemand gemappt hat — 102 Flächen
  sind ausdrücklich ungeklärt, und was gar nicht erfasst ist, fehlt ohne Hinweis.
- **Vor Ort geprüft ist keine einzige Fläche.** Beschilderung und Auskunft der Gemeinde
  gehen dieser Karte immer vor.

Eine Fläche, die hier fehlt, ist deshalb **kein Freibrief**. Die Karte weist das an jeder
Fläche und im Haftungshinweis aus.

### Neu importieren und einspielen

```bash
REGION=CH npm run import:osm --prefix app -- zonen punkte gipfel natur kantone
REGION=CH npm run import:osm --prefix app -- bafu       # amtliche Bundesinventare
REGION=CH npm run import:osm --prefix app -- recht     # Einstufung ableiten
REGION=CH node app/scripts/seed-sql.mjs                # Seed-Migrationen erzeugen
```

Zonen- und Natur-Import laufen **kachelweise** (3×3 über das Land) und sind
**wiederaufnehmbar**: nach jeder Kachel wird gespeichert, ein neuer Lauf ergänzt nur. Landesweit ist allein
Trinkwasser fünfstellig, und die öffentliche Overpass-Instanz bricht solche Antworten mit
einem Verbindungsabbruch ab — neun kleine Abfragen kommen durch, wo eine grosse scheitert,
und belasten einen Gemeinschaftsserver auch weniger.

Regionen in `BUNDLE_REGIONEN` (derzeit nur `CH-VS`) landen unter `app/src/data/`, alle
anderen unter `app/import/<REGION>/` — ausserhalb von `src/`, damit nichts versehentlich
ins Bundle wandert. `seed-sql.mjs` schreibt die SQL-Dateien nach `supabase/migrations/`
und daneben `app/src/data/bestand.json`: 193 Bytes mit den Kennzahlen, aus denen die
Startseite ihre Zahlen nimmt, statt megabyteweise Daten zu laden, nur um sie zu zählen.

Die Seed-Dateien sind gestückelt (der SQL-Editor mag keine Megabyte-Einfügungen) und
mehrfach ausführbar — jede Zeile ist ein Upsert. Geschrieben wird **ein `insert` pro Datei
mit vielen Wertetupeln**: die Einfüge- und `on conflict`-Klausel ist länger als die
Nutzdaten einer Zeile, und siebentausend Wiederholungen davon wären ein Mehrfaches der
eigentlichen Daten — und ein Vielfaches an Dateien, die jemand von Hand kopieren muss.

Reihenfolge: `0010_orientierung.sql` (legt `peaks` und `nature` an) vor den Seeds 0011/0012.

## Startseite

Neue Besucher landen auf einer Startseite, die die Rechtsfrage erklärt, bevor sie die Karte
sehen (`app/src/landing/`). Wer die Karte kennt, bekommt sie sofort:

| Fall | Was passiert |
|---|---|
| Erster Besuch | Startseite |
| Wiederkehrend (Cookie `campbuddy_kennt_start`) | direkt die Karte |
| Angemeldet | direkt die Karte |
| `#/start` aufgerufen | immer die Startseite — zum Verlinken und Vorführen |
| `#/karte` oder Rückkehr von einem Anmeldelink | direkt die Karte |

Die Weiche liegt in `app/src/Root.tsx`, die App selbst weiss nichts davon. Das Cookie ist
ein einzelnes technisches Zeichen ohne Personenbezug — keine Kennung, keine Auswertung.
Zum erneuten Ansehen: `startseiteVergessen()` in `app/src/services/besuch.ts` oder
schlicht `#/start` aufrufen.

Alle Zahlen der Startseite stammen aus `app/src/landing/zahlen.ts`, das direkt aus den
Datendateien liest — auch die unbequeme, dass **keine Fläche amtlich geprüft** ist. Sie
kann deshalb nicht behaupten, was die Karte nicht hält. Die Anwendung wird per
`lazy()` erst beim Wechsel zur Karte nachgeladen, damit die Startseite nicht auf
MapLibre und die Gipfeldaten wartet.

Die Fotos liegen als WebP in zwei Auflösungen unter `app/src/assets/landing/`; das
Vorschaubild für geteilte Links ist `app/public/og.jpg`.

## Karte bedienen

### Route zeichnen

Drei Gesten, dem Vorbild Komoot nachgebaut — nicht aus Bequemlichkeit, sondern weil
diese Bedienung eingeübt ist und niemand für eine Legalitätskarte eine neue lernen will:

| Geste | Wirkung |
|---|---|
| In die Karte tippen | hängt hinten einen Wegpunkt an |
| Wegpunkt ziehen | verschiebt ihn |
| **Linie ziehen** | zieht an dieser Stelle einen neuen Wegpunkt heraus und fügt ihn an der richtigen Position der Reihenfolge ein |
| Rechtsklick auf einen Wegpunkt | entfernt ihn |
| Esc | beendet Zeichnen bzw. Markieren |

Das Aufziehen der Linie ist der eigentliche Unterschied: ohne es muss man eine Route
löschen und neu setzen, nur um einen Umweg einzubauen. Welcher Platz in der Reihenfolge
gemeint ist, leitet `MapView` daraus ab, zwischen welchen zwei Wegpunkten der angefasste
Punkt auf der gerouteten Spur liegt (`naechsterIndex` in `data/geo.ts`).

„Route planen" schaltet das Zeichnen sofort ein — der frühere zweite Klick auf
„Route zeichnen" war ein Schritt, den niemand freiwillig macht.

Beim Zeichnen wird ein angeklickter Ort zum Wegpunkt statt zur Infokarte: „Route über
diese Hütte" ist beim Planen das, was man will.

### Ausschnitt

Die Karte lässt sich nicht beliebig weit von den Alpen wegschieben oder herauszoomen.
Nicht aus Gängelei: ausserhalb hat dieses Projekt nichts zu sagen, und eine Weltkarte ohne
einen einzigen eingezeichneten Hinweis liest sich wie „hier gilt nichts".

Gezeichnet wird dabei **nichts** — kein Rand, keine Maske. Die Begrenzung ist
ausschliesslich `maxBounds` und `minZoom`; die Karte selbst bleibt eine ganz normale
Karte, nur eben mit Anschlag.

Das Rechteck ist die umschliessende Box der OSM-Relation
[2698607](https://www.openstreetmap.org/relation/2698607) (`natural=mountain_range`,
Wikidata Q1286), geholt über `npm run import:osm -- alpen` — keine ausgedachten Zahlen.
Dazu 3° Länge und 1,2° Breite Puffer, weil der Gebirgsrand nicht die sinnvolle Kante ist:
man fährt aus München, Mailand, Lyon oder Wien los, und der Blick dorthin gehört zur
Planung.

Seitlich mehr als oben und unten, aus zwei Gründen: der Alpenbogen liegt quer, die Anfahrt
kommt also von den Enden; und ein Längengrad ist auf 46° Breite nur rund 77 km breit, ein
Breitengrad aber 111 — gleiche Gradzahlen wären seitlich die deutlich kürzere Strecke.
Ergebnis: **2,05–19,61° O · 42,21–49,61° N**. Drin liegen Lyon, Clermont-Ferrand,
Marseille, Dijon, München, Mailand, Zürich, Turin, Salzburg, Graz, Zagreb, Ljubljana,
Wien und Budapest; Hamburg, Barcelona und Rom nicht.

Mit einbezogen werden die `bounds` **jeder erfassten Region**, damit eine erfasste Fläche
nie ausserhalb des erreichbaren Bereichs liegen kann. Alles steht in
`app/src/map/alpenRahmen.ts`; die Datei mit der Box ist 311 Bytes gross.

### Was ein Kartenklick öffnet

Der Reihe nach, der kleinere Treffer gewinnt: eigene Markierung → Hütte/Platz → Wasser
oder Aussicht → Zone. Und wenn nichts davon getroffen wird, **der Rechtsrahmen der
Region**: „hier ist keine Fläche eingezeichnet, es gilt …".

Früher stand dieser Rahmen als Dauerpanel über der Karte. Das war die falsche Stelle — er
beantwortet keine Frage, solange man nicht auf eine bestimmte Stelle schaut, und verdeckte
dabei ausgerechnet die Karte. Jetzt erscheint er dort, wo die Frage entsteht.

Die Regionswahl in der Kopfzeile erscheint erst ab der zweiten Region (`mehrereRegionen` in
`App.tsx`). Ein Aufklappmenü mit genau einem Eintrag ist belegter Platz ohne Nutzen.

> **Getroffen wird über unsichtbare Kreis-Layer**, nicht über die Symbol-Layer selbst.
> MapLibres Trefferprüfung auf Symbolen hängt daran, dass die Symbolplatzierung fertig
> gerechnet ist; ist sie es nicht, kann eine Abfrage auf einen einzelnen Pixel jedes Symbol
> der Kachel zurückgeben — gemessen wurden Treffer über 250 px entfernt. Kreise werden
> geometrisch geprüft und kennen das Problem nicht.

### Symbole statt Farbpunkte

`map/symbole.ts` zeichnet alle Kartensymbole auf ein Canvas und legt sie als Bild in den
Style. Zwei Formen mit einer Bedeutung dahinter:

- **Nadel** für Orte, an denen man etwas *tut* — Hütte, Campingplatz, Stellplatz, eigene
  Markierung. Die Spitze zeigt auf die Stelle.
- **Plakette** (Kreis) für Dinge, die *da sind* — See, Quelle, Trinkwasser, Wasserfall,
  Aussichtspunkt.

Grün, Gelb und Rot bleiben dabei der Rechtslage vorbehalten; die Symbole tragen eigene Töne.

Trinkwasser, Quellen, Wasserfälle und Aussichtspunkte erscheinen erst ab Zoom 12,5 —
über eine ganze Region gestreut wären allein 957 Brunnen keine Karte mehr, sondern ein
Raster. Benannte Gewässer kommen früher, weil sie der Orientierung dienen.

> Zoom gehört an `minzoom` des Layers, nicht in dessen `filter`: `['zoom']` in einem
> Filter wird bei GeoJSON-Quellen beim Kachelbau ausgewertet und nicht beim Zeichnen.

### Eigene Punkte und Fotos

Braucht ein Konto und **Migration `0007_eigene_punkte.sql`**. Im Routenpanel schaltet
„Punkt oder Foto markieren" den Modus ein; ein Kartenklick öffnet den Dialog mit Gattung
(Aussicht, Schlafplatz, Wasser, Foto, Sonstiges), Name, Notiz, Foto und dem Schalter
„für andere sichtbar".

- **Privat ist Standard.** Veröffentlichen ist opt-in, wie bei den Routen.
- **Fotos** landen in einem privaten Storage-Bucket (`punkt-fotos`) und werden nur über
  signierte, ablaufende Adressen ausgeliefert. Wer ein Foto sehen darf, entscheidet eine
  Policy: die Eigentümerin immer, alle anderen nur bei einem veröffentlichten Punkt.
- **Vor dem Hochladen wird verkleinert** (max. 1600 px, WebP). Nebeneffekt, der hier
  ausdrücklich erwünscht ist: das Neuzeichnen auf ein Canvas verwirft sämtliche
  EXIF-Daten, also auch GPS-Ort und Aufnahmezeit. Der Ort des Punktes ist der, den man
  gesetzt hat — nicht einer, den die Kamera unbemerkt mitliefert.

Diese Ebene ist bewusst von den Rechtsdaten getrennt: eine Nutzermarkierung ist eine
Meinung, keine Auskunft. Die Infokarte sagt das auch so.

## Aufbau der App

| Bereich | Inhalt |
|---|---|
| **Karte** | Legalitäts-Ebene und Routenplanung. Beim Zeichnen zeigt das Seitenpanel nur Länge und Gehzeit; „Tour auswerten" öffnet die vollständige Auswertung mit Legalität, Höhenprofil, Etappen, Ausrüstung, Verpflegung und Wetter |
| **Community** | Routen, die andere veröffentlicht haben. Ansehen ohne Konto, Merken mit |
| **Deine Touren** | Gespeicherte Routen, Touren und Favoriten |
| **Konto** | Anmeldung per Magic Link |

In der Auswertung sind **Dauer und Schlafhöhe aus der Route übernommen** — die Tage aus
den Etappen, die Höhe aus den Etappenübernachtungen. Die Packliste passt damit zur
konkreten Tour, statt bei Standardwerten zu beginnen; anpassen lässt sich beides.

Veröffentlichen ist **opt-in**: gespeicherte Routen sind privat, bis man sie unter
„Deine Touren" ausdrücklich auf öffentlich stellt. Der Autorenname ist frei wählbar —
niemand soll seine E-Mail-Adresse veröffentlichen müssen, um eine Route zu teilen.

## Konto und gespeicherte Touren

Optional. **Ohne Konto funktioniert alles** — Karte, Routenplanung, Ausrüstungsgenerator.
Ein Login wird nur gebraucht, um Routen und Touren zu speichern (Abschnitt 3: „Kein Login
nötig zum Ansehen"). Ist kein Backend konfiguriert, blendet die App den Konto-Bereich
komplett aus, statt Fehler zu zeigen.

### Anmeldewege

Drei nebeneinander:

- **E-Mail + Passwort** mit Registrierung, Mailbestätigung und Zurücksetzen.
- **Magic Link** — passwortlos, für alle, die sich nichts merken wollen.
- **Externe Anbieter** (Google, Apple, GitHub …).

Die Anbieter-Knöpfe werden **zur Laufzeit beim Auth-Dienst erfragt** und nur angezeigt,
wenn der Anbieter im Projekt wirklich eingerichtet ist. Ein Knopf, der in eine Fehlerseite
führt, wäre schlimmer als kein Knopf.

#### Zuerst: Weiterleitungs-Adressen setzen

**Ohne diesen Schritt landet jeder Bestätigungslink auf `http://localhost:3000` und
schlägt fehl** — das ist die Standard-*Site URL* eines neuen Supabase-Projekts.

Supabase → *Authentication* → *URL Configuration*:

| Feld | Wert |
|---|---|
| Site URL | `https://jannis-drng.github.io/campbuddy/` |
| Redirect URLs | `https://jannis-drng.github.io/campbuddy/**` und `http://localhost:5177/campbuddy/**` |

Die App schickt bei jeder Anmeldung ihre eigene Adresse als Ziel mit. Supabase akzeptiert
das aber nur, wenn die Adresse auf der Liste steht — sonst fällt es stillschweigend auf die
Site URL zurück.

E-Mail-Links gelten nur begrenzt und **nur einmal**. Ein zweiter Klick auf denselben Link
ergibt `otp_expired`. Die App zeigt das jetzt als lesbaren Hinweis statt einer leeren Seite.

#### Google-Login einrichten

1. Google Cloud Console → *APIs & Services* → *Credentials* → *OAuth client ID*, Typ
   „Web application".
2. Als *Authorized redirect URI* eintragen:
   `https://<projekt-ref>.supabase.co/auth/v1/callback`
3. Client-ID und Client-Secret in Supabase unter *Authentication → Providers → Google*
   eintragen und aktivieren.

#### Apple-Login einrichten

Aufwändiger und **kostenpflichtig**: es braucht ein Apple-Developer-Programm (99 $/Jahr).
Im Developer-Portal eine Service-ID anlegen, „Sign in with Apple" aktivieren, dieselbe
Callback-URL hinterlegen, einen Schlüssel erzeugen und Team-ID, Key-ID und Schlüssel in
Supabase eintragen.

Danach erscheinen die Knöpfe von selbst — im Code ist nichts zu ändern.

### Kontoverwaltung

Anzeigename (steht an veröffentlichten Routen, die E-Mail-Adresse wird nie veröffentlicht),
Passwort ändern, Abmelden, und **Konto löschen**.

Das Löschen ist DSGVO-relevant und lässt sich vom Browser aus nicht direkt machen — ein
Client hat keine Adminrechte auf `auth.users`. Migration 0006 legt dafür die Funktion
`delete_own_account()` an, die mit den Rechten ihres Eigentümers läuft und ausschliesslich
den eigenen Datensatz entfernt. Profil, Routen, Touren und Favoriten hängen per
`ON DELETE CASCADE` daran.

### Abo

Im Kontobereich als Platzhalter sichtbar, wie in Abschnitt 5 vorgesehen: Status und
Laufzeit liegen im Profil, es ist nichts buchbar und nichts abgerechnet. Die Spalten sind
bewusst schon angelegt — nachträglich eine Spalte in eine Tabelle mit Nutzerdaten zu ziehen
ist unangenehmer, als sie leer mitzuführen.

### Einrichten

Im Supabase-Projekt unter *SQL Editor* der Reihe nach ausführen:

| Datei | Inhalt |
|---|---|
| [`0001_init.sql`](./supabase/migrations/0001_init.sql) | `profiles`, `routes`, `trips` (8.3, 8.4, 8.6) mit RLS |
| [`0002_legal_data.sql`](./supabase/migrations/0002_legal_data.sql) | `zones`, `points`, `gear_items` (8.1, 8.2, 8.5), öffentlich lesbar |
| [`0003_seed_zones.sql`](./supabase/migrations/0003_seed_zones.sql) | die 10 Wallis-Zonen |
| [`0004_seed_points.sql`](./supabase/migrations/0004_seed_points.sql) | die 148 Punkte |
| [`0005_community.sql`](./supabase/migrations/0005_community.sql) | Veröffentlichen von Routen und Favoriten |
| [`0006_konto.sql`](./supabase/migrations/0006_konto.sql) | Anzeigename, Abo-Platzhalter, Konto löschen |
| [`0007_eigene_punkte.sql`](./supabase/migrations/0007_eigene_punkte.sql) | Selbst markierte Punkte und der private Fotospeicher |

Dann `app/.env.example` nach `app/.env.local` kopieren, beide Werte eintragen und
`npm run deploy --prefix app`.

Die Seed-Dateien sind mehrfach ausführbar (`on conflict do update`). Nach einem
`npm run import:osm` lassen sie sich neu erzeugen.

### Warum die Daten doppelt liegen

Zonen und Punkte stecken sowohl gebündelt in der App als auch in der Datenbank —
Absicht, kein Versehen:

- Die **gebündelte** Fassung ist sofort da, kostet keinen Netzzugriff und funktioniert
  offline. Das ist die Voraussetzung für die Offline-Karte [SPÄTER].
- Die **Datenbank** ist dafür aktuell: eine korrigierte Rechtseinstufung wirkt sofort für
  alle, ohne die Seite neu zu bauen. Genau das braucht die laufende Rechtspflege.

Die App zeigt zuerst die gebündelte Fassung und ersetzt sie, sobald die Datenbank
antwortet. Antwortet sie nicht, bleibt es bei der gebündelten — die Karte ist nie leer.

### Zu den Schlüsseln

Supabase vergibt zwei Sorten, und der Unterschied ist sicherheitsrelevant:

- **`sb_publishable_…`** gehört ins Frontend. Er landet im Browser-Bundle und ist damit
  öffentlich — genau so ist er gedacht. Der Schutz kommt aus Row Level Security: jede
  Policy prüft `auth.uid()`, niemand sieht fremde Zeilen.
- **`sb_secret_…`** umgeht RLS und gibt Vollzugriff. Er darf **niemals** in dieses Repo,
  in `.env.local`, in ein Build-Artefakt oder in eine Chat-Nachricht. Die App braucht ihn
  nicht und verwendet ihn nicht.

`.env.local` ist über `*.local` von Git ausgeschlossen.

## Ausrüstungs-Generator

Er lebt ausschliesslich in der Tour-Auswertung auf der Karte — dort liegen die Eckdaten,
aus denen die Liste entsteht. Eine zweite, leere Planungsansicht ohne Route gibt es
bewusst nicht.

Die Empfehlungen beruhen auf offen dokumentierten Faustformeln, nicht auf Messwerten.
Alle Annahmen stehen als Konstanten in `packlist.ts` und werden im UI ausgewiesen:
Grundumsatz plus Aktivitätszuschlag, Zuschläge für Kälte und Höhe, Energiedichte der
Trekkingnahrung. Die Temperatur auf Tourhöhe wird mit rund 0,65 °C je 100 Höhenmeter aus
der Vorhersage umgerechnet.

Liegt der Reisezeitraum jenseits des 16-Tage-Fensters von Open-Meteo, fällt die Liste
sichtbar auf eine Schätzung aus der Jahreszeit zurück, statt eine Genauigkeit
vorzutäuschen, die es nicht gibt.

Die Affiliate-Ebene ist eingebunden, aber bewusst nicht scharf: solange in
`affiliateConfig.ts` keine Partner-ID steht, zeigt das UI „Kauf-Link bald verfügbar"
statt eines erfundenen Links.

## Technik

React 19 · TypeScript · Vite · Tailwind 4 · MapLibre GL 5 · OpenFreeMap-Kacheln
(OpenStreetMap) · Open-Meteo

Keine API-Keys, keine Kartenlizenzgebühren, kein Backend — laufende Kosten: 0 €.

**MapLibre ist bewusst auf 5.x gepinnt.** Version 6 lädt ihren Worker als separates Asset
(`maplibre-gl-worker.mjs`); der aktuelle Vite-8-Build emittiert diese Datei nicht, wodurch
im Produktions-Build keine Kacheln laden. 5.x bindet den Worker inline ein.

## Lizenz & Daten

Kartendaten © OpenStreetMap-Mitwirkende ([ODbL](https://www.openstreetmap.org/copyright)),
Kacheln von [OpenFreeMap](https://openfreemap.org/).
