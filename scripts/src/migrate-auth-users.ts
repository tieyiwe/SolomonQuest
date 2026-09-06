// One-time migration: copies every existing Supabase Auth user's id + email
// into our own `app_users` table (Replit's own Postgres, via DATABASE_URL).
//
// This is NOT an auth system — auth runs on Clerk now. This table is purely
// a lookup so that when a returning tester signs up fresh through Clerk
// with their same email, the backend can relink their new Clerk account to
// their EXISTING profile (courses, grades, history) instead of creating a
// second, empty one. See api-server/src/lib/profile-resolution.ts.
//
// Usage (from repo root, with SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY and the
// new DATABASE_URL set in the environment this runs in):
//   pnpm --filter @workspace/scripts run migrate-auth-users
//
// Safe to re-run — existing app_users rows are left untouched (ON CONFLICT
// DO NOTHING), so running it again after new signups on the Supabase side
// just backfills anyone new.

import { createClient } from "@supabase/supabase-js";
import { db, appUsers, sql } from "@workspace/db";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (read-only access to the old auth.users).");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  let page = 1;
  const perPage = 1000;
  let totalMigrated = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Failed to list Supabase auth users:", error.message);
      process.exit(1);
    }

    const users = data.users;
    if (users.length === 0) break;

    for (const user of users) {
      if (!user.email) continue;
      await db
        .insert(appUsers)
        .values({
          id: user.id,
          email: user.email.toLowerCase().trim(),
          createdAt: new Date(user.created_at),
        })
        .onConflictDoNothing({ target: appUsers.id });
      totalMigrated += 1;
    }

    console.log(`Processed page ${page} (${users.length} users)`);
    if (users.length < perPage) break;
    page += 1;
  }

  const [{ count }] = await db.execute<{ count: string }>(sql`select count(*)::int as count from app_users`).then(
    (r) => r.rows as { count: string }[]
  );

  console.log(`\nDone. Processed ${totalMigrated} Supabase auth users.`);
  console.log(`app_users now has ${count} total row(s), ready for email-based relinking on Clerk sign-up.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
