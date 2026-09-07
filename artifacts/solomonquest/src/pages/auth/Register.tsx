import { useState } from "react";
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

const registerSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(7, "Please enter a valid phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const schoolId = params.get("schoolId");
  const schoolName = params.get("schoolName");
  const nextPath = params.get("next") ?? "/onboarding/setup";

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  async function onSubmit(data: RegisterFormValues) {
    setIsLoading(true);
    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            first_name: data.firstName,
            last_name: data.lastName,
            phone: data.phone,
          },
        },
      });

      if (error) throw error;

      if (signUpData.session) {
        // If joining a school, link the account to that school
        if (schoolId) {
          try {
            await fetch("/api/users/me/join-school", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + signUpData.session.access_token,
              },
              body: JSON.stringify({ schoolId }),
            });
          } catch { /* non-fatal */ }
          toast.success(`Account created! Welcome to ${schoolName ?? "your school"}.`);
          setLocation("/dashboard/student");
        } else {
          toast.success("Account created! Setting up your profile...");
          setLocation(nextPath);
        }
      } else {
        // Email confirmation required
        toast.success("Account created! Please check your email to confirm your address, then log in.");
        setLocation("/auth/login");
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error && error.message
          ? error.message
          : typeof error === "string" && error
            ? error
            : "Failed to register. Please try again.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John"
                          autoComplete="given-name"
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
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Doe"
                          autoComplete="family-name"
                          className="min-h-[44px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="+1 (555) 000-0000"
                        type="tel"
                        autoComplete="tel"
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
                    <FormLabel>Password</FormLabel>
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
                Sign Up
              </Button>
            </form>
          </Form>

          <div className="text-center md:text-left text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login">
              <a className="font-semibold text-primary hover:underline">Sign in</a>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
