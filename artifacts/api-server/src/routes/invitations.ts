import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getAppUserEmail } from "../lib/app-users";
import { sendEnhancedInvite, sendWelcomeEmail } from "../lib/email";
import { enrollUserInSchoolChannels } from "./chat";
import { enrollStudentInCourse } from "../lib/enrollment";
import { notifyUsers } from "../lib/notifications";

const router: IRouter = Router();

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

      const { email, role = "teacher", programId } = req.body as { email?: string; role?: string; programId?: string };

      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      if (programId && role !== "student") {
        res.status(400).json({ error: "programId only applies to student invitations" });
        return;
      }

      if (role === "student" && !programId) {
        res.status(400).json({ error: "A program is required to invite a student" });
        return;
      }

      if (programId) {
        const { data: program } = await supabaseAdmin
          .from("programs")
          .select("id")
          .eq("id", programId)
          .eq("school_id", schoolId)
          .maybeSingle();
        if (!program) {
          res.status(404).json({ error: "Program not found" });
          return;
        }
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invitation, error: insertError } = await supabaseAdmin
        .from("invitations")
        .insert({
          email,
          role,
          school_id: schoolId,
          invited_by: userId,
          status: "pending",
          expires_at: expiresAt,
          program_id: programId ?? null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[invitations] insert error:", insertError);
        res.status(500).json({ error: insertError.message ?? "Failed to create invitation" });
        return;
      }

      // Fetch school name and inviter name for the email
      const [schoolResult, profileResult] = await Promise.all([
        supabaseAdmin.from("schools").select("name").eq("id", schoolId).single(),
        supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).single(),
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
        // Do not fail the request — invitation is already created
      }

      res.status(201).json({ invitation });
    } catch (err: any) {
      console.error("[invitations] Unhandled error in POST /invitations:", err);
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
// The invitee signs up through Clerk on the frontend first (pre-filled with
// the invite's email), which is what actually creates their account; by the
// time this endpoint runs, `requireAuth` has already resolved (and
// auto-created, if new) their profile row. This endpoint's only job is to
// apply the invitation's role + school to that profile.

router.post(
  "/invitations/accept/:token",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const { userId } = req;

      const { data: invitation, error } = await supabaseAdmin
        .from("invitations")
        .select("id, email, role, status, expires_at, school_id, invited_by, program_id")
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
      const callerEmail = await getAppUserEmail(userId ?? "");
      if (!callerEmail || callerEmail.toLowerCase().trim() !== invitation.email.toLowerCase().trim()) {
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
          supabaseAdmin.from("profiles").select("first_name").eq("id", userId!).single(),
          supabaseAdmin.from("schools").select("name").eq("id", invitation.school_id).single(),
        ]);
        const appUrl = process.env.APP_URL ?? "https://solomonquest.com";
        sendWelcomeEmail({
          to: callerEmail,
          firstName: (profileRes.data as any)?.first_name || "there",
          schoolName: (schoolRes.data as any)?.name,
          role: invitation.role,
          loginUrl: `${appUrl}/auth/login`,
        });
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
