import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { StudentDetailDialog } from "@/components/StudentDetailDialog";
import { TeacherDetailDialog } from "@/components/TeacherDetailDialog";
import {
  useListUsers,
  useUpdateUserRole,
  useListPrograms,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Search,
  UserPlus,
  KeyRound,
  Mail,
  Loader2,
  Users,
  GraduationCap,
  Briefcase,
  Send,
  Eye,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function roleBadge(role?: string | null) {
  switch (role) {
    case "admin":
    case "super_admin":
      return <Badge className="bg-violet-100 text-violet-700 border-violet-200 border">{role?.replace("_", " ")}</Badge>;
    case "teacher":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">Teacher</Badge>;
    case "student":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Student</Badge>;
    case "staff":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200 border">Staff</Badge>;
    default:
      return <Badge variant="outline" className="capitalize">{role || "No role"}</Badge>;
  }
}

function PasswordResetButton({ userId, userName }: { userId: string; userName: string }) {
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to send reset email");
      toast.success(`Password reset email sent to ${userName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-gray-900">
          <KeyRound className="h-3.5 w-3.5 mr-1.5" />
          Reset Password
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Password Reset?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a password reset email to <strong>{userName}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Reset Email
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TestModeToggle({
  userId,
  userName,
  enabled,
  adminAccess,
  onChanged,
}: {
  userId: string;
  userName: string;
  enabled: boolean;
  adminAccess: boolean;
  onChanged: (enabled: boolean, adminAccess: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);

  const patchTestMode = async (next: boolean, nextAdminAccess: boolean, successMessage: string) => {
    setLoading(true);
    onChanged(next, nextAdminAccess);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/users/${userId}/test-mode`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ enabled: next, adminAccess: nextAdminAccess }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update Test Mode");
      }
      toast.success(successMessage);
    } catch (err: any) {
      onChanged(enabled, adminAccess);
      toast.error(err.message || "Failed to update Test Mode");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (next: boolean) =>
    patchTestMode(
      next,
      next ? adminAccess : false,
      next ? `Test Mode enabled for ${userName} — they've been notified` : `Test Mode disabled for ${userName}`
    );

  const handleAdminAccessToggle = (next: boolean) =>
    patchTestMode(
      enabled,
      next,
      next ? `${userName} can now also view as admin in Test Mode` : `Admin access removed from ${userName}'s Test Mode`
    );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5" title="Test Mode: lets this user self-switch between teacher/staff/student accounts for testing">
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={loading} className="scale-75" />
        <span className="text-xs text-muted-foreground">Test Mode</span>
      </div>
      {enabled && (
        <label
          className="flex items-center gap-1.5 pl-0.5 cursor-pointer"
          title="Also let this known tester view as admin in Test Mode — normally Test Mode is capped at their own role or below"
        >
          <input
            type="checkbox"
            checked={adminAccess}
            onChange={(e) => handleAdminAccessToggle(e.target.checked)}
            disabled={loading}
            className="h-3 w-3"
          />
          <span className="text-[11px] text-muted-foreground">Admin access</span>
        </label>
      )}
    </div>
  );
}

