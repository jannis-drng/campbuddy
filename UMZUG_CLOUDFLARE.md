# Umzug auf Cloudflare Pages

Diese Anleitung bringt CampBuddy von GitHub Pages auf Cloudflare Pages —
**ohne Ausfall**, weil beide Adressen eine Zeit lang parallel laufen. Der
Umschaltpunkt ist ein einziger Schritt am Ende, und er ist umkehrbar.

Warum überhaupt: unbegrenztes Datenvolumen (nötig, sobald ein eigener
Kachel-Proxy vor OpenTopoMap kommt), echte HTTP-Kopfzeilen (GitHub Pages kann
keine setzen — die Content-Security-Policy ist dort schlicht nicht möglich),
und cookielose Zugriffszahlen ohne Einwilligungsbanner.

---

## Was schon erledigt ist

Diese Punkte stecken bereits im Repo, es ist nichts mehr daran zu tun:

| Was | Wo |
|---|---|
| Sicherheits-Kopfzeilen samt strenger CSP | `app/_headers.vorlage` → wird beim Build zu `dist/_headers` |
| Welcher Ordner ausgeliefert wird | `app/wrangler.jsonc` |
| Basispfad an einer einzigen Stelle, für beide Hoster | `app/vite.config.ts` (`VITE_BASE`) |
| Social-Media-Adressen und Canonical ziehen mit | `app/index.html` (`%ORIGIN%%BASIS%`) |
| 404-Seite verlinkt richtig, egal unter welchem Pfad | `app/public/404.html` (`%BASIS%`) |
| Vorschau mit echten Kopfzeilen zum Nachprüfen | `node scripts/vorschau-kopfzeilen.mjs` |

Geprüft wurde damit lokal: Karte, Kacheln, Zonen, Symbole, Supabase-Daten,
Wetter, Routing, Startseite und 404-Seite laufen unter der vollen CSP
fehlerfrei. Der GitHub-Pages-Build bleibt Byte-für-Byte wie vorher.

### Was der Umzug tatsächlich bringt — messbar

Nicht nur Kosmetik: **GitHub Pages ignoriert `_headers` vollständig.** Es liefert
alles mit `cache-control: max-age=600` aus, also zehn Minuten. Die Kartendaten
tragen aber einen Inhalts-Hash im Namen und sollen unbegrenzt liegen bleiben —
genau das steht in `_headers` und wirkt heute nirgends.

Nachprüfbar mit einer Zeile:

```bash
curl -sI https://jannis-drng.github.io/campbuddy/ | grep -i cache-control
```

Praktisch trägt derzeit der Service Worker die Last: er hält die Dateien in
seinem eigenen Cache und fragt den Hoster gar nicht erst. Der Wiederbesuch ist
deshalb schon jetzt kostenlos. Was fehlt, ist die zweite Verteidigungslinie —
wer den Service Worker abgeschaltet hat oder ihn verliert, holt nach zehn
Minuten wieder alles. Auf Cloudflare greift `immutable`, und dieser Fall
verschwindet.

Was GitHub Pages richtig macht: komprimieren. Die Zonendatei geht mit 360 KB
statt 2,2 MB über die Leitung — das ist nicht der Grund für den Umzug.

---

## Schritt 0 — DNS für camping-map.com zu Cloudflare holen

Die Domain ist bei **IONOS** registriert und benutzt deren Nameserver
(`ns10xx.ui-dns.*`). Sie **bleibt dort registriert** — gewechselt wird nur, wer
die DNS-Einträge beantwortet. Ein echter Registrar-Umzug ist ohnehin gesperrt:
ICANN verbietet ihn in den ersten 60 Tagen nach der Registrierung. Nötig ist er
auch nicht; DNS-Betrieb bei Cloudflare ist kostenlos und vom Registrar
unabhängig.

Warum überhaupt umstellen, statt bei IONOS einfach einen CNAME zu setzen:
`camping-map.com` **ohne** `www` ist der Zonen-Apex, und dort verbietet der
DNS-Standard einen CNAME. Ein `A`-Eintrag scheidet aus, weil Cloudflare Workers
keine festen IP-Adressen haben, die man eintragen könnte. Cloudflare löst das
mit CNAME-Flattening — aber nur, wenn Cloudflare die Zone selbst hält.

1. <https://dash.cloudflare.com> → **Add a site** → `camping-map.com` → **Free**.
2. Cloudflare liest die vorhandenen Einträge ein. Bei einer frischen Domain ist
   das höchstens die IONOS-Parkseite — die darf weg.
