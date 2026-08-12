import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function isTeacherOrAdmin(role?: string): boolean {
  return role === "teacher" || role === "admin" || role === "super_admin";
}

/**
 * Confirms the caller may manage the quiz's course: a teacher must own it,
 * an admin must be in the same school, super_admin always passes. Every
 * mutation route in this file previously checked only the caller's ROLE
 * ("is this a teacher or admin?"), never that the quiz's course actually
 * belonged to them — any teacher/admin account in any school could edit
 * questions (including correct_answer), delete, or publish/unpublish any
 * OTHER school's quiz just by knowing/guessing its id.
 */
async function assertCanManageQuiz(
  quizIdParam: string | string[],
  userId: string | undefined,
  role: string | undefined
): Promise<{ ok: true; courseId: string } | { ok: false; status: number; error: string }> {
  const quizId = Array.isArray(quizIdParam) ? quizIdParam[0] : quizIdParam;
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("course_id")
    .eq("id", quizId)
    .single();
  if (!quiz) return { ok: false, status: 404, error: "Quiz not found" };

  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("teacher_id, school_id")
    .eq("id", quiz.course_id as string)
    .single();
  if (!course) return { ok: false, status: 404, error: "Course not found" };

  if (role === "super_admin") return { ok: true, courseId: quiz.course_id as string };
  if (role === "admin") {
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", userId ?? "")
      .single();
    return caller?.school_id === course.school_id
      ? { ok: true, courseId: quiz.course_id as string }
      : { ok: false, status: 403, error: "Forbidden" };
  }
  return course.teacher_id === userId
    ? { ok: true, courseId: quiz.course_id as string }
    : { ok: false, status: 403, error: "You do not teach this course" };
}

