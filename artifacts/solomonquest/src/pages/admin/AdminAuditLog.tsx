import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, History, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown> | null;
  performedBy: string | null;
  performerName: string;
  performerRole: string;
  createdAt: string;
}

const PAGE_SIZE = 50;

async function apiFetch(path: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
}

function actionLabel(action: string) {
  return action
    .split(".")
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionBadgeClass(action: string) {
  if (action.includes("delete") || action.includes("danger")) return "bg-red-100 text-red-700 border-red-200";
  if (action.includes("password") || action.includes("role")) return "bg-amber-100 text-amber-700 border-amber-200";
  if (action.includes("invitation")) return "bg-blue-100 text-blue-700 border-blue-200";
  if (action.includes("login") || action.includes("logout")) return "bg-gray-100 text-gray-600 border-gray-200";
  return "bg-violet-100 text-violet-700 border-violet-200";
}

export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorSearch, setActorSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    apiFetch("/api/activity-log/actions")
      .then((res) => (res.ok ? res.json() : []))
      .then(setActions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (fromDate) params.set("from", new Date(fromDate).toISOString());
    if (toDate) params.set("to", new Date(toDate + "T23:59:59").toISOString());

    apiFetch(`/api/activity-log?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { entries: [], total: 0 }))
      .then((data) => {
        setEntries(data.entries ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setIsLoading(false));
  }, [page, actionFilter, fromDate, toDate]);

  // Actor name search is applied client-side against the current page —
  // the backend doesn't index performer names, only ids.
  const visibleEntries = actorSearch.trim()
    ? entries.filter((e) => e.performerName.toLowerCase().includes(actorSearch.trim().toLowerCase()))
    : entries;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <History className="h-6 w-6" />
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-0.5">
            Who did what and when — role changes, invitations, password resets, and other admin actions.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Action</label>
            <Select
              value={actionFilter}
              onValueChange={(v) => {
                setActionFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {actionLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Actor name</label>
            <Input
              className="w-[200px]"
              placeholder="Search by name…"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input
              type="date"
              className="w-[160px]"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input
              type="date"
              className="w-[160px]"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
            />
          </div>
          {(actionFilter !== "all" || actorSearch || fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionFilter("all");
                setActorSearch("");
                setFromDate("");
                setToDate("");
                setPage(0);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : visibleEntries.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">No matching activity found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="font-semibold">Action</TableHead>
                    <TableHead className="font-semibold">Target</TableHead>
                    <TableHead className="font-semibold">Performed By</TableHead>
                    <TableHead className="font-semibold">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEntries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-gray-50/50">
                      <TableCell>
                        <Badge className={`border text-xs ${actionBadgeClass(entry.action)}`}>
                          {actionLabel(entry.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.targetName ?? entry.targetId ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.performerName}
                        {entry.performerRole && (
                          <span className="text-xs text-muted-foreground ml-1.5 capitalize">
                            ({entry.performerRole.replace("_", " ")})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {!isLoading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} — {total} total entries
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
