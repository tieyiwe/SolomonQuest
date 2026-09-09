import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendPasswordResetEmail } from "../lib/email";
import { notifyUsers } from "../lib/notifications";
import { logPlatformAction } from "../lib/auditLog";
import { invalidateCachedProfile } from "../lib/profileCache";

const router: IRouter = Router();

// List users in school — admin/teacher only
router.get("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.schoolId) {
    res.status(403).json({ error: "Not associated with a school" });
    return;
  }

  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let query = supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("school_id", req.schoolId);

  const role = req.query.role as string | undefined;
  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: "Failed to fetch users" });
    return;
  }

  // Email is denormalized onto profiles (kept in sync by a DB trigger — see
  // supabase-perf-denormalize-email.sql) specifically so a list of users
  // doesn't cost one Auth Admin API call per row.
  const profiles = (data ?? []).map((p) => mapProfile(p, p.email as string | null));

  res.json(profiles);
});

// GET /users/me/notification-prefs - get current user's notification preferences
router.get("/users/me/notification-prefs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("notification_prefs")
    .eq("id", req.userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json({ notification_prefs: data.notification_prefs ?? {} });
});

// PUT /users/me/notification-prefs - update current user's notification preferences
router.put("/users/me/notification-prefs", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { in_app, email, chat, forum, assignments, grades, resources, applications } = req.body;

  const notification_prefs: Record<string, unknown> = {};
  if (in_app !== undefined) notification_prefs.in_app = in_app;
  if (email !== undefined) notification_prefs.email = email;
  if (chat !== undefined) notification_prefs.chat = chat;
  if (forum !== undefined) notification_prefs.forum = forum;
  if (assignments !== undefined) notification_prefs.assignments = assignments;
  if (grades !== undefined) notification_prefs.grades = grades;
  if (resources !== undefined) notification_prefs.resources = resources;
  if (applications !== undefined) notification_prefs.applications = applications;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ notification_prefs })
    .eq("id", req.userId)
    .select("notification_prefs")
    .single();

  if (error || !data) {
    res.status(500).json({ error: "Failed to update notification preferences" });
    return;
  }

  res.json({ notification_prefs: data.notification_prefs });
});

// PUT /users/me/join-school — link a newly registered student to a school
router.put("/users/me/join-school", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { schoolId } = req.body as { schoolId?: string };
  if (!schoolId) {
    res.status(400).json({ error: "schoolId is required" });
    return;
  }

  // Verify the school exists
  const { data: school, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name")
    .eq("id", schoolId)
    .single();

  if (schoolErr || !school) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  // Only allow if user has no school yet (prevent school-hopping)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("school_id, role")
    .eq("id", req.userId!)
    .single();

  if (profile?.school_id) {
    res.status(409).json({ error: "You are already associated with a school" });
    return;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update({ school_id: schoolId, role: "student" })
    .eq("id", req.userId!);

  if (updateErr) {
    res.status(500).json({ error: "Failed to join school" });
    return;
  }

  invalidateCachedProfile(req.userId!);

  // Auto-enroll in school's public chat channels
  try {
    const { enrollUserInSchoolChannels } = await import("./chat");
    await enrollUserInSchoolChannels(req.userId!, schoolId);
  } catch { /* non-fatal */ }

  res.json({ success: true, schoolId, schoolName: school.name });
});

// PUT /users/me/online - update last online time
router.put("/users/me/online", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ online_at: new Date().toISOString() })
    .eq("id", req.userId);

  if (error) {
    res.status(500).json({ error: "Failed to update online status" });
    return;
  }

  res.json({ success: true });
});

// GET /users/search - search users by name, email, or student ID
// Scoped to requester's school; all authenticated users can search within their school
router.get("/users/search", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const queryParam = (req.query.query as string | undefined)?.trim();

  // Always scope search to caller's school
  let dbQuery = supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, unique_student_id, internal_email, avatar_url, role");

  if (req.userRole === "super_admin") {
    const school_id = req.query.school_id as string | undefined;
    if (school_id) {
      dbQuery = dbQuery.eq("school_id", school_id);
    }
  } else {
    if (!req.schoolId) {
      res.status(403).json({ error: "Not associated with a school" });
      return;
    }
    dbQuery = dbQuery.eq("school_id", req.schoolId);
  }

  if (req.userId) {
    dbQuery = dbQuery.neq("id", req.userId);
  }

  // No query yet: return everyone in the school, alphabetical by first name,
  // so the UI can show a browsable directory before the user types anything.
  if (queryParam) {
    // PostgREST's .or() filter string treats ',', '(', ')', and '.' as
    // syntax (condition separators / grouping / operator delimiters) —
    // stripping only quotes left those free for a search value to inject
    // extra OR conditions or alter filter grouping. Strip anything that
    // isn't a normal search character.
    const q = queryParam.replace(/[^\p{L}\p{N}\s@._-]/gu, "").slice(0, 100);
    dbQuery = dbQuery.or(
      `unique_student_id.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,internal_email.ilike.%${q}%`
    );
  }

  const { data, error } = await dbQuery
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true })
    .limit(queryParam ? 20 : 50);

  if (error) {
    res.status(500).json({ error: "Search failed" });
    return;
  }

  res.json(data ?? []);
});

