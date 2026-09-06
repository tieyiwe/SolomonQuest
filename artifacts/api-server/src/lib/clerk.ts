import { createClerkClient, verifyToken, type User } from "@clerk/backend";

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY must be set — Replit's Clerk integration provisions this automatically.");
}
const CLERK_SECRET_KEY: string = process.env.CLERK_SECRET_KEY;

export const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });

/** Verifies a Clerk session token from the Authorization header and returns the Clerk user id (sub), or null. */
export async function verifyClerkSessionToken(token: string): Promise<string | null> {
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function primaryEmailOf(user: User): string | null {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

/** Best-effort email lookup for a Clerk user id — used by admin views that display a user's email. */
export async function getClerkUserEmail(clerkUserId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(clerkUserId);
    return primaryEmailOf(user);
  } catch {
    return null;
  }
}
