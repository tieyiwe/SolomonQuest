import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Content length limits
// ---------------------------------------------------------------------------
const TITLE_MAX_LENGTH = 255;
const CONTENT_MAX_LENGTH = 10000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, avatar_url")
    .eq("id", userId)
    .single();
  return data ?? null;
}

async function createNotification(
  userId: string,
  title: string,
  link: string
) {
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    title,
    link,
    is_read: false,
  });
}

async function getMentions(topicId?: string, commentId?: string) {
  let query = supabaseAdmin.from("forum_mentions").select("mentioned_user_id");
  query = topicId ? query.eq("topic_id", topicId) : query.eq("comment_id", commentId as string);
  const { data } = await query;
  const userIds = (data ?? []).map((m) => m.mentioned_user_id as string);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", userIds);

  return (profiles ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
  }));
}

/**
 * Records @-mentions for a newly created topic/comment and notifies each
 * mentioned user (skipping the author). userIds are trusted to already be
 * validated (same-school) by the caller.
 */
async function recordMentions(
  userIds: string[],
  target: { topicId?: string; commentId?: string },
  authorId: string | undefined,
  notifTitle: string,
  notifLink: string
) {
  const unique = Array.from(new Set(userIds)).filter((id) => id !== authorId);
  if (unique.length === 0) return;

  await supabaseAdmin.from("forum_mentions").insert(
    unique.map((mentionedUserId) => ({
      topic_id: target.topicId ?? null,
      comment_id: target.commentId ?? null,
      mentioned_user_id: mentionedUserId,
    }))
  );

  await Promise.all(unique.map((uid) => createNotification(uid, notifTitle, notifLink)));
}

/**
 * Validates that every id in mentionedUserIds actually belongs to this
 * school, dropping any that don't rather than erroring — a stale/forged id
 * in the mention list shouldn't block posting.
 */
async function filterValidMentionIds(
  mentionedUserIds: unknown,
  schoolId: string | null | undefined
): Promise<string[]> {
  if (!Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) return [];
  const ids = mentionedUserIds.filter((id): id is string => typeof id === "string").slice(0, 20);
  if (ids.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("school_id", schoolId ?? "");

  return (data ?? []).map((p) => p.id as string);
}

/**
 * Whether the caller may see a topic scoped to this course/program.
 * Unscoped topics (no course_id and no program_id) are open to the whole
 * school. A course-scoped topic is visible to admins, the course's own
 * teacher, and actively-enrolled students/staff. A program-scoped topic
 * follows the same rule across every course in that program.
 */
async function canAccessForumScope(
  req: AuthenticatedRequest,
  courseId: string | null,
  programId: string | null
): Promise<boolean> {
  if (req.userRole === "admin" || req.userRole === "super_admin") return true;
  if (!courseId && !programId) return true;

  if (courseId) {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("teacher_id")
      .eq("id", courseId)
      .maybeSingle();
    if (!course) return false;
    if (req.userRole === "teacher") return course.teacher_id === req.userId;
    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", courseId)
      .eq("student_id", req.userId ?? "")
      .eq("status", "active")
      .maybeSingle();
    return !!enrollment;
  }

  const { data: courses } = await supabaseAdmin
    .from("courses")
    .select("id, teacher_id")
    .eq("program_id", programId as string);
  const courseIds = (courses ?? []).map((c) => c.id as string);

  if (req.userRole === "teacher") return (courses ?? []).some((c) => c.teacher_id === req.userId);
  if (courseIds.length === 0) return false;

  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id")
    .in("course_id", courseIds)
    .eq("student_id", req.userId ?? "")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return !!enrollment;
}

async function enrichTopic(topic: Record<string, unknown>) {
  const [profile, commentCountRes, reactionCountRes, mentions] = await Promise.all([
    topic.posted_by ? getProfile(topic.posted_by as string) : Promise.resolve(null),
    supabaseAdmin
      .from("forum_comments")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id as string),
    supabaseAdmin
      .from("forum_reactions")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id as string),
    getMentions(topic.id as string, undefined),
  ]);

  return {
    id: topic.id,
    schoolId: topic.school_id,
    courseId: topic.course_id,
    programId: topic.program_id ?? null,
    title: topic.title,
    content: topic.content,
    coverImage: topic.cover_image ?? null,
    isPinned: topic.is_pinned,
    postedBy: topic.posted_by,
    postedByProfile: profile,
    commentCount: commentCountRes.count ?? 0,
    reactionCount: reactionCountRes.count ?? 0,
    mentions,
    createdAt: topic.created_at,
    updatedAt: topic.updated_at,
  };
}

