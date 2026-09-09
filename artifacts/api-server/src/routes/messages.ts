import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ─── GET /messages/unread-count ───────────────────────────────────────────────
// Must be defined before /messages/:id to avoid "unread-count" being caught as an id

router.get(
  "/messages/unread-count",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const { count, error } = await supabaseAdmin
      .from("internal_messages")
      .select("id", { count: "exact", head: true })
      .eq("to_user_id", req.userId ?? "")
      .eq("is_read", false)
      .not("deleted_by", "cs", `["${req.userId}"]`);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ count: count ?? 0 });
  }
);

// ─── GET /messages/sent ───────────────────────────────────────────────────────

router.get(
  "/messages/sent",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId ?? "";

    const { data, error } = await supabaseAdmin
      .from("internal_messages")
      .select(
        `
        id,
        subject,
        body,
        is_read,
        created_at,
        thread_id,
        parent_id,
        to_user_id,
        profiles!internal_messages_to_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          internal_email
        )
      `
      )
      .eq("from_user_id", userId)
      .is("parent_id", null)
      .not("deleted_by", "cs", `["${userId}"]`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const messageIds = (data ?? []).map((m: Record<string, unknown>) => m.id as string);
    const threadCounts = await fetchThreadCounts(messageIds);

    const result = (data ?? []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null;
      return {
        id: m.id,
        subject: m.subject,
        body_preview: typeof m.body === "string" ? m.body.slice(0, 120) : "",
        to_user: profile
          ? {
              id: profile.id,
              name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
              avatar_url: profile.avatar_url ?? null,
              internal_email: profile.internal_email ?? null,
            }
          : null,
        is_read: m.is_read,
        created_at: m.created_at,
        thread_count: threadCounts[m.id as string] ?? 0,
      };
    });

    res.json(result);
  }
);

// ─── GET /messages/inbox ──────────────────────────────────────────────────────

router.get(
  "/messages/inbox",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId ?? "";
    const folder = (req.query.folder as string) ?? "inbox";

    let query = supabaseAdmin
      .from("internal_messages")
      .select(
        `
        id,
        subject,
        body,
        is_read,
        created_at,
        thread_id,
        parent_id,
        from_user_id,
        profiles!internal_messages_from_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          internal_email
        )
      `
      )
      .is("parent_id", null)
      .not("deleted_by", "cs", `["${userId}"]`)
      .order("created_at", { ascending: false });

    if (folder === "sent") {
      query = query.eq("from_user_id", userId);
    } else if (folder === "unread") {
      query = query.eq("to_user_id", userId).eq("is_read", false);
    } else {
      // inbox (default)
      query = query.eq("to_user_id", userId);
    }

    const { data, error } = await query.limit(200);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const messageIds = (data ?? []).map((m: Record<string, unknown>) => m.id as string);
    const threadCounts = await fetchThreadCounts(messageIds);

    const result = (data ?? []).map((m: Record<string, unknown>) => {
      const profile = m.profiles as Record<string, unknown> | null;
      return {
        id: m.id,
        subject: m.subject,
        body_preview: typeof m.body === "string" ? m.body.slice(0, 120) : "",
        from_user: profile
          ? {
              id: profile.id,
              name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
              avatar_url: profile.avatar_url ?? null,
              internal_email: profile.internal_email ?? null,
            }
          : null,
        is_read: m.is_read,
        created_at: m.created_at,
        thread_count: threadCounts[m.id as string] ?? 0,
      };
    });

    res.json(result);
  }
);

// ─── GET /messages/:id ────────────────────────────────────────────────────────

