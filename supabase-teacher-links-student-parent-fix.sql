-- BCW Suivi - Fix teacher links visibility for students/parents
-- Colle ce script dans Supabase SQL Editor puis Run

begin;

-- Helper idempotent (au cas ou absent)
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

alter table public.teacher_students enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teacher_students'
      and policyname = 'TeacherStudents: student select own'
  ) then
    create policy "TeacherStudents: student select own"
      on public.teacher_students for select
      using (
        exists (
          select 1
          from public.students s
          where s.id = public.teacher_students.student_id
            and s.profile_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teacher_students'
      and policyname = 'TeacherStudents: parent select child'
  ) then
    create policy "TeacherStudents: parent select child"
      on public.teacher_students for select
      using (public.is_parent_of_student(student_id));
  end if;
end $$;

grant select on table public.teacher_students to authenticated;

commit;

-- ----------------------------------------------------------
-- Diagnostic rapide: verifier le lien profil eleve -> student
-- ----------------------------------------------------------
-- select
--   p.id as profile_id,
--   p.full_name as profile_name,
--   p.phone as profile_phone,
--   s.id as student_id,
--   s.full_name as student_name,
--   ts.teacher_id,
--   t.full_name as teacher_name
-- from public.profiles p
-- left join public.students s on s.profile_id = p.id
-- left join public.teacher_students ts on ts.student_id = s.id
-- left join public.profiles t on t.id = ts.teacher_id
-- where p.role = 'eleve'
-- order by p.full_name;

-- ----------------------------------------------------------
-- Optionnel: relier automatiquement les eleves non lies (nom exact)
-- ATTENTION: laisse commente si vous avez des homonymes.
-- ----------------------------------------------------------
-- update public.students s
-- set profile_id = p.id
-- from public.profiles p
-- where p.role = 'eleve'
--   and s.profile_id is null
--   and lower(trim(s.full_name)) = lower(trim(p.full_name));