// ---------------------------------------------------------------------------
// GET /quizzes?course_id=X - list quizzes for a course
// ---------------------------------------------------------------------------
router.get("/quizzes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { course_id } = req.query;

  if (!course_id) {
    res.status(400).json({ error: "course_id query parameter is required" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("quizzes")
      .select("*")
      .eq("course_id", course_id as string)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data ?? []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /quizzes - create quiz (teacher/admin only)
// ---------------------------------------------------------------------------
router.post("/quizzes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isTeacherOrAdmin(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const {
    course_id,
    title,
    description,
    time_limit_minutes,
    attempt_limit,
    release_scores_immediately,
  } = req.body;

  if (!course_id || !title) {
    res.status(400).json({ error: "course_id and title are required" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("quizzes")
      .insert({
        course_id,
        title,
        description: description ?? null,
        time_limit_minutes: time_limit_minutes ?? null,
        attempt_limit: attempt_limit ?? null,
        release_scores_immediately: release_scores_immediately ?? true,
        is_published: false,
        created_by: req.userId,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /quizzes/:id - get quiz with questions
// ---------------------------------------------------------------------------
router.get("/quizzes/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { id } = req.params;

  try {
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes")
      .select("*")
      .eq("id", id)
      .single();

    if (quizError || !quiz) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }

    const { data: questions, error: qError } = await supabaseAdmin
      .from("quiz_questions")
      .select("*")
      .eq("quiz_id", id)
      .order("order_index", { ascending: true });

    if (qError) {
      res.status(500).json({ error: qError.message });
      return;
    }

    res.json({ ...quiz, questions: questions ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /quizzes/:id - update quiz metadata
// ---------------------------------------------------------------------------
router.put("/quizzes/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isTeacherOrAdmin(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { id } = req.params;

  const access = await assertCanManageQuiz(id, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const {
    title,
    description,
    time_limit_minutes,
    attempt_limit,
    release_scores_immediately,
    is_published,
    due_date,
  } = req.body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (time_limit_minutes !== undefined) updates.time_limit_minutes = time_limit_minutes;
  if (attempt_limit !== undefined) updates.attempt_limit = attempt_limit;
  if (release_scores_immediately !== undefined)
    updates.release_scores_immediately = release_scores_immediately;
  if (is_published !== undefined) updates.is_published = is_published;
  if (due_date !== undefined) updates.due_date = due_date;

  try {
    const { data, error } = await supabaseAdmin
      .from("quizzes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /quizzes/:id - delete quiz
// ---------------------------------------------------------------------------
router.delete("/quizzes/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isTeacherOrAdmin(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { id } = req.params;

  const access = await assertCanManageQuiz(id, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  try {
    const { error } = await supabaseAdmin.from("quizzes").delete().eq("id", id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /quizzes/:id/questions - add question (teacher/admin only)
// ---------------------------------------------------------------------------
router.post(
  "/quizzes/:id/questions",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { id } = req.params;

    const access = await assertCanManageQuiz(id, req.userId, req.userRole);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const { type, question, options, correct_answer, points, order_index } = req.body;

    if (!type || !question) {
      res.status(400).json({ error: "type and question are required" });
      return;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("quiz_questions")
        .insert({
          quiz_id: id,
          type,
          question,
          options: options ?? null,
          correct_answer: correct_answer ?? null,
          points: points ?? 1,
          order_index: order_index ?? 0,
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /quizzes/:id/questions/:qid - update question
// ---------------------------------------------------------------------------
router.put(
  "/quizzes/:id/questions/:qid",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { id, qid } = req.params;

    const access = await assertCanManageQuiz(id, req.userId, req.userRole);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const { type, question, options, correct_answer, points, order_index } = req.body;

    const updates: Record<string, unknown> = {};
    if (type !== undefined) updates.type = type;
    if (question !== undefined) updates.question = question;
    if (options !== undefined) updates.options = options;
    if (correct_answer !== undefined) updates.correct_answer = correct_answer;
    if (points !== undefined) updates.points = points;
    if (order_index !== undefined) updates.order_index = order_index;

    try {
      const { data, error } = await supabaseAdmin
        .from("quiz_questions")
        .update(updates)
        .eq("id", qid)
        .eq("quiz_id", id)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      if (!data) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /quizzes/:id/questions/:qid - delete question
// ---------------------------------------------------------------------------
router.delete(
  "/quizzes/:id/questions/:qid",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { id, qid } = req.params;

    const access = await assertCanManageQuiz(id, req.userId, req.userRole);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    try {
      const { error } = await supabaseAdmin
        .from("quiz_questions")
        .delete()
        .eq("id", qid)
        .eq("quiz_id", id);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.sendStatus(204);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /quizzes/:id/publish - set is_published=true
// ---------------------------------------------------------------------------
router.post(
  "/quizzes/:id/publish",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { id } = req.params;

    const access = await assertCanManageQuiz(id, req.userId, req.userRole);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("quizzes")
        .update({ is_published: true })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      if (!data) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /quizzes/:id/attempts - start attempt (student)
// ---------------------------------------------------------------------------
router.post(
  "/quizzes/:id/attempts",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;
    const userId = req.userId!;

    try {
      // Verify quiz exists and is published
      const { data: quiz, error: quizError } = await supabaseAdmin
        .from("quizzes")
        .select("*")
        .eq("id", id)
        .single();

      if (quizError || !quiz) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }

      if (!quiz.is_published) {
        res.status(400).json({ error: "Quiz is not published" });
        return;
      }

      // Security: verify the student is enrolled in the quiz's course
      const { data: enrollment, error: enrollmentError } = await supabaseAdmin
        .from("course_enrollments")
        .select("id")
        .eq("course_id", quiz.course_id)
        .eq("student_id", userId)
        .maybeSingle();

      if (enrollmentError) {
        res.status(500).json({ error: enrollmentError.message });
        return;
      }

      if (!enrollment) {
        res.status(403).json({ error: "You are not enrolled in this course" });
        return;
      }

      // Check attempt limit before allowing a new attempt
      if (quiz.attempt_limit !== null && quiz.attempt_limit !== undefined) {
        const { count, error: countError } = await supabaseAdmin
          .from("quiz_attempts")
          .select("id", { count: "exact", head: true })
          .eq("quiz_id", id)
          .eq("student_id", userId);

        if (countError) {
          res.status(500).json({ error: countError.message });
          return;
        }

        if ((count ?? 0) >= quiz.attempt_limit) {
          res.status(400).json({ error: "Attempt limit reached" });
          return;
        }
      }

      const { data, error } = await supabaseAdmin
        .from("quiz_attempts")
        .insert({
          quiz_id: id,
          student_id: userId,
          started_at: new Date().toISOString(),
          status: "in_progress",
        })
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /quizzes/:id/attempts/:aid - submit attempt with auto-grading
// ---------------------------------------------------------------------------
router.put(
  "/quizzes/:id/attempts/:aid",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id, aid } = req.params;
    const userId = req.userId!;
    const { answers } = req.body; // { [questionId]: answerValue }

    try {
      // Fetch attempt
      const { data: attempt, error: attemptError } = await supabaseAdmin
        .from("quiz_attempts")
        .select("*")
        .eq("id", aid)
        .eq("quiz_id", id)
        .single();

      if (attemptError || !attempt) {
        res.status(404).json({ error: "Attempt not found" });
        return;
      }

      // Students can only submit their own attempts
      if (!isTeacherOrAdmin(req.userRole) && attempt.student_id !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Fetch all questions for this quiz
      const { data: questions, error: qError } = await supabaseAdmin
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", id);

      if (qError) {
        res.status(500).json({ error: qError.message });
        return;
      }

      const AUTO_GRADE_TYPES = new Set(["multiple_choice", "true_false", "fill_blank"]);
      let totalPoints = 0;
      let earnedPoints = 0;
      const gradedAnswers: Record<string, unknown>[] = [];

      for (const q of questions ?? []) {
        const qid = q.id as string;
        const qPoints = (q.points as number) ?? 1;
        const qType = q.type as string;
        const submittedAnswer = answers ? answers[qid] : undefined;

        totalPoints += qPoints;

        let score: number | null = null;
        let is_correct: boolean | null = null;

        if (AUTO_GRADE_TYPES.has(qType) && submittedAnswer !== undefined) {
          const correctAnswer = q.correct_answer;
          // Case-insensitive comparison for fill_blank, exact for others
          if (qType === "fill_blank") {
            is_correct =
              String(submittedAnswer).trim().toLowerCase() ===
              String(correctAnswer).trim().toLowerCase();
          } else {
            is_correct = String(submittedAnswer) === String(correctAnswer);
          }
          score = is_correct ? qPoints : 0;
          earnedPoints += score;
        }
        // essay and short_answer: score stays null (manual grading)

        gradedAnswers.push({
          question_id: qid,
          submitted_answer: submittedAnswer ?? null,
          is_correct,
          score,
        });
      }

      const totalQPoints = (questions ?? []).reduce(
        (sum: number, q: Record<string, unknown>) => sum + ((q.points as number) ?? 1),
        0
      );
      const scorePercent = totalQPoints > 0 ? (earnedPoints / totalQPoints) * 100 : 0;

      // Update attempt
      const { data: updatedAttempt, error: updateError } = await supabaseAdmin
        .from("quiz_attempts")
        .update({
          submitted_at: new Date().toISOString(),
          answers: answers ?? {},
          graded_answers: gradedAnswers,
          score: scorePercent,
          earned_points: earnedPoints,
          total_points: totalPoints,
          status: "submitted",
        })
        .eq("id", aid)
        .select()
        .single();

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      res.json(updatedAttempt);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /quizzes/:id/attempts - list attempts
// Security: students only see their own attempts; teachers see all for their course.
// ---------------------------------------------------------------------------
router.get(
  "/quizzes/:id/attempts",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { id } = req.params;
    const userId = req.userId!;

    try {
      if (isTeacherOrAdmin(req.userRole)) {
        // Teachers/admins: verify they own the course before seeing all attempts
        if (req.userRole === "teacher") {
          const { data: quiz, error: quizError } = await supabaseAdmin
            .from("quizzes")
            .select("course_id")
            .eq("id", id)
            .single();

          if (quizError || !quiz) {
            res.status(404).json({ error: "Quiz not found" });
            return;
          }

          const { data: course, error: courseError } = await supabaseAdmin
            .from("courses")
            .select("teacher_id")
            .eq("id", quiz.course_id)
            .single();

          if (courseError || !course) {
            res.status(404).json({ error: "Course not found" });
            return;
          }

          if (course.teacher_id !== userId) {
            res.status(403).json({ error: "You do not own this course" });
            return;
          }
        }

        // Admin or verified teacher: return all attempts
        const { data, error } = await supabaseAdmin
          .from("quiz_attempts")
          .select("*")
          .eq("quiz_id", id)
          .order("started_at", { ascending: false });

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        res.json(data ?? []);
      } else {
        // Students: return an attempt summary (used/limit/remaining), not the
        // raw attempt rows — the quiz-take page uses this to decide whether
        // the student can still start a new attempt.
        const { data, error } = await supabaseAdmin
          .from("quiz_attempts")
          .select("*")
          .eq("quiz_id", id)
          .eq("student_id", userId)
          .order("started_at", { ascending: false });

        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }

        const { data: quiz } = await supabaseAdmin
          .from("quizzes")
          .select("attempt_limit")
          .eq("id", id)
          .single();

        const attemptsUsed = (data ?? []).length;
        const attemptLimit = quiz?.attempt_limit ?? null;
        const remainingAttempts = attemptLimit != null ? Math.max(0, attemptLimit - attemptsUsed) : null;

        res.json({
          attempts_used: attemptsUsed,
          attempt_limit: attemptLimit,
          remaining_attempts: remainingAttempts,
          attempts: data ?? [],
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /quizzes/:id/analytics - return average score, attempt count, question breakdown
// ---------------------------------------------------------------------------
router.get(
  "/quizzes/:id/analytics",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { id } = req.params;

    const access = await assertCanManageQuiz(id, req.userId, req.userRole);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    try {
      // Fetch all submitted attempts
      const { data: attempts, error: attemptsError } = await supabaseAdmin
        .from("quiz_attempts")
        .select("*")
        .eq("quiz_id", id)
        .eq("status", "submitted");

      if (attemptsError) {
        res.status(500).json({ error: attemptsError.message });
        return;
      }

      const attemptList = attempts ?? [];
      const attemptCount = attemptList.length;

      const averageScore =
        attemptCount > 0
          ? attemptList.reduce(
              (sum: number, a: Record<string, unknown>) => sum + ((a.score as number) ?? 0),
              0
            ) / attemptCount
          : 0;

      // Fetch questions for breakdown
      const { data: questions, error: qError } = await supabaseAdmin
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", id)
        .order("order_index", { ascending: true });

      if (qError) {
        res.status(500).json({ error: qError.message });
        return;
      }

      // Build per-question breakdown from graded_answers stored on each attempt
      const questionStats: Record<
        string,
        { question: string; type: string; correct: number; incorrect: number; unanswered: number }
      > = {};

      for (const q of questions ?? []) {
        questionStats[q.id as string] = {
          question: q.question as string,
          type: q.type as string,
          correct: 0,
          incorrect: 0,
          unanswered: 0,
        };
      }

      for (const attempt of attemptList) {
        const gradedAnswers = (attempt.graded_answers as Record<string, unknown>[] | null) ?? [];
        for (const ga of gradedAnswers) {
          const qid = ga.question_id as string;
          if (!questionStats[qid]) continue;
          if (ga.is_correct === true) {
            questionStats[qid].correct += 1;
          } else if (ga.is_correct === false) {
            questionStats[qid].incorrect += 1;
          } else {
            questionStats[qid].unanswered += 1;
          }
        }
      }

      res.json({
        quiz_id: id,
        attempt_count: attemptCount,
        average_score: averageScore,
        question_breakdown: Object.entries(questionStats).map(([qid, stats]) => ({
          question_id: qid,
          ...stats,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