router.get(
  "/messages/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId ?? "";
    const messageId = req.params.id;

    const { data: message, error } = await supabaseAdmin
      .from("internal_messages")
      .select(
        `
        id,
        subject,
        body,
        is_read,
        read_at,
        created_at,
        thread_id,
        parent_id,
        from_user_id,
        to_user_id,
        deleted_by,
        from_profile:profiles!internal_messages_from_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          internal_email
        ),
        to_profile:profiles!internal_messages_to_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          internal_email
        )
      `
      )
      .eq("id", messageId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const msg = message as Record<string, unknown>;

    // Verify caller is sender or recipient
    if (msg.from_user_id !== userId && msg.to_user_id !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Check if deleted for this user
    const deletedBy = (msg.deleted_by as string[]) ?? [];
    if (deletedBy.includes(userId)) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    // Mark as read if recipient
    if (msg.to_user_id === userId && !msg.is_read) {
      await supabaseAdmin
        .from("internal_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", messageId);
    }

    // Fetch thread replies (direct children of this message)
    const { data: replies } = await supabaseAdmin
      .from("internal_messages")
      .select(
        `
        id,
        subject,
        body,
        is_read,
        created_at,
        from_user_id,
        profiles!internal_messages_from_user_id_fkey (
          id,
          first_name,
          last_name,
          avatar_url,
          internal_email
        )
      `
      )
      .eq("parent_id", messageId)
      .not("deleted_by", "cs", `["${userId}"]`)
      .order("created_at", { ascending: true });

    const fromProfile = msg.from_profile as Record<string, unknown> | null;
    const toProfile = msg.to_profile as Record<string, unknown> | null;

    const thread = (replies ?? []).map((r: Record<string, unknown>) => {
      const rProfile = r.profiles as Record<string, unknown> | null;
      return {
        id: r.id,
        subject: r.subject,
        body: r.body,
        is_read: r.is_read,
        created_at: r.created_at,
        from_user: rProfile
          ? {
              id: rProfile.id,
              name: `${rProfile.first_name ?? ""} ${rProfile.last_name ?? ""}`.trim(),
              avatar_url: rProfile.avatar_url ?? null,
              internal_email: rProfile.internal_email ?? null,
            }
          : null,
      };
    });

    res.json({
      id: msg.id,
      subject: msg.subject,
      body: msg.body,
      is_read: msg.is_read,
      read_at: msg.read_at,
      created_at: msg.created_at,
      thread_id: msg.thread_id,
      parent_id: msg.parent_id,
      from_user: fromProfile
        ? {
            id: fromProfile.id,
            name: `${fromProfile.first_name ?? ""} ${fromProfile.last_name ?? ""}`.trim(),
            avatar_url: fromProfile.avatar_url ?? null,
            internal_email: fromProfile.internal_email ?? null,
          }
        : null,
      to_user: toProfile
        ? {
            id: toProfile.id,
            name: `${toProfile.first_name ?? ""} ${toProfile.last_name ?? ""}`.trim(),
            avatar_url: toProfile.avatar_url ?? null,
            internal_email: toProfile.internal_email ?? null,
          }
        : null,
      thread,
    });
  }
);

// ─── POST /messages ───────────────────────────────────────────────────────────

router.post(
  "/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId ?? "";
    const { to_user_id, subject, body, parent_id } = req.body as {
      to_user_id?: string;
      subject?: string;
      body?: string;
      parent_id?: string;
    };

    if (!to_user_id || !subject || !body) {
      res.status(400).json({ error: "to_user_id, subject, and body are required" });
      return;
    }

    // Validate recipient exists and is in same school
    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from("profiles")
      .select("id, school_id, first_name, last_name")
      .eq("id", to_user_id)
      .maybeSingle();

    if (recipientError || !recipient) {
      res.status(400).json({ error: "Recipient not found" });
      return;
    }

    const senderSchoolId = req.schoolId ?? null;
    if (senderSchoolId && recipient.school_id !== senderSchoolId) {
      res.status(400).json({ error: "Recipient is not in the same school" });
      return;
    }

    // Resolve thread_id from parent if provided
    let threadId: string | null = null;
    if (parent_id) {
      const { data: parentMsg } = await supabaseAdmin
        .from("internal_messages")
        .select("id, thread_id")
        .eq("id", parent_id)
        .maybeSingle();

      if (!parentMsg) {
        res.status(400).json({ error: "Parent message not found" });
        return;
      }

      threadId = (parentMsg as Record<string, unknown>).thread_id as string | null ?? parent_id;
    }

    // Get sender name for notification
    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    const senderName = senderProfile
      ? `${(senderProfile as Record<string, unknown>).first_name ?? ""} ${(senderProfile as Record<string, unknown>).last_name ?? ""}`.trim()
      : "Someone";

    // Insert message
    const { data: newMessage, error: insertError } = await supabaseAdmin
      .from("internal_messages")
      .insert({
        from_user_id: userId,
        to_user_id,
        subject: subject.trim(),
        body: body.trim(),
        parent_id: parent_id ?? null,
        thread_id: threadId,
        school_id: senderSchoolId ?? null,
      })
      .select()
      .single();

    if (insertError) {
      res.status(400).json({ error: insertError.message });
      return;
    }

    // Create notification for recipient
    await supabaseAdmin.from("notifications").insert({
      user_id: to_user_id,
      type: "new_message",
      message: `New message from ${senderName}: ${subject.trim()}`,
      metadata: { message_id: (newMessage as Record<string, unknown>).id },
    });

    res.status(201).json(newMessage);
  }
);

// ─── DELETE /messages/:id ─────────────────────────────────────────────────────

router.delete(
  "/messages/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const userId = req.userId ?? "";
    const messageId = req.params.id;

    // Fetch message to verify access and get current deleted_by
    const { data: message, error: fetchError } = await supabaseAdmin
      .from("internal_messages")
      .select("id, from_user_id, to_user_id, deleted_by")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchError || !message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const msg = message as Record<string, unknown>;

    if (msg.from_user_id !== userId && msg.to_user_id !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const deletedBy = (msg.deleted_by as string[]) ?? [];
    if (!deletedBy.includes(userId)) {
      deletedBy.push(userId);
    }

    const { error: updateError } = await supabaseAdmin
      .from("internal_messages")
      .update({ deleted_by: deletedBy })
      .eq("id", messageId);

    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    res.json({ success: true });
  }
);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchThreadCounts(messageIds: string[]): Promise<Record<string, number>> {
  if (messageIds.length === 0) return {};

  const { data } = await supabaseAdmin
    .from("internal_messages")
    .select("parent_id")
    .in("parent_id", messageIds);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ parent_id: string }>) {
    counts[row.parent_id] = (counts[row.parent_id] ?? 0) + 1;
  }
  return counts;
}

export default router;
