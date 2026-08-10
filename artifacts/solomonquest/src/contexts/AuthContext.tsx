import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useGetMe, setAuthTokenGetter } from "@workspace/api-client-react";
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
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
