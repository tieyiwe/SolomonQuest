import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Copy, BookOpen, ClipboardList } from "lucide-react";
import { Link } from "wouter";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface Profile {
  id: string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  internalEmail?: string;
  uniqueStudentId?: string;
  avatarUrl?: string;
  avatar_url?: string;
  role?: string;
}

interface Course {
  id: string;
  title: string;
  status?: string;
}

interface Application {
  id: string;
  school_id?: string;
  status?: string;
  created_at?: string;
}

export default function StudentProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiFetch<Profile>(`/api/users/${user.id}`),
      apiFetch<Course[]>("/api/courses"),
      apiFetch<Application[]>("/api/applications/my").catch(() => []),
    ]).then(([prof, courseList, apps]) => {
      setProfile(prof);
      setCourses(courseList ?? []);
      setApplications(apps ?? []);
    }).catch((e) => {
      toast.error(e.message ?? "Failed to load profile");
    }).finally(() => setLoading(false));
  }, [user]);

  function copyUniqueId() {
    const uid = profile?.uniqueStudentId ?? profile?.id ?? "";
    navigator.clipboard.writeText(uid).then(() => toast.success("Unique ID copied!"));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Profile not found.</p>
      </div>
    );
  }

  const firstName = profile.firstName ?? profile.first_name ?? "";
  const lastName = profile.lastName ?? profile.last_name ?? "";
  const avatarUrl = profile.avatarUrl ?? profile.avatar_url ?? "";
  const uniqueId = profile.uniqueStudentId ?? "";
  const internalEmail = profile.internalEmail ?? "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
    student: "default",
    staff: "secondary",
    teacher: "outline",
    admin: "outline",
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Profile Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                <h1 className="text-2xl font-bold">{firstName} {lastName}</h1>

                {profile.role && (
                  <Badge variant={roleBadgeVariant[profile.role] ?? "secondary"} className="capitalize">
                    {profile.role}
                  </Badge>
                )}

                {internalEmail && (
                  <p className="text-sm text-muted-foreground">{internalEmail}</p>
                )}

                {profile.email && profile.email !== internalEmail && (
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                )}
              </div>
            </div>

            {/* Unique ID */}
            {uniqueId && (
              <div className="mt-6 flex items-center gap-3 bg-muted rounded-lg p-4">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Unique Student ID</p>
                  <p className="text-lg font-mono font-bold tracking-wider">{uniqueId}</p>
                </div>
                <Button variant="outline" size="sm" onClick={copyUniqueId} className="shrink-0">
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enrolled Courses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              Enrolled Courses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No courses enrolled yet.</p>
            ) : (
              <div className="space-y-2">
                {courses.map((c) => (
                  <Link key={c.id} href={`/dashboard/student/courses/${c.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors cursor-pointer">
                      <span className="font-medium text-sm">{c.title}</span>
                      {c.status && (
                        <Badge variant="outline" className="text-xs capitalize">{c.status}</Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Applications */}
        {applications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Application Statuses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {applications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm text-muted-foreground">
                      {app.created_at ? new Date(app.created_at).toLocaleDateString() : "Application"}
                    </span>
                    <Badge
                      variant={
                        app.status === "accepted" ? "default" :
                        app.status === "rejected" ? "destructive" :
                        "secondary"
                      }
                      className="capitalize"
                    >
                      {app.status ?? "pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
