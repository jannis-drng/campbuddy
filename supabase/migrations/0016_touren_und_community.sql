-- CampBuddy — eine Tour statt Route und Tour, und eine Community, die auch
-- bei tausend Einträgen noch trägt.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Diese Migration macht drei Dinge:
--   1. `routes` wird zur Tour: die Eckdaten aus `trips` ziehen ein.
--   2. Likes und Kommentare kommen dazu, mit gezählten Spalten statt
--      Unterabfragen — sonst kostet jede Listenseite so viel wie die ganze
--      Tabelle.
--   3. Die View `oeffentliche_routen` gibt das Neue mit heraus, weiterhin
--      ohne `user_id`.

-- ---------------------------------------------------------------------------
-- 1. Route und Tour waren dasselbe, nur in zwei Tabellen
-- ---------------------------------------------------------------------------
-- Der Entwurf trennte den Verlauf (`routes`) von den Eckdaten (`trips`, mit
-- optionalem `route_id`). In der Oberfläche hiess das: zweimal speichern,
-- zwei Listen, und die Frage „ist meine Tour jetzt die Route oder die Tour?"
-- war nicht zu beantworten. Was jemand plant, ist *eine* Sache — ein Weg mit
-- einem Datum, einer Dauer und einer Packliste.
--
-- `routes` bleibt die Tabelle (Umbenennen bräche jede bestehende Policy, jeden
-- Fremdschlüssel und die View); sie trägt ab jetzt beides.

alter table public.routes
  add column if not exists start_date date,
  add column if not exists days int check (days between 1 and 60),
  add column if not exists persons int check (persons between 1 and 20),
  add column if not exists elevation int check (elevation between 0 and 5000),
  add column if not exists season text check (season in ('sommer', 'uebergang', 'winter')),
  add column if not exists shelter text check (shelter in ('zelt', 'biwak', 'huette')),
  -- Kenngrössen einmal beim Speichern berechnet. Ohne sie müsste die
  -- Übersicht für jede Karte das Höhenprofil neu abfragen.
  add column if not exists distance_m int,
  add column if not exists ascent_m int,
  add column if not exists duration_s int,
  -- Wann die Tour geteilt wurde. Nicht dasselbe wie `created_at`: eine drei
  -- Monate alte Tour, die heute veröffentlicht wird, ist in der Community neu.
  add column if not exists veroeffentlicht_am timestamptz,
  add column if not exists likes_count int not null default 0,
  add column if not exists kommentare_count int not null default 0;

comment on table public.routes is
  'Eine Tour: Verlauf, Eckdaten und Community-Zähler in einer Zeile. '
  'Nur für die eigene Zeile lesbar — Geteiltes läuft über die View '
  'oeffentliche_routen, niemals per Policy für Dritte öffnen, sonst liegt '
  'user_id wieder offen.';

-- Bestandsdaten: jede Tour, die an einer Route hing, zieht in sie ein.
-- `distinct on` nimmt die jüngste, falls jemand mehrere Touren zur selben
-- Route angelegt hat — die älteren bleiben in `trips` erhalten.
update public.routes r
   set start_date = coalesce(r.start_date, t.start_date),
       days       = coalesce(r.days, t.days),
       persons    = coalesce(r.persons, t.persons),
       elevation  = coalesce(r.elevation, t.elevation),
       season     = coalesce(r.season, t.season),
       shelter    = coalesce(r.shelter, t.shelter),
       distance_m = coalesce(r.distance_m, t.distance_m),
       ascent_m   = coalesce(r.ascent_m, t.ascent_m),
       duration_s = coalesce(r.duration_s, t.duration_s)
  from (
    select distinct on (route_id)
           route_id, start_date, days, persons, elevation, season, shelter,
           distance_m, ascent_m, duration_s
      from public.trips
     where route_id is not null
     order by route_id, created_at desc
  ) t
 where r.id = t.route_id;

-- Touren ohne gezeichneten Weg haben keine Geometrie. Sie gehen trotzdem
-- mit — sonst verschwände gespeicherte Planung aus der Oberfläche, nur weil
-- sie in der falschen Tabelle stand. Eine leere Linie ist die ehrliche
-- Darstellung: „Tour vorhanden, Weg nicht gezeichnet."
insert into public.routes
  (user_id, name, region, geometry, waypoints, created_at,
   start_date, days, persons, elevation, season, shelter,
   distance_m, ascent_m, duration_s)