function ViewAsButton({ userId, userName, role }: { userId: string; userName: string; role: string }) {
  const [loading, setLoading] = useState(false);

  const handleViewAs = async () => {
    setLoading(true);
    try {
      const { startImpersonation } = await import("@/lib/impersonation");
      await startImpersonation(userId);
    } catch (err: any) {
      toast.error(err.message || "Failed to start view-as session");
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-gray-900">
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          View As
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>View the app as {userName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll be signed in as this {role} until you click "Return to Admin" in the banner at the
            top of the page. This lets you check exactly what they see.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleViewAs} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            View As {userName}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddToProgramButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: programs } = useListPrograms({ query: { enabled: open } });

  const handleAdd = async () => {
    if (!programId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/programs/${programId}/enroll-student`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ studentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add student to program");
      }
      toast.success(`${studentName} enrolled in the program's courses`);
      setProgramId("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add student to program");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-gray-900">
          <GraduationCap className="h-3.5 w-3.5 mr-1.5" />
          Add to Program
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add {studentName} to a Program</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Enrolls them in every course currently in the chosen program.
          </p>
          <Select value={programId} onValueChange={setProgramId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a program..." />
            </SelectTrigger>
            <SelectContent>
              {(programs ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={loading || !programId}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserTable({
  role,
  search,
}: {
  role?: string;
  search: string;
}) {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers(role ? { role } : undefined);
  const updateUserRole = useUpdateUserRole();
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);
  const [viewTeacherId, setViewTeacherId] = useState<string | null>(null);
  const [testModeOverrides, setTestModeOverrides] = useState<
    Record<string, { enabled: boolean; adminAccess: boolean }>
  >({});

  const filtered = (users ?? []).filter((u) => {
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    updateUserRole.mutate(
      { id: userId, data: { role: newRole } },
      {
        onSuccess: () => {
          toast.success("Role updated");
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to update role"),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">{search ? "No users match your search." : "No users found."}</p>
      </div>
    );
  }

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-50/50">
          <TableHead className="font-semibold">Name</TableHead>
          <TableHead className="font-semibold">Email</TableHead>
          <TableHead className="font-semibold">Role</TableHead>
          <TableHead className="font-semibold">Change Role</TableHead>
          <TableHead className="font-semibold">Test Mode</TableHead>
          <TableHead className="font-semibold">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((user) => (
          <TableRow key={user.id} className="hover:bg-gray-50/50">
            <TableCell>
              {user.role === "student" || user.role === "teacher" ? (
                <button
                  className="flex items-center gap-3 text-left hover:underline decoration-dotted underline-offset-2"
                  onClick={() =>
                    user.role === "student" ? setViewStudentId(user.id) : setViewTeacherId(user.id)
                  }
                >
                  <Avatar className="h-8 w-8 border">
                    <AvatarImage src={user.avatarUrl || ""} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-gray-900 text-sm">
                    {user.firstName} {user.lastName}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 border">
                    <AvatarImage src={user.avatarUrl || ""} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-gray-900 text-sm">
                    {user.firstName} {user.lastName}
                  </span>
                </div>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
            <TableCell>{roleBadge(user.role)}</TableCell>
            <TableCell>
              <Select
                defaultValue={user.role || ""}
                onValueChange={(val) => handleRoleChange(user.id, val)}
                disabled={updateUserRole.isPending}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <TestModeToggle
                userId={user.id}
                userName={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "User"}
                enabled={testModeOverrides[user.id]?.enabled ?? (user as any).testModeEnabled ?? false}
                adminAccess={testModeOverrides[user.id]?.adminAccess ?? (user as any).testModeAdminAccess ?? false}
                onChanged={(enabled, adminAccess) =>
                  setTestModeOverrides((prev) => ({ ...prev, [user.id]: { enabled, adminAccess } }))
                }
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <PasswordResetButton
                  userId={user.id}
                  userName={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "User"}
                />
                {(user.role === "student" || user.role === "teacher" || user.role === "staff") && (
                  <ViewAsButton
                    userId={user.id}
                    userName={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "User"}
                    role={user.role}
                  />
                )}
                {user.role === "student" && (
                  <AddToProgramButton
                    studentId={user.id}
                    studentName={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Student"}
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <StudentDetailDialog
      studentId={viewStudentId}
      open={!!viewStudentId}
      onOpenChange={(v) => { if (!v) setViewStudentId(null); }}
    />
    <TeacherDetailDialog
      teacherId={viewTeacherId}
      open={!!viewTeacherId}
      onOpenChange={(v) => { if (!v) setViewTeacherId(null); }}
    />
    </>
  );
}

function InviteButton({
  role,
  onSent,
}: {
  role: "teacher" | "staff" | "student";
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [programId, setProgramId] = useState("");
  const [loading, setLoading] = useState(false);
  const roleLabel = role === "teacher" ? "Teacher" : role === "staff" ? "Staff Member" : "Student";
  const placeholder = role === "teacher" ? "teacher@school.edu" : role === "staff" ? "staff@school.edu" : "student@school.edu";
  const { data: programs } = useListPrograms({ query: { enabled: role === "student" && open } });

  const handleSend = async () => {
    if (!email.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (role === "student" && !programId) {
      toast.error("Select a program before sending a student invitation");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: email.trim(), role, programId: role === "student" && programId ? programId : undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to send invitation");
      }
      onSent();
      toast.success(`Invitation sent to ${email.trim()}`);
      setEmail("");
      setProgramId("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Invite {roleLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite {roleLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder={placeholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              autoFocus
            />
          </div>
          {role === "student" && (
            <div className="space-y-1.5">
              <Label>Program *</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a program..." />
                </SelectTrigger>
                <SelectContent>
                  {(programs ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                They're automatically enrolled in every course in this program as soon as they accept.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            They'll receive an email to create their account and join your school as a{" "}
            {roleLabel.toLowerCase()}.
          </p>
          <Button className="w-full" onClick={handleSend} disabled={loading || !email.trim() || (role === "student" && !programId)}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send Invitation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BulkImportRowResult {
  email: string;
  success: boolean;
  error?: string;
}

/**
 * CSV bulk roster import. Parsed entirely client-side (a spreadsheet export
 * is trivially malformed in ways a strict server-side CSV parser would
 * choke on — easier and safer to be lenient here and only send well-formed
 * JSON rows to the API) and sent to POST /invitations/bulk, which creates
 * one invitation per row through the exact same path as a single invite.
 * Expected header row: email, role, program (program only used/required
 * for student rows, matched by name against this school's programs).
 */
function BulkImportButton({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<{ email: string; role: string; programName?: string }[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<BulkImportRowResult[] | null>(null);
  const { data: programs } = useListPrograms({ query: { enabled: open } });

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setParseError("The file is empty");
      setRows([]);
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const emailIdx = header.indexOf("email");
    const roleIdx = header.indexOf("role");
    const programIdx = header.indexOf("program");
    if (emailIdx === -1) {
      setParseError('CSV must have an "email" column (role and program columns are optional).');
      setRows([]);
      return;
    }

    const parsed = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        email: cols[emailIdx] ?? "",
        role: (roleIdx !== -1 ? cols[roleIdx] : "") || "student",
        programName: programIdx !== -1 ? cols[programIdx] : undefined,
      };
    }).filter((r) => r.email);

    if (parsed.length === 0) {
      setParseError("No rows with an email address were found.");
      setRows([]);
      return;
    }
    if (parsed.length > 500) {
      setParseError(`This file has ${parsed.length} rows — split it into batches of 500 or fewer.`);
      setRows([]);
      return;
    }
    setParseError("");
    setRows(parsed);
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResults(null);
    const reader = new FileReader();
    reader.onload = () => parseCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const programByName = new Map((programs ?? []).map((p) => [p.name.toLowerCase(), p.id]));
      const payloadRows = rows.map((r) => ({
        email: r.email,
        role: r.role,
        programId: r.programName ? programByName.get(r.programName.toLowerCase()) : undefined,
      }));

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/invitations/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Bulk import failed");

      setResults(body.results ?? []);
      onImported();
      if (body.failed === 0) {
        toast.success(`Invited all ${body.succeeded} ${body.succeeded === 1 ? "person" : "people"}`);
      } else {
        toast.warning(`Invited ${body.succeeded} of ${body.total} — ${body.failed} failed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFileName("");
    setRows([]);
    setParseError("");
    setResults(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Import Roster</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-xs text-muted-foreground">
            CSV with columns <code className="bg-muted px-1 rounded">email</code>,{" "}
            <code className="bg-muted px-1 rounded">role</code> (teacher/staff/student, defaults to student), and{" "}
            <code className="bg-muted px-1 rounded">program</code> (program name, required for students). Everyone
            gets an invite email, same as inviting one at a time.
          </p>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {fileName && !parseError && rows.length > 0 && !results && (
            <p className="text-sm text-muted-foreground">
              {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} ready to import.
            </p>
          )}
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}

          {results && (
            <div className="max-h-56 overflow-y-auto space-y-1 border rounded-lg p-2">
              {results.map((r) => (
                <div key={r.email} className="flex items-center justify-between text-xs gap-2">
                  <span className="truncate">{r.email}</span>
                  {r.success ? (
                    <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 shrink-0">Invited</Badge>
                  ) : (
                    <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5 shrink-0" title={r.error}>
                      Failed
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleImport}
            disabled={importing || rows.length === 0 || !!parseError || !!results}
          >
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {results ? "Done" : `Import ${rows.length || ""} ${rows.length === 1 ? "Person" : "People"}`.trim()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
  programName?: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "accepted":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Accepted</Badge>;
    case "expired":
      return <Badge className="bg-red-100 text-red-700 border-red-200 border">Expired</Badge>;
    default:
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 border">Pending</Badge>;
  }
}

function InvitationsTab({
  refreshKey,
  roleFilter,
  hideAccepted,
}: {
  refreshKey: number;
  roleFilter?: string;
  hideAccepted?: boolean;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError("");
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/invitations", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) {
            if (data.error) setFetchError(data.error);
            else setInvitations(data.invitations ?? []);
          }
        })
        .catch(() => { if (!cancelled) setFetchError("Failed to load invitations"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const visible = invitations
    .filter((inv) => !roleFilter || inv.role === roleFilter)
    .filter((inv) => !hideAccepted || inv.status !== "accepted");

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm text-red-500">{fetchError}</p>
      </div>
    );
  }

  if (visible.length === 0) {
    if (roleFilter) return null;
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No invitations sent yet. Use the Invite buttons in the Teachers, Students, or Staff tabs.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-50/50">
          <TableHead className="font-semibold">Email</TableHead>
          <TableHead className="font-semibold">Role</TableHead>
          <TableHead className="font-semibold">Status</TableHead>
          <TableHead className="font-semibold">Sent</TableHead>
          <TableHead className="font-semibold">Accepted / Expires</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="font-medium text-sm">{inv.email}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5 flex-wrap">
                {inv.role === "teacher" ? (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">Teacher</Badge>
                ) : inv.role === "staff" ? (
                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 border">Staff</Badge>
                ) : (
                  <Badge variant="outline" className="capitalize">{inv.role}</Badge>
                )}
                {inv.programName && (
                  <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 border text-xs">
                    {inv.programName}
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>{statusBadge(inv.status)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(inv.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {inv.status === "accepted" && inv.accepted_at
                ? new Date(inv.accepted_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                : inv.status === "expired"
                ? "—"
                : `Expires ${new Date(inv.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("teachers");
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);
  const addInvite = () => setInviteRefreshKey((k) => k + 1);

  return (
    <AdminLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/admin">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">User Management</h1>
            <p className="text-muted-foreground mt-0.5">
              Manage all users, roles, and invitations.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
            {[
              { value: "teachers", label: "Teachers", icon: Users },
              { value: "students", label: "Students", icon: GraduationCap },
              { value: "staff", label: "Staff", icon: Briefcase },
              { value: "invitations", label: "Invitations", icon: Mail },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-medium"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="teachers" className="mt-0 space-y-4">
            <Card className="border-0 shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm text-muted-foreground">Teachers enrolled in your school.</p>
                <div className="flex items-center gap-2">
                  <BulkImportButton onImported={addInvite} />
                  <InviteButton role="teacher" onSent={addInvite} />
                </div>
              </div>
              <CardContent className="p-0">
                <UserTable role="teacher" search={search} />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending Invitations</p>
              </div>
              <InvitationsTab refreshKey={inviteRefreshKey} roleFilter="teacher" hideAccepted />
            </Card>
          </TabsContent>

          <TabsContent value="students" className="mt-0 space-y-4">
            <Card className="border-0 shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm text-muted-foreground">
                  Students enrolled in your school. New applicants should still go through Admissions —
                  use Invite Student for students transferring in from another school who don't need to apply.
                </p>
                <InviteButton role="student" onSent={addInvite} />
              </div>
              <CardContent className="p-0">
                <UserTable role="student" search={search} />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending Invitations</p>
              </div>
              <InvitationsTab refreshKey={inviteRefreshKey} roleFilter="student" hideAccepted />
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="mt-0 space-y-4">
            <Card className="border-0 shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm text-muted-foreground">Staff members associated with your school.</p>
                <InviteButton role="staff" onSent={addInvite} />
              </div>
              <CardContent className="p-0">
                <UserTable role="staff" search={search} />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-gray-50/50">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending Invitations</p>
              </div>
              <InvitationsTab refreshKey={inviteRefreshKey} roleFilter="staff" hideAccepted />
            </Card>
          </TabsContent>

          <TabsContent value="invitations" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <InvitationsTab refreshKey={inviteRefreshKey} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