3. Cloudflare nennt zwei Nameserver, etwa `xyz.ns.cloudflare.com`. Die Namen
   sind kontospezifisch; nimm die aus deinem Dashboard, nicht die aus einer
   Anleitung.
4. Bei IONOS: **Domains & SSL → camping-map.com → Nameserver → Nameserver
   ändern → Eigene Nameserver verwenden**. Beide Cloudflare-Adressen eintragen,
   die IONOS-Einträge ersetzen, speichern.
5. Warten, bis Cloudflare die Zone als **Active** meldet — meist Minuten, laut
   IONOS bis zu 24 Stunden.

Gegenprobe:

```bash
dig +short NS camping-map.com @1.1.1.1
```

Solange dort `ui-dns` steht, ist die Umstellung noch nicht durch.

**E-Mail beachten:** Gibt es zu dieser Domain ein IONOS-Postfach, müssen dessen
`MX`- und `TXT`-Einträge nach dem Wechsel in Cloudflare stehen — sonst kommt
keine Post mehr an. Bei einer frisch gekauften Domain ohne Postfach ist nichts
zu tun.

## Schritt 1 — Cloudflare-Konto und Projekt anlegen

Cloudflare führt neue Projekte inzwischen auf **Workers mit statischen
Dateien** statt auf klassische Pages-Projekte. Beides funktioniert; diese
Anleitung beschreibt den Workers-Weg, weil er der ist, den das Dashboard
anbietet.

1. Konto auf <https://dash.cloudflare.com/sign-up> anlegen (kostenlos, keine
   Kreditkarte).
2. **Compute (Workers) → Create → Import a repository**, dann
   `jannis-drng/campbuddy` auswählen.
3. Bei den Bau-Einstellungen eintragen:

   | Feld | Wert |
   |---|---|
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` (Vorgabe) |
   | Root directory | `app` |

   `Root directory: app` ist wichtig — die Web-App liegt nicht im
   Wurzelverzeichnis des Repos.

**Ein Feld „Build output directory" gibt es hier nicht.** Welcher Ordner
ausgeliefert wird, steht in `app/wrangler.jsonc` (`assets.directory`). Ohne
diese Datei rät Cloudflare und liefert das Quellverzeichnis aus — dessen
`index.html` verweist auf `/src/main.tsx`, das es im Bau nicht gibt, und die
Seite bleibt **weiss**. Die Datei liegt im Repo; prüfe nur, dass `name` darin
genauso heisst wie dein Worker im Dashboard. Bei einem abweichenden Namen legt
`wrangler deploy` klammheimlich einen zweiten Worker an.

## Schritt 2 — Bau-Variablen setzen

**Nicht** unter *Variables and Secrets* bei den Laufzeit-Einstellungen. Ein
Worker, der nur statische Dateien ausliefert, hat keine Laufzeit-Variablen —
das Dashboard antwortet dort mit „Variables cannot be added to a Worker that
only has static assets".

Unsere Werte sind **Bau**-Variablen: Vite schreibt sie beim Bauen fest ins
Bundle, danach spielen sie keine Rolle mehr. Sie gehören nach

**Settings → Build → Build Variables and Secrets**

| Name | Wert |
|---|---|
| `VITE_BASE` | `/` |
| `VITE_ORIGIN` | `https://camping-map.com` — bis Schritt 5 durch ist, die workers.dev-Adresse |
| `VITE_SUPABASE_URL` | derselbe Wert wie in `app/.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | derselbe Wert wie in `app/.env.local` |
| `NODE_VERSION` | `22` |

Alle als **Plaintext**, keine als Secret: alle vier `VITE_`-Werte landen
ohnehin im ausgelieferten JavaScript und sind für jeden Besucher lesbar — das
Präfix `VITE_` *bedeutet* „geht in den Browser". Der Schutz bei Supabase kommt
aus Row Level Security, nicht aus Geheimhaltung. Als Secret markierte Werte
kannst du später nur überschreiben, nicht mehr auslesen.

Was wirklich geheim bleiben muss — etwa ein `sb_secret_…`-Schlüssel oder
später ein Affiliate-Token — bekommt **kein** `VITE_`-Präfix, wird nie im
Frontend gelesen und gehört in Worker-Code. *Dort* ist Secret richtig.

`VITE_BASE=/` ist der eigentliche Unterschied zu GitHub Pages: dort liegt die
App unter `/campbuddy/`, auf einer eigenen Domain unter der Wurzel.

**Variablen wirken erst beim nächsten Bau.** Nachträglich eingetragene Werte
ändern nichts am bereits ausgelieferten Stand — danach unter *Deployments*
einen neuen Bau anstossen.

## Schritt 3 — Auf der Cloudflare-Adresse prüfen

Cloudflare vergibt eine Adresse wie `campbuddy.<konto>.workers.dev`. Die ist sofort
live, öffentlich, und stört die bestehende Seite nicht. Dort durchgehen:

- Karte lädt, Kacheln erscheinen, Zonen sind eingefärbt.
- Browser-Konsole öffnen (F12): **keine** Meldung, die mit
  „Refused to … because it violates the following Content Security Policy"
  beginnt. Falls doch, fehlt der genannte Dienst in `app/_headers.vorlage` —
  dort in `connect-src` bzw. `img-src` ergänzen und neu deployen.
- Eine falsche Adresse aufrufen (`/gibtsnicht`) → die eigene 404-Seite.
- Anmeldung: funktioniert erst nach Schritt 4.

Gegenprobe, dass die Kopfzeilen wirklich ankommen:

```bash
curl -sI https://<deine-adresse> | grep -i "content-security-policy\|x-frame\|strict-transport"
```

## Schritt 4 — Supabase auf die neue Adresse hinweisen

**Ohne diesen Schritt bricht die Anmeldung.** Die App leitet nach dem Login auf
die Adresse zurück, unter der sie gerade läuft; Supabase akzeptiert das nur,
wenn die Adresse auf der Liste steht.

Supabase-Projekt → **Authentication → URL Configuration**:

- **Site URL**: `https://camping-map.com`
- **Redirect URLs**: alle Adressen eintragen, die es geben soll —
  `https://camping-map.com/**`, `https://www.camping-map.com/**`,
  `https://<projekt>.<konto>.workers.dev/**` und vorerst weiterhin
  `https://jannis-drng.github.io/campbuddy/**`.

