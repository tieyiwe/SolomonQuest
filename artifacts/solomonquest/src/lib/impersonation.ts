import { auth } from "./session";

const ADMIN_SESSION_KEY = "sq_impersonation_admin_session";
const TARGET_KEY = "sq_impersonation_target";

export interface ImpersonationTarget {
  id: string;
  name: string;
  role: string;
}

function dashboardPathFor(role: string): string {
  if (role === "teacher") return "/dashboard/teacher";
  return "/dashboard/student"; // staff and student share the student dashboard
}

function getClerk(): any {
  return (window as any).Clerk;
}

/**
 * Starts a "view as" / Test Mode session: the server issues a Clerk actor
 * token for the target user, redeemed here via Clerk's ticket sign-in
 * strategy — this creates a genuine SECOND Clerk session for that account
 * without touching the caller's own session (Clerk tracks multiple signed-in
 * sessions per browser), so every existing fetch/query in the app works
 * unmodified once the client's active session switches, with no per-page
 * auth plumbing needed. The caller's own Clerk session id (and role, so we
 * know where to send them back) is saved first so `returnToOrigin` can
 * switch back to it later — Clerk keeps that session alive in the
 * background the whole time. Works both for an admin using "View As" and
 * for any user an admin has granted test_mode_enabled to.
 */
export async function startImpersonation(userId: string): Promise<void> {
  const clerk = getClerk();
  const originSessionId: string | undefined = clerk?.session?.id;
  if (!originSessionId) throw new Error("Not signed in");

  const { data: { session: originSession } } = await auth.getSession();
  if (!originSession) throw new Error("Not signed in");

  const [impersonateRes, meRes] = await Promise.all([
    fetch(`/api/admin/impersonate/${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${originSession.access_token}` },
    }),
    fetch(`/api/auth/me`, {
      headers: { Authorization: `Bearer ${originSession.access_token}` },
    }),
  ]);

  if (!impersonateRes.ok) {
    const body = await impersonateRes.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to start view-as session");
  }

  const { ticket, targetUser } = await impersonateRes.json();
  const originRole: string = meRes.ok ? (await meRes.json())?.role ?? "student" : "student";

  const signInAttempt = await clerk.client.signIn.create({ strategy: "ticket", ticket });
  if (signInAttempt.status !== "complete" || !signInAttempt.createdSessionId) {
    throw new Error("Failed to start view-as session");
  }

  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({ sessionId: originSessionId, originRole })
  );
  sessionStorage.setItem(TARGET_KEY, JSON.stringify(targetUser as ImpersonationTarget));

  await clerk.setActive({ session: signInAttempt.createdSessionId });
  window.location.href = dashboardPathFor(targetUser.role);
}

/**
 * Drops any saved "viewing as" state without restoring a session — used
 * when someone signs in normally (e.g. the login form). Without this, a
 * stale sq_impersonation_target left over from a session that ended
 * without clicking "Return to My Account" (tab closed, session expired,
 * signed out directly) would make the banner reappear showing "Viewing
 * as <old target>" on top of a completely fresh login, even though the
 * new session correctly is the admin/super_admin account.
 */
export function clearImpersonationState(): void {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(TARGET_KEY);
}

export function getImpersonationTarget(): ImpersonationTarget | null {
  const raw = sessionStorage.getItem(TARGET_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationTarget;
  } catch {
    return null;
  }
}

/** Switches back to the original account's already-active Clerk session. */
export async function returnToOrigin(): Promise<void> {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(TARGET_KEY);

  if (!raw) {
    window.location.href = "/";
    return;
  }

  const { sessionId, originRole } = JSON.parse(raw);
  const clerk = getClerk();
  try {
    await clerk?.setActive({ session: sessionId });
  } catch {
    // Origin session may have expired — fall back to a normal login.
    window.location.href = "/auth/login";
    return;
  }
  window.location.href =
    originRole === "admin" || originRole === "super_admin" ? "/dashboard/admin" : dashboardPathFor(originRole);
}
