import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

/**
 * Clerk's own <SignIn> component (see Login.tsx) includes password reset as
 * part of its built-in flow ("Forgot password?"), so this route no longer
 * needs its own form — it just forwards old bookmarked/emailed links to
 * sign-in, where the reset flow now lives.
 */
export default function ResetPassword() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/auth/login", { replace: true });
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
