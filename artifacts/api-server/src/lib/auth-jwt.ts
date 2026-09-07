import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Replaces Supabase Auth's session tokens. Access tokens are long-lived
// (30 days) rather than the usual short-lived-token + refresh-token-rotation
// pattern — this app has no server-side refresh flow, so a single signed
// token is used as both the "access_token" and "refresh_token" the frontend
// expects (see lib/session.ts on the frontend). Revoking a specific token
// before its natural expiry isn't supported; bumping JWT_SECRET revokes all
// of them at once if that's ever needed.

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set — used to sign/verify our own auth tokens.");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const TOKEN_TTL = "30d";

export interface AppTokenPayload {
  sub: string; // app_users.id
}

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AppTokenPayload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AppTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "object" && decoded && typeof decoded.sub === "string") {
      return { sub: decoded.sub };
    }
    return null;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
