-- CampBuddy — Community-Routen und Favoriten.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Achtung, das ist der erste Schritt, bei dem Nutzerinhalte öffentlich werden.
-- Deshalb: Veröffentlichen ist ausdrücklich opt-in (Standard false), und die
-- Lese-Policy gibt ausschliesslich als öffentlich markierte Routen frei.

-- ---------------------------------------------------------------------------
-- Routen veröffentlichen
-- ---------------------------------------------------------------------------

alter table public.routes
  add column if not exists is_public boolean not null default false,
  add column if not exists beschreibung text,
  -- Anzeigename der Urheberin. Bewusst frei wählbar statt der E-Mail-Adresse:
  -- niemand soll seine Mailadresse veröffentlichen müssen, um eine Route zu teilen.
  add column if not exists autor text;

create index if not exists routes_public_idx
  on public.routes (is_public, created_at desc)
  where is_public;

-- Zusätzliche Lese-Policy. Die bestehende "Eigene Routen lesen" bleibt
-- unberührt; PostgreSQL verknüpft mehrere permissive Policies mit ODER.
drop policy if exists "Öffentliche Routen sind für alle lesbar" on public.routes;
create policy "Öffentliche Routen sind für alle lesbar" on public.routes
  for select using (is_public);

-- ---------------------------------------------------------------------------
-- Favoriten
-- ---------------------------------------------------------------------------

create table if not exists public.favorites (
  user_id uuid not null references auth.users on delete cascade,
  route_id uuid not null references public.routes on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, route_id)
);

alter table public.favorites enable row level security;

drop policy if exists "Eigene Favoriten lesen" on public.favorites;
create policy "Eigene Favoriten lesen" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "Eigene Favoriten setzen" on public.favorites;
create policy "Eigene Favoriten setzen" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene Favoriten entfernen" on public.favorites;
create policy "Eigene Favoriten entfernen" on public.favorites
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Touren: Kenngrössen mitspeichern
-- ---------------------------------------------------------------------------
-- Damit die Übersicht Länge und Aufwand zeigen kann, ohne für jede Tour das
-- Höhenprofil neu abzufragen.

alter table public.trips
  add column if not exists distance_m int,
  add column if not exists ascent_m int,
  add column if not exists duration_s int;
