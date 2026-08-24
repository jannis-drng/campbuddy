-- CampBuddy — Antworten und Likes für Kommentare, Wortfilter für Kommentartexte,
-- und eine Bremse fürs Umbenennen.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- 0. Erst die Views weg, dann die Tabellen
-- ---------------------------------------------------------------------------
-- Sperrreihenfolge wie in 0016 und 0017: wer eine View liest, sperrt erst sie
-- und dann die Basistabelle. Umgekehrt vorzugehen endet im Deadlock.
drop view if exists public.oeffentliche_kommentare;

set lock_timeout = '20s';

-- ---------------------------------------------------------------------------
-- 1. Umbenennen höchstens einmal im Monat
-- ---------------------------------------------------------------------------
-- Der Benutzername ist die einzige öffentliche Kennung. Wer ihn beliebig oft
-- wechseln kann, kann sich einen Ruf anlesen und ihn dann abstreifen — und
-- die Zuschreibung, für die es den Namen überhaupt gibt, wird wertlos.
-- Gleichzeitig muss ein einmal gewählter Name korrigierbar bleiben; deshalb
-- eine Sperre und kein Verbot.
--
-- Dass eine Umbenennung überall durchschlägt, ist kein Zusatzaufwand: seit
-- Migration 0017 holen die Views den Namen über einen Join aus `profiles`.
-- Es gibt keine mitkopierte Zweitfassung, die nachgezogen werden müsste.
alter table public.profiles
  add column if not exists umbenannt_am timestamptz;

comment on column public.profiles.umbenannt_am is
  'Wann zuletzt umbenannt. Null = noch nie, dann ist die nächste Umbenennung '
  'frei. Die Sperre steht im Trigger profiles_namen_pruefen.';

-- Wie lange gesperrt wird. Als Funktion, damit Client und Trigger denselben
-- Wert benutzen und er an genau einer Stelle steht.
create or replace function public.umbenennen_sperrfrist()
returns interval language sql immutable as $$ select interval '30 days' $$;

grant execute on function public.umbenennen_sperrfrist() to anon, authenticated;

create or replace function public.profiles_namen_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  urteil jsonb;
  frei_ab timestamptz;
begin
  if new.anzeigename is null then return new; end if;

  if tg_op = 'UPDATE' then
    if new.anzeigename is not distinct from old.anzeigename then
      return new;
    end if;

    -- Sperrfrist. Beim allerersten Umbenennen ist `umbenannt_am` null und die
    -- Bedingung fällt durch — der erste Wechsel ist immer erlaubt.
    if old.umbenannt_am is not null then
      frei_ab := old.umbenannt_am + public.umbenennen_sperrfrist();
      if now() < frei_ab then
        raise exception using errcode = '23514',
          message = 'Du kannst dich nur einmal im Monat umbenennen. Wieder möglich ab '
                    || to_char(frei_ab, 'DD.MM.YYYY') || '.';
      end if;
    end if;

    new.umbenannt_am := now();
  end if;

  urteil := public.name_pruefen(new.anzeigename);
  if not (urteil->>'ok')::boolean then
    raise exception using errcode = '23514', message = urteil->>'meldung';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_namen_pruefen on public.profiles;
create trigger profiles_namen_pruefen
  before insert or update of anzeigename on public.profiles
  for each row execute function public.profiles_namen_pruefen();

-- Eigenes Profil samt Sperrfrist lesen kann jeder für sich selbst — die
-- bestehende Policy „Eigenes Profil lesen" deckt die neue Spalte mit ab.

-- ---------------------------------------------------------------------------
-- 2. Kommentare: Antworten
-- ---------------------------------------------------------------------------
-- Genau eine Ebene tief. Tiefer verschachtelte Stränge sind auf einem Telefon
-- nicht mehr lesbar, und die Frage „worauf bezieht sich das?" beantwortet die
-- erste Ebene bereits. Eine Antwort auf eine Antwort wird deshalb nicht
-- abgelehnt, sondern an denselben Ursprung gehängt (siehe Trigger).
alter table public.kommentare
  add column if not exists eltern_id uuid references public.kommentare(id) on delete cascade,
  add column if not exists likes_count int not null default 0;

