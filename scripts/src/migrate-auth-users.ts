// One-time migration: copies every existing Supabase Auth user into our own
// `app_users` table (Replit's own Postgres, via DATABASE_URL) so nobody's
// account disappears when the backend stops depending on Supabase Auth.
//
// Existing accounts get NO password here — Supabase never exposes password
// hashes to us, so there's nothing to copy. Each migrated user must use
// "Forgot password" once on their first login after the cutover; the login
// endpoint already gives a clear message for this case instead of a generic
// "invalid password" error.
//
// Usage (from repo root, with both SUPABASE_* and DATABASE_URL set in the
// environment this runs in):
//   pnpm --filter @workspace/scripts run migrate-auth-users
//
// Safe to re-run — existing app_users rows are left untouched (ON CONFLICT
// DO NOTHING), so running it again after new signups on the Supabase side
// just backfills anyone new.

import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { db, appUsers } from "@workspace/db";

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
          passwordHash: null,
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
  console.log(`app_users now has ${count} total row(s).`);
  console.log(
    "\nEvery migrated user has no password set yet — they'll need to use \"Forgot password\" once to finish moving over."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
