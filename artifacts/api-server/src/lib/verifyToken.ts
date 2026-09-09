import { jwtVerify } from "jose";
import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";

const jwtSecretRaw = process.env.SUPABASE_JWT_SECRET ?? "";
const secretKey = jwtSecretRaw ? new TextEncoder().encode(jwtSecretRaw) : null;

if (!secretKey) {
  logger.warn(
    "SUPABASE_JWT_SECRET not set — every authenticated request will call Supabase's Auth API over the network to verify its token. Set it (Supabase dashboard: Settings > API > JWT Settings > JWT Secret) to verify locally instead, which is both faster and cuts Auth API request volume."
  );
}

export interface VerifiedUser {
  id: string;
}

/**
 * Verifies a Supabase access token and returns the user id it belongs to,
 * or null if it's invalid/expired.
 *
 * When SUPABASE_JWT_SECRET is set, verifies the JWT signature locally — no
 * network call — using the same signing key Supabase's own Auth API checks
 * against, so a locally-accepted token is exactly as trustworthy as one
 * Supabase itself would accept. Falls back to the network call whenever the
 * secret isn't configured, so auth never silently breaks if it's missing.
 *
 * Trade-off: local verification only checks the token's signature and
 * expiry, not whether the underlying session was explicitly revoked
 * server-side (e.g. an admin force-signing someone out) before the token's
 * own expiry — that only takes effect once the token naturally expires
 * (Supabase's default access token lifetime is 1 hour). The network
 * fallback path does catch that immediately.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  if (secretKey) {
    try {
      const { payload } = await jwtVerify(token, secretKey);
      const sub = payload.sub;
      return typeof sub === "string" && sub ? { id: sub } : null;
    } catch {
      return null;
    }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
