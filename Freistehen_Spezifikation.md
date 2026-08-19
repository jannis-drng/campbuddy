# CampBuddy — Vollständige Produktspezifikation

*Die Legalitäts-Karte fürs Wildcampen — plus Tourplanung drumherum*

**Version 1.0 — Ziel-Architektur, mit klar markiertem schlankem Startpunkt**

*(Arbeitsname "CampBuddy" — frei austauschbar. Weitere Namensideen am Ende.)*

---

## Wie du dieses Dokument liest

Das hier ist die **fertige Ziel-Vision** — aber diesmal mit einem noch strengeren Fokus darauf, was du *zuerst* baust, weil du eine nutzbare Version für Social Media brauchst, nicht die Vollausstattung.

Prioritätsstufen:

- **[JETZT]** — der schlanke, vorzeigbare Startpunkt. Das baust du zuerst, das zeigst du auf Social Media.
- **[FUNDAMENT]** — muss von Anfang an sauber angelegt sein, weil Nachrüsten teuer ist (Datenmodell, Architektur-Trennung).
- **[BALD]** — die nächsten Schichten, sobald die Karte genutzt wird (Routen, Ausrüstung).
- **[SPÄTER]** — Ausbau zur Plattform (Community, Mobile-App-Feinschliff, echte Affiliate-Anbindung).

Der Leitgedanke: **Eine einzige, exzellente Legalitäts-Karte für eine Region schlägt zehn halbgare Features.** Alles andere hängt daran.

---

## 1. Produktvision in einem Satz

CampBuddy zeigt auf einer Karte klar und vertrauenswürdig, wo Übernachten in der Natur legal, verboten oder geduldet ist (Zelt, Auto/Camper, Hütte, offizieller Platz) — und baut darum herum die Planung einer mehrtägigen Tour: Route, Ausrüstung, Wetter, Anreise.

---

## 2. Das Alleinstellungsmerkmal (worauf ALLES aufbaut)

Andere Apps lösen Teile, aber keiner die Kombination:

- **Komoot / AllTrails / rooot** → Routenplanung. Stark, besetzt. *Da konkurrierst du nicht.*
- **Park4Night / iOverlander** → von Nutzern gemeldete Spots ("hier hat jemand geschlafen"). *Aber: keine rechtsbasierte Legalitäts-Aussage.*
- **CampMap.ch** → Legalkarte, aber nur Schweiz, Einzellösung.

**Deine Lücke = die rechtsbasierte, länderübergreifende Legalitäts-Ebene + die Vorbereitung drumherum (Ausrüstung, Anreise).** Das ist der Kern. Alles andere ist Beiwerk.

> **Merksatz fürs ganze Projekt:** Der Wert liegt in den *Rechtsdaten*, nicht im Code. Genau deshalb macht es keiner sauber — und genau deshalb ist es deine Chance, wenn du die Mühe der Datenpflege auf dich nimmst.

---

## 3. Der schlanke Startpunkt [JETZT] — was du zuerst baust

Eine **Web-App mit genau einer Kern-Ansicht**: einer interaktiven Karte für **eine Region** (Empfehlung: ein Schweizer Kanton oder die bayerischen/Tiroler Alpen — eine Region, die du selbst kennst und vor Ort prüfen kannst).

Die Karte zeigt:
- **Zonen** eingefärbt: erlaubt (grün) / verboten (rot) / geduldet/Grauzone (gelb).
- **Punkte** für: offizielle Campingplätze, Berghütten, legale Stellplätze fürs Auto/Camper.
- **Klick auf eine Zone/Punkt** → Infokarte mit: Was gilt hier? (Zelt/Auto/Feuer erlaubt?), Quelle der Info, Stand/Datum, Hinweise (z.B. "nur oberhalb Baumgrenze", "Feuerverbot im Sommer").
- **Klarer Haftungshinweis**: "Orientierungshilfe, keine Rechtsgarantie — prüfe vor Ort."

Das ist bewusst **eine** Ansicht. Kein Login nötig zum Ansehen. Kein Routenplaner. Kein Ausrüstungsgenerator. Diese eine Karte, richtig gut gemacht, ist dein Social-Media-Zeigeobjekt und dein Wedge.

**Die Affiliate-/Ausrüstungs-Ebene wird vorbereitet, aber nicht angebunden** (siehe Abschnitt 7) — d.h. die Struktur ist da, die Links sind Platzhalter.

---

## 4. Vollständiger Feature-Katalog (Ziel-Vision)

