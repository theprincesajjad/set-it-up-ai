/**
 * Runtime config. EXPO_PUBLIC_* vars are inlined into the bundle by Expo at
 * build time (see .env.example and docs/engineering/mobile.md).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");

/** Dev builds auto-fill OTP codes from the API's `devCode` (never present in production). */
export const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

/** Public web origin: quote and catering approval pages (/e/<token>) and the card pay page open here. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || "https://local.example").replace(/\/+$/, "");
