-- ============================================================================
-- Cost/efficiency migration — run in the Supabase SQL editor.
--
-- Context: many admin/teacher list views (GET /users, GET /courses/*/roster
-- equivalents, super-admin user list, course-resource notification fan-out,
-- broadcast messaging, etc.) look up each user's email by calling
-- `supabase.auth.admin.getUserById(id)` ONCE PER ROW in a loop. A page
-- showing 50 users was making 50 separate Auth Admin API calls just to
-- render a list — that's real, avoidable Supabase usage (Auth API calls +
-- round-trip latency), and it scales linearly with your user count.
--
-- Fix: keep a copy of each user's email directly on `profiles`, kept in
-- sync automatically, so every one of those call sites becomes a normal
-- column read on a query the code was already making — zero extra API
-- calls, zero extra round-trips.
-- ============================================================================

alter table public.profiles
  add column if not exists email text;

-- Backfill existing rows from auth.users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is distinct from u.email;

create index if not exists profiles_email_idx on public.profiles (email);

-- Keep it in sync going forward: populate on new-user creation...
create or replace function public.handle_new_user_email()
returns trigger as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_set_email on auth.users;
create trigger on_auth_user_created_set_email
  after insert on auth.users
  for each row execute function public.handle_new_user_email();

-- ...and whenever someone's login email changes.
create or replace function public.handle_auth_user_email_update()
returns trigger as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_update();
