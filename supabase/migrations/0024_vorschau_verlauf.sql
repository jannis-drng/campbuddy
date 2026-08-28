-- CampBuddy — die Übersicht hört auf, ganze Routen zu laden
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- `routes` belegt 680 kB für siebzehn Zeilen — rund 40 kB je Tour, praktisch
-- alles davon `geometry`: ein gerouteter Verlauf hat tausende Stützpunkte.
-- Die Community-Übersicht holte bisher `select *` für zwölf Karten, also gut
-- eine halbe Megabyte, um zwölf Vorschaubildchen von 640×360 zu zeichnen. Bei
-- tausend Seitenaufrufen im Monat ist das ein halbes Gigabyte Egress für
-- Bilder, in denen fast alle geladenen Punkte auf demselben Pixel landen.
--
-- Deshalb trägt jede Tour ihren Verlauf zweimal: einmal vollständig für die
-- Karte, einmal ausgedünnt für die Vorschau. Die Übersicht fragt nur noch die
-- Vorschau; der volle Verlauf kommt erst, wenn jemand die Tour tatsächlich
-- auf die Karte legt.
--
-- Ausgedünnt wird gleichmässig — jeder n-te Punkt, Anfang und Ende immer
-- dabei. Douglas-Peucker wäre formtreuer, aber ohne PostGIS in reinem SQL
-- teuer, und bei 360 Pixeln Bildhöhe sieht man den Unterschied nicht. Was man
-- sähe, wäre ein abgeschnittenes Ende — deshalb ist der letzte Punkt gesetzt.

set lock_timeout = '20s';

lock table
  public.kommentare,
  public.profiles,
  public.routes
  in access exclusive mode;

-- Reihenfolge wie in 0020: die Funktion hängt am Zeilentyp der View.
drop function if exists public.touren_bei(double precision, double precision, integer, integer);
drop view if exists public.oeffentliche_kommentare;
drop view if exists public.oeffentliche_routen;

-- ---------------------------------------------------------------------------
-- 1. Der ausgedünnte Verlauf
-- ---------------------------------------------------------------------------
create or replace function public.vorschau_aus_geometrie(g jsonb, max_punkte integer default 120)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with punkte as (
    select wert, nr - 1 as i, count(*) over () as n
      from jsonb_array_elements(coalesce(g->'coordinates', '[]'::jsonb))
             with ordinality as t(wert, nr)
  ),
  masse as (select coalesce(max(n), 0) as n from punkte)
  select case
    when (select n from masse) = 0 then null
    -- Ein kurzer Verlauf kommt unverändert durch. Das speichert ihn zwar
    -- doppelt, aber die Alternative — hier null und im Browser auf
    -- `geometry` ausweichen — hiesse, dass die Übersicht `geometry` doch
    -- wieder mitladen muss. Genau das soll sie nicht.
    when (select n from masse) <= max_punkte then g
    else jsonb_build_object(
      'type', 'LineString',
      'coordinates', (
        select jsonb_agg(wert order by i)
          from punkte, masse
         where i % ((masse.n / max_punkte) + 1) = 0
            or i = masse.n - 1
      ))
  end;
$$;

comment on function public.vorschau_aus_geometrie(jsonb, integer) is
  'Gleichmässig ausgedünnter Verlauf für die Kartenvorschau. Anfang und Ende '
  'bleiben immer erhalten; kurze Verläufe kommen unverändert zurück.';

alter table public.routes
  add column if not exists vorschau jsonb;

comment on column public.routes.vorschau is
  'Ausgedünnter Verlauf, vom Trigger gepflegt. Was die Übersichtslisten '
  'zeigen — der volle geometry kommt erst beim Legen auf die Karte. Nicht '
  'von Hand setzen: der Trigger überschreibt.';

-- An denselben Trigger wie das Umgebungsrechteck: beide hängen an `geometry`,
-- und zwei Trigger auf derselben Spalte wären zwei Gelegenheiten, eine davon
-- zu vergessen.
create or replace function public.routes_rahmen_setzen()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.rahmen   := public.rahmen_aus_geometrie(new.geometry);
  new.vorschau := public.vorschau_aus_geometrie(new.geometry);
  return new;
end;
$$;

comment on function public.routes_rahmen_setzen() is
  'Pflegt die beiden aus `geometry` abgeleiteten Spalten: `rahmen` für die '
  'Ortssuche, `vorschau` für die Übersichtslisten.';

revoke all on function public.routes_rahmen_setzen() from anon, authenticated, public;
revoke all on function public.vorschau_aus_geometrie(jsonb, integer) from anon, authenticated, public;

update public.routes
   set vorschau = public.vorschau_aus_geometrie(geometry)
 where vorschau is null;

-- ---------------------------------------------------------------------------
-- 2. Die Views, um `vorschau` erweitert
-- ---------------------------------------------------------------------------
-- `geometry` bleibt in der View: eine geteilte Tour muss vollständig auf die
-- Karte gelegt werden können. Neu ist nur, dass die Übersicht sie nicht mehr
-- mitnimmt — das entscheidet die Spaltenliste der Abfrage, nicht die View.
create view public.oeffentliche_routen
  with (security_invoker = false) as
  select r.id, r.name, r.region, r.geometry, r.vorschau, r.waypoints, r.created_at,
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
  'prüfen, ob sie noch auf is_public einschränkt. Listen fragen `vorschau`, '
  'nicht `geometry`.';

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
-- 3. Die Ortssuche unverändert wiederherstellen
-- ---------------------------------------------------------------------------
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
      greatest(least(umkreis_m, 50000), 100) / 111320.0 as grad_lat,
      greatest(least(umkreis_m, 50000), 100)
        / (111320.0 * greatest(cos(radians(lat)), 0.05)) as grad_lon
  ),
  kandidaten as (
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
-- Muss 0 ergeben (jede Tour mit Verlauf hat eine Vorschau):
--   select count(*) from public.routes
--    where jsonb_array_length(geometry->'coordinates') > 0 and vorschau is null;
--
-- Muss deutlich kleiner sein als die Zahl daneben:
--   select sum(length(vorschau::text)), sum(length(geometry::text)) from public.routes;
