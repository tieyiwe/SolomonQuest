-- Run in the Supabase SQL editor.
--
-- Lets an admin grant specific, known test accounts permission to preview
-- the app as an admin via Test Mode ("Switch Profile"), on top of the
-- existing test_mode_enabled flag — for trusted testers helping exercise
-- every role, without opening that door to every test_mode account.
-- super_admin is intentionally never targetable this way (or any way,
-- except by a real super_admin) — that restriction is enforced in code,
-- not by this column.

alter table public.profiles
  add column if not exists test_mode_admin_access boolean not null default false;
