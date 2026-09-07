import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getAnthropicClient, AGENT_MODEL } from "../lib/anthropic";
import { sendBroadcastEmail } from "../lib/email";
import type Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const DEFAULT_AGENT_NAME = "Solomon";

function isStaff(role?: string): boolean {
  return role === "admin" || role === "super_admin" || role === "teacher" || role === "staff";
}

// ─── Tool definitions ──────────────────────────────────────────────────────────
// Each tool maps to a real write operation. The agent proposes a tool call;
// the frontend shows it to the user for confirmation before /agent/execute-action
// actually performs it.

const TOOLS: Anthropic.Tool[] = [
  {
    name: "create_reminder",
    description:
      "Create a scheduled reminder. Admins can remind teachers (target_role='teacher'); teachers can remind students in one of their courses (requires course_id and target_role='student').",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The reminder message text" },
        target_role: { type: "string", enum: ["teacher", "student"] },
        send_at: { type: "string", description: "ISO 8601 datetime in the future when the reminder should send" },
        course_id: { type: "string", description: "Required when target_role is 'student'" },
      },
      required: ["message", "target_role", "send_at"],
    },
  },
  {
    name: "create_announcement",
    description: "Post a school-wide or course-specific announcement.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        course_id: { type: "string", description: "Omit for a school-wide announcement" },
        is_pinned: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "send_broadcast",
    description:
      "Draft and send a one-off message to every user of a given role in the school, either by email or as an in-app chat/inbox message. Admin only. Always write the actual message text yourself based on what the user asked for — don't leave it for them to fill in.",
    input_schema: {
      type: "object",
      properties: {
        target_role: { type: "string", enum: ["student", "teacher", "staff"] },
        method: { type: "string", enum: ["email", "chat"] },
        subject: { type: "string", description: "Email subject line (used as the message title for chat too)" },
        message: { type: "string", description: "The full message body to send" },
      },
      required: ["target_role", "method", "subject", "message"],
    },
  },
];

