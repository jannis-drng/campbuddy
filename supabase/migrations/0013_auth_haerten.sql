-- CampBuddy — Auth-Härtung nach einem Sicherheitsdurchgang.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Profile: Abo-Status war für Fremde lesbar
-- ---------------------------------------------------------------------------
-- Migration 0006 hat eine Lese-Policy angelegt, die den *Anzeigenamen* von
-- Konten freigeben sollte, die mindestens eine Route veröffentlicht haben.
-- Ihr Name sagt „Anzeigename", ihre Wirkung war eine andere: Row Level
-- Security filtert Zeilen, nicht Spalten. Freigegeben war damit die ganze
-- Zeile — einschliesslich `subscription_status`, `abo_bis` und `abo_quelle`.
--
-- Gemessen mit dem öffentlichen Schlüssel und ohne Anmeldung: die Abfrage
-- `/rest/v1/profiles?select=*` gab fremde Zeilen mit Abo-Feldern heraus. Ob
-- jemand zahlt, geht Dritte nichts an.
--
-- Die Policy wird ersatzlos entfernt, weil sie ungenutzt ist: die App liest
-- `profiles` ausschliesslich für die eigene Zeile (`.eq('id', id)` in
-- services/account.ts), und der Autorname öffentlicher Routen steht als
-- Freitext in `routes.autor` — genau damit niemand seine Identität
-- veröffentlichen muss, um eine Route zu teilen.
--
-- Sollte später doch ein öffentlicher Anzeigename gebraucht werden, gehört er
-- in eine View mit genau zwei Spalten, nicht in eine Policy auf der
-- Basistabelle. Eine Policy kann keine Spalten verbergen.

drop policy if exists "Anzeigename von Veröffentlichenden lesbar" on public.profiles;

-- Zur Sicherheit noch einmal festhalten, was bleiben soll: nur die eigene Zeile.
drop policy if exists "Eigenes Profil lesen" on public.profiles;
create policy "Eigenes Profil lesen" on public.profiles
  for select using (auth.uid() = id);

comment on table public.profiles is
  'Nur für die eigene Zeile lesbar. Enthält Abo-Felder — niemals per Policy '
  'für Dritte öffnen, sondern über eine View mit ausgewählten Spalten.';

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss eine leere Liste liefern (ohne Anmeldung, mit dem publishable key):
--
--   curl "$SUPABASE_URL/rest/v1/profiles?select=*&limit=5" -H "apikey: $KEY"
--
-- Vorher kamen dort fremde Profile mit Abo-Status zurück.
