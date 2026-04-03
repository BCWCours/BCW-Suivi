-- =========================================================
-- BCW SUIVI - DEMO SEED (idempotent)
-- Execute in Supabase SQL Editor
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Ensure key roles from existing auth users
--    (users must already exist in Authentication > Users)
-- ---------------------------------------------------------
do $$
declare
  v_email text;
  v_prof_emails text[] := array[
    'bilal.zeamari@bcwcours.be',
    'bilal@bcwcours.be',
    'sami@bcwcours.be',
    'walid@bcwcours.be'
  ];
  v_parent_emails text[] := array[
    'parent.nora.demo@bcw.local',
    'parent.yassine.demo@bcw.local',
    'parent.lina.demo@bcw.local',
    'parent.adam.demo@bcw.local'
  ];
begin
  foreach v_email in array v_prof_emails loop
    insert into public.profiles (id, role, full_name)
    select
      u.id,
      'prof',
      coalesce(nullif(trim(initcap(replace(split_part(lower(u.email), '@', 1), '.', ' '))), ''), 'Prof BCW')
    from auth.users u
    where lower(u.email) = lower(v_email)
    on conflict (id) do update
      set role = 'prof',
          full_name = case
            when trim(coalesce(public.profiles.full_name, '')) = '' then excluded.full_name
            else public.profiles.full_name
          end;
  end loop;

  foreach v_email in array v_parent_emails loop
    insert into public.profiles (id, role, full_name)
    select
      u.id,
      'parent',
      coalesce(nullif(trim(initcap(replace(split_part(lower(u.email), '@', 1), '.', ' '))), ''), 'Parent BCW')
    from auth.users u
    where lower(u.email) = lower(v_email)
    on conflict (id) do update
      set role = 'parent',
          full_name = case
            when trim(coalesce(public.profiles.full_name, '')) = '' then excluded.full_name
            else public.profiles.full_name
          end;
  end loop;

  -- Optional: set Bilal as admin if schema allows 'admin' role
  begin
    update public.profiles p
    set role = 'admin'
    from auth.users u
    where p.id = u.id
      and lower(u.email) = 'bilal.zeamari@bcwcours.be';
  exception
    when check_violation then
      raise notice 'Role admin not allowed by current schema. Keeping prof role.';
  end;
end $$;

-- Guard: at least one prof is required to assign demo students
do $$
declare
  v_prof_count int;
begin
  select count(*) into v_prof_count
  from public.profiles
  where role = 'prof' or role = 'admin';

  if v_prof_count = 0 then
    raise exception 'No prof/admin profile found. Create at least one teacher account first.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 2) Insert demo students
-- ---------------------------------------------------------
with demo_students(full_name, level, email) as (
  values
    ('Nora El Amrani', 'secondaire', 'nora.elamrani.demo@bcw.local'),
    ('Yassine Boulahfa', 'secondaire', 'yassine.boulahfa.demo@bcw.local'),
    ('Lina Chraibi', 'secondaire', 'lina.chraibi.demo@bcw.local'),
    ('Adam El Fassi', 'superieur', 'adam.elfassi.demo@bcw.local'),
    ('Salma Ait Lahcen', 'superieur', 'salma.aitlahcen.demo@bcw.local'),
    ('Rayan Mansouri', 'secondaire', 'rayan.mansouri.demo@bcw.local'),
    ('Ines Benjelloun', 'superieur', 'ines.benjelloun.demo@bcw.local'),
    ('Mehdi Harrou', 'secondaire', 'mehdi.harrou.demo@bcw.local')
)
insert into public.students (full_name, level, email)
select d.full_name, d.level, d.email
from demo_students d
where not exists (
  select 1
  from public.students s
  where lower(s.email) = lower(d.email)
);

-- ---------------------------------------------------------
-- 3) Assign demo students to available profs (round-robin)
-- ---------------------------------------------------------
create temporary table tmp_seed_students on commit drop as
select
  s.id,
  s.full_name,
  s.email,
  row_number() over (order by lower(s.email)) as rn
