import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

/** Confirms the caller (a parent) is actually linked to this student. */
async function assertParentOfStudent(parentId: string, studentId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("parent_student_links")
    .select("id")
    .eq("parent_id", parentId)
    .eq("student_id", studentId)
    .maybeSingle();
  return !!data;
}

// ─── GET /parents/my-children ────────────────────────────────────────────────
router.get("/parents/my-children", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "parent") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: links, error } = await supabaseAdmin
    .from("parent_student_links")
    .select("student_id, profiles:student_id (id, first_name, last_name, avatar_url, unique_student_id, school_id)")
    .eq("parent_id", req.userId ?? "");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const children = (links ?? [])
    .map((l) => l.profiles as unknown as Record<string, unknown> | null)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      avatarUrl: p.avatar_url,
      uniqueStudentId: p.unique_student_id,
      schoolId: p.school_id,
    }));

  res.json(children);
});

// ─── GET /parents/children/:studentId/overview ───────────────────────────────
// Read-only summary a parent can see for one of their linked children:
// recent grades, attendance rate over the last 30 days, and tuition status.
// Every query below is scoped to studentId, which is only reachable after
// the parent_student_links check — a parent can never pass an arbitrary
// student id and see someone else's child.
router.get(
  "/parents/children/:studentId/overview",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (req.userRole !== "parent") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;

    const isMyChild = await assertParentOfStudent(req.userId ?? "", studentId);
    if (!isMyChild) {
      res.status(403).json({ error: "You are not linked to this student" });
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [gradesRes, attendanceRes, tuitionRes] = await Promise.all([
      supabaseAdmin
        .from("submissions")
        .select("id, grade, status, assignment_id, assignments:assignment_id (title, points_possible, course_id, courses:course_id (title))")
        .eq("student_id", studentId)
        .not("grade", "is", null)
        .order("graded_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("attendance")
        .select("status, session_date")
        .eq("student_id", studentId)
        .gte("session_date", thirtyDaysAgo),
      supabaseAdmin
        .from("tuition_payments")
        .select("id, amount_cents, currency, status, payment_method, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
    ]);

    const recentGrades = (gradesRes.data ?? []).map((s: any) => ({
      submissionId: s.id,
      grade: s.grade,
      pointsPossible: s.assignments?.points_possible ?? null,
      assignmentTitle: s.assignments?.title ?? "Assignment",
      courseTitle: s.assignments?.courses?.title ?? null,
    }));

    const attendanceRows = attendanceRes.data ?? [];
    const attendanceSummary = {
      present: attendanceRows.filter((a) => a.status === "present").length,
      absent: attendanceRows.filter((a) => a.status === "absent").length,
      late: attendanceRows.filter((a) => a.status === "late").length,
      total: attendanceRows.length,
    };

    const tuition = (tuitionRes.data ?? []).map((t) => ({
      id: t.id,
      amountCents: t.amount_cents,
      currency: t.currency,
      status: t.status,
      paymentMethod: t.payment_method,
      createdAt: t.created_at,
    }));

    res.json({ recentGrades, attendanceSummary, tuition });
  }
);

// ─── POST /admin/parent-links — admin links an existing parent account to a student ───
router.post("/admin/parent-links", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { parentId, studentId } = req.body as { parentId?: string; studentId?: string };
  if (!parentId || !studentId) {
    res.status(400).json({ error: "parentId and studentId are required" });
    return;
  }

  const [parentRes, studentRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, role, school_id").eq("id", parentId).single(),
    supabaseAdmin.from("profiles").select("id, role, school_id").eq("id", studentId).single(),
  ]);

  if (!parentRes.data || parentRes.data.role !== "parent") {
    res.status(404).json({ error: "Parent account not found" });
    return;
  }
  if (!studentRes.data || studentRes.data.role !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  if (req.userRole !== "super_admin") {
    if (parentRes.data.school_id !== req.schoolId || studentRes.data.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from("parent_student_links")
    .upsert({ parent_id: parentId, student_id: studentId }, { onConflict: "parent_id,student_id" });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json({ success: true });
});

// ─── DELETE /admin/parent-links — unlink a parent from a student ────────────
router.delete("/admin/parent-links", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { parentId, studentId } = req.body as { parentId?: string; studentId?: string };
  if (!parentId || !studentId) {
    res.status(400).json({ error: "parentId and studentId are required" });
    return;
  }

  const { error } = await supabaseAdmin
    .from("parent_student_links")
    .delete()
    .eq("parent_id", parentId)
    .eq("student_id", studentId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

// ─── GET /admin/parent-links?studentId= — list a student's linked parents ──
router.get("/admin/parent-links", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const studentId = req.query.studentId as string | undefined;
  if (!studentId) {
    res.status(400).json({ error: "studentId query param is required" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("parent_student_links")
    .select("parent_id, profiles:parent_id (id, first_name, last_name, email)")
    .eq("student_id", studentId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(
    (data ?? []).map((l) => {
      const p = l.profiles as unknown as Record<string, unknown> | null;
      return { id: p?.id, firstName: p?.first_name, lastName: p?.last_name, email: p?.email };
    })
  );
});

export default router;
