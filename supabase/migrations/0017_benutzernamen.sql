-- CampBuddy — aus dem freien Anzeigenamen wird ein echter Benutzername.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Bisher war `profiles.anzeigename` Freitext und durfte leer bleiben. Geteilte
-- Touren standen dann als „ohne Urheberangabe" da — eine Community, in der
-- niemand einen Namen hat, ist keine. Ab hier gilt:
--
--   * Jedes Konto hat einen Namen. Bestandskonten bekommen einen erzeugten.
--   * Der Name ist eindeutig, ohne Rücksicht auf Gross- und Kleinschreibung.
--   * Form und Wortwahl werden serverseitig geprüft, nicht nur im Browser.
--   * Die Autorenangabe geteilter Inhalte kommt aus dem Profil, nicht mehr aus
--     einer beim Teilen mitkopierten Textspalte. Wer sich umbenennt, heisst
--     überall neu — und niemand kann anonym veröffentlichen.

-- ---------------------------------------------------------------------------
-- 0. Erst die Views weg, dann die Tabellen
-- ---------------------------------------------------------------------------
-- Dieselbe Sperrreihenfolge wie in Migration 0016, aus demselben Grund: wer
-- eine View liest, sperrt erst sie und dann die Basistabelle. Eine Migration,
-- die umgekehrt vorgeht, läuft in einen Deadlock. Ausführlich in 0016,
-- Abschnitt 0.
drop view if exists public.oeffentliche_kommentare;
drop view if exists public.oeffentliche_routen;

set lock_timeout = '20s';

-- ---------------------------------------------------------------------------
-- 1. Was ein Name nicht sein darf
-- ---------------------------------------------------------------------------
-- Die Liste steht in einer Tabelle statt im Code: sie wächst mit dem, was
-- Leute tatsächlich versuchen, und das soll man nachtragen können, ohne die
-- App neu zu bauen.
--
-- Geprüft wird als Teilstring auf einer normalisierten Fassung des Namens
-- (siehe `namen_normalisieren` unten) — sonst kommt derselbe Ausdruck mit
-- einer Null statt einem O ungehindert durch.
create table if not exists public.gesperrte_namen (
  muster text primary key check (muster = lower(btrim(muster)) and char_length(muster) >= 2),
  art text not null default 'anstoessig' check (art in ('anstoessig', 'reserviert'))
);

alter table public.gesperrte_namen enable row level security;

-- Bewusst ohne jede Policy: die Liste ist nicht abfragbar. Sie wäre sonst eine
-- fertige Sammlung von Schimpfwörtern hinter einem öffentlichen Schlüssel, und
-- ausserdem eine Anleitung, was gerade noch durchgeht. Geprüft wird über
-- `name_pruefen()`, die nur ja/nein antwortet.
comment on table public.gesperrte_namen is
  'Sperrliste für Benutzernamen. Ohne Lese-Policy — Prüfung ausschliesslich '
  'über die Funktion name_pruefen(), Pflege über den SQL-Editor.';

insert into public.gesperrte_namen (muster, art) values
  -- Rollen und Marke: ein „support"-Konto, das nicht zum Betreiber gehört,
  -- ist der billigste Weg, jemanden hereinzulegen.
  ('admin', 'reserviert'), ('administrator', 'reserviert'), ('moderator', 'reserviert'),
  ('support', 'reserviert'), ('system', 'reserviert'),
  ('campbuddy', 'reserviert'), ('freistehen', 'reserviert'), ('official', 'reserviert'),
  ('offiziell', 'reserviert'), ('team', 'reserviert'), ('staff', 'reserviert'),
  ('root', 'reserviert'), ('null', 'reserviert'), ('undefined', 'reserviert'),
  ('anonym', 'reserviert'), ('deleted', 'reserviert'), ('geloescht', 'reserviert'),
  -- Grobe Beleidigungen und Vulgäres, deutsch und englisch. Die Liste ist
  -- bewusst knapp: sie soll das Offensichtliche abfangen, nicht Vollständigkeit
  -- vortäuschen. Was durchrutscht, meldet man über den Meldeweg.
  ('arschloch', 'anstoessig'), ('wichser', 'anstoessig'), ('hurensohn', 'anstoessig'),
  ('fotze', 'anstoessig'), ('schlampe', 'anstoessig'), ('missgeburt', 'anstoessig'),
  ('bastard', 'anstoessig'), ('spast', 'anstoessig'), ('kanake', 'anstoessig'),
  ('neger', 'anstoessig'), ('judensau', 'anstoessig'), ('nigger', 'anstoessig'),
  ('faggot', 'anstoessig'), ('retard', 'anstoessig'), ('rapist', 'anstoessig'),
  ('cunt', 'anstoessig'), ('whore', 'anstoessig'), ('bitch', 'anstoessig'),
  ('fuck', 'anstoessig'), ('shit', 'anstoessig'), ('penis', 'anstoessig'),
  ('vagina', 'anstoessig'), ('porno', 'anstoessig'), ('kinderficker', 'anstoessig'),
  -- Verherrlichung.
  ('hitler', 'anstoessig'), ('nazi', 'anstoessig'), ('hakenkreuz', 'anstoessig'),
  ('heilhitler', 'anstoessig'), ('siegheil', 'anstoessig'), ('sieghail', 'anstoessig'),
  ('holocaust', 'anstoessig')
