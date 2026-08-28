-- CampBuddy — die Schreibseite absichern
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- 0023 und 0024 haben die Leseseite in Ordnung gebracht. Beim Nachzählen fiel
-- auf, dass die Schreibseite die offene Flanke ist — und zwar in fünf Punkten,
-- die alle dieselbe Form haben: die Datenbank glaubt jedem alles, solange die
-- Zeile ihm gehört.
--
--   1. **Unbegrenzte Menge je Zeile.** `packliste` und `etappen` haben eine
--      Grössenbremse, `geometry` und `waypoints` nicht. Der grösste echte
--      Verlauf wiegt 195 kB; nichts hindert jemanden an 50 MB. Die
--      Free-Datenbank fasst 500 MB.
--   2. **Unbegrenzte Anzahl Zeilen je Konto.** Registrieren ist frei.
--   3. **`meldungen` nimmt anonyme Einträge an** — richtig so, Melden soll
--      niederschwellig bleiben. Aber ohne Bremse ist es ein offener
--      Schreibendpunkt, und geflutete Meldungen ertränken die echten.
--   4. **Jeder darf sein eigenes Abo einschalten.** Die UPDATE-Regel auf
--      `profiles` beschränkt die *Zeile*, nicht die *Spalten* — ein
--      `subscription_status = 'paid'` auf das eigene Profil geht heute durch.
--      Es schaltet noch nichts frei; Stufe 3 des Monetarisierungs-Fahrplans
--      will genau daran Funktionen hängen. Vorher gehört das zu.
--   5. **Die Rechte sind der Supabase-Standard, also alle.** `anon` hat auf
--      jeder Nutzertabelle auch `delete` und `truncate`. RLS fängt das im
--      Alltag ab — aber **truncate unterliegt keiner RLS**. Über die Web-API
--      ist es heute nicht auslösbar; der Abstand zwischen „eine Regel
--      vergessen" und „Tabelle leer" ist trotzdem null.

set lock_timeout = '20s';

-- ---------------------------------------------------------------------------
-- 1. Grössenbremse je Zeile
-- ---------------------------------------------------------------------------
-- Die Grenzen sind bewusst weit: sie sollen kein echtes Nutzungsverhalten
-- treffen, sondern nur das ausschliessen, was offensichtlich kein Wanderweg
-- mehr ist. Zum Vergleich der Bestand beim Einführen: grösster Verlauf 195 kB
-- bei 20 191 Punkten, längste Wegpunktliste 336 Byte.
alter table public.routes
  add constraint routes_geometry_klein
  check (geometry is null or pg_column_size(geometry) <= 1048576) not valid;

alter table public.routes
  add constraint routes_waypoints_klein
  check (waypoints is null or pg_column_size(waypoints) <= 65536) not valid;

-- `kommentare.text` hat seit jeher eine Grenze, `beschreibung` nie — dabei ist
-- sie das grössere Feld und steht in der öffentlichen Liste.
alter table public.routes
  add constraint routes_beschreibung_check
  check (beschreibung is null or char_length(beschreibung) <= 2000) not valid;

-- `not valid` heisst: gilt ab jetzt für jede Änderung, prüft den Bestand aber
-- nicht sofort mit. Danach nachgeholt, damit die Prüfung nicht die ganze
-- Tabelle sperrt, während jemand speichert.
alter table public.routes validate constraint routes_geometry_klein;
alter table public.routes validate constraint routes_waypoints_klein;
alter table public.routes validate constraint routes_beschreibung_check;

-- ---------------------------------------------------------------------------
-- 2. Mengenbremse je Konto
-- ---------------------------------------------------------------------------
-- Keine Produktgrenze, sondern eine Notbremse. Wer 250 Touren gespeichert hat,
-- ist kein Nutzer mehr, sondern ein Skript. Die Zahlen gehören deshalb nicht
-- in die Oberfläche und werden dort auch nicht angekündigt — eine echte
-- Nutzungsgrenze wäre eine Produktentscheidung (siehe MONETARISIERUNG.md),
-- diese hier ist eine Betriebsentscheidung.
--
-- `security definer`, weil der Trigger seine eigene Tabelle zählen muss und
-- RLS ihm sonst genau die Zeilen verbirgt, um die es geht.
create or replace function public.mengenbremse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hoechstens constant integer := case tg_argv[0]
    when 'routes'        then 250
    when 'eigene_punkte' then 500
    else 1000 end;
  vorhanden integer;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_argv[0])
     into vorhanden using new.user_id;

  if vorhanden >= hoechstens then
    raise exception using errcode = '23514',
      message = format('Mehr als %s Einträge gehen nicht. Lösche zuerst etwas.', hoechstens);
  end if;
  return new;
end;
$$;

revoke all on function public.mengenbremse() from anon, authenticated, public;

drop trigger if exists routes_mengenbremse on public.routes;
create trigger routes_mengenbremse
  before insert on public.routes
  for each row execute function public.mengenbremse('routes');

drop trigger if exists eigene_punkte_mengenbremse on public.eigene_punkte;
create trigger eigene_punkte_mengenbremse
  before insert on public.eigene_punkte
  for each row execute function public.mengenbremse('eigene_punkte');

