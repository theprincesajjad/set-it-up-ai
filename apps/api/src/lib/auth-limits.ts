/**
 * Sign-in throttles (services/auth.ts). One place for the numbers, so the web copy, the tests and the runbook agree.
 * Every limit is a sliding window kept by lib/rate-limit.ts (RATE_LIMIT_STORE=postgres when more than one API instance runs).
 *
 * The rules are written so that nobody can use them to lock a real person out:
 *  - a refused request never invalidates or uses up a code that was already sent;
 *  - the per-account password limit is a cooldown (it ends on its own) and email-code sign-in and password reset stay open;
 *  - failures are counted per account AND per address, and a good sign-in clears the account's count.
 *
 * Per-address limits that would trip a whole test run (every request comes from 127.0.0.1) are off when NODE_ENV=test unless a
 * test turns them on with `setAuthLimits`. Each number can be set from the environment (AUTH_*), 0 turns that limit off.
 */
import type { AppContext } from "../context.js";

export interface AuthLimits {
  /** Seconds a person must wait before asking for another code while the last one is still unused and valid. */
  otpCooldownSec: number;
  /** Code requests per phone number or email per hour (all purposes counted separately). */
  otpPerTargetPerHour: number;
  /** Code requests per address in `otpPerIpWindowMin` minutes (phone and email together). */
  otpPerIp: number;
  otpPerIpWindowMin: number;
  /** Text messages this API sends per minute, all addresses together: a ceiling against SMS pumping (and a log line when it trips). */
  smsPerMinute: number;
  /** Phone country calling codes we text (digits, no plus). Empty = any. */
  smsCountryCodes: string[];
  /** Wrong passwords per email AND address in `loginWindowMin` minutes. */
  loginPerAccountAndIp: number;
  /** Wrong passwords per email from any address. */
  loginPerAccount: number;
  /** Wrong passwords per address across every email. */
  loginPerIp: number;
  loginWindowMin: number;
  /** Registrations per address per hour. */
  registerPerIpPerHour: number;
}

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

export function defaultAuthLimits(env: NodeJS.ProcessEnv, test: boolean): AuthLimits {
  return {
    otpCooldownSec: num(env.AUTH_OTP_COOLDOWN_SEC, 30),
    otpPerTargetPerHour: num(env.AUTH_OTP_PER_TARGET_PER_HOUR, 5),
    otpPerIp: num(env.AUTH_OTP_PER_IP, test ? 0 : 10),
    otpPerIpWindowMin: num(env.AUTH_OTP_PER_IP_WINDOW_MIN, 10),
    smsPerMinute: num(env.AUTH_SMS_PER_MINUTE, test ? 0 : 120),
    smsCountryCodes: (env.AUTH_SMS_COUNTRY_CODES ?? "1").split(",").map((s) => s.trim()).filter(Boolean),
    loginPerAccountAndIp: num(env.AUTH_LOGIN_PER_ACCOUNT_AND_IP, 5),
    loginPerAccount: num(env.AUTH_LOGIN_PER_ACCOUNT, 15),
    loginPerIp: num(env.AUTH_LOGIN_PER_IP, test ? 0 : 20),
    loginWindowMin: num(env.AUTH_LOGIN_WINDOW_MIN, 15),
    registerPerIpPerHour: num(env.AUTH_REGISTER_PER_IP_PER_HOUR, test ? 0 : 10),
  };
}

const overrides = new WeakMap<AppContext, Partial<AuthLimits>>();

/** Tests: change some limits for one app context. */
export function setAuthLimits(ctx: AppContext, patch: Partial<AuthLimits>): void {
  overrides.set(ctx, { ...overrides.get(ctx), ...patch });
}

export function authLimits(ctx: AppContext): AuthLimits {
  return { ...defaultAuthLimits(process.env, ctx.config.env === "test"), ...overrides.get(ctx) };
}
