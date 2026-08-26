# Monetarisierung — Fahrplan

*Stand: 26.08.2026. Ergänzt Abschnitt 5 der [Spezifikation](Freistehen_Spezifikation.md),
die dort skizzierte Reihenfolge wird hier korrigiert.*

---

## Die Entscheidung in drei Sätzen

**Kein Abonnement.** Basis sind ein Unterstützer-Link und die vorbereitete Affiliate-Ebene,
später ein einmalig bezahltes Komfort-Paket. Der grösste Hebel ist nicht die App, sondern
die Reichweite zum Thema — und langfristig die Lizenzierung der Rechtsdaten selbst.

## Das Leitprinzip

> **Die Legalitätsauskunft ist nie kostenpflichtig. Bezahlt wird Bequemlichkeit und Logistik.**

Zonen, Gemeindeeinstufungen, Quellen, `last_verified`, Meldungen: dauerhaft frei, ohne Konto,
ohne Zählwerk. Das ist nicht nur anständig, sondern strategisch richtig — „wo darf ich
schlafen" ist die Frage, die Reichweite erzeugt. „Speicher mir das offline und exportier's
als GPX" ist die Frage, für die jemand zahlt.

Jede Monetarisierungsidee wird an diesem Satz geprüft. Was die Rechtsauskunft verknappt,
verzögert oder an ein Konto bindet, fällt durch — unabhängig davon, wie gut es sich rechnet.

---

## Ausgangslage

| | Stand 26.08.2026 |
|---|---|
| Eingestufte Gemeinden | **131 von 2119** (6,2 %) — 128 mit Quelle belegt, 3 Entwurf |
| Musterformulierungen | 36 |
| Gebaute Funktionen | Karte, Filter, Routen, Etappen, Höhenprofil, Packliste, GPX, Wetter, Konten, Touren, Community-Meldungen, eigene Punkte, Service Worker |
| Fixkosten | praktisch null (Free-Tiers, Open Data, statische Kartendaten) |
| Nutzerzahl | — *(erst messen, siehe Kennzahlen unten)* |

**Der entscheidende Wert:** Die App kann funktional mehr, als die Datenlage trägt. Der Engpass
ist nicht Code, sondern Abdeckung. Solange die Karte für 94 % der Schweiz „keine Angabe,
frag die Gemeinde" sagt, ist jede Bezahlschranke ein Versprechen auf Kredit.

---

## Warum kein Abo — die vier Gründe

**1. Es verkauft ein Versprechen, das die Daten noch nicht halten.**
Wer zahlt, erwartet Vollständigkeit und Aktualität. Bei 6 % Abdeckung zahlt jemand dafür,
dass die Karte ihn an die Gemeinde verweist. Die erste Erstattungsanfrage kommt in Woche zwei.

**2. Bezahlung hebt die Haftungserwartung.**
Der Disclaimer trägt bei einem frei zugänglichen Orientierungsangebot weiter als bei einem
bezahlten Produkt. Bei einem Rechtsinformationsangebot ist das kein Detail.

**3. Der Preis passt nicht in den Markt.**
Park4Night Plus liegt in der Grössenordnung 10 €/Jahr, CampMap.ch ist gratis. 60 €/Jahr für
eine Regionalkarte ist chancenlos. *(Wettbewerbspreise vor einer Preisentscheidung neu prüfen.)*

**4. Der Overhead frisst den Ertrag.**
Zahlungsanbieter, Impressum, AGB, Widerrufsbelehrung mit Verzichtserklärung für digitale
Inhalte, Umsatzsteuer auf digitale Leistungen an EU-Verbraucher (OSS), Buchhaltung,
Kündigungsbutton. Das lohnt erst bei einigen hundert Zahlern. Bei 30 Abonnenten steht dem
Aufwand ein Ertrag von ~90 €/Monat gegenüber.

**Und der teuerste Punkt:** Ein Abo verknappt genau das, was Reichweite erzeugt. Die Karte
ist das Marketing. Wer sie nicht frei teilen kann, ist ein verlorener Multiplikator.

---

## Der Fahrplan

### Stufe 0 — jetzt: keine Mechanik, nur Vorbereitung

**Auslöser:** gilt ab sofort.

- Dezenter Unterstützer-Link (Ko-fi oder GitHub Sponsors — kein Konto für den Gebenden nötig,
  bei echter Gegenleistungsfreiheit ohne Umsatzsteuer). Ein Platz, unaufdringlich, kein Banner,
  kein Interstitial.
