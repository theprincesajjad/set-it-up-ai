import { writeAudit } from "../services/admin-audit.js";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { merchantStaff, merchants, sessions, users } from "@ll/db";
import type { AppContext } from "../context.js";
import { forbidden, notFound, supportSessionRequired, unauthorized } from "./errors.js";
import { hasActiveSupportSession } from "./support-session.js";

export type PlatformRole = "none" | "rep" | "admin";
export type StaffRole = "owner" | "manager" | "staff" | "instructor";

export interface AuthUser {
  id: string;
  platformRole: PlatformRole;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the auth hook when a valid bearer token is present. */
    authUser: AuthUser | null;
  }
}

const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour

const key = (secret: string) => new TextEncoder().encode(secret);

/** `sessionId` ties the token to the sign-in it came from, so signing out or resetting the password ends it (see `liveAuthUser`). */
export async function signAccessToken(ctx: AppContext, user: AuthUser, sessionId?: string): Promise<string> {
  return new SignJWT({ role: user.platformRole, ...(sessionId ? { sid: sessionId } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(ctx.now().getTime() / 1000) + ACCESS_TTL_SECONDS)
    .sign(key(ctx.config.jwtSecret));
}

/**
 * A rotated session keeps its previous access token alive for this long, so requests already in flight when the app refreshes do not
 * fail. Rotation stamps `sessions.revokedAt` this far in the future; sign-out and "end every session" stamp it with now.
 */
export const ROTATION_GRACE_MS = 30_000;

interface Live {
  platformRole: PlatformRole;
}
const liveCache = new WeakMap<AppContext, Map<string, { at: number; live: Live | null }>>();
const LIVE_CACHE_MS = 5_000;

/** Call after anything that ends sessions, deletes an account or changes a role, so this process stops trusting its cached answer at once. */
export function forgetAuthCache(ctx: AppContext, userId?: string): void {
  const m = liveCache.get(ctx);
  if (!m) return;
  if (!userId) return m.clear();
  for (const k of m.keys()) if (k.startsWith(`${userId}:`)) m.delete(k);
}

/**
 * The database's current view of a signed token: the account still exists, the role is the one it has now (a demoted admin or rep is
 * not one any more), and the session the token came from has not been ended. Tokens are otherwise stateless for an hour.
 * Cached for a few seconds per process outside tests (other processes catch up within that time).
 */
async function liveAuthUser(ctx: AppContext, userId: string, sid: string | undefined): Promise<Live | null> {
  const cacheKey = `${userId}:${sid ?? ""}`;
  const useCache = ctx.config.env !== "test";
  let m = liveCache.get(ctx);
  if (useCache) {
    if (!m) liveCache.set(ctx, (m = new Map()));
    const hit = m.get(cacheKey);
    if (hit && Date.now() - hit.at < LIVE_CACHE_MS) return hit.live;
  }
  const [u] = await ctx.db.select({ platformRole: users.platformRole, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  let live: Live | null = u && !u.deletedAt ? { platformRole: u.platformRole } : null;
  if (live && sid) {
    const [sess] = await ctx.db.select({ revokedAt: sessions.revokedAt, userId: sessions.userId }).from(sessions).where(eq(sessions.id, sid)).limit(1);
    if (!sess || sess.userId !== userId || (sess.revokedAt && sess.revokedAt <= ctx.now())) live = null;
  }
  if (useCache && m) {
    if (m.size > 5000) m.clear();
    m.set(cacheKey, { at: Date.now(), live });
  }
  return live;
}

export async function verifyAccessToken(ctx: AppContext, token: string): Promise<AuthUser | null> {
  let sub: string | undefined;
  let sid: string | undefined;
  try {
    const { payload } = await jwtVerify(token, key(ctx.config.jwtSecret), { currentDate: ctx.now() });
    sub = payload.sub;
    sid = typeof payload.sid === "string" ? payload.sid : undefined;
  } catch {
    return null;
  }
  if (!sub) return null;
  // A database failure here is a server error (the request fails), never a signed-out answer.
  const live = await liveAuthUser(ctx, sub, sid);
  return live ? { id: sub, platformRole: live.platformRole } : null;
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.authUser) throw unauthorized();
  return req.authUser;
}

/** Admins pass every platform-role check; reps pass "rep". */
export function requirePlatformRole(req: FastifyRequest, role: "rep" | "admin"): AuthUser {
  const u = requireUser(req);
  if (u.platformRole === "admin") return u;
  if (role === "rep" && u.platformRole === "rep") return u;
  throw forbidden();
}

// An instructor ranks below staff: every counter, order and customer endpoint (minRole "staff") refuses them; only the class endpoints that ask for "instructor" let them in.
const RANK: Record<StaffRole, number> = { instructor: -1, staff: 0, manager: 1, owner: 2 };

export interface StaffContext {
  user: AuthUser;
  merchant: typeof merchants.$inferSelect;
  /** "owner" for platform admins and the merchant's own rep acting on their behalf. */
  role: StaffRole;
  impersonated: boolean;
}

/**
 * Authorize the caller against a merchant. Staff must belong to the merchant
 * with at least `minRole`. Admins always pass; reps pass for merchants they
 * signed (done-for-you setup).
 */
export async function requireStaff(
  ctx: AppContext,
  req: FastifyRequest,
  merchantId: string,
  minRole: StaffRole = "staff",
): Promise<StaffContext> {
  const user = requireUser(req);
  // The shop and the caller's membership in one read (the counter pays for every round trip).
  const [found] = await ctx.db
    .select({ merchant: merchants, role: merchantStaff.role })
    .from(merchants)
    .leftJoin(merchantStaff, and(eq(merchantStaff.merchantId, merchants.id), eq(merchantStaff.userId, user.id)))
    .where(eq(merchants.id, merchantId))
    .limit(1);
  if (!found) throw notFound("Merchant");
  const { merchant } = found;
  if (user.platformRole === "admin" || (user.platformRole === "rep" && merchant.repUserId === user.id)) {
    // Acting inside a shop as platform staff: every change is written to the audit log (reads are not).
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      // Reads are open to support; a write needs an active support session with a reason on file.
      if (!(await hasActiveSupportSession(ctx, user.id, merchantId))) throw supportSessionRequired(merchantId);
      await writeAudit(ctx.db, {
        actorUserId: user.id,
        merchantId,
        action: user.platformRole === "admin" ? "support.write" : "rep.write",
        entity: "merchant",
        entityId: merchantId,
        data: { method: req.method, path: req.url.split("?")[0] },
        ip: req.ip,
      });
    }
    return { user, merchant, role: "owner", impersonated: true };
  }
  const membership = found.role ? { role: found.role } : null;
  if (!membership) throw forbidden();
  if (RANK[membership.role] < RANK[minRole]) throw forbidden(minRole === "owner" ? "Only the shop owner can do this." : `Only ${minRole}s and owners can do this. Ask the shop owner.`);
  return { user, merchant, role: membership.role, impersonated: false };
}

export async function loadUser(ctx: AppContext, userId: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.deletedAt) throw unauthorized();
  return u;
}
