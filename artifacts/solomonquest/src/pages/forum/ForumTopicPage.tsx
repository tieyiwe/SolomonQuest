import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Pin,
  BookOpen,
  School,
  Clock,
  MessageSquare,
  Trash2,
  Send,
  SmilePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

type ReactionType = "like" | "heart" | "celebrate";

interface ReactionCounts {
  like: number;
  heart: number;
  celebrate: number;
}

interface UserReactions {
  like: boolean;
  heart: boolean;
  celebrate: boolean;
}

interface ForumTopic {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string | null;
  created_at: string;
  updated_at: string;
  reaction_counts: ReactionCounts;
  user_reactions?: UserReactions;
  course_id: string | null;
  course_name?: string | null;
  is_pinned: boolean;
  school_id: string;
}

interface ForumComment {
  id: string;
  topic_id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string | null;
  created_at: string;
  reaction_counts: ReactionCounts;
  user_reactions?: UserReactions;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(dateStr: string) {
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
  return formatDate(dateStr);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function defaultReactions(): ReactionCounts {
  return { like: 0, heart: 0, celebrate: 0 };
}

function defaultUserReactions(): UserReactions {
  return { like: false, heart: false, celebrate: false };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm"
      ? "w-7 h-7 text-[10px]"
      : size === "lg"
      ? "w-11 h-11 text-sm"
      : "w-9 h-9 text-xs";
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
        "rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 select-none",
        dim
      )}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Reaction Bar ─────────────────────────────────────────────────────────────

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "heart", emoji: "❤️", label: "Love" },
  { type: "celebrate", emoji: "🎉", label: "Celebrate" },
];

