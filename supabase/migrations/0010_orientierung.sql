-- CampBuddy — Gipfel und Natur-Objekte in der Datenbank.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Beides ist Orientierung, keine Rechtsauskunft: ein Brunnen trägt kein
-- Prüfdatum und sagt nichts darüber, ob man daneben schlafen darf. Deshalb
-- eigene Tabellen neben `zones`/`points` und nicht darin — die Trennung, die
-- schon im Datenmodell steht (siehe types.ts), gilt auch hier.
--
-- Wie die übrigen Referenzdaten: jeder darf lesen, niemand über die API
-- schreiben. Gepflegt wird über den Import und den SQL-Editor.

-- ---------------------------------------------------------------------------
-- Gipfel
-- ---------------------------------------------------------------------------

create table if not exists public.peaks (
  id text primary key,
  region text not null,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  elevation int not null,
  source_url text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Natur: Wasser und Aussicht
-- ---------------------------------------------------------------------------

create table if not exists public.nature (
  id text primary key,
  region text not null,
  type text not null
    check (type in ('lake', 'spring', 'drinking_water', 'waterfall', 'viewpoint')),
  name text not null,
  -- false = der Name ist nur die Gattung („Quelle"), nicht aus OSM. Steuert,
  -- ob die Karte beschriftet: „Quelle" hundertfach nebeneinander ist Rauschen.
  benannt boolean not null default false,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  elevation int,
  source_url text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indizes: nach Ausschnitt, nicht nach Region
-- ---------------------------------------------------------------------------
-- Landesweit sind das zusammen Zehntausende Zeilen — mehrere Megabyte, die
-- niemand braucht, weil beide Ebenen erst ab Zoom 9,5 beziehungsweise 12,5
-- überhaupt gezeichnet werden. Abgefragt wird deshalb immer der sichtbare
-- Ausschnitt, und dafür braucht es einen Index über Länge und Breite.

create index if not exists peaks_region_idx on public.peaks (region);
create index if not exists peaks_ausschnitt_idx on public.peaks (region, lng, lat);
-- Die höchsten zuerst: bei begrenzter Zeilenzahl sollen die prominenten kommen.
create index if not exists peaks_hoehe_idx on public.peaks (region, elevation desc);

create index if not exists nature_region_idx on public.nature (region);
create index if not exists nature_ausschnitt_idx on public.nature (region, lng, lat);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.peaks enable row level security;
alter table public.nature enable row level security;

drop policy if exists "Gipfel sind öffentlich lesbar" on public.peaks;
create policy "Gipfel sind öffentlich lesbar" on public.peaks
  for select using (true);

drop policy if exists "Natur-Objekte sind öffentlich lesbar" on public.nature;
create policy "Natur-Objekte sind öffentlich lesbar" on public.nature
  for select using (true);
