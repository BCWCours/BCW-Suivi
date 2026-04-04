-- BCW Suivi - Groups (schema + RLS)
-- A coller dans Supabase SQL Editor puis Run

begin;

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

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_type text not null default 'group' check (group_type in ('group', 'one_to_one')),
  level text,
  subject text,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.groups add column if not exists group_type text;
alter table public.groups add column if not exists is_active boolean;
alter table public.groups add column if not exists created_at timestamptz;
alter table public.groups alter column group_type set default 'group';
alter table public.groups alter column is_active set default true;
alter table public.groups alter column created_at set default now();
update public.groups set group_type = coalesce(group_type, 'group');
update public.groups set is_active = coalesce(is_active, true);
update public.groups set created_at = coalesce(created_at, now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_group_type_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_group_type_check check (group_type in ('group', 'one_to_one'));
  end if;
end $$;

create table if not exists public.group_students (
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

alter table public.group_students add column if not exists created_at timestamptz;
alter table public.group_students alter column created_at set default now();
update public.group_students set created_at = coalesce(created_at, now());

create index if not exists idx_groups_teacher on public.groups (teacher_id, created_at desc);
create index if not exists idx_group_students_student on public.group_students (student_id);

alter table public.groups enable row level security;
alter table public.group_students enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='groups' loop
    execute format('drop policy %I on public.groups', p.policyname);
  end loop;

  for p in select policyname from pg_policies where schemaname='public' and tablename='group_students' loop
    execute format('drop policy %I on public.group_students', p.policyname);
  end loop;
end $$;

-- Staff
create policy "Groups: staff select"
  on public.groups for select
  using (public.is_staff());

create policy "Groups: staff insert"
  on public.groups for insert
  with check (public.is_staff());

create policy "Groups: staff update"
  on public.groups for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "Groups: staff delete"
  on public.groups for delete
  using (public.is_staff());

create policy "GroupStudents: staff select"
  on public.group_students for select
  using (public.is_staff());

create policy "GroupStudents: staff insert"
  on public.group_students for insert
  with check (public.is_staff());

create policy "GroupStudents: staff delete"
  on public.group_students for delete
  using (public.is_staff());

-- Eleves / parents (read only)
create policy "Groups: student select own"
  on public.groups for select
  using (
    exists (
      select 1
      from public.group_students gs
      join public.students s on s.id = gs.student_id
      where gs.group_id = public.groups.id
        and s.profile_id = auth.uid()
    )
  );

create policy "Groups: parent select child"
  on public.groups for select
  using (
    exists (
      select 1
      from public.group_students gs
      where gs.group_id = public.groups.id
        and public.is_parent_of_student(gs.student_id)
    )
  );

create policy "GroupStudents: student select own"
  on public.group_students for select
  using (
    exists (
      select 1
      from public.students s
      where s.id = public.group_students.student_id
        and s.profile_id = auth.uid()
    )
  );

create policy "GroupStudents: parent select child"
  on public.group_students for select
  using (public.is_parent_of_student(student_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_students to authenticated;

commit;

-- Verif
select schemaname, tablename, policyname
from pg_policies
where schemaname='public'
  and tablename in ('groups','group_students')
order by tablename, policyname;
