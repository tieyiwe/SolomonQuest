import { createRemoteJWKSet, jwtVerify } from "jose";
import { supabaseAdmin, supabaseUrl } from "./supabase";
import { logger } from "./logger";

// Supabase's asymmetric (ES256) JWT signing keys are published here. `jose`
// fetches and caches them, and transparently handles key rotation (a token
// signed with a newly-rotated key just resolves against a re-fetched set).
const jwks = supabaseUrl
  ? createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))
  : null;

if (!jwks) {
  logger.warn(
    "SUPABASE_URL not set — cannot verify tokens locally against Supabase's JWKS endpoint. Every authenticated request will fall back to a network call to Supabase's Auth API."
  );
}

export interface VerifiedUser {
  id: string;
}

/**
 * Verifies a Supabase access token and returns the user id it belongs to,
 * or null if it's invalid/expired.
 *
 * Verifies the JWT signature locally against Supabase's public JWKS — no
 * network call to the Auth API, no shared secret to manage — whenever that
 * succeeds. Falls back to the network call (supabaseAdmin.auth.getUser) on
 * any local-verification failure, which also covers a project still using
 * the older HS256 shared-secret signing mode (no matching JWKS key for
 * those tokens) so auth never breaks regardless of which signing mode is
 * active.
 *
 * Trade-off worth knowing: local verification only checks the token's
 * signature and expiry, not whether the underlying session was explicitly
 * revoked server-side (e.g. an admin force-signing someone out) before the
 * token's own expiry — that takes effect once the token naturally expires
 * (Supabase's default access token lifetime is 1 hour), not instantly.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks);
      const sub = payload.sub;
      if (typeof sub === "string" && sub) return { id: sub };
    } catch {
      // Falls through to the network path below — covers HS256-signed
      // tokens (no JWKS entry to match) and any transient JWKS fetch error.
    }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}
