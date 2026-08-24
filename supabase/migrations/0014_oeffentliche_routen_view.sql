-- CampBuddy — die Autoren-ID öffentlicher Routen war für Fremde lesbar.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Derselbe Fehler wie in 0013, an einer zweiten Stelle
-- ---------------------------------------------------------------------------
-- Migration 0005 gab öffentliche Routen mit `for select using (is_public)`
-- frei. Gemeint war „die geteilte Route ist sichtbar". Wirksam war „die ganze
-- Zeile ist sichtbar" — Row Level Security filtert Zeilen, nicht Spalten.
-- Damit lag `user_id` offen.
--
-- Gemessen ohne Anmeldung, nur mit dem publishable key:
--   /rest/v1/routes?select=*  ->  Zeilen samt user_id
--
-- Eine UUID ist kein Name, aber sie ist ein dauerhaftes Kennzeichen: sie
-- verknüpft alle Veröffentlichungen einer Person miteinander und wäre der
-- Ansatzpunkt, sobald irgendwo sonst eine Zuordnung von ID zu Person
-- entsteht. Das widerspricht dem Entwurf: `routes.autor` ist bewusst Freitext,
-- damit niemand seine Identität preisgeben muss, um eine Route zu teilen.
--
-- 0013 hat für `profiles` bereits notiert, wie es richtig geht: „gehört er in
-- eine View mit genau zwei Spalten, nicht in eine Policy auf der
-- Basistabelle. Eine Policy kann keine Spalten verbergen." Genau das hier.

-- Schritt 1: Die Basistabelle gibt nur noch eigene Zeilen heraus.
drop policy if exists "Öffentliche Routen sind für alle lesbar" on public.routes;

-- Schritt 2: Das Geteilte kommt aus einer View — ohne user_id.
-- `security_invoker = false` (die Vorgabe, hier ausgeschrieben) lässt die View
-- mit den Rechten ihres Eigentümers lesen und damit an der RLS der
-- Basistabelle vorbei. Genau deshalb muss die where-Klausel hier stimmen:
-- sie ist ab jetzt die einzige Schranke vor fremden Routen.
drop view if exists public.oeffentliche_routen;
create view public.oeffentliche_routen
  with (security_invoker = false) as
  select id, name, region, geometry, waypoints, created_at,
         is_public, beschreibung, autor
    from public.routes
   where is_public;

comment on view public.oeffentliche_routen is
  'Geteilte Routen ohne user_id. Die where-Klausel ersetzt die RLS der '
  'Basistabelle — bei Änderungen zuerst prüfen, ob sie noch auf is_public '
  'einschränkt.';

grant select on public.oeffentliche_routen to anon, authenticated;

comment on table public.routes is
  'Nur für die eigene Zeile lesbar. Geteiltes läuft über die View '
  'oeffentliche_routen — niemals per Policy für Dritte öffnen, sonst liegt '
  'user_id wieder offen.';

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss eine leere Liste liefern (ohne Anmeldung, mit dem publishable key):
--
--   curl "$SUPABASE_URL/rest/v1/routes?select=*&limit=5" -H "apikey: $KEY"
--
-- Muss die geteilten Routen liefern, aber ohne user_id:
--
--   curl "$SUPABASE_URL/rest/v1/oeffentliche_routen?select=*" -H "apikey: $KEY"
