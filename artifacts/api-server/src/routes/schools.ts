import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import { supabaseAdmin } from "../lib/supabase";
import { logger } from "../lib/logger";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { notifyUsers } from "../lib/notifications";

const router: IRouter = Router();

// List all schools (public)
router.get("/schools", async (_req, res): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from("schools")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ error }, "Supabase error listing schools");
      res.status(500).json({ error: error.message });
      return;
    }

    res.json((data ?? []).map(mapSchool));
  } catch (err: any) {
    logger.error({ err }, "Unhandled error listing schools");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user's school
router.get("/schools/my", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.schoolId) {
    res.status(404).json({ error: "No school associated" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("id", req.schoolId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// Look up a school by its verified custom domain (public) — used by the
// frontend on boot when the hostname isn't the platform's own domain, so it
// knows which school's public page to render.
router.get("/schools/by-domain/:domain", async (req, res): Promise<void> => {
  const domain = (Array.isArray(req.params.domain) ? req.params.domain[0] : req.params.domain).toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("custom_domain", domain)
    .eq("custom_domain_status", "verified")
    .maybeSingle();

  if (error || !data) {
    res.status(404).json({ error: "No school found for this domain" });
    return;
  }

  res.json(mapSchool(data));
});

// Get school by slug (public)
router.get("/schools/:slug", optionalAuth, async (req, res): Promise<void> => {
  const { slug } = req.params;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// Create school
router.post("/schools/create", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { name, slug, primaryColor, secondaryColor } = req.body;

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: "Slug must contain only lowercase letters, numbers, and hyphens." });
    return;
  }

  // Enforce unique school name (case-insensitive)
  const { data: nameConflict } = await supabaseAdmin
    .from("schools")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (nameConflict) {
    res.status(409).json({ error: "A school with this name already exists. Please choose a different name." });
    return;
  }

  // Enforce unique slug
  const { data: slugConflict } = await supabaseAdmin
    .from("schools")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (slugConflict) {
    res.status(409).json({ error: "This URL slug is already taken. Please choose a different one." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("schools")
    .insert({
      name,
      slug,
      owner_id: req.userId,
      primary_color: primaryColor ?? "#6E5238",
      secondary_color: secondaryColor ?? "#B58F5E",
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    // DB-level unique constraint fallback
    if (error.code === "23505") {
      const msg = error.message.includes("name")
        ? "A school with this name already exists."
        : "This URL slug is already taken.";
      res.status(409).json({ error: msg });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }

  // Assign admin role to creator
  await supabaseAdmin
    .from("profiles")
    .update({ school_id: data.id, role: "admin" })
    .eq("id", req.userId);

  const { data: superAdmins } = await supabaseAdmin.from("profiles").select("id").eq("role", "super_admin");
  const superAdminIds = (superAdmins ?? []).map((p) => p.id as string);
  if (superAdminIds.length > 0) {
    notifyUsers({
      userIds: superAdminIds,
      type: "school_created",
      category: "platform",
      title: "New school created",
      body: `${name} was just created on the platform.`,
      link: "/super_admin",
    }).catch((err) => logger.error({ err }, "Failed to notify super admins of new school"));
  }

  res.status(201).json(mapSchool(data));
});

// Get school by slug (public, explicit path to avoid conflict with /:id)
router.get("/schools/slug/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// Update school branding (admin only)
router.put("/schools/:id/branding", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "super_admin") {
    if (req.userRole !== "admin" || req.schoolId !== id) {
      res.status(403).json({ error: "Not authorized to update this school's branding" });
      return;
    }
  }

  const body = req.body as Record<string, unknown>;
  const { slug, logo_url, tagline, primary_color, secondary_color } = body;

  // Validate slug if provided
  if (slug !== undefined) {
    if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: "Slug must be lowercase alphanumeric with hyphens only" });
      return;
    }
    const { data: slugConflict } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("slug", slug)
      .neq("id", id)
      .maybeSingle();
    if (slugConflict) {
      res.status(409).json({ error: "Slug is already taken" });
      return;
    }
  }

  // Only update columns guaranteed to exist in the base schema
  const coreUpdates: Record<string, unknown> = {};
  if (slug !== undefined) coreUpdates.slug = slug;
  if (logo_url !== undefined) coreUpdates.logo_url = logo_url;
  if (tagline !== undefined) coreUpdates.tagline = tagline;
  if (primary_color !== undefined) coreUpdates.primary_color = primary_color;
  if (secondary_color !== undefined) coreUpdates.secondary_color = secondary_color;

  // Fetch existing branding JSONB and merge the body into it — but only the
  // fields this JSONB blob is actually meant to hold, not the raw body
  // wholesale (that included things like `slug`/`logo_url` already handled
  // as real columns above, and would silently persist any other key an
  // admin's client happened to send).
  const BRANDING_KEYS = [
    "banner_slides", "hero_settings", "accent_color", "body_font",
    "heading_font", "heading_text_color", "border_radius", "stats_visible", "stats",
    "features", "testimonials", "show_announcement", "announcement_text",
    "announcement_bg_color", "social_website", "social_facebook", "social_twitter",
    "social_instagram", "social_linkedin", "social_youtube", "custom_css",
  ];
  const { data: currentRow } = await supabaseAdmin
    .from("schools").select("branding").eq("id", id).single();
  const existingBranding = (currentRow?.branding as Record<string, unknown>) ?? {};
  const brandingPatch: Record<string, unknown> = {};
  for (const key of BRANDING_KEYS) {
    if (body[key] !== undefined) brandingPatch[key] = body[key];
  }
  const mergedBranding = { ...existingBranding, ...brandingPatch };

  // Try saving with branding JSONB; fall back to core columns only if branding column missing
  let { data, error } = await supabaseAdmin
    .from("schools")
    .update({ ...coreUpdates, branding: mergedBranding })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.warn({ error }, "branding update failed, retrying with core columns only");
    const fallback = await supabaseAdmin
      .from("schools")
      .update(coreUpdates)
      .eq("id", id)
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    logger.error({ error }, "Error updating school branding");
    res.status(500).json({ error: error?.message ?? "Update failed" });
    return;
  }

  res.json(mapSchool(data));
  } catch (err: any) {
    logger.error({ err }, "Unhandled error in PUT /schools/:id/branding");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

function platformHostname(): string {
  const url = process.env.APP_URL ?? process.env.FRONTEND_URL;
  if (!url) return "your-app-url.example.com";
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function canManageDomain(req: AuthenticatedRequest, schoolId: string): boolean {
  if (req.userRole === "super_admin") return true;
  return req.userRole === "admin" && req.schoolId === schoolId;
}

function dnsRecordsFor(domain: string, token: string) {
  return [
    { type: "CNAME", host: domain, value: platformHostname(), note: "Points your domain at SolomonQuest" },
    { type: "TXT", host: `_solomonquest-verify.${domain}`, value: token, note: "Proves you own this domain" },
  ];
}

// School admin submits a domain for the platform team to review. This does
// NOT connect anything yet — it just records the request and notifies every
// super_admin so they can add it in the hosting provider's domain settings
// (a manual step outside the app) before approving it.
router.post(
  "/schools/:id/custom-domain/request",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!canManageDomain(req, id)) {
      res.status(403).json({ error: "Not authorized to manage this school's domain" });
      return;
    }

    const { domain } = req.body as { domain?: string };
    if (!domain || typeof domain !== "string" || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      res.status(400).json({ error: "Enter a valid domain, e.g. school.edu" });
      return;
    }

    const normalizedDomain = domain.trim().toLowerCase();

    const { data: conflict } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("custom_domain", normalizedDomain)
      .neq("id", id)
      .maybeSingle();
    if (conflict) {
      res.status(409).json({ error: "That domain is already connected to another school" });
      return;
    }

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .update({
        custom_domain: normalizedDomain,
        custom_domain_status: "requested",
        custom_domain_token: null,
        custom_domain_requested_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("name")
      .single();

    if (error || !school) {
      res.status(500).json({ error: error?.message ?? "Failed to submit domain request" });
      return;
    }

    const { data: superAdmins } = await supabaseAdmin.from("profiles").select("id").eq("role", "super_admin");
    const superAdminIds = (superAdmins ?? []).map((p) => p.id as string);
    if (superAdminIds.length > 0) {
      await notifyUsers({
        userIds: superAdminIds,
        type: "domain_request",
        category: "platform",
        title: "New custom domain request",
        body: `${school.name} requested to connect ${normalizedDomain}`,
        link: "/super-admin/domain-requests",
      });
    }

    res.json({ status: "requested", domain: normalizedDomain });
  }
);

// Check the TXT record and mark the domain verified once it matches. Only
// meaningful once a super-admin has approved the request and generated the
// DNS records (status "approved" or a previously "failed" verify attempt).
router.post(
  "/schools/:id/custom-domain/verify",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!canManageDomain(req, id)) {
      res.status(403).json({ error: "Not authorized to manage this school's domain" });
      return;
    }

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .select("custom_domain, custom_domain_token, custom_domain_status")
      .eq("id", id)
      .single();

    if (
      error ||
      !school?.custom_domain ||
      !school.custom_domain_token ||
      (school.custom_domain_status !== "approved" && school.custom_domain_status !== "failed")
    ) {
      res.status(400).json({ error: "This domain hasn't been approved yet" });
      return;
    }

    try {
      const records = await resolveTxt(`_solomonquest-verify.${school.custom_domain}`);
      const found = records.some((chunks) => chunks.join("").trim() === school.custom_domain_token);

      if (!found) {
        await supabaseAdmin.from("schools").update({ custom_domain_status: "failed" }).eq("id", id);
        res.status(422).json({
          verified: false,
          error: "TXT record not found yet. DNS changes can take up to a few hours to propagate — try again shortly.",
        });
        return;
      }

      await supabaseAdmin.from("schools").update({ custom_domain_status: "verified" }).eq("id", id);
      res.json({ verified: true, status: "verified" });
    } catch (err: any) {
      await supabaseAdmin.from("schools").update({ custom_domain_status: "failed" }).eq("id", id);
      res.status(422).json({
        verified: false,
        error: "Could not find that DNS record yet. Double-check it was added correctly, then try again.",
      });
    }
  }
);

// Current domain status + (once approved) the DNS records to add.
router.get(
  "/schools/:id/custom-domain",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!canManageDomain(req, id)) {
      res.status(403).json({ error: "Not authorized to view this school's domain" });
      return;
    }

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .select("custom_domain, custom_domain_status, custom_domain_token")
      .eq("id", id)
      .single();

    if (error || !school) {
      res.status(404).json({ error: "School not found" });
      return;
    }

    const dnsRecords =
      school.custom_domain && school.custom_domain_token
        ? dnsRecordsFor(school.custom_domain, school.custom_domain_token)
        : [];

    res.json({
      domain: school.custom_domain,
      status: school.custom_domain_status,
      dnsRecords,
    });
  }
);

// Disconnect a custom domain.
router.delete(
  "/schools/:id/custom-domain",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!canManageDomain(req, id)) {
      res.status(403).json({ error: "Not authorized to manage this school's domain" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("schools")
      .update({ custom_domain: null, custom_domain_status: "unset", custom_domain_token: null })
      .eq("id", id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.sendStatus(204);
  }
);

// Update school
router.patch("/schools/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Only admin/super_admin of this school may update it
  if (req.userRole !== "super_admin") {
    if (req.userRole !== "admin" || req.schoolId !== id) {
      res.status(403).json({ error: "Not authorized to update this school" });
      return;
    }
  }
  const { name, primaryColor, secondaryColor, logoUrl, isActive, applicationsOpen, assignment_routing } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (primaryColor !== undefined) updates.primary_color = primaryColor;
  if (secondaryColor !== undefined) updates.secondary_color = secondaryColor;
  if (logoUrl !== undefined) updates.logo_url = logoUrl;
  if (isActive !== undefined) updates.is_active = isActive;
  if (applicationsOpen !== undefined) updates.applications_open = applicationsOpen;
  if (assignment_routing !== undefined) updates.assignment_routing = assignment_routing;

  const { data, error } = await supabaseAdmin
    .from("schools")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "School not found" });
    return;
  }

  res.json(mapSchool(data));
});

