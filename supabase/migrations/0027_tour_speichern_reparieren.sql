-- CampBuddy — Touren speichern geht wieder
--
-- Ausführen: Supabase-Projekt -> SQL Editor -> Inhalt einfügen -> Run.
--
-- **Seit Migration 0024 konnte niemand mehr eine Tour speichern.** Jeder
-- Versuch endete mit `403 permission denied for function
-- vorschau_aus_geometrie`. Die neueste gespeicherte Tour stammt vom 26.08.,
-- 0024 ging am 28.08. live — dazwischen hat es schlicht niemand versucht.
--
-- Der Fehler ist eine Zeile, und zwar eine gut gemeinte. 0024 hat sauber
-- aufgeräumt und beiden neuen Funktionen die Rechte entzogen:
--
--     revoke all on function public.routes_rahmen_setzen() from …
--     revoke all on function public.vorschau_aus_geometrie(jsonb, integer) from …
--
-- Für die erste ist das richtig und folgenlos: PostgreSQL prüft `execute` auf
-- eine Triggerfunktion beim *Anlegen* des Triggers, nicht bei jedem Auslösen.
-- Für die zweite ist es fatal — sie ist keine Triggerfunktion, sondern eine
-- gewöhnliche, die *aus* dem Trigger heraus gerufen wird. Und weil
-- `routes_rahmen_setzen` ohne `security definer` läuft, geschieht dieser
-- Aufruf mit den Rechten dessen, der gerade speichert. Der hat sie nicht mehr.
--
-- Warum es bei `rahmen_aus_geometrie` gutging: die stammt aus 0020 und wurde
-- nie entzogen. Deshalb scheiterte es an der zweiten Zeile, nicht an der
-- ersten — und deshalb nennt die Fehlermeldung ausgerechnet die Vorschau.
--
-- Der Fix ist nicht, das Recht zurückzugeben. Dann wäre `vorschau_aus_geometrie`
-- über `/rest/v1/rpc/` von aussen aufrufbar — eine Rechenfunktion, der man
-- beliebig grosse Geometrien schicken kann. Stattdessen bekommt die
-- Triggerfunktion, was zehn der zwölf anderen in diesem Schema längst haben:
-- `security definer`. Dann läuft ihr Innenleben als Eigentümer, die Hilfsfunktion
-- bleibt von aussen unerreichbar, und es braucht kein einziges neues Recht.

set lock_timeout = '20s';

-- `security definer` heisst hier ausdrücklich *nicht* „darf mehr sehen": die
-- Funktion liest keine Zeile und schreibt keine. Sie füllt zwei abgeleitete
-- Felder der Zeile, die ohnehin gerade geschrieben wird. Der feste `search_path`
-- bleibt und ist bei einer Definer-Funktion Pflicht — ohne ihn liesse sich ihr
-- über ein untergeschobenes Schema eine andere Funktion unterschieben.
create or replace function public.routes_rahmen_setzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.rahmen   := public.rahmen_aus_geometrie(new.geometry);
  new.vorschau := public.vorschau_aus_geometrie(new.geometry);
  return new;
end;
$$;

comment on function public.routes_rahmen_setzen() is
  'Pflegt die beiden aus `geometry` abgeleiteten Spalten: `rahmen` für die '
  'Ortssuche, `vorschau` für die Übersichtslisten. SECURITY DEFINER, weil sie '
  'vorschau_aus_geometrie ruft und die absichtlich niemandem von aussen '
  'zugänglich ist — siehe Migration 0027.';

-- Unverändert richtig, und hier nur wiederholt, damit die Absicht an einer
-- Stelle steht: von aussen ist keine der beiden aufrufbar.
revoke all on function public.routes_rahmen_setzen() from anon, authenticated, public;
revoke all on function public.vorschau_aus_geometrie(jsonb, integer) from anon, authenticated, public;

-- Die Vorschau der Zeilen nachziehen, die seit 0024 nicht gespeichert werden
-- konnten, gibt es nicht — es konnte ja keine geben. Aber wenn doch eine Zeile
-- ohne Vorschau existiert, ist das jetzt der Moment.
update public.routes
   set vorschau = public.vorschau_aus_geometrie(geometry)
 where vorschau is null and geometry is not null;