- Affiliate-Struktur bleibt wie sie ist (`app/src/affiliate/`), weiterhin ohne echte Links.
- **Besucherzählung aufsetzen**, datensparsam und ohne Cookie (z. B. selbst gehostetes Plausible
  oder die Cloudflare-Statistik). Ohne Zahlen ist jede folgende Stufe geraten.

**Erwarteter Ertrag:** 0–20 €/Monat. Das ist Kaffeegeld und soll es sein.

**Wohin die Energie stattdessen geht:** Gemeindeabdeckung. Über `gemeinden.muster.json`
skaliert die Einstufung nach Formulierung, nicht nach Gemeinde — das ist der einzige Weg,
von 6 % auf eine Zahl zu kommen, die ein Produkt trägt.

> **20 % der Schweiz sauber belegt ist mehr wert als jedes Bezahlmodell auf 6 %.**

---

### Stufe 1 — Reichweite: der Kanal, nicht die App

**Auslöser:** sobald regelmässig Inhalte zum Legalitätsthema veröffentlicht werden.

Das ist die in der Spezifikation unterschätzte Stufe. Bei einigen tausend Followern sind
direkte Markenkooperationen ein Vielfaches dessen wert, was In-App-Affiliate je einbringt —
und sie brauchen keine einzige Zeile Code. Die App ist das Beweisstück, der Kanal ist die
Einnahmequelle.

**Erwarteter Ertrag:** stark schwankend, aber bei belegter Nische die erste Stufe, auf der
dreistellige Monatsbeträge realistisch werden.

**Nicht tun:** die App für den Kanal verbiegen. Kein „folge uns"-Overlay, keine Registrierungs-
schranke für geteilte Ansichten.

---

### Stufe 2 — Affiliate ehrlich einordnen

**Auslöser:** ab ~5000 Besuchern/Monat *und* einer Packliste, die man ohne Konto zu Ende
bekommt.

Der richtige Ort ist die Packliste, aber mit realistischer Erwartung: Tourenplaner kaufen
selten spontan Ausrüstung — sie haben sie. Die Kennzeichnung als Werbelink ist Pflicht und
gehört sichtbar an den Link, nicht ins Impressum.

**Grössenordnung (alle Sätze vor dem Anbinden beim Partnerprogramm zu prüfen):**

| Annahme | Wert |
|---|---|
| Besucher/Monat | 5 000 |
| davon Packliste geöffnet | ~15 % → 750 |
| davon Klick auf Produktlink | ~8 % → 60 |
| davon Kauf | ~2 % → ~1 |
| Warenkorb × Provision | ~120 € × ~6 % |
| **Ertrag** | **~10–80 €/Monat**, stark streuend |

Fazit: nicht nichts, aber kein Geschäft. Affiliate ist ein Nebenstrom, kein Fundament — das
ist die wichtigste Korrektur gegenüber der Spezifikation, die es als „Haupthebel" führt.

---

### Stufe 3 — ein Komfort-Paket, einmalig bezahlt

**Auslöser, alle drei gleichzeitig:**
- ≥ 500 Gemeinden belegt eingestuft (~25 %),
- ≥ 300 wiederkehrende Nutzer/Monat,
- ≥ 50 gespeicherte Touren von echten Konten.

**Form:** Einmalzahlung ~15 €, alternativ ~9 €/Jahr. **Kein Monatsabo.** Bei einem
Nischenwerkzeug konvertiert die Einmalzahlung besser, und es entfällt die gesamte
Kündigungs- und Mahnverwaltung — bei einem Solo-Projekt der ausschlaggebende Punkt.

**Was hineingehört** (alles bereits gebaut oder fast):
- Offline-Karten für selbst gewählte Regionen
- unbegrenzt gespeicherte Touren *(frei: 3)*
- Mehrtages-Etappenplanung
- GPX-**Import** *(Export bleibt frei — er ist Datenportabilität, keine Zusatzleistung)*

**Was ausdrücklich nicht hineingehört:**
Zonen, Gemeindeeinstufungen, Quellen, `last_verified`, Meldungen, die Karte selbst, einzelne
Regionen der Legalitätsebene.

**Erwarteter Ertrag bei 300 wiederkehrenden Nutzern und 3 % Umwandlung:** ~9 Käufe,
~135 € — einmalig, nicht monatlich. Erst ab dem Zehnfachen an Nutzern wird das relevant.

