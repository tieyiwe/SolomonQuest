import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import {
  useGetMyCourses,
  useListAssignments,
  useGetCourseStudents,
  useListSubmissions,
  useGradeSubmission,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  BookOpen,
  ClipboardList,
  Users,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Download,
  CheckCircle2,
  Clock,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CellSelection {
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  pointsPossible: number | null;
  submissionId: string | null;
  currentGrade: number | null;
  currentFeedback: string | null;
  content: string | null;
  fileUrl: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "S";
}

function gradeColor(pct: number | null) {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 90) return "text-green-600 font-semibold";
  if (pct >= 70) return "text-blue-600 font-semibold";
  if (pct >= 60) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function calcAverage(grades: (number | null)[], maxPoints: (number | null)[]): number | null {
  const valid = grades
    .map((g, i) => (g != null && maxPoints[i] ? (g / maxPoints[i]!) * 100 : null))
    .filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function exportCSV(
  students: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }[],
  assignments: { id: string; title: string; pointsPossible?: number | null }[],
  submissionMap: Record<string, Record<string, { grade: number | null }>>
) {
  const headers = ["Student", "Email", ...assignments.map((a) => a.title), "Average (%)"];
  const rows = students.map((s) => {
    const grades = assignments.map((a) => submissionMap[s.id]?.[a.id]?.grade ?? null);
    const avg = calcAverage(
      grades,
      assignments.map((a) => a.pointsPossible ?? null)
    );
    return [
      `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      s.email || "",
      ...grades.map((g, i) => {
        const max = assignments[i].pointsPossible;
        if (g == null) return "";
        if (max) return `${g}/${max}`;
        return String(g);
      }),
      avg != null ? `${avg}%` : "",
    ];
  });

  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gradebook.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Side Panel ────────────────────────────────────────────────────────────────

function GradingPanel({
  selection,
  onClose,
  onSaved,
}: {
  selection: CellSelection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [grade, setGrade] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [converting, setConverting] = useState(false);
  const gradeSubmission = useGradeSubmission();

  const convertPdfToDocx = async () => {
    if (!selection?.fileUrl) return;
    setConverting(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const pdfResp = await fetch(selection.fileUrl);
      if (!pdfResp.ok) throw new Error("Could not fetch PDF file");
      const pdfBlob = await pdfResp.blob();
      const filename = selection.fileUrl.split("/").pop() || "submission.pdf";
      const formData = new FormData();
      formData.append("file", pdfBlob, filename);
      const resp = await fetch("/api/convert/pdf-to-docx", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Conversion failed");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(/\.pdf$/i, ".docx");
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Converted! Download started.");
    } catch (err: any) {
      toast.error(err.message || "Failed to convert PDF");
    } finally {
      setConverting(false);
    }
  };

  // Reset grade/feedback whenever the selected submission changes
  useEffect(() => {
    setGrade(selection?.currentGrade != null ? String(selection.currentGrade) : "");
    setFeedback(selection?.currentFeedback || "");
  }, [selection?.submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (!selection?.submissionId) {
      toast.error("No submission to grade");
      return;
    }
    const numGrade = parseFloat(grade);
    if (isNaN(numGrade)) {
      toast.error("Enter a valid grade");
      return;
    }
    gradeSubmission.mutate(
      { id: selection.submissionId, data: { grade: numGrade, feedback } },
      {
        onSuccess: () => {
          toast.success("Grade saved");
          onSaved();
        },
        onError: () => toast.error("Failed to save grade"),
      }
    );
  };

  const pct =
    grade !== "" && selection?.pointsPossible
      ? Math.round((parseFloat(grade) / selection.pointsPossible) * 100)
      : null;

  return (
    <Sheet open={!!selection} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-base leading-tight">
                {selection?.assignmentTitle}
              </SheetTitle>
              <SheetDescription className="mt-0.5">
                {selection?.studentName}
                {selection?.pointsPossible != null && (
                  <span className="ml-2 text-xs">({selection.pointsPossible} pts possible)</span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Submission content */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Submission
            </Label>
            {selection?.content ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {selection.content}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <FileText className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {selection?.submissionId ? "No text content available" : "No submission yet"}
                </p>
              </div>
            )}
            {selection?.fileUrl && /\.pdf$/i.test(selection.fileUrl) && (
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={selection.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <FileText className="h-3.5 w-3.5" /> View PDF
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={convertPdfToDocx}
                  disabled={converting}
                  className="ml-auto text-xs h-7 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  {converting ? "Converting…" : "Convert to Word"}
                </Button>
              </div>
            )}
          </div>

          {/* Grade input */}
          <div className="space-y-2">
            <Label htmlFor="grade-input" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Grade
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="grade-input"
                type="number"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="0"
                className="w-24"
                min={0}
                max={selection?.pointsPossible ?? undefined}
                disabled={!selection?.submissionId}
              />
              {selection?.pointsPossible != null && (
                <span className="text-sm text-muted-foreground">/ {selection.pointsPossible}</span>
              )}
              {pct != null && (
                <span className={cn("text-sm ml-auto", gradeColor(pct))}>{pct}%</span>
              )}
            </div>
          </div>

          {/* Feedback */}
          <div className="space-y-2">
            <Label htmlFor="feedback-input" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Feedback
            </Label>
            <Textarea
              id="feedback-input"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Write feedback for the student..."
              rows={5}
              disabled={!selection?.submissionId}
            />
          </div>
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <Button
            onClick={handleSave}
            disabled={!selection?.submissionId || grade === "" || gradeSubmission.isPending}
            className="flex-1"
          >
            {gradeSubmission.isPending ? "Saving..." : "Save Grade"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Gradebook Table ───────────────────────────────────────────────────────────

function CourseGradebook({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { data: students, isLoading: isLoadingStudents } = useGetCourseStudents(courseId, {
    query: { enabled: !!courseId },
  });
  const { data: assignments, isLoading: isLoadingAssignments } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });

  // Fetch submissions for all assignments
  // We store a map: assignmentId -> submissionId -> submission
  // For simplicity, fetch submissions per assignment lazily via a per-assignment hook list
  // Since hooks can't be called conditionally in a loop, we'll use a single "all submissions" approach
  // by fetching the first assignment and iterating. The existing API only exposes per-assignment.
  // We'll accumulate submission data keyed by [studentId][assignmentId].
  const [submissionCache, setSubmissionCache] = useState<
    Record<string, Record<string, { id: string; grade: number | null; feedback: string | null; content: string | null; fileUrl: string | null; status: string }>>
  >({});

  const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);
  const [loadedAssignments, setLoadedAssignments] = useState<Set<string>>(new Set());

  // Fetch submissions for all assignments on mount once assignments load
  // We use useListSubmissions per-assignment by rendering a hidden fetcher component
  const gradeSubmission = useGradeSubmission();

  const handleCellClick = useCallback(
    (
      studentId: string,
      studentName: string,
      assignment: { id: string; title: string; pointsPossible?: number | null }
    ) => {
      const sub = submissionCache[studentId]?.[assignment.id];
      setSelectedCell({
        studentId,
        studentName,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        pointsPossible: assignment.pointsPossible ?? null,
        submissionId: sub?.id ?? null,
        currentGrade: sub?.grade ?? null,
        currentFeedback: sub?.feedback ?? null,
        content: sub?.content ?? null,
        fileUrl: sub?.fileUrl ?? null,
      });
    },
    [submissionCache]
  );

  const handleGradeSaved = useCallback(() => {
    // Optimistic update will be handled by react-query invalidation
  }, []);

  if (isLoadingStudents || isLoadingAssignments) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const assignmentList = assignments || [];
  const studentList = students || [];

  // Build submission map from cache
  const handleExportCSV = () => {
    exportCSV(
      studentList,
      assignmentList,
      Object.fromEntries(
        Object.entries(submissionCache).map(([sid, amap]) => [
          sid,
          Object.fromEntries(Object.entries(amap).map(([aid, sub]) => [aid, { grade: sub.grade }])),
        ])
      )
    );
  };

  return (
    <>
      {/* Submission fetchers (invisible) */}
      {assignmentList.map((a) => (
        <SubmissionFetcher
          key={a.id}
          assignmentId={a.id}
          onData={(subs) => {
            setSubmissionCache((prev) => {
              const next = { ...prev };
              for (const sub of subs) {
                if (!next[sub.studentId]) next[sub.studentId] = {};
                next[sub.studentId][a.id] = {
                  id: sub.id,
                  grade: sub.grade ?? null,
                  feedback: (sub as any).feedback ?? null,
                  content: (sub as any).content ?? null,
                  fileUrl: (sub as any).fileUrl ?? (sub as any).file_url ?? null,
                  status: sub.status,
                };
              }
              return next;
            });
          }}
        />
      ))}

      <GradingPanel
        selection={selectedCell}
        onClose={() => setSelectedCell(null)}
        onSaved={handleGradeSaved}
      />

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {studentList.length} student{studentList.length !== 1 ? "s" : ""} •{" "}
            {assignmentList.length} assignment{assignmentList.length !== 1 ? "s" : ""}
          </p>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>

        {/* Table */}
        {studentList.length === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-lg">
            <Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[180px] sticky left-0 bg-muted/30 z-10">
                    Student
                  </TableHead>
                  {assignmentList.map((a) => (
                    <TableHead key={a.id} className="min-w-[130px] text-center text-xs">
                      <div className="font-medium line-clamp-2">{a.title}</div>
                      {a.pointsPossible != null && (
                        <div className="text-muted-foreground font-normal">{a.pointsPossible} pts</div>
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[90px] text-center text-xs font-semibold">
                    Average
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentList.map((student) => {
                  const studentSubs = submissionCache[student.id] || {};
                  const grades = assignmentList.map((a) => studentSubs[a.id]?.grade ?? null);
                  const avg = calcAverage(
                    grades,
                    assignmentList.map((a) => a.pointsPossible ?? null)
                  );

                  return (
                    <TableRow key={student.id} className="hover:bg-muted/10">
                      <TableCell className="sticky left-0 bg-background z-10 border-r">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={(student as any).avatarUrl || ""} />
                            <AvatarFallback className="text-xs">
                              {getInitials(student.firstName, student.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium whitespace-nowrap">
                            {student.firstName} {student.lastName}
                          </span>
                        </div>
                      </TableCell>

                      {assignmentList.map((a) => {
                        const sub = studentSubs[a.id];
                        const graded = sub?.grade != null;
                        const pct =
                          graded && a.pointsPossible
                            ? Math.round((sub.grade! / a.pointsPossible) * 100)
                            : null;

                        return (
                          <TableCell
                            key={a.id}
                            className="text-center cursor-pointer hover:bg-primary/5 transition-colors"
                            onClick={() =>
                              handleCellClick(
                                student.id,
                                `${student.firstName || ""} ${student.lastName || ""}`.trim(),
                                a
                              )
                            }
                          >
                            {graded ? (
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <span className={cn("text-sm", gradeColor(pct))}>
                                  {sub!.grade}/{a.pointsPossible ?? "?"}
                                </span>
                                {pct != null && (
                                  <span className={cn("text-xs", gradeColor(pct))}>{pct}%</span>
                                )}
                              </div>
                            ) : sub ? (
                              <Badge variant="secondary" className="text-xs">
                                <Clock className="h-2.5 w-2.5 mr-1" />
                                Pending
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}

                      <TableCell className="text-center border-l">
                        {avg != null ? (
                          <span className={cn("text-sm font-semibold", gradeColor(avg))}>{avg}%</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Click any grade cell to open the grading panel.</span>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" /> Graded
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/40" /> Pending
          </div>
        </div>
      </div>
    </>
  );
}

// Tiny helper component that fetches submissions for one assignment and calls onData
function SubmissionFetcher({
  assignmentId,
  onData,
}: {
  assignmentId: string;
  onData: (subs: any[]) => void;
}) {
  const { data } = useListSubmissions(assignmentId, {
    query: {
      enabled: !!assignmentId,
    },
  });

  // Call onData whenever data arrives — use a ref so this doesn't trigger re-renders
  const calledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const key = assignmentId + data.length;
    if (calledKeyRef.current !== key) {
      calledKeyRef.current = key;
      onData(data);
    }
  }, [assignmentId, data, onData]);

  return null;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TeacherGradebook() {
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const selectedCourse = courses?.find((c) => c.id === selectedCourseId);

  return (
    <TeacherLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/teacher">
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
            <h1 className="text-2xl font-bold tracking-tight">Gradebook</h1>
            <p className="text-muted-foreground mt-1">
              View and manage student grades across all your courses.
            </p>
          </div>
        </div>

        {isCoursesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : courses && courses.length > 0 ? (
          <div className="space-y-6">
            {/* Course selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium whitespace-nowrap">Course:</label>
              <Select
                value={selectedCourseId || ""}
                onValueChange={(v) => setSelectedCourseId(v || null)}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                      {c.code ? ` (${c.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Course cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() =>
                    setSelectedCourseId(selectedCourseId === course.id ? null : course.id)
                  }
                  className={cn(
                    "text-left rounded-xl border p-4 transition-all hover:shadow-sm",
                    selectedCourseId === course.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 bg-card"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        selectedCourseId === course.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10"
                      )}
                    >
                      <ClipboardList
                        className={cn(
                          "h-4 w-4",
                          selectedCourseId === course.id ? "text-primary-foreground" : "text-primary"
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm line-clamp-1">{course.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {course.code}
                        {course.term ? ` • ${course.term}` : ""}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {(course as any).studentCount || 0} students
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Gradebook panel */}
            {selectedCourseId ? (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        {selectedCourse?.title}
                      </CardTitle>
                      <CardDescription>
                        {selectedCourse?.code}
                        {selectedCourse?.term ? ` • ${selectedCourse.term}` : ""}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/teacher/courses/${selectedCourseId}`}>
                        Course Detail
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  <CourseGradebook
                    courseId={selectedCourseId}
                    courseTitle={selectedCourse?.title || ""}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-base font-medium mb-1">Select a course to view grades</p>
                  <p className="text-sm text-muted-foreground">
                    Pick a course above or use the dropdown.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="text-center py-16">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No courses assigned</h3>
              <p className="text-sm text-muted-foreground">
                You are not assigned to any courses yet. Contact your administrator.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherLayout>
  );
}
