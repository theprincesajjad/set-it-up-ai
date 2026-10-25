/**
 * Authentication: phone OTP (customers), email + password and email OTP
 * (merchants, reps, admins), refresh-token sessions and counter staff PINs.
 *
 * Security notes
 *  - OTP codes are never stored in clear: HMAC-SHA256(jwtSecret, purpose:target:code).
 *    Codes expire after 10 minutes, allow 5 attempts, and each target may
 *    request 5 codes per rolling hour. Starting a new code invalidates older ones.
 *  - Refresh tokens are random 256-bit strings stored as SHA-256 hashes in
 *    `sessions`. They rotate on every refresh. Presenting an already-rotated
 *    token revokes every session of that user (token theft detection).
 *  - Staff PINs are bcrypt hashes in merchant_staff.pin_hash. Failed attempts
 *    are logged to audit_logs and limited per device user per merchant.
 */
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { auditLogs, merchantStaff, merchants, otpCodes, sessions, users } from "@ll/db";
import { AGENT_TEXTS, BRAND, authApi, type AgentLang, normalizeLocale, normalizePhone } from "@ll/shared";
import type { AppContext } from "../context.js";
import { signAccessToken, type AuthUser } from "../lib/auth.js";
import { hmacSha256, randomDigits, randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, forbidden, tooMany, unauthorized } from "../lib/errors.js";
import { findOrCreateCustomerByPhone, generateMemberCode } from "./ledger.js";
import { authUserDto } from "./serializers.js";

type User = typeof users.$inferSelect;
type OtpPurpose = "phone_login" | "email_login" | "agent_verify";

const BCRYPT_ROUNDS = 10;
/** PINs have a tiny keyspace, so online rate limiting is the real protection; keep hashing fast for the counter. */
const PIN_BCRYPT_ROUNDS = 8;
/** Used to keep login timing constant when the email is unknown. */
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export function requirePhone(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw badRequest("Enter a valid phone number", [{ path: "phone", message: "Invalid phone number" }]);
  return phone;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------
const otpHash = (ctx: AppContext, purpose: OtpPurpose, target: string, code: string) => hmacSha256(ctx.config.jwtSecret, `${purpose}:${target}:${code}`);

async function createOtp(ctx: AppContext, purpose: OtpPurpose, target: string): Promise<string> {
  const now = ctx.now();
  const hourAgo = new Date(now.getTime() - 3600_000);
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), gt(otpCodes.createdAt, hourAgo)));
  if (Number(row?.n ?? 0) >= authApi.OTP_MAX_STARTS_PER_HOUR) {
    throw tooMany("Too many codes requested. Try again in an hour.");
  }
  const code = randomDigits(authApi.OTP_CODE_LENGTH);
  await ctx.db.transaction(async (tx) => {
    // Only the newest code is valid.
    await tx
      .update(otpCodes)
      .set({ consumedAt: now })
      .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)));
    await tx.insert(otpCodes).values({
      target,
      purpose,
      codeHash: otpHash(ctx, purpose, target, code),
      expiresAt: new Date(now.getTime() + authApi.OTP_TTL_SECONDS * 1000),
      createdAt: now,
    });
  });
  return code;
}

