import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendEnhancedInvite, sendWelcomeEmail } from "../lib/email";
import { enrollUserInSchoolChannels } from "./chat";
import { enrollStudentInCourse } from "../lib/enrollment";
import { notifyUsers } from "../lib/notifications";
import { logPlatformAction } from "../lib/auditLog";
import { invalidateCachedProfile } from "../lib/profileCache";

const router: IRouter = Router();

interface CreateInviteParams {
  email: string;
  role: string;
  programId?: string | null;
  studentId?: string | null;
  schoolId: string;
  invitedBy: string;
}

type CreateInviteResult =
  | { ok: true; invitation: Record<string, unknown> }
  | { ok: false; email: string; error: string };

/**
 * Shared by the single-invite route and the CSV bulk-import route — same
 * validation, same invitation row, same email. Kept as one function so the
 * two entry points can't drift (e.g. bulk-import silently skipping the
 * program-required-for-students check a one-off invite enforces).
 */
async function createInvitation(params: CreateInviteParams): Promise<CreateInviteResult> {
  const { email, role, programId, studentId, schoolId, invitedBy } = params;

  if (!email || !email.includes("@")) {
    return { ok: false, email, error: "Missing or invalid email" };
  }

  const validRoles = ["teacher", "staff", "student", "parent"];
  if (!validRoles.includes(role)) {
    return { ok: false, email, error: `Invalid role "${role}"` };
  }

  if (programId && role !== "student") {
    return { ok: false, email, error: "programId only applies to student invitations" };
  }

  if (role === "student" && !programId) {
    return { ok: false, email, error: "A program is required to invite a student" };
  }

  if (studentId && role !== "parent") {
    return { ok: false, email, error: "studentId only applies to parent invitations" };
  }

  if (role === "parent" && !studentId) {
    return { ok: false, email, error: "A student must be selected to invite a parent/guardian" };
  }

  if (programId) {
    const { data: program } = await supabaseAdmin
      .from("programs")
      .select("id")
      .eq("id", programId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!program) {
      return { ok: false, email, error: "Program not found" };
    }
  }

  if (studentId) {
    const { data: student } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", studentId)
      .eq("school_id", schoolId)
      .eq("role", "student")
      .maybeSingle();
    if (!student) {
      return { ok: false, email, error: "Student not found" };
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error: insertError } = await supabaseAdmin
    .from("invitations")
    .insert({
      email,
      role,
      school_id: schoolId,
      invited_by: invitedBy,
      status: "pending",
      expires_at: expiresAt,
      program_id: programId ?? null,
      student_id: studentId ?? null,
    })
    .select()
    .single();

  if (insertError || !invitation) {
    return { ok: false, email, error: insertError?.message ?? "Failed to create invitation" };
  }

  const [schoolResult, profileResult] = await Promise.all([
    supabaseAdmin.from("schools").select("name").eq("id", schoolId).single(),
    supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", invitedBy).single(),
  ]);

  const schoolName = schoolResult.data?.name ?? "SolomonQuest School";
  const inviterName = profileResult.data
    ? `${profileResult.data.first_name ?? ""} ${profileResult.data.last_name ?? ""}`.trim() || "An administrator"
    : "An administrator";

  const inviteUrl = `${process.env.APP_URL ?? ""}/invite/${invitation.token}`;

  try {
    await sendEnhancedInvite({ to: email, schoolName, inviterName, inviteUrl, role });
  } catch (emailError) {
    console.error("[invitations] email send error:", emailError);
    // Do not fail — the invitation row is already created either way.
  }

  logPlatformAction({
    action: "invitation.sent",
    performedBy: invitedBy,
    targetType: "invitation",
    targetId: invitation.id as string,
    targetName: email,
    metadata: { role },
  });

  return { ok: true, invitation };
}

// ─── POST /invitations — admin creates invite ─────────────────────────────────

router.post(
  "/invitations",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userRole, schoolId, userId } = req;

      if (userRole !== "admin" && userRole !== "super_admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
      }

      const { email, role = "teacher", programId, studentId } = req.body as {
        email?: string;
        role?: string;
        programId?: string;
        studentId?: string;
      };

      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const result = await createInvitation({
        email: email ?? "",
        role,
        programId,
        studentId,
        schoolId,
        invitedBy: userId ?? "",
      });

      if (!result.ok) {
        const status = result.error === "Program not found" || result.error === "Student not found" ? 404 : 400;
        res.status(status).json({ error: result.error });
        return;
      }

      res.status(201).json({ invitation: result.invitation });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in POST /invitations:", err);
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── POST /invitations/bulk — admin bulk-imports a roster (CSV parsed client-side) ───
// Accepts rows already parsed into JSON on the client (simpler and safer
// than parsing arbitrary uploaded CSV server-side) and creates one
// invitation per row via the same createInvitation() path as a single
// invite, so behavior can't drift between the two. Capped at 500 rows per
// request — this is a roster import, not a bulk-mail tool.
router.post(
  "/invitations/bulk",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userRole, schoolId, userId } = req;

      if (userRole !== "admin" && userRole !== "super_admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
      }

      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { rows } = req.body as {
        rows?: { email?: string; role?: string; programId?: string }[];
      };

      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ error: "rows (a non-empty array) is required" });
        return;
      }
      if (rows.length > 500) {
        res.status(400).json({ error: "A single import is capped at 500 rows — split it into smaller batches" });
        return;
      }

      const results: { email: string; success: boolean; error?: string }[] = [];

      // Sequential, not parallel — this can be dozens to hundreds of rows,
      // each doing its own inserts and sending an email; a burst of
      // concurrent sends is more likely to trip an email-provider rate
      // limit than a plain create-user route ever would.
      for (const row of rows) {
        const email = (row.email ?? "").trim().toLowerCase();
        const result = await createInvitation({
          email,
          role: row.role ?? "student",
          programId: row.programId,
          schoolId,
          invitedBy: userId ?? "",
        });
        results.push(
          result.ok ? { email, success: true } : { email, success: false, error: result.error }
        );
      }

      const succeeded = results.filter((r) => r.success).length;
      res.status(207).json({
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        results,
      });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in POST /invitations/bulk:", err);
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── GET /invitations — list school invitations ───────────────────────────────

