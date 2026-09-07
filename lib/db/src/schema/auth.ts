import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Our own account/credentials table, replacing Supabase Auth's `auth.users`.
 * Lives in this app's own Postgres (DATABASE_URL — Replit's own database),
 * separate from the rest of the app's data which still lives in Supabase
 * Postgres for now. `id` is a plain UUID generated at signup time and is
 * also used as `profiles.id` on the Supabase side — there's no live
 * cross-database foreign key (Postgres can't do that), so referential
 * integrity between the two databases is enforced in application code
 * instead of a DB constraint.
 */
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