on conflict (muster) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Normalisieren, bevor verglichen wird
-- ---------------------------------------------------------------------------
-- „N3g3r", „n-e-g-e-r" und „NeGeR" sind derselbe Versuch. Die Funktion legt
-- alles auf eine Form: klein, ohne Trennzeichen, Ziffern auf die Buchstaben
-- zurück, für die sie üblicherweise stehen, Umlaute ausgeschrieben.
create or replace function public.namen_normalisieren(eingabe text)
returns text
language sql
immutable
as $$
  -- `translate` bildet Zeichen auf Zeichen ab, die beiden Listen müssen also
  -- gleich lang sein. ß->ss ist zwei Zeichen und läuft deshalb vorher über
  -- `replace`. Was danach kein Buchstabe ist — Punkt, Strich, Unterstrich,
  -- übrige Ziffern — fällt ganz weg.
  select regexp_replace(
           translate(
             replace(lower(btrim(coalesce(eingabe, ''))), 'ß', 'ss'),
             --  0 1 3 4 5 7 8 @ $ ! | ä ö ü
             '0134578@$!|äöü',
             'oieastbasilaou'),
           '[^a-z]', '', 'g')
$$;

comment on function public.namen_normalisieren(text) is
  'Vergleichsform eines Namens: klein, ohne Trennzeichen, Zahlendreher '
  'zurückgesetzt. Nur für die Sperrlisten-Prüfung, nie zum Anzeigen.';

