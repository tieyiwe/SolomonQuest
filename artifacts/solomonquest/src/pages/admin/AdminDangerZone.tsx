import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useGetMySchool } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, CheckCircle2, XCircle, Loader2, Trash2, Crown } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Counts {
  students: number;
  teachers: number;
  courses: number;
}

interface DeletionRequest {
  id: string;
  status: string;
  created_at: string;
  reason: string | null;
}

// ─── CheckRow ─────────────────────────────────────────────────────────────────

function CheckRow({
  label,
  count,
  loading,
}: {
  label: string;
  count: number;
  loading: boolean;
}) {
  const pass = count === 0;
  return (
    <div className="flex items-center gap-3 py-2">
      {loading ? (
        <Skeleton className="h-5 w-5 rounded-full shrink-0" />
      ) : pass ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-5 w-5 text-red-500 shrink-0" />
      )}
      <span className={`text-sm ${pass ? "text-gray-700" : "text-red-600 font-medium"}`}>
        {loading ? (
          <Skeleton className="h-4 w-48 inline-block" />
        ) : pass ? (
          `No ${label}`
        ) : (
          `${count} ${label} — must be removed first`
        )}
      </span>
    </div>
  );
}

// ─── Transfer Ownership ────────────────────────────────────────────────────────

interface EligibleUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  email?: string | null;
}

type TransferStep = "select" | "confirm";

