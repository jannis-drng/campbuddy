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
- **Die Kartentabellen sind nicht mehr über die API lesbar** (Migration 0023). `zones`,
  `points`, `gemeinden`, `nature`, `peaks`, `gear_items` haben keine Lese-Policy und kein
  `grant` mehr — sie sind der Fundus für den Import, nicht die Auslieferung. Wer dort wieder
  `select` freigibt, legt 15 MB ohne Anmeldung ins Netz und zahlt sie aus demselben
  Egress-Kontingent wie die echten Besucher.
- **Übersichtslisten laden `vorschau`, nie `geometry`** (Migration 0024). Jede Tour trägt
  ihren Verlauf zweimal: vollständig für die Karte, auf 120 Punkte ausgedünnt für das
  Vorschaubild — 22 kB statt 932 kB über alle Touren. Die Spaltenlisten stehen als
  `LISTEN_SPALTEN` / `EIGENE_LISTEN_SPALTEN` in `app/src/services/supabase.ts`; der volle
  Weg kommt über `ladeVerlauf` (fremde Tour) bzw. `ladeEigenenVerlauf` (eigene), und zwar
  erst dann, wenn jemand die Tour tatsächlich auf die Karte legt, kopiert oder bearbeitet.
  Ein `select('*')` auf `routes` oder `oeffentliche_routen` in einer Liste ist ein Rückfall.
- **Rechte sind ab Migration 0025 einzeln vergeben, nicht pauschal.** Der Supabase-Standard
  (`grant all` an `anon` und `authenticated`, RLS als einziges Tor) gilt hier nicht mehr:
  ein Zugriff braucht jetzt *beides* — ein Recht und eine zustimmende Regel. Wer eine
  Abfrage auf eine neue Tabelle ergänzt, ergänzt dort auch den `grant`, sonst kommt ein
  klarer Fehler statt einer stillen Lücke. `profiles` ist spaltenweise vergeben: geschrieben
  wird nur `anzeigename`, damit niemand sein eigenes Abo einschaltet.
- **Eine Triggerfunktion, die eine gesperrte Hilfsfunktion ruft, braucht
  `security definer`.** PostgreSQL prüft `execute` auf die *Triggerfunktion* nur
  beim Anlegen des Triggers — auf alles, was sie von innen ruft, dagegen bei
  jedem Auslösen und mit den Rechten dessen, der gerade schreibt. Migration 0024
  entzog `vorschau_aus_geometrie` die Rechte und liess `routes_rahmen_setzen`
  ohne `security definer`: **drei Tage lang konnte niemand eine Tour speichern**,
  und der Prüfstand konnte es nicht sehen (er arbeitet ohne Konto, und RLS
  greift vor dem Trigger). Behoben in 0027. Wer eine Hilfsfunktion sperrt, macht
  ihren Aufrufer zum Definer — oder testet das Speichern von Hand.
- **`npm run pruefen --prefix app` beweist die Sicherheitsannahmen von aussen**
  (`scripts/backend-pruefen.mjs`, 27 Prüfungen mit dem öffentlichen Schlüssel: Kartendaten
  zu, Views ohne `user_id`, kein Schreiben ohne Konto, Trigger nicht als RPC aufrufbar).
  Pflichtschritt, bevor eine Änderung an Regeln, Rechten oder Views live geht — dieselbe
  Rolle wie `vorschau-kopfzeilen.mjs` vor einer CSP-Änderung.
- **`SUPABASE_SECRET_KEY=… npm run sichern --prefix app` sichert die Nutzerdaten** nach
  `sicherung/<zeitstempel>/` (nicht im Git). Auf dem Free-Plan gibt es keinen zugesicherten
  Wiederherstellungsweg: Tagessicherungen werden zwar genommen, sind aber erst nach einem
  Upgrade zugänglich. Die Rechtsdaten stehen in Git und im Import-Verzeichnis; unersetzlich
  sind Touren, Kommentare, eigene Punkte und Profile. Regelmässig laufen lassen.
- **PostgREST liefert höchstens 1000 Zeilen, stillschweigend.** Genau daran fehlten live über
  tausend Gemeinden und mehrere hundert Schutzgebiete, monatelang, ohne Fehlermeldung. Jede
  Abfrage, die mehr als eine Handvoll Zeilen erwarten kann, geht über `alleZeilen` aus
  `app/src/services/deckel.ts`.
- **Drei Zuständigkeitsebenen, feinste gewinnt:** Schutzgebiet (`zones`) → Gemeinde
  (`gemeinden.legal.json`, Schlüssel = BFS-Nummer) → Kanton (`kantone.legal.json`) →
  landesweiter Rahmen. Ausserhalb der Schutzgebiete entscheidet in der Schweiz fast immer
  die **Gemeinde**; eine bloss kantonale Auskunft ist dort im Zweifel falsch. Wie ein Eintrag
  aussieht und welche Belege er braucht: `app/src/data/gemeinden.README.md`.
- **Zelt und Biwak sind zwei Fragen, nicht eine.** `bivouac_allowed` steht getrennt von
  `tent_allowed` und ist optional — fehlt es, gilt `unknown`, und das ist der Normalfall:
  die meisten Reglemente regeln „Campieren" und „Zelten" und sagen zum Übernachten im
  Schlafsack nichts. **Nie vom Zeltwert ableiten** (`biwakRegel` in `legalData.ts` tut das
  ausdrücklich nicht): oberhalb der Waldgrenze wird biwakiert, wo das Zelt verboten bleibt.
  Wer überträgt, erfindet ein Verbot oder eine Erlaubnis.
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
- **Suchmaschinen sehen nur eine Seite, wenn man nichts tut.** Die App routet über
  Rautenpfade (`#/karte`); alles dahinter ist für Google keine eigene Adresse.
  `scripts/gemeindeseiten.mjs` (läuft im `postbuild`) schreibt deshalb je **eingestufter**
  Gemeinde eine fertige HTML-Seite nach `dist/gemeinde/<bfs>-<name>/`, dazu `sitemap.xml`
  und `robots.txt`. Gemeinden ohne Eintrag bekommen bewusst **keine** Seite — zweitausend
  Seiten „keine Angabe" wären dünne Massenware. Die Seiten tragen kein JavaScript
  (`script-src 'self'` verbietet es) und zeichnen deshalb mit Microdata aus, nicht mit
  JSON-LD. Ihr Knopf führt über `#/karte/ort/<breite>,<länge>` in die Karte; diesen
  Tiefenlink liest `ortAusAdresse` in `App.tsx`.
- **Impressum und Datenschutz** liegen unter `#/impressum` und `#/datenschutz`
  (`src/rechtliches/`). Die Betreiberangaben stehen an genau einer Stelle
  (`betreiber.ts`) und werden **nie erfunden**: fehlt etwas, benennt die Seite die Lücke,
  und `npm run pflichtangaben` (im `postbuild`) erinnert daran. Wer einen Dienst ergänzt,
  ergänzt ihn in der CSP *und* in der Aufzählung der Datenschutzerklärung — die Liste dort
  ist als vollständig ausgewiesen.
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