### 4.1 Legalitäts-Karte (der Kern)
- **[JETZT]** Eine Region, Zonen + Punkte, Infokarten, Haftungshinweis.
- **[BALD]** Filter (nur Zelt / nur Auto-Camper / nur Hütten / Feuer erlaubt).
- **[BALD]** Weitere Regionen, Land für Land / Kanton für Kanton.
- **[SPÄTER]** Offline-Verfügbarkeit der Karte (wichtig draußen ohne Netz).
- **[SPÄTER]** Nutzer-Meldungen ("hier war zu / neues Schild") zur Datenpflege — mit Moderation.

### 4.2 Routenplanung
- **[BALD]** Route auf der Karte zeichnen (auf Open-Data-Routing-Engine, nicht Komoot-API — siehe Abschnitt 6).
- **[BALD]** Route + Legalitäts-Layer zusammen: "Wo kann ich entlang dieser Route legal schlafen?"
- **[SPÄTER]** Mehrtages-Etappen automatisch, mit legalen Schlafpunkten pro Etappe.
- **[SPÄTER]** GPX-Export/Import (Standard, den erfahrene Wanderer erwarten).

### 4.3 Ausrüstungs- & Verpflegungs-Generator
- **[BALD]** Aus Tour-Eckdaten (Dauer, Jahreszeit, Höhe, Personenzahl) eine Packliste generieren.
- **[BALD]** Verpflegungsmenge grob berechnen (Kalorien/Tag × Tage × Personen).
- **[BALD]** **Affiliate-Ebene [vorbereitet]:** jedes Ausrüstungsteil kann einen (Platzhalter-)Produktlink tragen. Das ist der Haupt-Monetarisierungshebel.
- **[SPÄTER]** Wetterdaten in die Packliste einfließen lassen (Regenschutz, Kälte).

### 4.4 Anreise
- **[SPÄTER]** ÖPNV-Anbindung zum Startpunkt (günstigste/einfachste Verbindung).
- **[SPÄTER]** Auto-Route zum Startpunkt + legale Parkmöglichkeit.

### 4.5 Wetter
- **[BALD]** Wettervorhersage für Tour-Zeitraum und -Region (kostenlose Wetter-API).

### 4.6 Konto & Speichern
- **[BALD]** Optionaler Login, um Touren/Routen zu speichern.
- **[SPÄTER]** Eigene Touren teilen (Community-Baustein).

---

## 5. Monetarisierung (realistisch, klein, mehrschichtig)

Ehrliche Einordnung: Outdoor-Nutzer sind knausrig, mehrere Konkurrenten sind gratis. Das Ziel ist **"trägt sich als schlankes Solo-Projekt + kleiner wachsender Nebenertrag"**, nicht Reichtum. Deshalb mehrere kleine Ströme statt eines großen:

1. **Ausrüstungs-Affiliate [Haupthebel].** Der Ausrüstungsgenerator ist praktisch eine Affiliate-Maschine mit echtem Nutzen. Outdoor-Provisionen sind überdurchschnittlich (ca. 8%, hohe Warenkörbe, oft 100–200 € Provision pro größerem Kauf). Ein vermittelter Rucksack bringt mehr als ein Jahresabo. **Diese Ebene wird von Anfang an strukturell vorbereitet**, auch ohne echte Links.
2. **Günstiges Abo (Freemium).** Kostenlos: Karte ansehen für die Basis-Region(en). Bezahlt (klein, ~2–4 €/Monat): mehr Regionen, Offline-Karten, Routen speichern, Ausrüstungslisten speichern. Realistische Conversion: 2–5 %.
3. **[SPÄTER] Kooperationen** mit Ausrüstern/Food-Marken (z.B. Trekkingnahrung) — erst ab relevanter Reichweite sinnvoll.

Die entscheidende Größe ist **nicht** das Modell, sondern die **Nutzerzahl** — und die kommt aus deinem Reichweitenaufbau (Social Media zum Legalitäts-Thema), nicht aus der App selbst.

---

## 6. Technische Architektur (billig, schlank, später mobil)

Bewusst so gewählt, dass Server-/Lizenzkosten minimal bleiben und eine spätere Mobile-App leicht fällt.

