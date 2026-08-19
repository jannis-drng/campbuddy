# CampBuddy — Legalitätskarte fürs Wildcampen

Zeigt auf einer Karte, wo Übernachten in der Natur **erlaubt, verboten oder geduldet** ist —
mit Quelle und Prüfstand zu jeder Fläche.

**Live:** https://jannis-drng.github.io/campbuddy/

> Orientierungshilfe, keine Rechtsgarantie. Die rechtliche Einstufung ist derzeit ein
> **unverifizierter Entwurf** aus dem allgemeinen Rechtsrahmen — noch keine Fläche ist
> amtlich geprüft. Die App weist das an jeder Zone offen aus.

Vollständige Produktspezifikation: [Freistehen_Spezifikation.md](./Freistehen_Spezifikation.md)

## Stand

Umgesetzt ist der `[JETZT]`-Umfang aus Abschnitt 3 der Spezifikation: **eine** Region
(Wallis, CH-VS), eine Kartenansicht, Zonen + Punkte, Infokarten, Filter, Haftungshinweis.

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
  affiliate/  SCHICHT 3 — Ausrüstung & Affiliate (vorbereitet, nicht angebunden)
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

## Technik

React 19 · TypeScript · Vite · Tailwind 4 · MapLibre GL 5 · OpenFreeMap-Kacheln (OpenStreetMap)

Keine API-Keys, keine Kartenlizenzgebühren, kein Backend — laufende Kosten: 0 €.

**MapLibre ist bewusst auf 5.x gepinnt.** Version 6 lädt ihren Worker als separates Asset
(`maplibre-gl-worker.mjs`); der aktuelle Vite-8-Build emittiert diese Datei nicht, wodurch
im Produktions-Build keine Kacheln laden. 5.x bindet den Worker inline ein.

## Lizenz & Daten

Kartendaten © OpenStreetMap-Mitwirkende ([ODbL](https://www.openstreetmap.org/copyright)),
Kacheln von [OpenFreeMap](https://openfreemap.org/).
