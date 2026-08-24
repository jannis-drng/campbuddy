-- CampBuddy — Antworten auf Antworten.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Migration 0018 liess genau eine Ebene zu und hängte eine Antwort auf eine
-- Antwort still an den Ursprung zurück. Das war als Schutz vor unlesbar tiefen
-- Bäumen gedacht, hat aber den Bezug zerstört: „Fest bis zum Pass" stand
-- danach neben der Frage statt darunter, und wer zwei Beiträge später
-- widersprach, sah aus, als widerspräche er dem Ursprung.
--
-- Ab hier ist die Verschachtelung echt. Zwei Spalten tragen sie:
--
--   `wurzel_id` — der oberste Beitrag des Strangs. Damit lädt sich ein ganzer
--   Strang mit *einer* Abfrage, egal wie tief er ist. Ohne diese Spalte
--   bräuchte man je Ebene eine weitere Abfrage oder eine rekursive CTE über
--   die ganze Tabelle.
--
--   `tiefe` — wie weit unten der Beitrag hängt. Die Oberfläche rückt danach
--   ein, ohne selbst zählen zu müssen.

-- ---------------------------------------------------------------------------
-- 0. Erst die View weg, dann die Tabelle
-- ---------------------------------------------------------------------------
-- Sperrreihenfolge wie in 0016–0018.
drop view if exists public.oeffentliche_kommentare;

set lock_timeout = '20s';

-- Alle Sperren vorab in einer Anweisung (siehe 0020, Abschnitt 0): solange
-- diese Migration wartet, hält sie nichts und kann deshalb in keinem
-- Deadlock-Ring stehen. Danach kommt kein Leser mehr dazwischen.
lock table
  public.kommentare,
  public.profiles,
  public.routes
  in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Strangbezug und Tiefe
-- ---------------------------------------------------------------------------
alter table public.kommentare
  add column if not exists wurzel_id uuid references public.kommentare(id) on delete cascade,
  add column if not exists tiefe smallint not null default 0;

comment on column public.kommentare.wurzel_id is
  'Oberster Beitrag des Strangs. Null bei einem Ursprung selbst. Damit lädt '
  'ein ganzer Strang mit einer Abfrage, unabhängig von seiner Tiefe.';

comment on column public.kommentare.tiefe is
  'Ebene unter dem Ursprung: 0 = Ursprung, 1 = Antwort darauf, und so fort. '
  'Gedeckelt durch MAX_TIEFE im Trigger kommentar_einhaengen.';

-- Bestand: 0018 kannte nur eine Ebene, dort ist der Elternteil zugleich die
-- Wurzel.
update public.kommentare
   set wurzel_id = eltern_id, tiefe = 1
 where eltern_id is not null and wurzel_id is null;

-- Der Weg, den die Übersicht wirklich geht: „alle Beiträge dieser Stränge".
create index if not exists kommentare_wurzel_idx
  on public.kommentare (wurzel_id, created_at) where wurzel_id is not null;

-- Und der Weg für die Seitenaufteilung: „die Ursprünge dieser Tour".
create index if not exists kommentare_ursprung_idx
  on public.kommentare (route_id, created_at) where eltern_id is null;

-- ---------------------------------------------------------------------------
-- 2. Einhängen: Wurzel und Tiefe setzen
-- ---------------------------------------------------------------------------
-- Der Deckel bleibt, aber viel weiter unten. Ab einer gewissen Tiefe ist die
-- Einrückung auf einem Telefon breiter als der Text, und der Strang wird
-- unlesbar — nicht durch die Verschachtelung, sondern durch die Darstellung.
-- Tiefere Antworten hängen deshalb an der letzten erlaubten Ebene. In der
-- Praxis trifft das fast nie zu; als Schutz vor einem entarteten Baum ist es
-- trotzdem nötig, weil die Oberfläche sonst beliebig tief rekursieren müsste.
create or replace function public.kommentar_einhaengen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_tiefe constant smallint := 6;
  eltern record;
begin
  if new.eltern_id is null then
    new.wurzel_id := null;
    new.tiefe := 0;
    return new;
  end if;

  select id, route_id, wurzel_id, tiefe into eltern
    from public.kommentare where id = new.eltern_id;

  if eltern is null then
    raise exception using errcode = '23503',
      message = 'Der Kommentar, auf den du antwortest, gibt es nicht mehr.';
  end if;

  -- Eine Antwort gehört zur selben Tour wie das, worauf sie antwortet. Ohne
  -- diese Prüfung könnte man einen Strang unter eine fremde Tour hängen.
  if eltern.route_id <> new.route_id then
    raise exception using errcode = '23514',
      message = 'Antwort und Ursprung gehören zu verschiedenen Touren.';
  end if;

  new.wurzel_id := coalesce(eltern.wurzel_id, eltern.id);

  if eltern.tiefe >= max_tiefe then
    -- Am Deckel: nicht ablehnen, sondern neben den Elternteil hängen. Ein
    -- Beitrag, der beim Absenden verschwindet, wäre der schlechtere Ausgang.
    new.tiefe := max_tiefe;
  else
    new.tiefe := (eltern.tiefe + 1)::smallint;
  end if;

  return new;
end;
$$;

drop trigger if exists kommentar_einhaengen on public.kommentare;
create trigger kommentar_einhaengen
  before insert on public.kommentare
  for each row execute function public.kommentar_einhaengen();

-- ---------------------------------------------------------------------------
-- 3. Die Lesesicht, mit Strangbezug
-- ---------------------------------------------------------------------------
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
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss 0 ergeben (jede Antwort kennt ihre Wurzel):
--   select count(*) from public.kommentare
--    where eltern_id is not null and wurzel_id is null;
--
-- Muss 0 ergeben (kein Ursprung trägt eine Wurzel oder eine Tiefe):
--   select count(*) from public.kommentare
--    where eltern_id is null and (wurzel_id is not null or tiefe <> 0);
--
-- Muss 0 ergeben (Tiefe passt zum Elternteil):
--   select count(*) from public.kommentare k join public.kommentare e
--     on e.id = k.eltern_id
--    where k.tiefe <> least(e.tiefe + 1, 6);
--
-- Muss 0 ergeben (Wurzel stimmt mit der des Elternteils überein):
--   select count(*) from public.kommentare k join public.kommentare e
--     on e.id = k.eltern_id
--    where k.wurzel_id <> coalesce(e.wurzel_id, e.id);