Die Liste eng halten: jede Adresse hier ist eine Adresse, auf die ein
Anmelde-Token weitergereicht werden kann.

## Schritt 4b — eigener Mailversand

**Ohne diesen Schritt kann sich niemand ausser dir registrieren.** Der
Mailversand, den Supabase mitliefert, ist ausdrücklich nur zum Ausprobieren
gedacht: er nimmt **nur Adressen von Mitgliedern des Supabase-Projekts** an und
lässt **zwei E-Mails pro Stunde** durch. Alles darüber scheitert — und zwar
nicht als freundliche Auskunft, sondern als

```
POST /auth/v1/signup → 500  "error sending confirmation email"
```

Das Konto wird dabei nicht angelegt. Wer die Meldung im Browser sieht, sucht
den Fehler zwangsläufig bei sich und probiert andere Passwörter und Adressen
durch, obwohl an der Eingabe nie etwas falsch war.

Was tatsächlich schiefging, steht nur an einer Stelle: Supabase-Projekt →
**Logs → Auth Logs**. Dort nach der fehlgeschlagenen Anfrage sehen, die
SMTP-Antwort steht im Eintrag.

Abhilfe: einen eigenen Versender eintragen unter **Authentication → Emails →
SMTP Settings**. Passend zum Rest des Aufbaus (kostenlos, EU möglich, eigene
Domain):

| Dienst | Freikontingent |
|---|---|
| Resend | 3 000 Mails/Monat, 100/Tag |
| Brevo | 300 Mails/Tag |
| Mailgun / Postmark | kostenpflichtig, dafür zuverlässiger im Posteingang |

Absenderadresse auf der eigenen Domain (`noreply@camping-map.com`), und die
SPF-, DKIM- und DMARC-Einträge, die der Dienst nennt, ins **Cloudflare-DNS**
derselben Zone eintragen. Ohne die landen die Bestätigungsmails im Spam — was
sich vom Ausfall kaum unterscheidet, nur dass es niemand meldet.

Nach dem Umstellen die Sendegrenzen unter **Authentication → Rate Limits**
hochsetzen; sie stehen auf den Werten des eingebauten Versands.

## Schritt 5 — camping-map.com auf den Worker binden

Voraussetzung: Schritt 0 ist durch, die Zone steht in Cloudflare auf *Active*.

