import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, LogIn, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getLinkedSchools,
  loginToSchool,
  removeLinkedSchool,
  switchToLinkedSchool,
  type LinkedSchool,
} from "@/lib/schoolSwitch";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  teacher: "Teacher",
  staff: "Staff",
  student: "Student",
};

export function SchoolSwitcherDialog({
  open,
  onOpenChange,
  currentSchoolId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentSchoolId?: string | null;
}) {
  const [linked, setLinked] = useState<LinkedSchool[]>([]);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (open) {
      setLinked(getLinkedSchools());
      setShowLoginForm(false);
      setEmail("");
      setPassword("");
    }
  }, [open]);

  const handleSwitch = async (schoolId: string) => {
    setSwitchingId(schoolId);
    try {
      await switchToLinkedSchool(schoolId);
    } catch (err: any) {
      toast.error(err.message || "Failed to switch school");
      setLinked(getLinkedSchools());
      setSwitchingId(null);
    }
  };

  const handleRemove = (schoolId: string) => {
    removeLinkedSchool(schoolId);
    setLinked(getLinkedSchools());
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter your email and password");
      return;
    }
    setLoggingIn(true);
    try {
      await loginToSchool(email.trim(), password, remember);
      // loginToSchool redirects on success; nothing else to do here.
    } catch (err: any) {
      toast.error(err.message || "Failed to log in");
      setLoggingIn(false);
    }
  };

  const otherLinked = linked.filter((s) => s.schoolId !== currentSchoolId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Switch School
          </DialogTitle>
          <DialogDescription>
            Switch between schools you have an account at.
          </DialogDescription>
        </DialogHeader>

        {!showLoginForm ? (
          <div className="space-y-3">
            {otherLinked.length > 0 && (
              <div className="space-y-1">
                {otherLinked.map((s) => (
                  <div
                    key={s.schoolId}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => handleSwitch(s.schoolId)}
                      disabled={!!switchingId}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left disabled:opacity-60"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.schoolName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ROLE_LABELS[s.role] ?? s.role} · {s.email}
                        </p>
                      </div>
                      {switchingId === s.schoolId && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    </button>
                    <button
                      onClick={() => handleRemove(s.schoolId)}
                      className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                      title="Forget this school on this device"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {otherLinked.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No other schools linked on this device yet.
              </p>
            )}

            <Button variant="outline" className="w-full gap-2" onClick={() => setShowLoginForm(true)}>
              <LogIn className="w-4 h-4" />
              Log in to another school
            </Button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="switch-email">Email</Label>
              <Input
                id="switch-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="switch-password">Password</Label>
              <Input
                id="switch-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Remember this school on this device — switch instantly next time
              </Label>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowLoginForm(false)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={loggingIn}>
                {loggingIn && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Log In &amp; Switch
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