select t.user_id, t.name, coalesce(t.region, 'CH'),
       '{"type":"LineString","coordinates":[]}'::jsonb, null, t.created_at,
       t.start_date, t.days, t.persons, t.elevation, t.season, t.shelter,
       t.distance_m, t.ascent_m, t.duration_s
  from public.trips t
 where t.route_id is null
   and not exists (
     -- Nicht zweimal einspielen, falls diese Migration erneut läuft.
     select 1 from public.routes r
      where r.user_id = t.user_id and r.name = t.name and r.created_at = t.created_at
   );

comment on table public.trips is
  'Alt. Wird nicht mehr beschrieben — die Eckdaten stehen seit Migration 0016 '
  'in routes. Bleibt als Sicherung des Bestands stehen; erst löschen, wenn '
  'sicher ist, dass die Übernahme vollständig war.';

-- Wer schon vor dieser Migration veröffentlicht hat, hat kein
-- Veröffentlichungsdatum. Das Anlagedatum ist die beste verfügbare Auskunft.
update public.routes
   set veroeffentlicht_am = created_at
 where is_public and veroeffentlicht_am is null;

-- Setzt das Datum beim Veröffentlichen und räumt es beim Zurückziehen weg.
-- Im Client wäre das eine Zeile, die man vergisst, sobald es einen zweiten
-- Weg zum Veröffentlichen gibt.
create or replace function public.routes_veroeffentlicht_stempel()
returns trigger
language plpgsql
as $$
begin
  -- Auf INSERT gibt es kein `old`; die Verzweigung fasst es deshalb gar nicht
  -- erst an, statt sich auf sein Verhalten bei NULL zu verlassen.
  if tg_op = 'INSERT' then
    new.veroeffentlicht_am := case when new.is_public then now() else null end;
  elsif new.is_public and not coalesce(old.is_public, false) then
    new.veroeffentlicht_am := now();
  elsif not new.is_public then
    new.veroeffentlicht_am := null;
  end if;
  return new;
end;
$$;

drop trigger if exists routes_veroeffentlicht_stempel on public.routes;
create trigger routes_veroeffentlicht_stempel
  before insert or update of is_public on public.routes
  for each row execute function public.routes_veroeffentlicht_stempel();

-- ---------------------------------------------------------------------------
-- 2. Ist diese Tour öffentlich?
-- ---------------------------------------------------------------------------
-- Gebraucht in den Policies unten. Eine gewöhnliche Unterabfrage auf `routes`
-- liefe dort mit den Rechten des Fragenden und sähe fremde Zeilen nicht — sie
-- würde also jeden Kommentar unter einer fremden Tour ablehnen. Deshalb
-- `security definer`, und deshalb gibt die Funktion nur ein Ja/Nein heraus,
-- nie die Zeile.
create or replace function public.ist_oeffentliche_route(ziel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.routes where id = ziel and is_public);
$$;

revoke all on function public.ist_oeffentliche_route(uuid) from public;
grant execute on function public.ist_oeffentliche_route(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Likes
-- ---------------------------------------------------------------------------
-- Bewusst getrennt von `favorites`. Die beiden sehen sich ähnlich, meinen
-- aber Verschiedenes: ein Like ist ein Zuruf an die Urheberin und öffentlich
-- gezählt, ein Favorit ist die eigene Merkliste und geht niemanden etwas an.
-- In einer Tabelle mit einem Flag wäre spätestens beim ersten „zeig mir alle,
-- die das gemerkt haben" die Grenze verwischt.
create table if not exists public.likes (
  user_id uuid not null references auth.users on delete cascade,
  route_id uuid not null references public.routes on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, route_id)
);

alter table public.likes enable row level security;

-- Lesen darf man nur die eigenen: die Zahl steht öffentlich in
-- `likes_count`, *wer* geliked hat, ist niemandes Sache.
drop policy if exists "Eigene Likes lesen" on public.likes;
create policy "Eigene Likes lesen" on public.likes
  for select using (auth.uid() = user_id);

drop policy if exists "Likes setzen" on public.likes;
create policy "Likes setzen" on public.likes
  for insert with check (
    auth.uid() = user_id and public.ist_oeffentliche_route(route_id)
  );

drop policy if exists "Eigene Likes entfernen" on public.likes;
create policy "Eigene Likes entfernen" on public.likes
  for delete using (auth.uid() = user_id);

comment on table public.likes is
  'Wer was geliked hat. Nur für die eigene Zeile lesbar — öffentlich ist '
  'ausschliesslich die Zahl in routes.likes_count.';