function TransferOwnershipCard({
  schoolId,
  schoolName,
  isOwner,
}: {
  schoolId: string;
  schoolName: string;
  isOwner: boolean;
}) {
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<TransferStep>("select");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    setLoadingUsers(true);
    apiFetch(`/api/users`)
      .then((r) => r.json())
      .then((data: EligibleUser[]) => {
        setUsers(Array.isArray(data) ? data.filter((u) => u.role !== "student") : []);
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [schoolId]);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const nameMatches = nameInput.trim().toLowerCase() === schoolName.trim().toLowerCase();

  const handleOpen = () => {
    setStep("select");
    setSelectedUserId("");
    setNameInput("");
    setDialogOpen(true);
  };

  const handleConfirmSelection = () => {
    if (!selectedUserId) return;
    setStep("confirm");
  };

  const handleTransfer = async () => {
    if (!nameMatches || !selectedUserId) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ newOwnerId: selectedUserId, confirmSchoolName: nameInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to transfer ownership");
        return;
      }
      toast.success(
        `Ownership transferred to ${[selectedUser?.firstName, selectedUser?.lastName].filter(Boolean).join(" ") || "the new owner"}.`
      );
      setDialogOpen(false);
      // Reload so the rest of the app picks up the new owner/role state.
      window.location.reload();
    } catch {
      toast.error("Failed to transfer ownership");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOwner) return null;

  return (
    <>
      <Card className="border border-amber-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-amber-100">
              <Crown className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base text-gray-900">Transfer School Ownership</CardTitle>
              <CardDescription>
                Hand full ownership of this school to another admin, staff member, or teacher.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              The new owner is promoted to admin if they aren't already. You will keep your own
              admin access, but will no longer be the school's owner.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50 w-full sm:w-auto"
            onClick={handleOpen}
            disabled={loadingUsers || users.length === 0}
          >
            <Crown className="mr-2 h-4 w-4" />
            Transfer Ownership
          </Button>
          {!loadingUsers && users.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No other admins, staff, or teachers found to transfer ownership to.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          {step === "select" && (
            <>
              <DialogHeader>
                <DialogTitle>Transfer Ownership</DialogTitle>
                <DialogDescription>
                  Choose who should become the new owner of {schoolName}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a new owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}{" "}
                        <span className="text-muted-foreground capitalize">({u.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={!selectedUserId} onClick={handleConfirmSelection}>
                    Continue
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-amber-700">Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  You are about to permanently transfer ownership of {schoolName} to{" "}
                  <strong>
                    {[selectedUser?.firstName, selectedUser?.lastName].filter(Boolean).join(" ")}
                  </strong>
                  . This cannot be undone by you — only the new owner or a platform super admin
                  can transfer it again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>
                    Type <span className="font-semibold text-gray-800">{schoolName}</span> to confirm:
                  </Label>
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={schoolName}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setStep("select")}>
                    Back
                  </Button>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700"
                    disabled={!nameMatches || submitting}
                    onClick={handleTransfer}
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Crown className="mr-2 h-4 w-4" />
                    )}
                    Transfer Ownership
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Step = "info" | "confirm" | "reason" | "success";

export default function AdminDangerZone() {
  const { user } = useAuth();
  const { data: school, isLoading: schoolLoading } = useGetMySchool();
  const schoolId = school?.id as string | undefined;

  // counts
  const [counts, setCounts] = useState<Counts>({ students: 0, teachers: 0, courses: 0 });
  const [countsLoading, setCountsLoading] = useState(true);

  // existing deletion request
  const [existingRequest, setExistingRequest] = useState<DeletionRequest | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // step flow
  const [step, setStep] = useState<Step>("info");
  const [dialogOpen, setDialogOpen] = useState(false);

  // step 2 — name confirmation
  const [nameInput, setNameInput] = useState("");

  // step 3 — reason
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // fetch counts
  useEffect(() => {
    if (!schoolId) return;
    setCountsLoading(true);

    Promise.all([
      apiFetch(`/api/users?school_id=${schoolId}&role=student`).then((r) => r.json()),
      apiFetch(`/api/users?school_id=${schoolId}&role=teacher`).then((r) => r.json()),
      apiFetch(`/api/courses?school_id=${schoolId}`).then((r) => r.json()),
    ])
      .then(([students, teachers, courses]) => {
        const studentCount = Array.isArray(students)
          ? students.length
          : typeof students?.total === "number"
          ? students.total
          : typeof students?.count === "number"
          ? students.count
          : 0;
        const teacherCount = Array.isArray(teachers)
          ? teachers.length
          : typeof teachers?.total === "number"
          ? teachers.total
          : typeof teachers?.count === "number"
          ? teachers.count
          : 0;
        const courseCount = Array.isArray(courses)
          ? courses.length
          : typeof courses?.total === "number"
          ? courses.total
          : typeof courses?.count === "number"
          ? courses.count
          : 0;
        setCounts({ students: studentCount, teachers: teacherCount, courses: courseCount });
      })
      .catch(() => {})
      .finally(() => setCountsLoading(false));
  }, [schoolId]);

  // fetch deletion request status
  useEffect(() => {
    if (!schoolId) return;
    setStatusLoading(true);
    apiFetch(`/api/schools/${schoolId}/deletion-status`)
      .then((r) => r.json())
      .then((data) => {
        setExistingRequest(data?.request ?? null);
        if (data?.request) setStep("success");
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, [schoolId]);

  const allClear =
    !countsLoading &&
    counts.students === 0 &&
    counts.teachers === 0 &&
    counts.courses === 0;

  const nameMatches =
    nameInput.trim().toLowerCase() === (school?.name ?? "").trim().toLowerCase();

  const handleRequestDeletion = () => {
    setStep("confirm");
    setDialogOpen(true);
  };

  const handleConfirmName = () => {
    if (!nameMatches) return;
    setStep("reason");
  };

  const handleSubmit = async () => {
    if (!schoolId) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/request-deletion`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to submit deletion request.");
        return;
      }
      setExistingRequest({
        id: data.request_id,
        status: "pending",
        created_at: new Date().toISOString(),
        reason: reason.trim() || null,
      });
      setStep("success");
      setDialogOpen(false);
      toast.success("Deletion request submitted.");
    } catch {
      toast.error("Failed to submit deletion request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setDialogOpen(false);
      // reset dialog-internal state but keep outer step if already success
      if (step !== "success") setStep("info");
      setNameInput("");
      setReason("");
    }
  };

  if (schoolLoading || statusLoading) {
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
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

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
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Danger Zone</h1>
          <p className="text-muted-foreground mt-0.5">
            Irreversible actions for your school. Proceed with caution.
          </p>
        </div>

        {/* Success / existing request banner */}
        {step === "success" && existingRequest && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50 text-green-800">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
            <div className="space-y-1">
              <p className="font-semibold text-green-900">Deletion Request Submitted</p>
              <p className="text-sm">
                Our team has been notified and will reach out to confirm your request within
                1-2 business days. If you change your mind, contact{" "}
                <a
                  href="mailto:support@solomonquest.com"
                  className="underline font-medium"
                >
                  support@solomonquest.com
                </a>
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs text-green-700">
                <span>
                  Status:{" "}
                  <span className="capitalize font-semibold">{existingRequest.status}</span>
                </span>
                <span>
                  Submitted:{" "}
                  {new Date(existingRequest.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Transfer ownership */}
        {schoolId && school && (
          <TransferOwnershipCard
            schoolId={schoolId}
            schoolName={school.name}
            isOwner={
              (school as any).ownerId === user?.id ||
              (user as any)?.role === "super_admin"
            }
          />
        )}

        {/* Main deletion card */}
        {step !== "success" && (
          <Card className="border border-red-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-100">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-base text-gray-900">School Deletion</CardTitle>
                  <CardDescription>
                    Permanent and cannot be undone after 30 days.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Warning */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Deleting your school is <strong>permanent</strong> and cannot be undone after
                  30 days. Before you can request deletion, all of the following must be true:
                </p>
              </div>

              {/* Checklist */}
              <div className="divide-y rounded-lg border px-4">
                <CheckRow
                  label="active students"
                  count={counts.students}
                  loading={countsLoading}
                />
                <CheckRow
                  label="active teachers"
                  count={counts.teachers}
                  loading={countsLoading}
                />
                <CheckRow
                  label="active courses"
                  count={counts.courses}
                  loading={countsLoading}
                />
              </div>

              <Button
                variant="destructive"
                disabled={!allClear}
                onClick={handleRequestDeletion}
                className="w-full sm:w-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Request Deletion
              </Button>

              {!allClear && !countsLoading && (
                <p className="text-xs text-muted-foreground">
                  Resolve all issues above before you can request deletion.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Multi-step dialog */}
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-md">
            {/* Step 2: confirm school name */}
            {step === "confirm" && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-red-700">Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This will submit a deletion request to the SolomonQuest team. They will
                    contact you to confirm before proceeding.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <Label>
                      Type{" "}
                      <span className="font-semibold text-gray-800">
                        {school?.name ?? "your school name"}
                      </span>{" "}
                      to confirm:
                    </Label>
                    <Input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder={school?.name ?? ""}
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => handleDialogClose(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={!nameMatches}
                      onClick={handleConfirmName}
                    >
                      Yes, request deletion
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Step 3: reason */}
            {step === "reason" && (
              <>
                <DialogHeader>
                  <DialogTitle>Why do you want to delete this school?</DialogTitle>
                  <DialogDescription>
                    This is optional, but helps our team understand your needs.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. We are migrating to another platform, closing operations..."
                    rows={4}
                    autoFocus
                  />

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStep("confirm");
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleSubmit}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Submit Request
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
