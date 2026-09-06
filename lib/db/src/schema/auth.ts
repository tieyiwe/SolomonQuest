import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pre-Clerk account directory. Auth now runs on Clerk (see api-server's
 * lib/clerk.ts / lib/profile-resolution.ts) — this table isn't used to log
 * anyone in anymore. It's kept only as a one-time lookup so a returning
 * tester who had an account before the Clerk cutover gets their existing
 * profile (courses, grades, history) relinked to their new Clerk id by
 * matching email, instead of ending up with a duplicate blank profile.
 * Safe to drop once every pre-Clerk account has either signed back in or
 * been abandoned.
 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
