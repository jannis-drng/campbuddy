-- CampBuddy — der Benutzername wird gewählt, nicht erfunden.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Bisher gab das Registrierformular den Wunschnamen als Metadatum mit, und
-- `handle_new_user` (Migration 0017) trug ihn beim Anlegen des Kontos ein.
-- Ging dabei irgendetwas schief, fing ein `exception when others` den Fehler ab
-- und setzte ersatzweise `wanderer-<id>`. Genau das ist eingetreten: Leute
-- tippten einen Namen ein, bestätigten ihre E-Mail und hiessen danach
-- „wanderer-3f9a1c" — ohne Fehlermeldung, ohne Hinweis, ohne Möglichkeit zu
-- erkennen, woran es lag. Ein stiller Ersatz ist die schlechteste aller
-- Antworten: er sieht aus wie ein Ergebnis.
--
-- Der eigentliche Fehler steckte aber eine Ebene höher — im Zeitpunkt. Der Name
-- wurde von jemandem verlangt, der noch gar kein Konto hatte, an einer Stelle,
-- an der die Datenbank ihn nur *vorab* prüfen konnte: zwischen der Prüfung im
-- Formular und dem tatsächlichen Anlegen (nach der Mailbestätigung, oft Minuten
-- später) liegt ein Fenster, in dem er vergeben, gesperrt oder sonstwie
-- unbrauchbar werden kann. Wer den Namen erst nach der Anmeldung wählt, wählt
-- ihn in derselben Transaktion, in der er geprüft wird — und bekommt einen
-- Fehler statt eines Ersatzes.
--
-- Ab hier gilt deshalb:
--
--   1. Registrieren heisst E-Mail und Passwort (oder ein Anbieter). Sonst nichts.
--   2. Die E-Mail wird bestätigt — erst dann gibt es eine Sitzung.
--   3. Dann wählt man seinen Benutzernamen, angemeldet, mit sofortiger Prüfung
--      und einer echten Meldung, wenn er vergeben ist.
--
-- Ein Konto ohne Namen ist damit ein normaler Zwischenzustand. Was daran hängt,
-- bleibt: veröffentlichen kann nur, wer einen Namen hat (Abschnitt 3) — die
-- Zusage aus Migration 0017, dass niemand anonym publiziert, gilt unverändert.

set lock_timeout = '20s';

-- Alle Sperren vorab in einer Anweisung (siehe 0020, Abschnitt 0): solange
-- diese Migration wartet, hält sie nichts und kann in keinem Deadlock-Ring
-- stehen.
lock table
  public.kommentare,
  public.profiles,
  public.routes
  in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Das Konto entsteht namenlos
-- ---------------------------------------------------------------------------
-- Kein Metadatum mehr, kein Ersatzname, kein `exception when others`. Diese
-- Funktion legt nur noch die Profilzeile an; alles Weitere entscheidet der
-- angemeldete Mensch selbst.
--
-- Dass hier nichts mehr schiefgehen *kann*, ist kein Nebeneffekt, sondern der
-- Zweck: ein Trigger an `auth.users` hat kein Gegenüber, dem er einen Fehler
-- erklären könnte. Er darf deshalb nichts tun, was fehlschlagen kann.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Legt die Profilzeile zu einem neuen Konto an — ohne Namen. Der Benutzername '
  'wird nach der Mailbestätigung im Kontobereich gewählt (Migration 0022).';

comment on column public.profiles.anzeigename is
  'Benutzername. Eindeutig ohne Rücksicht auf Gross-/Kleinschreibung, Form '
  'per Constraint, Wortwahl per Trigger. Die einzige öffentliche Kennung '
  'eines Kontos — die E-Mail-Adresse verlässt die Tabelle nie. Null heisst: '
  'noch nicht gewählt; ein solches Konto kann nichts veröffentlichen.';