-- Kommentare werden nicht nach Gesamtzahl gedeckelt, sondern nach Tempo: wer
-- viel diskutiert, soll das dürfen. Dreissig Beiträge in einer Stunde schreibt
-- kein Mensch.
create or replace function public.kommentar_tempo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  letzte_stunde integer;
begin
  select count(*) into letzte_stunde
    from public.kommentare
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';

  if letzte_stunde >= 30 then
    raise exception using errcode = '23514',
      message = 'Das waren gerade sehr viele Beiträge. Mach eine kurze Pause.';
  end if;
  return new;
end;
$$;

revoke all on function public.kommentar_tempo() from anon, authenticated, public;

drop trigger if exists kommentare_tempo on public.kommentare;
create trigger kommentare_tempo
  before insert on public.kommentare
  for each row execute function public.kommentar_tempo();

-- ---------------------------------------------------------------------------
-- 3. Meldungen: bremsen, ohne das Melden zu verstellen
-- ---------------------------------------------------------------------------
-- Angemeldete Melder sind identifizierbar und bekommen ein Stundenkontingent.
-- Anonyme sind es nicht — dort greifen zwei stumpfere Mittel:
--
--   * **Entdopplung.** Dieselbe Sache aus demselben Grund ein zweites Mal
--     anonym zu melden bringt keine neue Auskunft. Das schützt nicht nur die
--     Tabelle, es verbessert die Aussage: fünfzig gleiche Meldungen sind
--     nicht fünfzigmal so wichtig wie eine.
--   * **Ein globales Stundenkontingent.** Grob, und im Missbrauchsfall
--     blockiert es kurzzeitig auch echte anonyme Meldungen. Das ist der
--     bewusste Kompromiss: eine Stunde ohne anonymes Melden ist reparabel,
--     eine vollgeschriebene Datenbank auf dem Free-Plan nicht.
create or replace function public.meldung_bremse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  anzahl integer;
begin
  if new.melder is not null then
    select count(*) into anzahl
      from public.meldungen
     where melder = new.melder and created_at > now() - interval '1 hour';
    if anzahl >= 20 then
      raise exception using errcode = '23514',
        message = 'Du hast gerade sehr viel gemeldet. Versuch es in einer Stunde noch einmal.';
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.meldungen m
     where m.melder is null
       and m.ziel_art = new.ziel_art and m.ziel_id = new.ziel_id
       and m.grund = new.grund
       and m.created_at > now() - interval '24 hours'
  ) then
    -- Kein Fehler nach aussen: die Meldung ist angekommen, es gibt sie nur
    -- schon. Wer meldet, soll nicht rätseln, ob es geklappt hat.
    return null;
  end if;

  select count(*) into anzahl
    from public.meldungen
   where melder is null and created_at > now() - interval '1 hour';
  if anzahl >= 60 then
    raise exception using errcode = '23514',
      message = 'Gerade gehen sehr viele Meldungen ein. Versuch es später noch einmal.';
  end if;

  return new;
end;
$$;

revoke all on function public.meldung_bremse() from anon, authenticated, public;

drop trigger if exists meldungen_bremse on public.meldungen;
create trigger meldungen_bremse
  before insert on public.meldungen
  for each row execute function public.meldung_bremse();

-- Ohne diesen Index liest jede Meldung beim Entdoppeln die ganze Tabelle.
create index if not exists meldungen_ziel_idx
  on public.meldungen (ziel_art, ziel_id, grund, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Niemand schaltet sein eigenes Abo ein
-- ---------------------------------------------------------------------------
-- Eine RLS-Regel kann Zeilen einschränken, keine Spalten. Was hier hilft, ist
-- ein spaltenweises Recht: geschrieben werden darf der Anzeigename, sonst
-- nichts. `subscription_status`, `abo_bis` und `abo_quelle` bleiben damit dem
-- Server vorbehalten — dort, wo später die Zahlung hinkommt.
--
-- `id` ist mit dabei, weil das Speichern des Namens ein Upsert ist und die
-- Schlüsselspalte mitschreibt. Gefährlich ist das nicht: die UPDATE-Regel
-- prüft `auth.uid() = id` auch für die *neue* Zeile, eine fremde ID geht also
-- nicht durch.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, anzeigename), update (id, anzeigename) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rechte auf das zusammenstreichen, was die App wirklich tut
-- ---------------------------------------------------------------------------
-- Bis hierher galt der Supabase-Standard: `grant all` auf alles, RLS als
-- einziges Tor. Ab jetzt gilt beides — ein Recht muss da sein *und* eine Regel
-- muss zustimmen. Wer eine Funktion ergänzt und den passenden `grant`
-- vergisst, bekommt einen klaren Fehler statt einer stillen Lücke.
--
-- Die Liste ist aus den tatsächlichen Aufrufen in `app/src/services/`
-- abgeleitet. Wer dort etwas hinzufügt, ergänzt hier.
do $$
declare t text;
begin
  foreach t in array array[
    'routes', 'trips', 'profiles', 'favorites', 'likes', 'kommentare',
    'kommentar_likes', 'eigene_punkte', 'meldungen',
    'oeffentliche_routen', 'oeffentliche_kommentare', 'eigene_kommentar_ids'
  ]
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Ohne Konto: die geteilten Inhalte lesen und melden dürfen. Sonst nichts.
grant select on public.oeffentliche_routen, public.oeffentliche_kommentare to anon;
grant select on public.eigene_punkte to anon;   -- die öffentlichen, per RLS
grant insert on public.meldungen to anon;

