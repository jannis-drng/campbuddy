-- CampBuddy — das Backend für viele Besucher zurechtrücken
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Vier Dinge, die erst weh tun, wenn die App tatsächlich benutzt wird:
--
--   1. **Die Kartendaten hängen noch an der öffentlichen API.** `zones`,
--      `points`, `gemeinden`, `nature`, `peaks` liegen seit dem Umstieg auf
--      die statischen Dateien unbenutzt in der Datenbank — aber `select`
--      steht weiterhin für `anon` offen. Rund 15 MB, ohne Anmeldung,
--      beliebig oft abrufbar. Die App fragt sie seit `data/snapshot.ts`
--      nicht mehr; wer sie dort abruft, ist ein Crawler oder ein Versehen.
--      Beides zahlt aus demselben Egress-Kontingent wie die echten Besucher.
--   2. **Jede RLS-Regel ruft `auth.uid()` pro Zeile auf.** In `(select …)`
--      gewickelt wertet PostgreSQL den Aufruf einmal je Abfrage aus statt
--      einmal je Zeile. Bei zwei Zeilen ist das egal, bei zweitausend
--      gespeicherten Touren ist es der Unterschied.
--   3. **Fremdschlüssel ohne Index.** Beim Löschen eines Kontos sucht
--      PostgreSQL die abhängigen Zeilen — ohne Index mit einem vollen
--      Durchgang je Tabelle.
--   4. **Trigger-Funktionen sind als RPC aufrufbar.** `/rest/v1/rpc/
--      handle_new_user` steht `anon` offen, obwohl die Funktion nur als
--      Trigger gedacht ist. Eine `security definer`-Funktion, die niemand
--      aufrufen soll, gehört auch niemandem zum Aufruf hingelegt.

set lock_timeout = '20s';

-- ---------------------------------------------------------------------------
-- 1. Kartendaten aus der öffentlichen API nehmen
-- ---------------------------------------------------------------------------
-- Die Daten bleiben stehen — sie sind der Fundus für den Import, und der geht
-- über `app/import/`, nicht über PostgREST. Entzogen wird nur der Weg über
-- die Web-API. Wer sie dort wieder braucht, gibt gezielt frei; ein pauschales
-- `to anon` gehört bei Tabellen dieser Grösse nicht mehr hin.
do $$
declare t text; p text;
begin
  foreach t in array array['zones', 'points', 'gemeinden', 'nature', 'peaks', 'gear_items']
  loop
    for p in select policyname from pg_policies
              where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

comment on table public.zones is
  'Legalitätszonen. Nicht mehr über die Web-API lesbar: die Karte lädt ihre '
  'Geometrie aus den statischen Snapshot-Dateien (app/src/data/snapshot.ts). '
  'Diese Tabelle ist der Fundus für den Import, nicht die Auslieferung.';

-- `gesperrte_namen` hat RLS an und keine Regel — genau richtig, gelesen wird
-- sie nur aus `name_pruefen()` heraus. Damit das kein Zufall bleibt:
revoke all on public.gesperrte_namen from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. RLS: auth.uid() einmal statt je Zeile
-- ---------------------------------------------------------------------------
-- Gleiche Bedingungen, nur in `(select …)` gewickelt. Die Klammern sind nicht
-- Kosmetik: ohne sie fällt die Optimierung weg.

alter policy "Eigenes Profil lesen"   on public.profiles using ((select auth.uid()) = id);
alter policy "Eigenes Profil ändern"  on public.profiles using ((select auth.uid()) = id);
alter policy "Eigenes Profil anlegen" on public.profiles with check ((select auth.uid()) = id);

alter policy "Eigene Routen lesen"   on public.routes using ((select auth.uid()) = user_id);
alter policy "Eigene Routen ändern"  on public.routes using ((select auth.uid()) = user_id);
alter policy "Eigene Routen löschen" on public.routes using ((select auth.uid()) = user_id);
alter policy "Eigene Routen anlegen" on public.routes with check ((select auth.uid()) = user_id);

alter policy "Eigene Touren lesen"   on public.trips using ((select auth.uid()) = user_id);
alter policy "Eigene Touren ändern"  on public.trips using ((select auth.uid()) = user_id);
alter policy "Eigene Touren löschen" on public.trips using ((select auth.uid()) = user_id);
alter policy "Eigene Touren anlegen" on public.trips with check ((select auth.uid()) = user_id);

alter policy "Eigene Favoriten lesen"     on public.favorites using ((select auth.uid()) = user_id);
alter policy "Eigene Favoriten entfernen" on public.favorites using ((select auth.uid()) = user_id);
alter policy "Eigene Favoriten setzen"    on public.favorites with check ((select auth.uid()) = user_id);

alter policy "Eigene Likes lesen"     on public.likes using ((select auth.uid()) = user_id);
alter policy "Eigene Likes entfernen" on public.likes using ((select auth.uid()) = user_id);
alter policy "Likes setzen"           on public.likes
  with check ((select auth.uid()) = user_id and public.ist_oeffentliche_route(route_id));