/** Verifies and consumes a code. Throws 400 invalid_code / 429 rate_limited. */
async function consumeOtp(ctx: AppContext, purpose: OtpPurpose, target: string, code: string): Promise<void> {
  const now = ctx.now();
  const [otp] = await ctx.db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!otp || otp.expiresAt <= now) throw new HttpError(400, "invalid_code", "That code has expired. Request a new one.");
  if (otp.attempts >= authApi.OTP_MAX_ATTEMPTS) throw tooMany("Too many wrong codes. Request a new one.");

  const [counted] = await ctx.db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(and(eq(otpCodes.id, otp.id), isNull(otpCodes.consumedAt)))
    .returning({ attempts: otpCodes.attempts });
  if (!counted) throw new HttpError(400, "invalid_code", "That code has expired. Request a new one.");

  if (!safeEqual(otp.codeHash, otpHash(ctx, purpose, target, code))) {
    const attemptsLeft = Math.max(0, authApi.OTP_MAX_ATTEMPTS - counted.attempts);
    if (attemptsLeft === 0) {
      await ctx.db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, otp.id));
      throw tooMany("Too many wrong codes. Request a new one.");
    }
    throw new HttpError(400, "invalid_code", "That code is not right.", { attemptsLeft });
  }
  const [used] = await ctx.db
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(and(eq(otpCodes.id, otp.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (!used) throw new HttpError(400, "invalid_code", "That code was already used. Request a new one.");
}

function otpStartResponse(ctx: AppContext, code: string): authApi.OtpStartResponse {
  return {
    sent: true,
    expiresInSeconds: authApi.OTP_TTL_SECONDS,
    ...(ctx.config.env !== "production" ? { devCode: code } : {}),
  };
}

/** Sends a login code by SMS (transactional; no marketing consent needed). */
export async function startPhoneOtp(ctx: AppContext, phoneInput: string, opts: { context?: string } = {}): Promise<authApi.OtpStartResponse> {
  const phone = requirePhone(phoneInput);
  const code = await createOtp(ctx, "phone_login", phone);
  const intro = opts.context ? `${code} is your code to join ${opts.context} on ${BRAND.name}.` : `${code} is your ${BRAND.name} code.`;
  await ctx.providers.sms.send(phone, `${intro} It expires in 10 minutes. Don't share it.`);
  return otpStartResponse(ctx, code);
}

/**
 * The sales assistant's owner check (services/sales-agent): a code to the phone, typed back in the chat. It proves
 * the person holds the number; it does not sign anyone in (no session, no token). Own purpose, so a login code cannot
 * be replayed here or the other way round.
 */
export async function startAgentVerification(ctx: AppContext, phoneInput: string, lang: AgentLang = "en"): Promise<void> {
  const phone = requirePhone(phoneInput);
  const code = await createOtp(ctx, "agent_verify", phone);
  // Fixed text in the person's language (French for Quebec); languages without a translated SMS get the English one.
  const body = (AGENT_TEXTS[lang].otpSms ?? AGENT_TEXTS.en.otpSms!)(code);
  await ctx.providers.sms.send(phone, body);
}

export type AgentVerification = { ok: true } | { ok: false; reason: "wrong" | "expired" | "locked"; attemptsLeft?: number };
export async function checkAgentVerification(ctx: AppContext, phoneInput: string, code: string): Promise<AgentVerification> {
  const phone = requirePhone(phoneInput);
  try {
    await consumeOtp(ctx, "agent_verify", phone, code);
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError && err.code === "invalid_code") {
      const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
      return left === undefined ? { ok: false, reason: "expired" } : { ok: false, reason: "wrong", attemptsLeft: left };
    }
    if (err instanceof HttpError && err.statusCode === 429) return { ok: false, reason: "locked" };
    throw err;
  }
}

export async function startEmailOtp(ctx: AppContext, emailInput: string): Promise<authApi.OtpStartResponse> {
  const email = normalizeEmail(emailInput);
  const code = await createOtp(ctx, "email_login", email);
  await ctx.providers.email.send({
    to: email,
    subject: `${code} is your ${BRAND.name} sign-in code`,
    text: `Your ${BRAND.name} sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
  });
  return otpStartResponse(ctx, code);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export async function issueTokens(ctx: AppContext, user: Pick<User, "id" | "platformRole">, userAgent?: string | null): Promise<authApi.TokenPair> {
  const now = ctx.now();
  const accessToken = await signAccessToken(ctx, { id: user.id, platformRole: user.platformRole });
  const refreshToken = randomToken(32);
  const refreshTokenExpiresAt = new Date(now.getTime() + authApi.REFRESH_TOKEN_TTL_DAYS * 86400_000);
  await ctx.db.insert(sessions).values({
    userId: user.id,
    refreshTokenHash: sha256(refreshToken),
    userAgent: userAgent?.slice(0, 300) ?? null,
    expiresAt: refreshTokenExpiresAt,
    createdAt: now,
  });
  return {
    accessToken,
    accessTokenExpiresAt: new Date(now.getTime() + authApi.ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
  };
}

async function authResponse(ctx: AppContext, user: User, created: boolean, userAgent?: string | null): Promise<authApi.AuthResponse> {
  if (user.deletedAt) throw unauthorized("This account was deleted");
  return { ...(await issueTokens(ctx, user, userAgent)), user: authUserDto(user), created };
}

export async function refreshSession(ctx: AppContext, refreshToken: string, userAgent?: string | null): Promise<authApi.AuthResponse> {
  const now = ctx.now();
  const [session] = await ctx.db.select().from(sessions).where(eq(sessions.refreshTokenHash, sha256(refreshToken))).limit(1);
  if (!session) throw unauthorized("Session expired. Sign in again.");
  if (session.revokedAt) {
    // A rotated token was replayed: assume it leaked and end every session.
    await ctx.db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, session.userId), isNull(sessions.revokedAt)));
    throw unauthorized("Session expired. Sign in again.");
  }
  if (session.expiresAt <= now) throw unauthorized("Session expired. Sign in again.");
  const [user] = await ctx.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.deletedAt) throw unauthorized("Session expired. Sign in again.");
  const [rotated] = await ctx.db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  if (!rotated) throw unauthorized("Session expired. Sign in again.");
  return authResponse(ctx, user, false, userAgent ?? session.userAgent);
}

export async function revokeSession(ctx: AppContext, refreshToken: string): Promise<void> {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: ctx.now() })
    .where(and(eq(sessions.refreshTokenHash, sha256(refreshToken)), isNull(sessions.revokedAt)));
}

export async function revokeAllSessions(ctx: AppContext, userId: string): Promise<void> {
  await ctx.db.update(sessions).set({ revokedAt: ctx.now() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

// ---------------------------------------------------------------------------
// Sign-in flows
// ---------------------------------------------------------------------------
export async function verifyPhoneOtp(ctx: AppContext, body: authApi.OtpVerifyBody, userAgent?: string | null): Promise<authApi.AuthResponse> {
  const phone = requirePhone(body.phone);
  await consumeOtp(ctx, "phone_login", phone, body.code);
  const { user, created } = await findOrCreateCustomerByPhone(ctx.db, phone, body.name ?? null);
  const [verified] = await ctx.db
    .update(users)
    .set({ phoneVerifiedAt: user.phoneVerifiedAt ?? ctx.now(), updatedAt: ctx.now() })
    .where(eq(users.id, user.id))
    .returning();
  return authResponse(ctx, verified!, created, userAgent);
}

async function findUserByEmail(ctx: AppContext, email: string): Promise<User | undefined> {
  const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  return u;
}

export async function register(ctx: AppContext, body: authApi.RegisterBody, userAgent?: string | null): Promise<authApi.AuthResponse> {
  const email = normalizeEmail(body.email);
  if (await findUserByEmail(ctx, email)) throw conflict("An account with this email already exists. Sign in instead.");
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const [user] = await ctx.db
    .insert(users)
    .values({ email, name: body.name, passwordHash, memberCode: await generateMemberCode(ctx.db) })
    .onConflictDoNothing()
    .returning();
  if (!user) throw conflict("An account with this email already exists. Sign in instead.");
  return authResponse(ctx, user, true, userAgent);
}

export async function login(ctx: AppContext, body: authApi.LoginBody, userAgent?: string | null): Promise<authApi.AuthResponse> {
  const user = await findUserByEmail(ctx, normalizeEmail(body.email));
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok || user.deletedAt) throw unauthorized("Email or password is incorrect");
  return authResponse(ctx, user, false, userAgent);
}

export async function verifyEmailOtp(ctx: AppContext, body: authApi.EmailOtpVerifyBody, userAgent?: string | null): Promise<authApi.AuthResponse> {
  const email = normalizeEmail(body.email);
  await consumeOtp(ctx, "email_login", email, body.code);
  let user = await findUserByEmail(ctx, email);
  let created = false;
  if (!user) {
    [user] = await ctx.db
      .insert(users)
      .values({ email, name: body.name ?? null, memberCode: await generateMemberCode(ctx.db) })
      .onConflictDoNothing()
      .returning();
    created = !!user;
    user ??= await findUserByEmail(ctx, email);
  }
  if (!user) throw new Error("Could not create user");
  const [verified] = await ctx.db
    .update(users)
    .set({ emailVerifiedAt: user.emailVerifiedAt ?? ctx.now(), name: user.name ?? body.name ?? null, updatedAt: ctx.now() })
    .where(eq(users.id, user.id))
    .returning();
  return authResponse(ctx, verified!, created, userAgent);
}

export async function getMe(ctx: AppContext, authUser: AuthUser): Promise<authApi.MeResponse> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!user || user.deletedAt) throw unauthorized();
  const rows = await ctx.db
    .select({
      merchantId: merchants.id,
      name: merchants.name,
      slug: merchants.slug,
      status: merchants.status,
      logoUrl: merchants.logoUrl,
      role: merchantStaff.role,
      pinHash: merchantStaff.pinHash,
      locale: merchantStaff.locale,
      station: merchantStaff.station,
    })
    .from(merchantStaff)
    .innerJoin(merchants, eq(merchants.id, merchantStaff.merchantId))
    .where(eq(merchantStaff.userId, user.id))
    .orderBy(merchants.name);
  return {
    user: authUserDto(user),
    platformRole: user.platformRole,
    merchants: rows.map(({ pinHash, ...r }) => ({ ...r, logoUrl: r.logoUrl ?? null, hasPin: !!pinHash, locale: normalizeLocale(r.locale) ?? "en" })),
  };
}

// ---------------------------------------------------------------------------
// Staff PINs (shared counter device)
// ---------------------------------------------------------------------------
export async function setStaffPin(ctx: AppContext, merchantId: string, userId: string, pin: string): Promise<void> {
  const [self] = await ctx.db
    .select({ userId: merchantStaff.userId })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId)))
    .limit(1);
  if (!self) throw forbidden("Only staff of this shop can set a counter PIN");
  const others = await ctx.db
    .select({ userId: merchantStaff.userId, pinHash: merchantStaff.pinHash })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, merchantId), sql`${merchantStaff.pinHash} is not null`, sql`${merchantStaff.userId} <> ${userId}`));
  for (const o of others) {
    if (o.pinHash && (await bcrypt.compare(pin, o.pinHash))) throw conflict("Another staff member uses that PIN. Pick a different one.");
  }
  await ctx.db
    .update(merchantStaff)
    .set({ pinHash: await bcrypt.hash(pin, PIN_BCRYPT_ROUNDS) })
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId)));
}

export async function verifyStaffPin(
  ctx: AppContext,
  args: { merchantId: string; deviceUserId: string; pin: string; userId?: string; ip?: string | null },
): Promise<authApi.StaffPinVerifyResponse> {
  const now = ctx.now();
  const since = new Date(now.getTime() - authApi.STAFF_PIN_LOCKOUT_MINUTES * 60_000);
  const [failures] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.merchantId, args.merchantId),
        eq(auditLogs.actorUserId, args.deviceUserId),
        eq(auditLogs.action, "staff_pin.failed"),
        gt(auditLogs.createdAt, since),
      ),
    );
  if (Number(failures?.n ?? 0) >= authApi.STAFF_PIN_MAX_FAILURES) {
    throw tooMany(`Too many wrong PINs. Try again in ${authApi.STAFF_PIN_LOCKOUT_MINUTES} minutes.`);
  }

  const candidates = await ctx.db
    .select({ userId: merchantStaff.userId, role: merchantStaff.role, pinHash: merchantStaff.pinHash, name: users.name, platformRole: users.platformRole, deletedAt: users.deletedAt })
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(
      and(
        eq(merchantStaff.merchantId, args.merchantId),
        sql`${merchantStaff.pinHash} is not null`,
        args.userId ? eq(merchantStaff.userId, args.userId) : undefined,
      ),
    );
  let match: (typeof candidates)[number] | undefined;
  for (const c of candidates) {
    if (!c.deletedAt && c.pinHash && (await bcrypt.compare(args.pin, c.pinHash))) {
      match = c;
      break;
    }
  }
  if (!match) {
    await ctx.db.insert(auditLogs).values({
      actorUserId: args.deviceUserId,
      merchantId: args.merchantId,
      action: "staff_pin.failed",
      entity: "merchant_staff",
      entityId: args.userId ?? null,
      ip: args.ip ?? null,
      createdAt: now,
    });
    throw new HttpError(401, "invalid_pin", "That PIN is not right.");
  }
  await ctx.db.insert(auditLogs).values({
    actorUserId: match.userId,
    merchantId: args.merchantId,
    action: "staff_pin.verified",
    entity: "merchant_staff",
    entityId: match.userId,
    data: { deviceUserId: args.deviceUserId },
    ip: args.ip ?? null,
    createdAt: now,
  });
  const accessToken = await signAccessToken(ctx, { id: match.userId, platformRole: match.platformRole });
  return {
    accessToken,
    accessTokenExpiresAt: new Date(now.getTime() + authApi.ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    staff: { userId: match.userId, name: match.name ?? null, role: match.role },
  };
}
