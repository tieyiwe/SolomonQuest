import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useListApplications,
  useUpdateApplicationStatus,
  getListApplicationsQueryKey,
  useGetMySchool,
} from "@workspace/api-client-react";
import type { Application } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ClipboardList,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  User,
  BookOpen,
  Loader2,
  FileText,
  Globe,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const STATUS_PIPELINE = ["received", "under_review", "finalizing", "approved"];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; badgeClass: string; icon: React.ElementType }
> = {
  received: {
    label: "Received",
    color: "text-yellow-700",
    badgeClass: "bg-yellow-50 text-yellow-700 border-yellow-200",
    icon: Clock,
  },
  under_review: {
    label: "Under Review",
    color: "text-blue-700",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    icon: AlertCircle,
  },
  finalizing: {
    label: "Finalizing",
    color: "text-purple-700",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    icon: FileText,
  },
  approved: {
    label: "Approved",
    color: "text-green-700",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG["received"];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badgeClass}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function getNextStatus(current: string): string | null {
  const idx = STATUS_PIPELINE.indexOf(current?.toLowerCase());
  if (idx === -1 || idx === STATUS_PIPELINE.length - 1) return null;
  return STATUS_PIPELINE[idx + 1];
}

function ApplicationDetailPanel({
  app,
  open,
  onClose,
  onStatusChange,
  updating,
}: {
  app: Application | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: string, notes?: string) => void;
  updating: boolean;
}) {
  const [notes, setNotes] = useState("");

  if (!app) return null;

  const nextStatus = getNextStatus(app.status);
  const isRejected = app.status?.toLowerCase() === "rejected";
  const isApproved = app.status?.toLowerCase() === "approved";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Application Details</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Applicant Info */}
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
              {(app.applicantName || "?")[0].toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">
                {app.applicantName || "Unknown Applicant"}
              </h3>
              <p className="text-sm text-muted-foreground">Application ID: {app.id.slice(0, 8)}...</p>
              <div className="mt-1">
                <StatusBadge status={app.status} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Program / Course
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{app.programName || "General Admission"}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Applicant ID
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono text-xs">
                  {app.applicantId || "Not linked to a user account"}
                </span>
              </div>
            </div>
          </div>

          {/* Status Pipeline */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status Progress
            </Label>
            <div className="mt-3 flex items-center gap-1">
              {STATUS_PIPELINE.map((s, i) => {
                const currentIdx = STATUS_PIPELINE.indexOf(app.status?.toLowerCase());
                const isDone = i <= currentIdx;
                const cfg = STATUS_CONFIG[s];
                return (
                  <div key={s} className="flex items-center gap-1 flex-1">
                    <div
                      className={`h-2 flex-1 rounded-full ${
                        isDone ? "bg-primary" : "bg-gray-200"
                      }`}
                    />
                    {i < STATUS_PIPELINE.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              {STATUS_PIPELINE.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <span key={s} className="text-xs text-muted-foreground">
                    {cfg.label}
                  </span>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Add Notes</Label>
            <Textarea
              placeholder="Internal notes about this application..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          {!isApproved && !isRejected && (
            <div className="space-y-2">
              {nextStatus && (
                <Button
                  className="w-full"
                  onClick={() => onStatusChange(app.id, nextStatus, notes)}
                  disabled={updating}
                >
                  {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Advance to "{STATUS_CONFIG[nextStatus]?.label}"
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => onStatusChange(app.id, "approved", notes)}
                disabled={updating}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve Application
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => onStatusChange(app.id, "rejected", notes)}
                disabled={updating}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject Application
              </Button>
            </div>
          )}

          {isApproved && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
              <p className="text-sm font-medium text-green-700">Application Approved</p>
            </div>
          )}

          {isRejected && (
            <div className="space-y-2">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
                <XCircle className="h-6 w-6 text-red-600 mx-auto mb-1" />
                <p className="text-sm font-medium text-red-700">Application Rejected</p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onStatusChange(app.id, "received", notes)}
                disabled={updating}
              >
                Reopen Application
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "under_review", label: "Under Review" },
  { value: "finalizing", label: "Finalizing" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminAdmissions() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { data: school, refetch: refetchSchool } = useGetMySchool();
  const isOpen = (school as any)?.applicationsOpen ?? false;

  const togglePublish = async () => {
    if (!school?.id) return;
    setPublishing(true);
    try {
      await apiFetch(`/api/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationsOpen: !isOpen }),
      });
      await refetchSchool();
      toast.success(isOpen ? "Applications closed." : "Applications are now live!");
    } catch {
      toast.error("Failed to update application status.");
    } finally {
      setPublishing(false);
    }
  };

  const { data: applications, isLoading } = useListApplications(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const updateStatus = useUpdateApplicationStatus();

  const handleStatusChange = (id: string, status: string, notes?: string) => {
    updateStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast.success(`Status updated to "${STATUS_CONFIG[status]?.label || status}"`);
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
          if (selectedApp?.id === id) {
            setSelectedApp((prev) => prev ? { ...prev, status } : null);
          }
        },
        onError: (err: any) => toast.error(err.message || "Failed to update status"),
      }
    );
  };

  const apps = applications ?? [];

  const counts = {
    all: apps.length,
    received: apps.filter((a) => a.status === "received").length,
    under_review: apps.filter((a) => a.status === "under_review").length,
    finalizing: apps.filter((a) => a.status === "finalizing").length,
    approved: apps.filter((a) => a.status === "approved").length,
    rejected: apps.filter((a) => a.status === "rejected").length,
  };

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admissions</h1>
            <p className="text-muted-foreground mt-0.5">
              Review and manage student applications.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={togglePublish}
              disabled={publishing}
              variant={isOpen ? "outline" : "default"}
              className={isOpen ? "border-green-300 text-green-700 hover:bg-green-50" : ""}
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isOpen ? (
                <Lock className="h-4 w-4 mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {isOpen ? "Close Applications" : "Publish Now"}
            </Button>
            <span className={`text-xs font-medium ${isOpen ? "text-green-600" : "text-muted-foreground"}`}>
              {isOpen ? "Applications are LIVE" : "Applications are closed"}
            </span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FILTER_TABS.map((tab) => {
            const cfg = STATUS_CONFIG[tab.value] || { badgeClass: "bg-gray-50 text-gray-700 border-gray-200", icon: ClipboardList };
            const Icon = cfg.icon || ClipboardList;
            const count = counts[tab.value as keyof typeof counts] ?? 0;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  statusFilter === tab.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tab.label}</p>
              </button>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                statusFilter === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-gray-700"
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                  statusFilter === tab.value ? "bg-primary text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {counts[tab.value as keyof typeof counts] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No applications found</p>
                <p className="text-sm mt-1">
                  {statusFilter !== "all"
                    ? `No applications with status "${STATUS_CONFIG[statusFilter]?.label || statusFilter}".`
                    : "No applications have been submitted yet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="font-semibold">Applicant</TableHead>
                    <TableHead className="font-semibold">Program</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Quick Actions</TableHead>
                    <TableHead className="font-semibold text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.map((app) => {
                    const nextStatus = getNextStatus(app.status);
                    return (
                      <TableRow
                        key={app.id}
                        className="hover:bg-gray-50/50 cursor-pointer"
                        onClick={() => setSelectedApp(app)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                              {(app.applicantName || "?")[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-sm text-gray-900">
                              {app.applicantName || "Unknown"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {app.programName || "General Admission"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={app.status} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {nextStatus && app.status !== "approved" && app.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleStatusChange(app.id, nextStatus)}
                                disabled={updateStatus.isPending}
                              >
                                {updateStatus.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 mr-1" />
                                )}
                                {STATUS_CONFIG[nextStatus]?.label}
                              </Button>
                            )}
                            {app.status !== "approved" && app.status !== "rejected" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleStatusChange(app.id, "rejected")}
                                disabled={updateStatus.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setSelectedApp(app)}
                          >
                            View
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Panel */}
      <ApplicationDetailPanel
        app={selectedApp}
        open={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        onStatusChange={handleStatusChange}
        updating={updateStatus.isPending}
      />
    </AdminLayout>
  );
}
