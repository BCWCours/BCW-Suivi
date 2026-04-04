-- BCW Suivi - Reset clean des données élèves/parents
-- À lancer dans Supabase SQL Editor

begin;

-- 0) Tables optionnelles (si elles existent)
do $$
begin
  if to_regclass('public.report_comments') is not null then
    execute 'truncate table public.report_comments restart identity cascade';
  end if;
  if to_regclass('public.scheduled_sessions') is not null then
    execute 'truncate table public.scheduled_sessions restart identity cascade';
  end if;
  if to_regclass('public.messages') is not null then
    execute 'truncate table public.messages restart identity cascade';
  end if;
end $$;

-- 1) Couper toutes les liaisons et historiques coeur app
truncate table public.teacher_students restart identity cascade;
truncate table public.parent_students restart identity cascade;
truncate table public.session_reports restart identity cascade;

-- 2) Supprimer toutes les fiches élèves
truncate table public.students restart identity cascade;

-- 3) Supprimer les profils applicatifs élève/parent
-- (les comptes auth peuvent rester; voir bloc optionnel plus bas)
delete from public.profiles
where role in ('eleve', 'parent');

commit;

-- OPTIONNEL (si tu veux repartir 100% à zéro aussi côté Supabase Auth):
-- Attention: à lancer AVANT ce script, sinon les profils sont déjà supprimés.
-- delete from auth.users
-- where coalesce(raw_user_meta_data->>'role', 'eleve') in ('eleve', 'parent');

-- Après ce reset:
-- - les profs/admin restent en place
-- - relance le workflow n8n pour re-provisionner proprement
