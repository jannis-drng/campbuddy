-- CampBuddy — „welche Touren kommen hier vorbei?"
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Wer auf eine Hütte, einen Gipfel oder eine Quelle tippt, will oft nicht die
-- Rechtslage wissen, sondern: geht da jemand lang? Diese Migration macht die
-- Frage beantwortbar, ohne dass der Browser dafür alle geteilten Touren laden
-- und selbst durchrechnen müsste.
--
-- Zwei Stufen, weil eine allein nicht reicht:
--
--   1. **Umgebungsrechteck.** Jede Tour bekommt ihr Bounding-Box als `box` —
--      ein eingebauter PostgreSQL-Typ, GiST-indizierbar, ohne PostGIS. Damit
--      fällt in Millisekunden alles weg, was gar nicht in die Nähe kommt.
--   2. **Echte Entfernung.** Das Rechteck allein lügt: eine Tour quer durchs
--      Wallis hat ein Rechteck über den halben Kanton, kommt aber an einer
--      Hütte im Norden nie vorbei. Deshalb wird auf den Kandidaten die
--      tatsächliche Entfernung zum Verlauf gerechnet und danach sortiert.
--
-- Die zweite Stufe im Browser zu machen wäre verlockend (die Geometrie ist
-- ohnehin da), ergäbe aber eine Liste, die erst nach dem Filtern weiss, wie
-- lang sie ist — und eine Sortierung nach Entfernung ginge gar nicht, weil
-- die Datenbank ihre Kandidaten dann nach etwas anderem auswählen müsste.

-- ---------------------------------------------------------------------------
-- 0. Alle Sperren zuerst, in einem Zug
-- ---------------------------------------------------------------------------
-- 0016 bis 0019 haben die Views vor den Tabellen freigegeben, weil ein Leser
-- der View erst sie und dann die Basistabelle sperrt. Das hat den Deadlock in
-- dieser Richtung beseitigt — aber nicht den in der anderen: es gibt auch
-- Zugriffe, die zuerst `routes` anfassen und danach die View. Der offenste
-- Kandidat dafür ist PostgREST selbst, das nach jeder DDL-Anweisung seinen
-- Schema-Cache neu einliest und dabei quer durch den Katalog greift.
--
-- Gegen zwei entgegengesetzte Reihenfolgen hilft keine dritte. Was hilft:
-- alles, was diese Migration anfasst, **vor dem ersten Schreibzugriff** in
-- einer einzigen Anweisung sperren. Danach kann kein Leser mehr mitten in
-- der Migration eine Sperre halten, die sie noch braucht — und solange sie
-- selbst wartet, hält sie nichts, kann also in keinem Ring stehen.
--
-- Bricht es trotzdem ab: die Transaktion hinterlässt nichts, die Migration
-- ist mehrfach ausführbar. Am ruhigsten läuft sie mit geschlossener App.
set lock_timeout = '20s';

lock table
  public.kommentare,
  public.profiles,
  public.routes
  in access exclusive mode;

-- Die Funktion zuerst: sie gibt `setof public.oeffentliche_routen` zurück und
-- hängt damit am Typ der View. Ohne diese Zeile scheitert ein zweiter Lauf an
-- „cannot drop view ... because other objects depend on it" — die Migration
-- wäre also genau einmal ausführbar gewesen, entgegen ihrer eigenen Zusage.
drop function if exists public.touren_bei(double precision, double precision, integer, integer);

drop view if exists public.oeffentliche_kommentare;
drop view if exists public.oeffentliche_routen;

-- ---------------------------------------------------------------------------
-- 1. Das Umgebungsrechteck jeder Tour
-- ---------------------------------------------------------------------------
alter table public.routes
  add column if not exists rahmen box;

comment on column public.routes.rahmen is
  'Umgebungsrechteck des Verlaufs, vom Trigger gepflegt. Nur für die '
  'Vorauswahl in touren_bei() — die echte Entfernung rechnet die Funktion.';

