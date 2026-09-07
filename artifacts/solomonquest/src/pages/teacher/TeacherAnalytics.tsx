import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Star,
  HelpCircle,
  FolderOpen,
  MessageSquare,
  MessageCircle,
  BarChart2,
  ArrowLeft,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Users,
  Video,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

// ─── apiFetch ─────────────────────────────────────────────────────────────────

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

interface CourseStats {
  course_id: string;
  name: string;
  enrolled_count: number;
  avg_grade: number | null;
  assignment_completion_rate: number | null;
  attendance_rate: number | null;
  quiz_avg_score: number | null;
}

interface GradeDistribution { A: number; B: number; C: number; D: number; F: number }

interface RecentSubmission {
  student_name: string;
  assignment_title: string;
  submitted_at: string;
  grade: number | null;
}

interface TeacherAnalyticsData {
  courses: CourseStats[];
  grade_distribution: GradeDistribution;
  recent_submissions: RecentSubmission[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "U";
}

function formatDate(raw?: string | null) {
  if (!raw) return "—";
  try { return format(new Date(raw), "MMM d, h:mm a"); } catch { return raw ?? "—"; }
}

function gradeColor(g: number | null) {
  if (g === null) return "text-gray-400";
  if (g >= 90) return "text-emerald-600 font-semibold";
  if (g >= 70) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

function gradeBadge(g: number | null) {
  if (g === null) return <span className="text-gray-300">—</span>;
  const cls =
    g >= 90 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    g >= 80 ? "bg-blue-100 text-blue-700 border-blue-200" :
    g >= 70 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
    "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {g}%
    </span>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "/dashboard/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/teacher/courses", label: "My Courses", icon: BookOpen },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: Star },
  { href: "/dashboard/teacher/quizzes", label: "Quizzes", icon: HelpCircle },
  { href: "/dashboard/teacher/resources", label: "Resources", icon: FolderOpen },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/dashboard/teacher/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/video", label: "Live Class", icon: Video },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-slate-900">
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

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? location === href : location.startsWith(href);
          return (
            <Link key={href} href={href}>
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

// ─── Metric Pill ─────────────────────────────────────────────────────────────

function Metric({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${value === null ? "text-gray-300" : "text-gray-900"}`}>
        {value === null ? "—" : `${value}${suffix}`}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ─── Grade Bar ────────────────────────────────────────────────────────────────

function GradeBar({ letter, count, total, color }: { letter: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={`w-6 text-sm font-bold ${color}`}>{letter}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color.replace("text-", "bg-")}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-sm text-muted-foreground">{count}</span>
      <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TeacherAnalytics() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [analytics, setAnalytics] = useState<TeacherAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<TeacherAnalyticsData>("/api/analytics/teacher")
      .then(setAnalytics)
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  const dist = analytics?.grade_distribution;
  const totalGrades = dist ? dist.A + dist.B + dist.C + dist.D + dist.F : 0;

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
            <h1 className="text-base font-semibold text-gray-900">Analytics</h1>
          </div>
          <Avatar className="h-8 w-8 border">
            <AvatarImage src={(user as any)?.avatarUrl || (user as any)?.avatar_url || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials((user as any)?.firstName, (user as any)?.lastName)}
            </AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="px-6 pt-4 pb-0">
            <Link href="/dashboard/teacher">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </Link>
          </div>
          <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-8">

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Your Analytics</h2>
              <p className="text-muted-foreground mt-0.5">Performance insights across all your courses.</p>
            </div>

            {/* Course Performance Cards */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Course Performance
              </h3>
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 rounded-xl" />
                  ))}
                </div>
              ) : (analytics?.courses ?? []).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(analytics?.courses ?? []).map((c) => (
                    <Card key={c.course_id} className="shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm font-semibold text-gray-900 leading-tight">{c.name}</CardTitle>
                            <CardDescription className="mt-0.5 flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {c.enrolled_count} enrolled
                            </CardDescription>
                          </div>
                          <div className="shrink-0">
                            {gradeBadge(c.avg_grade)}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-3 divide-x divide-gray-100">
                          <Metric label="Assignment Completion" value={c.assignment_completion_rate} suffix="%" />
                          <Metric label="Attendance Rate" value={c.attendance_rate} suffix="%" />
                          <Metric label="Quiz Avg" value={c.quiz_avg_score} suffix="%" />
                        </div>
                        {/* Mini grade bar */}
                        {c.avg_grade !== null && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Avg Grade</span>
                              <span className={gradeColor(c.avg_grade)}>{c.avg_grade}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  c.avg_grade >= 90 ? "bg-emerald-500" :
                                  c.avg_grade >= 70 ? "bg-yellow-400" : "bg-red-400"
                                }`}
                                style={{ width: `${c.avg_grade}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="shadow-sm">
                  <CardContent className="py-12 text-center">
                    <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No courses found. Create your first course to see analytics.</p>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Grade Distribution + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Grade Distribution */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Grade Distribution</CardTitle>
                  <CardDescription>
                    {totalGrades > 0
                      ? `${totalGrades} graded submissions across all courses`
                      : "Grade breakdown once submissions are graded"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  ) : totalGrades > 0 ? (
                    <>
                      <GradeBar letter="A" count={dist?.A ?? 0} total={totalGrades} color="text-emerald-600" />
                      <GradeBar letter="B" count={dist?.B ?? 0} total={totalGrades} color="text-blue-600" />
                      <GradeBar letter="C" count={dist?.C ?? 0} total={totalGrades} color="text-yellow-600" />
                      <GradeBar letter="D" count={dist?.D ?? 0} total={totalGrades} color="text-orange-600" />
                      <GradeBar letter="F" count={dist?.F ?? 0} total={totalGrades} color="text-red-600" />
                      <div className="pt-2 border-t text-xs text-muted-foreground">
                        Pass rate (≥70%): <span className="font-semibold text-gray-900">
                          {totalGrades > 0
                            ? Math.round((((dist?.A ?? 0) + (dist?.B ?? 0) + (dist?.C ?? 0)) / totalGrades) * 100)
                            : 0}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <Star className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No graded submissions yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity Feed */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Recent Submissions</CardTitle>
                  <CardDescription>Latest student assignment submissions</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : (analytics?.recent_submissions ?? []).length > 0 ? (
                    <ul className="divide-y">
                      {(analytics?.recent_submissions ?? []).map((s, i) => (
                        <li key={i} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <div className="mt-0.5 h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                {s.grade !== null ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{s.student_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{s.assignment_title}</p>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              {gradeBadge(s.grade)}
                              <p className="text-[10px] text-muted-foreground mt-1">{formatDate(s.submitted_at)}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="py-12 text-center">
                      <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No recent submissions.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
