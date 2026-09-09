import { useState } from "react";
import { useParams, Link } from "wouter";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetCourse,
  useListAssignments,
  useSubmitAssignment,
  useGetCourseStudents,
  getListAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Download,
  ExternalLink,
  Video,
  BookOpen,
  GraduationCap,
  FolderOpen,
  CheckSquare,
  PlayCircle,
  Users,
  Clock,
  Loader2,
  FileQuestion,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { format, isValid } from "date-fns";

function safeFormat(value: string | null | undefined, fmt: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return isValid(date) ? format(date, fmt) : null;
}
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Resource {
  id: string;
  title: string;
  url?: string;
  fileUrl?: string;
  type?: string;
  uploadedAt?: string;
  description?: string;
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  time_limit_minutes?: number;
  attempt_limit?: number;
  questions_count?: number;
  is_published: boolean;
  due_date?: string;
}

interface VideoSession {
  id: string;
  room_name: string;
  jitsi_url?: string;
  is_active: boolean;
  started_at?: string;
}

function ResourcesTab({ courseId }: { courseId: string }) {
  const { session } = useAuth();

  const { data: resources, isLoading } = useQuery<Resource[]>({
    queryKey: ["course-resources", courseId],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${courseId}/resources`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch resources");
      return res.json();
    },
    enabled: !!courseId && !!session,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!resources || resources.length === 0) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">No Resources Yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your instructor has not uploaded any resources for this course yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {resources.map((resource) => (
        <Card key={resource.id} className="hover:border-primary/40 transition-colors">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{resource.title}</p>
              {resource.description && (
                <p className="text-sm text-muted-foreground truncate">{resource.description}</p>
              )}
              {safeFormat(resource.uploadedAt, "MMM d, yyyy") && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uploaded {safeFormat(resource.uploadedAt, "MMM d, yyyy")}
                </p>
              )}
            </div>
            {(resource.url || resource.fileUrl) && (
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <a
                  href={resource.url || resource.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  View
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClassmatesTab({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const { data: students, isLoading } = useGetCourseStudents(courseId, {
    query: { enabled: !!courseId },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const classmates = (students ?? []).filter((s) => s.id !== user?.id);

  if (classmates.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">No other students enrolled yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {classmates.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
            {`${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase() || "S"}
          </div>
          <span className="text-sm font-medium">
            {s.firstName} {s.lastName}
          </span>
        </div>
      ))}
    </div>
  );
}

