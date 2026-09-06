import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/session";
import { toast } from "sonner";
import { FlaskConical, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getImpersonationTarget, startImpersonation } from "@/lib/impersonation";

interface SearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string | null;
  internal_email: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  staff: "Staff",
  student: "Student",
};

function getInitials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "U";
}

/**
 * Floating "Switch Profile" control shown only to users an admin has
 * granted test_mode_enabled — lets a team member self-switch into any
 * teacher/staff/student account in the school (via the same real-session
 * impersonation flow admins get with "View As") for pre-launch testing,
 * without needing an admin to trigger it every time.
 */
export function TestModeSwitcher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const testModeEnabled = (user as any)?.testModeEnabled === true;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    auth.getSession().then(async ({ data: { session } }) => {
      try {
        const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (!res.ok || cancelled) return;
        const data: SearchResult[] = await res.json();
        if (!cancelled) {
          setResults(data.filter((u) => u.role && ["teacher", "staff", "student"].includes(u.role)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  // Never shown while already viewing as someone — avoid nested swaps,
  // which would lose track of the true original session.
  if (!testModeEnabled || getImpersonationTarget()) return null;

  const handleSwitch = async (target: SearchResult) => {
    setSwitchingId(target.id);
    try {
      await startImpersonation(target.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to switch profile");
      setSwitchingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg transition-colors"
          title="Test Mode: switch into another account for testing"
        >
          <FlaskConical className="w-4 h-4" />
          Switch Profile
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-600" />
            Switch Profile (Test Mode)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No users found.</p>
            ) : (
              results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSwitch(u)}
                  disabled={!!switchingId}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors text-left disabled:opacity-60"
                >
                  <Avatar className="h-8 w-8 border shrink-0">
                    <AvatarImage src={u.avatar_url || ""} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {getInitials(u.first_name, u.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {u.first_name} {u.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.internal_email}</p>
                  </div>
                  {u.role && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  )}
                  {switchingId === u.id && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
