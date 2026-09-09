-- Run in the Supabase SQL editor.
--
-- Terms/cycles as a first-class entity (a quarter, semester, trimester, or
-- any other custom period an admin/staff defines) instead of the free-text
-- `courses.term` column. Courses keep their old term/term_start_date/
-- term_end_date columns for backward compatibility (a course can still be
-- created without picking a term), but can now optionally be linked to one.

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.terms enable row level security;
drop policy if exists "terms_all" on public.terms;
create policy "terms_all" on public.terms for all using (true) with check (true);

create index if not exists terms_school_id_idx on public.terms (school_id);

alter table public.courses
  add column if not exists term_id uuid references public.terms(id) on delete set null;

create index if not exists courses_term_id_idx on public.courses (term_id);