// POST /schools/:id/transfer-ownership — hand school ownership to another
// admin/staff/teacher in the same school. Only the current owner or a
// super_admin may initiate; the target is promoted to admin if needed.
router.post(
  "/schools/:id/transfer-ownership",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { newOwnerId, confirmSchoolName } = req.body as {
      newOwnerId?: string;
      confirmSchoolName?: string;
    };

    if (!newOwnerId) {
      res.status(400).json({ error: "newOwnerId is required" });
      return;
    }

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .select("id, name, owner_id")
      .eq("id", id)
      .single();

    if (schoolError || !school) {
      res.status(404).json({ error: "School not found" });
      return;
    }

    const isCurrentOwner = school.owner_id === req.userId;
    const isSuperAdmin = req.userRole === "super_admin";
    if (!isCurrentOwner && !isSuperAdmin) {
      res.status(403).json({ error: "Only the current owner or a super admin can transfer ownership" });
      return;
    }

    // Require the caller to re-type the school's exact name as a final
    // confirmation step — mirrors the same pattern used for school deletion.
    if (
      !confirmSchoolName ||
      confirmSchoolName.trim().toLowerCase() !== (school.name ?? "").trim().toLowerCase()
    ) {
      res.status(400).json({ error: "School name confirmation does not match" });
      return;
    }

    if (newOwnerId === school.owner_id) {
      res.status(400).json({ error: "This user already owns the school" });
      return;
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, school_id, role, first_name, last_name")
      .eq("id", newOwnerId)
      .single();

    if (targetError || !targetProfile) {
      res.status(404).json({ error: "Target user not found" });
      return;
    }

    if (targetProfile.school_id !== id) {
      res.status(400).json({ error: "The new owner must already be a member of this school" });
      return;
    }

    if (targetProfile.role === "student") {
      res.status(400).json({ error: "A student cannot become the school owner — promote them to staff or teacher first" });
      return;
    }

    // The owner must hold admin rights; promote if the target is currently
    // teacher/staff.
    if (targetProfile.role !== "admin" && targetProfile.role !== "super_admin") {
      const { error: promoteError } = await supabaseAdmin
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", newOwnerId);

      if (promoteError) {
        res.status(500).json({ error: promoteError.message });
        return;
      }
    }

    const { data: updatedSchool, error: updateError } = await supabaseAdmin
      .from("schools")
      .update({ owner_id: newOwnerId })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedSchool) {
      res.status(500).json({ error: updateError?.message ?? "Failed to transfer ownership" });
      return;
    }

    const newOwnerName =
      [targetProfile.first_name, targetProfile.last_name].filter(Boolean).join(" ") || "A new owner";

    await supabaseAdmin.from("notifications").insert([
      {
        user_id: newOwnerId,
        type: "info",
        message: `You are now the owner of ${school.name}.`,
        is_read: false,
      },
      ...(school.owner_id
        ? [
            {
              user_id: school.owner_id,
              type: "info",
              message: `You transferred ownership of ${school.name} to ${newOwnerName}.`,
              is_read: false,
            },
          ]
        : []),
    ]);

    res.json(mapSchool(updatedSchool));
  }
);

