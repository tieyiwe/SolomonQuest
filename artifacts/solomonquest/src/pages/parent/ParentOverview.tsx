import { useEffect, useState } from "react";
import { ParentLayout } from "@/components/layout/ParentLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GraduationCap, CalendarCheck, Receipt } from "lucide-react";

interface Child {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  uniqueStudentId: string | null;
  schoolId: string | null;
}

interface ChildOverview {
  recentGrades: {
    submissionId: string;
    grade: number | null;
    pointsPossible: number | null;
    assignmentTitle: string;
    courseTitle: string | null;
  }[];
  attendanceSummary: { present: number; absent: number; late: number; total: number };
  tuition: {
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
  }[];
}

async function authedFetch(path: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export default function ParentOverview() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [overviews, setOverviews] = useState<Record<string, ChildOverview>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const kids: Child[] = await authedFetch("/parents/my-children");
        if (cancelled) return;
        setChildren(kids);
        const results = await Promise.all(
          kids.map((c) => authedFetch(`/parents/children/${c.id}/overview`).catch(() => null))
        );
        if (cancelled) return;
        const map: Record<string, ChildOverview> = {};
        kids.forEach((c, i) => {
          if (results[i]) map[c.id] = results[i];
        });
        setOverviews(map);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getInitials = (first?: string | null, last?: string | null) =>
    `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "S";

  return (
    <ParentLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Children</h1>
          <p className="text-muted-foreground">Grades, attendance, and tuition at a glance.</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : !children || children.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No linked students yet. Contact your school's admin office to link your account.
            </CardContent>
          </Card>
        ) : (
          children.map((child) => {
            const overview = overviews[child.id];
            return (
              <Card key={child.id}>
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage src={child.avatarUrl || ""} />
                    <AvatarFallback>{getInitials(child.firstName, child.lastName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">
                      {child.firstName} {child.lastName}
                    </CardTitle>
                    {child.uniqueStudentId && (
                      <p className="text-xs text-muted-foreground">ID: {child.uniqueStudentId}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                      <GraduationCap className="h-4 w-4" /> Recent Grades
                    </div>
                    {overview && overview.recentGrades.length > 0 ? (
                      <ul className="space-y-1.5">
                        {overview.recentGrades.slice(0, 5).map((g) => (
                          <li key={g.submissionId} className="text-sm">
                            <span className="text-muted-foreground">{g.assignmentTitle}</span>
                            {": "}
                            <span className="font-medium">
                              {g.grade ?? "—"}
                              {g.pointsPossible ? ` / ${g.pointsPossible}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No graded work yet.</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                      <CalendarCheck className="h-4 w-4" /> Attendance (30d)
                    </div>
                    {overview ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">Present: {overview.attendanceSummary.present}</Badge>
                        <Badge variant="outline">Absent: {overview.attendanceSummary.absent}</Badge>
                        <Badge variant="outline">Late: {overview.attendanceSummary.late}</Badge>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No data.</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                      <Receipt className="h-4 w-4" /> Tuition
                    </div>
                    {overview && overview.tuition.length > 0 ? (
                      <ul className="space-y-1.5">
                        {overview.tuition.slice(0, 3).map((t) => (
                          <li key={t.id} className="text-sm flex items-center justify-between gap-2">
                            <span>
                              {(t.amountCents / 100).toLocaleString(undefined, {
                                style: "currency",
                                currency: t.currency || "USD",
                              })}
                            </span>
                            <Badge variant={t.status === "paid" ? "default" : "outline"}>{t.status}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No tuition records.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </ParentLayout>
  );
}