function ReactionBar({
  counts,
  userReactions,
  onReact,
  disabled,
}: {
  counts: ReactionCounts;
  userReactions: UserReactions;
  onReact: (type: ReactionType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {REACTIONS.map(({ type, emoji, label }) => {
        const count = counts[type] ?? 0;
        const active = userReactions[type] ?? false;
        return (
          <button
            key={type}
            onClick={() => onReact(type)}
            disabled={disabled}
            title={label}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
              "hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className="text-base leading-none">{emoji}</span>
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Comment Card ─────────────────────────────────────────────────────────────

function CommentCard({
  comment,
  currentUserId,
  onDelete,
  onReact,
}: {
  comment: ForumComment;
  currentUserId?: string;
  onDelete: (id: string) => void;
  onReact: (commentId: string, type: ReactionType) => void;
}) {
  const [reacting, setReacting] = useState(false);
  const isOwn = currentUserId && comment.author_id === currentUserId;

  async function handleReact(type: ReactionType) {
    setReacting(true);
    await onReact(comment.id, type);
    setReacting(false);
  }

  return (
    <div className="flex gap-3 group">
      {/* Avatar */}
      <div className="pt-0.5">
        <Avatar name={comment.author_name} url={comment.author_avatar_url} size="sm" />
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-muted/50 border border-border/60 px-4 py-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">{comment.author_name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock size={10} />
                {formatRelative(comment.created_at)}
              </span>
            </div>
            {isOwn && (
              <button
                onClick={() => onDelete(comment.id)}
                className={cn(
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  "text-muted-foreground hover:text-destructive text-xs flex items-center gap-1 rounded px-1.5 py-0.5",
                  "hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                )}
                title="Delete comment"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>

          {/* Content */}
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {comment.content}
          </p>
        </div>

        {/* Reaction bar below bubble */}
        <div className="mt-2 pl-1">
          <ReactionBar
            counts={comment.reaction_counts ?? defaultReactions()}
            userReactions={comment.user_reactions ?? defaultUserReactions()}
            onReact={handleReact}
            disabled={reacting}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ForumTopicPage() {
  const { user } = useAuth();
  const params = useParams<{ topicId: string }>();
  const topicId = params.topicId ?? "";
  const [, setLocation] = useLocation();

  const [topic, setTopic] = useState<ForumTopic | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [isLoadingTopic, setIsLoadingTopic] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [topicReacting, setTopicReacting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch topic ──
  const fetchTopic = useCallback(async () => {
    if (!topicId) return;
    setIsLoadingTopic(true);
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}`);
      if (!res.ok) throw new Error("Topic not found");
      const data: ForumTopic = await res.json();
      setTopic(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load topic.");
    } finally {
      setIsLoadingTopic(false);
    }
  }, [topicId]);

  // ── Fetch comments ──
  const fetchComments = useCallback(async () => {
    if (!topicId) return;
    setIsLoadingComments(true);
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      const data: ForumComment[] = await res.json();
      setComments(data);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load comments.");
    } finally {
      setIsLoadingComments(false);
    }
  }, [topicId]);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!topicId) return;

    const channel = supabase
      .channel(`forum_topic_${topicId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "forum_comments",
          filter: `topic_id=eq.${topicId}`,
        },
        (payload) => {
          const newRow = payload.new as ForumComment;
          setComments((prev) => {
            if (prev.some((c) => c.id === newRow.id)) return prev;
            return [
              ...prev,
              {
                ...newRow,
                reaction_counts: newRow.reaction_counts ?? defaultReactions(),
                user_reactions: newRow.user_reactions ?? defaultUserReactions(),
              },
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "forum_comments",
          filter: `topic_id=eq.${topicId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setComments((prev) => prev.filter((c) => c.id !== deleted.id));
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [topicId]);

  useEffect(() => {
    fetchTopic();
    fetchComments();
  }, [fetchTopic, fetchComments]);

  // ── Topic reaction ──
  async function handleTopicReact(type: ReactionType) {
    if (!topic) return;
    setTopicReacting(true);

    const wasActive = topic.user_reactions?.[type] ?? false;

    // Optimistic update
    setTopic((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        reaction_counts: {
          ...prev.reaction_counts,
          [type]: (prev.reaction_counts[type] ?? 0) + (wasActive ? -1 : 1),
        },
        user_reactions: {
          ...(prev.user_reactions ?? defaultUserReactions()),
          [type]: !wasActive,
        },
      };
    });

    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}/react`, {
        method: "POST",
        body: JSON.stringify({ reaction: type }),
      });
      if (!res.ok) throw new Error("Failed to react");
      // Optionally sync server counts
      const data = await res.json().catch(() => null);
      if (data?.reaction_counts) {
        setTopic((prev) =>
          prev ? { ...prev, reaction_counts: data.reaction_counts } : prev
        );
      }
    } catch (err: any) {
      // Revert
      setTopic((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          reaction_counts: {
            ...prev.reaction_counts,
            [type]: (prev.reaction_counts[type] ?? 0) + (wasActive ? 1 : -1),
          },
          user_reactions: {
            ...(prev.user_reactions ?? defaultUserReactions()),
            [type]: wasActive,
          },
        };
      });
      toast.error(err?.message ?? "Could not react.");
    } finally {
      setTopicReacting(false);
    }
  }

  // ── Comment reaction ──
  async function handleCommentReact(commentId: string, type: ReactionType) {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    const wasActive = comment.user_reactions?.[type] ?? false;

    // Optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        return {
          ...c,
          reaction_counts: {
            ...c.reaction_counts,
            [type]: (c.reaction_counts[type] ?? 0) + (wasActive ? -1 : 1),
          },
          user_reactions: {
            ...(c.user_reactions ?? defaultUserReactions()),
            [type]: !wasActive,
          },
        };
      })
    );

    try {
      const res = await apiFetch(`/api/forum/comments/${commentId}/react`, {
        method: "POST",
        body: JSON.stringify({ reaction: type }),
      });
      if (!res.ok) throw new Error("Failed to react");
      const data = await res.json().catch(() => null);
      if (data?.reaction_counts) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, reaction_counts: data.reaction_counts } : c
          )
        );
      }
    } catch (err: any) {
      // Revert
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c;
          return {
            ...c,
            reaction_counts: {
              ...c.reaction_counts,
              [type]: (c.reaction_counts[type] ?? 0) + (wasActive ? 1 : -1),
            },
            user_reactions: {
              ...(c.user_reactions ?? defaultUserReactions()),
              [type]: wasActive,
            },
          };
        })
      );
      toast.error(err?.message ?? "Could not react.");
    }
  }

  // ── Delete comment ──
  async function handleDeleteComment(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    setDeletingIds((prev) => new Set(prev).add(commentId));
    try {
      const res = await apiFetch(`/api/forum/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete comment");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success("Comment deleted.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not delete comment.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
    }
  }

  // ── Submit comment ──
  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return toast.error("Comment cannot be empty.");
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/forum/topics/${topicId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? "Failed to post comment");
      }
      setNewComment("");
      fetchComments(); // fallback refresh; realtime handles live append
      toast.success("Comment posted.");
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoadingTopic) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-4 w-28" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-7 h-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 flex flex-col items-center gap-4 text-muted-foreground">
        <MessageSquare size={48} className="opacity-20" />
        <p className="text-lg font-semibold">Topic not found</p>
        <Button variant="outline" onClick={() => setLocation("/forum")}>
          <ArrowLeft size={15} className="mr-1.5" />
          Back to Forum
        </Button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* ── Back navigation ── */}
      <button
        onClick={() => setLocation("/forum")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft
          size={15}
          className="group-hover:-translate-x-0.5 transition-transform"
        />
        Back to Forum
      </button>

      {/* ── Topic card ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Topic header */}
        <div className="px-6 pt-6 pb-5 space-y-3">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            {topic.is_pinned && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 gap-1 text-xs">
                <Pin size={10} />
                Pinned
              </Badge>
            )}
            {topic.course_id ? (
              <Badge className="bg-primary/10 text-primary border-0 gap-1 text-xs hover:bg-primary/10">
                <BookOpen size={10} />
                {topic.course_name ?? "Course"}
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 gap-1 text-xs hover:bg-green-100">
                <School size={10} />
                School-wide
              </Badge>
            )}
          </div>

          {/* Cover image */}
          {topic.coverImage && (
            <div className="w-full rounded-lg overflow-hidden border border-border max-h-64">
              <img src={topic.coverImage} alt="Topic cover" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Title */}
          <h1 className="text-xl font-bold leading-snug text-foreground">{topic.title}</h1>

          {/* Author + date */}
          <div className="flex items-center gap-3">
            <Avatar name={topic.author_name} url={topic.author_avatar_url} size="md" />
            <div>
              <p className="text-sm font-semibold text-foreground leading-none">
                {topic.author_name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock size={10} />
                {formatDate(topic.created_at)}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Topic body */}
        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {topic.content}
          </p>
        </div>

        <Separator />

        {/* Reactions */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <SmilePlus size={13} />
              React:
            </span>
            <ReactionBar
              counts={topic.reaction_counts ?? defaultReactions()}
              userReactions={topic.user_reactions ?? defaultUserReactions()}
              onReact={handleTopicReact}
              disabled={topicReacting}
            />
          </div>
        </div>
      </div>

      {/* ── Comments section ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <MessageSquare size={16} className="text-primary" />
            {isLoadingComments
              ? "Replies"
              : `${comments.length} ${comments.length === 1 ? "Reply" : "Replies"}`}
          </h2>
        </div>

        {isLoadingComments ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-7 h-7 rounded-full shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-14 rounded-xl" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-12 rounded-full" />
                    <Skeleton className="h-6 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-sm font-medium">No replies yet</p>
            <p className="text-xs">Be the first to respond to this topic.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                currentUserId={user?.id}
                onDelete={handleDeleteComment}
                onReact={handleCommentReact}
              />
            ))}
            <div ref={commentEndRef} />
          </div>
        )}
      </div>

      {/* ── Add comment ── */}
      {user ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/20">
            <div className="flex items-center gap-3">
              <Avatar
                name={[user.first_name, user.last_name].filter(Boolean).join(" ") || "Me"}
                url={(user as any).avatar_url}
                size="sm"
              />
              <span className="text-sm font-medium text-foreground">
                Leave a reply
              </span>
            </div>
          </div>
          <form onSubmit={handleSubmitComment} className="p-4 space-y-3">
            <Textarea
              placeholder="Share your thoughts, ask a question, or add context…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={submitting}
              className="min-h-[120px] resize-y text-sm border-border/60 focus:border-primary/50"
              onKeyDown={(e) => {
                // Ctrl/Cmd+Enter submits
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (newComment.trim() && !submitting) {
                    handleSubmitComment(e as unknown as React.FormEvent);
                  }
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono">Ctrl</kbd>
                {" + "}
                <kbd className="px-1 py-0.5 rounded border text-[10px] font-mono">Enter</kbd>
                {" to submit"}
              </p>
              <Button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="gap-2"
              >
                <Send size={14} />
                {submitting ? "Posting…" : "Post Reply"}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/20 py-10 text-center text-muted-foreground">
          <p className="text-sm">Sign in to leave a reply.</p>
        </div>
      )}
    </div>
  );
}