// POST /schools/:id/request-deletion — school admin initiates deletion request
router.post("/schools/:id/request-deletion", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Verify caller is admin of this school
  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("role, school_id")
    .eq("id", req.userId)
    .single();

  if (!callerProfile || callerProfile.role !== "admin" || callerProfile.school_id !== id) {
    res.status(403).json({ error: "You must be an admin of this school to request deletion." });
    return;
  }

  // Fetch school record
  const { data: school, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name")
    .eq("id", id)
    .single();

  if (schoolErr || !school) {
    res.status(404).json({ error: "School not found." });
    return;
  }

  // Prerequisite 1: active students
  const { count: studentCount } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id)
    .eq("role", "student");

  if ((studentCount ?? 0) > 0) {
    res.status(400).json({
      error: `Cannot request deletion: school has ${studentCount} active students. Please unenroll all students first.`,
    });
    return;
  }

  // Prerequisite 2: teachers
  const { count: teacherCount } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id)
    .eq("role", "teacher");

  if ((teacherCount ?? 0) > 0) {
    res.status(400).json({
      error: `Cannot request deletion: school has ${teacherCount} teachers. Please remove all teachers first.`,
    });
    return;
  }

  // Prerequisite 3: active courses
  const { count: courseCount } = await supabaseAdmin
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("school_id", id);

  if ((courseCount ?? 0) > 0) {
    res.status(400).json({
      error: `Cannot request deletion: school has ${courseCount} active courses. Please delete all courses first.`,
    });
    return;
  }

  const { reason } = req.body;

  // Insert deletion request
  const { data: deletionRequest, error: insertErr } = await supabaseAdmin
    .from("school_deletion_requests")
    .insert({
      school_id: id,
      school_name: school.name,
      requested_by: req.userId,
      reason: reason ?? null,
      status: "pending",
    })
    .select("id, status, created_at")
    .single();

  if (insertErr || !deletionRequest) {
    logger.error({ error: insertErr }, "Failed to insert school_deletion_requests");
    res.status(500).json({ error: "Failed to create deletion request." });
    return;
  }

  // Audit log
  await supabaseAdmin.from("platform_audit_log").insert({
    action: "deletion_requested",
    target_type: "school",
    target_id: id,
    target_name: school.name,
    performed_by: req.userId,
  });

  // Notify super_admins
  const { data: superAdmins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "super_admin");

  if (superAdmins && superAdmins.length > 0) {
    const notifications = superAdmins.map((sa: { id: string }) => ({
      user_id: sa.id,
      type: "school_deletion_requested",
      title: "School Deletion Request",
      message: `School "${school.name}" has submitted a deletion request.`,
      metadata: { school_id: id, request_id: deletionRequest.id },
      read: false,
    }));
    await supabaseAdmin.from("notifications").insert(notifications);
  }

  res.status(201).json({
    message: "Deletion request submitted. The platform team will review and contact you.",
    request_id: deletionRequest.id,
  });
});

