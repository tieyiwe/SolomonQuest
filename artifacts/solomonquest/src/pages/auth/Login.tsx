import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { SignIn } from "@clerk/clerk-react";
import { useAuth } from "@/contexts/AuthContext";
import { clearImpersonationState } from "@/lib/impersonation";

export default function Login() {
  const [_, setLocation] = useLocation();
  const { user } = useAuth();

  // A fresh login always takes over as this account, regardless of whatever
  // "View As" / Test Mode state a previous session on this browser left
  // behind (e.g. the tab was closed mid-impersonation instead of clicking
  // "Return to My Account").
  useEffect(() => {
    clearImpersonationState();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "super_admin") {
      setLocation("/dashboard/admin");
    } else if (user.role === "teacher") {
      setLocation("/dashboard/teacher");
    } else if (user.role === "student" || user.role === "staff") {
      setLocation("/dashboard/student");
    } else {
      setLocation("/onboarding/setup");
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8 bg-background flex-1">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center md:text-left">
            <Link href="/">
              <a className="inline-block text-xl font-bold text-primary mb-6">SolomonQuest</a>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your account to continue</p>
          </div>

          <SignIn
            routing="virtual"
            signUpUrl="/auth/register"
            appearance={{ elements: { rootBox: "w-full", card: "shadow-none p-0 w-full" } }}
          />
        </div>
      </div>

      <div className="hidden md:block bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=2073&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-primary-foreground z-10 bg-gradient-to-t from-primary/90 to-transparent">
          <blockquote className="space-y-2 max-w-lg">
            <p className="text-2xl font-medium leading-snug">
              "The platform has completely transformed how our faculty manages coursework and communicates with students."
            </p>
            <footer className="text-sm font-semibold opacity-80">
              Sarah Jenkins, Dean of Academics
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
