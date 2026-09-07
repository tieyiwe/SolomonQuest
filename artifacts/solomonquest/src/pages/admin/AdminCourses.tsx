import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { StudentDetailDialog } from "@/components/StudentDetailDialog";
import {
  useListCourses,
  useCreateCourse,
  useUpdateCourse,
  useDeleteCourse,
  useListUsers,
  useListPrograms,
  getListCoursesQueryKey,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Users,
  GraduationCap,
  UserPlus,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Course } from "@workspace/api-client-react";
import { generateSemesterOptions, CUSTOM_SEMESTER_VALUE } from "@/lib/semesters";

interface CourseFormData {
  title: string;
  code: string;
  term: string;
  termStartDate: string;
  termEndDate: string;
  description: string;
  teacherId: string;
  programId: string;
  isPublished: boolean;
  isLive: boolean;
  classDate: string;
  classEndTime: string;
}

const defaultForm: CourseFormData = {
  title: "",
  code: "",
  term: "",
  termStartDate: "",
  termEndDate: "",
  description: "",
  teacherId: "",
  programId: "",
  isPublished: false,
  isLive: false,
  classDate: "",
  classEndTime: "",
};

async function apiFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers ?? {}),
    },
  });
}

interface TuitionPlan {
  id: string;
  amountCents: number;
  allowFullPayment: boolean;
  allowInstallments: boolean;
  installmentCount: number;
}

