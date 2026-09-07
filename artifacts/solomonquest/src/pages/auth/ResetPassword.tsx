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
import { Loader2 } from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const [_, setLocation] = useLocation();

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      // Supabase sets the session type to "recovery" when the user arrives via a reset link
      if (session && (session as unknown as { user?: { aud?: string } & { recovery?: boolean } } & { type?: string }).type === "recovery") {
        setIsValidSession(true);
      } else if (session) {
        // There is a session but not a recovery one — still allow if it's a fresh recovery token
        // Supabase v2 stores the type on the session object
        const raw = session as unknown as Record<string, unknown>;
        if (raw["type"] === "recovery") {
          setIsValidSession(true);
        } else {
          // Check URL hash for access_token which indicates a fresh recovery redirect
          const hash = window.location.hash;
          if (hash && hash.includes("type=recovery")) {
            setIsValidSession(true);
          } else {
            setIsValidSession(false);
          }
        }
      } else {
        // No session — check if URL hash carries a recovery token (before Supabase processes it)
        const hash = window.location.hash;
        if (hash && hash.includes("type=recovery")) {
          setIsValidSession(true);
        } else {
          setIsValidSession(false);
        }
      }
    }

    checkSession();

    // Listen for the PASSWORD_RECOVERY event which Supabase fires when it processes the hash
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidSession(true);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(data: ResetPasswordFormValues) {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      toast.success("Password updated!");
      setTimeout(() => setLocation("/auth/login"), 2000);
    } catch (error: unknown) {
      const msg =
        error instanceof Error && error.message
          ? error.message
          : "Failed to update password. Please try again.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-2">
      {/* Left: form panel */}
      <div className="flex items-center justify-center p-8 bg-background flex-1">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center md:text-left">
            <Link href="/">
              <a className="inline-block text-xl font-bold text-primary mb-6">SolomonQuest</a>
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Set new password</h1>
            <p className="text-muted-foreground">
              Choose a strong password for your account.
            </p>
          </div>

          {/* Loading state while we determine session validity */}
          {isValidSession === null && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Invalid / expired link */}
          {isValidSession === false && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 space-y-3">
              <p className="font-semibold text-destructive">Link expired or invalid</p>
              <p className="text-sm text-muted-foreground">
                This password reset link has expired or is invalid. Please request a new one.
              </p>
              <Link href="/auth/login">
                <a className="text-sm font-semibold text-primary hover:underline">
                  Back to sign in
                </a>
              </Link>
            </div>
          )}

          {/* Valid recovery session — show the form */}
          {isValidSession === true && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="••••••••"
                          type="password"
                          autoComplete="new-password"
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
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="••••••••"
                          type="password"
                          autoComplete="new-password"
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
                  Update password
                </Button>
              </form>
            </Form>
          )}

          <div className="text-center md:text-left text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link href="/auth/login">
              <a className="font-semibold text-primary hover:underline">Sign in</a>
            </Link>
          </div>
        </div>
      </div>

      {/* Right: decorative panel */}
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
