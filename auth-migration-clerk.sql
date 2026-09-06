-- ============================================================================
-- Auth migration, Clerk — run this in the Supabase SQL editor.
--
-- Context: Auth is moving to Replit's built-in Clerk integration. Clerk
-- issues its own user IDs (e.g. "user_2abc123..."), which are NOT uuids,
-- while profiles.id is a uuid referenced by a large number of other tables
-- (courses.teacher_id, course_enrollments.student_id, submissions,
-- messages, notifications, chat, forum posts, and more). Re-keying
-- profiles.id itself to Clerk's id format would require re-keying every one
-- of those foreign keys too — high-risk for little benefit.
--
-- Instead, profiles.id stays exactly as it is today (uuid, unchanged, used
-- everywhere it already is). A new `clerk_user_id` column links each
-- profile to its Clerk account; the backend resolves it to the existing
-- internal id on every request, so nothing downstream of that changes.
-- ============================================================================

alter table public.profiles
  add column if not exists clerk_user_id text unique;

create index if not exists profiles_clerk_user_id_idx on public.profiles (clerk_user_id);
