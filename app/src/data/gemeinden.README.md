# Kommunale Rechtspflege — so wird `gemeinden.legal.json` gefüllt

Diese Datei ist der eigentliche Wert des Projekts. Der Code darum herum ist in
einer Woche nachgebaut; eine belastbare Gemeindeliste nicht.

## Warum Gemeinde und nicht Kanton

Bundesrecht regelt die Schutzgebiete. Alles andere regeln Kanton und Gemeinde —
und entschieden wird es fast immer kommunal, über Polizeireglement,
Nutzungsplanung oder ein Verbot am Seeufer. Zwei Nachbargemeinden im selben
Kanton können es gegensätzlich halten. Eine kantonale Auskunft ist deshalb im
Zweifel eine falsche Auskunft.

## Der Schlüssel

Die **BFS-Nummer** als Zeichenkette, z. B. `"6002"`. Sie ist amtlich und
überlebt Umbenennungen und Fusionen sauberer als der Name. Welche Nummer eine
Gemeinde hat, steht in `gemeinden/CH.json` unter `properties.bfs`.

## Ein Eintrag

```json
"6002": {
  "status": "forbidden",
  "tent_allowed": "no",
  "vehicle_allowed": "no",
  "fire_allowed": "conditional",
  "summary": "Zwei bis vier Sätze: was hier gilt, in ganzen Sätzen.",
  "conditions": "Einschränkungen im Klartext, oder null.",
  "source": "Polizeireglement der Gemeinde X, Art. 12",
  "source_url": "https://…",
  "review_status": "quelle",
  "last_verified": "2026-08-23"
}
```

| Feld | Werte |
|---|---|
| `status` | `allowed` · `tolerated` · `forbidden` |
| `tent_allowed`, `vehicle_allowed`, `fire_allowed` | `yes` · `no` · `conditional` · `unknown` |
| `review_status` | `entwurf` · `quelle` · `vor-ort` |

`review_status` steuert das Kartenbild direkt:

- **`entwurf`** — abgeleitet, nicht belegt. Wird **schraffiert** gezeichnet und
  im Infofeld als unbestätigt ausgewiesen.
- **`quelle`** — mit benanntem amtlichem Dokument belegt. Volle Fläche.
- **`vor-ort`** — zusätzlich selbst geprüft. Volle Fläche, im Infofeld vermerkt.

Kein Eintrag heisst „noch nicht recherchiert" und wird neutral eingefärbt. Das
ist ein gültiger, ehrlicher Zustand — und deutlich besser als eine geratene Farbe.

## Die Regeln der Pflege

1. **Nie ohne Quelle.** `source` und `source_url` müssen auf ein Dokument oder
   eine Gemeindeseite zeigen, die die Aussage tatsächlich trägt. Eine
   E-Mail-Auskunft der Gemeinde zählt — dann `source` entsprechend benennen
   („Schriftliche Auskunft Gemeindeverwaltung, 12.03.2026").
2. **Nie ohne `last_verified`.** ISO-Datum des Tages, an dem die Quelle zuletzt
   gesehen wurde. Nicht das Datum des Reglements.
3. **Nichts erfinden.** Kein „vermutlich", keine Analogie vom Nachbarn, keine
   Ableitung aus dem Kanton. Im Zweifel: keinen Eintrag anlegen.
4. **`summary` in ganzen Sätzen**, für Menschen, nicht für Juristen. Was darf
   ich, was nicht, und woran hängt es.

## Der Weg über die Muster — so kommt Menge zustande

Einzeln recherchiert wären 2119 Gemeinden mehrere hundert Stunden. Der Hebel:
**nicht Gemeinden einstufen, sondern Formulierungen.** Sehr viele Gemeinden
übernehmen das Musterreglement ihres Kantons wortgleich — „Le camping, le
caravaning et ce qui leur est assimilable sont interdits en dehors des
emplacements autorisés" steht in Dutzenden Waadtländer und Walliser
Reglementen. Wer den Satz einmal gelesen und eingeordnet hat, hat ihn für alle
gelesen.

```bash
node scripts/recherche-gemeinden.mjs            # Reglemente suchen und auslesen
node scripts/gemeinden-einstufen.mjs            # Bericht: was würden die Muster abdecken
node scripts/gemeinden-einstufen.mjs --schreiben # eintragen
```

1. **`recherche-gemeinden.mjs`** sucht auf jeder Gemeindewebseite die
   Reglementsammlung, lädt das Polizeireglement, zerlegt es in Artikel und legt
   die Stellen zum Übernachten im Wortlaut in `import/recherche/kandidaten.json`.
   Er behauptet nie eine Rechtslage — er sammelt Belege.
2. **Du liest die Fundstellen** und trägst wiederkehrende Formulierungen in
   `gemeinden.muster.json` ein: woran man sie erkennt, und was sie bedeuten.
3. **`gemeinden-einstufen.mjs`** trägt die Muster auf alle passenden Gemeinden
   auf — **mit deren eigenem Reglement als Quelle**, samt Artikelnummer und
   Adresse, nie mit dem Muster. Anschliessend zieht es das Bundle nach, damit
   jede eingestufte Gemeinde auch ohne Datenbank auf der Karte erscheint.

Zwei eingebaute Bremsen, die du nicht lösen solltest:

- **`nur_im_titel: true`** für weit gefasste Muster. Bei manchen PDF-Layouts
  scheitert die Artikeltrennung und zieht zwei Artikel zusammen; das Muster
  griffe dann und legte die Regel unter der falschen Artikelnummer ab. Eine
  falsche Fundstellenangabe ist schlimmer als eine fehlende — sie behauptet
  Belegbarkeit, die bei der Nachprüfung zerfällt.
- **`review_status: 'entwurf'`** für Muster, deren Lesart eine Schlussfolgerung
  ist statt einer Feststellung. Sie erscheinen schraffiert.

Was kein Muster trifft, bleibt liegen. Das ist der Normalfall, kein Fehler.

## Wo die Quellen liegen

- Gemeindewebseiten — Reglemente meist unter „Reglemente" oder „Polizei".
- Kantonale Geoportale und Erlasssammlungen.
- `kantone.grundlagen.json` listet je Kanton die Erlasse, auf denen die
  Wildruhezonen beruhen — der Faden, an dem eine Recherche anfängt.
- Direkt nachfragen. `gemeinden/CH.json` führt `website` und `email` mit; die
  Karte zeigt beides im Infofeld an.