function TuitionTab({ courseId }: { courseId: string }) {
  const [amount, setAmount] = useState("");
  const [allowFull, setAllowFull] = useState(true);
  const [allowInstallments, setAllowInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("2");
  const [existingPlanId, setExistingPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/tuition-plans?courseId=${courseId}`)
      .then((r) => r.json())
      .then((plans: TuitionPlan[]) => {
        const plan = plans?.[0];
        if (plan) {
          setExistingPlanId(plan.id);
          setAmount((plan.amountCents / 100).toFixed(2));
          setAllowFull(plan.allowFullPayment);
          setAllowInstallments(plan.allowInstallments);
          setInstallmentCount(String(plan.installmentCount));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  const handleSave = async () => {
    if (!amount.trim() || parseFloat(amount) < 0) {
      toast.error("Enter a valid tuition amount");
      return;
    }
    if (!allowFull && !allowInstallments) {
      toast.error("Enable at least one payment option");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/tuition-plans", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          amountCents: Math.round(parseFloat(amount) * 100),
          allowFullPayment: allowFull,
          allowInstallments,
          installmentCount: parseInt(installmentCount, 10) || 2,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save tuition");
      }
      const data = await res.json();
      setExistingPlanId(data.id);
      toast.success("Tuition saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save tuition");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Set the tuition for this course. Students see this at the end of enrollment — this isn't a required condition
        yet, so applications aren't blocked on payment while this is being tested.
      </p>
      <div className="space-y-1.5">
        <Label>Tuition Amount (USD)</Label>
        <Input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Allow Full Payment</p>
          <p className="text-xs text-muted-foreground">Pay the full tuition in one payment</p>
        </div>
        <Switch checked={allowFull} onCheckedChange={setAllowFull} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Allow Installments</p>
          <p className="text-xs text-muted-foreground">Split tuition into multiple partial payments</p>
        </div>
        <Switch checked={allowInstallments} onCheckedChange={setAllowInstallments} />
      </div>
      {allowInstallments && (
        <div className="space-y-1.5 pl-3 border-l-2">
          <Label>Number of Installments</Label>
          <Input
            type="number"
            min="2"
            value={installmentCount}
            onChange={(e) => setInstallmentCount(e.target.value)}
            className="max-w-[120px]"
          />
        </div>
      )}
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {existingPlanId ? "Update Tuition" : "Save Tuition"}
      </Button>
    </div>
  );
}

interface RosterStudent {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

function CourseRosterTab({ courseId }: { courseId: string }) {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewStudentId, setViewStudentId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/courses/${courseId}/students`)
      .then((r) => r.json())
      .then((data) => setStudents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>;

  return (
    <div>
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students enrolled in this course yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {students.map((s) => (
            <li key={s.id}>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                onClick={() => setViewStudentId(s.id)}
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                  {`${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase() || "S"}
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {s.firstName} {s.lastName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <StudentDetailDialog
        studentId={viewStudentId}
        open={!!viewStudentId}
        onOpenChange={(v) => { if (!v) setViewStudentId(null); }}
      />
    </div>
  );
}

async function updateLiveSettings(
  courseId: string,
  payload: { is_live: boolean; class_date?: string; class_end_time?: string }
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`/api/courses/${courseId}/live-settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Failed to update live settings");
  }
  return res.json();
}

function CourseFormDialog({
  mode,
  course,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  course?: Course;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const { data: teachers } = useListUsers({ role: "teacher" });
  const { data: programs } = useListPrograms();

  const semesterOptions = generateSemesterOptions(new Date().getFullYear());

  const [form, setForm] = useState<CourseFormData>(() =>
    course
      ? {
          title: course.title || "",
          code: course.code || "",
          term: course.term || "",
          termStartDate: (course as any).termStartDate || "",
          termEndDate: (course as any).termEndDate || "",
          description: course.description || "",
          teacherId: course.teacherId || "",
          programId: (course as any).programId || "",
          isPublished: course.isPublished || false,
          isLive: (course as any).isLive || false,
          classDate: (course as any).classDate || "",
          classEndTime: (course as any).classEndTime || "",
        }
      : defaultForm
  );
  const [isSaving, setIsSaving] = useState(false);

  // A course's term matches a standard option only if its label AND dates
  // line up exactly; otherwise it was a custom term (or has no dates yet).
  const matchingStandard = semesterOptions.find(
    (o) => o.label === form.term && o.startDate === form.termStartDate && o.endDate === form.termEndDate
  );
  const [semesterChoice, setSemesterChoice] = useState<string>(
    form.term ? (matchingStandard ? matchingStandard.value : CUSTOM_SEMESTER_VALUE) : ""
  );

  const set = (key: keyof CourseFormData, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSemesterChoice = (value: string) => {
    setSemesterChoice(value);
    if (value === CUSTOM_SEMESTER_VALUE) {
      return;
    }
    const option = semesterOptions.find((o) => o.value === value);
    if (option) {
      setForm((f) => ({
        ...f,
        term: option.label,
        termStartDate: option.startDate,
        termEndDate: option.endDate,
      }));
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("Course title is required");
      return;
    }

    const corePayload = {
      title: form.title,
      code: form.code || undefined,
      term: form.term || undefined,
      termStartDate: form.termStartDate || undefined,
      termEndDate: form.termEndDate || undefined,
      description: form.description || undefined,
      teacherId: form.teacherId || undefined,
      programId: form.programId || undefined,
      isPublished: form.isPublished,
      isLive: form.isLive,
      classDate: form.isLive && form.classDate ? form.classDate : undefined,
      classEndTime: form.isLive && form.classEndTime ? form.classEndTime : undefined,
    };

    if (mode === "create") {
      createCourse.mutate(
        { data: corePayload },
        {
          onSuccess: () => {
            toast.success("Course created");
            queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
            onOpenChange(false);
            setForm(defaultForm);
          },
          onError: (err: any) => toast.error(err.message || "Failed to create course"),
        }
      );
    } else if (course) {
      setIsSaving(true);
      try {
        await new Promise<void>((resolve, reject) => {
          updateCourse.mutate(
            { id: course.id, data: corePayload },
            {
              onSuccess: () => resolve(),
              onError: (err: any) => reject(err),
            }
          );
        });
        await updateLiveSettings(course.id, {
          is_live: form.isLive,
          class_date: form.isLive && form.classDate ? form.classDate : undefined,
          class_end_time: form.isLive && form.classEndTime ? form.classEndTime : undefined,
        });
        toast.success("Course updated");
        queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
        onOpenChange(false);
      } catch (err: any) {
        toast.error(err.message || "Failed to update course");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const isPending = createCourse.isPending || updateCourse.isPending || isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create New Course" : "Edit Course"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Course Title *</Label>
            <Input
              placeholder="Introduction to Mathematics"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief description of the course..."
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Course Code</Label>
            <Input
              placeholder="MATH101"
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Semester / Term</Label>
            <Select value={semesterChoice} onValueChange={handleSemesterChoice}>
              <SelectTrigger>
                <SelectValue placeholder="Select a semester..." />
              </SelectTrigger>
              <SelectContent>
                {semesterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_SEMESTER_VALUE}>Custom…</SelectItem>
              </SelectContent>
            </Select>
            {semesterChoice === CUSTOM_SEMESTER_VALUE && (
              <div className="space-y-1.5 pt-1">
                <Input
                  placeholder="Custom term name, e.g. Trimester 1 2026"
                  value={form.term}
                  onChange={(e) => set("term", e.target.value)}
                />
              </div>
            )}
            {semesterChoice && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Start Date</Label>
                  <Input
                    type="date"
                    value={form.termStartDate}
                    onChange={(e) => set("termStartDate", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">End Date</Label>
                  <Input
                    type="date"
                    value={form.termEndDate}
                    onChange={(e) => set("termEndDate", e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Assign Teacher</Label>
            <Select value={form.teacherId} onValueChange={(v) => set("teacherId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a teacher..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No teacher assigned</SelectItem>
                {(teachers ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.firstName} {t.lastName} {t.email ? `(${t.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Program</Label>
            <Select value={form.programId} onValueChange={(v) => set("programId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="No program — standalone course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No program — standalone course</SelectItem>
                {(programs ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Students enrolled in any course of this program are automatically enrolled in all
              of its other courses and can chat with everyone in the program.
            </p>
          </div>

          {/* Live Class Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Live Class</p>
              <p className="text-xs text-muted-foreground">
                Enable to schedule a live session for this course
              </p>
            </div>
            <Switch
              checked={form.isLive}
              onCheckedChange={(v) => set("isLive", v)}
            />
          </div>

          {/* Live Class Date/Time (conditional) */}
          {form.isLive && (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <div className="space-y-1.5">
                <Label>Class Date &amp; Time</Label>
                <Input
                  type="datetime-local"
                  value={form.classDate}
                  onChange={(e) => set("classDate", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  type="datetime-local"
                  value={form.classEndTime}
                  onChange={(e) => set("classEndTime", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="text-xs text-muted-foreground">
                Students can only see published courses
              </p>
            </div>
            <Switch
              checked={form.isPublished}
              onCheckedChange={(v) => set("isPublished", v)}
            />
          </div>

          {mode === "edit" && course && (
            <>
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-semibold">Enrolled Students</Label>
                <CourseRosterTab courseId={course.id} />
              </div>
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-semibold">Tuition</Label>
                <TuitionTab courseId={course.id} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Course" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteTeacherDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: email.trim(), role: "teacher" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to send invitation");
      }
      toast.success(`Invitation sent to ${email.trim()}`);
      setEmail("");
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
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Teacher
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite Teacher</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Enter the teacher's email address. They'll receive an invitation link to join your school.
          </p>
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="teacher@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleInvite} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCourses() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);

  const { data: courses, isLoading } = useListCourses();
  const { data: programs } = useListPrograms();
  const deleteCourse = useDeleteCourse();

  const programNameById = (programs ?? []).reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.name;
    return acc;
  }, {});

  const filtered = (courses ?? []).filter((c) =>
    `${c.title} ${c.code} ${c.teacherName}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: string, title: string) => {
    deleteCourse.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(`"${title}" deleted`);
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to delete course"),
      }
    );
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Course Management</h1>
            <p className="text-muted-foreground mt-0.5">
              Create, edit and manage all school courses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <InviteTeacherDialog />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Course
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0 divide-y">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 mb-1.5" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No courses found</p>
                <p className="text-sm mt-1">
                  {search ? "Try a different search." : "Create your first course to get started."}
                </p>
                {!search && (
                  <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Create Course
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="font-semibold">Course</TableHead>
                    <TableHead className="font-semibold">Teacher</TableHead>
                    <TableHead className="font-semibold">Code & Term</TableHead>
                    <TableHead className="font-semibold">Students</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((course) => {
                    const isLive = !!(course as any).isLive;
                    return (
                      <TableRow key={course.id} className="hover:bg-gray-50/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                              <BookOpen className="h-4 w-4 text-violet-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-gray-900 text-sm">{course.title}</p>
                                {(course as any).programId && programNameById[(course as any).programId] && (
                                  <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 border text-xs">
                                    {programNameById[(course as any).programId]}
                                  </Badge>
                                )}
                                {isLive ? (
                                  <Badge className="bg-red-100 text-red-700 border-red-200 border text-xs gap-1">
                                    <Radio className="h-3 w-3" />
                                    Live
                                  </Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-500 border-gray-200 border text-xs">
                                    Non-Live
                                  </Badge>
                                )}
                              </div>
                              {course.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                  {course.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {course.teacherName ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{course.teacherName}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {course.code && (
                              <Badge variant="outline" className="text-xs font-mono">
                                {course.code}
                              </Badge>
                            )}
                            {course.term && (
                              <span className="text-xs text-muted-foreground">{course.term}</span>
                            )}
                            {!course.code && !course.term && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <GraduationCap className="h-3.5 w-3.5" />
                            <span>{course.studentCount ?? 0}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              course.isPublished
                                ? "bg-green-100 text-green-700 border-green-200 border"
                                : "bg-gray-100 text-gray-600 border-gray-200 border"
                            }
                          >
                            {course.isPublished ? "Published" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setEditCourse(course)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                  disabled={deleteCourse.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Course?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete{" "}
                                    <strong>{course.title}</strong>? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 hover:bg-red-700"
                                    onClick={() => handleDelete(course.id, course.title)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
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

      {/* Create Dialog */}
      <CourseFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Edit Dialog */}
      {editCourse && (
        <CourseFormDialog
          mode="edit"
          course={editCourse}
          open={!!editCourse}
          onOpenChange={(v) => {
            if (!v) setEditCourse(null);
          }}
        />
      )}
    </AdminLayout>
  );
}
