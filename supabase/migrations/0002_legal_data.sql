-- CampBuddy — Legalitäts-Datenschicht in der Datenbank.
-- Vervollständigt Abschnitt 8 der Spezifikation: 8.1 zones, 8.2 points, 8.5 gear_items.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Diese drei Tabellen sind öffentliche Referenzdaten: jeder darf lesen, niemand
-- über die API schreiben. Gepflegt werden sie über den SQL Editor bzw. den
-- Import aus OpenStreetMap. Nutzer-Meldungen [SPÄTER] bekämen eine eigene
-- Tabelle mit Moderation, statt hier Schreibrechte zu öffnen.

-- ---------------------------------------------------------------------------
-- 8.1 Zonen — der Kern
-- ---------------------------------------------------------------------------
-- geometry als jsonb (GeoJSON) statt PostGIS: die Auswertung läuft derzeit im
-- Browser. Der Umstieg auf PostGIS ist später möglich, ohne die App zu ändern —
-- geometry würde dann zu `geography(Geometry, 4326)`.

create table if not exists public.zones (
  id text primary key,
  region text not null,
  name text not null,
  status text not null default 'unknown'
    check (status in ('allowed', 'forbidden', 'tolerated', 'unknown')),
  tent_allowed text not null default 'unknown'
    check (tent_allowed in ('yes', 'no', 'conditional', 'unknown')),
  vehicle_allowed text not null default 'unknown'
    check (vehicle_allowed in ('yes', 'no', 'conditional', 'unknown')),
  fire_allowed text not null default 'unknown'
    check (fire_allowed in ('yes', 'no', 'conditional', 'unknown')),
  conditions text,
  notes text,
  source text,
  source_url text,
  -- Datenehrlichkeit ist erzwungen, nicht erhofft: eine Einstufung, die als
  -- geprüft gilt, MUSS ein Prüfdatum haben (Abschnitt 9).
  review_status text not null default 'entwurf'
    check (review_status in ('entwurf', 'quelle', 'vor-ort')),
  last_verified date,
  geometry jsonb not null,
  updated_at timestamptz not null default now(),
  constraint geprueft_braucht_datum
    check (review_status = 'entwurf' or last_verified is not null)
);

create index if not exists zones_region_idx on public.zones (region);

alter table public.zones enable row level security;

drop policy if exists "Zonen sind öffentlich lesbar" on public.zones;
create policy "Zonen sind öffentlich lesbar" on public.zones
  for select using (true);

-- ---------------------------------------------------------------------------
-- 8.2 Punkte — Hütten, Campingplätze, Stellplätze
-- ---------------------------------------------------------------------------

create table if not exists public.points (
  id text primary key,
  region text not null,
  type text not null check (type in ('hut', 'campsite', 'vehicle_spot')),
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  elevation int,
  info jsonb not null default '{}'::jsonb,
  source text,
  source_url text,
  last_verified date,
  updated_at timestamptz not null default now()
);

create index if not exists points_region_type_idx on public.points (region, type);

alter table public.points enable row level security;

drop policy if exists "Punkte sind öffentlich lesbar" on public.points;
create policy "Punkte sind öffentlich lesbar" on public.points
  for select using (true);

-- ---------------------------------------------------------------------------
-- 8.5 Ausrüstungskatalog — trägt die Affiliate-Ebene
-- ---------------------------------------------------------------------------

create table if not exists public.gear_items (
  id text primary key,
  name text not null,
  category text not null,
  seasons text[] not null default '{}',
  min_temp int,
  shelter text[],
  per text not null default 'person' check (per in ('person', 'gruppe')),
  weight_g int,
  vendor text,
  -- Platzhalter bis zur echten Anbindung (Abschnitt 7). Bewusst nullable:
  -- lieber kein Link als ein erfundener.
  affiliate_url text,
  price_hint text,
  rationale text not null,
  essential boolean not null default false,
  gear_group text
);

alter table public.gear_items enable row level security;

drop policy if exists "Ausrüstung ist öffentlich lesbar" on public.gear_items;
create policy "Ausrüstung ist öffentlich lesbar" on public.gear_items
  for select using (true);

-- ---------------------------------------------------------------------------
-- Verknüpfung: eine gespeicherte Tour kennt ihre Region
-- ---------------------------------------------------------------------------

alter table public.trips
  add column if not exists region text;
