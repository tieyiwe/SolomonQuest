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

export interface RubricCriterion {
  id: string;
  name: string;
  maxPoints: number;
}

/** Validates a rubric shape from request input; returns null (valid, possibly empty) or an error string. */
function validateRubric(input: unknown): { rubric: RubricCriterion[] | null; error: string | null } {
  if (input === undefined || input === null) return { rubric: null, error: null };
  if (!Array.isArray(input)) return { rubric: null, error: "rubric must be an array of criteria" };
  if (input.length === 0) return { rubric: null, error: null };

  const seenIds = new Set<string>();
  const rubric: RubricCriterion[] = [];
  for (const raw of input) {
    const c = raw as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id ? c.id : null;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const maxPoints = typeof c.maxPoints === "number" ? c.maxPoints : Number(c.maxPoints);
    if (!id || seenIds.has(id)) return { rubric: null, error: "Each rubric criterion needs a unique id" };
    if (!name) return { rubric: null, error: "Each rubric criterion needs a name" };
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { rubric: null, error: `Criterion "${name}" needs a positive maxPoints value` };
    }
    seenIds.add(id);
    rubric.push({ id, name, maxPoints });
  }
  return { rubric, error: null };
}

/**
 * Confirms the caller may manage this assignment's course: a teacher must
 * own the course, an admin must be in the same school as it, super_admin
 * always passes. Every admin-bypass check below previously only asked "is
 * this caller an admin?" with no comparison to the course's own school —
 * any school's admin could edit/delete/publish another school's
 * assignments, or plant a new one, just by knowing/guessing the id.
 */
async function assertCanManageAssignmentCourse(
  courseId: string,
  userId: string | undefined,
  role: string | undefined
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("teacher_id, school_id")
    .eq("id", courseId)
    .single();

  if (!course) return { ok: false, status: 404, error: "Course not found" };
  if (role === "super_admin") return { ok: true };
  if (role === "admin") {
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", userId ?? "")
      .single();
    return caller?.school_id === course.school_id
      ? { ok: true }
      : { ok: false, status: 403, error: "Forbidden" };
  }
  return course.teacher_id === userId
    ? { ok: true }
    : { ok: false, status: 403, error: "You do not have permission to manage this assignment" };
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

  // Security: this previously had no tenant check at all — any
  // authenticated user could pass any other school's course_id and read
  // its (published) assignment list, since only role determined whether
  // drafts were included, never whether the course belonged to the
  // caller's school.
  const { data: courseForAccess } = await supabaseAdmin
    .from("courses")
    .select("school_id, title")
    .eq("id", courseId)
    .maybeSingle();

  if (!courseForAccess) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  if (req.userRole !== "super_admin" && courseForAccess.school_id !== req.schoolId) {
    res.status(404).json({ error: "Course not found" });
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
  const assignmentIds = (assignments ?? []).map((a) => a.id as string);

  // These used to run per-assignment (submission count + "did I submit"
  // check + a course-title lookup that's identical for every row here,
  // since the whole list is already scoped to one course_id) — a course
  // with 20 assignments meant 60+ extra round-trips to render one page.
  // Batched into 3 queries total regardless of list size.
  const [submissionCountRows, mySubmissionRows] = await Promise.all([
    assignmentIds.length > 0
      ? supabaseAdmin.from("submissions").select("assignment_id").in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [] as { assignment_id: string }[] }),
    userId && assignmentIds.length > 0
      ? supabaseAdmin
          .from("submissions")
          .select("assignment_id")
          .in("assignment_id", assignmentIds)
          .eq("student_id", userId)
      : Promise.resolve({ data: [] as { assignment_id: string }[] }),
  ]);

  const submissionCounts = new Map<string, number>();
  for (const row of submissionCountRows.data ?? []) {
    const id = row.assignment_id as string;
    submissionCounts.set(id, (submissionCounts.get(id) ?? 0) + 1);
  }
  const submittedSet = new Set((mySubmissionRows.data ?? []).map((row) => row.assignment_id as string));
  const courseTitle = courseForAccess.title ?? null;

  const enriched = (assignments ?? []).map((a: Record<string, unknown>) => ({
    ...enrichAssignmentFields(a, courseTitle),
    submissionCount: submissionCounts.get(a.id as string) ?? 0,
    hasSubmitted: submittedSet.has(a.id as string),
  }));

  res.json(enriched);
});

// POST /assignments — create assignment (teacher/admin)
router.post("/assignments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (!isTeacherOrAdmin(role)) {
    res.status(403).json({ error: "Only teachers and admins can create assignments" });
    return;
  }

  const { course_id, title, description, due_date, points, file_url, instructions, assignment_type, video_url, require_full_watch, isPublished, rubric: rubricInput } = req.body;

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

  const { rubric, error: rubricError } = validateRubric(rubricInput);
  if (rubricError) {
    res.status(400).json({ error: rubricError });
    return;
  }

  // Security: this was the only write route in this file that never
  // checked the course actually belonged to the caller (every other
  // create/update/delete route calls assertCanManageAssignmentCourse) — a
  // teacher or admin in any school could create (and immediately publish,
  // triggering a student notification blast) an assignment against any
  // other school's course_id.
  const access = await assertCanManageAssignmentCourse(course_id, req.userId, role);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
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
      rubric,
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

  const access = await assertCanManageAssignmentCourse(existing.course_id as string, userId, role);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { title, description, due_date, points, file_url, instructions, assignment_type, video_url, require_full_watch, isPublished, rubric: rubricInput } = req.body;

  if (due_date !== undefined && due_date !== null && isNaN(Date.parse(due_date))) {
    res.status(400).json({ error: "due_date must be a valid date" });
    return;
  }

  const { rubric, error: rubricError } = validateRubric(rubricInput);
  if (rubricError) {
    res.status(400).json({ error: rubricError });
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
  if (rubricInput !== undefined) updates.rubric = rubric;

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

  const access = await assertCanManageAssignmentCourse(existing.course_id as string, userId, role);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { error } = await supabaseAdmin.from("assignments").delete().eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.sendStatus(204);
});

// List assignments for a course (legacy route by path param)
router.get("/courses/:courseId/assignments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

  // Security: this had no tenant scoping and no draft filtering at all —
  // any authenticated user of any role could list any other school's
  // course assignments, drafts included, just by guessing/enumerating a
  // course id.
  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("school_id")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  if (req.userRole !== "super_admin" && course.school_id !== req.schoolId) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  let query = supabaseAdmin
    .from("assignments")
    .select("*")
    .eq("course_id", courseId);

  if (!isTeacherOrAdmin(req.userRole)) {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query.order("due_date", { ascending: true });

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

    const access = await assertCanManageAssignmentCourse(courseId, req.userId, req.userRole);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
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
router.get("/assignments/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("assignments")
    .select("*, courses(school_id)")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const courseSchoolId = (data.courses as Record<string, unknown> | null)?.school_id;
  if (req.userRole !== "super_admin" && courseSchoolId !== req.schoolId) {
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

  const access = await assertCanManageAssignmentCourse(existing.course_id as string, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
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

function enrichAssignmentFields(a: Record<string, unknown>, courseTitle: string | null) {
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
    rubric: (a.rubric as RubricCriterion[] | null) ?? null,
  };
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

  return enrichAssignmentFields(a, courseTitle);
}

export default router;