// POST /users/me/avatar - update current user's avatar
router.post("/users/me/avatar", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { avatar_url, avatar_type, avatar_index } = req.body;

  let resolvedAvatarUrl: string | undefined;

  if (avatar_type === "default") {
    if (typeof avatar_index !== "number" || avatar_index < 0 || avatar_index > 7) {
      res.status(400).json({ error: "avatar_index must be a number between 0 and 7" });
      return;
    }
    resolvedAvatarUrl = `default:${avatar_index}`;
  } else if (avatar_url !== undefined) {
    if (typeof avatar_url !== "string" || avatar_url.trim() === "") {
      res.status(400).json({ error: "avatar_url must be a non-empty string" });
      return;
    }
    resolvedAvatarUrl = avatar_url.trim();
  } else {
    res.status(400).json({ error: "Provide either avatar_url or { avatar_type: 'default', avatar_index: number }" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ avatar_url: resolvedAvatarUrl })
    .eq("id", req.userId)
    .select()
    .single();

  if (error || !data) {
    res.status(500).json({ error: "Failed to update avatar" });
    return;
  }

  res.json(mapProfile(data, data.email as string | null));
});

// Get single user — must be same school (or self), unless super_admin
router.get("/users/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // super_admin can view any user; others must share school or be viewing themselves
  if (req.userRole !== "super_admin") {
    if (data.school_id !== req.schoolId && req.userId !== id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  res.json(mapProfile(data, data.email as string | null));
});

// Get a student's full profile (contact info, program/courses, attendance) for
// the admin/teacher "expandable student card" view. Admins always see
// everything; teachers only see students in a course they teach, and only
// the fields the school has enabled for teachers via role_permissions
// (features: student_contact_info, student_program_info, student_attendance).
router.get("/users/:id/detail", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { data: student, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !student || student.role !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
  const isTeacher = req.userRole === "teacher";

  if (!isAdmin && !isTeacher) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (student.school_id !== req.schoolId && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Enrollments (course + program), needed both for the response and to
  // verify a teacher actually teaches this student before granting access.
  const { data: enrollments } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id, enrolled_at, courses(id, title, code, program_id, teacher_id, programs(id, name))")
    .eq("student_id", id)
    .eq("status", "active");

  const courseRows = (enrollments ?? [])
    .map((e: Record<string, unknown>) => e.courses as Record<string, unknown> | null)
    .filter((c): c is Record<string, unknown> => !!c);

  const earliestEnrolledAt = (enrollments ?? [])
    .map((e: Record<string, unknown>) => e.enrolled_at as string | null)
    .filter((d): d is string => !!d)
    .sort()[0];

  if (isTeacher) {
    const teachesStudent = courseRows.some((c) => c.teacher_id === req.userId);
    if (!teachesStudent) {
      res.status(403).json({ error: "You do not teach this student" });
      return;
    }
  }

  let allowedFields = { contact: true, program: true, attendance: true };
  if (isTeacher) {
    const { data: perms } = await supabaseAdmin
      .from("role_permissions")
      .select("feature, enabled")
      .eq("school_id", req.schoolId ?? "")
      .eq("role", "teacher")
      .in("feature", ["student_contact_info", "student_program_info", "student_attendance"]);

    const map = new Map((perms ?? []).map((p) => [p.feature, p.enabled]));
    allowedFields = {
      contact: map.get("student_contact_info") === true,
      program: map.get("student_program_info") === true,
      attendance: map.get("student_attendance") === true,
    };
  }

  const result: Record<string, unknown> = {
    id: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
    avatarUrl: student.avatar_url,
    bio: student.bio,
    uniqueStudentId: student.unique_student_id,
    enrolledSince: earliestEnrolledAt ?? student.created_at ?? null,
  };

  if (allowedFields.contact) {
    result.email = student.email ?? null;
    result.phone = student.phone ?? null;
  }

  if (allowedFields.program) {
    const seenPrograms = new Map<string, { id: string; name: string }>();
    for (const c of courseRows) {
      const program = c.programs as Record<string, unknown> | null;
      if (program?.id) seenPrograms.set(program.id as string, { id: program.id as string, name: program.name as string });
    }
    result.programs = Array.from(seenPrograms.values());
    result.courses = courseRows.map((c) => ({ id: c.id, title: c.title, code: c.code }));
  }

  if (allowedFields.attendance) {
    const courseIds = courseRows.map((c) => c.id as string);
    let present = 0;
    let absent = 0;
    let late = 0;
    if (courseIds.length > 0) {
      const { data: attendanceRows } = await supabaseAdmin
        .from("attendance")
        .select("status")
        .eq("student_id", id)
        .in("course_id", courseIds);
      for (const row of attendanceRows ?? []) {
        if (row.status === "present") present += 1;
        else if (row.status === "absent") absent += 1;
        else if (row.status === "late") late += 1;
      }
    }
    const total = present + absent + late;
    result.attendance = {
      present,
      absent,
      late,
      total,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : null,
    };
  }

  res.json(result);
});

router.get("/users/:id/teacher-detail", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: teacher, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !teacher || teacher.role !== "teacher") {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  if (teacher.school_id !== req.schoolId && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: courses } = await supabaseAdmin
    .from("courses")
    .select("id, title, code")
    .eq("teacher_id", id);

  const courseIds = (courses ?? []).map((c) => c.id as string);

  let totalStudents = 0;
  if (courseIds.length > 0) {
    const { data: enrollments } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .in("course_id", courseIds)
      .eq("status", "active");

    totalStudents = new Set((enrollments ?? []).map((e) => e.student_id as string)).size;
  }

  res.json({
    id: teacher.id,
    firstName: teacher.first_name,
    lastName: teacher.last_name,
    avatarUrl: teacher.avatar_url,
    bio: teacher.bio,
    uniqueStudentId: teacher.unique_student_id,
    joinedSince: teacher.created_at ?? null,
    email: teacher.email ?? null,
    phone: teacher.phone ?? null,
    courses: (courses ?? []).map((c) => ({ id: c.id, title: c.title, code: c.code })),
    totalStudents,
  });
});

// Update user profile — self or admin of same school; role changes are never allowed here
router.patch("/users/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Ownership check: must be the user themselves OR an admin/super_admin
  const isSelf = req.userId === id;
  const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Admins (non-super_admin) may only update users in the same school
  if (isAdmin && req.userRole !== "super_admin") {
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", id)
      .single();

    if (!targetProfile || targetProfile.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Only allow safe profile fields — never role
  const { firstName, lastName, avatarUrl, bio } = req.body;

  const updates: Record<string, unknown> = {};
  if (firstName !== undefined) updates.first_name = firstName;
  if (lastName !== undefined) updates.last_name = lastName;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
  if (bio !== undefined) updates.bio = bio;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(mapProfile(data, data.email as string | null));
});

// Update user role — admin/super_admin only, same-school constraint for admin
router.patch("/users/:id/role", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { role } = req.body;

  if (!role) {
    res.status(400).json({ error: "role is required" });
    return;
  }

  const validRoles = ["super_admin", "admin", "teacher", "staff", "student"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  // Changing your own role (a misclick in the same table used to manage
  // everyone else) could lock you out of the only place this is undone.
  if (id === req.userId) {
    res.status(400).json({ error: "You cannot change your own role" });
    return;
  }

  // Admins (non-super_admin) may only change roles for users in the same
  // school, and can never grant super_admin — that would be a privilege
  // escalation to platform-wide access from a single-school role.
  if (req.userRole !== "super_admin") {
    if (role === "super_admin") {
      res.status(403).json({ error: "Only a super admin can grant super admin access" });
      return;
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id, role")
      .eq("id", id)
      .single();

    if (!targetProfile || targetProfile.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Also block demoting/modifying an existing super_admin from a
    // regular admin account, for the same reason.
    if (targetProfile.role === "super_admin") {
      res.status(403).json({ error: "Only a super admin can change another super admin's role" });
      return;
    }

    if (id === req.userId) {
      res.status(403).json({ error: "You cannot change your own role" });
      return;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  invalidateCachedProfile(id);

  logPlatformAction({
    action: "user.role_changed",
    performedBy: req.userId,
    targetType: "user",
    targetId: id,
    targetName: [data.first_name, data.last_name].filter(Boolean).join(" ") || id,
    metadata: { newRole: role },
  });

  res.json(mapProfile(data, data.email as string | null));
});

function mapProfile(p: Record<string, unknown>, email?: string | null) {
  return {
    id: p.id,
    schoolId: p.school_id,
    role: p.role,
    firstName: p.first_name,
    lastName: p.last_name,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    email: email ?? null,
    internalEmail: p.internal_email ?? null,
    uniqueStudentId: p.unique_student_id ?? null,
    testModeEnabled: p.test_mode_enabled ?? false,
    testModeAdminAccess: p.test_mode_admin_access ?? false,
  };
}

// PATCH /users/:id/test-mode — admin/super_admin only, same-school scoped.
// Grants (or revokes) a user the ability to self-switch into other
// teacher/staff/student accounts via POST /admin/impersonate for testing,
// without needing an admin to trigger "View As" for them each time.
// Optionally also grants `adminAccess` — for specific, known testers an
// admin trusts to exercise the admin experience too (Test Mode is normally
// capped at same-or-lower role than the account's own, see impersonation.ts;
// this is an explicit, per-account exception to that cap, never automatic).
// super_admin is never a valid Test Mode target regardless of this flag.
router.patch("/users/:id/test-mode", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { enabled, adminAccess } = req.body as { enabled?: boolean; adminAccess?: boolean };

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("school_id")
    .eq("id", id)
    .single();

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.school_id !== req.schoolId && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updates: Record<string, unknown> = { test_mode_enabled: enabled };
  if (typeof adminAccess === "boolean") {
    updates.test_mode_admin_access = enabled ? adminAccess : false;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("id, test_mode_enabled, test_mode_admin_access")
    .single();

  if (error || !data) {
    const missingColumn = error?.message?.toLowerCase().includes("test_mode");
    res.status(500).json({
      error: missingColumn
        ? "Test Mode isn't set up on this database yet — run the latest supabase-schema-additions.sql and test-mode-admin-access.sql."
        : error?.message ?? "Failed to update test mode",
    });
    return;
  }

  if (enabled) {
    notifyUsers({
      userIds: [id],
      type: "test_mode_enabled",
      category: "platform",
      title: "Test Mode enabled for your account",
      body: "An admin has enabled Test Mode for you — look for \"Switch Profile\" to try out other account views for testing.",
    }).catch(() => {});
  }

  res.json({ id: data.id, testModeEnabled: data.test_mode_enabled, testModeAdminAccess: data.test_mode_admin_access });
});

// POST /users/:id/reset-password - admin sends password reset email to user
// POST /users/admin/reset-password - admin resets a user's password; same-school constraint
//
// Bug: this was registered AFTER /users/:id/reset-password below, and both
// are 3-segment paths (/users/<x>/reset-password) — Express matches routes
// in registration order, so every request here was actually caught by the
// :id route first with id="admin" (a profile lookup that never matches),
// silently 404ing instead of resetting anyone's password. Registering it
// first fixes that; the :id route still matches any real id since "admin"
// is no longer ambiguous once this specific path is checked first.
router.post("/users/admin/reset-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { user_id, new_password } = req.body;

  if (!user_id || !new_password) {
    res.status(400).json({ error: "user_id and new_password are required" });
    return;
  }

  // Verify target user belongs to the same school (unless super_admin)
  if (req.userRole !== "super_admin") {
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("school_id")
      .eq("id", user_id)
      .single();

    if (!targetProfile || targetProfile.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error || !data) {
    res.status(500).json({ error: "Failed to reset password" });
    return;
  }

  logPlatformAction({
    action: "user.password_set_by_admin",
    performedBy: req.userId,
    targetType: "user",
    targetId: user_id,
  });

  res.json({ success: true });
});

router.post("/users/:id/reset-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Verify target user belongs to the same school (unless super_admin)
  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("school_id, first_name, last_name, email")
    .eq("id", id)
    .single();

  if (!targetProfile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.userRole !== "super_admin" && targetProfile.school_id !== req.schoolId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const userEmail = targetProfile.email as string | null;

  if (!userEmail) {
    res.status(400).json({ error: "User has no email address" });
    return;
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: userEmail,
  });

  if (linkError || !linkData) {
    res.status(500).json({ error: "Failed to generate reset link" });
    return;
  }

  const resetLink = linkData.properties?.action_link;

  if (!resetLink) {
    res.status(500).json({ error: "Failed to generate reset link" });
    return;
  }

  await sendPasswordResetEmail({
    to: userEmail,
    resetUrl: resetLink,
  });

  logPlatformAction({
    action: "user.password_reset_sent",
    performedBy: req.userId,
    targetType: "user",
    targetId: id,
    targetName: [targetProfile.first_name, targetProfile.last_name].filter(Boolean).join(" ") || id,
  });

  res.json({ success: true, message: "Password reset email sent" });
});

export default router;