Worker → **Settings → Domains & Routes → Add → Custom domain**. Zweimal
eintragen:

- `camping-map.com`
- `www.camping-map.com`

Cloudflare legt die DNS-Einträge selbst an und stellt das Zertifikat aus; ein
CNAME von Hand ist nicht nötig. Nach wenigen Minuten sind beide Adressen live.

Damit nicht zwei gleichwertige Adressen nebeneinander stehen — Suchmaschinen
werten das ab, und die Anmelde-Rücksprünge werden unnötig verzweigt — eine
davon zur Hauptadresse machen. Empfehlung: **ohne `www`**, weil kürzer und weil
`VITE_ORIGIN` ohnehin so gesetzt ist. Die andere leitet um über **Rules →
Redirect Rules → Create rule**:

| Feld | Wert |
|---|---|
| Wenn | `Hostname` `equals` `www.camping-map.com` |
| Ziel-URL | *Dynamic*: `concat("https://camping-map.com", http.request.uri.path)` |
| Status | `301` |

Danach `VITE_ORIGIN` auf `https://camping-map.com` setzen (Schritt 2) und einmal
neu deployen — sonst zeigen Social-Media-Vorschau und Canonical weiterhin auf
die workers.dev-Adresse.

**Schreibweise durchhalten:** `campingmap.com` ohne Bindestrich gehört seit 2001
jemand anderem und ist aktiv. Wer den Namen ohne Bindestrich tippt, landet nicht
bei dir. In Profilen, Videos und Beschriftungen deshalb immer `camping-map.com`
schreiben — nie „campingmap" sagen, ohne den Bindestrich mitzunennen.

## Schritt 6 — Umschalten

Erst wenn Schritt 3 und 4 sauber durchlaufen sind:

1. In `app/scripts/deploy-pages.mjs` nichts ändern — GitHub Pages bleibt als
   Rückweg bestehen, bis du sicher bist.
2. Alle Links, die du selbst gesetzt hast (Social-Media-Profile, Lesezeichen),
   auf die neue Adresse ziehen.
3. Nach ein paar Tagen ohne Beschwerden: GitHub Pages im Repo unter
   **Settings → Pages → Source: None** abschalten. Danach `npm run deploy`
   nicht mehr benutzen — es würde ins Leere veröffentlichen.

**Rückweg:** Solange GitHub Pages an ist, genügt es, die alte Adresse wieder
zu verteilen. Es geht nichts verloren; beide Stände kommen aus demselben
Repo.

---

## Danach

- **Zugriffszahlen:** Worker → **Analytics → Web Analytics**
  einschalten. Cloudflare misst serverseitig, setzt keine Cookies und braucht
  deshalb kein Einwilligungsbanner. Das passt zur Datensparsamkeit aus der
  Spezifikation, Abschnitt 9.

  Nicht ganz serverseitig ist es allerdings: Cloudflare hängt der Seite beim
  Ausliefern ein Beacon-Skript von `static.cloudflareinsights.com` an, das die
  Ladezeiten im Browser misst. Die CSP muss diesen Host in `script-src` und
  `cloudflareinsights.com` in `connect-src` führen — beides steht in
  `app/_headers.vorlage`. Ohne die Einträge blockiert der Browser das Skript,
  die Messung bleibt leer, und in der Konsole steht ein CSP-Verstoss. Wer die
  Messung wieder abschaltet, streicht die beiden Hosts dort besser mit.
- **HSTS-Preload:** in `app/_headers.vorlage` bewusst *nicht* gesetzt. Erst
  erwägen, wenn die Domain samt allen Subdomains dauerhaft auf HTTPS läuft —
  der Eintrag ist praktisch nicht zurückzunehmen.
- **Kachel-Proxy:** der eigentliche Grund für Cloudflare. Ein Worker vor
  OpenTopoMap fängt deren Drosselung ab und cacht die Kacheln. Eigener
  Arbeitsschritt, hier noch nicht enthalten.

## Was diese Anleitung *nicht* löst

Die Kopfzeilen sichern die Auslieferung. Offen bleiben die Punkte aus dem
Sicherheitsdurchgang, die im Supabase-Dashboard und in der Anwendung liegen:
Mindestlänge für Passwörter auf 12, Schutz gegen bekannt gewordene Passwörter
einschalten, Rate Limits durchsehen — und die Migrationen `0008`–`0013`
einspielen. Ein Hoster-Wechsel ersetzt davon nichts.
