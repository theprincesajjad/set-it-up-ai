/**
 * Runtime config. EXPO_PUBLIC_* vars are inlined into the bundle by Expo at build time (see .env.example and docs/engineering/mobile.md).
 * Only development builds fall back to localhost; preview and production builds are checked by app.config.ts (config/envConfig.cjs),
 * which fails the build when a host or the support address is missing or a placeholder.
 */
import { BRAND } from "@ll/shared";

/** Dev builds auto-fill OTP codes from the API's `devCode` (never present in production). */
export const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

const clean = (v: string | undefined): string => (v ?? "").trim().replace(/\/+$/, "");

export const API_URL = clean(process.env.EXPO_PUBLIC_API_URL) || (IS_DEV ? "http://localhost:4000" : "");

/** Public web origin: quote and catering approval pages (/e/<token>), terms and privacy, share links and the card pay page open here. */
export const WEB_URL = clean(process.env.EXPO_PUBLIC_WEB_URL) || (IS_DEV ? "http://localhost:3000" : "");

/** Where customers write for help. Empty when not configured: screens hide the link rather than open a mailbox that does not exist. */
export const SUPPORT_EMAIL = clean(process.env.EXPO_PUBLIC_SUPPORT_EMAIL) || BRAND.supportEmail;

if (!IS_DEV && (!API_URL || !WEB_URL)) {
  // Loud, not silent: the build check should have stopped this, so a bundle that gets here was built without it.
  console.error("[config] EXPO_PUBLIC_API_URL and EXPO_PUBLIC_WEB_URL must be set for this build.");
}
