import { useEffect, useState } from "react";
import { Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { Router } from "@/Router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotesProvider } from "@/components/notes/NotesContext";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { TestModeSwitcher } from "@/components/TestModeSwitcher";

export const queryClient = new QueryClient();

/**
 * If a request comes in on a school's connected custom domain (not the
 * platform's own domain/preview URL) and hasn't already navigated somewhere
 * specific, silently rewrite the path to that school's public page. Skips
 * the check entirely once we've already resolved (or ruled out) a custom
 * domain for this page load.
 */
function useCustomDomainRedirect() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hostname = window.location.hostname;
    const path = window.location.pathname;
    const looksLikeOwnDomain =
      hostname === "localhost" ||
      hostname.endsWith(".replit.dev") ||
      hostname.endsWith(".repl.co") ||
      hostname.endsWith("solomonquest.com");

    if (looksLikeOwnDomain || path !== "/") {
      setReady(true);
      return;
    }

    fetch(`/api/schools/by-domain/${encodeURIComponent(hostname)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((school) => {
        if (school?.slug) {
          window.history.replaceState(null, "", `/schools/${school.slug}`);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  return ready;
}

function App() {
  const ready = useCustomDomainRedirect();

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <NotesProvider>
                <ImpersonationBanner />
                <Router />
                <TestModeSwitcher />
                <Toaster />
              </NotesProvider>
            </AuthProvider>
          </WouterRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
