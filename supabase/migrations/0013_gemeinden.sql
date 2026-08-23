-- CampBuddy — die Gemeindeflächen in der Datenbank.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Warum diese Ebene überhaupt: ausserhalb der eingezeichneten Schutzgebiete
-- regeln in der Schweiz Kanton und Gemeinde das Übernachten im Freien — und
-- entschieden wird es fast immer kommunal, über Polizeireglement,
-- Nutzungsplanung oder ein Verbot am Seeufer. Zwei Nachbargemeinden im selben
-- Kanton können es gegensätzlich halten. Eine bloss kantonale Auskunft ist
-- deshalb im Zweifel eine falsche Auskunft.
--
-- Hier liegt ausdrücklich nur die **Geometrie** samt Kontakt. Die rechtliche
-- Einstufung bleibt in `gemeinden.legal.json` im Repo, von Hand gepflegt und
-- versioniert — dieselbe Trennung wie bei den Zonen: ein Neu-Import darf die
-- Rechtspflege nie überschreiben.
--
-- Wie die übrigen Referenzdaten: jeder darf lesen, niemand über die API
-- schreiben. Gepflegt wird über den Import und den SQL-Editor.

create table if not exists public.gemeinden (
  id text primary key,
  -- Amtliche BFS-Nummer. Überlebt Umbenennungen und Fusionen sauberer als der
  -- Name und ist der Schlüssel, unter dem die Rechtspflege im Repo liegt.
  bfs int,
  name text not null,
  -- ISO-Code des Kantons, z. B. 'CH-VS'.
  kanton text,
  -- Solange eine Gemeinde nicht recherchiert ist, ist „frag dort nach" die
  -- einzige ehrliche Auskunft, die die Karte geben kann. Sie taugt nur mit
  -- einem Link daran — deshalb gehört der Kontakt zu den Stammdaten.
  website text,
  email text,
  source_url text,
  geometry jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists gemeinden_bfs_idx on public.gemeinden (bfs);
create index if not exists gemeinden_kanton_idx on public.gemeinden (kanton);

alter table public.gemeinden enable row level security;

drop policy if exists "Gemeinden sind öffentlich lesbar" on public.gemeinden;
create policy "Gemeinden sind öffentlich lesbar" on public.gemeinden
  for select using (true);
