import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// POST /activity-log — log a user action
router.post("/activity-log", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { action, target_type, target_id, target_name, metadata } = req.body;

  if (!action) {
    res.status(400).json({ error: "action is required" });
    return;
  }

  try {
    const { error } = await supabaseAdmin.from("platform_audit_log").insert({
      action,
      target_type: target_type ?? null,
      target_id: target_id ?? null,
      target_name: target_name ?? null,
      performed_by: req.userId,
      metadata: metadata ?? null,
    });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.sendStatus(201);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// GET /activity-log — fetch activity log for school admins
router.get("/activity-log", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string || "100"), 500);
  const offset = parseInt(req.query.offset as string || "0");
  const actionFilter = req.query.action as string | undefined;
  const performedByFilter = req.query.performedBy as string | undefined;
  const fromDate = req.query.from as string | undefined;
  const toDate = req.query.to as string | undefined;

  // Fetch log entries for users in this school
  const { data: schoolUsers } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("school_id", req.schoolId ?? "");

  const userIds = (schoolUsers ?? []).map((u: { id: string }) => u.id);
  if (userIds.length === 0) {
    res.json({ entries: [], total: 0 });
    return;
  }

  let query = supabaseAdmin
    .from("platform_audit_log")
    .select("*, profiles:performed_by(first_name, last_name, email, role)", { count: "exact" })
    .in("performed_by", userIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actionFilter) query = query.eq("action", actionFilter);
  if (performedByFilter) query = query.eq("performed_by", performedByFilter);
  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate) query = query.lte("created_at", toDate);

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    entries: (data ?? []).map((e: Record<string, unknown>) => {
      const profile = e.profiles as Record<string, unknown> | null;
      return {
        id: e.id,
        action: e.action,
        targetType: e.target_type,
        targetId: e.target_id,
        targetName: e.target_name,
        metadata: e.metadata,
        performedBy: e.performed_by,
        performerName: profile
          ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || (profile.email as string)
          : "Unknown",
        performerRole: profile?.role ?? "",
        createdAt: e.created_at,
      };
    }),
    total: count ?? 0,
  });
});

// GET /activity-log/actions — distinct action types seen for this school,
// for populating the filter dropdown without hardcoding a list client-side.
router.get("/activity-log/actions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const role = req.userRole;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const { data: schoolUsers } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("school_id", req.schoolId ?? "");

  const userIds = (schoolUsers ?? []).map((u: { id: string }) => u.id);
  if (userIds.length === 0) {
    res.json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("platform_audit_log")
    .select("action")
    .in("performed_by", userIds)
    .limit(2000);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const actions = Array.from(new Set((data ?? []).map((r) => r.action as string))).sort();
  res.json(actions);
});

export default router;
