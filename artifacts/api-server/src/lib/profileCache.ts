/**
 * requireAuth runs on nearly every authenticated API request in the app and
 * was doing a `profiles` role/school_id lookup every single time — by far
 * the highest-frequency query pattern in the codebase. A user's role and
 * school essentially never change mid-session, so a short TTL cache turns
 * most requests into a pure in-memory hit instead of a DB round-trip, while
 * still bounding staleness to a few seconds if it does change (and callers
 * that change it explicitly invalidate below, so that path is immediate).
 */
interface CachedProfile {
  role: string | null;
  schoolId: string | null;
  expiresAt: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, CachedProfile>();

export function getCachedProfile(userId: string): CachedProfile | null {
  const entry = cache.get(userId);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) cache.delete(userId);
    return null;
  }
  return entry;
}

export function setCachedProfile(userId: string, role: string | null, schoolId: string | null): void {
  cache.set(userId, { role, schoolId, expiresAt: Date.now() + TTL_MS });
}

export function invalidateCachedProfile(userId: string): void {
  cache.delete(userId);
}
