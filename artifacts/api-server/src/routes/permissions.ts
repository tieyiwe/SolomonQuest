import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const DEFAULT_FEATURES = [
  "chat",
  "forum",
  "quizzes",
  "resources",
  "video",
  "assignments",
  "announcements",
  "grades",
  "applications",
  "student_contact_info",
  "student_program_info",
  "student_attendance",
];

// GET /permissions/my - get current user's permissions based on their role and school
router.get("/permissions/my", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const { role, school_id } = profile;

    const { data: rolePermissions, error: permError } = await supabaseAdmin
      .from("role_permissions")
      .select("feature, enabled")
      .eq("school_id", school_id)
      .eq("role", role);

    if (permError) {
      return res.status(500).json({ error: permError.message });
    }

    const permissions: Record<string, boolean> = {};

    // Initialize all default features to false
    for (const feature of DEFAULT_FEATURES) {
      permissions[feature] = false;
    }

    // Override with stored permissions
    for (const perm of rolePermissions ?? []) {
      permissions[perm.feature] = perm.enabled;
    }

    return res.json({ permissions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /permissions?school_id=X - get all permissions for a school (admin only)
router.get("/permissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { school_id } = req.query;

    if (!school_id) {
      return res.status(400).json({ error: "school_id query parameter is required" });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden: admin access required" });
    }

    // Non-super_admin admins may only view their OWN school's permissions —
    // school_id was a raw, unchecked query param, letting any admin read
    // another school's feature-gating config just by passing its id.
    if (profile.role !== "super_admin" && profile.school_id !== school_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data: rolePermissions, error: permError } = await supabaseAdmin
      .from("role_permissions")
      .select("role, feature, enabled")
      .eq("school_id", school_id);

    if (permError) {
      return res.status(500).json({ error: permError.message });
    }

    // Group permissions by role
    const grouped: Record<string, Record<string, boolean>> = {};

    for (const perm of rolePermissions ?? []) {
      if (!grouped[perm.role]) {
        grouped[perm.role] = {};
      }
      grouped[perm.role][perm.feature] = perm.enabled;
    }

    return res.json({ permissions: grouped });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /permissions - upsert a permission (admin only)
router.put("/permissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { school_id, role, feature, enabled } = req.body;

    if (!school_id || !role || !feature || enabled === undefined) {
      return res.status(400).json({ error: "school_id, role, feature, and enabled are required" });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, school_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden: admin access required" });
    }

    // Same fix as GET / above — an admin could otherwise silently rewrite
    // another school's feature-gating config by passing its school_id.
    if (profile.role !== "super_admin" && profile.school_id !== school_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { data, error: upsertError } = await supabaseAdmin
      .from("role_permissions")
      .upsert(
        { school_id, role, feature, enabled },
        { onConflict: "school_id,role,feature" }
      )
      .select()
      .single();

    if (upsertError) {
      return res.status(500).json({ error: upsertError.message });
    }

    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
