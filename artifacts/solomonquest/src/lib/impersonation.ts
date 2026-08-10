import { supabase } from "./supabase";

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

/**
 * Starts a "view as" / Test Mode session: mints a real Supabase session for
 * the target user (via a server-generated magic-link OTP, redeemed here) so
 * every existing fetch/query in the app works unmodified once the client
 * swaps to it — no per-page auth plumbing needed. The caller's own session
 * (and role, so we know where to send them back) is saved first so
 * `returnToOrigin` can restore it later. Works both for an admin using
 * "View As" and for any user an admin has granted test_mode_enabled to.
 */
export async function startImpersonation(userId: string): Promise<void> {
  const { data: { session: originSession } } = await supabase.auth.getSession();
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

  const { emailOtp, targetUser } = await impersonateRes.json();
  const originRole: string = meRes.ok ? (await meRes.json())?.role ?? "student" : "student";

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: emailOtp,
  });
  if (verifyError) throw verifyError;

  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      access_token: originSession.access_token,
      refresh_token: originSession.refresh_token,
      originRole,
    })
  );
  sessionStorage.setItem(TARGET_KEY, JSON.stringify(targetUser as ImpersonationTarget));

  window.location.href = dashboardPathFor(targetUser.role);
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

/** Restores the original account's session and clears view-as state. */
export async function returnToOrigin(): Promise<void> {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(TARGET_KEY);

  if (!raw) {
    window.location.href = "/";
    return;
  }

  const { access_token, refresh_token, originRole } = JSON.parse(raw);
  await supabase.auth.setSession({ access_token, refresh_token });
  window.location.href =
    originRole === "admin" || originRole === "super_admin" ? "/dashboard/admin" : dashboardPathFor(originRole);
}
