import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

/**
 * Verifies the caller may access attendance for this course: must be an
 * admin/super_admin of the course's school, or the teacher who teaches it.
 * Students are never allowed (they have their own self-check-in endpoint).
 */
async function assertCourseTeacherOrAdmin(
  req: AuthenticatedRequest,
  courseId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const { data: course, error } = await supabaseAdmin
    .from("courses")
    .select("id, school_id, teacher_id")
    .eq("id", courseId)
    .single();

  if (error || !course) {
    return { ok: false, status: 404, error: "Course not found" };
  }

  if (req.userRole === "teacher" && course.teacher_id !== req.userId) {
    return { ok: false, status: 403, error: "You do not teach this course" };
  }

  if (req.userRole !== "super_admin" && course.school_id !== req.schoolId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true };
}

router.get("/courses/:courseId/attendance", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

  const access = await assertCourseTeacherOrAdmin(req, courseId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("*")
    .eq("course_id", courseId)
    .order("session_date", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const records = await enrichAttendanceRows(data ?? []);
  res.json(records);
});

router.post("/courses/:courseId/attendance", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = Array.isArray(req.params.courseId) ? req.params.courseId[0] : req.params.courseId;

  const access = await assertCourseTeacherOrAdmin(req, courseId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { studentId, sessionDate, status } = req.body;

  if (!studentId || !sessionDate || !status) {
    res.status(400).json({ error: "studentId, sessionDate, and status are required" });
    return;
  }

  const validStatuses = ["present", "absent", "late"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .upsert(
      {
        course_id: courseId,
        student_id: studentId,
        session_date: sessionDate,
        status,
      },
      { onConflict: "course_id,student_id,session_date" }
    )
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(await enrichAttendance(data));
});

// POST /attendance/checkin - student self-check-in for live class
router.post("/attendance/checkin", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { course_id } = req.body;
  const studentId = req.userId;

  if (!course_id) {
    res.status(400).json({ error: "course_id is required" });
    return;
  }

  // Check that today is the class_date for this course
  const { data: course, error: courseError } = await supabaseAdmin
    .from("courses")
    .select("id, is_live, class_date")
    .eq("id", course_id)
    .single();

  if (courseError || !course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const classDate = course.class_date ? String(course.class_date).slice(0, 10) : null;

  if (!course.is_live || classDate !== today) {
    res.status(400).json({ error: "No live class scheduled for today" });
    return;
  }

  // Check if student is enrolled
  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("id")
    .eq("course_id", course_id)
    .eq("student_id", studentId)
    .single();

  if (!enrollment) {
    res.status(403).json({ error: "You are not enrolled in this course" });
    return;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .upsert(
      {
        course_id,
        student_id: studentId,
        session_date: today,
        status: "present",
        checked_in_at: now,
        checkin_method: "self",
      },
      { onConflict: "course_id,student_id,session_date" }
    )
    .select("checked_in_at")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    success: true,
    message: "Checked in successfully",
    checked_in_at: data?.checked_in_at ?? now,
  });
});

// GET /attendance/live-class?course_id=X - teacher/admin gets today's check-in list
router.get("/attendance/live-class", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const course_id = (
    Array.isArray(req.query.course_id) ? req.query.course_id[0] : req.query.course_id
  ) as string | undefined;

  if (!course_id) {
    res.status(400).json({ error: "course_id is required" });
    return;
  }

  const access = await assertCourseTeacherOrAdmin(req, course_id);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Get all enrollments for the course
  const { data: enrollments, error: enrollError } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id, profiles:student_id(first_name, last_name, unique_student_id)")
    .eq("course_id", course_id);

  if (enrollError) {
    res.status(500).json({ error: enrollError.message });
    return;
  }

  // Get today's attendance records
  const { data: attendanceRecords, error: attError } = await supabaseAdmin
    .from("attendance")
    .select("student_id, status, checked_in_at, id")
    .eq("course_id", course_id)
    .eq("session_date", today);

  if (attError) {
    res.status(500).json({ error: attError.message });
    return;
  }

  const attendanceMap = new Map(
    (attendanceRecords ?? []).map((r) => [r.student_id, r])
  );

  const students = (enrollments ?? []).map((e) => {
    const profile = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    const att = attendanceMap.get(e.student_id);
    return {
      id: e.student_id,
      name: profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
        : null,
      unique_student_id: profile?.unique_student_id ?? null,
      checked_in: att?.status === "present",
      checked_in_at: att?.checked_in_at ?? null,
      attendance_id: att?.id ?? null,
    };
  });

  const total_enrolled = students.length;
  const total_checked_in = students.filter((s) => s.checked_in).length;

  res.json({ total_enrolled, total_checked_in, students });
});

async function enrichAttendance(a: Record<string, unknown>) {
  let studentName: string | null = null;

  if (a.student_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", a.student_id as string)
      .single();
    if (profile) {
      studentName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    }
  }

  return {
    id: a.id,
    courseId: a.course_id,
    studentId: a.student_id,
    sessionDate: a.session_date,
    status: a.status,
    studentName,
  };
}

async function enrichAttendanceRows(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];

  const studentIds = Array.from(
    new Set(rows.filter((a) => a.student_id).map((a) => a.student_id as string))
  );

  const { data: profiles } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null])
  );

  return rows.map((a) => ({
    id: a.id,
    courseId: a.course_id,
    studentId: a.student_id,
    sessionDate: a.session_date,
    status: a.status,
    studentName: a.student_id ? nameById.get(a.student_id as string) ?? null : null,
  }));
}

export default router;