create index if not exists kommentare_eltern_idx
  on public.kommentare (eltern_id, created_at) where eltern_id is not null;

create or replace function public.kommentar_einhaengen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eltern record;
begin
  if new.eltern_id is null then return new; end if;

  select id, route_id, eltern_id into eltern
    from public.kommentare where id = new.eltern_id;

  if eltern is null then
    raise exception using errcode = '23503',
      message = 'Der Kommentar, auf den du antwortest, gibt es nicht mehr.';
  end if;

  -- Antwort auf eine Antwort: an den Ursprung hängen statt eine dritte Ebene
  -- aufzumachen.
  if eltern.eltern_id is not null then
    new.eltern_id := eltern.eltern_id;
  end if;

  -- Eine Antwort gehört zur selben Tour wie das, worauf sie antwortet. Ohne
  -- diese Prüfung könnte man einen Strang unter eine fremde Tour hängen.
  if eltern.route_id <> new.route_id then
    raise exception using errcode = '23514',
      message = 'Antwort und Ursprung gehören zu verschiedenen Touren.';
  end if;

  return new;
end;
$$;

drop trigger if exists kommentar_einhaengen on public.kommentare;
create trigger kommentar_einhaengen
  before insert on public.kommentare
  for each row execute function public.kommentar_einhaengen();

-- ---------------------------------------------------------------------------
-- 3. Kommentare: Likes
-- ---------------------------------------------------------------------------
-- Gebaut wie die Likes auf Touren (Migration 0016): wer geliked hat, ist nicht
-- abfragbar, öffentlich ist allein die Zahl.
create table if not exists public.kommentar_likes (
  user_id uuid not null references auth.users on delete cascade,
  kommentar_id uuid not null references public.kommentare on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, kommentar_id)
);

alter table public.kommentar_likes enable row level security;

drop policy if exists "Eigene Kommentar-Likes lesen" on public.kommentar_likes;
create policy "Eigene Kommentar-Likes lesen" on public.kommentar_likes
  for select using (auth.uid() = user_id);

-- Geliked werden darf nur, was auch öffentlich sichtbar ist.
create or replace function public.ist_oeffentlicher_kommentar(ziel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.kommentare k
      join public.routes r on r.id = k.route_id
     where k.id = ziel and r.is_public
  );
$$;

revoke all on function public.ist_oeffentlicher_kommentar(uuid) from public;
grant execute on function public.ist_oeffentlicher_kommentar(uuid) to anon, authenticated;

drop policy if exists "Kommentar-Likes setzen" on public.kommentar_likes;
create policy "Kommentar-Likes setzen" on public.kommentar_likes
  for insert with check (
    auth.uid() = user_id and public.ist_oeffentlicher_kommentar(kommentar_id)
  );

drop policy if exists "Eigene Kommentar-Likes entfernen" on public.kommentar_likes;
create policy "Eigene Kommentar-Likes entfernen" on public.kommentar_likes
  for delete using (auth.uid() = user_id);

comment on table public.kommentar_likes is
  'Wer welchen Kommentar geliked hat. Nur für die eigene Zeile lesbar — '
  'öffentlich ist ausschliesslich die Zahl in kommentare.likes_count.';

create or replace function public.kommentar_likes_zaehlen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.kommentare set likes_count = likes_count + 1 where id = new.kommentar_id;
  elsif tg_op = 'DELETE' then
    update public.kommentare set likes_count = greatest(0, likes_count - 1) where id = old.kommentar_id;
  end if;
  return null;
end;
$$;

drop trigger if exists kommentar_likes_zaehler on public.kommentar_likes;
create trigger kommentar_likes_zaehler
  after insert or delete on public.kommentar_likes
  for each row execute function public.kommentar_likes_zaehlen();

update public.kommentare k
   set likes_count = coalesce(
         (select count(*) from public.kommentar_likes l where l.kommentar_id = k.id), 0);

