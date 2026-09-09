import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  "";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SVC_KEY ??
  "";

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  logger.warn(
    {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasAnonKey: !!supabaseAnonKey,
    },
    "Supabase environment variables not fully configured — some API routes will fail"
  );
}

function makeClient(url: string, key: string): SupabaseClient {
  if (!url || !key) {
    // Return a dummy client — requests using it will fail gracefully with 500
    // rather than crashing the server at startup.
    return createClient("https://placeholder.supabase.co", "placeholder-key", {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const supabaseAdmin = makeClient(supabaseUrl, supabaseServiceKey);
export const supabaseAnon = makeClient(supabaseUrl, supabaseAnonKey);
export { supabaseUrl };
