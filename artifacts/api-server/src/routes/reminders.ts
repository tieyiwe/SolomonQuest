import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/reminders", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { target_user_id, target_role, course_id, message, send_at, type } = req.body;

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!send_at) {
    res.status(400).json({ error: "send_at is required" });
    return;
  }

  const sendAtDate = new Date(send_at);
  if (isNaN(sendAtDate.getTime()) || sendAtDate <= new Date()) {
    res.status(400).json({ error: "send_at must be a valid date in the future" });
    return;
  }

  const role = req.userRole;

  if (role === "admin" || role === "super_admin") {
    if (!target_user_id && target_role !== "teacher") {
      res.status(400).json({ error: "Admin reminders require target_user_id or target_role='teacher'" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("reminders")
      .insert({
        school_id: req.schoolId,
        created_by: req.userId,
        target_user_id: target_user_id ?? null,
        target_role: target_role ?? null,
        course_id: course_id ?? null,
        message,
        send_at: sendAtDate.toISOString(),
        type: "admin_to_teacher",
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json(await enrichReminder(data));
    return;
  }

  if (role === "teacher") {
    if (!course_id) {
      res.status(400).json({ error: "Teacher reminders require course_id" });
      return;
    }

    if (!target_user_id && target_role !== "student") {
      res.status(400).json({ error: "Teacher reminders require target_user_id or target_role='student'" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("reminders")
      .insert({
        school_id: req.schoolId,
        created_by: req.userId,
        target_user_id: target_user_id ?? null,
        target_role: target_role ?? null,
        course_id,
        message,
        send_at: sendAtDate.toISOString(),
        type: "teacher_to_student",
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json(await enrichReminder(data));
    return;
  }

  res.status(403).json({ error: "Only admins and teachers can create reminders" });
});

router.get("/reminders", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from("reminders")
    .select("*")
    .eq("created_by", req.userId ?? "")
    .order("send_at", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const enriched = await enrichReminders(data ?? []);
  res.json(enriched);
});

router.delete("/reminders/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Check ownership
  const { data: existing } = await supabaseAdmin
    .from("reminders")
    .select("created_by")
    .eq("id", id)
    .single();

  if (!existing) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }

  if (existing.created_by !== req.userId) {
    res.status(403).json({ error: "You can only delete your own reminders" });
    return;
  }

  const { error } = await supabaseAdmin.from("reminders").delete().eq("id", id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.sendStatus(204);
});

async function enrichReminder(r: Record<string, unknown>) {
  let targetUserName: string | null = null;
  let courseName: string | null = null;

  if (r.target_user_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", r.target_user_id as string)
      .single();
    if (profile) {
      targetUserName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null;
    }
  }

  if (r.course_id) {
    const { data: course } = await supabaseAdmin
      .from("courses")
      .select("title")
      .eq("id", r.course_id as string)
      .single();
    if (course) {
      courseName = course.title ?? null;
    }
  }

  return {
    id: r.id,
    schoolId: r.school_id,
    createdBy: r.created_by,
    targetUserId: r.target_user_id,
    targetUserName,
    targetRole: r.target_role,
    courseId: r.course_id,
    courseName,
    message: r.message,
    sendAt: r.send_at,
    sent: r.sent,
    type: r.type,
    createdAt: r.created_at,
  };
}

async function enrichReminders(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];

  const targetUserIds = Array.from(
    new Set(rows.filter((r) => r.target_user_id).map((r) => r.target_user_id as string))
  );
  const courseIds = Array.from(
    new Set(rows.filter((r) => r.course_id).map((r) => r.course_id as string))
  );

  const [profilesRes, coursesRes] = await Promise.all([
    targetUserIds.length
      ? supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", targetUserIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
    courseIds.length
      ? supabaseAdmin.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
  ]);

  const nameById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || null])
  );
  const titleById = new Map((coursesRes.data ?? []).map((c) => [c.id, c.title ?? null]));

  return rows.map((r) => ({
    id: r.id,
    schoolId: r.school_id,
    createdBy: r.created_by,
    targetUserId: r.target_user_id,
    targetUserName: r.target_user_id ? nameById.get(r.target_user_id as string) ?? null : null,
    targetRole: r.target_role,
    courseId: r.course_id,
    courseName: r.course_id ? titleById.get(r.course_id as string) ?? null : null,
    message: r.message,
    sendAt: r.send_at,
    sent: r.sent,
    type: r.type,
    createdAt: r.created_at,
  }));
}

export default router;
