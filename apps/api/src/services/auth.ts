/**
 * Authentication: phone OTP (customers), email + password and email OTP
 * (merchants, reps, admins), refresh-token sessions and counter staff PINs.
 *
 * Security notes
 *  - OTP codes are never stored in clear: HMAC-SHA256(jwtSecret, purpose:target:code).
 *    Codes expire after 10 minutes and allow 5 attempts. Asking for a new code invalidates the older one, so a request that is refused
 *    (cooldown, per-target cap, per-address cap) never touches a code that was already sent: nobody can use the limits to burn a
 *    real person's code or lock them out. Rules and numbers: lib/auth-limits.ts.
 *  - Refresh tokens are random 256-bit strings stored as SHA-256 hashes in
 *    `sessions`. They rotate on every refresh. Presenting an already-rotated
 *    token revokes every session of that user (token theft detection).
 *  - Staff PINs are bcrypt hashes in merchant_staff.pin_hash. Failed attempts
 *    are logged to audit_logs and limited per device user per merchant.
 */
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { auditLogs, merchantStaff, neighbourhoodManagers, merchants, otpCodes, sessions, users } from "@ll/db";
import { AGENT_TEXTS, BRAND, authApi, type AgentLang, normalizeLocale, normalizePhone } from "@ll/shared";
import type { AppContext } from "../context.js";
import { ROTATION_GRACE_MS, forgetAuthCache, signAccessToken, type AuthUser } from "../lib/auth.js";
import { authLimits } from "../lib/auth-limits.js";
import { allow, clearHits, countHits, recordHit, secondsUntilFree } from "../lib/rate-limit.js";
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
  if (!phone) throw badRequest("Enter a 10-digit phone number.", [{ path: "phone", message: "That doesn't look like a mobile number. Check it and try again." }]);
  return phone;
}

