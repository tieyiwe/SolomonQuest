// Thin wrapper around Clerk's global client (window.Clerk, attached by
// <ClerkProvider> in App.tsx) that mimics the small slice of supabase-js's
// `.auth` API this app already calls everywhere (getSession/
// onAuthStateChange/signOut) — so the ~35 files that only ever used
// `supabase.auth.getSession()` to grab a bearer token for their own fetch()
// calls needed just an import swap, not a rewrite. Actual sign-in/sign-up UI
// is Clerk's own <SignIn>/<SignUp> components (see pages/auth/*), not this
// file — this only covers reading the current session/token.

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

interface ClerkGlobal {
  session?: { getToken: () => Promise<string | null> } | null;
  user?: { id: string; primaryEmailAddress?: { emailAddress: string } | null } | null;
  addListener: (cb: (emission: { session?: unknown }) => void) => () => void;
  signOut: () => Promise<void>;
}

function getClerk(): ClerkGlobal | undefined {
  return (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
}

async function currentSession(): Promise<AppSession | null> {
  const clerk = getClerk();
  if (!clerk?.session || !clerk.user) return null;
  const token = await clerk.session.getToken();
  if (!token) return null;
  return {
    access_token: token,
    refresh_token: token,
    user: { id: clerk.user.id, email: clerk.user.primaryEmailAddress?.emailAddress ?? "" },
  };
}

export const auth = {
  async getSession(): Promise<{ data: { session: AppSession | null }; error: null }> {
    return { data: { session: await currentSession() }, error: null };
  },

  onAuthStateChange(callback: Listener): { data: { subscription: { unsubscribe: () => void } } } {
    const clerk = getClerk();
    if (!clerk) return { data: { subscription: { unsubscribe: () => {} } } };

    let lastSignedIn = !!clerk.session;
    const unsubscribe = clerk.addListener(async (emission) => {
      const isSignedIn = !!emission.session;
      if (isSignedIn === lastSignedIn) return;
      lastSignedIn = isSignedIn;
      callback(isSignedIn ? "SIGNED_IN" : "SIGNED_OUT", isSignedIn ? await currentSession() : null);
    });

    return { data: { subscription: { unsubscribe } } };
  },

  async signOut(): Promise<{ error: null }> {
    await getClerk()?.signOut();
    return { error: null };
  },
};
