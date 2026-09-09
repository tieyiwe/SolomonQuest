import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { sendApplicationStatusUpdate } from "../lib/email";
import { enrollStudentInCourse } from "../lib/enrollment";
import { invalidateCachedProfile } from "../lib/profileCache";

const router: IRouter = Router();

const VALID_STATUSES = [
  "submitted",
  "received",
  "under_review",
  "finalizing",
  "approved",
  "rejected",
] as const;

type ApplicationStatus = (typeof VALID_STATUSES)[number];

// ─── Helper: format a single application row ──────────────────────────────────

function formatApplication(a: Record<string, unknown>) {
  return {
    id: a.id,
    schoolId: a.school_id,
    applicantId: a.applicant_id,
    status: a.status,
    notes: a.notes,
    rejectionReason: a.rejection_reason,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

// ─── POST /applications ───────────────────────────────────────────────────────
// Student: submit a new application
router.post(
  "/applications",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId!;
    const {
      schoolId,
      courseIds,
      formResponses,
    } = req.body as {
      schoolId?: string;
      courseIds?: string[];
      formResponses?: { fieldId: string; value: string }[];
    };

    if (!schoolId) {
      res.status(400).json({ error: "schoolId is required" });
      return;
    }

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      res.status(400).json({ error: "courseIds must be a non-empty array" });
      return;
    }

    // 1. Create the application record
    const { data: application, error: appError } = await supabaseAdmin
      .from("student_applications")
      .insert({
        school_id: schoolId,
        applicant_id: userId,
        status: "submitted",
      })
      .select()
      .single();

    if (appError || !application) {
      res.status(400).json({ error: appError?.message ?? "Failed to create application" });
      return;
    }

    const applicationId = application.id as string;

    // 2. Insert course selections
    const courseSelections = courseIds.map((courseId) => ({
      application_id: applicationId,
      course_id: courseId,
    }));

    const { error: courseSelErr } = await supabaseAdmin
      .from("application_course_selections")
      .insert(courseSelections);

    if (courseSelErr) {
      res.status(500).json({ error: courseSelErr.message });
      return;
    }

    // 3. Insert form responses (if provided)
    if (Array.isArray(formResponses) && formResponses.length > 0) {
      const responseRows = formResponses.map((r) => ({
        application_id: applicationId,
        field_id: r.fieldId,
        value: r.value,
      }));

      const { error: responseErr } = await supabaseAdmin
        .from("application_form_responses")
        .insert(responseRows);

      if (responseErr) {
        res.status(500).json({ error: responseErr.message });
        return;
      }
    }

    // 4. Look up applicant name for notification
    const { data: applicantProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();

    const studentName = applicantProfile
      ? [applicantProfile.first_name, applicantProfile.last_name].filter(Boolean).join(" ")
      : "A student";

    // 5. Find the school admin to notify
    const { data: adminProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("school_id", schoolId)
      .eq("role", "admin")
      .limit(1)
      .single();

    // 6. Create in-app notification for school admin
    if (adminProfile?.id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: adminProfile.id,
        title: "New application received",
        body: `${studentName} has applied to your school`,
        is_read: false,
      });

      // 7. Send email notification to admin
      if (adminProfile.email) {
        const { data: school } = await supabaseAdmin
          .from("schools")
          .select("name")
          .eq("id", schoolId)
          .single();

        sendApplicationStatusUpdate({
          to: adminProfile.email,
          studentName,
          schoolName: school?.name ?? "your school",
          status: "submitted",
        }).catch((err) =>
          console.error("[applications] Failed to send admin email notification:", err)
        );
      }
    }

    res.status(201).json(formatApplication(application));
  }
);

// ─── GET /applications ────────────────────────────────────────────────────────
// Admin: all applications for their school (with course selections + form responses)
// Student: their own applications with status
router.get(
  "/applications",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId!;
    const isAdmin =
      req.userRole === "admin" || req.userRole === "super_admin";

    if (isAdmin) {
      const schoolId = req.schoolId;
      if (!schoolId) {
        res.status(400).json({ error: "Admin is not associated with a school" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("student_applications")
        .select(
          `*,
           application_course_selections ( course_id, courses ( id, title ) ),
           application_form_responses ( field_id, value, application_form_fields ( label ) )`
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data ?? []);
      return;
    }

    // Student: own applications
    const { data, error } = await supabaseAdmin
      .from("student_applications")
      .select("id, school_id, status, created_at, updated_at")
      .eq("applicant_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(
      (data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        schoolId: a.school_id,
        status: a.status,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      }))
    );
  }
);