async function buildSchoolContext(schoolId: string, agentName: string): Promise<string> {
  const [schoolRes, studentsRes, teachersRes, coursesRes, applicationsRes, announcementsRes] =
    await Promise.all([
      supabaseAdmin.from("schools").select("name, tagline").eq("id", schoolId).single(),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("role", "student"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("role", "teacher"),
      supabaseAdmin
        .from("courses")
        .select("id, name")
        .eq("school_id", schoolId)
        .limit(30),
      supabaseAdmin
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "pending"),
      supabaseAdmin
        .from("announcements")
        .select("title, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const schoolName = schoolRes.data?.name ?? "this school";
  const courseNames = (coursesRes.data ?? []).map((c: any) => c.name).join(", ") || "none yet";
  const recentAnnouncements =
    (announcementsRes.data ?? []).map((a: any) => `- ${a.title}`).join("\n") || "None recently";

  return `You are ${agentName}, the AI assistant for ${schoolName} on the SolomonQuest platform. Today's date is ${new Date().toISOString().slice(0, 10)}.

Current school snapshot (always current as of this message):
- Students: ${studentsRes.count ?? 0}
- Teachers: ${teachersRes.count ?? 0}
- Courses (${(coursesRes.data ?? []).length}): ${courseNames}
- Pending applications: ${applicationsRes.count ?? 0}
- Recent announcements:
${recentAnnouncements}

You assist school admins, teachers, and staff. Be concise and practical. You can answer questions about the school using the snapshot above, and you can propose actions (creating reminders, posting announcements, or — for admins only — broadcasting a message to every student, teacher, or staff member by email or in-app chat) using the tools available to you. When asked to send a message, write the full message text yourself in a professional tone matching what was requested; never leave placeholders for the user to fill in. Never claim to have performed an action yourself — when you call a tool, the user will be shown a confirmation prompt before anything actually happens, so phrase your responses accordingly (e.g. "I've drafted a message for you to review" rather than "I've sent the message").`;
}

// ─── GET /agent/settings ────────────────────────────────────────────────────────

router.get(
  "/agent/settings",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { schoolId, userRole } = req;
      if (!isStaff(userRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { data } = await supabaseAdmin
        .from("school_agents")
        .select("name")
        .eq("school_id", schoolId)
        .maybeSingle();

      res.json({ name: data?.name ?? DEFAULT_AGENT_NAME });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── PATCH /agent/settings — rename the agent (admin only) ─────────────────────

router.patch(
  "/agent/settings",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { schoolId, userRole, userId } = req;
      if (userRole !== "admin" && userRole !== "super_admin") {
        res.status(403).json({ error: "Forbidden: admin access required" });
        return;
      }
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { name } = req.body as { name?: string };
      const trimmed = (name ?? "").trim();
      if (!trimmed || trimmed.length > 40) {
        res.status(400).json({ error: "Name must be 1-40 characters" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("school_agents")
        .upsert(
          { school_id: schoolId, name: trimmed, updated_by: userId, updated_at: new Date().toISOString() },
          { onConflict: "school_id" }
        )
        .select("name")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ name: data.name });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── GET /agent/conversations — recent chat history for the current user ──────

router.get(
  "/agent/conversations",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { schoolId, userId, userRole } = req;
      if (!isStaff(userRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("agent_conversations")
        .select("id, role, content, created_at")
        .eq("school_id", schoolId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ messages: data ?? [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── POST /agent/chat — send a message, get a reply or a proposed action ──────

router.post(
  "/agent/chat",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { schoolId, userRole, userId } = req;
      if (!isStaff(userRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { data: schoolRow } = await supabaseAdmin
        .from("schools")
        .select("enabled_features")
        .eq("id", schoolId)
        .single();
      const enabledFeatures = (schoolRow?.enabled_features as Record<string, boolean>) ?? {};
      if (enabledFeatures.ai_agent === false) {
        res.status(403).json({ error: "The AI assistant is not enabled for your school. Contact your platform administrator." });
        return;
      }

      const { message } = req.body as { message?: string };
      if (!message || !message.trim()) {
        res.status(400).json({ error: "message is required" });
        return;
      }

      const anthropic = getAnthropicClient();
      if (!anthropic) {
        res.status(503).json({ error: "AI agent is not configured. Set ANTHROPIC_API_KEY to enable it." });
        return;
      }

      const [{ data: agentRow }, { data: history }] = await Promise.all([
        supabaseAdmin.from("school_agents").select("name").eq("school_id", schoolId).maybeSingle(),
        supabaseAdmin
          .from("agent_conversations")
          .select("role, content")
          .eq("school_id", schoolId)
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .limit(20),
      ]);

      const agentName = agentRow?.name ?? DEFAULT_AGENT_NAME;
      const systemPrompt = await buildSchoolContext(schoolId, agentName);

      await supabaseAdmin.from("agent_conversations").insert({
        school_id: schoolId,
        user_id: userId,
        role: "user",
        content: message.trim(),
      });

      const anthropicMessages: Anthropic.MessageParam[] = [
        ...(history ?? []).map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content as string,
        })),
        { role: "user", content: message.trim() },
      ];

      const isAdmin = userRole === "admin" || userRole === "super_admin";
      const availableTools = isAdmin
        ? TOOLS
        : TOOLS.filter((t) => t.name !== "send_broadcast");

      const response = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: availableTools,
        messages: anthropicMessages,
      });

      const textBlock = response.content.find((b) => b.type === "text") as
        | Anthropic.TextBlock
        | undefined;
      const toolBlock = response.content.find((b) => b.type === "tool_use") as
        | Anthropic.ToolUseBlock
        | undefined;

      if (toolBlock) {
        // Don't persist the tool proposal as a final assistant turn — it's
        // pending confirmation. If there's accompanying text, store that.
        if (textBlock?.text) {
          await supabaseAdmin.from("agent_conversations").insert({
            school_id: schoolId,
            user_id: userId,
            role: "assistant",
            content: textBlock.text,
          });
        }
        res.json({
          type: "tool_use",
          message: textBlock?.text ?? "",
          tool: { name: toolBlock.name, input: toolBlock.input },
        });
        return;
      }

      const replyText = textBlock?.text ?? "I'm not sure how to respond to that.";

      await supabaseAdmin.from("agent_conversations").insert({
        school_id: schoolId,
        user_id: userId,
        role: "assistant",
        content: replyText,
      });

      res.json({ type: "message", message: replyText });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

// ─── POST /agent/execute-action — perform a confirmed tool action ─────────────

router.post(
  "/agent/execute-action",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { schoolId, userRole, userId } = req;
      if (!isStaff(userRole)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!schoolId) {
        res.status(400).json({ error: "No school associated with this account" });
        return;
      }

      const { tool, input } = req.body as { tool?: string; input?: Record<string, unknown> };
      if (!tool || !input) {
        res.status(400).json({ error: "tool and input are required" });
        return;
      }

      let summary = "";
      let result: unknown = null;

      if (tool === "create_reminder") {
        const { message, target_role, send_at, course_id } = input as {
          message?: string;
          target_role?: string;
          send_at?: string;
          course_id?: string;
        };

        if (!message || !target_role || !send_at) {
          res.status(400).json({ error: "message, target_role, and send_at are required" });
          return;
        }

        const sendAtDate = new Date(send_at);
        if (isNaN(sendAtDate.getTime()) || sendAtDate <= new Date()) {
          res.status(400).json({ error: "send_at must be a valid future date" });
          return;
        }

        if ((userRole === "admin" || userRole === "super_admin") && target_role === "teacher") {
          const { data, error } = await supabaseAdmin
            .from("reminders")
            .insert({
              school_id: schoolId,
              created_by: userId,
              target_role: "teacher",
              message,
              send_at: sendAtDate.toISOString(),
              type: "admin_to_teacher",
            })
            .select()
            .single();
          if (error) throw error;
          result = data;
          summary = `Reminder scheduled for teachers on ${sendAtDate.toLocaleString()}.`;
        } else if (userRole === "teacher" && target_role === "student") {
          if (!course_id) {
            res.status(400).json({ error: "course_id is required for student reminders" });
            return;
          }
          const { data, error } = await supabaseAdmin
            .from("reminders")
            .insert({
              school_id: schoolId,
              created_by: userId,
              target_role: "student",
              course_id,
              message,
              send_at: sendAtDate.toISOString(),
              type: "teacher_to_student",
            })
            .select()
            .single();
          if (error) throw error;
          result = data;
          summary = `Reminder scheduled for students on ${sendAtDate.toLocaleString()}.`;
        } else {
          res.status(403).json({ error: "Not authorized to create this reminder" });
          return;
        }
      } else if (tool === "create_announcement") {
        const { title, content, course_id, is_pinned } = input as {
          title?: string;
          content?: string;
          course_id?: string;
          is_pinned?: boolean;
        };

        if (!title) {
          res.status(400).json({ error: "title is required" });
          return;
        }
        if (userRole !== "admin" && userRole !== "super_admin" && userRole !== "teacher") {
          res.status(403).json({ error: "Not authorized to post announcements" });
          return;
        }

        const { data, error } = await supabaseAdmin
          .from("announcements")
          .insert({
            school_id: schoolId,
            title,
            content: content ?? null,
            course_id: course_id ?? null,
            is_pinned: is_pinned ?? false,
            posted_by: userId,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
        summary = `Announcement "${title}" posted.`;
      } else if (tool === "send_broadcast") {
        if (userRole !== "admin" && userRole !== "super_admin") {
          res.status(403).json({ error: "Only admins can send broadcast messages" });
          return;
        }

        const { target_role, method, subject, message } = input as {
          target_role?: string;
          method?: string;
          subject?: string;
          message?: string;
        };

        if (!target_role || !method || !subject || !message) {
          res.status(400).json({ error: "target_role, method, subject, and message are required" });
          return;
        }
        if (!["student", "teacher", "staff"].includes(target_role)) {
          res.status(400).json({ error: "Invalid target_role" });
          return;
        }
        if (!["email", "chat"].includes(method)) {
          res.status(400).json({ error: "Invalid method" });
          return;
        }

        const [{ data: recipients, error: recipientsError }, { data: school }, { data: senderProfile }] =
          await Promise.all([
            supabaseAdmin
              .from("profiles")
              .select("id, first_name, last_name")
              .eq("school_id", schoolId)
              .eq("role", target_role),
            supabaseAdmin.from("schools").select("name").eq("id", schoolId).single(),
            supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", userId).single(),
          ]);

        if (recipientsError) throw recipientsError;
        if (!recipients || recipients.length === 0) {
          res.status(400).json({ error: `No users with role "${target_role}" found in this school` });
          return;
        }

        const schoolName = school?.name ?? "your school";
        const senderName = senderProfile
          ? `${senderProfile.first_name ?? ""} ${senderProfile.last_name ?? ""}`.trim() || "A school administrator"
          : "A school administrator";

        if (method === "email") {
          const results = await Promise.allSettled(
            recipients.map(async (r: any) => {
              const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(r.id);
              const email = authUser?.user?.email;
              if (!email) return;
              await sendBroadcastEmail({
                to: email,
                recipientName: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "there",
                subject,
                message,
                senderName,
                schoolName,
              });
            })
          );
          const sent = results.filter((r) => r.status === "fulfilled").length;
          result = { recipientCount: recipients.length, sent };
          summary = `Email "${subject}" sent to ${sent} of ${recipients.length} ${target_role}${recipients.length === 1 ? "" : "s"}.`;
        } else {
          const { error: insertError } = await supabaseAdmin.from("internal_messages").insert(
            recipients.map((r: any) => ({
              school_id: schoolId,
              from_user_id: userId,
              to_user_id: r.id,
              subject,
              body: message,
            }))
          );
          if (insertError) throw insertError;
          result = { recipientCount: recipients.length };
          summary = `Message "${subject}" sent to ${recipients.length} ${target_role}${recipients.length === 1 ? "" : "s"} via in-app chat.`;
        }
      } else {
        res.status(400).json({ error: `Unknown tool: ${tool}` });
        return;
      }

      await supabaseAdmin.from("agent_conversations").insert({
        school_id: schoolId,
        user_id: userId,
        role: "assistant",
        content: `✅ ${summary}`,
      });

      res.json({ success: true, summary, result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Internal server error" });
    }
  }
);

export default router;
