import { useState, useEffect } from "react";
import { Link } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  Circle,
  ClipboardList,
  BarChart2,
  Settings,
  Loader2,
  X,
  Check,
  GripVertical,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

async function apiFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers ?? {}),
    },
  });
}

// ---- types ----

type QuestionType = "multiple_choice" | "true_false" | "short_answer" | "essay" | "fill_blank";

interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  points: number;
  options: QuizOption[];
  correctAnswer?: string;
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  course_id: string;
  time_limit_minutes?: number | null;
  attempt_limit?: number | null;
  release_scores_immediately: boolean;
  is_published: boolean;
  created_at?: string;
}

interface Course {
  id: string;
  title: string;
}

interface Analytics {
  average_score: number | null;
  attempt_count: number;
}

const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  essay: "Essay",
  fill_blank: "Fill in the Blank",
};

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function makeQuestion(type: QuestionType): Question {
  const base: Question = { id: makeId(), type, text: "", points: 1, options: [] };
  if (type === "multiple_choice") {
    base.options = [
      { id: makeId(), text: "", isCorrect: false },
      { id: makeId(), text: "", isCorrect: false },
      { id: makeId(), text: "", isCorrect: false },
      { id: makeId(), text: "", isCorrect: false },
    ];
  }
  if (type === "true_false") {
    base.options = [
      { id: makeId(), text: "True", isCorrect: false },
      { id: makeId(), text: "False", isCorrect: false },
    ];
  }
  return base;
}

// ---- QuestionCard ----

