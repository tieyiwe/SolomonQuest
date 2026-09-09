import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  MessageSquare,
  ThumbsUp,
  Heart,
  PartyPopper,
  Pin,
  Plus,
  BookOpen,
  School,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Clock,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/forum/MentionTextarea";

// ─── API helper ──────────────────────────────────────────────────────────────

async function apiFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReactionCounts {
  like: number;
  heart: number;
  celebrate: number;
}

interface ForumTopic {
  id: string;
  title: string;
  content: string;
  coverImage?: string | null;
  author_id: string;
  author_name: string;
  author_avatar_url?: string | null;
  created_at: string;
  updated_at: string;
  comment_count: number;
  reaction_counts: ReactionCounts;
  course_id: string | null;
  course_name?: string | null;
  program_id: string | null;
  program_name?: string | null;
  is_pinned: boolean;
  school_id: string;
}

interface Course {
  id: string;
  name: string;
}

interface Program {
  id: string;
  name: string;
}

/** Translates the API's camelCase response into the shape this page renders. */
function normalizeTopic(
  raw: any,
  courseById: Map<string, string>,
  programById: Map<string, string>
): ForumTopic {
  const authorName =
    [raw.postedByProfile?.first_name, raw.postedByProfile?.last_name].filter(Boolean).join(" ") ||
    "Unknown";
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content ?? "",
    coverImage: raw.coverImage ?? null,
    author_id: raw.postedBy,
    author_name: authorName,
    author_avatar_url: raw.postedByProfile?.avatar_url ?? null,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    comment_count: raw.commentCount ?? 0,
    reaction_counts: { like: raw.reactionCount ?? 0, heart: 0, celebrate: 0 },
    course_id: raw.courseId ?? null,
    course_name: raw.courseId ? courseById.get(raw.courseId) ?? null : null,
    program_id: raw.programId ?? null,
    program_name: raw.programId ? programById.get(raw.programId) ?? null : null,
    is_pinned: !!raw.isPinned,
    school_id: raw.schoolId,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function excerpt(text: string, max = 140) {
  const single = text.replace(/\n+/g, " ");
  return single.length > max ? single.slice(0, max).trimEnd() + "…" : single;
}

function totalReactions(counts: ReactionCounts) {
  return (counts.like ?? 0) + (counts.heart ?? 0) + (counts.celebrate ?? 0);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn("rounded-full object-cover shrink-0 border border-border", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 select-none",
        dim
      )}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Reaction mini strip (icons only, no interaction) ─────────────────────────

function ReactionStrip({ counts }: { counts: ReactionCounts }) {
  const total = totalReactions(counts);
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      {counts.like > 0 && <span>👍</span>}
      {counts.heart > 0 && <span>❤️</span>}
      {counts.celebrate > 0 && <span>🎉</span>}
      <span className="ml-0.5">{total}</span>
    </span>
  );
}

// ─── Topic Card ───────────────────────────────────────────────────────────────

