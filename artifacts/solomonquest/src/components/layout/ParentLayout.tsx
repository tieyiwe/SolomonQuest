import { useAuth } from "@/contexts/AuthContext";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, LogOut } from "lucide-react";

interface ParentLayoutProps {
  children: React.ReactNode;
}

export function ParentLayout({ children }: ParentLayoutProps) {
  const { user, signOut } = useAuth();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "P";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          <Link href="/dashboard/parent">
            <span className="text-base font-bold text-primary tracking-tight">SolomonQuest</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={user?.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">
                {user?.firstName} {user?.lastName}
              </span>
              <Badge variant="outline" className="w-fit text-xs py-0">
                Parent
              </Badge>
            </div>
          </div>
          <ProfileMenu />
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign Out">
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto bg-background max-w-5xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