function QuestionCard({
  question,
  index,
  total,
  onUpdate,
  onDelete,
  onMove,
}: {
  question: Question;
  index: number;
  total: number;
  onUpdate: (q: Question) => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const setCorrectOption = (optionId: string) => {
    onUpdate({
      ...question,
      options: question.options.map((o) => ({ ...o, isCorrect: o.id === optionId })),
    });
  };

  const updateOptionText = (optionId: string, text: string) => {
    onUpdate({
      ...question,
      options: question.options.map((o) => (o.id === optionId ? { ...o, text } : o)),
    });
  };

  return (
    <Card className={`border-l-4 ${expanded ? "border-l-primary" : "border-l-border"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold text-muted-foreground shrink-0">Q{index + 1}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {questionTypeLabels[question.type]}
            </Badge>
            {question.text && (
              <span className="text-sm text-foreground truncate">{question.text}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onMove("up")}
              disabled={index === 0}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onMove("down")}
              disabled={index === total - 1}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Question Text</Label>
              <Textarea
                value={question.text}
                onChange={(e) => onUpdate({ ...question, text: e.target.value })}
                placeholder="Enter your question here..."
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="w-24 space-y-1.5 shrink-0">
              <Label className="text-xs">Points</Label>
              <Input
                type="number"
                min={0}
                value={question.points}
                onChange={(e) => onUpdate({ ...question, points: Number(e.target.value) })}
                className="text-center"
              />
            </div>
          </div>

          {question.type === "multiple_choice" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Answer Options (click circle to mark correct)
              </Label>
              {question.options.map((option, i) => (
                <div key={option.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => setCorrectOption(option.id)} className="shrink-0">
                    {option.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                    )}
                  </button>
                  <Input
                    value={option.text}
                    onChange={(e) => updateOptionText(option.id, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              {question.options.filter((o) => o.isCorrect).length === 0 && (
                <p className="text-xs text-amber-600">Please mark a correct answer.</p>
              )}
            </div>
          )}

          {question.type === "true_false" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Correct Answer</Label>
              <div className="flex gap-3">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCorrectOption(option.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      option.isCorrect
                        ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "border-border text-muted-foreground hover:border-foreground/50"
                    }`}
                  >
                    {option.isCorrect ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    {option.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(question.type === "short_answer" || question.type === "essay") && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {question.type === "short_answer"
                  ? "Expected Answer (for reference)"
                  : "Grading Rubric / Notes"}
              </Label>
              <Textarea
                value={question.correctAnswer || ""}
                onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                placeholder={
                  question.type === "short_answer"
                    ? "Enter expected answer..."
                    : "Enter grading rubric..."
                }
                rows={question.type === "essay" ? 3 : 2}
                className="resize-none text-sm"
              />
              {question.type === "essay" && (
                <p className="text-xs text-muted-foreground">Essay questions require manual grading.</p>
              )}
            </div>
          )}

          {question.type === "fill_blank" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Correct Answer(s)</Label>
              <Input
                value={question.correctAnswer || ""}
                onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                placeholder="Correct answer (separate multiple with commas)"
              />
              <p className="text-xs text-muted-foreground">
                Use underscores in the question text to indicate blanks (e.g. "The capital is ___.")
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---- Create Quiz Form ----

interface CreateQuizFormProps {
  courses: Course[];
  onCreated: (quiz: Quiz) => void;
  onCancel: () => void;
}

function CreateQuizForm({ courses, onCreated, onCancel }: CreateQuizFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<string>("");
  const [attemptLimit, setAttemptLimit] = useState<string>("1");
  const [releaseScoresImmediately, setReleaseScoresImmediately] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Please enter a quiz title"); return; }
    if (!courseId) { toast.error("Please select a course"); return; }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        course_id: courseId,
        time_limit_minutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
        attempt_limit: attemptLimit ? Number(attemptLimit) : null,
        release_scores_immediately: releaseScoresImmediately,
      };
      const res = await apiFetch("/api/quizzes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = res.ok ? await res.json() : null;
      const quiz: Quiz = data?.quiz ?? data ?? {
        id: makeId(),
        ...payload,
        is_published: false,
      };
      toast.success("Quiz created");
      onCreated(quiz);
    } catch {
      toast.error("Failed to create quiz");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Quiz</CardTitle>
        <CardDescription>Set up quiz details before adding questions.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-title">Title</Label>
            <Input
              id="quiz-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 3 Quiz"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-description">Description</Label>
            <Textarea
              id="quiz-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a course..." />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="time-limit">Time Limit (minutes)</Label>
              <Input
                id="time-limit"
                type="number"
                min={1}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                placeholder="No limit"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attempt-limit">Attempt Limit</Label>
              <Input
                id="attempt-limit"
                type="number"
                min={1}
                value={attemptLimit}
                onChange={(e) => setAttemptLimit(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Release Scores Immediately</div>
              <div className="text-xs text-muted-foreground">
                Students see their score right after submission
              </div>
            </div>
            <Switch
              checked={releaseScoresImmediately}
              onCheckedChange={setReleaseScoresImmediately}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Quiz
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Analytics Panel ----

function AnalyticsPanel({ quizId }: { quizId: string }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/quizzes/${quizId}/analytics`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [quizId]);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-40" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No analytics data available yet.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">
              {analytics.average_score != null
                ? `${Math.round(analytics.average_score)}%`
                : "—"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Average Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">{analytics.attempt_count}</div>
            <div className="text-sm text-muted-foreground mt-1">Total Attempts</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Quiz Detail Panel ----

interface QuizDetailProps {
  quiz: Quiz;
  onPublished: (quiz: Quiz) => void;
}

function QuizDetail({ quiz, onPublished }: QuizDetailProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [activeTab, setActiveTab] = useState<"questions" | "analytics">("questions");
  const [publishing, setPublishing] = useState(false);
  const [addingType, setAddingType] = useState<QuestionType | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  useEffect(() => {
    setLoadingQuestions(true);
    apiFetch(`/api/quizzes/${quiz.id}/questions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setQuestions(Array.isArray(data) ? data : data?.questions ?? []))
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [quiz.id]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await apiFetch(`/api/quizzes/${quiz.id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onPublished({ ...quiz, is_published: true, ...updated });
      toast.success("Quiz published successfully");
    } catch {
      // Optimistically mark published
      onPublished({ ...quiz, is_published: true });
      toast.success("Quiz published");
    } finally {
      setPublishing(false);
    }
  };

  // The backend's quiz_questions table (and everything that reads it — quiz
  // taking, auto-grading) speaks a different shape than this component's
  // local Question state: `question` not `text`, `correct_answer` not
  // `correctAnswer`, options carry `is_correct` not `isCorrect`, and for
  // multiple_choice the graded "submitted answer" is the chosen option's id
  // while for true_false it's the literal string "True"/"False" (see
  // StudentQuizTake.tsx's MultipleChoiceInput/TrueFalseInput). Translate here
  // rather than changing the local shape everywhere it's used for editing.
  const toApiPayload = (q: Question) => {
    const options = q.options.map((o) => ({ id: o.id, text: o.text, is_correct: o.isCorrect }));
    let correctAnswer: string | null = null;
    if (q.type === "multiple_choice") {
      correctAnswer = q.options.find((o) => o.isCorrect)?.id ?? null;
    } else if (q.type === "true_false") {
      correctAnswer = q.options.find((o) => o.isCorrect)?.text ?? null;
    } else {
      correctAnswer = q.correctAnswer ?? null;
    }
    return {
      type: q.type,
      question: q.text,
      options: q.options.length > 0 ? options : null,
      correct_answer: correctAnswer,
      points: q.points,
    };
  };

  const addQuestion = async (type: QuestionType) => {
    const q = makeQuestion(type);
    setSavingQuestion(true);
    try {
      const res = await apiFetch(`/api/quizzes/${quiz.id}/questions`, {
        method: "POST",
        body: JSON.stringify(toApiPayload(q)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to add question");
        return;
      }
      const saved = await res.json();
      // Keep the local (camelCase, isCorrect-based) shape for editing, but
      // adopt the server-assigned id so later PUT/DELETE calls target the
      // real row instead of the client-generated placeholder id.
      setQuestions((prev) => [...prev, { ...q, id: saved.id ?? q.id }]);
    } catch {
      toast.error("Failed to add question");
    } finally {
      setSavingQuestion(false);
      setAddingType(null);
    }
  };

  const updateQuestion = async (index: number, updated: Question) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)));
    try {
      const res = await apiFetch(`/api/quizzes/${quiz.id}/questions/${updated.id}`, {
        method: "PUT",
        body: JSON.stringify(toApiPayload(updated)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to save question");
      }
    } catch {
      toast.error("Failed to save question");
    }
  };

  const deleteQuestion = async (index: number) => {
    const q = questions[index];
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    try {
      await apiFetch(`/api/quizzes/${quiz.id}/questions/${q.id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const arr = [...questions];
    if (direction === "up" && index > 0) {
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    } else if (direction === "down" && index < arr.length - 1) {
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    }
    setQuestions(arr);
  };

  const tabs = [
    { key: "questions" as const, label: "Questions", icon: ClipboardList },
    { key: "analytics" as const, label: "Analytics", icon: BarChart2 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{quiz.title}</h2>
          {quiz.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{quiz.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {quiz.is_published ? (
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" /> Published
              </Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )}
            {quiz.time_limit_minutes && (
              <Badge variant="outline">{quiz.time_limit_minutes} min</Badge>
            )}
            {quiz.attempt_limit && (
              <Badge variant="outline">{quiz.attempt_limit} attempt(s)</Badge>
            )}
          </div>
        </div>
        {!quiz.is_published && (
          <Button onClick={handlePublish} disabled={publishing} className="shrink-0">
            {publishing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publish
          </Button>
        )}
      </div>

      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "questions" && (
        <div className="space-y-4">
          {/* Add question panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Add Question</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(questionTypeLabels) as [QuestionType, string][]).map(
                  ([type, label]) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      disabled={savingQuestion}
                      onClick={() => {
                        setAddingType(type);
                        addQuestion(type);
                      }}
                    >
                      {savingQuestion && addingType === type ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      {label}
                    </Button>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          {loadingQuestions ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : questions.length > 0 ? (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  total={questions.length}
                  onUpdate={(updated) => updateQuestion(i, updated)}
                  onDelete={() => deleteQuestion(i)}
                  onMove={(dir) => moveQuestion(i, dir)}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-base font-medium mb-1">No questions yet</p>
                <p className="text-sm text-muted-foreground">
                  Click a question type above to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "analytics" && <AnalyticsPanel quizId={quiz.id} />}
    </div>
  );
}

// ---- Main Component ----

export default function TeacherQuizBuilder() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Fetch courses
  useEffect(() => {
    apiFetch("/api/courses/my")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const list: Course[] = Array.isArray(data) ? data : data?.courses ?? [];
        setCourses(list);
        if (list.length > 0) setSelectedCourseId(list[0].id);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoadingCourses(false));
  }, []);

  // Fetch quizzes when course changes
  useEffect(() => {
    if (!selectedCourseId) return;
    setLoadingQuizzes(true);
    setSelectedQuiz(null);
    apiFetch(`/api/quizzes?course_id=${selectedCourseId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setQuizzes(Array.isArray(data) ? data : data?.quizzes ?? []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoadingQuizzes(false));
  }, [selectedCourseId]);

  const handleQuizCreated = (quiz: Quiz) => {
    setQuizzes((prev) => [quiz, ...prev]);
    setSelectedQuiz(quiz);
    setShowCreateForm(false);
  };

  const handlePublished = (updated: Quiz) => {
    setQuizzes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setSelectedQuiz(updated);
  };

  return (
    <TeacherLayout>
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
            <Link href="/dashboard/teacher">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Quiz Builder</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage quizzes for your courses.
          </p>
        </div>

        <div className="grid lg:grid-cols-[300px_1fr] gap-6">
          {/* Left: quiz list */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Course</Label>
              {loadingCourses ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              className="w-full"
              size="sm"
              onClick={() => {
                setShowCreateForm(true);
                setSelectedQuiz(null);
              }}
              disabled={!selectedCourseId}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Quiz
            </Button>

            <div className="space-y-1">
              {loadingQuizzes ? (
                <>
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </>
              ) : quizzes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No quizzes yet
                </div>
              ) : (
                quizzes.map((quiz) => (
                  <button
                    key={quiz.id}
                    onClick={() => {
                      setSelectedQuiz(quiz);
                      setShowCreateForm(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedQuiz?.id === quiz.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{quiz.title}</span>
                      {quiz.is_published ? (
                        <Badge variant="default" className="text-xs shrink-0">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Draft
                        </Badge>
                      )}
                    </div>
                    {quiz.time_limit_minutes && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {quiz.time_limit_minutes} min
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: detail / create form */}
          <div>
            {showCreateForm ? (
              <CreateQuizForm
                courses={courses}
                onCreated={handleQuizCreated}
                onCancel={() => setShowCreateForm(false)}
              />
            ) : selectedQuiz ? (
              <QuizDetail
                key={selectedQuiz.id}
                quiz={selectedQuiz}
                onPublished={handlePublished}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border border-dashed rounded-xl">
                <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Select a quiz or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
