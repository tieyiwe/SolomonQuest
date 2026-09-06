import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { clerkClient } from "../lib/clerk";
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
// Issues a Clerk "actor token" for the target user — a short-lived ticket
// the client redeems with `signIn.create({ strategy: "ticket", ticket })` to
// get a real second Clerk session for that account, without needing the
// admin's own session to be affected (Clerk supports multiple concurrent
// sessions per browser; "Return to My Account" just switches the active one
// back). This requires the target to have signed in via Clerk at least
// once — a legacy account that hasn't been through the Clerk sign-in flow
// yet has no `clerk_user_id` and can't be impersonated until it does.
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
      .select("id, role, school_id, first_name, last_name, clerk_user_id")
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

    const targetClerkId = target.clerk_user_id as string | null;
    if (!targetClerkId) {
      res.status(400).json({ error: "This user hasn't signed in yet, so there's no account to view as." });
      return;
    }

    // Resolve the caller's own Clerk id for the actor token's `actor.sub`.
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("clerk_user_id")
      .eq("id", req.userId ?? "")
      .maybeSingle();
    const callerClerkId = callerProfile?.clerk_user_id as string | undefined;

    let actorToken;
    try {
      actorToken = await clerkClient.actorTokens.create({
        userId: targetClerkId,
        actor: { sub: callerClerkId ?? req.userId ?? "unknown" },
        expiresInSeconds: 300,
      });
    } catch (err) {
      logger.error({ err }, "Failed to create Clerk actor token");
      res.status(500).json({ error: "Failed to start view-as session" });
      return;
    }

    if (!actorToken.token) {
      res.status(500).json({ error: "Failed to start view-as session" });
      return;
    }

    await supabaseAdmin.from("platform_audit_log").insert({
      action: isAdmin ? "admin_impersonate_start" : "test_mode_switch_start",
      performed_by: req.userId,
      target_type: "user",
      target_id: userId,
      target_name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || userId,
      metadata: { targetRole: target.role },
    });

    logger.info(
      { callerId: req.userId, targetUserId: userId, targetRole: target.role, isAdmin },
      "View-as session started"
    );

    res.json({
      ticket: actorToken.token,
      targetUser: {
        id: target.id,
        name: `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || userId,
        role: target.role,
      },
    });
  }
);

export default router;
