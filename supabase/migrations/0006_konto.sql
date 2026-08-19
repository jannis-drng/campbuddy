-- CampBuddy — Kontoverwaltung: Profil, Abo-Platzhalter, Konto löschen.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- Profil
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- Frei wählbarer Anzeigename für geteilte Routen. Ohne ihn müsste beim
  -- Veröffentlichen die E-Mail-Adresse herhalten — das soll niemand müssen.
  add column if not exists anzeigename text
    check (anzeigename is null or char_length(anzeigename) between 2 and 40),
  -- Platzhalter für das spätere Abo (Abschnitt 5 der Spezifikation).
  -- Bewusst schon angelegt: nachträglich eine Spalte in eine Tabelle mit
  -- Nutzerdaten zu ziehen ist unangenehmer als sie leer mitzuführen.
  add column if not exists abo_bis timestamptz,
  add column if not exists abo_quelle text
    check (abo_quelle is null or abo_quelle in ('manuell', 'stripe', 'apple', 'google'));

-- ---------------------------------------------------------------------------
-- Konto löschen (DSGVO, Recht auf Löschung)
-- ---------------------------------------------------------------------------
-- Ein Client kann sich nicht selbst aus auth.users entfernen — das geht nur
-- mit Admin-Rechten. Diese Funktion läuft mit den Rechten ihres Eigentümers
-- und löscht ausschliesslich den eigenen Datensatz. Alles Übrige (Profil,
-- Routen, Touren, Favoriten) hängt per ON DELETE CASCADE daran.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Nur angemeldete Nutzer dürfen sie aufrufen, und sie trifft immer nur einen selbst.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Profil beim Veröffentlichen als Autor verwenden
-- ---------------------------------------------------------------------------
-- Anzeigenamen öffentlich lesbar machen, aber NUR für Konten, die mindestens
-- eine Route veröffentlicht haben — sonst wäre die Nutzerliste abfragbar.

drop policy if exists "Anzeigename von Veröffentlichenden lesbar" on public.profiles;
create policy "Anzeigename von Veröffentlichenden lesbar" on public.profiles
  for select using (
    exists (select 1 from public.routes r where r.user_id = profiles.id and r.is_public)
  );
