import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getClerkUserEmail } from "../lib/clerk";

const router: IRouter = Router();

// Sign-up, login, password reset, and email verification are all handled by
// Clerk directly on the frontend (@clerk/clerk-react) — this route only
// reports back the resolved profile for the currently authenticated user.
// See middlewares/auth.ts / lib/profile-resolution.ts for how a Clerk
// session gets mapped to (and if needed, creates) a profile row.
router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.userId)
    .single();

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

  const email = profile.clerk_user_id ? await getClerkUserEmail(profile.clerk_user_id as string) : null;

  res.json({
    id: profile.id,
    schoolId: profile.school_id,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    email,
    internalEmail: profile.internal_email ?? null,
    uniqueStudentId: profile.unique_student_id ?? null,
    testModeEnabled: profile.test_mode_enabled ?? false,
  });
});

export default router;
