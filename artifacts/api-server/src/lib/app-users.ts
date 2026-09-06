import { supabaseAdmin } from "./supabase";
import { clerkClient, getClerkUserEmail } from "./clerk";

/**
 * Compatibility layer for the handful of places that used to call
 * `supabaseAdmin.auth.admin.*` to look up/manage a user's login account.
 * Auth now lives in Clerk, and every call site here works with this app's
 * internal profile id (a uuid) rather than a Clerk id directly — so each
 * helper first resolves the profile's linked `clerk_user_id`.
 */

async function clerkIdForProfile(profileId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("clerk_user_id")
    .eq("id", profileId)
    .maybeSingle();
  return (data?.clerk_user_id as string | null) ?? null;
}

export async function getAppUserEmail(profileId: string): Promise<string | null> {
  const clerkId = await clerkIdForProfile(profileId);
  if (!clerkId) return null;
  return getClerkUserEmail(clerkId);
}

/** Batch email lookup for list views. */
export async function getAppUserEmails(profileIds: string[]): Promise<Record<string, string>> {
  if (profileIds.length === 0) return {};
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, clerk_user_id")
    .in("id", profileIds);

  const map: Record<string, string> = {};
  await Promise.all(
    (data ?? []).map(async (p) => {
      const clerkId = p.clerk_user_id as string | null;
      if (!clerkId) return;
      const email = await getClerkUserEmail(clerkId);
      if (email) map[p.id as string] = email;
    })
  );
  return map;
}

/** Deletes the user's Clerk login account (their profile row is deleted separately by the caller). */
export async function deleteAppUser(profileId: string): Promise<void> {
  const clerkId = await clerkIdForProfile(profileId);
  if (!clerkId) return;
  try {
    await clerkClient.users.deleteUser(clerkId);
  } catch {
    // Best-effort — the profile row is still removed by the caller either way.
  }
}

/** Admin-set password. Returns false if the target has no linked Clerk account yet. */
export async function setAppUserPassword(profileId: string, newPassword: string): Promise<boolean> {
  const clerkId = await clerkIdForProfile(profileId);
  if (!clerkId) return false;
  try {
    await clerkClient.users.updateUser(clerkId, { password: newPassword });
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop-in replacement for the handful of `supabaseAdmin.auth.admin.*` calls
 * this codebase used purely to look up a user's email (or delete/update
 * their account) — matches the shape those call sites already destructure
 * (`{ data: { user } }`, `{ error }`), so swapping the receiver was a
 * mechanical rename rather than a per-call-site rewrite.
 */
export const appAuthAdmin = {
  async getUserById(profileId: string): Promise<{ data: { user: { id: string; email: string } | null } }> {
    const email = await getAppUserEmail(profileId);
    return { data: { user: email ? { id: profileId, email } : null } };
  },
  async deleteUser(profileId: string): Promise<{ error: { message: string } | null }> {
    await deleteAppUser(profileId);
    return { error: null };
  },
  async updateUserById(
    profileId: string,
    attrs: { password?: string }
  ): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
    if (!attrs.password) return { data: { id: profileId }, error: null };
    const ok = await setAppUserPassword(profileId, attrs.password);
    return ok ? { data: { id: profileId }, error: null } : { data: null, error: { message: "User has no linked login account" } };
  },
};
