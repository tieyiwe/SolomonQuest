import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, appUsers } from "@workspace/db";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { signAuthToken } from "../lib/auth-jwt";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admins can preview the app as a teacher/student/staff account to check
// what they'd see after a change. "admin" is also allowed as a target, but
// only for a super_admin caller (see the extra check below) — a regular
// admin can never view as another admin, and self-triggered test_mode
// switches (any non-admin) can never target an admin account either, since
// that would be a privilege escalation rather than a same-or-lower preview.
const IMPERSONATABLE_ROLES = new Set(["teacher", "staff", "student", "admin"]);

// ─── POST /admin/impersonate/:userId ─────────────────────────────────────────
// Directly issues our own auth token for the target user — since this is a
// server-initiated action by an already-authenticated caller (not a login
// flow), there's no need for an email round-trip; the token is handed
// straight back and the client swaps to it, so every existing fetch/query in
// the app "just works" once the client swaps to it, with no per-page changes
// needed.
//
// Two kinds of caller are allowed: an admin/super_admin using "View As", or
// any user an admin has explicitly flagged with test_mode_enabled — lets a
// team member self-switch between accounts for pre-launch testing without
// needing an admin to trigger it every time. Both are still restricted to
// teacher/staff/student/admin targets in their own school (see role checks
// below for the admin-target exception).

router.post(
  "/admin/impersonate/:userId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

    if (!isAdmin) {
      const { data: caller } = await supabaseAdmin
        .from("profiles")
        .select("test_mode_enabled")
        .eq("id", req.userId ?? "")
        .single();
      if (!caller?.test_mode_enabled) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    const { data: target, error } = await supabaseAdmin
      .from("profiles")
      .select("id, role, school_id, first_name, last_name")
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

    if (target.role === "admin" && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Only a super admin can view as an admin" });
      return;
    }

    if (target.school_id !== req.schoolId && req.userRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [account] = await db.select().from(appUsers).where(eq(appUsers.id, userId));
    if (!account) {
      res.status(404).json({ error: "This user has no login account on file" });
      return;
    }

    const accessToken = signAuthToken(userId);

    await supabaseAdmin.from("platform_audit_log").insert({
      action: isAdmin ? "admin_impersonate_start" : "test_mode_switch_start",
      performed_by: req.userId,
      target_type: "user",
      target_id: userId,
      target_name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || account.email,
      metadata: { targetRole: target.role },
    });

    logger.info(
      { callerId: req.userId, targetUserId: userId, targetRole: target.role, isAdmin },
      "View-as session started"
    );

    res.json({
      accessToken,
      targetUser: {
        id: target.id,
        name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || account.email,
        role: target.role,
      },
    });
  }
);

export default router;
