import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { AgentWidget } from "@/components/agent/AgentWidget";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Star,
  HelpCircle,
  FolderOpen,
  MessageSquare,
  MessageCircle,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Users,
  Video,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

// ─── apiFetch helper ──────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherStats {
  totalCourses?: number;
  totalStudents?: number;
  pendingGrading?: number;
  upcomingClasses?: number;
}

interface Course {
  id: string;
  title: string;
  code?: string;
  term?: string;
  isPublished?: boolean;
  is_published?: boolean;
  is_live?: boolean;
  studentCount?: number;
  student_count?: number;
  next_class_date?: string;
  nextClassDate?: string;
}

interface Submission {
  id: string;
  student_name?: string;
  studentName?: string;
  assignment_title?: string;
  assignmentTitle?: string;
  submitted_at?: string;
  submittedAt?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "T";
}

function formatDate(raw?: string | null) {
  if (!raw) return null;
  try {
    return format(new Date(raw), "MMM d, yyyy h:mm a");
  } catch {
    return raw;
  }
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "/dashboard/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/teacher", label: "My Courses", icon: BookOpen, exact: true },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: Star },
  { href: "/dashboard/teacher/quizzes", label: "Quizzes", icon: HelpCircle },
  { href: "/dashboard/teacher/resources", label: "Resources", icon: FolderOpen },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
        <Link href="/dashboard/teacher">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              S
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">SolomonQuest</p>
              <p className="text-slate-400 text-xs">Teacher Portal</p>
            </div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white md:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon, exact }, idx) => {
          const active = exact ? location === href : location.startsWith(href);
          // Deduplicate My Courses / Dashboard — show Dashboard as first active match only
          return (
            <Link key={`${href}-${idx}`} href={href}>
              <button
                onClick={onClose}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {active && <ChevronRight className="h-3 w-3 opacity-70" />}
              </button>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
          <Avatar className="h-8 w-8 border border-white/20 shrink-0">
            <AvatarImage src={(user as any)?.avatarUrl || (user as any)?.avatar_url || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials((user as any)?.firstName, (user as any)?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-white text-sm font-medium truncate">
              {(user as any)?.firstName} {(user as any)?.lastName}
            </p>
            <p className="text-slate-400 text-xs capitalize truncate">Teacher</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-400/10"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  loading,
}: {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  bg: string;
  loading: boolean;
}) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-3xl font-bold text-foreground">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TeacherOverview() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);

  const [startingSession, setStartingSession] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TeacherStats>("/api/dashboard/teacher")
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    apiFetch<Course[]>("/api/courses/my")
      .then(setCourses)
      .catch(() => {})
      .finally(() => setCoursesLoading(false));

    apiFetch<Submission[]>("/api/submissions/pending")
      .then((data) => setSubmissions(data.slice(0, 5)))
      .catch(() => {})
      .finally(() => setSubmissionsLoading(false));
  }, []);

  const firstName = (user as any)?.firstName || (user as any)?.first_name || "Teacher";

  async function startLiveClass(courseId: string) {
    setStartingSession(courseId);
    try {
      const data = await apiFetch<{ jitsi_room?: string; room?: string }>("/api/video/sessions", {
        method: "POST",
        body: JSON.stringify({ course_id: courseId }),
      });
      const room = data.jitsi_room || data.room;
      if (room) {
        window.open(`https://meet.jit.si/${room}`, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No room URL returned from server.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start live class.");
    } finally {
      setStartingSession(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col h-screen sticky top-0">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-64 flex flex-col h-full shadow-xl">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b flex items-center px-4 gap-3 sticky top-0 z-20 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900 hidden md:block">
              Teacher Dashboard
            </h1>
            <h1 className="text-base font-semibold text-gray-900 md:hidden">SolomonQuest</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-100 px-3 py-1.5 rounded-full">
            <Calendar className="h-3.5 w-3.5" />
            {format(new Date(), "MMM d, yyyy")}
          </div>
          <NotificationBell />
          <ProfileMenu />
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-8">

            {/* Welcome */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                Welcome, {firstName}!
              </h2>
              <p className="text-muted-foreground mt-0.5">
                Here&apos;s what&apos;s happening in your classes today.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="My Courses"
                value={stats?.totalCourses}
                icon={BookOpen}
                color="text-primary"
                bg="bg-primary/10"
                loading={statsLoading}
              />
              <StatCard
                title="Total Students"
                value={stats?.totalStudents}
                icon={Users}
                color="text-blue-600"
                bg="bg-blue-100"
                loading={statsLoading}
              />
              <StatCard
                title="Pending Grading"
                value={stats?.pendingGrading}
                icon={ClipboardList}
                color="text-amber-600"
                bg="bg-amber-100"
                loading={statsLoading}
              />
              <StatCard
                title="Upcoming Classes"
                value={stats?.upcomingClasses}
                icon={Calendar}
                color="text-green-600"
                bg="bg-green-100"
                loading={statsLoading}
              />
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Left: Course cards */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">My Courses</h3>
                  <Link href="/dashboard/teacher/assignments">
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                      View Assignments <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                {coursesLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                  </div>
                ) : courses.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {courses.map((course) => {
                      const isLive = course.is_live;
                      const studentCount = course.studentCount ?? course.student_count ?? 0;
                      const nextClass = course.nextClassDate || course.next_class_date;
                      const isStarting = startingSession === course.id;

                      return (
                        <Card
                          key={course.id}
                          className="hover:border-primary/50 transition-all hover:shadow-sm flex flex-col"
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <BookOpen className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex gap-1.5">
                                {isLive && (
                                  <Badge className="bg-red-500 hover:bg-red-600 text-xs gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                    Live
                                  </Badge>
                                )}
                                <Badge
                                  variant={
                                    course.isPublished || course.is_published ? "default" : "secondary"
                                  }
                                  className="text-xs"
                                >
                                  {course.isPublished || course.is_published ? "Published" : "Draft"}
                                </Badge>
                              </div>
                            </div>
                            <CardTitle className="text-sm font-semibold line-clamp-2 mt-2">
                              {course.title}
                            </CardTitle>
                            {course.code && (
                              <CardDescription className="text-xs">{course.code}</CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="pt-0 mt-auto space-y-3">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {studentCount} student{studentCount !== 1 ? "s" : ""} enrolled
                            </div>
                            {nextClass && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                Next class: {formatDate(nextClass)}
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-2 border-t">
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                                onClick={() => startLiveClass(course.id)}
                                disabled={isStarting}
                              >
                                {isStarting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Video className="h-3 w-3" />
                                )}
                                Start Live Class
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-primary hover:bg-primary/10 gap-1"
                                asChild
                              >
                                <Link href={`/dashboard/teacher/courses/${course.id}`}>
                                  Manage <ArrowRight className="h-3 w-3" />
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="bg-muted/30 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                      <BookOpen className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
                      <h3 className="text-base font-medium mb-1">No courses assigned</h3>
                      <p className="text-sm text-muted-foreground">
                        You don&apos;t have any courses assigned yet.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: Recent submissions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Recent Submissions</h3>
                  <Link href="/dashboard/teacher/gradebook">
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                      Gradebook <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>

                <Card>
                  <CardContent className="p-0">
                    {submissionsLoading ? (
                      <div className="p-4 space-y-3">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                      </div>
                    ) : submissions.length > 0 ? (
                      <div className="divide-y">
                        {submissions.map((sub) => {
                          const studentName = sub.studentName || sub.student_name || "Unknown student";
                          const assignmentTitle = sub.assignmentTitle || sub.assignment_title || "Assignment";
                          const submittedAt = sub.submittedAt || sub.submitted_at;
                          return (
                            <div key={sub.id} className="p-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                              <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{studentName}</p>
                                <p className="text-xs text-muted-foreground truncate">{assignmentTitle}</p>
                                {submittedAt && (
                                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                                    {formatDate(submittedAt)}
                                  </p>
                                )}
                              </div>
                              <Link href="/dashboard/teacher/gradebook">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs shrink-0"
                                >
                                  Grade
                                </Button>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                        <p className="text-sm text-muted-foreground">All caught up! No pending submissions.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

          </div>
        </main>
      </div>

      <AgentWidget />
      <NotesWidget />
      <StickyNotesLayer />
    </div>
  );
}
