import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function isTeacherOrAdmin(role?: string): boolean {
  return role === "teacher" || role === "admin" || role === "super_admin";
}

function isAdmin(role?: string): boolean {
  return role === "admin" || role === "super_admin";
}

// Pending assignments for current student
router.get("/assignments/pending", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId;

  // Get enrolled courses
  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", userId ?? "")
    .eq("status", "active");

  const courseIds = (enrollments ?? []).map((e: Record<string, unknown>) => e.course_id as string);

  if (courseIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: assignments, error } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .in("course_id", courseIds)
    .eq("is_published", true)
    .order("due_date", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Filter out already submitted
  const { data: submitted } = await supabaseAdmin
    .from("submissions")
    .select("assignment_id")
    .eq("student_id", userId ?? "")
    .in("status", ["submitted", "graded"]);

  const submittedIds = new Set((submitted ?? []).map((s: Record<string, unknown>) => s.assignment_id as string));

  const pending = (assignments ?? []).filter(
    (a: Record<string, unknown>) => !submittedIds.has(a.id as string)
  );

  res.json(await Promise.all(pending.map(enrichAssignment)));
});

// GET /assignments?course_id=X — list assignments for a course with submission info
router.get("/assignments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = Array.isArray(req.query.course_id)
    ? (req.query.course_id[0] as string)
    : (req.query.course_id as string | undefined);

  if (!courseId) {
    res.status(400).json({ error: "course_id query param is required" });
    return;
  }

  let query = supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("course_id", courseId);

  // Students only see published assignments; teachers/admins see drafts too.
  if (!isTeacherOrAdmin(req.userRole)) {
    query = query.eq("is_published", true);
  }

  const { data: assignments, error } = await query.order("due_date", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const userId = req.userId;

  const enriched = await Promise.all(
    (assignments ?? []).map(async (a: Record<string, unknown>) => {
      // Count submissions
      const { count: submissionCount } = await supabaseAdmin
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", a.id as string);

      // Check if current user has submitted
      let hasSubmitted = false;
      if (userId) {
        const { data: mySub } = await supabaseAdmin
          .from("submissions")
          .select("id, grade, status")
          .eq("assignment_id", a.id as string)
          .eq("student_id", userId)
          .single();
        if (mySub) {
          hasSubmitted = true;
        }
      }

      const base = await enrichAssignment(a);
      return {
        ...base,
        submissionCount: submissionCount ?? 0,
        hasSubmitted,
      };
    })
  );

  res.json(enriched);
});

