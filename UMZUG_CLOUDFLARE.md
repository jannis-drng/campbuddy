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
| Basispfad an einer einzigen Stelle, für beide Hoster | `app/vite.config.ts` (`VITE_BASE`) |
| Social-Media-Adressen und Canonical ziehen mit | `app/index.html` (`%ORIGIN%%BASIS%`) |
| 404-Seite verlinkt richtig, egal unter welchem Pfad | `app/public/404.html` (`%BASIS%`) |
| Vorschau mit echten Kopfzeilen zum Nachprüfen | `node scripts/vorschau-kopfzeilen.mjs` |

Geprüft wurde damit lokal: Karte, Kacheln, Zonen, Symbole, Supabase-Daten,
Wetter, Routing, Startseite und 404-Seite laufen unter der vollen CSP
fehlerfrei. Der GitHub-Pages-Build bleibt Byte-für-Byte wie vorher.

---

## Schritt 1 — Cloudflare-Konto und Projekt anlegen

1. Konto auf <https://dash.cloudflare.com/sign-up> anlegen (kostenlos, keine
   Kreditkarte).
2. Im Dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. GitHub verbinden und `jannis-drng/campbuddy` auswählen.
4. Im Formular **Set up builds and deployments** genau das eintragen:

   | Feld | Wert |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory (advanced) | `app` |

   Das `Root directory: app` ist wichtig — die Web-App liegt nicht im
   Wurzelverzeichnis des Repos.

## Schritt 2 — Umgebungsvariablen setzen

Noch im selben Formular unter **Environment variables**, für *Production*
**und** *Preview* (sonst bauen die Vorschau-Deploys kaputt):

| Name | Wert |
|---|---|
| `VITE_BASE` | `/` |
| `VITE_ORIGIN` | `https://<deine-domain>` — vorerst die pages.dev-Adresse |
| `VITE_SUPABASE_URL` | derselbe Wert wie in `app/.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | derselbe Wert wie in `app/.env.local` |
| `NODE_VERSION` | `22` |

Der publishable key darf hier stehen — er gehört ins Bundle und ist dafür
gemacht. Der Schutz kommt aus Row Level Security, nicht aus Geheimhaltung.
Ein `sb_secret_…`-Schlüssel gehört **niemals** hierher.

`VITE_BASE=/` ist der eigentliche Unterschied zu GitHub Pages: dort liegt die
App unter `/campbuddy/`, auf einer eigenen Domain unter der Wurzel.

Dann **Save and Deploy**. Der erste Build dauert ein bis zwei Minuten.

## Schritt 3 — Auf der pages.dev-Adresse prüfen

Cloudflare vergibt eine Adresse wie `campbuddy-abc.pages.dev`. Die ist sofort
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
curl -sI https://<deine-adresse>.pages.dev | grep -i "content-security-policy\|x-frame\|strict-transport"
```

## Schritt 4 — Supabase auf die neue Adresse hinweisen

**Ohne diesen Schritt bricht die Anmeldung.** Die App leitet nach dem Login auf
die Adresse zurück, unter der sie gerade läuft; Supabase akzeptiert das nur,
wenn die Adresse auf der Liste steht.

Supabase-Projekt → **Authentication → URL Configuration**:

- **Site URL**: die künftige Hauptadresse.
- **Redirect URLs**: alle Adressen eintragen, die es geben soll —
  `https://<deine-domain>/**`, `https://<projekt>.pages.dev/**` und
  vorerst weiterhin `https://jannis-drng.github.io/campbuddy/**`.

Die Liste eng halten: jede Adresse hier ist eine Adresse, auf die ein
Anmelde-Token weitergereicht werden kann.

## Schritt 5 — Eigene Domain verbinden (optional, aber empfohlen)

Ohne eigene Domain bleibt es bei `*.pages.dev` — funktioniert, wirkt aber
nicht wie ein Produkt.

**Domain bei Cloudflare gekauft oder schon dort verwaltet:** Pages-Projekt →
**Custom domains → Set up a domain**, Domain eintragen, fertig. Cloudflare
legt den DNS-Eintrag selbst an und stellt das Zertifikat aus.

**Domain bei einem anderen Anbieter:** Cloudflare zeigt einen `CNAME`-Eintrag
an, der beim bisherigen Anbieter einzutragen ist. Danach ein paar Minuten bis
wenige Stunden warten, bis die Änderung durchgereicht ist.

Danach `VITE_ORIGIN` in den Cloudflare-Variablen auf die endgültige Domain
setzen und einmal neu deployen — sonst zeigen Social-Media-Vorschau und
Canonical noch auf die pages.dev-Adresse.

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

- **Zugriffszahlen:** Pages-Projekt → **Analytics → Web Analytics**
  einschalten. Cloudflare misst serverseitig, setzt keine Cookies und braucht
  deshalb kein Einwilligungsbanner. Das passt zur Datensparsamkeit aus der
  Spezifikation, Abschnitt 9.
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