-- Mit Konto: die eigenen Sachen bearbeiten.
grant select, insert, update, delete on
  public.routes, public.favorites, public.likes,
  public.kommentare, public.kommentar_likes, public.eigene_punkte
  to authenticated;
grant select on
  public.oeffentliche_routen, public.oeffentliche_kommentare,
  public.eigene_kommentar_ids, public.profiles
  to authenticated;
grant insert on public.meldungen to authenticated;

-- `profiles` bekommt seine Schreibrechte spaltenweise aus Abschnitt 4 zurück;
-- ein `delete` gibt es dort nicht, Konten werden über `delete_own_account()`
-- gelöscht, damit auch der Eintrag in `auth.users` verschwindet.
grant insert (id, anzeigename), update (id, anzeigename) on public.profiles to authenticated;

-- `trips` ist seit Migration 0016 in `routes` aufgegangen und wird von keiner
-- Abfrage mehr angefasst. Die Tabelle bleibt stehen (die alten Zeilen sind
-- Bestand), aber über die Web-API ist sie nicht mehr erreichbar.
comment on table public.trips is
  'Stillgelegt seit Migration 0016 — Eckdaten stehen in routes. Kein Zugriff '
  'über die Web-API mehr (0025). Nicht löschen, ohne den Bestand zu sichern.';

-- ---------------------------------------------------------------------------
-- 6. Die Ortssuche rechnet auf der Vorschau
-- ---------------------------------------------------------------------------
-- Bisher lief die exakte Entfernungsrechnung über `geometry`: bis zu 300
-- Kandidaten mal bis zu 20 000 Stützpunkte, jeder mit einer Haversine-Formel
-- — im schlimmsten Fall sechs Millionen trigonometrische Auswertungen für
-- einen Fingertipp auf eine Hütte. Auf einer geteilten Instanz ist das die
-- Abfrage, die alle anderen mitreisst.
--
-- `vorschau` hat höchstens 120 Punkte statt 20 000. Das ist derselbe Weg,
-- nur gröber abgetastet: der Fehler liegt bei wenigen hundert Metern im
-- ungünstigsten Fall, gefragt wird nach einem Umkreis von Kilometern. Für
-- „kommt da jemand vorbei?" ist das genau genug — und rund hundertmal
-- billiger.
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
    select r.id, r.vorschau
      from public.routes r, grenzen g
     where r.is_public
       and r.rahmen is not null
       and r.rahmen && box(
             point(lon - g.grad_lon, lat - g.grad_lat),
             point(lon + g.grad_lon, lat + g.grad_lat))
     limit 300
  ),
  gemessen as (
    select k.id, public.entfernung_zum_verlauf(k.vorschau, lon, lat) as meter
      from kandidaten k
  )
  select o.*
    from gemessen m
    join public.oeffentliche_routen o on o.id = m.id,
         grenzen g
   -- Der Zuschlag fängt die gröbere Abtastung auf: zwischen zwei
   -- Vorschaupunkten kann der echte Weg näher an den Ort herankommen, als die
   -- gemessene Entfernung sagt. Lieber eine Tour zu viel in der Liste als
   -- eine, die tatsächlich vorbeikommt, zu Unrecht fehlend.
   where m.meter is not null and m.meter <= g.radius * 1.15
   order by m.meter
   limit greatest(least(max_anzahl, 50), 1);
$$;

revoke all on function public.touren_bei(double precision, double precision, integer, integer) from public;
grant execute on function public.touren_bei(double precision, double precision, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Storage: auth.uid() einmal statt je Objekt
-- ---------------------------------------------------------------------------
-- Dasselbe wie in 0023 für `public`. `storage.objects` ist die Tabelle, die
-- am schnellsten wächst, deshalb lohnt es hier am meisten.
alter policy "Eigene Fotos hochladen" on storage.objects
  with check (bucket_id = 'punkt-fotos'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text);

alter policy "Eigene Fotos löschen" on storage.objects
  using (bucket_id = 'punkt-fotos'
         and (storage.foldername(name))[1] = ((select auth.uid()))::text);

alter policy "Fotos lesen" on storage.objects
  using (bucket_id = 'punkt-fotos'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or exists (select 1 from public.eigene_punkte p
                          where p.foto_pfad = objects.name and p.ist_oeffentlich)));

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
--   npm run pruefen --prefix app
--
-- Prüft mit dem öffentlichen Schlüssel, dass die Kartentabellen zu sind, die
-- Views keine user_id herausgeben und ohne Konto nichts geschrieben werden
-- kann. Muss grün sein, bevor eine Änderung an Regeln oder Rechten live geht.