-- ---------------------------------------------------------------------------
-- 3. Die eine Prüfung, die Client und Datenbank teilen
-- ---------------------------------------------------------------------------
-- Gibt zurück, was der Browser anzeigen soll — und dieselbe Funktion hängt am
-- Trigger. Damit gibt es keine zweite, abweichende Wahrheit im Frontend, und
-- wer die API direkt anspricht, kommt an derselben Hürde an.
--
-- `art` ist: 'ok' | 'zu_kurz' | 'zu_lang' | 'zeichen' | 'gesperrt' | 'vergeben'
create or replace function public.name_pruefen(kandidat text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n text := btrim(coalesce(kandidat, ''));
  norm text;
  treffer text;
begin
  if char_length(n) < 3 then
    return jsonb_build_object('ok', false, 'art', 'zu_kurz',
      'meldung', 'Mindestens 3 Zeichen.');
  end if;
  if char_length(n) > 20 then
    return jsonb_build_object('ok', false, 'art', 'zu_lang',
      'meldung', 'Höchstens 20 Zeichen.');
  end if;
  -- Beginnt mit Buchstabe oder Ziffer, danach zusätzlich Punkt, Strich und
  -- Unterstrich. Keine Leerzeichen: ein Name mit Leerzeichen lässt sich in
  -- „von @name" nicht mehr als ein Wort lesen.
  if n !~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' then
    return jsonb_build_object('ok', false, 'art', 'zeichen',
      'meldung', 'Erlaubt sind Buchstaben, Ziffern, Punkt, Strich und Unterstrich. Das erste Zeichen muss ein Buchstabe oder eine Ziffer sein.');
  end if;

  norm := public.namen_normalisieren(n);
  if char_length(norm) = 0 then
    return jsonb_build_object('ok', false, 'art', 'zeichen',
      'meldung', 'Der Name braucht mindestens einen Buchstaben.');
  end if;

  -- Reservierte Namen treffen nur als Ganzes, anstössige auch als Teil.
  -- Sonst wäre „steamboat" gesperrt, weil „team" darin steckt — und Wörter
  -- wie „admin" will man ohnehin nur dann verbieten, wenn jemand *so* heissen
  -- möchte, nicht wenn sie irgendwo vorkommen. Bei den anstössigen ist es
  -- umgekehrt: dort ist das Umbauen zu „xxarschlochxx" gerade der Trick.
  --
  -- Dass Teilstring-Prüfung auch harmlose Namen trifft, bleibt als Rest: das
  -- englische Scunthorpe fällt durch, weil vier seiner Buchstaben ein
  -- Schimpfwort ergeben. Der Fall ist bekannt und hier bewusst in Kauf
  -- genommen — er kostet einen anderen Namen, während die Gegenrichtung
  -- (durchgelassene Beleidigungen) andere Leute etwas kostet.
  select g.muster into treffer
    from public.gesperrte_namen g
   where (g.art = 'reserviert' and norm = g.muster)
      or (g.art = 'anstoessig' and position(g.muster in norm) > 0)
   order by char_length(g.muster) desc
   limit 1;

  if treffer is not null then
    -- Ohne zu verraten, welches Wort getroffen hat: das wäre eine Anleitung
    -- zum Umschreiben.
    return jsonb_build_object('ok', false, 'art', 'gesperrt',
      'meldung', 'Dieser Name ist nicht erlaubt. Wähle einen anderen.');
  end if;

  if exists (select 1 from public.profiles p where lower(p.anzeigename) = lower(n)) then
    return jsonb_build_object('ok', false, 'art', 'vergeben',
      'meldung', 'Dieser Name ist schon vergeben.');
  end if;

  return jsonb_build_object('ok', true, 'art', 'ok', 'meldung', 'Frei.');
end;
$$;

revoke all on function public.name_pruefen(text) from public;
grant execute on function public.name_pruefen(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bestand: jedes Konto bekommt einen Namen
-- ---------------------------------------------------------------------------
-- Erzeugt, nicht erfunden: der Zusatz kommt aus der eigenen Konto-ID, ist also
-- eindeutig und trägt keine Aussage über die Person. Wer will, benennt sich im
-- Kontobereich um.
update public.profiles
   set anzeigename = 'wanderer-' || substr(replace(id::text, '-', ''), 1, 6)
 where anzeigename is null or btrim(anzeigename) = '';

-- Bestandsnamen, die die neue Form verletzen (Leerzeichen, Umlaute, zu lang),
-- werden auf eine gültige Fassung gebracht, statt die Constraint scheitern zu
-- lassen. Bleibt nichts Brauchbares übrig, greift derselbe Ersatz wie oben.
update public.profiles
   set anzeigename = coalesce(
         nullif(substr(regexp_replace(
           translate(anzeigename, 'äöüÄÖÜß ', 'aouAOUs_'), '[^a-zA-Z0-9_.-]', '', 'g'
         ), 1, 20), ''),
         'wanderer-' || substr(replace(id::text, '-', ''), 1, 6))
 where anzeigename !~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,19}$';

-- Doppelte auflösen: der älteste Eintrag behält den Namen.
with mehrfach as (
  select id, lower(anzeigename) as klein,
         row_number() over (partition by lower(anzeigename) order by created_at, id) as rang
    from public.profiles
   where anzeigename is not null
)
update public.profiles p
   set anzeigename = substr(p.anzeigename, 1, 13) || '-' || substr(replace(p.id::text, '-', ''), 1, 6)
  from mehrfach m
 where m.id = p.id and m.rang > 1;

-- ---------------------------------------------------------------------------
-- 5. Form und Eindeutigkeit als harte Regel
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_anzeigename_form;
alter table public.profiles add constraint profiles_anzeigename_form
  check (anzeigename is null or anzeigename ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,19}$');

-- Eindeutig ohne Rücksicht auf Gross-/Kleinschreibung: „Jannis" und „jannis"
-- sind für einen Leser derselbe Name, und genau darauf zielt eine Nachahmung.
drop index if exists public.profiles_anzeigename_eindeutig;
create unique index profiles_anzeigename_eindeutig
  on public.profiles (lower(anzeigename)) where anzeigename is not null;

-- Der Wortfilter kann nicht als CHECK laufen (Unterabfrage), deshalb Trigger.
create or replace function public.profiles_namen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  urteil jsonb;
begin
  if new.anzeigename is null then return new; end if;
  if tg_op = 'UPDATE' and new.anzeigename is not distinct from old.anzeigename then
    return new;
  end if;

  urteil := public.name_pruefen(new.anzeigename);
  if not (urteil->>'ok')::boolean then
    -- 23514 = check_violation: der Client erkennt daran, dass es an der
    -- Eingabe liegt und nicht an der Verbindung.
    raise exception using errcode = '23514', message = urteil->>'meldung';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_namen_pruefen on public.profiles;
create trigger profiles_namen_pruefen
  before insert or update of anzeigename on public.profiles
  for each row execute function public.profiles_namen_pruefen();

comment on column public.profiles.anzeigename is
  'Benutzername. Eindeutig ohne Rücksicht auf Gross-/Kleinschreibung, Form '
  'per Constraint, Wortwahl per Trigger. Die einzige öffentliche Kennung '
  'eines Kontos — die E-Mail-Adresse verlässt die Tabelle nie.';

-- ---------------------------------------------------------------------------
-- 6. Bei der Registrierung mitgegeben
-- ---------------------------------------------------------------------------
-- Der Browser schickt den Namen als Metadatum an `signUp`. Supabase legt ihn
-- in `raw_user_meta_data` ab; hier wandert er ins Profil.
--
-- Wichtig: die Registrierung darf daran nicht scheitern. Wer zwischen der
-- Prüfung im Formular und dem Absenden überholt wird, bekommt einen erzeugten
-- Namen statt einer Fehlermeldung und kann sich danach umbenennen. Ein Konto,
-- das wegen eines vergebenen Namens gar nicht erst entsteht, ist der
-- schlechtere Ausgang.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  wunsch text := nullif(btrim(new.raw_user_meta_data->>'anzeigename'), '');
  ersatz text := 'wanderer-' || substr(replace(new.id::text, '-', ''), 1, 6);
begin
  begin
    insert into public.profiles (id, anzeigename)
    values (new.id, coalesce(wunsch, ersatz))
    on conflict (id) do nothing;
  exception when others then
    -- Name vergeben, gesperrt oder formwidrig: Konto trotzdem anlegen.
    insert into public.profiles (id, anzeigename)
    values (new.id, ersatz)
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Die Autorenangabe kommt jetzt aus dem Profil
-- ---------------------------------------------------------------------------
-- `routes.autor` war eine beim Teilen mitkopierte Textspalte. Das hatte zwei
-- Folgen: wer keinen Namen gesetzt hatte, erschien dauerhaft als „ohne
-- Urheberangabe", und wer sich umbenannte, blieb unter altem Namen stehen.
--
-- Beide Views holen den Namen ab jetzt über `user_id` aus `profiles`. Die
-- `user_id` selbst verlässt die View weiterhin nicht — sie wird nur im Join
-- benutzt. Das ist genau der Grund, warum diese Views mit den Rechten ihres
-- Eigentümers laufen (siehe Migration 0014).
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
  select k.id, k.route_id,
         coalesce(p.anzeigename, k.autor) as autor,
         k.text, k.created_at
    from public.kommentare k
    join public.routes r on r.id = k.route_id
    left join public.profiles p on p.id = k.user_id
   where r.is_public;

comment on view public.oeffentliche_kommentare is
  'Kommentare ohne user_id, nur zu öffentlichen Touren; der Autorname kommt '
  'live aus profiles.';

grant select on public.oeffentliche_kommentare to anon, authenticated;

comment on column public.routes.autor is
  'Alt. Seit Migration 0017 kommt der Autorname aus profiles.anzeigename; '
  'diese Spalte dient nur noch als Rückfall für Zeilen ohne Profil.';

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss 0 ergeben (kein Konto ohne Namen):
--   select count(*) from public.profiles where anzeigename is null;
--
-- Muss 0 ergeben (keine Namensdopplung):
--   select count(*) from (
--     select lower(anzeigename) from public.profiles
--      where anzeigename is not null group by 1 having count(*) > 1) d;
--
-- Muss 0 ergeben (keine geteilte Tour ohne Autor):
--   select count(*) from public.oeffentliche_routen where autor is null;
--
-- Muss jeweils ok=false liefern:
--   select public.name_pruefen('ab');            -- zu kurz
--   select public.name_pruefen('mit leerzeichen');-- Zeichen
--   select public.name_pruefen('4dm1n');          -- gesperrt trotz Zahlendreher
--
-- Muss eine leere Liste liefern (die Sperrliste ist nicht abfragbar):
--   curl "$SUPABASE_URL/rest/v1/gesperrte_namen?select=*" -H "apikey: $KEY"
