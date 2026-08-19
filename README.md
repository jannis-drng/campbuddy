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
  Fuss, Rad und Auto samt geschätzter Reisezeit.

Das Routing läuft über die öffentliche OSRM-Instanz der FOSSGIS e.V. — dieselbe, die
openstreetmap.org verwendet. **Kein API-Schlüssel, keine Registrierung, 0 €.**

Zwei Sicherungen, weil die Legalitäts-Auswertung auf der gerouteten Linie beruht:

- OSRM zieht jede Koordinate auf den nächsten Weg. Liegt ein Wegpunkt weiter als 2 km von
  jedem erfassten Weg entfernt, fällt die App auf gerade Verbindungen zurück, statt eine
  Route für einen ganz anderen Ort auszuwerten. Zwischen 250 m und 2 km wird gewarnt.
- Fällt der Dienst aus, verbindet die App die Wegpunkte gerade und weist das im UI aus.

Die Instanz wird von der OSM-Community auf Spendenbasis betrieben. Anfragen sind deshalb
entprellt. Für dauerhaft hohe Last einen OpenRouteService-Schlüssel in `mapConfig.ts` unter
`ROUTING.apiKey` eintragen — die Routing-Schicht schaltet dann automatisch um, ohne
Code-Änderung.

## Konto und gespeicherte Touren

Optional. **Ohne Konto funktioniert alles** — Karte, Routenplanung, Ausrüstungsgenerator.
Ein Login wird nur gebraucht, um Routen und Touren zu speichern (Abschnitt 3: „Kein Login
nötig zum Ansehen"). Ist kein Backend konfiguriert, blendet die App den Konto-Bereich
komplett aus, statt Fehler zu zeigen.

Anmeldung per **Magic Link**: es gibt kein Passwort, das erfasst, übertragen oder
gespeichert werden könnte.

### Einrichten

1. Im Supabase-Projekt unter *SQL Editor* die Datei
   [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) ausführen.
   Sie legt `profiles`, `routes` und `trips` nach Abschnitt 8 an — inklusive Row Level
   Security und Policies.
2. `app/.env.example` nach `app/.env.local` kopieren und beide Werte eintragen.
3. `npm run deploy --prefix app`.

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