create or replace function public.rahmen_aus_geometrie(g jsonb)
returns box
language sql
immutable
as $$
  select case
           when count(*) = 0 then null
           else box(point(min(lon), min(lat)), point(max(lon), max(lat)))
         end
    from (
      select (c->>0)::float8 as lon, (c->>1)::float8 as lat
        from jsonb_array_elements(coalesce(g->'coordinates', '[]'::jsonb)) c
    ) p
   where lon between -180 and 180 and lat between -85 and 85;
$$;

create or replace function public.routes_rahmen_setzen()
returns trigger
language plpgsql
as $$
begin
  new.rahmen := public.rahmen_aus_geometrie(new.geometry);
  return new;
end;
$$;

drop trigger if exists routes_rahmen_setzen on public.routes;
create trigger routes_rahmen_setzen
  before insert or update of geometry on public.routes
  for each row execute function public.routes_rahmen_setzen();

update public.routes
   set rahmen = public.rahmen_aus_geometrie(geometry)
 where rahmen is null;

-- GiST auf `box` ist eingebaut; ein B-Baum könnte „überlappt" nicht
-- beantworten. Teilindex auf `is_public`, weil nie nach privaten Touren
-- gefragt wird.
drop index if exists public.routes_rahmen_idx;
create index routes_rahmen_idx on public.routes using gist (rahmen)
  where is_public and rahmen is not null;

-- ---------------------------------------------------------------------------
-- 2. Die Views wieder aufbauen (unverändert, nur neu erzeugt)
-- ---------------------------------------------------------------------------
create view public.oeffentliche_routen
  with (security_invoker = false) as
  select r.id, r.name, r.region, r.geometry, r.waypoints, r.created_at,
         r.is_public, r.beschreibung,
         coalesce(p.anzeigename, r.autor) as autor,
         r.veroeffentlicht_am,
         r.start_date, r.days, r.persons, r.elevation, r.season, r.shelter,
         r.distance_m, r.ascent_m, r.duration_s,
         r.likes_count, r.kommentare_count
    from public.routes r
    left join public.profiles p on p.id = r.user_id
   where r.is_public;

comment on view public.oeffentliche_routen is
  'Geteilte Touren ohne user_id; der Autorname kommt live aus profiles. Die '
  'where-Klausel ersetzt die RLS der Basistabelle — bei Änderungen zuerst '
  'prüfen, ob sie noch auf is_public einschränkt.';

grant select on public.oeffentliche_routen to anon, authenticated;

create view public.oeffentliche_kommentare
  with (security_invoker = false) as
  select k.id, k.route_id, k.eltern_id, k.wurzel_id, k.tiefe,
         coalesce(p.anzeigename, k.autor) as autor,
         k.text, k.created_at, k.likes_count
    from public.kommentare k
    join public.routes r on r.id = k.route_id
    left join public.profiles p on p.id = k.user_id
   where r.is_public;

comment on view public.oeffentliche_kommentare is
  'Kommentare ohne user_id, nur zu öffentlichen Touren; der Autorname kommt '
  'live aus profiles. eltern_id ist der direkte Bezug, wurzel_id der Strang.';

grant select on public.oeffentliche_kommentare to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Entfernung Punkt -> Verlauf
-- ---------------------------------------------------------------------------
-- Gemessen zu den Stützpunkten des Verlaufs, nicht zu den Strecken dazwischen.
-- Das reicht hier: gespeicherte Verläufe kommen aus dem Routing und haben
-- dichte Stützpunkte, der Fehler liegt weit unter dem Umkreis, nach dem
-- gefragt wird. Die exakte Strecken-Punkt-Entfernung wäre ein Vielfaches an
-- Rechnung für eine Genauigkeit, die niemand sieht.
create or replace function public.entfernung_zum_verlauf(
  g jsonb, lon double precision, lat double precision
)
returns double precision
language sql
immutable
as $$
  select min(
    -- Haversine, Erdradius 6371 km.
    6371000 * 2 * asin(least(1, sqrt(
      power(sin(radians((c->>1)::float8 - lat) / 2), 2) +
      cos(radians(lat)) * cos(radians((c->>1)::float8)) *
      power(sin(radians((c->>0)::float8 - lon) / 2), 2)
    )))
  )
  from jsonb_array_elements(coalesce(g->'coordinates', '[]'::jsonb)) c;
