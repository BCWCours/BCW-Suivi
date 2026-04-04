-- BCW Suivi - RLS RESET (anti-recursion)
-- Colle ce script complet dans Supabase SQL Editor et Run

begin;

-- Roles autorises
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('prof', 'admin', 'eleve', 'parent'));

-- Helpers securises (sans recursion)
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

create or replace function public.is_parent_of_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parent_students ps
    where ps.parent_id = auth.uid()
      and ps.student_id = p_student_id
  );
$$;

grant execute on function public.is_parent_of_student(uuid) to anon, authenticated, service_role;

-- Nettoyage total des policies potentiellement recursees
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'students'
  loop
    execute format('drop policy %I on public.students', p.policyname);
  end loop;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'teacher_students'
  loop
    execute format('drop policy %I on public.teacher_students', p.policyname);
  end loop;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'parent_students'
  loop
    execute format('drop policy %I on public.parent_students', p.policyname);
  end loop;
end $$;

-- RLS ON
alter table public.students enable row level security;
alter table public.teacher_students enable row level security;
alter table public.parent_students enable row level security;

-- STUDENTS (aucune reference directe a teacher_students ici)
create policy "Students: staff select"
  on public.students for select
  using (public.is_staff());

create policy "Students: own select"
  on public.students for select
  using (profile_id = auth.uid());

create policy "Students: parent select"
  on public.students for select
  using (public.is_parent_of_student(id));

create policy "Students: staff insert"
  on public.students for insert
  with check (public.is_staff());

create policy "Students: staff update"
  on public.students for update
  using (public.is_staff())
  with check (public.is_staff());

-- TEACHER_STUDENTS (pas de select croise vers students)
create policy "TeacherStudents: staff select"
  on public.teacher_students for select
  using (public.is_staff());

create policy "TeacherStudents: staff insert"
  on public.teacher_students for insert
  with check (public.is_staff());

create policy "TeacherStudents: staff delete"
  on public.teacher_students for delete
  using (public.is_staff());

-- PARENT_STUDENTS (pas de recursion)
create policy "ParentStudents: staff select"
  on public.parent_students for select
  using (public.is_staff());

create policy "ParentStudents: own select"
  on public.parent_students for select
  using (parent_id = auth.uid());

create policy "ParentStudents: staff insert"
  on public.parent_students for insert
  with check (public.is_staff());

create policy "ParentStudents: staff delete"
  on public.parent_students for delete
  using (public.is_staff());

-- Grants front
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.students to authenticated;
grant select, insert, update, delete on table public.teacher_students to authenticated;
grant select, insert, update, delete on table public.parent_students to authenticated;

commit;

-- Verif rapide: policies actives
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('students', 'teacher_students', 'parent_students')
order by tablename, policyname;
