-- CampBuddy — die vier offenen Befunde des Supabase-Advisors abräumen
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- 0023 bis 0025 haben Lese- und Schreibseite in Ordnung gebracht. Was danach
-- übrig blieb, sind vier Meldungen des eingebauten Advisors. Keine davon ist
-- ein Loch — aber drei davon sind Stellen, an denen die Datenbank mehr
-- zugesteht, als irgendjemand braucht, und die vierte ist eine Tabelle, die
-- niemand mehr erreichen kann und trotzdem noch dasteht.
--
--   1. **`trips` ist unerreichbar.** Vier vollständige RLS-Regeln, aber kein
--      einziger `grant` — seit 0025, wo die Rechte einzeln vergeben wurden und
--      diese Tabelle schlicht durchs Raster fiel. Sie ist damit weder für
--      `anon` noch für `authenticated` lesbar oder beschreibbar, und `src/`
--      spricht sie an keiner Stelle an. Ihre Aufgabe hat `routes` übernommen:
--      `packliste`, `etappen`, `start_date`, `days`, `persons` stehen dort als
--      Spalten (0021). Eine Tabelle, die weder erreichbar noch gemeint ist,
--      ist kein Reservefach, sondern eine Falle für den Nächsten, der gegen
--      sie baut und den Fehler stundenlang woanders sucht.
--   2. **Zwei Views laufen als `SECURITY DEFINER`** — richtig so, aber
--      nirgends begründet. Der Advisor meldet das als ERROR, und wer die
--      Meldung ohne Begründung liest, „repariert" sie irgendwann kaputt.
--   3. **`name_pruefen` ist ohne Konto aufrufbar.** Die Funktion sagt, ob ein
--      Anzeigename noch frei ist. Aufgerufen wird sie ausschliesslich aus
--      angemeldetem Zustand (Namensfeld im Konto, Benutzernamen-Dialog nach
--      der Bestätigung). Offen für `anon` ist sie damit nur eines: eine
--      Möglichkeit, die Namen aller Nutzer durchzuprobieren.
--   4. **`pg_trgm` liegt in `public`.** Kosmetisch, aber `public` ist das
--      Schema, das die Web-API ausliefert — Erweiterungen gehören dort nicht
--      hin.

set lock_timeout = '20s';

-- ---------------------------------------------------------------------------
-- 1. `trips` entfernen
-- ---------------------------------------------------------------------------
-- Die Tabelle enthält beim Entfernen drei Zeilen, alle aus der Bauzeit: „test"
-- vom 20.08., „test" vom 20.08., „tet 2" vom 21.08. Alle drei ohne `route_id`,
-- alle drei von den beiden Entwicklungskonten. Das ist Prüfeingabe, keine
-- Nutzerarbeit — und weil die Tabelle seit 0025 ohnehin nicht mehr erreichbar
-- ist, konnte seither auch nichts Echtes mehr hinzugekommen sein.
--
-- Sollte je wieder eine eigenständige Tour-Tabelle nötig werden (etwa mehrere
-- Termine zur selben Route), gehört sie neu angelegt — mit Rechten diesmal.
drop table if exists public.trips;

-- ---------------------------------------------------------------------------
-- 2. Warum die beiden Views `SECURITY DEFINER` bleiben
-- ---------------------------------------------------------------------------
-- Der Advisor meldet das als Fehler, und im Normalfall ist es auch einer: eine
-- solche View umgeht die RLS des Fragenden. Genau das ist hier die Aufgabe.
--
-- `routes` lässt jeden nur seine eigenen Zeilen sehen (`auth.uid() = user_id`).
-- Eine veröffentlichte Tour soll aber jeder sehen — auch ohne Konto. Die
-- Alternative wäre eine zusätzliche Regel `using (is_public)` direkt auf
-- `routes`. Die wäre schlechter, und zwar aus einem Grund, der leicht zu
-- übersehen ist: `authenticated` hat auf `routes` Spaltenrechte auf *alle*
-- Spalten, `user_id` eingeschlossen. Eine solche Regel gäbe damit zu jeder
-- öffentlichen Tour die Konto-Kennung ihres Autors heraus. Die View gibt sie
-- nicht heraus — sie listet ihre Spalten einzeln auf, und `user_id` steht
-- nicht dabei.
--
-- Die Absicherung ist also nicht „RLS", sondern „diese Spaltenliste". Deshalb
-- prüft `npm run pruefen --prefix app` von aussen und mit dem öffentlichen
-- Schlüssel nach, dass keine `user_id` durchkommt. Wer hier eine Spalte
-- ergänzt, ergänzt dort die Prüfung.
comment on view public.oeffentliche_routen is
  'Veröffentlichte Touren, ohne user_id. SECURITY DEFINER ist Absicht: die RLS '
  'auf routes zeigt jedem nur seine eigenen Zeilen, öffentliche Touren sollen '
  'aber alle sehen. Der Schutz liegt in der Spaltenliste dieser View, nicht in '
  'RLS — user_id darf hier niemals auftauchen. Siehe Migration 0026 und '
  'scripts/backend-pruefen.mjs.';

comment on view public.oeffentliche_kommentare is
  'Kommentare zu veröffentlichten Touren, ohne user_id. SECURITY DEFINER aus '
  'demselben Grund wie oeffentliche_routen — siehe dort.';

-- ---------------------------------------------------------------------------
-- 3. `name_pruefen` braucht ein Konto
-- ---------------------------------------------------------------------------
-- Die Funktion beantwortet „ist dieser Name noch frei?". Für einen Angemeldeten
-- ist das eine Hilfe beim Ausfüllen; für einen Unangemeldeten ist es ein
-- Verzeichnisdienst über die Anzeigenamen aller Konten. Beide Aufrufstellen im
-- Frontend haben eine Sitzung, es geht also nichts verloren.
revoke execute on function public.name_pruefen(text) from anon;

-- ---------------------------------------------------------------------------
-- 4. `pg_trgm` aus dem ausgelieferten Schema nehmen
-- ---------------------------------------------------------------------------
-- Die Erweiterung trägt die Ähnlichkeitssuche über Tournamen
-- (`routes_public_name_trgm_idx`). Der Umzug ändert daran nichts: der Index
-- verweist auf die Operatorklasse über ihre interne Kennung, nicht über den
-- Schemanamen, und `extensions` steht bei Supabase ohnehin im Suchpfad aller
-- Rollen. Was sich ändert, ist nur, dass `public` wieder ausschliesslich
-- eigene Tabellen enthält — und `public` ist das Schema, das PostgREST nach
-- aussen anbietet.
alter extension pg_trgm set schema extensions;
