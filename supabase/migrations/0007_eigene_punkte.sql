-- CampBuddy — Selbst markierte Punkte und Fotos.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Ein Punkt und ein Foto sind hier bewusst dieselbe Sache: ein Foto ist ein
-- Punkt, der ein Bild trägt. Zwei Tabellen hätten dieselben Felder gehabt
-- (Ort, Name, Notiz, Route, öffentlich) und dieselben Policies gebraucht.
--
-- Wichtig für dieses Projekt: das hier ist die erste Ebene mit *Meinungen*
-- („schöner Aussichtspunkt"). Sie steht deshalb strikt neben den Rechtsdaten,
-- nie darin — eine Nutzermarkierung darf nie wie eine geprüfte Rechtsauskunft
-- aussehen. Veröffentlichen ist wie bei den Routen ausdrücklich opt-in.

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.eigene_punkte (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  region text not null,
  typ text not null check (typ in ('viewpoint', 'campspot', 'water', 'foto', 'sonstiges')),
  name text not null check (char_length(name) between 1 and 80),
  notiz text check (notiz is null or char_length(notiz) <= 600),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- Pfad im Bucket, nicht die fertige Adresse: signierte URLs laufen ab und
  -- gehören deshalb nicht in die Datenbank.
  foto_pfad text,
  -- Beim Planen entstandene Punkte hängen an ihrer Route und verschwinden mit ihr.
  route_id uuid references public.routes on delete cascade,
  ist_oeffentlich boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists eigene_punkte_user_idx
  on public.eigene_punkte (user_id, created_at desc);

create index if not exists eigene_punkte_route_idx
  on public.eigene_punkte (route_id)
  where route_id is not null;

-- Für die Kartenansicht: öffentliche Punkte einer Region.
create index if not exists eigene_punkte_public_idx
  on public.eigene_punkte (region, created_at desc)
  where ist_oeffentlich;

alter table public.eigene_punkte enable row level security;

drop policy if exists "Eigene Punkte lesen" on public.eigene_punkte;
create policy "Eigene Punkte lesen" on public.eigene_punkte
  for select using (auth.uid() = user_id);

-- Mehrere permissive Policies verknüpft PostgreSQL mit ODER: der eigene
-- Bestand bleibt sichtbar, öffentlich markierte Punkte kommen hinzu.
drop policy if exists "Öffentliche Punkte sind für alle lesbar" on public.eigene_punkte;
create policy "Öffentliche Punkte sind für alle lesbar" on public.eigene_punkte
  for select using (ist_oeffentlich);

drop policy if exists "Eigene Punkte anlegen" on public.eigene_punkte;
create policy "Eigene Punkte anlegen" on public.eigene_punkte
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene Punkte ändern" on public.eigene_punkte;
create policy "Eigene Punkte ändern" on public.eigene_punkte
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Eigene Punkte löschen" on public.eigene_punkte;
create policy "Eigene Punkte löschen" on public.eigene_punkte
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Fotospeicher
-- ---------------------------------------------------------------------------
-- Privater Bucket, gelesen wird ausschliesslich über signierte, ablaufende
-- Adressen. Ein öffentlicher Bucket wäre einfacher gewesen, hätte aber
-- bedeutet: wer je eine Bildadresse in die Hände bekommt, sieht das Foto für
-- immer — auch wenn der Punkt privat ist. Das wäre ein stilles Versprechen,
-- das die App nicht halten kann.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'punkt-fotos', 'punkt-fotos', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Jede Datei liegt unter <user-id>/<zufall>.<endung>. Der Ordnername ist damit
-- der Eigentümernachweis und lässt sich in der Policy direkt prüfen.
drop policy if exists "Eigene Fotos hochladen" on storage.objects;
create policy "Eigene Fotos hochladen" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'punkt-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Eigene Fotos löschen" on storage.objects;
create policy "Eigene Fotos löschen" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'punkt-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lesen darf: die Eigentümerin immer, alle anderen nur, wenn das Foto an einem
-- ausdrücklich veröffentlichten Punkt hängt.
drop policy if exists "Fotos lesen" on storage.objects;
create policy "Fotos lesen" on storage.objects
  for select
  using (
    bucket_id = 'punkt-fotos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.eigene_punkte p
        where p.foto_pfad = storage.objects.name and p.ist_oeffentlich
      )
    )
  );
