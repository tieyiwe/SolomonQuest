import { type Request, type Response, type NextFunction } from "express";
import { verifyClerkSessionToken } from "../lib/clerk";
import { resolveProfileForClerkUser } from "../lib/profile-resolution";

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
    const clerkUserId = await verifyClerkSessionToken(token);

    if (!clerkUserId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const profile = await resolveProfileForClerkUser(clerkUserId);
    if (!profile) {
      res.status(500).json({ error: "Failed to resolve account" });
      return;
    }

    req.user = {
      id: profile.id,
      role: profile.role ?? "",
      school_id: profile.school_id ?? null,
    };

    // Keep legacy fields for backward compat
    req.userId = profile.id;
    req.userRole = profile.role ?? undefined;
    req.schoolId = profile.school_id ?? undefined;

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
      const clerkUserId = await verifyClerkSessionToken(token);
      if (clerkUserId) {
        const profile = await resolveProfileForClerkUser(clerkUserId);
        if (profile) {
          req.userId = profile.id;
          req.userRole = profile.role ?? undefined;
          req.schoolId = profile.school_id ?? undefined;
          req.user = {
            id: profile.id,
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
