-- =============================================
-- BCW SUIVI — Schema Supabase
-- Execute dans: Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Table PROFILES (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('prof', 'eleve', 'parent')),
  full_name text not null,
  phone text,
  created_at timestamptz default now()
);

-- 2. Table STUDENTS
create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  level text not null check (level in ('secondaire', 'superieur')),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- 3. Table TEACHER_STUDENTS (qui enseigne a qui)
create table public.teacher_students (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subjects text,
  primary key (teacher_id, student_id)
);

-- 4. Table PARENT_STUDENTS (lien parent <> enfant)
create table public.parent_students (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (parent_id, student_id)
);

-- 5. Table SESSION_REPORTS (les rapports de seance)
create table public.session_reports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  session_date date not null,
  subjects_covered text not null,
  strengths text not null,
  improvements text not null,
  resources_text text,
  resources_files text[],
  score integer check (score >= 1 and score <= 5),
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. Ajouter colonnes a LEADS (table existante)
-- Decommenter si la colonne status n'existe pas encore:
-- alter table public.leads add column if not exists status text default 'a_contacter' check (status in ('a_contacter', 'contacte', 'converti', 'perdu'));

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teacher_students enable row level security;
alter table public.parent_students enable row level security;
alter table public.session_reports enable row level security;

-- PROFILES: chacun voit son propre profil
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- PROFILES: les profs voient tous les profils (pour gerer)
create policy "Profs can view all profiles"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

-- PROFILES: un user peut update son propre profil
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- STUDENTS: les profs voient leurs eleves
create policy "Profs can view their students"
  on public.students for select
  using (
    exists (
      select 1 from public.teacher_students
      where teacher_id = auth.uid() and student_id = public.students.id
    )
  );

-- STUDENTS: les eleves voient leur propre fiche
create policy "Students can view own record"
  on public.students for select
  using (profile_id = auth.uid());

-- STUDENTS: les profs voient tous les eleves (utile pour auto-assignation)
create policy "Profs can view all students"
  on public.students for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

-- STUDENTS: les parents voient les fiches de leurs enfants
create policy "Parents can view their children"
  on public.students for select
  using (
    exists (
      select 1 from public.parent_students
      where parent_id = auth.uid() and student_id = public.students.id
    )
  );

-- STUDENTS: les profs peuvent creer/modifier des eleves
create policy "Profs can insert students"
  on public.students for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

create policy "Profs can update students"
  on public.students for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

-- TEACHER_STUDENTS: les profs voient leurs liens
create policy "Profs can view own links"
  on public.teacher_students for select
  using (teacher_id = auth.uid());

create policy "Profs can view all teacher links"
  on public.teacher_students for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

create policy "Profs can manage links"
  on public.teacher_students for insert
  with check (teacher_id = auth.uid());

create policy "Profs can delete own links"
  on public.teacher_students for delete
  using (teacher_id = auth.uid());

-- PARENT_STUDENTS: les parents voient leurs liens
create policy "Parents can view own links"
  on public.parent_students for select
  using (parent_id = auth.uid());

-- PARENT_STUDENTS: les profs peuvent gerer les liens parents
create policy "Profs can manage parent links"
  on public.parent_students for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

create policy "Profs can view parent links"
  on public.parent_students for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'prof')
  );

-- SESSION_REPORTS: les profs voient/creent/modifient leurs rapports
create policy "Profs can view own reports"
  on public.session_reports for select
  using (teacher_id = auth.uid());

create policy "Profs can insert reports"
  on public.session_reports for insert
  with check (teacher_id = auth.uid());

create policy "Profs can update own reports"
  on public.session_reports for update
  using (teacher_id = auth.uid());

-- SESSION_REPORTS: les eleves voient leurs rapports publies
create policy "Students can view own published reports"
  on public.session_reports for select
  using (
    published_at is not null
    and exists (
      select 1 from public.students
      where students.id = public.session_reports.student_id
      and students.profile_id = auth.uid()
    )
  );

-- SESSION_REPORTS: les parents voient les rapports publies de leurs enfants
create policy "Parents can view children published reports"
  on public.session_reports for select
  using (
    published_at is not null
    and exists (
      select 1 from public.parent_students
      where parent_students.parent_id = auth.uid()
      and parent_students.student_id = public.session_reports.student_id
    )
  );

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP (trigger)
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'eleve'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================
-- UPDATED_AT auto-trigger pour session_reports
-- =============================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.session_reports
  for each row execute function public.handle_updated_at();
