-- Run in the Supabase SQL editor.
--
-- Lets a forum topic be scoped to a program (on top of the existing
-- per-course scoping) and adds @-mention tracking so a mentioned
-- teacher/student/admin gets notified.

alter table public.forum_topics
  add column if not exists program_id uuid references public.programs(id) on delete set null;

create table if not exists public.forum_mentions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.forum_topics(id) on delete cascade,
  comment_id uuid references public.forum_comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint forum_mentions_target_check check (topic_id is not null or comment_id is not null)
);

alter table public.forum_mentions enable row level security;
drop policy if exists "forum_mentions_all" on public.forum_mentions;
create policy "forum_mentions_all" on public.forum_mentions for all using (true) with check (true);

create index if not exists forum_mentions_topic_idx on public.forum_mentions (topic_id);
create index if not exists forum_mentions_comment_idx on public.forum_mentions (comment_id);
create index if not exists forum_mentions_user_idx on public.forum_mentions (mentioned_user_id);
