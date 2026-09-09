-- Run in the Supabase SQL editor.
--
-- Tracks who built each course (courses can be created by different admins
-- and staff) plus a log of teacher assignment changes over the course's
-- life, since the assigned teacher can be reassigned more than once.

alter table public.courses
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.courses
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.course_audit_log (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  action text not null check (action in ('created', 'teacher_assigned', 'teacher_unassigned')),
  performed_by uuid references public.profiles(id) on delete set null,
  previous_teacher_id uuid references public.profiles(id) on delete set null,
  new_teacher_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.course_audit_log enable row level security;
drop policy if exists "course_audit_log_all" on public.course_audit_log;
create policy "course_audit_log_all" on public.course_audit_log for all using (true) with check (true);

create index if not exists course_audit_log_course_idx on public.course_audit_log (course_id, created_at desc);
