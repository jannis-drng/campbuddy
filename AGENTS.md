# CampBuddy / Freistehen

Verbindliche Produktspezifikation für dieses gesamte Projekt: @Freistehen_Spezifikation.md

Monetarisierungs-Fahrplan (korrigiert Abschnitt 5 der Spezifikation): @MONETARISIERUNG.md

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
- **Kartendaten sind statische Dateien, keine Datenbankabfragen.** `npm run snapshot --prefix app`
  (läuft automatisch vor `dev` und `build`) erzeugt aus `app/import/<REGION>/` das Verzeichnis
  `app/src/data/snapshot/` — nicht im Git, nicht von Hand pflegen. Vite gibt jeder Datei einen
  Inhalts-Hash, sie liegen danach unbegrenzt im Browser-Cache. Grosse Ebenen sind zweistufig:
  eine vereinfachte Übersicht fürs ganze Land plus Detailkacheln im 0,25°-Gitter, die nur der
  sichtbare Ausschnitt nachlädt (`app/src/data/snapshot.ts`).
  **Supabase ist ausschliesslich für Nutzerbezogenes zuständig** — Konten, Touren, Kommentare,
  Meldungen, eigene Punkte. Wer Kartendaten wieder aus der Datenbank holt, holt sich beides
  zurück: Egress-Kosten pro Besuch und den 1000-Zeilen-Deckel.
- **PostgREST liefert höchstens 1000 Zeilen, stillschweigend.** Genau daran fehlten live über
  tausend Gemeinden und mehrere hundert Schutzgebiete, monatelang, ohne Fehlermeldung. Jede
  Abfrage, die mehr als eine Handvoll Zeilen erwarten kann, geht über `alleZeilen` aus
  `app/src/services/deckel.ts`.
- **Drei Zuständigkeitsebenen, feinste gewinnt:** Schutzgebiet (`zones`) → Gemeinde
  (`gemeinden.legal.json`, Schlüssel = BFS-Nummer) → Kanton (`kantone.legal.json`) →
  landesweiter Rahmen. Ausserhalb der Schutzgebiete entscheidet in der Schweiz fast immer
  die **Gemeinde**; eine bloss kantonale Auskunft ist dort im Zweifel falsch. Wie ein Eintrag
  aussieht und welche Belege er braucht: `app/src/data/gemeinden.README.md`.
- **Kein Eintrag ≠ keine Regel.** Ungeprüfte Gemeinden bleiben auf der Karte ungefüllt und
  nennen stattdessen den Kontakt der Gemeinde. Schraffiert = eingestuft, aber nicht mit einem
  amtlichen Dokument belegt (`review_status: 'entwurf'`).
- `app/src/map/` — **Schicht 2**, Karte/Routing. `app/src/affiliate/` — **Schicht 3**, vorbereitet.
- `npm run import:osm --prefix app` — Punkte, Schutzgebiete, Kantone und Gemeinden holen
  (`REGION=CH node scripts/import-osm.mjs gemeinden` für die Gemeindeebene allein).
- `node scripts/recherche-gemeinden.mjs` — kommunale Reglemente suchen und die Stellen zum
  Übernachten im Wortlaut sammeln; `node scripts/gemeinden-einstufen.mjs [--schreiben]` trägt
  geprüfte Musterformulierungen (`gemeinden.muster.json`) auf die passenden Gemeinden auf.
  **Nicht Gemeinden einzeln einstufen, sondern Formulierungen** — viele Gemeinden nutzen
  wortgleiche Musterreglemente. Quelle ist immer das Reglement der jeweiligen Gemeinde.
- `npm run deploy --prefix app` — baut und veröffentlicht auf GitHub Pages.
- `npm run icons --prefix app` — App-Icon und Favicons aus der Bildmarke erzeugen.
  Die Marke liegt zweimal: als Komponente in `app/src/components/Marke.tsx` (Oberfläche)
  und als Geometrie in `scripts/icons-bauen.mjs` (Dateien). Wer eine ändert, ändert beide.
- `node scripts/vorschau-kopfzeilen.mjs` — den Build mit den echten HTTP-Kopfzeilen
  ansehen (`vite preview` ignoriert `_headers`). Pflichtschritt, bevor eine Änderung
  an der Content-Security-Policy live geht: ein Verstoss zeigt sich nur so.
- `npm run budget --prefix app` — Grössenbudget prüfen. Läuft nach jedem Build und **lässt
  ihn scheitern**, wenn eine Grenze reisst (`scripts/groessen-budget.mjs`). Grenze bewusst
  hochsetzen ist in Ordnung; sie unbemerkt zu reissen nicht.
- `node scripts/kaltstart-messen.mjs` — misst mit echtem Chrome, was ein Besuch tatsächlich
  über die Leitung holt, kalt und warm. `NETZ=3g` drosselt auf 400 kbit/s.
- Ein **Service Worker** (`app/public/sw.js`) hält die App-Hülle und die Kerndaten vor. Ohne
  ihn kostete jeder Wiederbesuch dasselbe wie der erste. Die Liste der vorzuwärmenden Dateien
  entsteht beim Bauen (`kernAssets` in `vite.config.ts`), weil ihre Namen einen Hash tragen.
- `app/_headers.vorlage` — Sicherheits-Kopfzeilen inkl. CSP. Kommt ein externer
  Dienst dazu, muss er dort in `connect-src`/`img-src` eingetragen werden, sonst
  blockiert ihn der Browser. Umzug auf Cloudflare: `UMZUG_CLOUDFLARE.md`;
  ausgeliefertes Verzeichnis: `app/wrangler.jsonc`.

Live: https://jannis-drng.github.io/campbuddy/ · Repo: https://github.com/jannis-drng/campbuddy

**Datenehrlichkeit ist Pflicht:** keine rechtliche Einstufung ohne `review_status` und
`last_verified`. Erfundene Zonen, Koordinaten oder Quellen sind in diesem Projekt tabu —
die Karte lebt davon, dass ihr Prüfstand ehrlich ausgewiesen ist.
