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

| Ebene | Inhalt | Quelle |
|---|---|---|
| Zonen | 10 Schutzgebietsflächen | Geometrie aus OpenStreetMap, rechtliche Einstufung selbst gepflegt |
| Punkte | 148 (79 Hütten, 48 Campingplätze, 21 Stellplätze) | OpenStreetMap |
| Gipfel | 1291 benannte Gipfel mit Höhe | OpenStreetMap |

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
