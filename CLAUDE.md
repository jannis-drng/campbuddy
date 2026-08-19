# CampBuddy / Freistehen

Verbindliche Produktspezifikation für dieses gesamte Projekt: @Freistehen_Spezifikation.md

Diese Spezifikation ist die Referenz für **alle** Arbeiten in diesem Repo. Vor Architektur-,
Feature- oder Datenmodell-Entscheidungen dort nachsehen; Abweichungen nur nach Rücksprache.

## Leitplanken (aus der Spezifikation)

- **Kern zuerst:** eine exzellente Legalitäts-Karte für **eine** Region. Alles mit `[JETZT]`
  markierte zuerst bauen, `[BALD]`/`[SPÄTER]` nicht vorziehen.
- **[FUNDAMENT]-Punkte von Anfang an sauber:** Datenmodell (`zones`, `points`, `gear_items` …),
  Trennung von Legalitäts-Datenschicht / Karten- und Routing-Schicht / Affiliate-Schicht,
  responsive + touch-freundlich (spätere PWA bzw. Mobile-App ohne Neubau).
- **Tech-Stack:** React + Tailwind, MapLibre GL, OpenStreetMap, Open-Meteo,
  OpenRouteService/GraphHopper, Supabase (EU-Region), Vercel/Netlify — Free-Tiers und Open Data,
  keine kostenpflichtigen Kartenlizenzen.
- **Affiliate-Ebene wird nur vorbereitet**, nicht angebunden: `vendor` / `affiliate_url` als
  Platzhalter, zentrale Affiliate-Konfiguration.
- **Recht:** bei jeder Zone Quelle + `last_verified`-Datum; Haftungshinweis prominent
  ("Orientierungshilfe, keine Rechtsgarantie"); DSGVO/EU-Hosting sobald Nutzerkonten dazukommen.
- **Sprache:** Projektsprache Deutsch (UI-Texte, Doku, Kommunikation).

## Projektstruktur

- `app/` — die Web-App (React + Vite). `npm install --prefix app`, `npm run dev --prefix app`.
- `app/src/data/` — **Schicht 1**, die Legalitäts-Daten. Geometrie (`*.osm.json`, importiert)
  und rechtliche Einstufung (`*.legal.json`, manuell gepflegt) sind getrennte Dateien, damit
  ein Neu-Import die Rechtspflege nicht überschreibt.
- `app/src/map/` — **Schicht 2**, Karte/Routing. `app/src/affiliate/` — **Schicht 3**, vorbereitet.
- `npm run import:osm --prefix app` — Punkte und Schutzgebiete aus OpenStreetMap holen.
- `npm run deploy --prefix app` — baut und veröffentlicht auf GitHub Pages.

Live: https://jannis-drng.github.io/campbuddy/ · Repo: https://github.com/jannis-drng/campbuddy

**Datenehrlichkeit ist Pflicht:** keine rechtliche Einstufung ohne `review_status` und
`last_verified`. Erfundene Zonen, Koordinaten oder Quellen sind in diesem Projekt tabu —
die Karte lebt davon, dass ihr Prüfstand ehrlich ausgewiesen ist.
