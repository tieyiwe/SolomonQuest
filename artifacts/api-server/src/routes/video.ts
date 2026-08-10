import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// POST /video/sessions - start a session (teacher only)
router.post("/video/sessions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { course_id } = req.body;
    const userId = req.user!.id;

    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id, name, teacher_id")
      .eq("id", course_id)
      .single();

    if (courseError || !course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.teacher_id !== userId) {
      return res.status(403).json({ error: "Only the teacher can start a video session" });
    }

    const jitsi_room = "solomonquest-" + course_id.slice(0, 8) + "-" + Date.now();

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("video_sessions")
      .insert({
        course_id,
        jitsi_room,
        status: "active",
        started_at: new Date().toISOString(),
      })
      .select("id, jitsi_room, course_id, status, started_at")
      .single();

    if (sessionError) {
      return res.status(500).json({ error: sessionError.message });
    }

    const { data: enrollments, error: enrollError } = await supabaseAdmin
      .from("course_enrollments")
      .select("user_id")
      .eq("course_id", course_id);

    if (enrollError) {
      return res.status(500).json({ error: enrollError.message });
    }

    if (enrollments && enrollments.length > 0) {
      const notifications = enrollments.map((enrollment) => ({
        user_id: enrollment.user_id,
        type: "video_session",
        message: `Live class started for ${course.name}. Click to join.`,
        metadata: {
          jitsi_room: session.jitsi_room,
          session_id: session.id,
        },
      }));

      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        return res.status(500).json({ error: notifError.message });
      }
    }

    return res.status(201).json(session);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /video/sessions?course_id=X - get active session for a course (any enrolled user)
router.get("/video/sessions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { course_id } = req.query;
    const userId = req.user!.id;

    if (!course_id) {
      return res.status(400).json({ error: "course_id query parameter is required" });
    }

    const { data: course, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id, teacher_id")
      .eq("id", course_id)
      .single();

    if (courseError || !course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const isTeacher = course.teacher_id === userId;

    if (!isTeacher) {
      const { data: enrollment, error: enrollError } = await supabaseAdmin
        .from("course_enrollments")
        .select("id")
        .eq("course_id", course_id as string)
        .eq("user_id", userId)
        .single();

      if (enrollError || !enrollment) {
        return res.status(403).json({ error: "Access denied: not enrolled in this course" });
      }
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("video_sessions")
      .select("id, jitsi_room, course_id, status, started_at")
      .eq("course_id", course_id as string)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (sessionError && sessionError.code !== "PGRST116") {
      return res.status(500).json({ error: sessionError.message });
    }

    return res.status(200).json(session || null);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /video/sessions/:id/end - end session (teacher only)
router.put("/video/sessions/:id/end", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("video_sessions")
      .select("id, course_id, courses(teacher_id)")
      .eq("id", id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const courseData = session.courses as any;
    if (!courseData || courseData.teacher_id !== userId) {
      return res.status(403).json({ error: "Only the teacher can end a video session" });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("video_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, jitsi_room, course_id, status, started_at, ended_at")
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /video/chat-calls - start (or join) the group call for a chat channel
router.post("/video/chat-calls", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { channel_id } = req.body;

    if (!channel_id) {
      return res.status(400).json({ error: "channel_id is required" });
    }

    // If someone already started a call in this channel, reuse the same
    // Jitsi room instead of minting a new one — otherwise each participant
    // who clicks "Start Video Call" lands in their own separate room and
    // never actually meets the other person.
    const { data: existingCall } = await supabaseAdmin
      .from("chat_calls")
      .select("id, jitsi_room, channel_id, status, started_at, started_by")
      .eq("channel_id", channel_id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCall) {
      return res.status(200).json(existingCall);
    }

    // Stable, deterministic room name per channel (no timestamp) so it's
    // reconstructible even if the chat_calls row is missing for any reason.
    const jitsi_room = "solomonquest-chat-" + String(channel_id).slice(0, 8);

    const { data: call, error: callError } = await supabaseAdmin
      .from("chat_calls")
      .insert({
        channel_id,
        jitsi_room,
        status: "active",
        started_at: new Date().toISOString(),
        started_by: req.userId,
      })
      .select("id, jitsi_room, channel_id, status, started_at, started_by")
      .single();

    if (callError) {
      return res.status(500).json({ error: callError.message });
    }

    return res.status(201).json(call);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /video/chat-calls/:id/end - end chat call
router.put("/video/chat-calls/:id/end", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("chat_calls")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, jitsi_room, channel_id, status, started_at, ended_at")
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    if (!updated) {
      return res.status(404).json({ error: "Chat call not found" });
    }

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