router.get(
  "/invitations",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userRole, schoolId } = req;

      if (userRole !== "admin" && userRole !== "super_admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
      }

      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { data: invitations, error } = await supabaseAdmin
        .from("invitations")
        .select("id, email, role, status, created_at, expires_at, accepted_at, program_id, programs(name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[invitations] list error:", error);
        res.status(500).json({ error: error.message ?? "Failed to fetch invitations" });
        return;
      }

      res.json({
        invitations: (invitations ?? []).map((inv: Record<string, unknown>) => ({
          ...inv,
          programName: (inv.programs as Record<string, unknown> | null)?.name ?? null,
          programs: undefined,
        })),
      });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in GET /invitations:", err);
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── DELETE /invitations/:id — cancel/delete invitation ──────────────────────

router.delete(
  "/invitations/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userRole, schoolId } = req;
      const { id } = req.params;

      if (userRole !== "admin" && userRole !== "super_admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
      }

      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { error, count } = await supabaseAdmin
        .from("invitations")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("school_id", schoolId);

      if (error) {
        console.error("[invitations] delete error:", error);
        res.status(500).json({ error: error.message ?? "Failed to delete invitation" });
        return;
      }

      if (count === 0) {
        res.status(404).json({ error: "Invitation not found" });
        return;
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in DELETE /invitations/:id:", err);
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── GET /invitations/accept/:token — public: get invite details ──────────────

router.get(
  "/invitations/accept/:token",
  async (req, res: Response): Promise<void> => {
    try {
      const { token } = req.params;

      const { data: invitation, error } = await supabaseAdmin
        .from("invitations")
        .select("id, email, role, status, expires_at, school_id")
        .eq("token", token)
        .single();

      if (error || !invitation) {
        res.status(404).json({ error: "Invitation not found" });
        return;
      }

      if (invitation.status === "accepted") {
        res.status(410).json({ error: "Invitation has already been accepted" });
        return;
      }

      if (new Date(invitation.expires_at) < new Date()) {
        res.status(410).json({ error: "Invitation has expired" });
        return;
      }

      const { data: school } = await supabaseAdmin
        .from("schools")
        .select("name")
        .eq("id", invitation.school_id)
        .single();

      res.json({
        email: invitation.email,
        role: invitation.role,
        schoolName: school?.name ?? null,
      });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in GET /invitations/accept/:token:", err);
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── POST /invitations/accept/:token — accept invitation ─────────────────────

router.post(
  "/invitations/accept/:token",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const { userId } = req;

      const { data: invitation, error } = await supabaseAdmin
        .from("invitations")
        .select("id, email, role, status, expires_at, school_id, invited_by, program_id, student_id")
        .eq("token", token)
        .single();

      if (error || !invitation) {
        res.status(404).json({ error: "Invitation not found" });
        return;
      }

      if (invitation.status === "accepted") {
        res.status(410).json({ error: "Invitation has already been accepted" });
        return;
      }

      if (new Date(invitation.expires_at) < new Date()) {
        res.status(410).json({ error: "Invitation has expired" });
        return;
      }

      // Security: this endpoint grants the invitation's role + school to
      // whatever account is currently authenticated. If that ever isn't the
      // actual invited person — e.g. someone already signed in (an admin
      // testing/previewing an invite link, a stale session, a forged
      // request) hits this with someone else's token — their OWN account
      // would silently be overwritten with the invite's role and school.
      // Require the caller's email to match the invited email.
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", userId!)
        .maybeSingle();
      const callerEmail = (callerProfile?.email as string | null)?.toLowerCase().trim();
      if (!callerEmail || callerEmail !== invitation.email.toLowerCase().trim()) {
        res.status(403).json({
          error: "This invitation was sent to a different email address than the account you're signed in as.",
        });
        return;
      }

      // Update the invitee's profile with the role and school from the invitation
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          role: invitation.role,
          school_id: invitation.school_id,
        })
        .eq("id", userId);

      if (profileError) {
        console.error("[invitations] profile update error:", profileError);
        res.status(500).json({ error: "Failed to update profile" });
        return;
      }

      invalidateCachedProfile(userId!);

      // Auto-enroll user in school's public chat channels (non-blocking)
      enrollUserInSchoolChannels(userId!, invitation.school_id, invitation.invited_by).catch((e) =>
        console.warn("[invitations] chat enroll error:", e)
      );

      // A transferring student invited straight into a program gets enrolled
      // in every course of that program, same as the normal cascade-enroll
      // path (non-blocking; the account is still created either way).
      if (invitation.role === "student" && invitation.program_id) {
        supabaseAdmin
          .from("courses")
          .select("id")
          .eq("program_id", invitation.program_id)
          .then(async ({ data: programCourses }) => {
            for (const course of programCourses ?? []) {
              await enrollStudentInCourse(course.id as string, userId!).catch((e) =>
                console.warn("[invitations] program enroll error:", e)
              );
            }

            const { data: program } = await supabaseAdmin
              .from("programs")
              .select("name")
              .eq("id", invitation.program_id)
              .maybeSingle();

            notifyUsers({
              userIds: [userId!],
              type: "program_enrolled",
              category: "enrollment",
              title: "You've been added to a program",
              body: `You've been added to the ${program?.name ?? "your"} program and enrolled in its courses.`,
              link: "/dashboard/student",
            }).catch((e) => console.warn("[invitations] program notify error:", e));
          });
      }

      // A parent invitation links the new account to the student it was
      // sent for. Non-blocking, same pattern as the program-enroll cascade
      // above — the parent account is still created either way.
      if (invitation.role === "parent" && invitation.student_id) {
        supabaseAdmin
          .from("parent_student_links")
          .upsert(
            { parent_id: userId, student_id: invitation.student_id },
            { onConflict: "parent_id,student_id" }
          )
          .then(({ error: linkError }) => {
            if (linkError) console.warn("[invitations] parent link error:", linkError);
          });
      }

      // Mark invitation as accepted
      const { error: inviteUpdateError } = await supabaseAdmin
        .from("invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      if (inviteUpdateError) {
        console.error("[invitations] status update error:", inviteUpdateError);
      }

      // Send welcome email (non-blocking)
      try {
        const [profileRes, schoolRes] = await Promise.all([
          supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId!).single(),
          supabaseAdmin.from("schools").select("name").eq("id", invitation.school_id).single(),
        ]);
        const firstName = (profileRes.data as any)?.first_name ?? "there";
        const schoolName = (schoolRes.data as any)?.name;
        const email = invitation.email;
        const appUrl = process.env.APP_URL ?? "https://solomonquest.com";
        if (email) {
          sendWelcomeEmail({ to: email, firstName, schoolName, role: invitation.role, loginUrl: `${appUrl}/auth/login` });
        }
      } catch (e) {
        console.warn("[invitations] Could not send welcome email:", e);
      }

      res.json({ success: true, role: invitation.role, schoolId: invitation.school_id });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in POST /invitations/accept/:token:", err);
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

export default router;