-- ---------------------------------------------------------------------------
-- 4. Wortfilter für Kommentartexte
-- ---------------------------------------------------------------------------
-- Dieselbe Sperrliste wie bei den Benutzernamen (Migration 0017), aber anders
-- angewandt: ein Name ist ein Wort, ein Kommentar ist Fliesstext. Geprüft wird
-- deshalb Wort für Wort — sonst würde ein harmloser Satz allein deshalb
-- abgelehnt, weil quer über zwei Wortgrenzen hinweg zufällig ein Muster
-- entsteht.
--
-- Reservierte Namen (`admin`, `team`) sind hier ohne Belang: dass jemand das
-- Wort „Team" schreibt, ist kein Missbrauch. Geprüft wird nur auf
-- `art = 'anstoessig'`.
create or replace function public.text_pruefen(eingabe text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  wort text;
  norm text;
begin
  if eingabe is null or btrim(eingabe) = '' then
    return jsonb_build_object('ok', false, 'meldung', 'Der Text ist leer.');
  end if;

  foreach wort in array regexp_split_to_array(lower(eingabe), '\s+') loop
    norm := public.namen_normalisieren(wort);
    continue when char_length(norm) < 3;
    if exists (
      select 1 from public.gesperrte_namen g
       where g.art = 'anstoessig' and position(g.muster in norm) > 0
    ) then
      -- Ohne zu verraten, welches Wort getroffen hat: das wäre eine Anleitung
      -- zum Umschreiben.
      return jsonb_build_object('ok', false,
        'meldung', 'Dieser Beitrag enthält Wörter, die hier nicht stehen sollen. Formuliere ihn bitte um.');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'meldung', '');
end;
$$;

revoke all on function public.text_pruefen(text) from public;
grant execute on function public.text_pruefen(text) to anon, authenticated;

create or replace function public.kommentare_text_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  urteil jsonb := public.text_pruefen(new.text);
begin
  if not (urteil->>'ok')::boolean then
    raise exception using errcode = '23514', message = urteil->>'meldung';
  end if;
  return new;
end;
$$;

drop trigger if exists kommentare_text_pruefen on public.kommentare;
create trigger kommentare_text_pruefen
  before insert or update of text on public.kommentare
  for each row execute function public.kommentare_text_pruefen();

-- ---------------------------------------------------------------------------
-- 5. Die Lesesicht, erweitert
-- ---------------------------------------------------------------------------
create view public.oeffentliche_kommentare
  with (security_invoker = false) as
  select k.id, k.route_id, k.eltern_id,
         coalesce(p.anzeigename, k.autor) as autor,
         k.text, k.created_at, k.likes_count
    from public.kommentare k
    join public.routes r on r.id = k.route_id
    left join public.profiles p on p.id = k.user_id
   where r.is_public;

comment on view public.oeffentliche_kommentare is
  'Kommentare ohne user_id, nur zu öffentlichen Touren; der Autorname kommt '
  'live aus profiles. eltern_id verweist auf den Ursprung eines Strangs.';

grant select on public.oeffentliche_kommentare to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss false liefern (Beleidigung im Fliesstext):
--   select public.text_pruefen('du bist ein Arschl0ch')->>'ok';
-- Muss true liefern (harmloser Satz mit „Team"):
--   select public.text_pruefen('Das Team war schnell unterwegs.')->>'ok';
--
-- Muss eine leere Liste liefern (Likes sind nicht abfragbar):
--   curl "$SUPABASE_URL/rest/v1/kommentar_likes?select=*" -H "apikey: $KEY"
--
-- Muss 0 ergeben (Zähler und Wirklichkeit stimmen überein):
--   select count(*) from public.kommentare k
--    where k.likes_count <> (select count(*) from public.kommentar_likes l
--                             where l.kommentar_id = k.id);
--
-- Muss 0 ergeben (keine dritte Ebene):
--   select count(*) from public.kommentare k
--     join public.kommentare e on e.id = k.eltern_id
--    where e.eltern_id is not null;