from public.students s
where lower(s.email) in (
  'nora.elamrani.demo@bcw.local',
  'yassine.boulahfa.demo@bcw.local',
  'lina.chraibi.demo@bcw.local',
  'adam.elfassi.demo@bcw.local',
  'salma.aitlahcen.demo@bcw.local',
  'rayan.mansouri.demo@bcw.local',
  'ines.benjelloun.demo@bcw.local',
  'mehdi.harrou.demo@bcw.local'
);

create temporary table tmp_seed_teachers on commit drop as
select
  p.id,
  p.full_name,
  row_number() over (order by p.created_at, p.id) as rn
from public.profiles p
where p.role in ('prof', 'admin');

insert into public.teacher_students (teacher_id, student_id, subjects)
select
  t.id as teacher_id,
  s.id as student_id,
  case ((s.rn - 1) % 3)
    when 0 then 'Mathématiques'
    when 1 then 'Sciences'
    else 'Français'
  end as subjects
from tmp_seed_students s
join tmp_seed_teachers t
  on t.rn = ((s.rn - 1) % (select count(*) from tmp_seed_teachers)) + 1
on conflict (teacher_id, student_id) do update
set subjects = excluded.subjects;

-- ---------------------------------------------------------
-- 4) Link parents to demo students (optional if parents exist)
-- ---------------------------------------------------------
insert into public.parent_students (parent_id, student_id)
with parent_pool as (
  select
    p.id,
    row_number() over (order by p.created_at, p.id) as rn
  from public.profiles p
  where p.role = 'parent'
),
parent_count as (
  select count(*)::int as cnt from parent_pool
),
student_pool as (
  select
    s.id,
    s.rn
  from tmp_seed_students s
  where s.rn <= 6
)
select
  pp.id as parent_id,
  sp.id as student_id
from student_pool sp
join parent_pool pp
  on pp.rn = ((sp.rn - 1) % nullif((select cnt from parent_count), 0)) + 1
on conflict (parent_id, student_id) do nothing;

-- ---------------------------------------------------------
-- 5) Insert published demo reports (last 3 weeks)
-- ---------------------------------------------------------
with primary_links as (
  select distinct on (ts.student_id)
    ts.teacher_id,
    ts.student_id
  from public.teacher_students ts
  join tmp_seed_students s on s.id = ts.student_id
  order by ts.student_id, ts.teacher_id
),
report_rows as (
  select
    pl.teacher_id,
    pl.student_id,
    (current_date - (w.week_idx * 7))::date as session_date,
    case w.week_idx
      when 1 then 'Révisions ciblées'
      when 2 then 'Exercices approfondis'
      else 'Méthodologie et applications'
    end as subjects_covered,
    case w.week_idx
      when 1 then 'Bonne compréhension des notions.'
      when 2 then 'Participation active et bonne progression.'
      else 'Autonomie en hausse.'
    end as strengths,
    case w.week_idx
      when 1 then 'Travailler la rigueur des étapes.'
      when 2 then 'Améliorer la gestion du temps.'
      else 'Renforcer la précision sur les exercices longs.'
    end as improvements,
    'Exercices recommandés + fiche récapitulative.' as resources_text,
    (3 + (w.week_idx % 3))::int as score,
    now() - interval '1 day' as published_at
  from primary_links pl
  cross join (values (1), (2), (3)) as w(week_idx)
)
insert into public.session_reports (
  teacher_id,
  student_id,
  session_date,
  subjects_covered,
  strengths,
  improvements,
  resources_text,
  score,
  published_at
)
select
  r.teacher_id,
  r.student_id,
  r.session_date,
  r.subjects_covered,
  r.strengths,
  r.improvements,
  r.resources_text,
  r.score,
  r.published_at
from report_rows r
where not exists (
  select 1
  from public.session_reports sr
  where sr.teacher_id = r.teacher_id
    and sr.student_id = r.student_id
    and sr.session_date = r.session_date
    and sr.subjects_covered = r.subjects_covered
);

