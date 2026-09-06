import { randomUUID } from "crypto";
import { db, appUsers, eq } from "@workspace/db";
import { supabaseAdmin } from "./supabase";
import { clerkClient, getClerkUserEmail } from "./clerk";

export interface ResolvedProfile {
  id: string;
  role: string | null;
  school_id: string | null;
}

/**
 * Maps a Clerk user id to this app's internal profile — profiles.id stays a
 * plain uuid (unchanged, used by every other table's foreign keys); a
 * `clerk_user_id` column links it to the Clerk account. Three cases:
 *
 *  1. Already linked — the common case on every request after the first.
 *  2. A returning tester who had an account before the Clerk cutover: their
 *     email exists in `app_users` (the pre-Clerk account directory, kept
 *     around only for this one-time relink) pointing at their original
 *     profile id — link that existing profile to their new Clerk id instead
 *     of creating a duplicate, so their courses/grades/history aren't
 *     orphaned.
 *  3. A genuinely new account — create a fresh profile row.
 */
export async function resolveProfileForClerkUser(clerkUserId: string): Promise<ResolvedProfile | null> {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, role, school_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (existing) return existing;

  const email = await getClerkUserEmail(clerkUserId);
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const [legacy] = await db.select().from(appUsers).where(eq(appUsers.email, normalizedEmail));
    if (legacy) {
      const { data: legacyProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", legacy.id)
        .is("clerk_user_id", null)
        .maybeSingle();
      if (legacyProfile) {
        const { data: relinked } = await supabaseAdmin
          .from("profiles")
          .update({ clerk_user_id: clerkUserId })
          .eq("id", legacy.id)
          .select("id, role, school_id")
          .single();
        if (relinked) return relinked;
      }
    }
  }

  // Brand new account. Upsert on clerk_user_id (not id) so two concurrent
  // first-requests from the same new user race safely onto one row instead
  // of creating duplicates.
  let firstName = "";
  let lastName = "";
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    firstName = clerkUser.firstName ?? "";
    lastName = clerkUser.lastName ?? "";
  } catch {
    // Non-fatal — profile just starts with an empty name.
  }

  const { data: created } = await supabaseAdmin
    .from("profiles")
    .upsert(
      { id: randomUUID(), clerk_user_id: clerkUserId, first_name: firstName, last_name: lastName },
      { onConflict: "clerk_user_id" }
    )
    .select("id, role, school_id")
    .single();
  return created ?? null;
}
