import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useGetMySchool } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Settings,
  CheckSquare,
  FolderOpen,
  Menu,
  LogOut,
  ChevronRight,
  HelpCircle,
  BarChart2,
  Bell,
  AlertTriangle,
  MessageSquare,
  Paintbrush,
  ChevronDown,
  Layers,
  CalendarDays,
  CalendarRange,
  History,
} from "lucide-react";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter } from "@/components/help/HelpCenter";
import { BottomNav } from "@/components/layout/BottomNav";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { AgentWidget } from "@/components/agent/AgentWidget";
import { NotesWidget } from "@/components/notes/NotesWidget";
import { StickyNotesLayer } from "@/components/notes/StickyNotesLayer";

const adminLinks = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/programs", label: "Programs", icon: Layers },
  { href: "/dashboard/admin/terms", label: "Terms & Scheduling", icon: CalendarRange },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/audit-log", label: "Audit Log", icon: History },
  { href: "/dashboard/admin/danger-zone", label: "Danger Zone", icon: AlertTriangle },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/help", label: "Help Center", icon: HelpCircle },
  // Settings sub-links kept here so BottomNav includes them
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/branding", label: "Branding", icon: Paintbrush },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
];

const settingsSubLinks = [
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/branding", label: "Branding", icon: Paintbrush },
];

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

const settingsHrefs = new Set(settingsSubLinks.map((l) => l.href));
const mainLinks = adminLinks.filter(
  (l) => l.href !== "/dashboard/admin/settings" && l.href !== "/dashboard/admin/reminders" && l.href !== "/dashboard/admin/branding"
);

// Only the 4 most-used destinations get a bottom-nav tab of their own — the
// rest live behind "More", which opens the same drawer as the hamburger.
const bottomNavPrimaryLinks = [
  adminLinks[0], // Overview
  adminLinks[1], // Users
  adminLinks[2], // Courses
  { href: "/chat", label: "Chat", icon: MessageSquare },
];
const bottomNavPrimaryHrefs = new Set(bottomNavPrimaryLinks.map((l) => l.href));
const bottomNavOverflowLinks = adminLinks.filter((l) => !bottomNavPrimaryHrefs.has(l.href));

function NavLinks({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const isInSettings =
    location.startsWith("/dashboard/admin/settings") ||
    settingsSubLinks.some((l) => location.startsWith(l.href));

  // Submenu is open when on any settings page, OR when user manually opened it
  const [manualOpen, setManualOpen] = useState(false);
  const settingsOpen = isInSettings || manualOpen;

  return (
    <nav className="flex flex-col gap-1 p-3">
      {mainLinks.map((link) => {
        const Icon = link.icon;
        const isActive =
          link.href === "/dashboard/admin"
            ? location === "/dashboard/admin"
            : location.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href}>
            <button
              onClick={onClose}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group ${
                isActive
                  ? "bg-white/15 text-white font-semibold border-l-2 border-white pl-[10px]"
                  : "text-slate-300 font-medium hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{link.label}</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />}
            </button>
          </Link>
        );
      })}

      {/* Settings group — always last, sub-items expand downward */}
      <div>
        <Link href="/dashboard/admin/settings">
          <button
            onClick={() => { setManualOpen(true); onClose?.(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
              location === "/dashboard/admin/settings"
                ? "bg-white/15 text-white font-semibold border-l-2 border-white pl-[10px]"
                : isInSettings
                ? "bg-white/10 text-white font-medium"
                : "text-slate-300 font-medium hover:bg-white/8 hover:text-white"
            }`}
          >
            <Settings className={`h-4 w-4 shrink-0 ${isInSettings ? "text-white" : "text-slate-400"}`} />
            <span>Settings</span>
            <span className="ml-auto">
              {settingsOpen
                ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            </span>
          </button>
        </Link>

        <div
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{ maxHeight: settingsOpen ? "200px" : "0px", opacity: settingsOpen ? 1 : 0 }}
        >
          <div className="mt-0.5 ml-3 pl-3 border-l border-white/10 flex flex-col gap-0.5">
            {settingsSubLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href}>
                  <button
                    onClick={onClose}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      isActive
                        ? "bg-white/15 text-white font-semibold"
                        : "text-slate-400 font-medium hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white" : "text-slate-500"}`} />
                    <span>{link.label}</span>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: school } = useGetMySchool({ query: { enabled: !!user?.schoolId } });
  const { showTour, launchTour, closeTour } = useTour(user?.role as "admin" | "super_admin");

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-slate-900 h-screen sticky top-0 shrink-0">
        {/* Logo / School Name */}
        <div className="px-4 py-5 border-b border-white/10">
          <Link href="/dashboard/admin">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                {(school?.name || "S")[0].toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-white font-semibold text-sm truncate leading-tight">
                  {school?.name || "SolomonQuest"}
                </p>
                <p className="text-slate-400 text-xs">Admin Panel</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/8 mb-1"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="mr-2 h-3.5 w-3.5" />
            Help Center
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-400 hover:text-red-400 hover:bg-red-400/10"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign Out
          </Button>
          <p className="text-center text-[10px] text-slate-600 tracking-widest uppercase mt-2">Powered by TIBLOGICS</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b flex items-center px-4 gap-3 sticky top-0 z-20 shadow-sm">
          {/* Mobile menu trigger */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-slate-900 border-r-0">
              <div className="px-4 py-5 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                    {(school?.name || "S")[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-white font-semibold text-sm truncate">
                      {school?.name || "SolomonQuest"}
                    </p>
                    <p className="text-slate-400 text-xs">Admin Panel</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <NavLinks onClose={() => setIsMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="md:hidden font-semibold text-gray-900 truncate">
            {school?.name || "SolomonQuest"}
          </div>

          <div className="hidden md:block flex-1" />

          <div className="flex items-center gap-2 ml-auto">
            <ProfileMenu />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 has-bottom-nav md:pb-8">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav
        links={bottomNavPrimaryLinks}
        moreCount={bottomNavOverflowLinks.length}
        onMoreClick={() => setIsMobileOpen(true)}
        moreActive={bottomNavOverflowLinks.some(
          (l) => location === l.href || location.startsWith(`${l.href}/`)
        )}
      />

      {/* AI Agent */}
      <AgentWidget />

      {/* Notes */}
      <NotesWidget />
      <StickyNotesLayer />

      {/* Help Center drawer */}
      {helpOpen && (
        <HelpCenter
          role={user?.role as "admin" | "super_admin"}
          onClose={() => setHelpOpen(false)}
          onStartTour={launchTour}
        />
      )}

      {/* Guided tour */}
      {showTour && (
        <TourOverlay role={user?.role as "admin" | "super_admin"} onClose={closeTour} />
      )}
    </div>
  );
}
