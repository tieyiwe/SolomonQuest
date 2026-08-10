import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { SchoolSwitcherDialog } from "@/components/SchoolSwitcherDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  User,
  Bell,
  Settings,
  Shield,
  Building2,
} from "lucide-react";

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function roleLabel(role?: string | null) {
  if (!role) return "";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function profileLink(_role?: string | null) {
  return "/profile";
}

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const initials = getInitials(user?.firstName, user?.lastName);
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";
  const canSwitchSchools = user?.role === "admin" || user?.role === "staff";

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-primary">
        <Avatar className="h-8 w-8 border-2 border-primary/20 shadow-sm cursor-pointer">
          <AvatarImage src={user?.avatarUrl || ""} alt={fullName} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 shadow-lg z-50">
        {/* User header */}
        <DropdownMenuLabel className="pb-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-gray-200 shrink-0">
              <AvatarImage src={user?.avatarUrl || ""} alt={fullName} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              {user?.role && (
                <span className="inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                  {roleLabel(user.role)}
                </span>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <Link href={profileLink(user?.role)}>
          <DropdownMenuItem className="cursor-pointer gap-2">
            <User className="h-4 w-4 text-gray-500" />
            <span>My Profile</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/settings/notifications">
          <DropdownMenuItem className="cursor-pointer gap-2">
            <Bell className="h-4 w-4 text-gray-500" />
            <span>Notification Settings</span>
          </DropdownMenuItem>
        </Link>

        {(user?.role === "admin" || user?.role === "super_admin") && (
          <Link href="/dashboard/admin/settings">
            <DropdownMenuItem className="cursor-pointer gap-2">
              <Settings className="h-4 w-4 text-gray-500" />
              <span>School Settings</span>
            </DropdownMenuItem>
          </Link>
        )}

        {user?.role === "super_admin" && (
          <Link href="/super_admin">
            <DropdownMenuItem className="cursor-pointer gap-2">
              <Shield className="h-4 w-4 text-gray-500" />
              <span>Platform Admin</span>
            </DropdownMenuItem>
          </Link>
        )}

        {canSwitchSchools && (
          <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setSwitcherOpen(true)}>
            <Building2 className="h-4 w-4 text-gray-500" />
            <span>Switch School</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {canSwitchSchools && (
      <SchoolSwitcherDialog
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        currentSchoolId={(user as any)?.schoolId}
      />
    )}
    </>
  );
}
