import { supabase } from "./supabase";

const STORAGE_KEY = "sq_linked_schools";

export interface LinkedSchool {
  schoolId: string;
  schoolName: string;
  userId: string;
  role: string;
  email: string;
  access_token: string;
  refresh_token: string;
}

/**
 * Each school account on this platform is a fully separate Supabase auth
 * user (its own email/password) — there's no single identity that spans
 * schools. "Switching schools" here means: once you've successfully logged
 * into a second school's account from this device and chosen to remember
 * it, we keep that account's session tokens in localStorage so switching
 * back is instant (no login box) next time. An account you haven't logged
 * into yet on this device always needs the login box first.
 */

function readLinked(): LinkedSchool[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LinkedSchool[]) : [];
  } catch {
    return [];
  }
}

function writeLinked(list: LinkedSchool[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getLinkedSchools(): LinkedSchool[] {
  return readLinked();
}

/** Adds or refreshes a linked school's saved session. */
export function saveLinkedSchool(entry: LinkedSchool): void {
  const list = readLinked().filter((s) => s.schoolId !== entry.schoolId);
  list.push(entry);
  writeLinked(list);
}

export function removeLinkedSchool(schoolId: string): void {
  writeLinked(readLinked().filter((s) => s.schoolId !== schoolId));
}

function dashboardPathFor(role: string): string {
  if (role === "admin" || role === "super_admin") return "/dashboard/admin";
  if (role === "teacher") return "/dashboard/teacher";
  return "/dashboard/student"; // staff and student share the student dashboard
}

/** Fetches {id, name} for the school tied to whichever session is currently active. */
async function fetchCurrentSchool(accessToken: string): Promise<{ id: string; name: string } | null> {
  const res = await fetch("/api/schools/my", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return { id: data.id, name: data.name };
}

async function fetchMe(accessToken: string): Promise<{ id: string; role: string; email: string } | null> {
  const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return { id: data.id, role: data.role, email: data.email };
}

/** Saves the CURRENTLY active session as a linked school, so switching back to it is instant too. */
export async function linkCurrentSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const [me, school] = await Promise.all([fetchMe(session.access_token), fetchCurrentSchool(session.access_token)]);
  if (!me || !school) return;
  saveLinkedSchool({
    schoolId: school.id,
    schoolName: school.name,
    userId: me.id,
    role: me.role,
    email: me.email,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

/** Instantly switches into a previously-linked school's saved session. */
export async function switchToLinkedSchool(schoolId: string): Promise<void> {
  const entry = readLinked().find((s) => s.schoolId === schoolId);
  if (!entry) throw new Error("This school isn't linked yet");

  const { data, error } = await supabase.auth.setSession({
    access_token: entry.access_token,
    refresh_token: entry.refresh_token,
  });

  if (error || !data.session) {
    // The saved refresh token expired/was revoked — drop it so the UI
    // falls back to showing the login box next time.
    removeLinkedSchool(schoolId);
    throw new Error("Your saved login for this school expired. Please log in again.");
  }

  // Supabase rotates refresh tokens on use — persist the new one so the
  // NEXT switch also works instead of silently going stale after one use.
  saveLinkedSchool({ ...entry, access_token: data.session.access_token, refresh_token: data.session.refresh_token });

  window.location.href = dashboardPathFor(entry.role);
}

/**
 * Logs into a different school's account with email/password, switches the
 * active session to it, and (if `remember`) saves it for instant switching
 * next time. Also opportunistically links the account being switched AWAY
 * FROM, so the very first switch makes both directions instant afterward.
 */
export async function loginToSchool(
  email: string,
  password: string,
  remember: boolean
): Promise<{ schoolName: string; role: string }> {
  await linkCurrentSession().catch(() => {});

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(error?.message ?? "Invalid email or password");
  }

  const [me, school] = await Promise.all([
    fetchMe(data.session.access_token),
    fetchCurrentSchool(data.session.access_token),
  ]);
  if (!me || !school) throw new Error("Failed to load account details");

  if (remember) {
    saveLinkedSchool({
      schoolId: school.id,
      schoolName: school.name,
      userId: me.id,
      role: me.role,
      email: me.email,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }

  window.location.href = dashboardPathFor(me.role);
  return { schoolName: school.name, role: me.role };
}