/** A phone we may text a code to: valid, and in a country we serve (AUTH_SMS_COUNTRY_CODES, default +1) so the code line cannot be used to pump texts abroad. */
export function requireTextablePhone(ctx: AppContext, input: string): string {
  const phone = requirePhone(input);
  const codes = authLimits(ctx).smsCountryCodes;
  if (codes.length && !codes.some((c) => phone.startsWith(`+${c}`))) {
    throw new HttpError(400, "unsupported_region", "We can only text Canadian and U.S. phone numbers for now. Use an emailed code instead.", [{ path: "phone", message: "We can only text Canadian and U.S. phone numbers for now." }]);
  }
  return phone;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------
const otpHash = (ctx: AppContext, purpose: OtpPurpose, target: string, code: string) => hmacSha256(ctx.config.jwtSecret, `${purpose}:${target}:${code}`);

interface OtpOpts {
  /** The caller's address, for the per-address limit. */
  ip?: string | null;
  /** Texts count toward the API-wide ceiling. */
  sms?: boolean;
}

/** Why a code request was refused, and how long until it can work. Never changes any stored code. */
async function guardOtpStart(ctx: AppContext, purpose: OtpPurpose, target: string, opts: OtpOpts): Promise<void> {
  const L = authLimits(ctx);
  const now = ctx.now();
  const [live] = await ctx.db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  const codeStillValid = !!live;
  if (live && L.otpCooldownSec > 0) {
    const wait = Math.ceil((live.createdAt.getTime() + L.otpCooldownSec * 1000 - now.getTime()) / 1000);
    if (wait > 0) throw tooMany(`We just sent a code. Use it, or wait ${wait} seconds before asking again.`, wait, { reason: "otp_cooldown", codeStillValid: true });
  }
  if (L.otpPerTargetPerHour > 0) {
    const hourAgo = new Date(now.getTime() - 3600_000);
    const recent = await ctx.db
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(and(eq(otpCodes.target, target), eq(otpCodes.purpose, purpose), gt(otpCodes.createdAt, hourAgo)))
      .orderBy(otpCodes.createdAt);
    if (recent.length >= L.otpPerTargetPerHour) {
      // The window slides: the next code is allowed when the oldest of the counted ones is an hour old.
      const oldest = recent[recent.length - L.otpPerTargetPerHour]!.createdAt;
      const wait = Math.max(1, Math.ceil((oldest.getTime() + 3600_000 - now.getTime()) / 1000));
      throw tooMany(
        codeStillValid ? "We've sent several codes already. Use the latest one, or try again later." : "We've sent several codes already. Try again later.",
        wait,
        { reason: "otp_target_cap", codeStillValid },
      );
    }
  }
  if (opts.ip && L.otpPerIp > 0) {
    const windowMs = L.otpPerIpWindowMin * 60_000;
    if (!(await allow(ctx, `otp:ip:${opts.ip}`, L.otpPerIp, windowMs))) {
      const wait = await secondsUntilFree(ctx, `otp:ip:${opts.ip}`, windowMs);
      throw tooMany("Too many codes were asked for from this connection. Try again later.", wait || 60, { reason: "otp_ip", codeStillValid });
    }
  }
  if (opts.sms && L.smsPerMinute > 0 && !(await allow(ctx, "otp:sms:global", L.smsPerMinute, 60_000))) {
    console.warn(`[auth] text-message ceiling reached (${L.smsPerMinute}/minute): code requests are being refused. Possible SMS pumping; check the audit trail and addresses.`);
    throw tooMany("We're sending a lot of codes right now. Try again in a minute.", Math.max(1, await secondsUntilFree(ctx, "otp:sms:global", 60_000)), { reason: "otp_busy", codeStillValid });
  }
}

async function createOtp(ctx: AppContext, purpose: OtpPurpose, target: string, opts: OtpOpts = {}): Promise<string> {
  await guardOtpStart(ctx, purpose, target, opts);
  const now = ctx.now();
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
export async function startPhoneOtp(ctx: AppContext, phoneInput: string, opts: { context?: string; ip?: string | null } = {}): Promise<authApi.OtpStartResponse> {
  const phone = requireTextablePhone(ctx, phoneInput);
  const code = await createOtp(ctx, "phone_login", phone, { ip: opts.ip, sms: true });
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
  const phone = requireTextablePhone(ctx, phoneInput);
  const code = await createOtp(ctx, "agent_verify", phone, { sms: true });
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

export async function startEmailOtp(ctx: AppContext, emailInput: string, opts: { ip?: string | null } = {}): Promise<authApi.OtpStartResponse> {
  const email = normalizeEmail(emailInput);
  const code = await createOtp(ctx, "email_login", email, { ip: opts.ip });
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
  const refreshToken = randomToken(32);
  const refreshTokenExpiresAt = new Date(now.getTime() + authApi.REFRESH_TOKEN_TTL_DAYS * 86400_000);
  const [session] = await ctx.db
    .insert(sessions)
    .values({
      userId: user.id,
      refreshTokenHash: sha256(refreshToken),
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: refreshTokenExpiresAt,
      createdAt: now,
    })
    .returning({ id: sessions.id });
  // The access token names its session: ending the session (sign-out, password reset, deletion) ends the token too.
  const accessToken = await signAccessToken(ctx, { id: user.id, platformRole: user.platformRole }, session!.id);
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
  // A session that was ended on purpose (sign-out, password reset, "end every session") is expired as well as revoked: presenting it
  // is just a dead token, and must not sign the real owner out of everything (an old token in a stranger's hands could do that).
  if (session.expiresAt <= now) throw unauthorized("Session expired. Sign in again.");
  if (session.revokedAt) {
    // A rotated token was replayed: assume it leaked and end every session.
    await revokeAllSessions(ctx, session.userId);
    throw unauthorized("Session expired. Sign in again.");
  }
  const [user] = await ctx.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.deletedAt) throw unauthorized("Session expired. Sign in again.");
  // Rotated: the old refresh token is dead at once (replay is detected), its access token lives a few more seconds (lib/auth.ts ROTATION_GRACE_MS).
  const [rotated] = await ctx.db
    .update(sessions)
    .set({ revokedAt: new Date(now.getTime() + ROTATION_GRACE_MS) })
    .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  if (!rotated) throw unauthorized("Session expired. Sign in again.");
  return authResponse(ctx, user, false, userAgent ?? session.userAgent);
}

export async function revokeSession(ctx: AppContext, refreshToken: string): Promise<void> {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: ctx.now(), expiresAt: ctx.now() })
    .where(and(eq(sessions.refreshTokenHash, sha256(refreshToken)), isNull(sessions.revokedAt)));
  forgetAuthCache(ctx);
}