function AssignmentsTab({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [submissionContent, setSubmissionContent] = useState("");

  const { data: assignments, isLoading } = useListAssignments(courseId, {
    query: { enabled: !!courseId },
  });

  const submitAssignment = useSubmitAssignment();

  const selectedAssignment = assignments?.find((a) => a.id === selectedAssignmentId);

  const handleSubmit = () => {
    if (!selectedAssignmentId || !submissionContent.trim()) {
      toast.error("Please enter your submission content");
      return;
    }
    submitAssignment.mutate(
      { assignmentId: selectedAssignmentId, data: { content: submissionContent } },
      {
        onSuccess: () => {
          toast.success("Assignment submitted successfully!");
          setSelectedAssignmentId(null);
          setSubmissionContent("");
          queryClient.invalidateQueries({ queryKey: getListAssignmentsQueryKey(courseId) });
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit assignment");
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const visibleAssignments = (assignments ?? []).filter((a: any) => a.isPublished !== false);

  if (visibleAssignments.length === 0) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">No Assignments Yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your instructor has not posted any assignments for this course.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {visibleAssignments.map((assignment: any) => {
          const isSubmitted = !!assignment.hasSubmitted;
          const isOverdue =
            !isSubmitted && assignment.dueDate && new Date(assignment.dueDate) < new Date();

          return (
            <Card
              key={assignment.id}
              className={cn(
                "hover:border-primary/40 transition-colors cursor-pointer",
                isSubmitted && "border-green-200 dark:border-green-900 bg-green-50/40 dark:bg-green-950/10",
                isOverdue && "border-red-200 dark:border-red-900"
              )}
              onClick={() => {
                setSelectedAssignmentId(assignment.id);
                setSubmissionContent("");
              }}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div
                  className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                    isSubmitted
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-orange-100 dark:bg-orange-900/30"
                  )}
                >
                  {isSubmitted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <CheckSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-medium text-foreground">{assignment.title}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSubmitted ? (
                        <Badge className="bg-green-600 hover:bg-green-600 text-white">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      ) : isOverdue ? (
                        <Badge variant="destructive">Overdue</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      {assignment.pointsPossible != null && (
                        <Badge variant="outline">{assignment.pointsPossible} pts</Badge>
                      )}
                    </div>
                  </div>
                  {assignment.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {assignment.description}
                    </p>
                  )}
                  {safeFormat(assignment.dueDate, "MMM d, yyyy") && (
                    <p
                      className={cn(
                        "text-xs flex items-center gap-1 mt-1.5 font-medium",
                        isOverdue
                          ? "text-red-600 dark:text-red-400"
                          : "text-orange-600 dark:text-orange-400"
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      Due {safeFormat(assignment.dueDate, "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                <Button size="sm" variant={isSubmitted ? "outline" : "default"} className="shrink-0">
                  {isSubmitted ? "View Submission" : "Submit"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={!!selectedAssignmentId}
        onOpenChange={(open) => !open && setSelectedAssignmentId(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedAssignment?.title}</DialogTitle>
            {safeFormat(selectedAssignment?.dueDate, "EEEE, MMMM d, yyyy") && (
              <p className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-1 font-medium mt-1">
                <Calendar className="h-3.5 w-3.5" />
                Due {safeFormat(selectedAssignment?.dueDate, "EEEE, MMMM d, yyyy")}
              </p>
            )}
          </DialogHeader>
          {selectedAssignment?.description && (
            <div className="bg-muted/40 rounded-lg p-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Instructions
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                {selectedAssignment.description}
              </p>
            </div>
          )}
          {(selectedAssignment as any)?.hasSubmitted ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20 p-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm text-foreground">
                You've already submitted this assignment. You can resubmit below to replace your answer.
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">
              {(selectedAssignment as any)?.hasSubmitted ? "Resubmit" : "Your Submission"}
            </label>
            <Textarea
              placeholder="Type your answer or paste a link to your work..."
              className="min-h-[150px] resize-none"
              value={submissionContent}
              onChange={(e) => setSubmissionContent(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedAssignmentId(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitAssignment.isPending || !submissionContent.trim()}
            >
              {submitAssignment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuizzesTab({ courseId }: { courseId: string }) {
  const { session } = useAuth();

  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["course-quizzes", courseId],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes?course_id=${courseId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch quizzes");
      return res.json();
    },
    enabled: !!courseId && !!session,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!quizzes || quizzes.length === 0) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <FileQuestion className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">No Quizzes Available</p>
          <p className="text-sm text-muted-foreground mt-1">
            There are no published quizzes for this course yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {quizzes.filter((q) => q.is_published).map((quiz) => (
        <Card key={quiz.id} className="hover:border-primary/40 transition-colors">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <FileQuestion className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{quiz.title}</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {quiz.questions_count != null && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {quiz.questions_count} questions
                  </span>
                )}
                {quiz.time_limit_minutes && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {quiz.time_limit_minutes} min
                  </span>
                )}
                {safeFormat(quiz.due_date, "MMM d") && (
                  <span className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 font-medium">
                    <Calendar className="h-3 w-3" />
                    Due {safeFormat(quiz.due_date, "MMM d")}
                  </span>
                )}
              </div>
            </div>
            <Button size="sm" asChild className="shrink-0">
              <Link href={`/dashboard/student/quiz/${quiz.id}`}>
                Take Quiz
                <ArrowLeft className="ml-1.5 h-3 w-3 rotate-180" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VideoTab({ courseId }: { courseId: string }) {
  const { session } = useAuth();
  const [joining, setJoining] = useState(false);

  const { data: videoSession, isLoading, refetch } = useQuery<VideoSession | null>({
    queryKey: ["course-video", courseId],
    queryFn: async () => {
      const res = await fetch(`/api/courses/${courseId}/video/active`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch video session");
      return res.json();
    },
    enabled: !!courseId && !!session,
    // A live class starting is a rare, teacher-initiated event, not
    // something that needs near-real-time detection — this polls every
    // open student course page, so the interval directly multiplies
    // sustained query volume.
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (!videoSession || !videoSession.is_active) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <Video className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">No Active Session</p>
          <p className="text-sm text-muted-foreground mt-1">
            There is no live class session running right now. Check back when your instructor starts
            one.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => refetch()}
          >
            Check Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const jitsiUrl =
    videoSession.jitsi_url ||
    `https://meet.jit.si/${videoSession.room_name}`;

  return (
    <div className="space-y-4">
      <Card className="border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-700 dark:text-green-400">Live Class in Progress</p>
            {safeFormat(videoSession.started_at, "h:mm a") && (
              <p className="text-xs text-green-600/70 dark:text-green-400/70">
                Started {safeFormat(videoSession.started_at, "h:mm a")}
              </p>
            )}
          </div>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white shrink-0"
            onClick={() => setJoining(true)}
          >
            <PlayCircle className="mr-1.5 h-4 w-4" />
            Join Class
          </Button>
        </CardContent>
      </Card>

      {joining && (
        <div className="rounded-xl overflow-hidden border border-border aspect-video bg-black">
          <iframe
            src={jitsiUrl}
            className="w-full h-full"
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            title="Live Class Session"
          />
        </div>
      )}
    </div>
  );
}

export default function StudentCourseDetail() {
  const params = useParams();
  const courseId = params.id || "";
  const [activeTab, setActiveTab] = useState("overview");

  const { data: course, isLoading: isCourseLoading } = useGetCourse(courseId, {
    query: { enabled: !!courseId },
  });

  if (isCourseLoading) {
    return (
      <StudentLayout>
        <div className="space-y-6 max-w-5xl mx-auto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </StudentLayout>
    );
  }

  if (!course) {
    return (
      <StudentLayout>
        <div className="max-w-5xl mx-auto text-center py-20">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Course not found</h2>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/dashboard/student">Back to Dashboard</Link>
          </Button>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link href="/dashboard/student">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="h-24 bg-gradient-to-r from-primary/30 via-primary/20 to-primary/10" />
          <div className="p-6 -mt-6">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="h-14 w-14 rounded-xl border-4 border-card bg-primary/10 flex items-center justify-center shrink-0 shadow-sm -mt-2">
                <BookOpen className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pt-2">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {course.code && (
                    <Badge variant="outline" className="text-xs">{course.code}</Badge>
                  )}
                  {course.term && (
                    <span className="text-xs text-muted-foreground">{course.term}</span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                  <GraduationCap className="h-4 w-4" />
                  <span className="text-sm">
                    Instructor:{" "}
                    <span className="font-medium text-foreground">{course.teacherName}</span>
                  </span>
                </div>
                {course.studentCount != null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Users className="h-3.5 w-3.5" />
                    {course.studentCount} students enrolled
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-6 h-auto p-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="resources" className="text-xs sm:text-sm">Resources</TabsTrigger>
            <TabsTrigger value="assignments" className="text-xs sm:text-sm">Assignments</TabsTrigger>
            <TabsTrigger value="quizzes" className="text-xs sm:text-sm">Quizzes</TabsTrigger>
            <TabsTrigger value="classmates" className="text-xs sm:text-sm">Classmates</TabsTrigger>
            <TabsTrigger value="video" className="text-xs sm:text-sm">Live</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-4">
            {course.description ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Course Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {course.description}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No course description available yet.</p>
                </CardContent>
              </Card>
            )}

            <div className="grid sm:grid-cols-3 gap-4">
              <Card
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setActiveTab("assignments")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <CheckSquare className="h-8 w-8 text-orange-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Assignments</p>
                    <p className="text-xs text-muted-foreground">View and submit work</p>
                  </div>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setActiveTab("quizzes")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <FileQuestion className="h-8 w-8 text-purple-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Quizzes</p>
                    <p className="text-xs text-muted-foreground">Take tests and quizzes</p>
                  </div>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setActiveTab("video")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <Video className="h-8 w-8 text-green-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Live Class</p>
                    <p className="text-xs text-muted-foreground">Join video session</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="resources" className="mt-6">
            <ResourcesTab courseId={courseId} />
          </TabsContent>

          <TabsContent value="assignments" className="mt-6">
            <AssignmentsTab courseId={courseId} />
          </TabsContent>

          <TabsContent value="quizzes" className="mt-6">
            <QuizzesTab courseId={courseId} />
          </TabsContent>

          <TabsContent value="classmates" className="mt-6">
            <ClassmatesTab courseId={courseId} />
          </TabsContent>

          <TabsContent value="video" className="mt-6">
            <VideoTab courseId={courseId} />
          </TabsContent>
        </Tabs>
      </div>
    </StudentLayout>
  );
}