| Schicht | Empfehlung | Warum |
|---|---|---|
| **Frontend** | React (Web) + Tailwind | Standard, gut mit Claude Code baubar. **Wichtig für "später mobil":** siehe Hinweis unten |
| **Karten-Darstellung** | MapLibre GL (Open Source) | **Kostenlos**, keine Kartenlizenz-Gebühren wie bei Google/Mapbox |
| **Karten-Daten** | OpenStreetMap (OSM) | **Kostenlos**, offene Daten |
| **Routing-Engine** | OpenRouteService oder GraphHopper (OSM-basiert) | **Kostenlose Kontingente**, unabhängig von Komoot. Kein Lizenzrisiko |
| **Wetter** | Open-Meteo | **Kostenlos**, keine API-Key-Kosten für den Start |
| **Deine Legalitäts-Daten** | Eigene Datenbank (GeoJSON in PostgreSQL/PostGIS oder simpler: statische GeoJSON-Dateien) | Das ist *dein* Wert — selbst gepflegt |
| **Backend/Auth** | Supabase (Free-Tier) | Kostenloser Einstieg, Postgres + Auth + Storage in einem |
| **Hosting** | Vercel / Netlify (Free-Tier) für Frontend | **Kostenlos** für den Start, EU-Regionen wählbar (DSGVO) |
| **Datenhaltung EU** | EU-Region wählen | DSGVO, da du perspektivisch Nutzerkonten hast |

**Kostenbild Start:** Praktisch 0 € bis niedrige zweistellige Beträge/Monat, solange du auf Free-Tiers und Open Data bleibst. Genau das macht "trägt sich" realistisch — deine Fixkosten sind fast null.

### Hinweis "später leicht mobil" [FUNDAMENT]
Damit die Web-App ohne Neubau zur Mobile-App wird, zwei gangbare Wege — *jetzt* schon so bauen, dass einer davon leicht möglich ist:
- **PWA (Progressive Web App):** Die Web-App wird "installierbar" und offline-fähig, ohne echten App-Store-Aufwand. Einfachster Weg, guter Startpunkt.
- **React Native / Expo** oder **Capacitor:** echte App-Store-App aus weitgehend geteiltem Code. Aufwändiger, aber "echte App".
- **Praktische Konsequenz jetzt:** sauber komponierte React-Struktur, Logik von Darstellung trennen, keine reinen Desktop-Annahmen (Touch-freundlich, responsive von Anfang an). Dann ist der Wechsel später Feinschliff, kein Neubau.

### Architektur-Trennung [FUNDAMENT]
Kapsle drei Dinge sauber getrennt, weil sie sich unabhängig ändern:
1. **Legalitäts-Datenschicht** (dein Wert, ändert sich, muss pflegbar sein).
2. **Karten-/Routing-Schicht** (externe Open-Data-Dienste, können wechseln).
3. **Affiliate-/Produkt-Schicht** (Platzhalter jetzt, echte Links später — als eigene Schicht, damit das Anbinden später ein Handgriff ist).

---

## 7. Die Affiliate-Ebene vorbereiten, ohne sie anzubinden [JETZT-vorbereitet]

Du willst die Struktur da haben, auch ohne echte Anbindung. Konkret:

- Ein **Datenmodell für Ausrüstungs-Items** (siehe DB unten) mit einem Feld `affiliate_url` (jetzt leer/Platzhalter) und `vendor`.
- Im UI erscheint bei Ausrüstungsteilen bereits ein **"Kaufen"-Element** (Button/Link), das aktuell auf einen Platzhalter zeigt oder dezent als "bald verfügbar" markiert ist.
- Eine zentrale **Affiliate-Konfiguration** (eine Datei/Tabelle), in der du später echte Links/Partner-IDs einträgst — ohne Code-Umbau.

So kannst du auf Social Media ehrlich zeigen "hier entsteht die Ausrüstungsempfehlung", und das Umlegen auf echte Einnahmen ist später ein Konfigurationsschritt, kein Umbau.

---

## 8. Datenbank — Schema (schlank, erweiterbar) [FUNDAMENT]

Beginne minimal, aber lege die Struktur so an, dass die späteren Schichten passen.

### 8.1 `zones` (die Legalitäts-Zonen — dein Kern)
- `id`, `region` (z.B. "CH-VS" / "DE-BY-Alpen"), `name`
- `geometry` (GeoJSON-Polygon)
- `status` (allowed / forbidden / tolerated)
- `tent_allowed`, `vehicle_allowed`, `fire_allowed` (je: yes/no/conditional)
- `conditions` (Text: z.B. "nur oberhalb Baumgrenze")
- `source` (Quelle der Rechtsinfo), `source_url`, `last_verified` (Datum!)
- `notes`

### 8.2 `points` (Hütten, Campingplätze, legale Stellplätze)
- `id`, `region`, `type` (hut / campsite / vehicle_spot)
- `name`, `lat`, `lng`
- `info` (Öffnungszeiten, Preis, Kontakt), `source`, `last_verified`

### 8.3 `users` [BALD]
- `id`, `email`, `created_at`, `subscription_status` (free / paid)

### 8.4 `routes` [BALD]
- `id`, `user_id`, `name`, `geometry` (die gezeichnete Route), `region`, `created_at`

