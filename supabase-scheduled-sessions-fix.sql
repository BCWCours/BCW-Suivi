-- BCW Suivi - Scheduled Sessions (table + RLS)
-- A coller dans Supabase SQL Editor puis Run

begin;

-- Helpers (idempotent)
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

-- Table
create table if not exists public.scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  scheduled_at timestamptz not null,
  subject text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_sessions_teacher_time
  on public.scheduled_sessions (teacher_id, scheduled_at);

create index if not exists idx_scheduled_sessions_student_time
  on public.scheduled_sessions (student_id, scheduled_at);

alter table public.scheduled_sessions enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'scheduled_sessions'
  loop
    execute format('drop policy %I on public.scheduled_sessions', p.policyname);
  end loop;
end $$;

-- Staff can manage
create policy "Scheduled: staff select"
  on public.scheduled_sessions for select
  using (public.is_staff());

create policy "Scheduled: staff insert"
  on public.scheduled_sessions for insert
  with check (public.is_staff());

create policy "Scheduled: staff update"
  on public.scheduled_sessions for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "Scheduled: staff delete"
  on public.scheduled_sessions for delete
  using (public.is_staff());

-- Student/parent visibility (read-only)
create policy "Scheduled: student select own"
  on public.scheduled_sessions for select
  using (
    exists (
      select 1
      from public.students s
      where s.id = public.scheduled_sessions.student_id
        and s.profile_id = auth.uid()
    )
  );

create policy "Scheduled: parent select child"
  on public.scheduled_sessions for select
  using (public.is_parent_of_student(student_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.scheduled_sessions to authenticated;

commit;

-- Verification rapide
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'scheduled_sessions'
order by policyname;