export async function revokeAllSessions(ctx: AppContext, userId: string): Promise<void> {
  const now = ctx.now();
  // Also the sessions that were only rotated a moment ago: their access tokens are still in their grace period.
  await ctx.db.update(sessions).set({ revokedAt: now, expiresAt: now }).where(and(eq(sessions.userId, userId), or(isNull(sessions.revokedAt), gt(sessions.revokedAt, now))));
  forgetAuthCache(ctx, userId);
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

const hashKey = (v: string) => sha256(v).slice(0, 32);

export async function register(ctx: AppContext, body: authApi.RegisterBody, userAgent?: string | null, ip?: string | null): Promise<authApi.AuthResponse> {
  const L = authLimits(ctx);
  if (ip && L.registerPerIpPerHour > 0 && !(await allow(ctx, `register:ip:${ip}`, L.registerPerIpPerHour, 3600_000))) {
    throw tooMany("Too many accounts were started from this connection. Try again later.", Math.max(1, await secondsUntilFree(ctx, `register:ip:${ip}`, 3600_000)), { reason: "register_ip" });
  }
  const email = normalizeEmail(body.email);
  if (await findUserByEmail(ctx, email)) throw conflict("An account with this email already exists. Sign in instead.");
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  // emailVerifiedAt stays empty: nothing proves this person owns the address yet. The first emailed-code sign-in does, and until
  // then the password they chose here is not trusted against the real owner (see verifyEmailOtp).
  const [user] = await ctx.db
    .insert(users)
    .values({ email, name: body.name, passwordHash, memberCode: await generateMemberCode(ctx.db) })
    .onConflictDoNothing()
    .returning();
  if (!user) throw conflict("An account with this email already exists. Sign in instead.");
  return authResponse(ctx, user, true, userAgent);
}

/** The keys a wrong password is counted under, and their limits. The same keys apply whether or not the email has an account. */
function loginKeys(ctx: AppContext, email: string, ip: string | null | undefined) {
  const L = authLimits(ctx);
  const windowMs = L.loginWindowMin * 60_000;
  const e = hashKey(email);
  const keys: { key: string; max: number; reason: string }[] = [];
  if (ip && L.loginPerAccountAndIp > 0) keys.push({ key: `login:ai:${e}:${ip}`, max: L.loginPerAccountAndIp, reason: "login_account_ip" });
  if (L.loginPerAccount > 0) keys.push({ key: `login:a:${e}`, max: L.loginPerAccount, reason: "login_account" });
  if (ip && L.loginPerIp > 0) keys.push({ key: `login:i:${ip}`, max: L.loginPerIp, reason: "login_ip" });
  return { keys, windowMs, accountKeys: [`login:ai:${e}:${ip ?? ""}`, `login:a:${e}`] };
}

export async function login(ctx: AppContext, body: authApi.LoginBody, userAgent?: string | null, ip?: string | null): Promise<authApi.AuthResponse> {
  const email = normalizeEmail(body.email);
  const { keys, windowMs, accountKeys } = loginKeys(ctx, email, ip);
  // Refused before the password is looked at: a throttled caller learns nothing, and a right password does not skip the wait.
  for (const k of keys) {
    if ((await countHits(ctx, k.key, windowMs)) >= k.max) {
      const wait = await secondsUntilFree(ctx, k.key, windowMs);
      throw tooMany("Too many sign-in attempts. Try again later, or sign in with an emailed code.", wait || authLimits(ctx).loginWindowMin * 60, { reason: k.reason });
    }
  }
  const user = await findUserByEmail(ctx, email);
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok || user.deletedAt) {
    for (const k of keys) await recordHit(ctx, k.key, windowMs);
    await ctx.db
      .insert(auditLogs)
      .values({ actorUserId: user?.id ?? null, action: "auth.login_failed", entity: "user", entityId: user?.id ?? null, ip: ip ?? null, data: { known: !!user }, createdAt: ctx.now() });
    throw unauthorized("Email or password is incorrect");
  }
  for (const key of accountKeys) await clearHits(ctx, key);
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
  // The emailed code proves this person owns the address. If the account was made by register (email never verified), whoever made it
  // may not be them: the password and every session from before are removed, so a pre-registered account cannot be kept by its maker.
  const passwordCleared = !user.emailVerifiedAt && !!user.passwordHash && !user.deletedAt;
  if (passwordCleared) await revokeAllSessions(ctx, user.id);
  const [verified] = await ctx.db
    .update(users)
    .set({ emailVerifiedAt: user.emailVerifiedAt ?? ctx.now(), ...(passwordCleared ? { passwordHash: null } : {}), name: user.name ?? body.name ?? null, updatedAt: ctx.now() })
    .where(eq(users.id, user.id))
    .returning();
  if (passwordCleared) await ctx.db.insert(auditLogs).values({ actorUserId: user.id, action: "auth.unverified_password_cleared", entity: "user", entityId: user.id, createdAt: ctx.now() });
  return { ...(await authResponse(ctx, verified!, created, userAgent)), ...(passwordCleared ? { passwordCleared: true } : {}) };
}

/**
 * Forgot password: the emailed code (the same one-time code as email sign-in) proves the person owns the email; the new password
 * replaces the old one, every other session ends, and the person is signed in. Never creates an account. Audit-logged without the
 * password or the code.
 */
export async function resetPasswordWithEmailOtp(ctx: AppContext, body: authApi.PasswordResetBody, meta: { userAgent?: string | null; ip?: string | null } = {}): Promise<authApi.AuthResponse> {
  const email = normalizeEmail(body.email);
  // Check the account first so a mistyped email does not burn the code.
  const user = await findUserByEmail(ctx, email);
  if (!user || user.deletedAt) throw new HttpError(400, "no_account", "There\u2019s no account with this email. Get started instead.");
  await consumeOtp(ctx, "email_login", email, body.code);
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  await revokeAllSessions(ctx, user.id);
  const [updated] = await ctx.db
    .update(users)
    .set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? ctx.now(), updatedAt: ctx.now() })
    .where(eq(users.id, user.id))
    .returning();
  await ctx.db.insert(auditLogs).values({ actorUserId: user.id, action: "auth.password_reset", entity: "user", entityId: user.id, ip: meta.ip ?? null });
  return authResponse(ctx, updated!, false, meta.userAgent);
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
  const [manager] = await ctx.db.select({ id: neighbourhoodManagers.userId }).from(neighbourhoodManagers).where(eq(neighbourhoodManagers.userId, user.id)).limit(1);
  return {
    user: authUserDto(user),
    platformRole: user.platformRole,
    biaManager: !!manager,
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
    throw tooMany(`Too many wrong PINs. Try again in ${authApi.STAFF_PIN_LOCKOUT_MINUTES} minutes.`, authApi.STAFF_PIN_LOCKOUT_MINUTES * 60);
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
