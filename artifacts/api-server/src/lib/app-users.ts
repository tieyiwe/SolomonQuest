import { randomBytes } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db, appUsers, passwordResetTokens } from "@workspace/db";
import { hashPassword } from "./auth-jwt";

/** Drop-in-ish replacement for supabaseAdmin.auth.admin.getUserById(id).data.user?.email */
export async function getAppUserEmail(id: string): Promise<string | null> {
  const [account] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  return account?.email ?? null;
}

/** Batch email lookup for list views that used to loop auth.admin.getUserById per row. */
export async function getAppUserEmails(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db.select().from(appUsers).where(inArray(appUsers.id, ids));
  const map: Record<string, string> = {};
  for (const row of rows) map[row.id] = row.email;
  return map;
}

/** Replacement for supabaseAdmin.auth.admin.deleteUser(id) — removes the login account. */
export async function deleteAppUser(id: string): Promise<void> {
  await db.delete(appUsers).where(eq(appUsers.id, id));
}

export async function countAppUsers(): Promise<number> {
  const rows = await db.select({ id: appUsers.id }).from(appUsers);
  return rows.length;
}

/**
 * Generates a password-reset token for an admin-triggered "send reset email"
 * action, replacing supabaseAdmin.auth.admin.generateLink({type:"recovery"}).
 * Returns null if the user has no account on file.
 */
export async function generatePasswordResetLink(userId: string): Promise<string | null> {
  const [account] = await db.select().from(appUsers).where(eq(appUsers.id, userId));
  if (!account) return null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(passwordResetTokens).values({ token, userId, expiresAt });

  const appUrl = process.env.APP_URL ?? "";
  return `${appUrl}/auth/reset-password?token=${token}`;
}

/** Replacement for supabaseAdmin.auth.admin.updateUserById(id, {password}). */
export async function setAppUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  const result = await db.update(appUsers).set({ passwordHash }).where(eq(appUsers.id, userId));
  return (result.rowCount ?? 0) > 0;
}

/**
 * Drop-in replacement for the handful of `supabaseAdmin.auth.admin.*` calls
 * this codebase used purely to look up a user's email (or delete/update
 * their account) — matches the shape those call sites already destructure
 * (`{ data: { user } }`, `{ error }`), so swapping the receiver was a
 * mechanical rename rather than a per-call-site rewrite.
 */
export const appAuthAdmin = {
  async getUserById(id: string): Promise<{ data: { user: { id: string; email: string } | null } }> {
    const [account] = await db.select().from(appUsers).where(eq(appUsers.id, id));
    return { data: { user: account ? { id: account.id, email: account.email } : null } };
  },
  async deleteUser(id: string): Promise<{ error: { message: string } | null }> {
    await deleteAppUser(id);
    return { error: null };
  },
  async updateUserById(
    id: string,
    attrs: { password?: string }
  ): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
    if (!attrs.password) return { data: { id }, error: null };
    const ok = await setAppUserPassword(id, attrs.password);
    return ok ? { data: { id }, error: null } : { data: null, error: { message: "User not found" } };
  },
};
