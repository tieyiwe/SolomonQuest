import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";
import { AgentWidget } from "@/components/agent/AgentWidget";
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
  FileText,
  FolderOpen,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  MessageSquare,
  X,
  Scroll,
  ClipboardList,
  CalendarDays,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BottomNav } from "@/components/layout/BottomNav";
import {
  useGetMySchool,
  useGetMyCourses,
  useListNotifications,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

interface StudentLayoutProps {
  children: React.ReactNode;
}

export function StudentLayout({ children }: StudentLayoutProps) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [coursesExpanded, setCoursesExpanded] = useState(true);

  const { data: school } = useGetMySchool({ query: { enabled: !!user?.schoolId } });
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const { data: notifications } = useListNotifications();

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "S";
  };

  const navLinks = [
    { href: "/dashboard/student", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, exact: false },
    { href: "/dashboard/student/assignments", label: "Assignments", icon: FileText, exact: false },
    { href: "/dashboard/student/quizzes", label: "Quizzes", icon: ClipboardList, exact: false },
    { href: "/dashboard/student/resources", label: "Resources", icon: FolderOpen, exact: false },
    { href: "/dashboard/student/forum", label: "Forum", icon: MessageSquare, exact: false },
    { href: "/dashboard/student/transcript", label: "Transcript", icon: Scroll, exact: false },
    { href: "/chat", label: "Chat", icon: MessageSquare, exact: false },
  ];

  // Only the 4 most-used destinations get their own bottom-nav tab — the
  // rest live behind "More", which opens the same drawer as the hamburger.
  const bottomNavPrimaryLinks = [navLinks[0], navLinks[1], navLinks[2], navLinks[6]];
  const bottomNavPrimaryHrefs = new Set(bottomNavPrimaryLinks.map((l) => l.href));
  const bottomNavOverflowLinks = navLinks.filter((l) => !bottomNavPrimaryHrefs.has(l.href));

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location === href;
    return location === href || location.startsWith(href + "/");
  };

  const isCourseActive = (courseId: string) =>
    location.startsWith(`/dashboard/student/courses/${courseId}`);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-sidebar-border flex items-center gap-2 h-16">
        <div className="h-7 w-7 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <GraduationCap className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <Link href="/">
          <span className="text-base font-bold text-sidebar-primary tracking-tight truncate">
            {school?.name || "SolomonQuest"}
          </span>
        </Link>
      </div>

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
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
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

        <div className="pt-3">
          <button
            onClick={() => setCoursesExpanded(!coursesExpanded)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
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
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                      asChild
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Link href={`/dashboard/student/courses/${course.id}`}>
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
                <div className="px-3 py-2 text-xs text-sidebar-foreground/50">
                  No courses enrolled
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3 px-2 py-2 rounded-lg">
          <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {getInitials(user?.firstName, user?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
            <span className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.firstName} {user?.lastName}
            </span>
            <Badge
              variant="outline"
              className="w-fit text-xs py-0 border-sidebar-border text-sidebar-foreground/60"
            >
              Student
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 h-9 text-sm"
          onClick={signOut}
        >
          <LogOut className="mr-2.5 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar h-screen sticky top-0 shrink-0">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <span className="font-semibold text-foreground hidden md:block">Student Dashboard</span>
            <span className="font-bold text-primary md:hidden">{school?.name || "SolomonQuest"}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full relative" asChild>
              <Link href="/dashboard/student">
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            </Button>
            <ProfileMenu />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-background has-bottom-nav md:pb-8">
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
      <AgentWidget />
      <NotesWidget />
      <StickyNotesLayer />
    </div>
  );
}
