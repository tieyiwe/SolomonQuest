import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendResourceNotification } from "../lib/email";

const router: IRouter = Router({ mergeParams: true });

function isTeacherOrAdmin(role?: string): boolean {
  return role === "teacher" || role === "admin" || role === "super_admin";
}

/**
 * Confirms the caller may modify resources on this course: a teacher must
 * own the course, an admin/super_admin must be in the same school (or be
 * super_admin, which spans schools). Previously there was no ownership
 * check at all here — any authenticated teacher/admin could add, edit, or
 * delete resources on ANY course in ANY school just by guessing/knowing its
 * id, a cross-tenant IDOR.
 */
async function assertCanManageCourseResources(
  courseId: string,
  userId: string,
  role: string | undefined
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("teacher_id, school_id")
    .eq("id", courseId)
    .single();

  if (!course) return { ok: false, status: 404, error: "Course not found" };
  if (role === "super_admin") return { ok: true };
  if (role === "teacher") {
    return course.teacher_id === userId
      ? { ok: true }
      : { ok: false, status: 403, error: "You do not teach this course" };
  }
  // admin
  const { data: caller } = await supabaseAdmin
    .from("profiles")
    .select("school_id")
    .eq("id", userId)
    .single();
  return caller?.school_id === course.school_id
    ? { ok: true }
    : { ok: false, status: 403, error: "Forbidden" };
}

// GET /courses/:courseId/resources
router.get(
  "/courses/:courseId/resources",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { courseId } = req.params;
    const { section } = req.query;

    let query = supabaseAdmin
      .from("course_resources")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });

    // Students only see published resources; teachers/admins see drafts too.
    if (!isTeacherOrAdmin(req.userRole)) {
      query = query.eq("is_published", true);
    }

    if (section) {
      query = query.eq("section", section as string);
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data ?? []);
  }
);

// POST /courses/:courseId/resources
router.post(
  "/courses/:courseId/resources",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (!isTeacherOrAdmin(role)) {
      res.status(403).json({ error: "Forbidden: teacher or admin only" });
      return;
    }

    const { courseId } = req.params;

    const access = await assertCanManageCourseResources(courseId, req.userId!, role);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const { title, description, resourceType, fileUrl, externalUrl, section, isPublished } =
      req.body;

    if (!title || !resourceType) {
      res.status(400).json({ error: "title and resourceType are required" });
      return;
    }

    // Fetch course to get its title for notifications
    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id, title")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const publishNow = isPublished === true;

    // Insert the resource
    const { data: resource, error: insertError } = await supabaseAdmin
      .from("course_resources")
      .insert({
        course_id: courseId,
        title,
        description: description ?? null,
        resource_type: resourceType,
        file_url: fileUrl ?? null,
        external_url: externalUrl ?? null,
        section: section ?? null,
        created_by: req.userId,
        is_published: publishNow,
      })
      .select()
      .single();

    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }

    if (publishNow) {
      await notifyStudentsOfResource(courseId, course.title as string, title, resourceType);
    }

    res.status(201).json(resource);
  }
);

// PATCH /courses/:courseId/resources/:id — edit or publish/unpublish a resource
router.patch(
  "/courses/:courseId/resources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (!isTeacherOrAdmin(role)) {
      res.status(403).json({ error: "Forbidden: teacher or admin only" });
      return;
    }

    const { courseId, id } = req.params;

    const access = await assertCanManageCourseResources(courseId, req.userId!, role);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const { title, description, resourceType, fileUrl, externalUrl, section, isPublished } = req.body;

    const { data: existing } = await supabaseAdmin
      .from("course_resources")
      .select("is_published")
      .eq("id", id)
      .single();

    const wasPublished = existing?.is_published === true;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (resourceType !== undefined) updates.resource_type = resourceType;
    if (fileUrl !== undefined) updates.file_url = fileUrl;
    if (externalUrl !== undefined) updates.external_url = externalUrl;
    if (section !== undefined) updates.section = section;
    if (isPublished !== undefined) updates.is_published = isPublished;

    const { data, error } = await supabaseAdmin
      .from("course_resources")
      .update(updates)
      .eq("id", id)
      .eq("course_id", courseId)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (isPublished === true && !wasPublished) {
      const { data: course } = await supabaseAdmin
        .from("courses")
        .select("title")
        .eq("id", courseId)
        .single();

      await notifyStudentsOfResource(
        courseId,
        (course?.title as string) ?? "your course",
        data.title as string,
        data.resource_type as string
      );
    }

    res.json(data);
  }
);

async function notifyStudentsOfResource(
  courseId: string | string[],
  courseTitle: string,
  resourceTitle: string,
  resourceType: string
) {
  const { data: enrollments, error: enrollError } = await supabaseAdmin
    .from("course_enrollments")
    .select("student_id")
    .eq("course_id", courseId)
    .eq("status", "active");

  if (enrollError) {
    console.error("[course-resources] Failed to fetch enrollments:", enrollError.message);
    return;
  }

  const studentIds = (enrollments ?? []).map((e) => e.student_id as string);
  if (studentIds.length === 0) return;

  const notifications = studentIds.map((studentId) => ({
    user_id: studentId,
    title: `New resource in ${courseTitle}`,
    body: `${resourceTitle} has been added`,
    link: `/dashboard/student/courses/${courseId}`,
  }));

  const { error: notifError } = await supabaseAdmin.from("notifications").insert(notifications);
  if (notifError) {
    console.error("[course-resources] Failed to insert notifications:", notifError.message);
  }

  try {
    // Email is denormalized onto profiles (see supabase-perf-denormalize-email.sql)
    // specifically so this doesn't need to pull the entire school's user
    // directory (up to 1000 rows via listUsers) just to notify a handful
    // of enrolled students.
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", studentIds);

    const profileMap = new Map<string, { email: string; name: string }>();
    for (const p of profiles ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
      if (p.email) profileMap.set(p.id as string, { email: p.email as string, name: name || "Student" });
    }

    await Promise.allSettled(
      studentIds.map(async (studentId) => {
        const userInfo = profileMap.get(studentId);
        if (!userInfo?.email) return;

        const studentName = userInfo.name;

        await sendResourceNotification({
          to: userInfo.email,
          studentName,
          courseTitle,
          resourceTitle,
          resourceType,
        });
      })
    );
  } catch (err) {
    console.error("[course-resources] Email notification error:", err);
  }
}

// DELETE /courses/:courseId/resources/:id
router.delete(
  "/courses/:courseId/resources/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (!isTeacherOrAdmin(role)) {
      res.status(403).json({ error: "Forbidden: teacher or admin only" });
      return;
    }

    const { courseId, id } = req.params;

    const access = await assertCanManageCourseResources(courseId, req.userId!, role);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const { error } = await supabaseAdmin
      .from("course_resources")
      .delete()
      .eq("id", id)
      .eq("course_id", courseId);

    if (error) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    res.sendStatus(204);
  }
);

export default router;