// POST /assignments — create assignment (teacher/admin)
router.post("/assignments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (!isTeacherOrAdmin(role)) {
    res.status(403).json({ error: "Only teachers and admins can create assignments" });
    return;
  }

  const { course_id, title, description, due_date, points, file_url, instructions, assignment_type, video_url, require_full_watch, isPublished } = req.body;

  if (!course_id) {
    res.status(400).json({ error: "course_id is required" });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (due_date && isNaN(Date.parse(due_date))) {
    res.status(400).json({ error: "due_date must be a valid date" });
    return;
  }

  const publishNow = isPublished === true;

  const { data: assignment, error } = await supabaseAdmin
    .from("assignments")
    .insert({
      course_id,
      title,
      description: description ?? null,
      due_date: due_date ?? null,
      points_possible: points ?? null,
      file_url: file_url ?? null,
      instructions: instructions ?? null,
      is_published: publishNow,
      assignment_type: assignment_type ?? "standard",
      video_url: video_url ?? null,
      require_full_watch: require_full_watch ?? false,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (publishNow) {
    await notifyStudentsOfPublish(course_id, assignment.id as string, title, "assignment");
  }

  res.status(201).json(await enrichAssignment(assignment));
});

// PUT /assignments/:id — update assignment (teacher who owns course / admin)
router.put("/assignments/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const role = req.userRole;
  const userId = req.userId;

  // Fetch existing assignment
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("assignments")
    .select("*, courses(teacher_id)")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  // Ownership check for teachers
  if (!isAdmin(role)) {
    const teacherId = (existing.courses as Record<string, unknown> | null)?.teacher_id;
    if (teacherId !== userId) {
      res.status(403).json({ error: "You do not have permission to update this assignment" });
      return;
    }
  }

  const { title, description, due_date, points, file_url, instructions, assignment_type, video_url, require_full_watch, isPublished } = req.body;

  if (due_date !== undefined && due_date !== null && isNaN(Date.parse(due_date))) {
    res.status(400).json({ error: "due_date must be a valid date" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (due_date !== undefined) updates.due_date = due_date;
  if (points !== undefined) updates.points_possible = points;
  if (file_url !== undefined) updates.file_url = file_url;
  if (instructions !== undefined) updates.instructions = instructions;
  if (assignment_type !== undefined) updates.assignment_type = assignment_type;
  if (video_url !== undefined) updates.video_url = video_url;
  if (require_full_watch !== undefined) updates.require_full_watch = require_full_watch;
  if (isPublished !== undefined) updates.is_published = isPublished;

  const wasPublished = existing.is_published === true;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to update assignment" });
    return;
  }

  if (isPublished === true && !wasPublished) {
    await notifyStudentsOfPublish(data.course_id as string, data.id as string, data.title as string, "assignment");
  }

  res.json(await enrichAssignment(data));
});

// DELETE /assignments/:id — delete assignment (teacher who owns course / admin)
router.delete("/assignments/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const role = req.userRole;
  const userId = req.userId;

  // Fetch existing assignment for ownership check
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("assignments")
    .select("*, courses(teacher_id)")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  if (!isAdmin(role)) {
    const teacherId = (existing.courses as Record<string, unknown> | null)?.teacher_id;
    if (teacherId !== userId) {
      res.status(403).json({ error: "You do not have permission to delete this assignment" });
      return;
    }
  }

  const { error } = await supabaseAdmin.from("assignments").delete().eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.sendStatus(204);
});

// List assignments for a course (legacy route by path param)
router.get("/courses/:courseId/assignments", requireAuth, async (req, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("course_id", courseId)
    .order("due_date", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(await Promise.all((data ?? []).map(enrichAssignment)));
});

// Create assignment (legacy route by path param — TeacherAssignments.tsx sends
// a mix of snake_case and camelCase for the same fields, so both are accepted)
router.post(
  "/courses/:courseId/assignments",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Only teachers and admins can create assignments" });
      return;
    }

    if (!isAdmin(req.userRole)) {
      const { data: course } = await supabaseAdmin
        .from("courses")
        .select("teacher_id")
        .eq("id", courseId)
        .single();
      if (!course || course.teacher_id !== req.userId) {
        res.status(403).json({ error: "You do not have permission to add assignments to this course" });
        return;
      }
    }

    const body = req.body ?? {};
    const title = body.title;
    const description = body.description;
    const dueDate = body.due_date ?? body.dueDate;
    const pointsPossible = body.points ?? body.pointsPossible;
    const fileUrl = body.file_url ?? body.fileUrl;
    const instructions = body.instructions;
    const assignmentType = body.assignment_type ?? body.assignmentType ?? "standard";
    const videoUrl = body.video_url ?? body.videoUrl;
    const requireFullWatch = body.require_full_watch ?? body.requireFullWatch ?? false;
    const isPublished = body.isPublished === true;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (dueDate && isNaN(Date.parse(dueDate))) {
      res.status(400).json({ error: "due_date must be a valid date" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("assignments")
      .insert({
        course_id: courseId,
        title,
        description: description ?? null,
        due_date: dueDate ?? null,
        points_possible: pointsPossible ?? null,
        file_url: fileUrl ?? null,
        instructions: instructions ?? null,
        is_published: isPublished,
        assignment_type: assignmentType,
        video_url: videoUrl ?? null,
        require_full_watch: requireFullWatch,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (isPublished) {
      await notifyStudentsOfPublish(courseId, data.id as string, title, "assignment");
    }

    res.status(201).json(await enrichAssignment(data));
  }
);

// Get assignment
router.get("/assignments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.json(await enrichAssignment(data));
});

// Update assignment (PATCH - legacy — accepts the same mixed-casing body as
// the create route above, and enforces the same ownership rule PUT does)
router.patch("/assignments/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("assignments")
    .select("*, courses(teacher_id)")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  if (!isAdmin(req.userRole)) {
    const teacherId = (existing.courses as Record<string, unknown> | null)?.teacher_id;
    if (teacherId !== req.userId) {
      res.status(403).json({ error: "You do not have permission to update this assignment" });
      return;
    }
  }

  const body = req.body ?? {};
  const title = body.title;
  const description = body.description;
  const dueDate = body.due_date ?? body.dueDate;
  const pointsPossible = body.points ?? body.pointsPossible;
  const fileUrl = body.file_url ?? body.fileUrl;
  const instructions = body.instructions;
  const assignmentType = body.assignment_type ?? body.assignmentType;
  const videoUrl = body.video_url ?? body.videoUrl;
  const requireFullWatch = body.require_full_watch ?? body.requireFullWatch;
  const isPublished = body.isPublished;

  if (dueDate !== undefined && dueDate !== null && isNaN(Date.parse(dueDate))) {
    res.status(400).json({ error: "due_date must be a valid date" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (dueDate !== undefined) updates.due_date = dueDate;
  if (pointsPossible !== undefined) updates.points_possible = pointsPossible;
  if (fileUrl !== undefined) updates.file_url = fileUrl;
  if (instructions !== undefined) updates.instructions = instructions;
  if (isPublished !== undefined) updates.is_published = isPublished;
  if (assignmentType !== undefined) updates.assignment_type = assignmentType;
  if (videoUrl !== undefined) updates.video_url = videoUrl;
  if (requireFullWatch !== undefined) updates.require_full_watch = requireFullWatch;

  const wasPublished = existing.is_published === true;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  if (isPublished === true && !wasPublished) {
    await notifyStudentsOfPublish(data.course_id as string, data.id as string, data.title as string, "assignment");
  }

  res.json(await enrichAssignment(data));
});

async function notifyStudentsOfPublish(courseId: string, referenceId: string, title: string, type: string) {
  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id")
    .eq("course_id", courseId)
    .eq("status", "active");

  if (!enrollments || enrollments.length === 0) return;

  const notifications = enrollments.map((e: Record<string, unknown>) => ({
    user_id: e.student_id as string,
    title: "New Assignment",
    message: `A new assignment "${title}" has been posted.`,
    type,
    reference_id: referenceId,
    is_read: false,
  }));

  await supabaseAdmin.from("notifications").insert(notifications);
}

async function enrichAssignment(a: Record<string, unknown>) {
  let courseTitle: string | null = null;

  if (a.course_id) {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("title")
      .eq("id", a.course_id as string)
      .single();
    if (course) courseTitle = course.title;
  }

  return {
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    fileUrl: a.file_url,
    dueDate: a.due_date,
    pointsPossible: a.points_possible,
    isPublished: a.is_published,
    courseTitle,
    assignmentType: (a.assignment_type as string) ?? "standard",
    videoUrl: (a.video_url as string | null) ?? null,
    requireFullWatch: (a.require_full_watch as boolean) ?? false,
  };
}

export default router;