function TopicCard({ topic, onClick }: { topic: ForumTopic; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left group px-5 py-4 flex gap-4 hover:bg-muted/40 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      )}
    >
      {/* Avatar column */}
      <div className="hidden sm:block pt-0.5">
        <Avatar name={topic.author_name} url={topic.author_avatar_url} />
      </div>

      {/* Cover image thumbnail */}
      {topic.coverImage && (
        <div className="hidden sm:block shrink-0 w-20 h-14 rounded-md overflow-hidden border border-border self-center">
          <img src={topic.coverImage} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Cover image on mobile */}
        {topic.coverImage && (
          <div className="sm:hidden w-full h-28 rounded-md overflow-hidden border border-border mb-1">
            <img src={topic.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {topic.is_pinned && (
              <span title="Pinned">
                <Pin size={13} className="text-amber-500 shrink-0" />
              </span>
            )}
            <span className="font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
              {topic.title}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 mt-0.5">
            {topic.is_pinned && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">
                Pinned
              </Badge>
            )}
            {topic.course_id ? (
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-[10px] px-1.5 py-0 border-0">
                <BookOpen size={10} className="mr-1" />
                {topic.course_name ?? "Course"}
              </Badge>
            ) : topic.program_id ? (
              <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] px-1.5 py-0 border-0">
                <BookOpen size={10} className="mr-1" />
                {topic.program_name ?? "Program"}
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5 py-0 border-0 hover:bg-green-100">
                <School size={10} className="mr-1" />
                School-wide
              </Badge>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <User size={11} />
          <span className="font-medium text-foreground/70">{topic.author_name}</span>
          <span>&middot;</span>
          <Clock size={11} />
          <span>{formatDate(topic.created_at)}</span>
        </div>

        {/* Excerpt */}
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {excerpt(topic.content)}
        </p>

        {/* Footer stats */}
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare size={12} />
            {topic.comment_count} {topic.comment_count === 1 ? "reply" : "replies"}
          </span>
          <ReactionStrip counts={topic.reaction_counts} />
        </div>
      </div>
    </button>
  );
}

// ─── New Topic Modal ──────────────────────────────────────────────────────────

function NewTopicModal({
  open,
  onClose,
  courses,
  programs,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  programs: Program[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState("");
  const [scope, setScope] = useState<"school-wide" | "course" | "program">("school-wide");
  const [courseId, setCourseId] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle("");
    setContent("");
    setMentionedUserIds([]);
    setCoverImage("");
    setScope("school-wide");
    setCourseId("");
    setProgramId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Title is required.");
    if (content.trim().length < 20)
      return toast.error("Content must be at least 20 characters.");
    if (scope === "course" && !courseId) return toast.error("Please select a course.");
    if (scope === "program" && !programId) return toast.error("Please select a program.");

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        mentionedUserIds,
      };
      if (scope === "course" && courseId) body.courseId = courseId;
      if (scope === "program" && programId) body.programId = programId;
      if (coverImage.trim()) body.coverImage = coverImage.trim();

      const res = await apiFetch("/api/forum/topics", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? (err as any).message ?? "Failed to create topic");
      }
      toast.success("Topic created!");
      reset();
      onClose();
      onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create topic.");
    } finally {
      setSubmitting(false);
    }
    return;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" />
            New Discussion Topic
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Scope */}
          <div className="grid gap-1.5">
            <Label htmlFor="new-scope">Visibility</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as typeof scope);
                setCourseId("");
                setProgramId("");
              }}
            >
              <SelectTrigger id="new-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="school-wide">
                  <span className="flex items-center gap-2">
                    <School size={14} /> School-wide
                  </span>
                </SelectItem>
                <SelectItem value="course">
                  <span className="flex items-center gap-2">
                    <BookOpen size={14} /> Specific class
                  </span>
                </SelectItem>
                <SelectItem value="program">
                  <span className="flex items-center gap-2">
                    <BookOpen size={14} /> Specific program
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Course selector */}
          {scope === "course" && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-course">Class</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="new-course">
                  <SelectValue placeholder="Select a class…" />
                </SelectTrigger>
                <SelectContent>
                  {courses.length === 0 && (
                    <SelectItem value="__none" disabled>No classes found</SelectItem>
                  )}
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only visible to this class's teacher and enrolled students.
              </p>
            </div>
          )}

          {/* Program selector */}
          {scope === "program" && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-program">Program</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger id="new-program">
                  <SelectValue placeholder="Select a program…" />
                </SelectTrigger>
                <SelectContent>
                  {programs.length === 0 && (
                    <SelectItem value="__none" disabled>No programs found</SelectItem>
                  )}
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only visible to teachers and students in this program's classes.
              </p>
            </div>
          )}

          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="new-title">Title</Label>
            <Input
              id="new-title"
              placeholder="What's on your mind?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
          </div>

          {/* Content */}
          <div className="grid gap-1.5">
            <Label htmlFor="new-content">Content</Label>
            <MentionTextarea
              id="new-content"
              placeholder="Share details, questions, or announcements… (min. 20 characters). Type @ to tag someone."
              value={content}
              onChange={setContent}
              mentionedUserIds={mentionedUserIds}
              onMentionedUserIdsChange={setMentionedUserIds}
              required
              minLength={20}
              className="min-h-[140px] resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {content.length} chars{content.length < 20 && ` — ${20 - content.length} more needed`}
            </p>
          </div>

          {/* Cover image */}
          <div className="grid gap-1.5">
            <Label htmlFor="new-cover">Cover Image URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="new-cover"
              placeholder="https://example.com/image.jpg"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
            />
            {coverImage.trim() && (
              <div className="relative rounded-md overflow-hidden h-32 border border-border mt-1">
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Topic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-sm font-medium transition-all whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ForumPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const isTeacherOrAdmin =
    user?.role === "teacher" ||
    user?.role === "admin" ||
    user?.role === "super_admin";
  const schoolId = (user?.schoolId ?? (user as any)?.school_id) as string | undefined;

  const fetchCourses = useCallback(async () => {
    if (!schoolId) return [] as Course[];
    try {
      const res = await apiFetch("/api/courses");
      if (!res.ok) return [] as Course[];
      const data = await res.json();
      const mapped: Course[] = (data ?? []).map((c: any) => ({ id: c.id, name: c.title }));
      setCourses(mapped);
      return mapped;
    } catch {
      return [] as Course[];
    }
  }, [schoolId]);

  const fetchPrograms = useCallback(async () => {
    if (!schoolId) return [] as Program[];
    try {
      const res = await apiFetch("/api/programs");
      if (!res.ok) return [] as Program[];
      const data = await res.json();
      const mapped: Program[] = (data ?? []).map((p: any) => ({ id: p.id, name: p.name }));
      setPrograms(mapped);
      return mapped;
    } catch {
      return [] as Program[];
    }
  }, [schoolId]);

  const fetchTopics = useCallback(
    async (courseList?: Course[], programList?: Program[]) => {
      if (!schoolId) return;
      setIsLoading(true);
      try {
        const res = await apiFetch("/api/forum/topics");
        if (!res.ok) throw new Error("Failed to load topics");
        const data = await res.json();
        const courseById = new Map((courseList ?? courses).map((c) => [c.id, c.name]));
        const programById = new Map((programList ?? programs).map((p) => [p.id, p.name]));
        setTopics((data ?? []).map((raw: any) => normalizeTopic(raw, courseById, programById)));
      } catch (err: any) {
        toast.error(err?.message ?? "Could not load forum topics.");
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schoolId]
  );

  useEffect(() => {
    (async () => {
      const [courseList, programList] = await Promise.all([fetchCourses(), fetchPrograms()]);
      fetchTopics(courseList, programList);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  // ── Filtering ──
  const filterTabs = [
    { key: "all", label: "All Topics" },
    { key: "school-wide", label: "School-wide" },
    ...courses.map((c) => ({ key: `course:${c.id}`, label: c.name })),
    ...programs.map((p) => ({ key: `program:${p.id}`, label: p.name })),
  ];

  const displayedTopics = topics
    .filter((t) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "school-wide") return t.course_id === null && t.program_id === null;
      if (activeFilter.startsWith("course:")) return t.course_id === activeFilter.slice(7);
      if (activeFilter.startsWith("program:")) return t.program_id === activeFilter.slice(8);
      return true;
    })
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q) ||
        t.author_name.toLowerCase().includes(q)
      );
    })
    // pinned first, then by date desc
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const pinnedCount = displayedTopics.filter((t) => t.is_pinned).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">School Forum</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ask questions, share updates, and discuss course topics.
          </p>
        </div>
        {isTeacherOrAdmin && (
          <Button onClick={() => setModalOpen(true)} className="gap-2 shrink-0">
            <Plus size={16} />
            New Topic
          </Button>
        )}
      </div>

      {/* ── Search + filter bar ── */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search topics…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
          />
        </div>

        {/* Filter pills — scrollable on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {filterTabs.map((tab) => (
            <FilterPill
              key={tab.key}
              active={activeFilter === tab.key}
              onClick={() => setActiveFilter(tab.key)}
            >
              {tab.key === "all" ? (
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal size={12} />
                  {tab.label}
                </span>
              ) : tab.key === "school-wide" ? (
                <span className="flex items-center gap-1.5">
                  <School size={12} />
                  {tab.label}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <BookOpen size={12} />
                  {tab.label}
                </span>
              )}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* ── Topic list ── */}
      {isLoading ? (
        <div className="rounded-xl border bg-card divide-y">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-5 py-4 flex gap-4">
              <Skeleton className="w-9 h-9 rounded-full shrink-0 hidden sm:block" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedTopics.length === 0 ? (
        <div className="rounded-xl border bg-card py-20 flex flex-col items-center gap-3 text-muted-foreground">
          <MessageSquare size={40} className="opacity-30" />
          <p className="font-semibold text-base">
            {searchQuery ? "No topics match your search" : "No topics yet"}
          </p>
          {!searchQuery && isTeacherOrAdmin && (
            <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              Create the first topic
            </Button>
          )}
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {pinnedCount > 0 && (
            <div className="px-5 py-2 bg-amber-50/60 dark:bg-amber-900/10 flex items-center gap-2">
              <Pin size={12} className="text-amber-500" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {pinnedCount} pinned {pinnedCount === 1 ? "topic" : "topics"}
              </span>
            </div>
          )}
          {displayedTopics.map((topic, idx) => (
            <div key={topic.id}>
              {pinnedCount > 0 && idx === pinnedCount && (
                <Separator className="bg-border/60" />
              )}
              <TopicCard
                topic={topic}
                onClick={() => setLocation(`/forum/topics/${topic.id}`)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Stats footer ── */}
      {!isLoading && displayedTopics.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {displayedTopics.length} of {topics.length} topic{topics.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── New topic modal ── */}
      {schoolId && (
        <NewTopicModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          courses={courses}
          programs={programs}
          onCreated={() => fetchTopics()}
        />
      )}
    </div>
  );
}