-- ---------------------------------------------------------
-- 6) Insert upcoming demo sessions (if table exists)
-- ---------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'scheduled_sessions'
  ) then
    insert into public.scheduled_sessions (
      teacher_id,
      student_id,
      scheduled_at,
      subject,
      notes
    )
    with primary_links as (
      select distinct on (ts.student_id)
        ts.teacher_id,
        ts.student_id
      from public.teacher_students ts
      join tmp_seed_students s on s.id = ts.student_id
      order by ts.student_id, ts.teacher_id
    ),
    schedule_rows as (
      select
        pl.teacher_id,
        pl.student_id,
        date_trunc('day', now())
          + ((row_number() over (order by pl.student_id) + 1) * interval '1 day')
          + interval '17 hour' as scheduled_at
      from primary_links pl
    )
    select
      sr.teacher_id,
      sr.student_id,
      sr.scheduled_at,
      'Séance hebdomadaire',
      'Séance de suivi demo'
    from schedule_rows sr
    where not exists (
      select 1
      from public.scheduled_sessions ss
      where ss.teacher_id = sr.teacher_id
        and ss.student_id = sr.student_id
        and ss.scheduled_at::date = sr.scheduled_at::date
    );
  else
    raise notice 'Table scheduled_sessions not found. Skipping upcoming sessions seed.';
  end if;
end $$;

-- ---------------------------------------------------------
-- 7) Seed demo groups if groups tables exist
-- ---------------------------------------------------------
do $$
declare
  v_teacher_id uuid;
  v_group_math_id uuid;
  v_group_science_id uuid;
  v_has_group_type boolean;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'groups'
  ) then
    raise notice 'Table groups not found. Skipping groups seed.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'group_students'
  ) then
    raise notice 'Table group_students not found. Skipping groups seed.';
    return;
  end if;

  select id
  into v_teacher_id
  from public.profiles
  where role in ('prof', 'admin')
  order by created_at, id
  limit 1;

  if v_teacher_id is null then
    raise notice 'No teacher available for group seed.';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'groups'
      and column_name = 'group_type'
  ) into v_has_group_type;

  if not exists (select 1 from public.groups where name = 'Groupe Demo - Maths Secondaire') then
    if v_has_group_type then
      insert into public.groups (name, group_type, level, subject, teacher_id, is_active)
      values ('Groupe Demo - Maths Secondaire', 'group', 'secondaire', 'Mathématiques', v_teacher_id, true);
    else
      insert into public.groups (name, level, subject, teacher_id, is_active)
      values ('Groupe Demo - Maths Secondaire', 'secondaire', 'Mathématiques', v_teacher_id, true);
    end if;
  end if;

  if not exists (select 1 from public.groups where name = 'Groupe Demo - Sciences Supérieur') then
    if v_has_group_type then
      insert into public.groups (name, group_type, level, subject, teacher_id, is_active)
      values ('Groupe Demo - Sciences Supérieur', 'group', 'superieur', 'Sciences', v_teacher_id, true);
    else
      insert into public.groups (name, level, subject, teacher_id, is_active)
      values ('Groupe Demo - Sciences Supérieur', 'superieur', 'Sciences', v_teacher_id, true);
    end if;
  end if;

  select id into v_group_math_id
  from public.groups
  where name = 'Groupe Demo - Maths Secondaire'
  order by created_at
  limit 1;

  select id into v_group_science_id
  from public.groups
  where name = 'Groupe Demo - Sciences Supérieur'
  order by created_at
  limit 1;

  if v_group_math_id is not null then
    insert into public.group_students (group_id, student_id)
    select v_group_math_id, s.id
    from tmp_seed_students s
    where s.rn <= 4
    on conflict (group_id, student_id) do nothing;
  end if;

  if v_group_science_id is not null then
    insert into public.group_students (group_id, student_id)
    select v_group_science_id, s.id
    from tmp_seed_students s
    where s.rn > 4
    on conflict (group_id, student_id) do nothing;
  end if;
end $$;

commit;

-- Quick sanity checks
select 'profiles' as table_name, count(*) as rows from public.profiles
union all
select 'students', count(*) from public.students
union all
select 'teacher_students', count(*) from public.teacher_students
union all
select 'parent_students', count(*) from public.parent_students
union all
select 'session_reports', count(*) from public.session_reports;
