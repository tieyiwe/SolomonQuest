import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { verifyAuthToken } from "../lib/auth-jwt";

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
    const decoded = verifyAuthToken(token);

    if (!decoded) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    // Fetch profile to get role + school
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, school_id")
      .eq("id", decoded.sub)
      .single();

    // Set typed user object
    req.user = {
      id: decoded.sub,
      role: profile?.role ?? "",
      school_id: profile?.school_id ?? null,
    };

    // Keep legacy fields for backward compat
    req.userId = decoded.sub;
    req.userRole = profile?.role;
    req.schoolId = profile?.school_id;

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
      const decoded = verifyAuthToken(token);
      if (decoded) {
        req.userId = decoded.sub;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role, school_id")
          .eq("id", decoded.sub)
          .single();
        if (profile) {
          req.userRole = profile.role;
          req.schoolId = profile.school_id;
          req.user = {
            id: decoded.sub,
            role: profile.role ?? "",
            school_id: profile.school_id ?? null,
          };
        }
      }
    }
  } catch (_err) {
    // Ignore errors in optional auth — just proceed unauthenticated
  }
  next();
}
