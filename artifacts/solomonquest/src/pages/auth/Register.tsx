import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { SignUp, useUser } from "@clerk/clerk-react";
import { toast } from "sonner";

export default function Register() {
  const { isSignedIn } = useUser();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const schoolId = params.get("schoolId");
  const schoolName = params.get("schoolName");
  const nextPath = params.get("next") ?? "/onboarding/setup";

  // Runs once Clerk finishes sign-up and the session is active.
  useEffect(() => {
    if (!isSignedIn) return;

    (async () => {
      if (schoolId) {
        try {
          const clerk = (window as any).Clerk;
          const token = await clerk?.session?.getToken();
          await fetch("/api/users/me/join-school", {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ schoolId }),
          });
        } catch {
          /* non-fatal */
        }
        toast.success(`Account created! Welcome to ${schoolName ?? "your school"}.`);
        setLocation("/dashboard/student");
      } else {
        setLocation(nextPath);
      }
    })();
  }, [isSignedIn]);

  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-2">
      <div className="hidden md:block bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 flex flex-col justify-center p-12 text-primary-foreground z-10 bg-gradient-to-br from-primary/90 to-primary/40">
          <h2 className="text-4xl font-bold mb-6">Join SolomonQuest</h2>
          <p className="text-xl opacity-90 max-w-lg">
            Experience an LMS that actually respects its users. Clean, organized, and focused on education.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 bg-background flex-1">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center md:text-left">
            <Link href="/">
              <a className="inline-block text-xl font-bold text-primary mb-6 md:hidden">SolomonQuest</a>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Create an account</h1>
            {schoolName ? (
              <p className="text-muted-foreground">
                You're joining <span className="font-semibold text-primary">{schoolName}</span>
              </p>
            ) : (
              <p className="text-muted-foreground">Enter your details to get started</p>
            )}
          </div>

          <SignUp
            routing="virtual"
            signInUrl="/auth/login"
            appearance={{ elements: { rootBox: "w-full", card: "shadow-none p-0 w-full" } }}
          />
        </div>
      </div>
    </div>
  );
}
