import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { enrollStudentInCourse } from "../lib/enrollment";

function canManageCourses(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin" || role === "teacher";
}

/**
 * Confirms the caller may modify/delete this specific course: a teacher
 * must own it, an admin must be in the same school, super_admin always
 * passes. Every write route below previously only checked the caller's
 * ROLE, never that the course actually belonged to them — any teacher or
 * admin in any school could edit/delete/enroll into any other school's
 * course by id, a cross-tenant IDOR.
 */
async function assertCanManageCourse(
  courseId: string,
  userId: string | undefined,
  role: string | undefined
): Promise<{ ok: true; schoolId: string | null } | { ok: false; status: number; error: string }> {
  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("teacher_id, school_id")
    .eq("id", courseId)
    .single();

  if (!course) return { ok: false, status: 404, error: "Course not found" };
  if (role === "super_admin") return { ok: true, schoolId: course.school_id as string | null };
  if (role === "teacher") {
    return course.teacher_id === userId
      ? { ok: true, schoolId: course.school_id as string | null }
      : { ok: false, status: 403, error: "You do not teach this course" };
  }
  if (role === "admin") {
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", userId ?? "")
      .single();
    return caller?.school_id === course.school_id
      ? { ok: true, schoolId: course.school_id as string | null }
      : { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}

const router: IRouter = Router();

// Public: list a school's published courses for its public homepage —
// no auth required, and school is taken from the school_id query param
// rather than the caller's own school (GET /courses below does the
// opposite: it's for an authenticated user's own school and ignores
// school_id entirely).
router.get("/courses/public", async (req, res): Promise<void> => {
  const schoolId = req.query.school_id as string | undefined;
  if (!schoolId) {
    res.status(400).json({ error: "school_id query parameter is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_published", true)
    .order("title");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const courses = await enrichCourses(data ?? []);
  res.json(courses);
});

// Get my courses (teacher = teaching, student = enrolled)
router.get("/courses/my", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  const userId = req.userId;

  if (role === "teacher") {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("*")
      .eq("teacher_id", userId ?? "");

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const courses = await enrichCourses(data ?? []);
    res.json(courses);
    return;
  }

  // Student: get enrolled courses
  const { data: enrollments, error: enrollErr } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", userId ?? "")
    .eq("status", "active");

  if (enrollErr) {
    res.status(500).json({ error: enrollErr.message });
    return;
  }

  const courseIds = (enrollments ?? []).map((e: Record<string, unknown>) => e.course_id as string);

  if (courseIds.length === 0) {
    res.json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("*")
    .in("id", courseIds);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const courses = await enrichCourses(data ?? []);
  res.json(courses);
});

// List courses
router.get("/courses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  let query = supabaseAdmin
    .from("courses")
    .select("*")
    .eq("school_id", req.schoolId ?? "");

  if (req.query.programId) {
    query = query.eq("program_id", req.query.programId as string);
  }
  if (req.query.published === "true") {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query.order("title");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const courses = await enrichCourses(data ?? []);
  res.json(courses);
});

// Create course
router.post("/courses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageCourses(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { title, programId, teacherId, code, term, termStartDate, termEndDate, description } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("courses")
    .insert({
      school_id: req.schoolId,
      title,
      program_id: programId ?? null,
      teacher_id: teacherId ?? null,
      code: code ?? null,
      term: term ?? null,
      term_start_date: termStartDate ?? null,
      term_end_date: termEndDate ?? null,
      description: description ?? null,
      is_published: false,
      created_by: req.userId,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Fire-and-forget: who built this course, and whether a teacher was
  // assigned right away. Never blocks the response on logging.
  supabaseAdmin
    .from("course_audit_log")
    .insert({
      course_id: data.id,
      action: "created",
      performed_by: req.userId,
      new_teacher_id: teacherId ?? null,
    })
    .then(({ error: logError }) => {
      if (logError) console.warn("[courses] audit log error:", logError);
    });

  res.status(201).json(await enrichCourse(data));
});

// Get single course
router.get("/courses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  if (req.userRole !== "super_admin" && data.school_id !== req.schoolId) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json(await enrichCourse(data));
});

// Update course
router.patch("/courses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageCourses(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const access = await assertCanManageCourse(id, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { title, programId, teacherId, code, term, termStartDate, termEndDate, description, isPublished } = req.body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (programId !== undefined) updates.program_id = programId;
  if (teacherId !== undefined) updates.teacher_id = teacherId;
  if (code !== undefined) updates.code = code;
  if (term !== undefined) updates.term = term;
  if (termStartDate !== undefined) updates.term_start_date = termStartDate;
  if (termEndDate !== undefined) updates.term_end_date = termEndDate;
  if (description !== undefined) updates.description = description;
  if (isPublished !== undefined) updates.is_published = isPublished;

  // Capture the pre-update teacher so a reassignment can be logged with
  // both sides of the change — fetched before the write, not from
  // assertCanManageCourse's result, since that only ran the auth check.
  let previousTeacherId: string | null = null;
  if (teacherId !== undefined) {
    const { data: before } = await supabaseAdmin.from("courses").select("teacher_id").eq("id", id).single();
    previousTeacherId = (before?.teacher_id as string | null) ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (teacherId !== undefined && !error && data && previousTeacherId !== (teacherId ?? null)) {
    supabaseAdmin
      .from("course_audit_log")
      .insert({
        course_id: id,
        action: teacherId ? "teacher_assigned" : "teacher_unassigned",
        performed_by: req.userId,
        previous_teacher_id: previousTeacherId,
        new_teacher_id: teacherId ?? null,
      })
      .then(({ error: logError }) => {
        if (logError) console.warn("[courses] audit log error:", logError);
      });
  }

  if (error || !data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json(await enrichCourse(data));
});

// Delete course
router.delete("/courses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageCourses(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const access = await assertCanManageCourse(id, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { error } = await supabaseAdmin.from("courses").delete().eq("id", id);

  if (error) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.sendStatus(204);
});

// Get course students
router.get("/courses/:id/students", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data: course } = await supabaseAdmin.from("courses").select("school_id, teacher_id").eq("id", id).maybeSingle();
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const isSchoolStaff =
    (req.userRole === "admin" || req.userRole === "super_admin") && course.school_id === req.schoolId;
  const isCourseTeacher = req.userRole === "teacher" && course.teacher_id === req.userId;
  let isEnrolledStudent = false;
  if (!isSchoolStaff && !isCourseTeacher && req.userRole === "student") {
    const { data: ownEnrollment } = await supabaseAdmin
      .from("course_enrollments")
      .select("course_id")
      .eq("course_id", id)
      .eq("student_id", req.userId ?? "")
      .eq("status", "active")
      .maybeSingle();
    isEnrolledStudent = !!ownEnrollment;
  }

  if (!isSchoolStaff && !isCourseTeacher && !isEnrolledStudent) {
    res.status(403).json({ error: "Not authorized to view this course's roster" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id")
    .eq("course_id", id)
    .eq("status", "active");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const studentIds = (data ?? []).map((e: Record<string, unknown>) => e.student_id as string);

  if (studentIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: profiles, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .in("id", studentIds);

  if (profErr) {
    res.status(500).json({ error: profErr.message });
    return;
  }

  const withEmails = (profiles ?? []).map((p: Record<string, unknown>) => ({
    id: p.id,
    schoolId: p.school_id,
    role: p.role,
    firstName: p.first_name,
    lastName: p.last_name,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    email: (p.email as string | null) ?? null,
  }));

  res.json(withEmails);
});

// Enroll student
router.post("/courses/:id/enroll", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { studentId } = req.body;

  if (!canManageCourses(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!studentId) {
    res.status(400).json({ error: "studentId is required" });
    return;
  }

  const access = await assertCanManageCourse(id, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  // The student being enrolled must also belong to the same school as the
  // course — otherwise a caller could enroll an arbitrary user from a
  // different school into a course they're legitimately allowed to manage.
  const { data: studentProfile } = await supabaseAdmin
    .from("profiles")
    .select("school_id")
    .eq("id", studentId)
    .single();
  if (!studentProfile || studentProfile.school_id !== access.schoolId) {
    res.status(403).json({ error: "That student is not in this course's school" });
    return;
  }

  try {
    await enrollStudentInCourse(id, studentId);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to enroll student" });
    return;
  }

  res.status(201).json({ courseId: id, studentId, status: "active" });
});

// Update live class settings
router.put("/courses/:id/live-settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "admin" && role !== "super_admin" && role !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const access = await assertCanManageCourse(id, req.userId, role);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { is_live, class_date, class_end_time } = req.body;

  const updates: Record<string, unknown> = {};
  if (is_live !== undefined) updates.is_live = is_live;
  if (class_date !== undefined) updates.class_date = class_date;
  if (class_end_time !== undefined) updates.class_end_time = class_end_time;

  const { data, error } = await supabaseAdmin
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  // Send notifications to enrolled students if going live with a date
  if (is_live === true && class_date) {
    const { data: enrollments } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", id)
      .eq("status", "active");

    if (enrollments && enrollments.length > 0) {
      const notifications = (enrollments as Record<string, unknown>[]).map((e) => ({
        user_id: e.student_id,
        type: "live_class",
        title: "Live class scheduled",
        body: `Live class scheduled for ${class_date}`,
        link: `/dashboard/student/courses/${id}`,
      }));

      await supabaseAdmin.from("notifications").insert(notifications);
    }
  }

  res.json(await enrichCourse(data as Record<string, unknown>));
});

async function enrichCourse(c: Record<string, unknown>) {
  let teacherName: string | null = null;
  let studentCount: number | null = null;
  let createdByName: string | null = null;

  if (c.teacher_id) {
    const { data: teacher } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", c.teacher_id as string)
      .single();
    if (teacher) {
      teacherName = [teacher.first_name, teacher.last_name].filter(Boolean).join(" ") || null;
    }
  }

  if (c.created_by) {
    const { data: creator } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", c.created_by as string)
      .single();
    if (creator) {
      createdByName = [creator.first_name, creator.last_name].filter(Boolean).join(" ") || null;
    }
  }

  const { count } = await supabaseAdmin
    .from("course_enrollments")
    .select("*", { count: "exact", head: true })
    .eq("course_id", c.id as string)
    .eq("status", "active");

  studentCount = count ?? 0;

  return {
    id: c.id,
    schoolId: c.school_id,
    programId: c.program_id,
    teacherId: c.teacher_id,
    title: c.title,
    code: c.code,
    term: c.term,
    termStartDate: c.term_start_date,
    termEndDate: c.term_end_date,
    description: c.description,
    isPublished: c.is_published,
    teacherName,
    studentCount,
    createdBy: c.created_by ?? null,
    createdByName,
    createdAt: c.created_at ?? null,
  };
}

// Batched version of enrichCourse for list endpoints — one profiles query
// for all teacher/creator ids and one enrollments query for all courses,
// instead of 3 queries per course.
async function enrichCourses(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];

  const profileIds = new Set<string>();
  const courseIds: string[] = [];
  for (const c of rows) {
    if (c.teacher_id) profileIds.add(c.teacher_id as string);
    if (c.created_by) profileIds.add(c.created_by as string);
    courseIds.push(c.id as string);
  }

  const { data: profiles } = profileIds.size
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", Array.from(profileIds))
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null])
  );

  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .in("course_id", courseIds)
    .eq("status", "active");

  const countByCourse = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const cid = e.course_id as string;
    countByCourse.set(cid, (countByCourse.get(cid) ?? 0) + 1);
  }

  return rows.map((c) => ({
    id: c.id,
    schoolId: c.school_id,
    programId: c.program_id,
    teacherId: c.teacher_id,
    title: c.title,
    code: c.code,
    term: c.term,
    termStartDate: c.term_start_date,
    termEndDate: c.term_end_date,
    description: c.description,
    isPublished: c.is_published,
    teacherName: c.teacher_id ? nameById.get(c.teacher_id as string) ?? null : null,
    studentCount: countByCourse.get(c.id as string) ?? 0,
    createdBy: c.created_by ?? null,
    createdByName: c.created_by ? nameById.get(c.created_by as string) ?? null : null,
    createdAt: c.created_at ?? null,
  }));
}

// GET /courses/:id/audit-log — who created this course and every teacher
// (re)assignment since, newest first. Staff/admin/teacher-of-record only.
router.get("/courses/:id/audit-log", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const access = await assertCanManageCourse(id, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("course_audit_log")
    .select("id, action, performed_by, previous_teacher_id, new_teacher_id, created_at")
    .eq("course_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const actorIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.performed_by) actorIds.add(row.performed_by as string);
    if (row.previous_teacher_id) actorIds.add(row.previous_teacher_id as string);
    if (row.new_teacher_id) actorIds.add(row.new_teacher_id as string);
  }

  const { data: profiles } = actorIds.size
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", Array.from(actorIds))
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null])
  );

  res.json(
    (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      performedBy: row.performed_by,
      performedByName: row.performed_by ? nameById.get(row.performed_by as string) ?? null : null,
      previousTeacherId: row.previous_teacher_id,
      previousTeacherName: row.previous_teacher_id ? nameById.get(row.previous_teacher_id as string) ?? null : null,
      newTeacherId: row.new_teacher_id,
      newTeacherName: row.new_teacher_id ? nameById.get(row.new_teacher_id as string) ?? null : null,
      createdAt: row.created_at,
    }))
  );
});

export default router;
