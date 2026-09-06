import { auth } from "./session";

const STORAGE_KEY = "sq_linked_schools";

export interface LinkedSchool {
  schoolId: string;
  schoolName: string;
  userId: string;
  role: string;
  email: string;
  clerkSessionId: string;
}

/**
 * Each school account on this platform is a fully separate Clerk user (its
 * own email/password) — there's no single identity that spans schools.
 * "Switching schools" here means: Clerk keeps every account you've signed
 * into on this device as a session in its client (multi-session support),
 * and switching is just telling Clerk which of those sessions is active —
 * no token juggling needed, Clerk already persists them. We only need to
 * remember which Clerk session id belongs to which school, so the switcher
 * UI can show a friendly list instead of raw session ids.
 */

function getClerk(): any {
  return (window as any).Clerk;
}

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
  const clerk = getClerk();
  const sessionId: string | undefined = clerk?.session?.id;
  const { data: { session } } = await auth.getSession();
  if (!session || !sessionId) return;
  const [me, school] = await Promise.all([fetchMe(session.access_token), fetchCurrentSchool(session.access_token)]);
  if (!me || !school) return;
  saveLinkedSchool({
    schoolId: school.id,
    schoolName: school.name,
    userId: me.id,
    role: me.role,
    email: me.email,
    clerkSessionId: sessionId,
  });
}

/** Instantly switches into a previously-linked school's saved Clerk session. */
export async function switchToLinkedSchool(schoolId: string): Promise<void> {
  const entry = readLinked().find((s) => s.schoolId === schoolId);
  if (!entry) throw new Error("This school isn't linked yet");

  const clerk = getClerk();
  const stillActive = clerk?.client?.sessions?.some((s: any) => s.id === entry.clerkSessionId);
  if (!stillActive) {
    removeLinkedSchool(schoolId);
    throw new Error("Your saved login for this school expired. Please log in again.");
  }

  try {
    await clerk.setActive({ session: entry.clerkSessionId });
  } catch {
    removeLinkedSchool(schoolId);
    throw new Error("Your saved login for this school expired. Please log in again.");
  }

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

  const clerk = getClerk();
  const signInAttempt = await clerk.client.signIn.create({ identifier: email, password });
  if (signInAttempt.status !== "complete" || !signInAttempt.createdSessionId) {
    throw new Error("Invalid email or password");
  }
  await clerk.setActive({ session: signInAttempt.createdSessionId });

  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error("Failed to load account details");

  const [me, school] = await Promise.all([
    fetchMe(session.access_token),
    fetchCurrentSchool(session.access_token),
  ]);
  if (!me || !school) throw new Error("Failed to load account details");

  if (remember) {
    saveLinkedSchool({
      schoolId: school.id,
      schoolName: school.name,
      userId: me.id,
      role: me.role,
      email: me.email,
      clerkSessionId: signInAttempt.createdSessionId,
    });
  }

  window.location.href = dashboardPathFor(me.role);
  return { schoolName: school.name, role: me.role };
}