### 8.5 `gear_items` (Ausrüstungskatalog — trägt die Affiliate-Ebene)
- `id`, `name`, `category` (Schlafen / Kochen / Kleidung / …)
- `season` (Sommer/Winter/…), `min_temp` (für wetterbasierte Empfehlung)
- `vendor`, `affiliate_url` (**jetzt Platzhalter**), `price_hint`

### 8.6 `trips` [BALD]
- `id`, `user_id`, `route_id`, `start_date`, `days`, `persons`
- verknüpft mit generierter Packliste (aus `gear_items`)

> Für den [JETZT]-Start brauchst du real nur `zones` und `points`. Der Rest ist angelegt, aber leer.

---

## 9. Sicherheit & Recht (wichtiger als bei den meisten Apps)

- **[FUNDAMENT] Haftungs-Disclaimer, prominent und wiederholt.** Die Legalitäts-Aussage ist eine Orientierungshilfe, keine Rechtsberatung/-garantie. Nutzer muss vor Ort prüfen. Das schützt Vertrauen *und* dich. (Nähe zur Rechtsauskunft ernst nehmen, aber: reine Faktendarstellung "hier gilt Regel X" mit Quelle ist etwas anderes als individuelle Rechtsberatung — trotzdem sauber als Info framen.)
- **[FUNDAMENT] Quellen und Datum bei jeder Zone.** Transparenz macht die Info vertrauenswürdig und entschärft Haftung ("Stand: März 2026, Quelle: kantonales Geoportal").
- **[FUNDAMENT] DSGVO:** EU-Hosting, Datenschutzerklärung, Impressum, sobald Nutzerkonten/Tracking dazukommen. Datensparsamkeit.
- **[BALD] Auth sauber** (über Supabase o.ä., nicht selbst gebaut), sobald es Logins gibt.

---

## 10. Empfohlene Baureihenfolge

1. **[JETZT] Region wählen + Legalitäts-Daten sammeln.** *Bevor* du groß baust: für eine Region die Zonen/Punkte recherchieren (kantonale Geoportale, offizielle Quellen) und als GeoJSON erfassen. Das ist die eigentliche Arbeit und dein Wert.
2. **[JETZT] Web-App mit der einen Karten-Ansicht** (MapLibre + OSM + deine GeoJSON-Zonen), Infokarten, Haftungshinweis, Filter-Grundgerüst. Touch-freundlich/responsive bauen (für späteres Mobil).
3. **[JETZT] Affiliate-/Ausrüstungs-Struktur anlegen** (leer, Platzhalter) — damit sie vorführbar ist.
4. **→ Auf Social Media zeigen, Reichweite aufbauen, Feedback sammeln.**
5. **[BALD]** Routenzeichnen + Route-mit-Legalität, Ausrüstungsgenerator (mit vorbereiteter Affiliate-Ebene), Wetter, Login/Speichern.
6. **[SPÄTER]** Weitere Regionen, Offline, Mehrtages-Etappen, Anreise, echte Affiliate-Anbindung, Mobile-App-Feinschliff, Community-Meldungen.

---

## 11. Namensideen

"CampBuddy" (Arbeitsname) — einprägsam und freundlich, aber prüfe Verfügbarkeit (der Name ist generisch und evtl. schon vergeben). Weitere Richtungen:
- **Freistehen** (trifft die Wildcamping-Idee direkt)
- **Biwak / BiwakMap** (alpin, präzise)
- **Wildnächtig / Wildnacht**
- **Nordwand-Frei / Freinacht**
- **LegalZelt** (sehr beschreibend, wenig charmant)
- **Draussen** (breit, einprägsam)

Wähle etwas, das (a) auf Social Media als Handle frei ist, (b) die Legalitäts-/Draußen-Idee trägt, (c) ohne Umlaut-Probleme funktioniert.

---

## 12. Der ehrliche Schlussgedanke

Das ist die erste Idee dieser Suche, bei der Problem, Leidenschaft, unbesetzter Dreh und Bereitschaft zum Reichweitenaufbau zusammenkommen. Der Erfolg hängt an zwei Dingen — und beide sind *nicht* der Code:

1. **Die Rechtsdaten-Pflege** — mühsam, aber genau deshalb dein Burggraben. Wenn es leicht wäre, hätten es die Großen längst.
2. **Der Reichweitenaufbau** — die App ist das Werkzeug, aber die Community um das Legalitäts-Thema ist das eigentliche Geschäft. Deine Begeisterung ist hier kein Nice-to-have, sondern der Geschäftsfaktor.

Bau die eine Karte richtig gut. Zeig sie. Sieh, ob Menschen sie lieben. Dann baue Schicht um Schicht. Der Bauplan wartet — fang mit der Region an, die du selbst kennst.
