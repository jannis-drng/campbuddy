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