alter policy "Eigene Kommentare lesen"   on public.kommentare using ((select auth.uid()) = user_id);
alter policy "Eigene Kommentare löschen" on public.kommentare using ((select auth.uid()) = user_id);
alter policy "Kommentare schreiben"      on public.kommentare
  with check ((select auth.uid()) = user_id and public.ist_oeffentliche_route(route_id));

alter policy "Eigene Kommentar-Likes lesen"     on public.kommentar_likes using ((select auth.uid()) = user_id);
alter policy "Eigene Kommentar-Likes entfernen" on public.kommentar_likes using ((select auth.uid()) = user_id);
alter policy "Kommentar-Likes setzen"           on public.kommentar_likes
  with check ((select auth.uid()) = user_id and public.ist_oeffentlicher_kommentar(kommentar_id));

alter policy "Melden darf jeder" on public.meldungen
  with check (melder is null or melder = (select auth.uid()));

-- Eigene Punkte: zwei erlaubende SELECT-Regeln auf derselben Tabelle heissen,
-- dass PostgreSQL für jede Zeile beide auswertet und verodert. Eine Regel mit
-- dem Oder darin ist dieselbe Aussage und ein Durchgang statt zwei.
drop policy if exists "Öffentliche Punkte sind für alle lesbar" on public.eigene_punkte;
alter policy "Eigene Punkte lesen" on public.eigene_punkte
  using (ist_oeffentlich or (select auth.uid()) = user_id);
comment on table public.eigene_punkte is
  'Selbst gesetzte Punkte. Eine SELECT-Regel für beide Fälle (öffentlich '
  'oder eigen) — zwei erlaubende Regeln kosten den doppelten Durchgang.';

alter policy "Eigene Punkte anlegen" on public.eigene_punkte with check ((select auth.uid()) = user_id);
alter policy "Eigene Punkte ändern"  on public.eigene_punkte
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Eigene Punkte löschen" on public.eigene_punkte using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Fremdschlüssel indizieren
-- ---------------------------------------------------------------------------
-- Jeder dieser Indizes deckt ein `on delete cascade` ab. Ohne ihn liest das
-- Löschen einer Route die ganze Kommentartabelle.
create index if not exists favorites_route_idx           on public.favorites (route_id);
create index if not exists likes_route_idx               on public.likes (route_id);
create index if not exists kommentar_likes_kommentar_idx on public.kommentar_likes (kommentar_id);
create index if not exists kommentare_user_idx           on public.kommentare (user_id);
create index if not exists meldungen_melder_idx          on public.meldungen (melder) where melder is not null;
create index if not exists trips_route_idx               on public.trips (route_id);

-- ---------------------------------------------------------------------------
-- 4. Was nur Trigger ist, aus der RPC-Oberfläche nehmen
-- ---------------------------------------------------------------------------
-- Ein Trigger läuft als Eigentümer der Tabelle, unabhängig von `execute`.
-- Diese Funktionen brauchen also niemanden, der sie aufrufen darf.
do $$
declare f text;
begin
  foreach f in array array[
    'autor_braucht_namen()', 'handle_new_user()', 'kommentar_einhaengen()',
    'kommentar_likes_zaehlen()', 'kommentare_text_pruefen()',
    'profiles_namen_pruefen()', 'zaehler_pflegen()', 'rls_auto_enable()',
    'routes_rahmen_setzen()', 'routes_veroeffentlicht_stempel()',
    'umbenennen_sperrfrist()', 'text_pruefen(text)'
  ]
  loop
    execute format('revoke all on function public.%s from anon, authenticated, public', f);
  end loop;
end $$;

-- `ist_oeffentliche_route` und `ist_oeffentlicher_kommentar` bleiben
-- aufrufbar: sie stehen in RLS-Regeln, und die werden mit den Rechten des
-- Fragenden ausgewertet. `name_pruefen` bleibt, weil das Anmeldeformular sie
-- braucht, `touren_bei`, weil die Ortssuche sie braucht.

-- ---------------------------------------------------------------------------
-- 5. Fester search_path für den Rest
-- ---------------------------------------------------------------------------
-- Ohne festgelegten Pfad entscheidet die Sitzung des Aufrufers, welche
-- Tabelle `routes` meint.
alter function public.entfernung_zum_verlauf(jsonb, double precision, double precision)
  set search_path = public, pg_temp;
alter function public.namen_normalisieren(text)        set search_path = public, pg_temp;
alter function public.rahmen_aus_geometrie(jsonb)      set search_path = public, pg_temp;
alter function public.routes_rahmen_setzen()           set search_path = public, pg_temp;
alter function public.routes_veroeffentlicht_stempel() set search_path = public, pg_temp;
alter function public.umbenennen_sperrfrist()          set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss abgewiesen werden (keine Kartendaten mehr über die API):
--   curl "$SUPABASE_URL/rest/v1/gemeinden?select=bfs&limit=1" -H "apikey: $KEY"
--   -> {"code":"42501", …} statt einer Zeile
--
-- Muss weiter gehen (die App selbst):
--   curl "$SUPABASE_URL/rest/v1/oeffentliche_routen?select=id&limit=1" -H "apikey: $KEY"
