/**
 * Session cookies. Tokens never reach browser JavaScript: both are httpOnly and
 * only route handlers (/api/auth/*, /api/ll/*) and the proxy read or write them.
 */
import type { authApi } from "@ll/shared";

export const ACCESS_COOKIE = "ll_at";
export const REFRESH_COOKIE = "ll_rt";
/** Readable hint (no secret) so client components can tell "probably signed in" without a request. */
export const SESSION_HINT_COOKIE = "ll_session";

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  expires: Date;
}

const secure = () => process.env.NODE_ENV === "production";

export function sessionCookies(pair: authApi.TokenPair): CookieSpec[] {
  const base = { secure: secure(), sameSite: "lax" as const, path: "/" };
  const rtExpires = new Date(pair.refreshTokenExpiresAt);
  return [
    { ...base, name: ACCESS_COOKIE, value: pair.accessToken, httpOnly: true, expires: new Date(pair.accessTokenExpiresAt) },
    { ...base, name: REFRESH_COOKIE, value: pair.refreshToken, httpOnly: true, expires: rtExpires },
    { ...base, name: SESSION_HINT_COOKIE, value: "1", httpOnly: false, expires: rtExpires },
  ];
}

export function clearedSessionCookies(): CookieSpec[] {
  const base = { secure: secure(), sameSite: "lax" as const, path: "/", value: "", expires: new Date(0) };
  return [
    { ...base, name: ACCESS_COOKIE, httpOnly: true },
    { ...base, name: REFRESH_COOKIE, httpOnly: true },
    { ...base, name: SESSION_HINT_COOKIE, httpOnly: false },
  ];
}

/** Reads `exp` from a JWT without verifying it (the API verifies). Returns ms epoch or null. */
export function jwtExpiry(token: string | undefined | null): number | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the access token is missing or expires within `skewMs`. */
export function accessTokenStale(token: string | undefined | null, now = Date.now(), skewMs = 60_000): boolean {
  const exp = jwtExpiry(token);
  return exp === null || exp - skewMs <= now;
}
