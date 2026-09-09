import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admins can preview the app as a teacher/student/staff account to check
// what they'd see after a change. "admin" is also allowed as a target for
// a super_admin caller, or for a non-admin test_mode account an admin has
// specifically flagged with test_mode_admin_access (known testers helping
// exercise every role) — see the checks below. A regular (non-super) admin
// can never view as another admin. super_admin itself is never a valid
// target, for anyone, ever.
const IMPERSONATABLE_ROLES = new Set(["teacher", "staff", "student", "admin"]);

// Self-service test_mode switching is meant for previewing same-or-lower
// privilege accounts (e.g. a teacher checking what a student sees), not for
// a low-privilege account to hop into a higher one. Without this, granting
// test_mode_enabled to any single student/staff account handed them a real
// session as any teacher or staff member in the school — full grading and
// roster access, well beyond "preview" — since the only checks were
// same-school and not-admin.
const ROLE_RANK: Record<string, number> = { student: 0, staff: 0, teacher: 1, admin: 2, super_admin: 3 };

// ─── POST /admin/impersonate/:userId ─────────────────────────────────────────
// Mints a one-time login link for the target user via the Supabase admin API
// and hands back just the pieces the client needs to redeem it with
// supabase.auth.verifyOtp — this establishes a *real* session as that user,
// so every existing fetch/query in the app "just works" once the client
// swaps to it, with no per-page changes needed.
//
// Two kinds of caller are allowed: an admin/super_admin using "View As", or
// any user an admin has explicitly flagged with test_mode_enabled — lets a
// team member self-switch between accounts for pre-launch testing without
// needing an admin to trigger it every time. Both are still restricted to
// teacher/staff/student targets in their own school (never another admin).

router.post(
  "/admin/impersonate/:userId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    let callerHasAdminTestAccess = false;

    if (!isAdmin) {
      const { data: caller } = await supabaseAdmin
        .from("profiles")
        .select("test_mode_enabled, test_mode_admin_access")
        .eq("id", req.userId ?? "")
        .single();
      if (!caller?.test_mode_enabled) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      callerHasAdminTestAccess = caller.test_mode_admin_access === true;
    }

    const callerRank = ROLE_RANK[req.userRole ?? ""] ?? -1;

    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    const { data: target, error } = await supabaseAdmin
      .from("profiles")
      .select("id, role, school_id, first_name, last_name, email")
      .eq("id", userId)
      .single();

    if (error || !target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!IMPERSONATABLE_ROLES.has(target.role as string)) {
      res.status(403).json({ error: "You can only view as a teacher, staff member, student, or admin" });
      return;
    }

    if (target.role === "admin" && !(req.userRole === "super_admin" || callerHasAdminTestAccess)) {
      res.status(403).json({ error: "Only a super admin — or a tester with admin test access — can view as an admin" });
      return;
    }

    if (
      !isAdmin &&
      !(target.role === "admin" && callerHasAdminTestAccess) &&
      (ROLE_RANK[target.role as string] ?? 99) > callerRank
    ) {
      res.status(403).json({ error: "Test Mode can only preview accounts at or below your own role" });
      return;
    }

    if (target.school_id !== req.schoolId && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // email is denormalized onto profiles (kept in sync by a DB trigger —
    // see supabase-perf-denormalize-email.sql), so this avoids a separate
    // Auth Admin API call (billed/rate-limited independently of Postgres)
    // just to look up an email we already have.
    const targetEmail = target.email as string | null;
    if (!targetEmail) {
      res.status(404).json({ error: "This user has no login email on file" });
      return;
    }

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });

    if (linkError || !link) {
      res.status(500).json({ error: linkError?.message ?? "Failed to start view-as session" });
      return;
    }

    const hashedToken = (link.properties as { hashed_token?: string } | undefined)?.hashed_token;
    if (!hashedToken) {
      res.status(500).json({ error: "Failed to start view-as session" });
      return;
    }

    await supabaseAdmin.from("platform_audit_log").insert({
      action: isAdmin ? "admin_impersonate_start" : "test_mode_switch_start",
      performed_by: req.userId,
      target_type: "user",
      target_id: userId,
      target_name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || targetEmail,
      metadata: { targetRole: target.role },
    });

    logger.info(
      { callerId: req.userId, targetUserId: userId, targetRole: target.role, isAdmin },
      "View-as session started"
    );

    res.json({
      emailOtp: hashedToken,
      email: targetEmail,
      targetUser: {
        id: target.id,
        name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || targetEmail,
        role: target.role,
      },
    });
  }
);

export default router;
