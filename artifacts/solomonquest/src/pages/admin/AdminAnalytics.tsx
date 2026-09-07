import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  FolderOpen,
  MessageSquare,
  MessageCircle,
  ArrowLeft,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  GraduationCap,
  ClipboardList,
  TrendingUp,
  Activity,
  Download,
  Trophy,
  MessagesSquare,
  Reply,
  ClipboardCheck,
  Upload,
  LogIn,
  ArrowUpDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface EnrollmentPoint { month: string; count: number }
interface ApplicationFunnel { submitted: number; under_review: number; approved: number; rejected: number }
interface TopCourse { course_id: string; name: string; enrolled_count: number; avg_grade: number | null }
interface StudentActivity { active_this_week: number; avg_assignments_submitted: number }
interface TeacherPerformance { teacher_id: string; name: string; courses: number; avg_student_grade: number | null }
interface AdminAnalyticsData {
  enrollments_over_time: EnrollmentPoint[];
  application_funnel: ApplicationFunnel;
  top_courses: TopCourse[];
  student_activity: StudentActivity;
  teacher_performance: TeacherPerformance[];
}
interface TeacherActivity {
  teacherId: string;
  name: string;
  avatarUrl: string | null;
  lastOnlineAt: string | null;
  lastLoginAt: string | null;
  forumPosts: number;
  forumReplies: number;
  quizzesCreated: number;
  resourcesUploaded: number;
  chatMessages: number;
  loginCount: number;
  activityScore: number;
  rank: number;
}
interface DashboardStats {
  totalStudents?: number;
  totalTeachers?: number;
  totalCourses?: number;
  pendingApplications?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "U";
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: FileText },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/forum", label: "Forum", icon: MessageSquare },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
        <Link href="/dashboard/admin">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              S
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">SolomonQuest</p>
              <p className="text-slate-400 text-xs">Admin Panel</p>
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
            <p className="text-slate-400 text-xs capitalize truncate">
              {(user as any)?.role?.replace("_", " ")}
            </p>
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
  loading,
}: {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  loading: boolean;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-9 w-20 mt-1" />
            ) : (
              <p className="text-3xl font-bold tracking-tight mt-1 text-gray-900">{value ?? 0}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${color} shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Bar Chart (CSS only) ─────────────────────────────────────────────────────

function EnrollmentsChart({ data, loading }: { data: EnrollmentPoint[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-end gap-2 h-40">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 rounded" style={{ height: `${Math.random() * 60 + 20}%` }} />
        ))}
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1.5 h-40">
        {data.map((d) => {
          const pct = Math.round((d.count / max) * 100);
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className="w-full bg-primary/80 hover:bg-primary rounded-t transition-all cursor-default"
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`${d.month}: ${d.count} enrollments`}
              />
              {/* Tooltip */}
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {data.map((d) => (
          <div key={d.month} className="flex-1 text-center text-[9px] text-muted-foreground">
            {d.month.slice(5)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Application Funnel ───────────────────────────────────────────────────────

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground capitalize">{label.replace("_", " ")}</span>
        <span className="font-semibold text-gray-900">{value}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground text-right">{pct}% of total</p>
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [analytics, setAnalytics] = useState<AdminAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardStats>("/api/dashboard/admin/stats")
      .then(setStats)
      .catch(() => toast.error("Failed to load stats"))
      .finally(() => setStatsLoading(false));

    apiFetch<AdminAnalyticsData>("/api/analytics/admin")
      .then(setAnalytics)
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setAnalyticsLoading(false));
  }, []);

  const funnel = analytics?.application_funnel;
  const funnelTotal = funnel
    ? funnel.submitted + funnel.under_review + funnel.approved + funnel.rejected
    : 0;

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                const rows = [
                  { metric: "Total Students", value: stats?.totalStudents ?? 0 },
                  { metric: "Total Teachers", value: stats?.totalTeachers ?? 0 },
                  { metric: "Active Courses", value: stats?.totalCourses ?? 0 },
                  { metric: "Pending Applications", value: stats?.pendingApplications ?? 0 },
                  { metric: "Applications Submitted", value: analytics?.application_funnel?.submitted ?? 0 },
                  { metric: "Applications Approved", value: analytics?.application_funnel?.approved ?? 0 },
                  { metric: "Applications Rejected", value: analytics?.application_funnel?.rejected ?? 0 },
                ];
                exportCSV(rows, "analytics-summary.csv");
              }}>
                Summary (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const rows = (analytics?.enrollments_over_time ?? []).map((d: any) => ({
                  month: d.month, enrollments: d.count
                }));
                exportCSV(rows, "enrollment-trend.csv");
              }}>
                Enrollment Trend (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                exportJSON({ stats, analytics }, "analytics-full.json");
              }}>
                Full Data (JSON)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Avatar className="h-8 w-8 border">
            <AvatarImage src={(user as any)?.avatarUrl || (user as any)?.avatar_url || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials((user as any)?.firstName, (user as any)?.lastName)}
            </AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="px-6 pt-4 pb-0">
            <Link href="/dashboard/admin">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
            </Link>
          </div>
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-8">

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">School Analytics</h2>
              <p className="text-muted-foreground mt-0.5">Overview of school performance and activity.</p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Students" value={stats?.totalStudents} icon={GraduationCap} color="bg-emerald-500" loading={statsLoading} />
              <StatCard title="Total Teachers" value={stats?.totalTeachers} icon={Users} color="bg-blue-500" loading={statsLoading} />
              <StatCard title="Active Courses" value={stats?.totalCourses} icon={BookOpen} color="bg-violet-500" loading={statsLoading} />
              <StatCard title="Applications" value={funnelTotal || stats?.pendingApplications} icon={ClipboardList} color="bg-orange-500" loading={statsLoading || analyticsLoading} />
            </div>

            {/* Enrollments Chart + Application Funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Enrollments Over Time
                  </CardTitle>
                  <CardDescription>Monthly active enrollments — last 12 months</CardDescription>
                </CardHeader>
                <CardContent>
                  <EnrollmentsChart
                    data={analytics?.enrollments_over_time ?? []}
                    loading={analyticsLoading}
                  />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Application Funnel
                  </CardTitle>
                  <CardDescription>Status breakdown of all applications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {analyticsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
                  ) : funnel ? (
                    <>
                      <FunnelBar label="Submitted" value={funnel.submitted} total={funnelTotal} color="bg-yellow-400" />
                      <FunnelBar label="Under Review" value={funnel.under_review} total={funnelTotal} color="bg-blue-400" />
                      <FunnelBar label="Approved" value={funnel.approved} total={funnelTotal} color="bg-emerald-500" />
                      <FunnelBar label="Rejected" value={funnel.rejected} total={funnelTotal} color="bg-red-400" />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No application data.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Courses Table */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Top Courses</CardTitle>
                <CardDescription>Most enrolled courses and their performance</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50/60">
                        {["Course", "Enrolled", "Avg Grade"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b">
                            {Array.from({ length: 3 }).map((_, j) => (
                              <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[140px]" /></td>
                            ))}
                          </tr>
                        ))
                      ) : (analytics?.top_courses ?? []).length > 0 ? (
                        (analytics?.top_courses ?? []).map((c, idx) => (
                          <tr key={c.course_id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}</span>
                                <span className="font-medium text-gray-900">{c.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{c.enrolled_count}</td>
                            <td className="px-4 py-3">
                              {c.avg_grade !== null ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  c.avg_grade >= 90 ? "bg-emerald-100 text-emerald-700" :
                                  c.avg_grade >= 70 ? "bg-yellow-100 text-yellow-700" :
                                  "bg-red-100 text-red-700"
                                }`}>
                                  {c.avg_grade}%
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground text-sm">
                            No course data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Student Activity + Teacher Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Student Activity */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Student Activity</CardTitle>
                  <CardDescription>Engagement metrics across the school</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analyticsLoading ? (
                    Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                  ) : analytics?.student_activity ? (
                    <>
                      <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div>
                          <p className="text-sm font-medium text-emerald-700">Active This Week</p>
                          <p className="text-2xl font-bold text-emerald-900 mt-0.5">
                            {analytics.student_activity.active_this_week}
                          </p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Activity className="h-5 w-5 text-white" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <div>
                          <p className="text-sm font-medium text-blue-700">Avg Assignments Submitted</p>
                          <p className="text-2xl font-bold text-blue-900 mt-0.5">
                            {analytics.student_activity.avg_assignments_submitted}
                          </p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                          <ClipboardList className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No activity data.</p>
                  )}
                </CardContent>
              </Card>

              {/* Teacher Performance */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Teacher Performance</CardTitle>
                  <CardDescription>Courses taught and average student grades</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50/60">
                          {["Teacher", "Courses", "Avg Student Grade"].map((h) => (
                            <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsLoading ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <tr key={i} className="border-b">
                              {Array.from({ length: 3 }).map((_, j) => (
                                <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                              ))}
                            </tr>
                          ))
                        ) : (analytics?.teacher_performance ?? []).length > 0 ? (
                          (analytics?.teacher_performance ?? []).map((t) => (
                            <tr key={t.teacher_id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{t.courses}</td>
                              <td className="px-4 py-3">
                                {t.avg_student_grade !== null ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    t.avg_student_grade >= 90 ? "bg-emerald-100 text-emerald-700" :
                                    t.avg_student_grade >= 70 ? "bg-yellow-100 text-yellow-700" :
                                    "bg-red-100 text-red-700"
                                  }`}>
                                    {t.avg_student_grade}%
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground text-sm">
                              No teacher data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Teacher Activity Ranking */}
            <TeacherActivityRanking />

            {/* Activity Log */}
            <ActivityLog />

          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Teacher Activity Ranking ──────────────────────────────────────────────────

type ActivitySortKey = "activityScore" | "forumPosts" | "forumReplies" | "quizzesCreated" | "resourcesUploaded" | "chatMessages" | "loginCount";

const ACTIVITY_COLUMNS: { key: ActivitySortKey; label: string; icon: React.ElementType }[] = [
  { key: "forumPosts", label: "Forum Posts", icon: MessagesSquare },
  { key: "forumReplies", label: "Forum Replies", icon: Reply },
  { key: "quizzesCreated", label: "Quizzes Created", icon: ClipboardCheck },
  { key: "resourcesUploaded", label: "Resources", icon: Upload },
  { key: "chatMessages", label: "Chat Messages", icon: MessageCircle },
  { key: "loginCount", label: "Logins", icon: LogIn },
];

function getInitialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "T";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function TeacherActivityRanking() {
  const [teachers, setTeachers] = useState<TeacherActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<ActivitySortKey>("activityScore");

  useEffect(() => {
    apiFetch<{ teachers: TeacherActivity[] }>("/api/analytics/admin/teacher-activity")
      .then((d) => setTeachers(d.teachers ?? []))
      .catch(() => toast.error("Failed to load teacher activity"))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...teachers].sort((a, b) => b[sortKey] - a[sortKey]);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Teacher Activity Ranking
            </CardTitle>
            <CardDescription>
              Who's actively using the platform — forum posts, replies, quizzes created, resources
              uploaded, chat messages, and logins.
            </CardDescription>
          </div>
          {!loading && teachers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const rows = sorted.map((t) => ({
                  rank: t.rank,
                  name: t.name,
                  activity_score: t.activityScore,
                  forum_posts: t.forumPosts,
                  forum_replies: t.forumReplies,
                  quizzes_created: t.quizzesCreated,
                  resources_uploaded: t.resourcesUploaded,
                  chat_messages: t.chatMessages,
                  logins: t.loginCount,
                  last_login: t.lastLoginAt ?? "",
                  last_active: t.lastOnlineAt ?? "",
                }));
                exportCSV(rows, "teacher-activity-ranking.csv");
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                  Rank
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                  Teacher
                </th>
                {ACTIVITY_COLUMNS.map(({ key, label, icon: Icon }) => (
                  <th
                    key={key}
                    className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => setSortKey(key)}
                    title={`Sort by ${label}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {label}
                      {sortKey === key && <ArrowUpDown className="h-3 w-3" />}
                    </span>
                  </th>
                ))}
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                  Last Active
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                  Last Login
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[90px]" /></td>
                    ))}
                  </tr>
                ))
              ) : sorted.length > 0 ? (
                sorted.map((t, idx) => (
                  <tr key={t.teacherId} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                          idx === 0 ? "bg-yellow-100 text-yellow-700" :
                          idx === 1 ? "bg-gray-200 text-gray-700" :
                          idx === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-gray-50 text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 border shrink-0">
                          <AvatarImage src={t.avatarUrl || ""} />
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                            {getInitialsFromName(t.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground">Score: {t.activityScore}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.forumPosts}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.forumReplies}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.quizzesCreated}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.resourcesUploaded}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.chatMessages}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.loginCount}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{timeAgo(t.lastOnlineAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{timeAgo(t.lastLoginAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    No teacher activity data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityLog() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/supabase").then(({ supabase }) =>
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (!session) { setLoading(false); return; }
        fetch("/api/activity-log?limit=50", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => r.json())
          .then((d) => { if (!cancelled) setEntries(d.entries ?? []); })
          .catch(() => {})
          .finally(() => { if (!cancelled) setLoading(false); });
      })
    );
    return () => { cancelled = true; };
  }, []);

  const ACTION_LABELS: Record<string, string> = {
    login: "Logged in",
    logout: "Logged out",
    assignment_submitted: "Submitted assignment",
    assignment_graded: "Graded assignment",
    course_enrolled: "Enrolled in course",
    topic_created: "Created forum topic",
    comment_posted: "Posted a comment",
    deletion_requested: "Requested school deletion",
    branding_updated: "Updated school branding",
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Activity Log
            </CardTitle>
            <CardDescription>Recent user actions across your school</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const rows = entries.map((e) => ({
                date: e.createdAt,
                user: e.performerName,
                role: e.performerRole,
                action: ACTION_LABELS[e.action] ?? e.action,
                target: e.targetName ?? e.targetId ?? "",
              }));
              const lines = ["date,user,role,action,target", ...rows.map((r) =>
                Object.values(r).map((v) => JSON.stringify(v ?? "")).join(",")
              )];
              const blob = new Blob([lines.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "activity-log.csv"; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No activity recorded yet.
          </div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                  {(e.performerName || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {e.performerName}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground capitalize">{e.performerRole}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ACTION_LABELS[e.action] ?? e.action}
                    {e.targetName && <span className="font-medium text-gray-700"> · {e.targetName}</span>}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
