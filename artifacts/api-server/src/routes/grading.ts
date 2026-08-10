import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// GET /grading/submissions?course_id=X&assignment_id=Y
router.get("/submissions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { course_id, assignment_id } = req.query;

    let query = supabaseAdmin
      .from("submissions")
      .select(`
        id,
        submitted_at,
        grade,
        feedback,
        graded_at,
        graded_by,
        student_id,
        assignment_id,
        profiles:student_id (
          id,
          full_name,
          email
        ),
        assignments:assignment_id (
          id,
          title,
          course_id
        )
      `);

    if (course_id) {
      query = query.eq("assignments.course_id", course_id as string);
    }
    if (assignment_id) {
      query = query.eq("assignment_id", assignment_id as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    const submissions = (data || []).map((s: any) => ({
      id: s.id,
      submitted_at: s.submitted_at,
      grade: s.grade,
      feedback: s.feedback,
      graded_at: s.graded_at,
      graded_by: s.graded_by,
      student_id: s.student_id,
      student_name: s.profiles?.full_name ?? null,
      student_email: s.profiles?.email ?? null,
      assignment_id: s.assignment_id,
      assignment_title: s.assignments?.title ?? null,
    }));

    res.json({ submissions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /grading/submissions/:id
router.put("/submissions/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { grade, feedback } = req.body;
    const userId = req.user?.id;
    const userRole = req.userRole;

    // Fetch submission joined through assignments to courses so we can check ownership
    const { data: submission, error: fetchError } = await supabaseAdmin
      .from("submissions")
      .select(`
        id,
        student_id,
        assignment_id,
        assignments:assignment_id (
          id,
          title,
          course_id,
          school_id,
          courses:course_id (
            id,
            teacher_id
          )
        )
      `)
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const assignment = (submission as any).assignments;
    const course = assignment?.courses;

    // Security: verify teacher owns the course, or requester is admin/super_admin
    if (userRole !== "admin" && userRole !== "super_admin") {
      if (userRole !== "teacher" || course?.teacher_id !== userId) {
        return res.status(403).json({ error: "Access denied: you do not own this course" });
      }
    }

    const graded_at = new Date().toISOString();

    // Update submission
    const { data: updatedSubmission, error: updateError } = await supabaseAdmin
      .from("submissions")
      .update({
        grade,
        feedback,
        graded_by: userId,
        graded_at,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Upsert into transcripts
    const { error: transcriptError } = await supabaseAdmin
      .from("transcripts")
      .upsert({
        student_id: submission.student_id,
        school_id: assignment?.school_id ?? null,
        course_id: assignment?.course_id ?? null,
        assignment_id: submission.assignment_id,
        submission_id: submission.id,
        grade,
        feedback,
        graded_at,
      }, {
        onConflict: "submission_id",
      });

    if (transcriptError) throw transcriptError;

    // Send notification to student
    const assignmentTitle = assignment?.title ?? "assignment";
    const { error: notifError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: submission.student_id,
        type: "grade",
        title: "Assignment Graded",
        message: `Your ${assignmentTitle} has been graded. Grade: ${grade}`,
        data: {
          submission_id: id,
          assignment_id: submission.assignment_id,
          grade,
        },
        read: false,
        created_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error("Failed to send notification:", notifError.message);
    }

    res.json({ submission: updatedSubmission });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /grading/transcript/:student_id
router.get("/transcript/:student_id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { student_id } = req.params;
    const userId = req.user?.id;
    const userRole = req.userRole;

    if (userId !== student_id) {
      // Must be admin/super_admin of the same school, OR a teacher of a course the student is enrolled in
      if (userRole === "admin" || userRole === "super_admin") {
        // Verify same school as student
        const { data: studentProfile, error: studentProfileError } = await supabaseAdmin
          .from("profiles")
          .select("school_id")
          .eq("id", student_id)
          .single();

        if (studentProfileError || !studentProfile) {
          return res.status(404).json({ error: "Student not found" });
        }

        const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
          .from("profiles")
          .select("school_id")
          .eq("id", userId)
          .single();

        if (callerProfileError || !callerProfile) {
          return res.status(403).json({ error: "Access denied" });
        }

        if (studentProfile.school_id !== callerProfile.school_id) {
          return res.status(403).json({ error: "Access denied: different school" });
        }
      } else if (userRole === "teacher") {
        // Teacher must be the teacher of at least one course the student is enrolled in
        const { data: sharedCourses, error: sharedCoursesError } = await supabaseAdmin
          .from("course_enrollments")
          .select(`
            course_id,
            courses:course_id (
              teacher_id
            )
          `)
          .eq("student_id", student_id);

        if (sharedCoursesError) throw sharedCoursesError;

        const teachesStudent = (sharedCourses ?? []).some(
          (e: any) => e.courses?.teacher_id === userId
        );

        if (!teachesStudent) {
          return res.status(403).json({ error: "Access denied: you do not teach this student" });
        }
      } else {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const { data: studentProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", student_id)
      .single();

    const studentName =
      [studentProfile?.first_name, studentProfile?.last_name].filter(Boolean).join(" ") ||
      "Student";

    const { data: transcripts, error } = await supabaseAdmin
      .from("transcripts")
      .select(`
        id,
        grade,
        feedback,
        graded_at,
        course_id,
        assignment_id,
        submission_id,
        school_id,
        assignments:assignment_id (
          id,
          title,
          points_possible,
          due_date
        ),
        courses:course_id (
          id,
          title,
          code,
          term,
          teacher_id
        ),
        submissions:submission_id (
          id,
          submitted_at,
          status
        )
      `)
      .eq("student_id", student_id)
      .order("graded_at", { ascending: false });

    if (error) throw error;

    // Look up teacher names for any courses involved
    const teacherIds = Array.from(
      new Set(
        (transcripts || [])
          .map((t: any) => t.courses?.teacher_id)
          .filter((id: unknown): id is string => !!id)
      )
    );
    const teacherMap = new Map<string, string>();
    if (teacherIds.length > 0) {
      const { data: teacherProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds);
      for (const p of teacherProfiles ?? []) {
        teacherMap.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Teacher");
      }
    }

    // Organize by course
    const courseMap: Record<string, any> = {};

    for (const t of transcripts || []) {
      const course: any = (t as any).courses;
      const assignment: any = (t as any).assignments;
      const submission: any = (t as any).submissions;
      const courseId = t.course_id ?? "unknown";

      if (!courseMap[courseId]) {
        courseMap[courseId] = {
          id: courseId,
          title: course?.title ?? "Unknown Course",
          code: course?.code ?? null,
          term: course?.term ?? null,
          teacherName: course?.teacher_id ? teacherMap.get(course.teacher_id) ?? null : null,
          assignments: [],
          courseAverage: null,
        };
      }

      courseMap[courseId].assignments.push({
        id: t.assignment_id ?? t.id,
        title: assignment?.title ?? "Assignment",
        grade: t.grade != null ? parseFloat(t.grade) : null,
        pointsPossible: assignment?.points_possible ?? null,
        submittedAt: submission?.submitted_at ?? null,
        status: submission?.status ?? (t.grade != null ? "graded" : "pending"),
      });
    }

    // Calculate per-course averages
    const courses = Object.values(courseMap).map((c: any) => {
      const graded = c.assignments.filter(
        (a: any) => a.grade != null && a.pointsPossible
      );
      c.courseAverage =
        graded.length > 0
          ? Math.round(
              (graded.reduce((sum: number, a: any) => sum + a.grade / a.pointsPossible, 0) /
                graded.length) *
                100
            )
          : null;
      return c;
    });

    res.json({
      studentName,
      studentId: student_id,
      courses,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /grading/gradebook?course_id=X
router.get("/gradebook", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { course_id } = req.query;

    if (!course_id) {
      return res.status(400).json({ error: "course_id is required" });
    }

    // Get all assignments for the course
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from("assignments")
      .select("id, title, max_grade, due_date")
      .eq("course_id", course_id as string)
      .order("due_date", { ascending: true });

    if (assignmentsError) throw assignmentsError;

    // Get all enrollments for the course with student profiles
    const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
      .from("course_enrollments")
      .select(`
        student_id,
        profiles:student_id (
          id,
          full_name,
          email
        )
      `)
      .eq("course_id", course_id as string);

    if (enrollmentsError) throw enrollmentsError;

    const studentIds = (enrollments || []).map((e: any) => e.student_id);

    if (studentIds.length === 0) {
      return res.json({ course_id, assignments, students: [] });
    }

    // Get all submissions for these students and assignments in the course
    const assignmentIds = (assignments || []).map((a: any) => a.id);

    const { data: submissions, error: submissionsError } = await supabaseAdmin
      .from("submissions")
      .select("id, student_id, assignment_id, grade, feedback, submitted_at, graded_at")
      .in("student_id", studentIds)
      .in("assignment_id", assignmentIds);

    if (submissionsError) throw submissionsError;

    // Index submissions by student_id + assignment_id
    const submissionMap: Record<string, any> = {};
    for (const s of submissions || []) {
      submissionMap[`${s.student_id}:${s.assignment_id}`] = s;
    }

    // Build gradebook rows
    const students = (enrollments || []).map((enrollment: any) => {
      const profile = enrollment.profiles;
      const studentId = enrollment.student_id;

      const grades: any[] = (assignments || []).map((assignment: any) => {
        const sub = submissionMap[`${studentId}:${assignment.id}`] ?? null;
        return {
          assignment_id: assignment.id,
          assignment_title: assignment.title,
          max_grade: assignment.max_grade,
          submission_id: sub?.id ?? null,
          submitted_at: sub?.submitted_at ?? null,
          grade: sub?.grade ?? null,
          feedback: sub?.feedback ?? null,
          graded_at: sub?.graded_at ?? null,
        };
      });

      // Calculate course average for this student
      const gradedItems = grades.filter((g) => g.grade !== null && !isNaN(parseFloat(g.grade)));
      const courseAverage =
        gradedItems.length > 0
          ? parseFloat(
              (
                gradedItems.reduce((sum, g) => sum + parseFloat(g.grade), 0) / gradedItems.length
              ).toFixed(2)
            )
          : null;

      return {
        student_id: studentId,
        student_name: profile?.full_name ?? null,
        student_email: profile?.email ?? null,
        course_average: courseAverage,
        grades,
      };
    });

    res.json({
      course_id,
      assignments,
      students,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /transcripts/release — admin sends transcript-available notifications to all students
router.post("/transcripts/release", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!req.schoolId) { res.status(403).json({ error: "No school" }); return; }

  const { semester, message } = req.body;

  // Get all students in school
  const { data: students } = await supabaseAdmin
    .from("profiles").select("id").eq("school_id", req.schoolId).eq("role", "student");

  if (students && students.length > 0) {
    const notifications = students.map((s: { id: string }) => ({
      user_id: s.id,
      type: "transcript_available",
      title: `Transcript Available${semester ? ` - ${semester}` : ""}`,
      message: message || "Your transcript for the semester is now available. Use your platform email and unique ID to access it.",
      is_read: false,
    }));
    await supabaseAdmin.from("notifications").insert(notifications);
  }

  res.json({ success: true, notified: students?.length ?? 0 });
});

// POST /transcripts/verify — public endpoint; verifies internal_email + unique_student_id and returns transcript
router.post("/transcripts/verify", async (req, res): Promise<void> => {
  const { internal_email, unique_student_id } = req.body;
  if (!internal_email || !unique_student_id) {
    res.status(400).json({ error: "internal_email and unique_student_id are required" }); return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, unique_student_id, internal_email, school_id, role")
    .eq("internal_email", (internal_email as string).toLowerCase())
    .eq("unique_student_id", unique_student_id)
    .single();

  if (!profile) {
    res.status(404).json({ error: "No student found with those credentials" }); return;
  }

  // Get transcript data
  const { data: transcript } = await supabaseAdmin
    .from("transcripts")
    .select("*, courses(title)")
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });

  res.json({
    student: {
      name: `${profile.first_name} ${profile.last_name}`,
      uniqueId: profile.unique_student_id,
      internalEmail: profile.internal_email,
    },
    transcript: transcript ?? [],
  });
});

export default router;
