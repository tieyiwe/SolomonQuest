import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, GraduationCap, BookOpen, CalendarCheck, CalendarDays } from "lucide-react";

interface StudentDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  uniqueStudentId: string | null;
  enrolledSince: string | null;
  email?: string | null;
  phone?: string | null;
  programs?: { id: string; name: string }[];
  courses?: { id: string; title: string; code: string | null }[];
  attendance?: {
    present: number;
    absent: number;
    late: number;
    total: number;
    attendanceRate: number | null;
  };
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "S";
}

export function StudentDetailDialog({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetail(null);
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch(`/api/users/${studentId}/detail`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) setError(data.error);
          else setDetail(data);
        })
        .catch(() => { if (!cancelled) setError("Failed to load student details"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student Details</DialogTitle>
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
              Enrolled since{" "}
              {detail.enrolledSince
                ? new Date(detail.enrolledSince).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : "—"}
            </div>

            {(detail.email !== undefined || detail.phone !== undefined) && (
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
            )}

            {detail.programs !== undefined && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Program & Courses</p>
                {detail.programs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.programs.map((p) => (
                      <Badge key={p.id} className="bg-indigo-100 text-indigo-700 border-indigo-200 border text-xs">
                        <GraduationCap className="h-3 w-3 mr-1" />
                        {p.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {(detail.courses ?? []).length > 0 ? (
                  <ul className="space-y-1">
                    {(detail.courses ?? []).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-sm">
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {c.title} {c.code && <span className="text-xs text-muted-foreground">({c.code})</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Not enrolled in any courses yet.</p>
                )}
              </div>
            )}

            {detail.attendance !== undefined && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attendance</p>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  {detail.attendance.total > 0 ? (
                    <span>
                      {detail.attendance.present} present · {detail.attendance.late} late · {detail.attendance.absent} absent
                      {detail.attendance.attendanceRate !== null && (
                        <span className="text-muted-foreground"> ({detail.attendance.attendanceRate}%)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No attendance recorded yet.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
