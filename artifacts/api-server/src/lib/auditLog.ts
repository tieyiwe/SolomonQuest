import { supabaseAdmin } from "./supabase";

interface LogPlatformActionParams {
  action: string;
  performedBy: string | undefined;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Server-side audit trail write. Unlike the client-driven POST
 * /activity-log (which only fires if the browser actually makes the call),
 * this runs inside the route handler itself so a sensitive action is always
 * recorded regardless of what the client does. Never throws — a logging
 * failure should never fail the action it's describing.
 */
export async function logPlatformAction(params: LogPlatformActionParams): Promise<void> {
  try {
    await supabaseAdmin.from("platform_audit_log").insert({
      action: params.action,
      performed_by: params.performedBy ?? null,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      target_name: params.targetName ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.warn("[audit-log] failed to record action:", params.action, err);
  }
}
