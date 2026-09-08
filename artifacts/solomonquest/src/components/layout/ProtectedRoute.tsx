import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { user, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth/login");
    } else if (!isLoading && user && allowedRoles && !allowedRoles.includes(user.role || "")) {
      // If user is logged in but doesn't have the right role, redirect to their dashboard
      if (user.role === "admin" || user.role === "super_admin") {
        setLocation("/dashboard/admin");
      } else if (user.role === "teacher") {
        setLocation("/dashboard/teacher");
      } else if (user.role === "student" || user.role === "staff") {
        setLocation("/dashboard/student");
      } else if (user.role === "parent") {
        setLocation("/dashboard/parent");
      } else {
        setLocation("/");
      }
    }
  }, [user, isLoading, allowedRoles, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (allowedRoles && !allowedRoles.includes(user.role || ""))) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}
