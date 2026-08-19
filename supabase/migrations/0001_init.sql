-- CampBuddy — Schema für Konten, Routen und Touren.
-- Umsetzung der Abschnitte 8.3, 8.4 und 8.6 der Spezifikation.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- WICHTIG: Row Level Security ist hier kein Extra, sondern die eigentliche
-- Absicherung. Der publishable Key steht im Browser-Bundle und ist damit
-- öffentlich; ohne RLS könnte jeder alle Zeilen lesen und schreiben.

-- ---------------------------------------------------------------------------
-- 8.3 Profile
-- ---------------------------------------------------------------------------
-- Die Identität selbst verwaltet Supabase in auth.users. Hier liegt nur, was
-- die App zusätzlich braucht. Datensparsamkeit nach Abschnitt 9: keine
-- Klarnamen, keine Profilbilder, kein Tracking.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'paid')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Eigenes Profil lesen" on public.profiles;
create policy "Eigenes Profil lesen" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Eigenes Profil anlegen" on public.profiles;
create policy "Eigenes Profil anlegen" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Eigenes Profil ändern" on public.profiles;
create policy "Eigenes Profil ändern" on public.profiles
  for update using (auth.uid() = id);

-- Profil automatisch anlegen, sobald sich jemand registriert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 8.4 Routen
-- ---------------------------------------------------------------------------
-- geometry als jsonb statt PostGIS: der [JETZT]-Umfang rechnet die Geometrie
-- im Browser, ein Geodaten-Index bringt hier noch nichts. Der Umstieg auf
-- PostGIS bleibt möglich, ohne die App zu ändern.

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  region text not null,
  geometry jsonb not null,
  waypoints jsonb,
  created_at timestamptz not null default now()
);

create index if not exists routes_user_created_idx
  on public.routes (user_id, created_at desc);

alter table public.routes enable row level security;

drop policy if exists "Eigene Routen lesen" on public.routes;
create policy "Eigene Routen lesen" on public.routes
  for select using (auth.uid() = user_id);

drop policy if exists "Eigene Routen anlegen" on public.routes;
create policy "Eigene Routen anlegen" on public.routes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene Routen ändern" on public.routes;
create policy "Eigene Routen ändern" on public.routes
  for update using (auth.uid() = user_id);

drop policy if exists "Eigene Routen löschen" on public.routes;
create policy "Eigene Routen löschen" on public.routes
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 8.6 Touren
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  route_id uuid references public.routes on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  start_date date not null,
  days int not null check (days between 1 and 60),
  persons int not null check (persons between 1 and 20),
  elevation int not null check (elevation between 0 and 5000),
  season text not null check (season in ('sommer', 'uebergang', 'winter')),
  shelter text not null check (shelter in ('zelt', 'biwak', 'huette')),
  created_at timestamptz not null default now()
);

create index if not exists trips_user_created_idx
  on public.trips (user_id, created_at desc);

alter table public.trips enable row level security;

drop policy if exists "Eigene Touren lesen" on public.trips;
create policy "Eigene Touren lesen" on public.trips
  for select using (auth.uid() = user_id);

drop policy if exists "Eigene Touren anlegen" on public.trips;
create policy "Eigene Touren anlegen" on public.trips
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene Touren ändern" on public.trips;
create policy "Eigene Touren ändern" on public.trips
  for update using (auth.uid() = user_id);

drop policy if exists "Eigene Touren löschen" on public.trips;
create policy "Eigene Touren löschen" on public.trips
  for delete using (auth.uid() = user_id);
