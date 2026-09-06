-- ============================================================================
-- Auth migration, step 1 of 2 — run this in the Supabase SQL editor.
--
-- Context: the backend no longer uses Supabase Auth (GoTrue) at all. New
-- accounts are created in a separate `app_users` table that lives in this
-- app's own Postgres database (Replit's own DB, via DATABASE_URL), not in
-- Supabase's `auth.users`. Since profiles.id and schools.owner_id still
-- carry a foreign key to `auth.users` (in this same Supabase database),
-- every new signup would fail that constraint the moment it stops creating
-- an `auth.users` row. Postgres can't have a live foreign key across two
-- different databases, so the fix is to drop the constraint — referential
-- integrity between the two databases is enforced in application code
-- instead (see api-server/src/lib/app-users.ts).
--
-- This does NOT delete any data. Existing rows in profiles/schools/
-- auth.users are untouched — only the constraint that requires a matching
-- auth.users row is removed. Existing users still need to be copied into
-- app_users separately; see scripts/src/migrate-auth-users.ts (step 2).
-- ============================================================================

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and confrelid = 'auth.users'::regclass
    and contype = 'f';

  if fk_name is not null then
    execute format('alter table public.profiles drop constraint %I', fk_name);
  end if;
end $$;

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.schools'::regclass
    and confrelid = 'auth.users'::regclass
    and contype = 'f';

  if fk_name is not null then
    execute format('alter table public.schools drop constraint %I', fk_name);
  end if;
end $$;

-- This trigger auto-created a profile row whenever a new auth.users row
-- appeared. New signups no longer create auth.users rows at all (the
-- backend inserts profiles directly), so this trigger will simply never
-- fire again — dropping it is just cleanup, not a behavior change.
drop trigger if exists on_auth_user_created on auth.users;
