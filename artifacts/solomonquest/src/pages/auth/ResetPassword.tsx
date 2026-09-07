import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { auth } from "@/lib/session";
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
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const token = params.get("token");

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit(data: ResetPasswordFormValues) {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update password");

      await auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
      toast.success("Password updated!");
      setTimeout(() => setLocation("/auth/login"), 1500);
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

          {/* Invalid / missing link */}
          {!token && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 space-y-3">
              <p className="font-semibold text-destructive">Link expired or invalid</p>
              <p className="text-sm text-muted-foreground">
                This password reset link is missing or invalid. Please request a new one.
              </p>
              <Link href="/auth/login">
                <a className="text-sm font-semibold text-primary hover:underline">
                  Back to sign in
                </a>
              </Link>
            </div>
          )}

          {token && (
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
