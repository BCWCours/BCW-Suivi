-- BCW Suivi - Politiques RLS pour auto-assignation prof
-- À lancer dans Supabase SQL Editor (une seule fois)

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
      and policyname = 'Profs can view all students'
  ) then
    create policy "Profs can view all students"
      on public.students for select
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teacher_students'
      and policyname = 'Profs can view all teacher links'
  ) then
    create policy "Profs can view all teacher links"
      on public.teacher_students for select
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
      );
  end if;
end $$;
