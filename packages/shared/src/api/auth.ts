/**
 * API contract for the "auth" area (routes/auth). Endpoint docs:
 * docs/engineering/api/auth.md.
 *
 * Tokens: every sign-in returns a short-lived access JWT (1 hour, send as
 * `Authorization: Bearer <accessToken>`) and a long-lived refresh token
 * (90 days, single use: each refresh returns a new pair).
 */
import { z } from "zod";
import { phoneSchema } from "./common.js";

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_STARTS_PER_HOUR = 5;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 90;
export const STAFF_PIN_MAX_FAILURES = 5;
export const STAFF_PIN_LOCKOUT_MINUTES = 15;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export const otpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");
export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(200);
export const nameSchema = z.string().trim().min(1).max(120);
export const staffPinSchema = z.string().regex(/^\d{4,6}$/, "PIN is 4 to 6 digits");

/** POST /v1/auth/otp/start */
export const otpStartBody = z.object({ phone: phoneSchema });
export type OtpStartBody = z.infer<typeof otpStartBody>;

/** POST /v1/auth/otp/verify */
export const otpVerifyBody = z.object({ phone: phoneSchema, code: otpCodeSchema, name: nameSchema.optional() });
export type OtpVerifyBody = z.infer<typeof otpVerifyBody>;

/** POST /v1/auth/register */
export const registerBody = z.object({ email: emailSchema, password: passwordSchema, name: nameSchema });
export type RegisterBody = z.infer<typeof registerBody>;

/** POST /v1/auth/login */
export const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export type LoginBody = z.infer<typeof loginBody>;

/** POST /v1/auth/email-otp/start */
export const emailOtpStartBody = z.object({ email: emailSchema });
export type EmailOtpStartBody = z.infer<typeof emailOtpStartBody>;

/** POST /v1/auth/email-otp/verify */
export const emailOtpVerifyBody = z.object({ email: emailSchema, code: otpCodeSchema, name: nameSchema.optional() });
export type EmailOtpVerifyBody = z.infer<typeof emailOtpVerifyBody>;

/** POST /v1/auth/refresh and POST /v1/auth/logout */
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
export type RefreshBody = z.infer<typeof refreshBody>;

/** POST /v1/merchants/:merchantId/staff-pin/verify */
export const staffPinVerifyBody = z.object({
  pin: staffPinSchema,
  /** Optional: the staff member tapped on the switcher. Faster and avoids PIN collisions between staff. */
  userId: z.uuid().optional(),
});
export type StaffPinVerifyBody = z.infer<typeof staffPinVerifyBody>;

/** PUT /v1/merchants/:merchantId/staff-pin (set your own PIN for this merchant) */
export const staffPinSetBody = z.object({ pin: staffPinSchema });
export type StaffPinSetBody = z.infer<typeof staffPinSetBody>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
export type PlatformRole = "none" | "rep" | "admin";
export type StaffRole = "owner" | "manager" | "staff";

/** The signed-in user's own profile (never another person's). */
export interface AuthUserDto {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  platformRole: PlatformRole;
  memberCode: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  /** YYYY-MM-DD */
  birthday: string | null;
  postalCode: string | null;
  homeNeighbourhoodId: string | null;
  locale: string;
  createdAt: string;
}

export interface OtpStartResponse {
  sent: true;
  /** Seconds until the code expires. */
  expiresInSeconds: number;
  /** Only in non-production environments, so dev builds can auto-fill. Never present in production. */
  devCode?: string;
}

export interface TokenPair {
  accessToken: string;
  /** ISO time the access token expires. */
  accessTokenExpiresAt: string;
  refreshToken: string;
  /** ISO time the refresh token expires. */
  refreshTokenExpiresAt: string;
}

export interface AuthResponse extends TokenPair {
  user: AuthUserDto;
  /** True when this sign-in created the account. */
  created: boolean;
}

export interface MerchantMembershipDto {
  merchantId: string;
  name: string;
  slug: string;
  role: StaffRole;
  status: "onboarding" | "active" | "paused" | "closed";
  logoUrl: string | null;
  /** True when this staff member has a counter PIN set for this merchant. */
  hasPin: boolean;
  /** This staff member's UI language (merchant_staff.locale: en | hi | ur | pa). Mobile counter and web KDS default to it. */
  locale: "en" | "hi" | "ur" | "pa";
  /** Kitchen station they work (merchant_staff.station), or null for all stations. */
  station: string | null;
}

/** GET /v1/auth/me */
export interface MeResponse {
  user: AuthUserDto;
  platformRole: PlatformRole;
  merchants: MerchantMembershipDto[];
}

/** POST /v1/merchants/:merchantId/staff-pin/verify */
export interface StaffPinVerifyResponse {
  /** Access token for the staff member who owns the PIN. No refresh token: the counter device keeps its own session. */
  accessToken: string;
  accessTokenExpiresAt: string;
  staff: { userId: string; name: string | null; role: StaffRole };
}

export interface OkResponse {
  ok: true;
}
