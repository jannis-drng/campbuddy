-- CampBuddy — der Benutzername wird angeboten, nicht bei der Registrierung verlangt.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Bisher gab das Registrierformular den Wunschnamen als Metadatum mit, und
-- `handle_new_user` (Migration 0017) trug ihn beim Anlegen des Kontos ein. Ging
-- dabei irgendetwas schief, fing ein `exception when others` den Fehler ab und
-- setzte ersatzweise `wanderer-<id>`. Genau das ist eingetreten: Leute tippten
-- einen Namen ein, bestätigten ihre E-Mail und hiessen danach
-- „wanderer-3f9a1c" — ohne Meldung, ohne Hinweis, ohne Möglichkeit zu erkennen,
-- woran es lag.
--
-- Der Fehler steckte im Zeitpunkt. Der Name wurde von jemandem verlangt, der
-- noch kein Konto hatte, und erst beim Anlegen wirklich vergeben — also nach
-- der Mailbestätigung, oft Minuten später. In dieser Lücke konnte er vergeben
-- oder gesperrt sein, und ein Trigger an `auth.users` hat kein Gegenüber, dem
-- er das erklären könnte.
--
-- Ab hier gilt:
--
--   1. Registrieren heisst E-Mail und Passwort (oder ein Anbieter). Sonst nichts.
--   2. Das Konto bekommt sofort einen Übergangsnamen aus der eigenen Konto-ID:
--      `wanderer-3f9a1c`. Eindeutig, ohne Aussage über die Person, und vor allem
--      immer vorhanden — geteilte Touren stehen nie ohne Urheber da.
--   3. Nach der Bestätigung wird ein eigener Name *angeboten*, angemeldet, mit
--      sofortiger Prüfung und einer echten Meldung, wenn er vergeben ist. Wer
--      ihn wegklickt, behält den Übergangsnamen und kann sich jederzeit
--      umbenennen.
--
-- Der Unterschied zu vorher ist damit nicht, dass es keinen erzeugten Namen
-- mehr gibt — sondern dass er nie mehr eine *eingetippte* Wahl überschreibt.

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
-- 1. Der Übergangsname, an genau einer Stelle
-- ---------------------------------------------------------------------------
-- Aus der Konto-ID gebildet und damit selbsterkennend: an einem Namen lässt
-- sich später ablesen, ob er erzeugt oder gewählt ist, ohne ein zusätzliches
-- Feld zu führen, das ein Client umschreiben könnte. Genau das nutzen die
-- beiden Regeln weiter unten.
--
-- Sechs Hexzeichen sind 16 Millionen Möglichkeiten — für ein Solo-Projekt
-- reichlich, aber Geburtstagskollisionen fangen früher an, als man denkt.
-- Deshalb gibt es die lange Fassung als Ausweichform; „wanderer-" plus elf
-- Zeichen sind genau die zwanzig, die die Constraint erlaubt.
create or replace function public.erzeugter_name(konto uuid, laenge int default 6)
returns text
language sql
immutable
as $$
  select 'wanderer-' || substr(replace(konto::text, '-', ''), 1, laenge)
$$;

comment on function public.erzeugter_name(uuid, int) is
  'Übergangsname eines Kontos, aus seiner ID gebildet. Wer so heisst, hat sich '
  'noch keinen Namen gewählt — daran erkennen es Trigger und Oberfläche.';

grant execute on function public.erzeugter_name(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Das Konto bekommt seinen Namen beim Anlegen — und nichts geht schief
-- ---------------------------------------------------------------------------
-- Kein Metadatum mehr: der Browser schickt keinen Wunschnamen, also kann keiner
-- verlorengehen. Was bleibt, ist der Übergangsname, und der kann nur an einer
-- einzigen Stelle scheitern — wenn die kurzen sechs Zeichen schon vergeben
-- sind. Dafür gibt es die lange Fassung. Ein `exception when others`, das jeden
-- beliebigen Fehler in einen anderen Namen verwandelt, gibt es hier bewusst
-- nicht mehr.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, anzeigename)
    values (new.id, public.erzeugter_name(new.id))
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, anzeigename)
    values (new.id, public.erzeugter_name(new.id, 11))
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Legt die Profilzeile zu einem neuen Konto an, mit dem Übergangsnamen aus '
  'der Konto-ID. Den eigenen Namen wählt man später im Kontobereich.';

