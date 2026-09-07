import { randomBytes, randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appUsers, passwordResetTokens } from "@workspace/db";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { hashPassword, verifyPassword, signAuthToken } from "../lib/auth-jwt";
import { sendPasswordResetEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── POST /auth/register — direct sign-up (no invitation) ────────────────────
router.post("/auth/register", async (req, res): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phone } = req.body as {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, normalizedEmail));
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(password);

    await db.insert(appUsers).values({ id, email: normalizedEmail, passwordHash });

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id,
      first_name: firstName ?? "",
      last_name: lastName ?? "",
      phone: phone ?? null,
    });

    if (profileError) {
      // Roll back the app_users row so a failed signup doesn't leave an
      // orphaned account that can never complete registration.
      await db.delete(appUsers).where(eq(appUsers.id, id));
      logger.error({ error: profileError }, "Failed to create profile during registration");
      res.status(500).json({ error: "Failed to create account" });
      return;
    }

    const accessToken = signAuthToken(id);
    res.status(201).json({
      accessToken,
      refreshToken: accessToken,
      user: { id, email: normalizedEmail },
    });
  } catch (err: any) {
    logger.error({ err }, "Unhandled error in POST /auth/register");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ─── POST /auth/login ──────────────────────────────────────────────────────
router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const [account] = await db.select().from(appUsers).where(eq(appUsers.email, normalizedEmail));

    if (!account) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!account.passwordHash) {
      // Migrated account that hasn't set a password on the new system yet.
      res.status(401).json({
        error: "Please reset your password to finish migrating your account, then log in.",
      });
      return;
    }

    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const accessToken = signAuthToken(account.id);
    res.json({
      accessToken,
      refreshToken: accessToken,
      user: { id: account.id, email: account.email },
    });
  } catch (err: any) {
    logger.error({ err }, "Unhandled error in POST /auth/login");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const [account] = await db.select().from(appUsers).where(eq(appUsers.email, normalizedEmail));

    // Always respond the same way whether or not the account exists, so
    // this endpoint can't be used to enumerate registered emails.
    if (account) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.insert(passwordResetTokens).values({ token, userId: account.id, expiresAt });

      const appUrl = process.env.APP_URL ?? "";
      const resetUrl = `${appUrl}/auth/reset-password?token=${token}`;
      try {
        await sendPasswordResetEmail({ to: account.email, resetUrl });
      } catch (emailError) {
        logger.error({ emailError }, "Failed to send password reset email");
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Unhandled error in POST /auth/forgot-password");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) {
      res.status(400).json({ error: "token and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const [resetRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));

    if (!resetRow || resetRow.usedAt || resetRow.expiresAt < new Date()) {
      res.status(400).json({ error: "This reset link is invalid or has expired" });
      return;
    }

    const passwordHash = await hashPassword(password);
    await db.update(appUsers).set({ passwordHash }).where(eq(appUsers.id, resetRow.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));

    const accessToken = signAuthToken(resetRow.userId);
    res.json({ accessToken, refreshToken: accessToken });
  } catch (err: any) {
    logger.error({ err }, "Unhandled error in POST /auth/reset-password");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// ─── GET /auth/me ──────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [account] = await db.select().from(appUsers).where(eq(appUsers.id, req.userId!));

  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", req.userId)
    .single();

  // Auto-create profile if missing (e.g. account exists but profile row
  // never got created).
  if (!profile && account) {
    const { data: newProfile } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: req.userId })
      .select()
      .single();
    profile = newProfile;
  }

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  // Auto-repair role: if user owns a school but has no role, set them as admin
  if (!profile.role && profile.school_id) {
    await supabaseAdmin.from("profiles").update({ role: "admin" }).eq("id", req.userId!);
    profile.role = "admin";
  } else if (!profile.role) {
    // Check if this user is the owner of any school
    const { data: ownedSchool } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("owner_id", req.userId)
      .maybeSingle();
    if (ownedSchool) {
      await supabaseAdmin
        .from("profiles")
        .update({ role: "admin", school_id: ownedSchool.id })
        .eq("id", req.userId!);
      profile.role = "admin";
      profile.school_id = ownedSchool.id;
    }
  }

  res.json({
    id: profile.id,
    schoolId: profile.school_id,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    email: account?.email ?? null,
    internalEmail: profile.internal_email ?? null,
    uniqueStudentId: profile.unique_student_id ?? null,
    testModeEnabled: profile.test_mode_enabled ?? false,
  });
});

export default router;
