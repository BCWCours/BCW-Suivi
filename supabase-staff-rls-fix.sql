-- BCW Suivi - Fix RLS staff (prof + admin)
-- A coller dans Supabase SQL Editor puis Run

begin;

-- 1) Autoriser le role admin dans profiles
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('prof', 'admin', 'eleve', 'parent'));

-- 2) Helper central pour eviter de dupliquer les checks
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('prof', 'admin')
  );
$$;

grant execute on function public.is_staff() to anon, authenticated, service_role;

-- 3) Politiques staff (remplace les anciennes version prof-only)
drop policy if exists "Profs can view all profiles" on public.profiles;
create policy "Profs can view all profiles"
  on public.profiles for select
  using (public.is_staff());

drop policy if exists "Profs can view all students" on public.students;
create policy "Profs can view all students"
  on public.students for select
  using (public.is_staff());

drop policy if exists "Profs can insert students" on public.students;
create policy "Profs can insert students"
  on public.students for insert
  with check (public.is_staff());

drop policy if exists "Profs can update students" on public.students;
create policy "Profs can update students"
  on public.students for update
  using (public.is_staff());

drop policy if exists "Profs can view all teacher links" on public.teacher_students;
create policy "Profs can view all teacher links"
  on public.teacher_students for select
  using (public.is_staff());

drop policy if exists "Profs can manage parent links" on public.parent_students;
create policy "Profs can manage parent links"
  on public.parent_students for insert
  with check (public.is_staff());

drop policy if exists "Profs can view parent links" on public.parent_students;
create policy "Profs can view parent links"
  on public.parent_students for select
  using (public.is_staff());

-- 4) Grants explicites pour le front
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.students to authenticated;
grant select, insert, update, delete on table public.teacher_students to authenticated;
grant select, insert, update, delete on table public.parent_students to authenticated;
grant select, insert, update, delete on table public.session_reports to authenticated;
grant select, insert, update, delete on table public.report_comments to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.scheduled_sessions to authenticated;

commit;

-- 5) Verification rapide
select id, full_name, role
from public.profiles
where lower(full_name) like '%bilal%'
   or lower(full_name) like '%sami%';
