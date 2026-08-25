-- CampBuddy — Packliste und selbst gewählte Etappen bei der Tour speichern
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- Zwei Dinge, die bisher bei jedem Schliessen des Fensters verloren gingen:
--
--   1. **Der Stand der Packliste.** Sie ist keine Auflistung mehr, sondern
--      eine Checkliste: zu jedem Teil steht, ob man es schon hat, noch
--      besorgen muss oder gar nicht mitnimmt. Das ist eine Entscheidung, die
--      man einmal trifft und über Wochen bis zur Abfahrt wieder aufschlägt —
--      sie gehört zur Tour.
--   2. **Die selbst gewählten Nachtlager.** Der Etappenvorschlag rechnet mit
--      sechs Gehstunden; wer stattdessen „Nacht 1 in der Cabane de Moiry"
--      festgelegt hat, will das beim nächsten Öffnen wiederfinden und nicht
--      erneut anklicken.
--
-- Beides ist rein persönlich und bleibt es. Die Spalten kommen bewusst *nicht*
-- in `oeffentliche_routen`: was jemand schon im Keller hat, geht niemanden
-- etwas an, und die View zählt ihre Spalten einzeln auf — ein `add column`
-- allein ändert sie deshalb nicht. Wer die View später anfasst, darf diese
-- zwei nicht aus Versehen mitnehmen.
--
-- Zugriff regelt weiterhin die RLS von `routes`: nur die eigene Zeile.
-- Deshalb genügt hier `add column`, ohne neue Policy.

set lock_timeout = '20s';

-- Nur `routes`, und nur ein `add column if not exists` — kein View-Neubau,
-- keine Funktionsabhängigkeit, keine Reihenfolge, die in einen Ring geraten
-- könnte. Mehrfach ausführbar.
alter table public.routes
  add column if not exists packliste jsonb,
  add column if not exists etappen jsonb;

comment on column public.routes.packliste is
  'Stand der Checkliste: { "<gear_item_id>": "habe" | "brauche" | "weglassen" }. '
  'Rein persönlich — gehört nicht in oeffentliche_routen.';

comment on column public.routes.etappen is
  'Selbst gewählte Nachtlager als Array: [{ bei_m, name, art, position }]. '
  'Leer/null = der automatische Vorschlag nach Gehzeit gilt. '
  'Rein persönlich — gehört nicht in oeffentliche_routen.';

-- Grössen deckeln. Ohne Schranke liesse sich über die API beliebig viel JSON
-- in eine Zeile schreiben; beide Felder sind ihrer Natur nach klein.
alter table public.routes
  drop constraint if exists routes_packliste_klein;
alter table public.routes
  add constraint routes_packliste_klein
  check (packliste is null or pg_column_size(packliste) <= 8192);

alter table public.routes
  drop constraint if exists routes_etappen_klein;
alter table public.routes
  add constraint routes_etappen_klein
  check (etappen is null or pg_column_size(etappen) <= 8192);