**Was gleichzeitig fällig wird:** Impressum, Datenschutzerklärung, AGB, Widerrufsbelehrung
mit Verzichtserklärung, Umsatzsteuerfrage klären (Kleinunternehmerregelung, OSS bei
EU-Verbrauchern), Gewerbeanmeldung prüfen. Vor dieser Stufe einmal fachlich beraten lassen —
diese Liste ist eine Merkhilfe, keine Rechtsauskunft.

---

### Stufe 4 — der eigentliche Wert: die Daten lizenzieren

**Auslöser:** ≥ 1000 belegt eingestufte Gemeinden (~50 %) und nachweisbare, laufende Pflege.

Wenn CampBuddy als Einziges eine belegte, gemeindegenaue Legalitätsebene für die Schweiz hat,
ist die lizenzierbar: Camper- und Van-Vermieter, Tourismusorganisationen, Versicherer, andere
Outdoor-Apps. Ein einziger Lizenzvertrag schlägt hunderte Endkundenkäufe.

Voraussetzung ist genau das, woran ohnehin alles hängt: Abdeckung und belegte Pflege. Deshalb
landet jede Überlegung in diesem Dokument am selben Ort.

**Vorher zu klären:** unter welcher Lizenz die eigenen Rechtsdaten stehen. Wer sie später
verkaufen will, darf sie vorher nicht unter eine Lizenz stellen, die kommerzielle Nutzung
durch Dritte freigibt. Die OSM-Geometrie (ODbL) bleibt davon unberührt und getrennt —
sie ist nicht der verkaufte Teil.

---

## Übersicht

| Stufe | Auslöser | Ertrag/Monat (Schätzung) | Aufwand |
|---|---|---|---|
| 0 Unterstützer-Link | sofort | 0–20 € | Stunden |
| 1 Reichweite/Kooperationen | regelmässige Inhalte | 0–500 € | laufend, ausserhalb der App |
| 2 Affiliate | ~5000 Besucher/Monat | 10–80 € | Tage |
| 3 Komfort-Paket | 25 % Abdeckung + 300 Wiederkehrer | ~135 € einmalig je Kohorte | Wochen + Rechtspflichten |
| 4 Datenlizenz | 50 % Abdeckung | vierstellig je Vertrag | Verhandlung |

*Alle Beträge sind Grössenordnungen aus den oben offengelegten Annahmen, keine Prognose.
Sobald echte Besucherzahlen vorliegen, hier ersetzen.*

---

## Dauerhaft ausgeschlossen

- **Werbebanner.** Zerstört die Glaubwürdigkeit eines Rechtsinformationsangebots, bricht die
  CSP auf und zieht Einwilligungsbanner nach sich.
- **Regionsweises Freischalten der Legalitätsebene.** Bestraft genau die Nutzer, die
  weiterreisen — die besten.
- **Kontozwang zum Ansehen der Karte.** Widerspricht dem Leitprinzip und der Spezifikation.
- **Bezahlte Bevorzugung von Punkten** (Campingplatz zahlt für Sichtbarkeit). Sobald Geld die
  Kartendarstellung beeinflusst, ist die Datenehrlichkeit weg.
- **Verkauf von Nutzerdaten oder Standortverläufen.** Keine Diskussion.

---

## Kennzahlen, die vor allem anderen gebraucht werden

Ohne diese Zahlen ist jede Stufe ab 2 geraten:

1. Besucher/Monat und Anteil Wiederkehrer
2. Anteil der Besuche, die eine Gemeinde oder Zone anklicken *(misst, ob die Rechtsdaten
   überhaupt der Grund für den Besuch sind)*
3. Anteil eingestufter Gemeinden — die einzige Kennzahl, die den Produktwert direkt misst
4. gespeicherte Touren pro Konto
5. Meldungen aus der Community pro Monat *(misst, ob eine Pflege-Gemeinschaft entsteht)*

---

## Offene Entscheidungen

- **Zahlungsanbieter** für Stufe 3 (Stripe vs. Lemon Squeezy/Paddle als Reseller —
  Letztere nehmen die Umsatzsteuerpflicht ab, kosten dafür mehr).
- **Lizenz der eigenen Rechtsdaten** — vor der ersten Veröffentlichung eines Datenexports
  festlegen, nicht danach.
- **Wettbewerbspreise neu erheben**, bevor eine Zahl auf die Seite kommt.
