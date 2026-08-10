import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(req.userId!);
  const authUser = userData?.user;

  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.userId)
    .single();

  // Auto-create profile if missing (e.g. signed up before trigger existed)
  if (!profile && authUser) {
    const meta = authUser.user_metadata ?? {};
    const firstName = (meta.first_name ?? meta.full_name?.split(" ")[0] ?? "").trim();
    const lastName = (meta.last_name ?? meta.full_name?.split(" ").slice(1).join(" ") ?? "").trim();
    const { data: newProfile } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: req.userId, first_name: firstName, last_name: lastName, phone: meta.phone ?? null })
      .select()
      .single();
    profile = newProfile;
  }

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  // Auto-repair role: if user owns a school but has no role, set them as admin
  if (!profile.role && profile.school_id) {
    await supabaseAdmin.from("profiles").update({ role: "admin" }).eq("id", req.userId!);
    profile.role = "admin";
  } else if (!profile.role) {
    // Check if this user is the owner of any school
    const { data: ownedSchool } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("owner_id", req.userId)
      .maybeSingle();
    if (ownedSchool) {
      await supabaseAdmin
        .from("profiles")
        .update({ role: "admin", school_id: ownedSchool.id })
        .eq("id", req.userId!);
      profile.role = "admin";
      profile.school_id = ownedSchool.id;
    }
  }

  res.json({
    id: profile.id,
    schoolId: profile.school_id,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    email: authUser?.email ?? null,
    internalEmail: profile.internal_email ?? null,
    uniqueStudentId: profile.unique_student_id ?? null,
    testModeEnabled: profile.test_mode_enabled ?? false,
  });
});

export default router;
