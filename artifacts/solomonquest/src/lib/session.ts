// Replaces Supabase Auth's session management on the frontend. Login,
// signup, password reset, and "view as"/school-switching all go through our
// own backend now (see api-server/src/routes/auth.ts), which issues a single
// long-lived signed token used as both `access_token` and `refresh_token` —
// there's no separate refresh flow, so `setSession` just re-validates and
// stores whichever token pair it's given.
//
// `@/lib/supabase.ts` still exports a real Supabase client for Storage and
// Realtime, which haven't moved yet — only `.auth.*` usage was on Supabase's
// auth product, and that's what this module replaces.

const STORAGE_KEY = "sq_session";

export interface AppUser {
  id: string;
  email: string;
}

export interface AppSession {
  access_token: string;
  refresh_token: string;
  user: AppUser;
}

type AuthEvent = "SIGNED_IN" | "SIGNED_OUT";
type Listener = (event: AuthEvent, session: AppSession | null) => void;

let currentSession: AppSession | null = readStoredSession();
const listeners = new Set<Listener>();

function readStoredSession(): AppSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppSession) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AppSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors (private browsing, quota, etc.)
  }
}

function setSessionInternal(session: AppSession | null): void {
  currentSession = session;
  writeStoredSession(session);
  const event: AuthEvent = session ? "SIGNED_IN" : "SIGNED_OUT";
  for (const listener of listeners) listener(event, session);
}

interface AuthResult<T> {
  data: T;
  error: Error | null;
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export const auth = {
  async getSession(): Promise<AuthResult<{ session: AppSession | null }>> {
    return { data: { session: currentSession }, error: null };
  },

  onAuthStateChange(callback: Listener): { data: { subscription: { unsubscribe: () => void } } } {
    listeners.add(callback);
    return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
  },

  async signOut(): Promise<{ error: null }> {
    setSessionInternal(null);
    return { error: null };
  },

  async signInWithPassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<AuthResult<{ session: AppSession | null }>> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        return { data: { session: null }, error: new Error(body.error ?? "Failed to log in") };
      }
      const session: AppSession = {
        access_token: body.accessToken,
        refresh_token: body.refreshToken,
        user: body.user,
      };
      setSessionInternal(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: err instanceof Error ? err : new Error("Failed to log in") };
    }
  },

  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options?: { data?: { first_name?: string; last_name?: string; phone?: string } };
  }): Promise<AuthResult<{ session: AppSession | null }>> {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName: options?.data?.first_name,
          lastName: options?.data?.last_name,
          phone: options?.data?.phone,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        return { data: { session: null }, error: new Error(body.error ?? "Failed to register") };
      }
      const session: AppSession = {
        access_token: body.accessToken,
        refresh_token: body.refreshToken,
        user: body.user,
      };
      setSessionInternal(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: err instanceof Error ? err : new Error("Failed to register") };
    }
  },

  async resetPasswordForEmail(email: string): Promise<{ error: Error | null }> {
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await parseJsonSafe(res);
        return { error: new Error(body.error ?? "Failed to send reset email") };
      }
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Failed to send reset email") };
    }
  },

  /**
   * Accepts an {access_token, refresh_token} pair minted elsewhere (a linked
   * school's saved tokens, an admin's own saved session, an impersonation
   * token) and makes it the active session, after confirming it's still
   * valid. Both stored fields are the same underlying token — see the file
   * header.
   */
  async setSession({
    access_token,
    refresh_token,
  }: {
    access_token: string;
    refresh_token: string;
  }): Promise<AuthResult<{ session: AppSession | null }>> {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!res.ok) {
        return { data: { session: null }, error: new Error("This session has expired") };
      }
      const me = await res.json();
      const session: AppSession = {
        access_token,
        refresh_token: refresh_token || access_token,
        user: { id: me.id, email: me.email },
      };
      setSessionInternal(session);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: err instanceof Error ? err : new Error("Failed to restore session") };
    }
  },

  /** Directly installs a token this tab already trusts (e.g. right after register/accept-invite). */
  setAccessToken(accessToken: string, user: AppUser): void {
    setSessionInternal({ access_token: accessToken, refresh_token: accessToken, user });
  },
};