-- ---------------------------------------------------------------------------
-- 2. Der erste Name ist keine Umbenennung
-- ---------------------------------------------------------------------------
-- Die Sperrfrist aus Migration 0018 soll verhindern, dass jemand seinen Ruf
-- abstreift. Auf die *erste* Wahl angewandt hiesse sie etwas anderes: wer sich
-- direkt nach der Bestätigung „bergziege" nennt und den Tippfehler eine Minute
-- später sieht, sässe 30 Tage auf „berziege". Gesperrt wird deshalb erst, wenn
-- ein bestehender Name gegen einen anderen getauscht wird.
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

    -- Nur ein Tausch zählt als Umbenennung. Von „noch keiner" auf den ersten
    -- Namen ist keiner: dabei wird niemandem etwas weggenommen, und die Frist
    -- beginnt erst mit dem Namen, den sie schützen soll.
    if old.anzeigename is not null then
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

-- ---------------------------------------------------------------------------
-- 3. Ohne Namen wird nichts veröffentlicht
-- ---------------------------------------------------------------------------
-- Solange jedes Konto beim Anlegen einen erzeugten Namen bekam, war das von
-- selbst erfüllt. Jetzt kann `anzeigename` null sein, und ohne diese Prüfung
-- stünde eine geteilte Tour wieder „ohne Urheberangabe" da — genau der Zustand,
-- den Migration 0017 beseitigt hat.
--
-- Die Prüfung sitzt in der Datenbank und nicht nur im Browser, weil die
-- REST-Schnittstelle mit dem öffentlichen Schlüssel direkt ansprechbar ist.
-- Die Meldung ist für Menschen geschrieben: der Client reicht sie unverändert
-- durch.
create or replace function public.autor_braucht_namen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name text;
begin
  select btrim(coalesce(p.anzeigename, '')) into name
    from public.profiles p
   where p.id = new.user_id;

  if name is null or name = '' then
    raise exception using errcode = '23514',
      message = 'Wähle zuerst einen Benutzernamen — er steht an allem, was du veröffentlichst.';
  end if;
  return new;
end;
$$;

comment on function public.autor_braucht_namen() is
  'Verhindert anonymes Veröffentlichen: greift beim Teilen einer Tour und beim '
  'Kommentieren, solange das Profil keinen Benutzernamen trägt.';

-- Nur beim Teilen, nicht beim Anlegen: eine private Tour zu speichern hat mit
-- der Öffentlichkeit nichts zu tun und darf ohne Namen gehen.
drop trigger if exists routes_autor_braucht_namen on public.routes;
create trigger routes_autor_braucht_namen
  before insert or update of is_public on public.routes
  for each row when (new.is_public) execute function public.autor_braucht_namen();

drop trigger if exists kommentare_autor_braucht_namen on public.kommentare;
create trigger kommentare_autor_braucht_namen
  before insert on public.kommentare
  for each row execute function public.autor_braucht_namen();

-- ---------------------------------------------------------------------------
-- Bestandskonten
-- ---------------------------------------------------------------------------
-- Bewusst nichts. Wer bereits „wanderer-3f9a1c" heisst, behält den Namen und
-- kann sich einmal frei umbenennen (`umbenannt_am` ist bei diesen Konten null).
-- Ihnen den Namen wegzunehmen, hiesse ihre geteilten Touren und Kommentare
-- rückwirkend namenlos zu machen — der Schaden wäre grösser als der Gewinn.

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss ohne Namen auskommen (neues Konto -> Profilzeile, anzeigename null):
--   select id, anzeigename from public.profiles order by created_at desc limit 3;
--
-- Muss scheitern (Kommentar ohne Benutzernamen), als angemeldeter Nutzer ohne
-- Namen ausgeführt:
--   insert into public.kommentare (route_id, user_id, text) values (…);
--
-- Muss weiterhin 0 ergeben (keine geteilte Tour ohne Autor):
--   select count(*) from public.oeffentliche_routen where autor is null;
--
-- Muss null sein (die erste Namenswahl startet die Sperrfrist nicht):
--   select umbenannt_am from public.profiles where id = '…';