$$;

-- ---------------------------------------------------------------------------
-- 4. Die Abfrage
-- ---------------------------------------------------------------------------
-- Braucht keine Anmeldung: geteilte Touren sind öffentlich, und die Funktion
-- gibt genau die Spalten der View heraus — ohne `user_id`.
create or replace function public.touren_bei(
  lon double precision,
  lat double precision,
  umkreis_m integer default 3000,
  max_anzahl integer default 12
)
returns setof public.oeffentliche_routen
language sql
stable
security definer
set search_path = public
as $$
  with grenzen as (
    select
      greatest(least(umkreis_m, 50000), 100) as radius,
      -- Ein Breitengrad sind überall rund 111,32 km. Ein Längengrad schrumpft
      -- zum Pol hin; ohne die Korrektur wäre das Rechteck in den Alpen um gut
      -- ein Drittel zu schmal. `greatest` fängt den Pol ab, wo cos gegen null
      -- geht und der Rand ins Unendliche liefe.
      greatest(least(umkreis_m, 50000), 100) / 111320.0 as grad_lat,
      greatest(least(umkreis_m, 50000), 100)
        / (111320.0 * greatest(cos(radians(lat)), 0.05)) as grad_lon
  ),
  kandidaten as (
    -- Vorauswahl über den Index. Grosszügig begrenzt: was hier durchkommt,
    -- wird gleich exakt nachgerechnet, und mehr als ein paar hundert Touren
    -- kommen einer einzelnen Hütte realistisch nie nahe.
    select r.id, r.geometry
      from public.routes r, grenzen g
     where r.is_public
       and r.rahmen is not null
       and r.rahmen && box(
             point(lon - g.grad_lon, lat - g.grad_lat),
             point(lon + g.grad_lon, lat + g.grad_lat))
     limit 300
  ),
  gemessen as (
    select k.id, public.entfernung_zum_verlauf(k.geometry, lon, lat) as meter
      from kandidaten k
  )
  select o.*
    from gemessen m
    join public.oeffentliche_routen o on o.id = m.id,
         grenzen g
   where m.meter is not null and m.meter <= g.radius
   order by m.meter
   limit greatest(least(max_anzahl, 50), 1);
$$;

revoke all on function public.touren_bei(double precision, double precision, integer, integer) from public;
grant execute on function public.touren_bei(double precision, double precision, integer, integer)
  to anon, authenticated;

comment on function public.touren_bei(double precision, double precision, integer, integer) is
  'Geteilte Touren, die im angegebenen Umkreis an einem Ort vorbeikommen, '
  'nächstgelegene zuerst. Vorauswahl über den GiST-Index auf routes.rahmen, '
  'danach exakte Entfernung zum Verlauf.';

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss 0 ergeben (jede Tour mit Verlauf hat ein Rechteck):
--   select count(*) from public.routes
--    where jsonb_array_length(geometry->'coordinates') > 0 and rahmen is null;
--
-- Muss den Index benutzen (Bitmap Index Scan on routes_rahmen_idx):
--   explain analyze select * from public.touren_bei(7.75, 46.40, 3000);
--
-- Muss ohne Anmeldung funktionieren und keine user_id enthalten:
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/touren_bei" -H "apikey: $KEY" \
--        -H "Content-Type: application/json" \
--        -d '{"lon":7.75,"lat":46.40,"umkreis_m":3000}'
