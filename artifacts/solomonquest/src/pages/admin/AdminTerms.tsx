import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ArrowLeft, CalendarRange, Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "active" | "completed" | "archived";
  createdAt: string;
}

interface TermCourse {
  id: string;
  title: string;
  code: string | null;
  isPublished: boolean;
  teacherId: string | null;
  teacherName: string | null;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...(options.headers ?? {}),
    },
  });
}

const statusStyles: Record<Term["status"], string> = {
  upcoming: "bg-blue-100 text-blue-700 border-blue-200",
  active: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-gray-100 text-gray-600 border-gray-200",
  archived: "bg-gray-100 text-gray-400 border-gray-200",
};

interface TermFormData {
  name: string;
  startDate: string;
  endDate: string;
  status: Term["status"];
}

const defaultForm: TermFormData = { name: "", startDate: "", endDate: "", status: "upcoming" };

function TermFormDialog({
  term,
  open,
  onOpenChange,
  onSaved,
}: {
  term: Term | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TermFormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (term) {
      setForm({ name: term.name, startDate: term.startDate, endDate: term.endDate, status: term.status });
    } else {
      setForm(defaultForm);
    }
  }, [term, open]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      toast.error("Name, start date, and end date are required");
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      toast.error("End date cannot be before start date");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(term ? `/api/terms/${term.id}` : "/api/terms", {
        method: term ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save term");
      }
      toast.success(term ? "Term updated" : "Term created");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save term");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{term ? "Edit Term" : "New Term"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Fall 2025, Quarter 1, Trimester 2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Term["status"] }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {term ? "Save Changes" : "Create Term"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TermScheduleDialog({ term }: { term: Term }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<TermCourse[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch(`/api/terms/${term.id}/courses`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setCourses)
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [open, term.id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View schedule">
          <Users className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{term.name} — Schedule</DialogTitle>
        </DialogHeader>
        <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : !courses || courses.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No classes scheduled in this term yet.</p>
          ) : (
            courses.map((c) => (
              <div key={c.id} className="p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{c.title}</p>
                  {c.code && <p className="text-xs text-muted-foreground font-mono">{c.code}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm">{c.teacherName ?? <span className="text-muted-foreground italic">Unassigned</span>}</p>
                  <Badge variant="outline" className="text-xs mt-0.5">
                    {c.isPublished ? "Published" : "Draft"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTerms() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTerm, setEditTerm] = useState<Term | null>(null);

  const fetchTerms = () => {
    setIsLoading(true);
    apiFetch("/api/terms")
      .then((res) => (res.ok ? res.json() : []))
      .then(setTerms)
      .finally(() => setIsLoading(false));
  };

  useEffect(fetchTerms, []);

  const handleDelete = async (id: string) => {
    const res = await apiFetch(`/api/terms/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete term");
      return;
    }
    toast.success("Term deleted");
    fetchTerms();
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <CalendarRange className="h-6 w-6" />
              Terms & Scheduling
            </h1>
            <p className="text-muted-foreground mt-0.5">
              Define quarters, semesters, or any other cycle, then schedule classes and teachers within them.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditTerm(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Term
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : terms.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No terms yet. Create one to start scheduling classes for a period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="font-semibold">Name</TableHead>
                    <TableHead className="font-semibold">Dates</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((term) => (
                    <TableRow key={term.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-medium text-sm">{term.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(term.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        {" – "}
                        {new Date(term.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>
                      <TableCell>
                        <Badge className={`border text-xs ${statusStyles[term.status]}`}>{term.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <TermScheduleDialog term={term} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditTerm(term);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{term.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Classes scheduled in this term won't be deleted — they'll just no longer be linked to a term.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(term.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <TermFormDialog term={editTerm} open={formOpen} onOpenChange={setFormOpen} onSaved={fetchTerms} />
    </AdminLayout>
  );
}