async function enrichComment(comment: Record<string, unknown>) {
  const [profile, reactionCountRes, mentions] = await Promise.all([
    comment.posted_by ? getProfile(comment.posted_by as string) : Promise.resolve(null),
    supabaseAdmin
      .from("forum_reactions")
      .select("id", { count: "exact", head: true })
      .eq("comment_id", comment.id as string),
    getMentions(undefined, comment.id as string),
  ]);

  return {
    id: comment.id,
    topicId: comment.topic_id,
    content: comment.content,
    postedBy: comment.posted_by,
    postedByProfile: profile,
    reactionCount: reactionCountRes.count ?? 0,
    mentions,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /forum/topics — list topics
// ---------------------------------------------------------------------------
router.get(
  "/forum/topics",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    let query = supabaseAdmin
      .from("forum_topics")
      .select("*")
      .eq("school_id", req.schoolId ?? "")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (req.query.courseId) {
      query = query.eq("course_id", req.query.courseId as string);
    }
    if (req.query.programId) {
      query = query.eq("program_id", req.query.programId as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // A course/program-scoped topic is only visible to admins, the
    // course's teacher, and its actively-enrolled students/staff — a
    // student shouldn't see another class's forum just by knowing/guessing
    // its courseId.
    const visible: Record<string, unknown>[] = [];
    for (const topic of data ?? []) {
      const ok = await canAccessForumScope(
        req,
        (topic.course_id as string | null) ?? null,
        (topic.program_id as string | null) ?? null
      );
      if (ok) visible.push(topic);
    }

    const topics = await Promise.all(visible.map(enrichTopic));
    res.json(topics);
  }
);

// ---------------------------------------------------------------------------
// POST /forum/topics — create topic (teacher/admin only)
// ---------------------------------------------------------------------------
router.post(
  "/forum/topics",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    // Role check: only teachers and admins (including super_admin) may create topics
    if (
      req.userRole !== "teacher" &&
      req.userRole !== "admin" &&
      req.userRole !== "super_admin"
    ) {
      res.status(403).json({ error: "Only teachers and admins can create topics" });
      return;
    }

    const { courseId, programId, isPinned, mentionedUserIds } = req.body;

    // Content sanitization: trim and enforce length limits
    const title: string = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const content: string =
      typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    if (title.length > TITLE_MAX_LENGTH) {
      res.status(400).json({
        error: `title must be at most ${TITLE_MAX_LENGTH} characters`,
      });
      return;
    }

    if (content.length > CONTENT_MAX_LENGTH) {
      res.status(400).json({
        error: `content must be at most ${CONTENT_MAX_LENGTH} characters`,
      });
      return;
    }

    // A teacher may only scope a topic to a course/program they actually
    // teach in — admins can scope to anything in their own school.
    if ((courseId || programId) && req.userRole === "teacher") {
      const ok = await canAccessForumScope(req, courseId ?? null, programId ?? null);
      if (!ok) {
        res.status(403).json({ error: "You can only post to a class or program you teach" });
        return;
      }
    }

    const coverImage = typeof req.body.coverImage === "string" ? req.body.coverImage.trim() : null;

    const { data, error } = await supabaseAdmin
      .from("forum_topics")
      .insert({
        school_id: req.schoolId,
        title,
        content: content || null,
        course_id: courseId ?? null,
        program_id: programId ?? null,
        is_pinned: isPinned ?? false,
        posted_by: req.userId,
        cover_image: coverImage || null,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const validMentionIds = await filterValidMentionIds(mentionedUserIds, req.schoolId);
    await recordMentions(
      validMentionIds,
      { topicId: data.id as string },
      req.userId,
      `You were mentioned in: ${title}`,
      `/forum/topics/${data.id as string}`
    );

    res.status(201).json(await enrichTopic(data));
  }
);

// ---------------------------------------------------------------------------
// GET /forum/topics/:topicId — single topic with comments and reactions
// ---------------------------------------------------------------------------
router.get(
  "/forum/topics/:topicId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;

    const { data: topic, error: topicError } = await supabaseAdmin
      .from("forum_topics")
      .select("*")
      .eq("id", topicId)
      .single();

    if (topicError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    if (req.userRole !== "super_admin" && topic.school_id !== req.schoolId) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const canAccess = await canAccessForumScope(
      req,
      (topic.course_id as string | null) ?? null,
      (topic.program_id as string | null) ?? null
    );
    if (!canAccess) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const [enrichedTopic, commentsRes, topicReactionsRes] = await Promise.all([
      enrichTopic(topic),
      supabaseAdmin
        .from("forum_comments")
        .select("*")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("forum_reactions")
        .select("*")
        .eq("topic_id", topicId),
    ]);

    if (commentsRes.error) {
      res.status(500).json({ error: commentsRes.error.message });
      return;
    }

    const enrichedComments = await Promise.all(
      (commentsRes.data ?? []).map(enrichComment)
    );

    // Attach per-comment reactions
    const commentIds = (commentsRes.data ?? []).map((c) => c.id as string);
    let commentReactions: Record<string, unknown>[] = [];
    if (commentIds.length > 0) {
      const { data: cr } = await supabaseAdmin
        .from("forum_reactions")
        .select("*")
        .in("comment_id", commentIds);
      commentReactions = cr ?? [];
    }

    const commentsWithReactions = enrichedComments.map((c) => ({
      ...c,
      reactions: commentReactions.filter((r) => r.comment_id === c.id),
    }));

    res.json({
      ...enrichedTopic,
      reactions: topicReactionsRes.data ?? [],
      comments: commentsWithReactions,
    });
  }
);

// ---------------------------------------------------------------------------
// POST /forum/topics/:topicId/comments — add comment
// Any authenticated user may comment (open participation).
// NOTE: Rate limiting should be enforced at the infrastructure/middleware level
// (e.g. express-rate-limit) to prevent comment spam. Consider limiting to
// ~10 comments per user per minute per topic.
// ---------------------------------------------------------------------------
router.post(
  "/forum/topics/:topicId/comments",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;

    // Content sanitization: trim and enforce length limit
    const content: string =
      typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    if (content.length > CONTENT_MAX_LENGTH) {
      res.status(400).json({
        error: `content must be at most ${CONTENT_MAX_LENGTH} characters`,
      });
      return;
    }

    // Verify topic exists
    const { data: topic, error: topicError } = await supabaseAdmin
      .from("forum_topics")
      .select("id, title, posted_by, course_id, program_id")
      .eq("id", topicId)
      .single();

    if (topicError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const canAccess = await canAccessForumScope(
      req,
      (topic.course_id as string | null) ?? null,
      (topic.program_id as string | null) ?? null
    );
    if (!canAccess) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const { data: newComment, error: insertError } = await supabaseAdmin
      .from("forum_comments")
      .insert({
        topic_id: topicId,
        content,
        posted_by: req.userId,
      })
      .select()
      .single();

    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }

    // Collect users to notify: topic author + all previous commenters
    const { data: prevComments } = await supabaseAdmin
      .from("forum_comments")
      .select("posted_by")
      .eq("topic_id", topicId)
      .neq("id", newComment.id);

    const usersToNotify = new Set<string>();

    if (topic.posted_by) {
      usersToNotify.add(topic.posted_by as string);
    }
    for (const c of prevComments ?? []) {
      if (c.posted_by) usersToNotify.add(c.posted_by as string);
    }
    // Do not notify the commenter themselves
    usersToNotify.delete(req.userId ?? "");

    const notifTitle = `New comment on: ${topic.title as string}`;
    const notifLink = `/forum/topics/${topicId}`;

    await Promise.all(
      Array.from(usersToNotify).map((uid) =>
        createNotification(uid, notifTitle, notifLink)
      )
    );

    const validMentionIds = await filterValidMentionIds(req.body.mentionedUserIds, req.schoolId);
    await recordMentions(
      validMentionIds,
      { commentId: newComment.id as string },
      req.userId,
      `You were mentioned in a comment on: ${topic.title as string}`,
      notifLink
    );

    res.status(201).json(await enrichComment(newComment));
  }
);

// ---------------------------------------------------------------------------
// POST /forum/topics/:topicId/react — react to topic
// ---------------------------------------------------------------------------
router.post(
  "/forum/topics/:topicId/react",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;
    const { reaction } = req.body;

    if (!reaction) {
      res.status(400).json({ error: "reaction is required" });
      return;
    }

    // Verify topic exists and get author
    const { data: topic, error: topicError } = await supabaseAdmin
      .from("forum_topics")
      .select("id, title, posted_by")
      .eq("id", topicId)
      .single();

    if (topicError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("forum_reactions")
      .upsert(
        {
          topic_id: topicId,
          comment_id: null,
          user_id: req.userId,
          reaction,
        },
        { onConflict: "topic_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Notify topic author if not self
    const authorId = topic.posted_by as string | null;
    if (authorId && authorId !== req.userId) {
      await createNotification(
        authorId,
        `Someone reacted to your topic: ${topic.title as string}`,
        `/forum/topics/${topicId}`
      );
    }

    res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// POST /forum/comments/:commentId/react — react to comment
// ---------------------------------------------------------------------------
router.post(
  "/forum/comments/:commentId/react",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { commentId } = req.params;
    const { reaction } = req.body;

    if (!reaction) {
      res.status(400).json({ error: "reaction is required" });
      return;
    }

    // Verify comment exists and get author + topic info
    const { data: comment, error: commentError } = await supabaseAdmin
      .from("forum_comments")
      .select("id, posted_by, topic_id")
      .eq("id", commentId)
      .single();

    if (commentError || !comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("forum_reactions")
      .upsert(
        {
          topic_id: null,
          comment_id: commentId,
          user_id: req.userId,
          reaction,
        },
        { onConflict: "comment_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Notify comment author if not self
    const authorId = comment.posted_by as string | null;
    if (authorId && authorId !== req.userId) {
      await createNotification(
        authorId,
        "Someone reacted to your comment",
        `/forum/topics/${comment.topic_id as string}`
      );
    }

    res.status(201).json(data);
  }
);

// ---------------------------------------------------------------------------
// DELETE /forum/topics/:topicId — delete topic (admin or teacher who posted)
// ---------------------------------------------------------------------------
router.delete(
  "/forum/topics/:topicId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { topicId } = req.params;

    const { data: topic, error: fetchError } = await supabaseAdmin
      .from("forum_topics")
      .select("id, posted_by")
      .eq("id", topicId)
      .single();

    if (fetchError || !topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    const isOwnerTeacher =
      req.userRole === "teacher" && topic.posted_by === req.userId;

    if (!isAdmin && !isOwnerTeacher) {
      res.status(403).json({ error: "Not authorized to delete this topic" });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("forum_topics")
      .delete()
      .eq("id", topicId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.sendStatus(204);
  }
);

// ---------------------------------------------------------------------------
// DELETE /forum/comments/:commentId — delete comment (poster or admin)
// ---------------------------------------------------------------------------
router.delete(
  "/forum/comments/:commentId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { commentId } = req.params;

    const { data: comment, error: fetchError } = await supabaseAdmin
      .from("forum_comments")
      .select("id, posted_by")
      .eq("id", commentId)
      .single();

    if (fetchError || !comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    const isPoster = comment.posted_by === req.userId;

    if (!isAdmin && !isPoster) {
      res.status(403).json({ error: "Not authorized to delete this comment" });
      return;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("forum_comments")
      .delete()
      .eq("id", commentId);

    if (deleteError) {
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.sendStatus(204);
  }
);

// ---------------------------------------------------------------------------
// GET /forum/mentionable-users?q= — @-mention autocomplete. Any teacher,
// student, staff, or admin/super_admin in the caller's own school can be
// tagged, matched by name against the search term.
// ---------------------------------------------------------------------------
router.get(
  "/forum/mentionable-users",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    let query = supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("school_id", req.schoolId ?? "")
      .neq("id", req.userId ?? "")
      .limit(20);

    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(
      (data ?? []).map((p) => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        role: p.role,
      }))
    );
  }
);

export default router;
