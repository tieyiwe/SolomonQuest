-- Run in the Supabase SQL editor.
--
-- Adds a parent/guardian role and the table linking a parent account to
-- their student(s). A parent can be linked to more than one student (e.g.
-- siblings at the same school), and a student can have more than one linked
-- parent — hence a join table rather than a single column either way.

do $$
declare
  ck_name text;
begin
  select conname into ck_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%in%';

  if ck_name is not null then
    execute format('alter table public.profiles drop constraint %I', ck_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'teacher', 'staff', 'student', 'parent'));

create table if not exists public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

alter table public.parent_student_links enable row level security;
drop policy if exists "parent_student_links_all" on public.parent_student_links;
create policy "parent_student_links_all" on public.parent_student_links for all using (true) with check (true);

create index if not exists parent_student_links_parent_idx on public.parent_student_links (parent_id);
create index if not exists parent_student_links_student_idx on public.parent_student_links (student_id);

-- Lets a parent invitation carry which student it should be linked to once
-- accepted (mirrors how a student invitation carries program_id).
alter table public.invitations
  add column if not exists student_id uuid references public.profiles(id) on delete set null;

do $$
declare
  ck_name text;
begin
  select conname into ck_name
  from pg_constraint
  where conrelid = 'public.invitations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%in%';

  if ck_name is not null then
    execute format('alter table public.invitations drop constraint %I', ck_name);
  end if;
end $$;

alter table public.invitations
  add constraint invitations_role_check
  check (role in ('admin', 'teacher', 'staff', 'student', 'parent'));