comment on column public.profiles.anzeigename is
  'Benutzername. Eindeutig ohne Rücksicht auf Gross-/Kleinschreibung, Form '
  'per Constraint, Wortwahl per Trigger. Die einzige öffentliche Kennung '
  'eines Kontos — die E-Mail-Adresse verlässt die Tabelle nie. Entspricht er '
  'erzeugter_name(id), ist er der Übergangsname und noch nicht gewählt.';

-- ---------------------------------------------------------------------------
-- 3. Zwei Regeln für den Übergangsnamen
-- ---------------------------------------------------------------------------
-- (a) Er umgeht die Wortprüfung. Er muss es: `namen_normalisieren` setzt
--     Ziffern auf die Buchstaben zurück, für die sie üblicherweise stehen, und
--     ein zufälliger Hex-Schwanz kann dabei rein rechnerisch auf einem
--     gesperrten Wort landen. Dann scheiterte die Registrierung an einem Namen,
--     den niemand gewählt hat. Umgehen kann das niemand: der Name muss aus
--     genau *dieser* Konto-ID gebildet sein.
--
-- (b) Ihn abzulegen ist keine Umbenennung. Die Sperrfrist aus Migration 0018
--     soll verhindern, dass jemand seinen Ruf abstreift; auf die erste eigene
--     Wahl angewandt hiesse sie etwas anderes: wer sich „bergziege" nennt und
--     den Tippfehler eine Minute später sieht, sässe 30 Tage auf „berziege".
--     Die Frist beginnt deshalb mit dem Namen, den sie schützen soll.
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

    -- (b) Nur wer schon einen selbstgewählten Namen trägt, benennt sich um.
    if old.anzeigename not in (
         public.erzeugter_name(old.id), public.erzeugter_name(old.id, 11)) then
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

  -- (a) Der eigene Übergangsname geht ungeprüft durch.
  if new.anzeigename in (
       public.erzeugter_name(new.id), public.erzeugter_name(new.id, 11)) then
    return new;
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
-- 4. Bestand: kein Konto ohne Namen
-- ---------------------------------------------------------------------------
-- Normalerweise trifft das auf niemanden zu — Migration 0017 hat den Bestand
-- schon einmal durchgesehen. Die Anweisung steht hier trotzdem, weil eine
-- frühere Fassung dieser Datei Konten absichtlich namenlos anlegte; wer sie
-- eingespielt hat, hat solche Zeilen und bekommt sie hiermit geheilt.
update public.profiles
   set anzeigename = public.erzeugter_name(id)
 where anzeigename is null or btrim(anzeigename) = '';

-- Aus derselben früheren Fassung: eine Sperre, die anonymes Veröffentlichen
-- verhindern sollte. Sie ist gegenstandslos, seit jedes Konto von Anfang an
-- einen Namen trägt, und stünde nur als toter Trigger im Weg.
drop trigger if exists routes_autor_braucht_namen on public.routes;
drop trigger if exists kommentare_autor_braucht_namen on public.kommentare;
drop function if exists public.autor_braucht_namen();

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss 0 ergeben (kein Konto ohne Namen):
--   select count(*) from public.profiles where coalesce(btrim(anzeigename), '') = '';
--
-- Muss den Übergangsnamen zeigen (neues Konto anlegen, dann):
--   select id, anzeigename, umbenannt_am from public.profiles
--    order by created_at desc limit 1;
--
-- Muss null bleiben (die erste eigene Wahl startet die Sperrfrist nicht) —
-- nach dem Umbenennen im Kontobereich:
--   select umbenannt_am from public.profiles where id = '…';
--
-- Muss weiterhin 0 ergeben (keine geteilte Tour ohne Autor):
--   select count(*) from public.oeffentliche_routen where autor is null;
