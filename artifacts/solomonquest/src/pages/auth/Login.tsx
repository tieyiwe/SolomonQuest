import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { clearImpersonationState } from "@/lib/impersonation";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const resetSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type ResetFormValues = z.infer<typeof resetSchema>;

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [_, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "super_admin") {
      setLocation("/dashboard/admin");
    } else if (user.role === "teacher") {
      setLocation("/dashboard/teacher");
    } else if (user.role === "student" || user.role === "staff") {
      setLocation("/dashboard/student");
    } else if (user.role === "parent") {
      setLocation("/dashboard/parent");
    } else {
      setLocation("/onboarding/setup");
    }
  }, [user, setLocation]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const resetForm = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  });

  function redirectByRole(role: string | null | undefined) {
    if (role === "admin" || role === "super_admin") {
      setLocation("/dashboard/admin");
    } else if (role === "teacher") {
      setLocation("/dashboard/teacher");
    } else if (role === "student" || role === "staff") {
      setLocation("/dashboard/student");
    } else if (role === "parent") {
      setLocation("/dashboard/parent");
    } else {
      setLocation("/onboarding/setup");
    }
  }

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      // A fresh login always takes over as this account, regardless of
      // whatever "View As" / Test Mode state a previous session on this
      // browser left behind (e.g. the tab was closed mid-impersonation
      // instead of clicking "Return to My Account").
      clearImpersonationState();

      try {
        const token = authData.session?.access_token;
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const profile = await res.json();
          toast.success("Welcome back!");
          redirectByRole(profile?.role);
          return;
        }
      } catch {
        // fall through to useEffect redirect below
      }

      toast.success("Successfully logged in");
    } catch (error: unknown) {
      const msg =
        error instanceof Error && error.message
          ? error.message
          : typeof error === "string" && error
            ? error
            : "Failed to log in. Please try again.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function onResetSubmit(data: ResetFormValues) {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (error: unknown) {
      const msg =
        error instanceof Error && error.message
          ? error.message
          : "Failed to send reset email. Please try again.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8 bg-background flex-1">
        <div className="w-full max-w-md space-y-8">

          {/* ── Forgot password view ── */}
          {showReset ? (
            <>
              <div className="space-y-2">
                <button
                  onClick={() => { setShowReset(false); setResetSent(false); resetForm.reset(); }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </button>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Reset password</h1>
                <p className="text-muted-foreground">
                  Enter your email and we'll send you a link to reset your password.
                </p>
              </div>

              {resetSent ? (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 space-y-1">
                  <p className="font-semibold text-green-800 dark:text-green-300">Check your email</p>
                  <p className="text-sm text-green-700 dark:text-green-400">
                    We've sent a password reset link to <strong>{resetForm.getValues("email")}</strong>.
                    Check your inbox and follow the link to set a new password.
                  </p>
                  <button
                    onClick={() => { setShowReset(false); setResetSent(false); resetForm.reset(); }}
                    className="mt-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Return to sign in
                  </button>
                </div>
              ) : (
                <Form {...resetForm}>
                  <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-6">
                    <FormField
                      control={resetForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="name@example.com"
                              type="email"
                              autoComplete="email"
                              className="min-h-[44px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full min-h-[48px] text-base" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send reset link
                    </Button>
                  </form>
                </Form>
              )}
            </>
          ) : (

          /* ── Sign in view ── */
          <>
            <div className="space-y-2 text-center md:text-left">
              <Link href="/">
                <a className="inline-block text-xl font-bold text-primary mb-6">SolomonQuest</a>
              </Link>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h1>
              <p className="text-muted-foreground">Sign in to your account to continue</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="name@example.com"
                          type="email"
                          autoComplete="email"
                          className="min-h-[44px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <button
                          type="button"
                          onClick={() => setShowReset(true)}
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <FormControl>
                        <Input
                          placeholder="••••••••"
                          type="password"
                          autoComplete="current-password"
                          className="min-h-[44px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full min-h-[48px] text-base" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>

            <div className="text-center md:text-left text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/auth/register">
                <a className="font-semibold text-primary hover:underline">Sign up</a>
              </Link>
            </div>
          </>
          )}
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
