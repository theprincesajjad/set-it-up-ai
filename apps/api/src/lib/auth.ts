import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { merchantStaff, merchants, users } from "@ll/db";
import type { AppContext } from "../context.js";
import { forbidden, notFound, unauthorized } from "./errors.js";

export type PlatformRole = "none" | "rep" | "admin";
export type StaffRole = "owner" | "manager" | "staff";

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

export async function signAccessToken(ctx: AppContext, user: AuthUser): Promise<string> {
  return new SignJWT({ role: user.platformRole })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(ctx.now().getTime() / 1000) + ACCESS_TTL_SECONDS)
    .sign(key(ctx.config.jwtSecret));
}

export async function verifyAccessToken(ctx: AppContext, token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(ctx.config.jwtSecret), { currentDate: ctx.now() });
    if (!payload.sub) return null;
    return { id: payload.sub, platformRole: (payload.role as PlatformRole) ?? "none" };
  } catch {
    return null;
  }
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

const RANK: Record<StaffRole, number> = { staff: 0, manager: 1, owner: 2 };

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
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant) throw notFound("Merchant");
  if (user.platformRole === "admin") return { user, merchant, role: "owner", impersonated: true };
  if (user.platformRole === "rep" && merchant.repUserId === user.id) return { user, merchant, role: "owner", impersonated: true };
  const [membership] = await ctx.db
    .select({ role: merchantStaff.role })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, user.id)))
    .limit(1);
  if (!membership) throw forbidden();
  if (RANK[membership.role] < RANK[minRole]) throw forbidden(`Requires ${minRole} access`);
  return { user, merchant, role: membership.role, impersonated: false };
}

export async function loadUser(ctx: AppContext, userId: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.deletedAt) throw unauthorized();
  return u;
}