-- ---------------------------------------------------------------------------
-- 4. Kommentare
-- ---------------------------------------------------------------------------
-- `autor` wird beim Schreiben aus dem Profil mitgegeben, genau wie bei
-- `routes.autor`: niemand soll seine Mailadresse veröffentlichen müssen, um
-- etwas zu sagen. `user_id` bleibt in der Tabelle (für Löschen und für die
-- Moderation), verlässt sie aber nie — dafür sorgt die View weiter unten.
create table if not exists public.kommentare (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  autor text,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists kommentare_route_idx
  on public.kommentare (route_id, created_at desc);

alter table public.kommentare enable row level security;

-- Fremde Kommentare gibt die Tabelle nie heraus. Wer sie lesen will, liest die
-- View `oeffentliche_kommentare` — die hat keine `user_id`. Die eigene Zeile
-- ist lesbar, weil `eigene_kommentar_ids` weiter unten sie braucht; dort steht
-- ohnehin nur die eigene ID, die man selbst schon kennt.
drop policy if exists "Kommentare schreiben" on public.kommentare;
create policy "Kommentare schreiben" on public.kommentare
  for insert with check (
    auth.uid() = user_id and public.ist_oeffentliche_route(route_id)
  );

drop policy if exists "Eigene Kommentare löschen" on public.kommentare;
create policy "Eigene Kommentare löschen" on public.kommentare
  for delete using (auth.uid() = user_id);

-- Die Lesesicht: ohne user_id, und nur zu Touren, die öffentlich sind. Zieht
-- jemand seine Tour zurück, verschwinden die Kommentare mit ihr aus der
-- Sicht — sie bleiben in der Tabelle, falls sie wieder veröffentlicht wird.
drop view if exists public.oeffentliche_kommentare;
create view public.oeffentliche_kommentare
  with (security_invoker = false) as
  select k.id, k.route_id, k.autor, k.text, k.created_at
    from public.kommentare k
    join public.routes r on r.id = k.route_id
   where r.is_public;

comment on view public.oeffentliche_kommentare is
  'Kommentare ohne user_id, nur zu öffentlichen Touren. Die where-Klausel '
  'ersetzt die RLS der Basistabelle — bei Änderungen zuerst prüfen, ob sie '
  'noch auf is_public einschränkt.';

grant select on public.oeffentliche_kommentare to anon, authenticated;

-- Damit jemand seinen eigenen Kommentar löschen kann, muss er ihn erkennen.
-- Die View gibt dafür nur die IDs heraus — kein Text, keine fremde Zeile.
-- `security_invoker = true`: sie liest mit den Rechten des Fragenden und
-- filtert damit über die Policy unten auf dessen eigene Zeilen.
drop view if exists public.eigene_kommentar_ids;
create view public.eigene_kommentar_ids
  with (security_invoker = true) as
  select id, route_id from public.kommentare where user_id = auth.uid();

grant select on public.eigene_kommentar_ids to authenticated;

drop policy if exists "Eigene Kommentare lesen" on public.kommentare;
create policy "Eigene Kommentare lesen" on public.kommentare
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Gezählt wird beim Schreiben, nicht beim Lesen
-- ---------------------------------------------------------------------------
-- Eine Unterabfrage pro Karte („wie viele Likes hat diese Tour?") ist bei
-- zwanzig Einträgen unauffällig und bei zwanzigtausend der Grund, warum die
-- Seite steht. Der Zähler kostet einen Trigger und macht jede Listenabfrage
-- zu einem einzigen Index-Scan.
create or replace function public.zaehler_pflegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  spalte text := case tg_argv[0] when 'likes' then 'likes_count' else 'kommentare_count' end;
begin
  if tg_op = 'INSERT' then
    execute format('update public.routes set %I = %I + 1 where id = $1', spalte, spalte)
      using new.route_id;
  elsif tg_op = 'DELETE' then
    execute format('update public.routes set %I = greatest(0, %I - 1) where id = $1', spalte, spalte)
      using old.route_id;
  end if;
  return null;
end;
$$;

drop trigger if exists likes_zaehler on public.likes;
create trigger likes_zaehler
  after insert or delete on public.likes
  for each row execute function public.zaehler_pflegen('likes');

drop trigger if exists kommentare_zaehler on public.kommentare;
create trigger kommentare_zaehler
  after insert or delete on public.kommentare
  for each row execute function public.zaehler_pflegen('kommentare');

-- Bestand nachzählen, falls diese Migration auf schon vorhandene Daten trifft.
update public.routes r
   set likes_count = coalesce((select count(*) from public.likes l where l.route_id = r.id), 0),
       kommentare_count = coalesce((select count(*) from public.kommentare k where k.route_id = r.id), 0);

-- ---------------------------------------------------------------------------
-- 6. Die öffentliche Sicht, erweitert
-- ---------------------------------------------------------------------------
-- Weiterhin ohne `user_id` — siehe Migration 0014, dort steht ausführlich,
-- warum eine Policy das nicht leisten kann.
drop view if exists public.oeffentliche_routen;
create view public.oeffentliche_routen
  with (security_invoker = false) as
  select id, name, region, geometry, waypoints, created_at,
         is_public, beschreibung, autor,
         veroeffentlicht_am,
         start_date, days, persons, elevation, season, shelter,
         distance_m, ascent_m, duration_s,
         likes_count, kommentare_count
    from public.routes
   where is_public;

comment on view public.oeffentliche_routen is
  'Geteilte Touren ohne user_id. Die where-Klausel ersetzt die RLS der '
  'Basistabelle — bei Änderungen zuerst prüfen, ob sie noch auf is_public '
  'einschränkt.';

grant select on public.oeffentliche_routen to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Indizes für die Wege, die die Übersicht wirklich geht
-- ---------------------------------------------------------------------------
-- Alle als Teilindex auf `is_public`: die Community fragt nie nach privaten
-- Touren, und der Index bleibt so klein wie das, was er beantwortet.
drop index if exists public.routes_public_idx;

create index if not exists routes_public_neu_idx
  on public.routes (veroeffentlicht_am desc nulls last) where is_public;

create index if not exists routes_public_beliebt_idx
  on public.routes (likes_count desc, veroeffentlicht_am desc nulls last) where is_public;

create index if not exists routes_public_lang_idx
  on public.routes (distance_m desc nulls last) where is_public;

create index if not exists routes_public_region_idx
  on public.routes (region, veroeffentlicht_am desc nulls last) where is_public;

-- Namenssuche. Ohne Trigramm-Index wird aus jedem `ilike '%wort%'` ein
-- vollständiger Durchlauf — genau die Abfrage, die man bei wachsender Menge
-- am häufigsten stellt.
--
-- In einen Block gefasst, weil `pg_trgm` je nach Projekt in `public` oder in
-- `extensions` liegt und die Operatorklasse dann nur mit passendem
-- `search_path` auflösbar ist. Der Index ist eine Beschleunigung, keine
-- Voraussetzung: fehlt er, sucht die App weiter, nur langsamer. Das darf die
-- Migration nicht zum Absturz bringen.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm nicht installierbar: %', sqlerrm;
  end;

  begin
    execute 'create index if not exists routes_public_name_trgm_idx '
            'on public.routes using gin (name gin_trgm_ops) where is_public';
  exception when others then
    raise notice 'Trigramm-Index übersprungen (%). Die Namenssuche läuft ohne ihn, '
                 'nur langsamer.', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Kommentare melden können
-- ---------------------------------------------------------------------------
-- Ab jetzt kann jeder unter fremden Touren schreiben. Ohne Meldeweg wäre die
-- einzige Handhabe gegen eine Beleidigung, dass jemand dir schreibt.
alter table public.meldungen drop constraint if exists meldungen_ziel_art_check;
alter table public.meldungen add constraint meldungen_ziel_art_check
  check (ziel_art in ('route', 'punkt', 'kommentar'));

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss die geteilten Touren mit Zählern liefern, ohne user_id:
--   curl "$SUPABASE_URL/rest/v1/oeffentliche_routen?select=*&limit=3" -H "apikey: $KEY"
--
-- Muss eine leere Liste liefern (ohne Anmeldung):
--   curl "$SUPABASE_URL/rest/v1/routes?select=*&limit=5" -H "apikey: $KEY"
--   curl "$SUPABASE_URL/rest/v1/kommentare?select=*&limit=5" -H "apikey: $KEY"
--   curl "$SUPABASE_URL/rest/v1/likes?select=*&limit=5" -H "apikey: $KEY"
--
-- Muss die Kommentare öffentlicher Touren liefern, ohne user_id:
--   curl "$SUPABASE_URL/rest/v1/oeffentliche_kommentare?select=*&limit=5" -H "apikey: $KEY"
--
-- Muss 0 ergeben (Zähler und Wirklichkeit stimmen überein):
--   select count(*) from public.routes r
--    where r.likes_count <> (select count(*) from public.likes l where l.route_id = r.id);
