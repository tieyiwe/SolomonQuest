import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter, HelpButton } from "@/components/help/HelpCenter";
import { BottomNav } from "@/components/layout/BottomNav";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { AgentWidget } from "@/components/agent/AgentWidget";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell,
  Menu,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  FileText,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  FolderOpen,
  X,
  BarChart2,
  CalendarCheck,
  CalendarDays,
  AlarmClock,
  MessageSquare,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetMySchool, useGetMyCourses } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface TeacherLayoutProps {
  children: React.ReactNode;
}

export function TeacherLayout({ children }: TeacherLayoutProps) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [coursesExpanded, setCoursesExpanded] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const { showTour, launchTour, closeTour } = useTour("teacher");

  const { data: school } = useGetMySchool({ query: { enabled: !!user?.schoolId } });
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "T";
  };

  const navLinks = [
    { href: "/dashboard/teacher", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, exact: false },
    { href: "/dashboard/teacher/assignments", label: "Assignments", icon: FileText, exact: false },
    { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: ClipboardList, exact: false },
    { href: "/dashboard/teacher/attendance", label: "Attendance", icon: CalendarCheck, exact: false },
    { href: "/dashboard/teacher/resources", label: "Resources", icon: FolderOpen, exact: false },
    { href: "/dashboard/teacher/analytics", label: "Analytics", icon: BarChart2, exact: false },
    { href: "/dashboard/teacher/reminders", label: "Reminders", icon: AlarmClock, exact: false },
    { href: "/chat", label: "Chat", icon: MessageSquare, exact: false },
  ];

  // Only the 4 most-used destinations get their own bottom-nav tab — the
  // rest live behind "More", which opens the same drawer as the hamburger.
  const bottomNavPrimaryLinks = [navLinks[0], navLinks[1], navLinks[2], navLinks[7]];
  const bottomNavPrimaryHrefs = new Set(bottomNavPrimaryLinks.map((l) => l.href));
  const bottomNavOverflowLinks = navLinks.filter((l) => !bottomNavPrimaryHrefs.has(l.href));

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location === href;
    return location === href || location.startsWith(href + "/");
  };

  const isCourseActive = (courseId: string) =>
    location.startsWith(`/dashboard/teacher/courses/${courseId}`);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-white/10 flex items-center gap-2 h-16">
        <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <GraduationCap className="h-4 w-4 text-white" />
        </div>
        <Link href="/">
          <span className="text-base font-bold text-white tracking-tight truncate">
            {school?.name || "SolomonQuest"}
          </span>
        </Link>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, link.exact);
          return (
            <Button
              key={link.href}
              variant="ghost"
              className={cn(
                "w-full justify-start h-9 px-3 text-sm font-medium",
                active
                  ? "bg-white/15 text-white font-semibold border-l-2 border-white rounded-l-none"
                  : "text-slate-300 hover:text-white hover:bg-white/8"
              )}
              asChild
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Link href={link.href}>
                <Icon className="mr-2.5 h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            </Button>
          );
        })}

        {/* My Courses Section */}
        <div className="pt-3">
          <button
            onClick={() => setCoursesExpanded(!coursesExpanded)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
          >
            <span>My Courses</span>
            {coursesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>

          {coursesExpanded && (
            <div className="mt-1 space-y-0.5">
              {isCoursesLoading ? (
                <div className="px-3 space-y-2 py-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-7 w-full rounded" />
                  ))}
                </div>
              ) : courses && courses.length > 0 ? (
                courses.map((course) => {
                  const active = isCourseActive(course.id);
                  return (
                    <Button
                      key={course.id}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start h-auto px-3 py-2 text-sm",
                        active
                          ? "bg-white/15 text-white font-semibold border-l-2 border-white rounded-l-none"
                          : "text-slate-400 hover:text-white hover:bg-white/8"
                      )}
                      asChild
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Link href={`/dashboard/teacher/courses/${course.id}`}>
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
                            <BookOpen className="h-3 w-3 text-primary" />
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="text-xs font-medium truncate">{course.title}</div>
                            {course.code && (
                              <div className="text-xs text-sidebar-foreground/50 truncate">
                                {course.code}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    </Button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-xs text-white/40">
                  No courses assigned
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3 px-2 py-2 rounded-lg">
          <Avatar className="h-8 w-8 border border-white/20 shrink-0">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-white/20 text-white text-xs">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
            <span className="text-sm font-medium text-white truncate">
              {user?.firstName} {user?.lastName}
            </span>
            <Badge variant="outline" className="w-fit text-xs py-0 border-white/30 text-white/60">
              Teacher
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-white/60 hover:text-red-400 hover:bg-red-500/10 h-9 text-sm"
          onClick={signOut}
        >
          <LogOut className="mr-2.5 h-4 w-4" />
          Sign Out
        </Button>
        <p className="text-center text-[10px] text-muted-foreground/50 tracking-widest uppercase mt-2">Powered by TIBLOGICS</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-slate-900 h-screen sticky top-0 shrink-0">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-slate-900 border-slate-700">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            <span className="font-semibold text-foreground hidden md:block">
              Teacher Dashboard
            </span>
            <span className="font-bold text-primary md:hidden">
              {school?.name || "SolomonQuest"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </Button>
            <ProfileMenu />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-background has-bottom-nav md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav
        links={bottomNavPrimaryLinks}
        moreCount={bottomNavOverflowLinks.length}
        onMoreClick={() => setIsMobileMenuOpen(true)}
        moreActive={bottomNavOverflowLinks.some((l) => isActive(l.href, l.exact))}
      />

      <HelpButton onClick={() => setHelpOpen(true)} />
      <AgentWidget />
      <NotesWidget />
      <StickyNotesLayer />
      {helpOpen && (
        <HelpCenter role="teacher" onClose={() => setHelpOpen(false)} onStartTour={launchTour} />
      )}
      {showTour && <TourOverlay role="teacher" onClose={closeTour} />}
    </div>
  );
}