// ─── GET /applications/:id ────────────────────────────────────────────────────
// Get a single application with course selections and form responses (with field labels)
router.get(
  "/applications/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = req.params.id;
    const userId = req.userId!;
    const isAdmin =
      req.userRole === "admin" || req.userRole === "super_admin";

    const { data, error } = await supabaseAdmin
      .from("student_applications")
      .select(
        `*,
         application_course_selections ( course_id, courses ( id, title ) ),
         application_form_responses ( field_id, value, application_form_fields ( id, label, field_type ) )`
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    // Students can only view their own applications
    if (!isAdmin && data.applicant_id !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Admins can only view applications for their own school
    if (isAdmin && req.schoolId && data.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(data);
  }
);

// ─── PATCH /applications/:id/status ──────────────────────────────────────────
// Admin: update application status with optional notes / rejectionReason
router.patch(
  "/applications/:id/status",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const isAdmin =
      req.userRole === "admin" || req.userRole === "super_admin";

    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { status, notes, rejectionReason } = req.body as {
      status?: string;
      notes?: string;
      rejectionReason?: string;
    };

    if (!status || !VALID_STATUSES.includes(status as ApplicationStatus)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      });
      return;
    }

    // Fetch the existing application to validate school ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("student_applications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    if (req.schoolId && existing.school_id !== req.schoolId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = { status };
    if (notes !== undefined) updatePayload.notes = notes;
    if (rejectionReason !== undefined)
      updatePayload.rejection_reason = rejectionReason;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("student_applications")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updated) {
      res.status(500).json({ error: updateError?.message ?? "Update failed" });
      return;
    }

    // Look up applicant details for notifications
    const { data: applicantProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("id", existing.applicant_id as string)
      .single();

    const studentName = applicantProfile
      ? [applicantProfile.first_name, applicantProfile.last_name]
          .filter(Boolean)
          .join(" ")
      : "Student";

    // Create in-app notification for applicant
    const statusLabel = status.replace(/_/g, " ");
    await supabaseAdmin.from("notifications").insert({
      user_id: existing.applicant_id,
      title: "Application status updated",
      body: `Your application status has been updated to: ${statusLabel}`,
      is_read: false,
    });

    // Send email notification to applicant
    if (applicantProfile?.email) {
      const { data: school } = await supabaseAdmin
        .from("schools")
        .select("name")
        .eq("id", existing.school_id as string)
        .single();

      sendApplicationStatusUpdate({
        to: applicantProfile.email,
        studentName,
        schoolName: school?.name ?? "your school",
        status,
        reason: rejectionReason,
      }).catch((err) =>
        console.error("[applications] Failed to send status update email:", err)
      );
    }

    // If approved: auto-enroll student in selected courses and update their profile
    if (status === "approved") {
      const { data: courseSelections } = await supabaseAdmin
        .from("application_course_selections")
        .select("course_id")
        .eq("application_id", id);

      if (courseSelections && courseSelections.length > 0) {
        for (const sel of courseSelections as Record<string, unknown>[]) {
          try {
            await enrollStudentInCourse(sel.course_id as string, existing.applicant_id as string);
          } catch (enrollError: any) {
            console.error(
              "[applications] Failed to enroll student in course:",
              enrollError.message
            );
          }
        }
      }

      // Update student profile: set role to 'student' and assign school
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          role: "student",
          school_id: existing.school_id,
        })
        .eq("id", existing.applicant_id as string);

      if (profileError) {
        console.error(
          "[applications] Failed to update student profile:",
          profileError.message
        );
      } else {
        invalidateCachedProfile(existing.applicant_id as string);
      }
    }

    res.json(formatApplication(updated));
  }
);

export default router;
