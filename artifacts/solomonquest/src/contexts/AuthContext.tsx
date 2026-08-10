import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useGetMe, setAuthTokenGetter, getGetMeQueryKey } from "@workspace/api-client-react";
import { logActivity } from "@/lib/activityLogger";
import { clearImpersonationState } from "@/lib/impersonation";
import type { Profile } from "@workspace/api-client-react/src/generated/api.schemas";
import { useLocation } from "wouter";
import { queryClient } from "@/App";

interface AuthContextType {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [_, setLocation] = useLocation();
  const loggedInRef = useRef(false);
  const sessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoadingSession(false);
      sessionUserIdRef.current = session?.user?.id ?? null;
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // useGetMe's query key is static (not parameterized by session), so
      // switching to a DIFFERENT auth user in the same tab — logging in
      // after another account's session was active, restoring a linked
      // school's session, etc. — would otherwise keep serving the
      // previous user's cached profile (react-query's `isLoading` is
      // false whenever cached data exists, stale or not), sending them to
      // the wrong dashboard until a background refetch happened to land.
      // Evict it any time the authenticated user actually changes.
      const newUserId = session?.user?.id ?? null;
      if (newUserId !== sessionUserIdRef.current) {
        queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
      }
      sessionUserIdRef.current = newUserId;

      if (event === "SIGNED_IN" && !loggedInRef.current) {
        loggedInRef.current = true;
        logActivity({ action: "login" });
      }
      if (event === "SIGNED_OUT") {
        loggedInRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Keep the API client's auth token in sync with the Supabase session
  useEffect(() => {
    setAuthTokenGetter(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    });
    return () => setAuthTokenGetter(null);
  }, []);

  const { data: profile, isLoading: isLoadingProfile } = useGetMe({
    query: {
      enabled: !!session,
      retry: 2,
      retryDelay: 1000,
    },
  });

  const signOut = async () => {
    try { await logActivity({ action: "logout" }); } catch { /* non-blocking */ }
    await supabase.auth.signOut();
    clearImpersonationState();
    queryClient.clear();
    setLocation("/auth/login");
  };

  const isLoading = isLoadingSession || (!!session && isLoadingProfile);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: profile ?? null,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
