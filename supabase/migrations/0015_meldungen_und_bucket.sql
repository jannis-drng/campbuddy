-- CampBuddy — Meldefunktion für öffentliche Inhalte, und harte Grenzen für den
-- Foto-Bucket.
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.

-- ---------------------------------------------------------------------------
-- 1. Meldungen
-- ---------------------------------------------------------------------------
-- Sobald Fremde Inhalte sehen, die andere hochgeladen haben, braucht es einen
-- Weg, Missbrauch zu melden — sonst ist die einzige Handhabe, dass jemand dir
-- schreibt und hofft, dass du es liest. Das gilt für geteilte Routen und für
-- öffentliche eigene Punkte samt Foto.
--
-- Absichtlich niedrigschwellig: melden darf auch, wer nicht angemeldet ist.
-- Wer ein anstössiges Foto sieht, hat selten Lust, vorher ein Konto anzulegen.
-- Angemeldete werden mitgeschrieben, damit wiederholte Falschmeldungen
-- zuordenbar bleiben.
create table if not exists public.meldungen (
  id uuid primary key default gen_random_uuid(),

  -- Worauf sich die Meldung bezieht. Bewusst kein Fremdschlüssel: die Meldung
  -- muss die Löschung des gemeldeten Inhalts überleben, sonst verschwindet mit
  -- dem Inhalt auch die Spur.
  ziel_art text not null check (ziel_art in ('route', 'punkt')),
  ziel_id uuid not null,

  grund text not null check (grund in (
    'falsche_rechtsangabe',  -- inhaltlich gefährlich: die Kernaufgabe der Karte
    'privatgrund',           -- Ort liegt auf Privatgrund / Betretungsverbot
    'schutzgebiet',          -- Ort liegt in einem Schutzgebiet
    'anstoessig',
    'spam',
    'sonstiges'
  )),
  beschreibung text check (char_length(beschreibung) <= 1000),

  -- Null bei nicht angemeldeten Meldenden.
  melder uuid references auth.users(id) on delete set null,

  -- Bearbeitungsstand, damit eine Meldung nicht zweimal geprüft wird.
  stand text not null default 'offen' check (stand in ('offen', 'erledigt', 'unbegruendet')),
  created_at timestamptz not null default now()
);

create index if not exists meldungen_offen_idx
  on public.meldungen (created_at desc) where stand = 'offen';

alter table public.meldungen enable row level security;

-- Anlegen darf jeder. Lesen niemand über die API — auch nicht der eigene
-- Melder. Meldungen enthalten Vorwürfe gegen Dritte; die gehören nicht in
-- einen Endpunkt, den man abfragen kann. Du liest sie im Supabase-Dashboard
-- (Table Editor), das über einen anderen Weg als die REST-API zugreift.
drop policy if exists "Melden darf jeder" on public.meldungen;
create policy "Melden darf jeder" on public.meldungen
  for insert with check (
    -- Angemeldete dürfen sich nicht als jemand anderes eintragen.
    melder is null or melder = auth.uid()
  );

comment on table public.meldungen is
  'Missbrauchsmeldungen zu öffentlichen Inhalten. Bewusst ohne Lese-Policy: '
  'nur über das Dashboard einsehbar, weil hier Vorwürfe gegen Dritte stehen.';

-- ---------------------------------------------------------------------------
-- 2. Grenzen für den Foto-Bucket
-- ---------------------------------------------------------------------------
-- Die App verkleinert jedes Bild über ein Canvas und lädt WebP hoch. Das ist
-- eine gute Prüfung — aber eine im Browser. Wer die API direkt anspricht,
-- umgeht sie vollständig. Serverseitig gilt bisher nichts.
--
-- Die zwei Grenzen unten gelten unabhängig vom Frontend:
--   * 8 MiB — derselbe Wert wie FOTO_MAX_BYTES in services/eigenePunkte.ts.
--   * Nur Bildtypen. PNG und JPEG stehen mit in der Liste, weil `toBlob` in
--     Browsern ohne WebP-Kodierer still auf PNG zurückfällt; ohne sie würde
--     dort jeder Upload scheitern.
--
-- `public = false` ist der eigentliche Schutz: Fotos sind nur über signierte,
-- ablaufende Adressen erreichbar (fotoAdresse() in services/eigenePunkte.ts).
update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'],
       public = false
 where id = 'punkt-fotos';

-- ---------------------------------------------------------------------------
-- Gegenprobe nach dem Einspielen
-- ---------------------------------------------------------------------------
-- Muss die gesetzten Grenzen zeigen:
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'punkt-fotos';
--
-- Muss eine leere Liste liefern (Meldungen sind nicht abfragbar):
--   curl "$SUPABASE_URL/rest/v1/meldungen?select=*" -H "apikey: $KEY"
