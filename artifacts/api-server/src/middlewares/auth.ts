import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { getCachedProfile, setCachedProfile } from "../lib/profileCache";
import { verifyAccessToken } from "../lib/verifyToken";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  schoolId?: string;
  user?: { id: string; role: string; school_id: string | null; email?: string };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = authHeader.substring(7);
    const verified = await verifyAccessToken(token);

    if (!verified) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    let cached = getCachedProfile(verified.id);
    if (!cached) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, school_id")
        .eq("id", verified.id)
        .single();
      setCachedProfile(verified.id, profile?.role ?? null, profile?.school_id ?? null);
      cached = getCachedProfile(verified.id);
    }

    // Set typed user object
    req.user = {
      id: verified.id,
      role: cached?.role ?? "",
      school_id: cached?.schoolId ?? null,
    };

    // Keep legacy fields for backward compat
    req.userId = verified.id;
    req.userRole = cached?.role ?? undefined;
    req.schoolId = cached?.schoolId ?? undefined;

    next();
  } catch (_err) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const verified = await verifyAccessToken(token);
      if (verified) {
        req.userId = verified.id;
        let cached = getCachedProfile(verified.id);
        if (!cached) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("role, school_id")
            .eq("id", verified.id)
            .single();
          if (profile) {
            setCachedProfile(verified.id, profile.role ?? null, profile.school_id ?? null);
            cached = getCachedProfile(verified.id);
          }
        }
        if (cached) {
          req.userRole = cached.role ?? undefined;
          req.schoolId = cached.schoolId ?? undefined;
          req.user = {
            id: verified.id,
            role: cached.role ?? "",
            school_id: cached.schoolId ?? null,
          };
        }
      }
    }
  } catch (_err) {
    // Ignore errors in optional auth — just proceed unauthenticated
  }
  next();
}
