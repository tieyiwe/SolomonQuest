import { useState, useEffect } from "react";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, Bell, Loader2, Trash2, Search } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

interface Reminder {
  id: string;
  targetUserId: string | null;
  targetUserName: string | null;
  targetRole: string | null;
  courseId: string | null;
  courseName: string | null;
  message: string;
  sendAt: string;
  sent: boolean;
  type: string;
  createdAt: string;
}

interface CourseOption {
  id: string;
  name: string;
}

interface StudentOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? ""}`,
  };
}

export default function TeacherReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(true);

  // Form state
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [targetType, setTargetType] = useState<"all" | "specific">("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchReminders = async () => {
    setLoadingReminders(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/reminders", { headers });
      if (!res.ok) throw new Error("Failed to load reminders");
      const data = await res.json();
      setReminders(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load reminders");
    } finally {
      setLoadingReminders(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/courses", { headers });
      if (!res.ok) return;
      const data = await res.json();
      setCourses(data.map((c: any) => ({ id: c.id, name: c.name })));
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchReminders();
    fetchCourses();
  }, []);

  useEffect(() => {
    if (targetType === "specific" && selectedCourseId && studentSearch.trim().length >= 1) {
      const timeout = setTimeout(async () => {
        setLoadingStudents(true);
        try {
          const headers = await getAuthHeaders();
          const res = await fetch(`/api/users?role=student`, { headers });
          if (!res.ok) throw new Error();
          const data = await res.json();
          const q = studentSearch.toLowerCase();
          const filtered = data.filter((u: any) => {
            const name = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email ?? ""}`.toLowerCase();
            return name.includes(q);
          });
          setStudents(filtered.slice(0, 10));
        } catch {
          setStudents([]);
        } finally {
          setLoadingStudents(false);
        }
      }, 300);
      return () => clearTimeout(timeout);
    } else {
      setStudents([]);
    }
  }, [studentSearch, targetType, selectedCourseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCourseId) {
      toast.error("Please select a course");
      return;
    }
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    if (!sendAt) {
      toast.error("Send date/time is required");
      return;
    }
    if (new Date(sendAt) <= new Date()) {
      toast.error("Send time must be in the future");
      return;
    }
    if (targetType === "specific" && !selectedStudentId) {
      toast.error("Please select a student");
      return;
    }

    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, any> = {
        course_id: selectedCourseId,
        message: message.trim(),
        send_at: new Date(sendAt).toISOString(),
        type: "teacher_to_student",
      };

      if (targetType === "all") {
        body.target_role = "student";
      } else {
        body.target_user_id = selectedStudentId;
      }

      const res = await fetch("/api/reminders", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create reminder");
      }

      toast.success("Reminder scheduled");
      setMessage("");
      setSendAt("");
      setStudentSearch("");
      setSelectedStudentId(null);
      setSelectedCourseId("");
      setTargetType("all");
      await fetchReminders();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule reminder");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/reminders/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete reminder");
      toast.success("Reminder deleted");
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete reminder");
    }
  };

  const formatTarget = (r: Reminder) => {
    if (r.targetUserName) return r.targetUserName;
    if (r.targetRole === "student") return "All Students in Course";
    return r.targetRole ?? "Unknown";
  };

  const minDateTime = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reminders</h1>
          <p className="text-muted-foreground mt-0.5">
            Schedule reminders to students in your courses.
          </p>
        </div>

        {/* Schedule Reminder Form */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Schedule Reminder
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Course selector */}
              <div className="space-y-1.5">
                <Label>Course</Label>
                <Select
                  value={selectedCourseId}
                  onValueChange={(v) => { setSelectedCourseId(v); setSelectedStudentId(null); setStudentSearch(""); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target */}
              <div className="space-y-1.5">
                <Label>Target</Label>
                <Select
                  value={targetType}
                  onValueChange={(v) => { setTargetType(v as "all" | "specific"); setSelectedStudentId(null); setStudentSearch(""); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Students in Course</SelectItem>
                    <SelectItem value="specific">Specific Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Student search */}
              {targetType === "specific" && (
                <div className="space-y-1.5">
                  <Label>Search Student</Label>
                  {!selectedCourseId && (
                    <p className="text-xs text-muted-foreground">Select a course first to search students.</p>
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Type student name or ID..."
                      value={studentSearch}
                      disabled={!selectedCourseId}
                      onChange={(e) => { setStudentSearch(e.target.value); setSelectedStudentId(null); }}
                    />
                  </div>
                  {selectedStudentId && (
                    <p className="text-sm text-emerald-600 font-medium">
                      Selected: {students.find((s) => s.id === selectedStudentId)
                        ? `${students.find((s) => s.id === selectedStudentId)?.firstName ?? ""} ${students.find((s) => s.id === selectedStudentId)?.lastName ?? ""}`.trim()
                        : "Student selected"}
                    </p>
                  )}
                  {loadingStudents && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                    </div>
                  )}
                  {!loadingStudents && students.length > 0 && !selectedStudentId && (
                    <div className="border rounded-md divide-y">
                      {students.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            setStudentSearch(`${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.email || "");
                            setStudents([]);
                          }}
                        >
                          <span className="font-medium">{s.firstName} {s.lastName}</span>
                          {s.email && <span className="text-muted-foreground ml-2 text-xs">{s.email}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message */}
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea
                  placeholder="Enter reminder message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Send At */}
              <div className="space-y-1.5">
                <Label>Send At</Label>
                <Input
                  type="datetime-local"
                  value={sendAt}
                  min={minDateTime}
                  onChange={(e) => setSendAt(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Schedule Reminder
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Reminders List */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Reminders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingReminders ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : reminders.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No reminders scheduled yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="font-semibold">Target</TableHead>
                    <TableHead className="font-semibold">Course</TableHead>
                    <TableHead className="font-semibold">Message</TableHead>
                    <TableHead className="font-semibold">Send At</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((r) => (
                    <TableRow key={r.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-medium text-sm">{formatTarget(r)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.courseName ?? "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {r.message.length > 80 ? r.message.slice(0, 80) + "..." : r.message}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(r.sendAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {r.sent ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Sent</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 border">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Reminder?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the scheduled reminder. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => handleDelete(r.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </TeacherLayout>
  );
}
