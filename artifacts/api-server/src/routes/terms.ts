import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function canManageTerms(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin" || role === "staff";
}

function mapTerm(t: Record<string, unknown>) {
  return {
    id: t.id,
    schoolId: t.school_id,
    name: t.name,
    startDate: t.start_date,
    endDate: t.end_date,
    status: t.status,
    createdBy: t.created_by,
    createdAt: t.created_at,
  };
}

// GET /terms — every role in the school can list terms (needed to filter
// courses by term), only admin/super_admin/staff can create/edit/delete one.
router.get("/terms", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  let query = supabaseAdmin.from("terms").select("*").order("start_date", { ascending: false });
  query = req.userRole === "super_admin" ? query : query.eq("school_id", req.schoolId ?? "");

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map(mapTerm));
});

router.post("/terms", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageTerms(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { name, startDate, endDate, status } = req.body as {
    name?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  };

  if (!name || !startDate || !endDate) {
    res.status(400).json({ error: "name, startDate, and endDate are required" });
    return;
  }

  if (new Date(endDate) < new Date(startDate)) {
    res.status(400).json({ error: "endDate cannot be before startDate" });
    return;
  }

  const validStatuses = ["upcoming", "active", "completed", "archived"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("terms")
    .insert({
      school_id: req.schoolId,
      name,
      start_date: startDate,
      end_date: endDate,
      status: status ?? "upcoming",
      created_by: req.userId,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(mapTerm(data));
});

async function assertCanManageTerm(
  termId: string,
  role: string | undefined,
  schoolId: string | undefined
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!canManageTerms(role)) return { ok: false, status: 403, error: "Forbidden" };

  const { data: term } = await supabaseAdmin.from("terms").select("school_id").eq("id", termId).maybeSingle();
  if (!term) return { ok: false, status: 404, error: "Term not found" };
  if (role !== "super_admin" && term.school_id !== schoolId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

router.patch("/terms/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const access = await assertCanManageTerm(id, req.userRole, req.schoolId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  const { name, startDate, endDate, status } = req.body as {
    name?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  };

  const validStatuses = ["upcoming", "active", "completed", "archived"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (startDate !== undefined) updates.start_date = startDate;
  if (endDate !== undefined) updates.end_date = endDate;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabaseAdmin.from("terms").update(updates).eq("id", id).select().single();

  if (error || !data) {
    res.status(404).json({ error: "Term not found" });
    return;
  }

  res.json(mapTerm(data));
});

router.delete("/terms/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const access = await assertCanManageTerm(id, req.userRole, req.schoolId);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }

  // Courses linked to this term aren't deleted — term_id just goes null
  // (courses.term_id is ON DELETE SET NULL) — a schedule change shouldn't
  // take a class's roster/assignments/grades with it.
  const { error } = await supabaseAdmin.from("terms").delete().eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.sendStatus(204);
});

// GET /terms/:id/courses — every course scheduled in this term, with the
// assigned teacher, for the "who's teaching what this term" view. Scoped
// the same way GET /courses already is: teachers see only their own
// courses, admins/staff see the whole school, students/staff see their
// enrolled courses' term (handled by the existing /courses routes) — this
// endpoint itself is management-facing, so kept to admin/staff/teacher.
router.get("/terms/:id/courses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "staff" && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: term } = await supabaseAdmin.from("terms").select("school_id").eq("id", id).maybeSingle();
  if (!term) {
    res.status(404).json({ error: "Term not found" });
    return;
  }
  if (req.userRole !== "super_admin" && term.school_id !== req.schoolId) {
    res.status(404).json({ error: "Term not found" });
    return;
  }

  let query = supabaseAdmin
    .from("courses")
    .select("id, title, code, teacher_id, is_published")
    .eq("term_id", id);

  if (req.userRole === "teacher") {
    query = query.eq("teacher_id", req.userId ?? "");
  }

  const { data: courses, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const teacherIds = Array.from(
    new Set((courses ?? []).filter((c) => c.teacher_id).map((c) => c.teacher_id as string))
  );
  const { data: teachers } = teacherIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", teacherIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
  const teacherNameById = new Map(
    (teachers ?? []).map((t) => [t.id, [t.first_name, t.last_name].filter(Boolean).join(" ") || null])
  );

  res.json(
    (courses ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      code: c.code,
      isPublished: c.is_published,
      teacherId: c.teacher_id,
      teacherName: c.teacher_id ? teacherNameById.get(c.teacher_id as string) ?? null : null,
    }))
  );
});

export default router;