// GET /schools/:id/deletion-status — check if a deletion request exists
router.get("/schools/:id/deletion-status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.userRole !== "super_admin") {
    if (req.userRole !== "admin" || req.schoolId !== id) {
      res.status(403).json({ error: "Not authorized to view this school's deletion status" });
      return;
    }
  }

  const { data: request } = await supabaseAdmin
    .from("school_deletion_requests")
    .select("id, status, created_at, reason")
    .eq("school_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({ request: request ?? null });
});

function mapSchool(s: Record<string, unknown>) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    ownerId: s.owner_id,
    // Individual branding columns (used by SchoolPublicPage directly)
    primary_color: s.primary_color,
    secondary_color: s.secondary_color,
    accent_color: s.accent_color,
    logo_url: s.logo_url,
    heading_font: s.heading_font,
    heading_color: s.heading_color,
    body_font: s.body_font,
    border_radius: s.border_radius,
    tagline: s.tagline,
    banner_url: s.banner_url,
    banner_slides: s.banner_slides ?? [],
    hero_animation: s.hero_animation,
    stats_visible: s.stats_visible ?? true,
    stats: s.stats ?? [],
    features_section: s.features_section ?? [],
    testimonials: s.testimonials ?? [],
    social_links: s.social_links ?? {},
    show_announcement: s.show_announcement ?? false,
    announcement_banner: s.announcement_banner,
    announcement_color: s.announcement_color,
    custom_css: s.custom_css,
    isActive: s.is_active,
    createdAt: s.created_at,
    customDomain: s.custom_domain ?? null,
    customDomainStatus: s.custom_domain_status ?? "unset",
    applicationsOpen: s.applications_open ?? false,
    assignment_routing: s.assignment_routing ?? null,
    // Also expose camelCase aliases for backward compat
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    logoUrl: s.logo_url,
    headingFont: s.heading_font,
    headingColor: s.heading_color,
    customCss: s.custom_css,
    // branding JSONB if present
    branding: (s.branding as Record<string, unknown>) ?? {},
  };
}

export default router;
