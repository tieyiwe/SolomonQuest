import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, BookOpen, Users, CalendarDays } from "lucide-react";

interface TeacherDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  uniqueStudentId: string | null;
  joinedSince: string | null;
  email: string | null;
  phone: string | null;
  courses: { id: string; title: string; code: string | null }[];
  totalStudents: number;
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "T";
}

export function TeacherDetailDialog({
  teacherId,
  open,
  onOpenChange,
}: {
  teacherId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [detail, setDetail] = useState<TeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !teacherId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetail(null);
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch(`/api/users/${teacherId}/teacher-detail`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) setError(data.error);
          else setDetail(data);
        })
        .catch(() => { if (!cancelled) setError("Failed to load teacher details"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [open, teacherId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Teacher Details</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500 py-6 text-center">{error}</p>
        )}

        {!loading && !error && detail && (
          <div className="space-y-5 py-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border">
                <AvatarImage src={detail.avatarUrl || ""} />
                <AvatarFallback className="text-base bg-primary/10 text-primary font-semibold">
                  {getInitials(detail.firstName, detail.lastName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-gray-900">
                  {detail.firstName} {detail.lastName}
                </p>
                {detail.uniqueStudentId && (
                  <p className="text-xs text-muted-foreground font-mono">{detail.uniqueStudentId}</p>
                )}
              </div>
            </div>

            {detail.bio && <p className="text-sm text-muted-foreground">{detail.bio}</p>}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Joined{" "}
              {detail.joinedSince
                ? new Date(detail.joinedSince).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : "—"}
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Info</p>
              {detail.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {detail.email}
                </div>
              )}
              {detail.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {detail.phone}
                </div>
              )}
              {!detail.email && !detail.phone && (
                <p className="text-sm text-muted-foreground">No contact info on file.</p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Courses Taught</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {detail.totalStudents} student{detail.totalStudents === 1 ? "" : "s"} total
                </div>
              </div>
              {detail.courses.length > 0 ? (
                <ul className="space-y-1">
                  {detail.courses.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {c.title} {c.code && <span className="text-xs text-muted-foreground">({c.code})</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Not teaching any courses yet.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
