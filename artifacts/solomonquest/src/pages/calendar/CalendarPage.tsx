import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardList, Video, Bell, CalendarDays } from "lucide-react";

interface CalendarEvent {
  id: string;
  type: "assignment_due" | "video_session" | "reminder";
  title: string;
  date: string;
  courseId: string | null;
  courseTitle: string | null;
  link: string | null;
}

const EVENT_META: Record<CalendarEvent["type"], { label: string; icon: typeof ClipboardList; color: string }> = {
  assignment_due: { label: "Assignment due", icon: ClipboardList, color: "bg-orange-100 text-orange-700 border-orange-200" },
  video_session: { label: "Live session", icon: Video, color: "bg-blue-100 text-blue-700 border-blue-200" },
  reminder: { label: "Reminder", icon: Bell, color: "bg-violet-100 text-violet-700 border-violet-200" },
};

function groupByDay(events: CalendarEvent[]): { day: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const day = new Date(e.date).toDateString();
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  return Array.from(groups.entries()).map(([day, events]) => ({ day, events }));
}

function CalendarContent() {
  const { user } = useAuth();
  const [rangeDays] = useState({ back: 14, forward: 60 });

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar", user?.id, rangeDays.back, rangeDays.forward],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const start = new Date(Date.now() - rangeDays.back * 86400000).toISOString();
      const end = new Date(Date.now() + rangeDays.forward * 86400000).toISOString();
      const res = await fetch(`/api/calendar?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load calendar");
      return res.json();
    },
    enabled: !!user,
  });

  const grouped = useMemo(() => groupByDay(events ?? []), [events]);
  const now = Date.now();

  const dashboardPath =
    user?.role === "admin" || user?.role === "super_admin"
      ? "/dashboard/admin"
      : user?.role === "teacher"
        ? "/dashboard/teacher"
        : "/dashboard/student";

  return (
    <div className="px-6 pt-4 pb-8 space-y-6">
      <div>
        <Link href={dashboardPath}>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Calendar</h1>
          <p className="text-muted-foreground mt-0.5">
            Assignment due dates, live sessions, and reminders in one place.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nothing coming up in the next {rangeDays.forward} days.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ day, events }) => {
            const dayDate = new Date(day);
            const isPast = dayDate.getTime() < new Date(new Date().toDateString()).getTime();
            const isToday = dayDate.toDateString() === new Date().toDateString();
            return (
              <div key={day}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isPast ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                  {isToday
                    ? "Today"
                    : dayDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <div className="space-y-2">
                  {events.map((event) => {
                    const meta = EVENT_META[event.type];
                    const Icon = meta.icon;
                    const past = new Date(event.date).getTime() < now;
                    const body = (
                      <Card
                        className={`border-0 shadow-sm transition-colors ${event.link ? "hover:bg-gray-50/70 cursor-pointer" : ""} ${past ? "opacity-60" : ""}`}
                      >
                        <CardContent className="py-3 px-4 flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {event.courseTitle ? `${event.courseTitle} · ` : ""}
                              {new Date(event.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs shrink-0 ${meta.color}`}>
                            {meta.label}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                    return event.link ? (
                      <Link key={event.id} href={event.link}>
                        <a>{body}</a>
                      </Link>
                    ) : (
                      <div key={event.id}>{body}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();

  if (user?.role === "admin" || user?.role === "super_admin") {
    return (
      <AdminLayout>
        <CalendarContent />
      </AdminLayout>
    );
  }
  if (user?.role === "teacher") {
    return (
      <TeacherLayout>
        <CalendarContent />
      </TeacherLayout>
    );
  }
  return (
    <StudentLayout>
      <CalendarContent />
    </StudentLayout>
  );
}
