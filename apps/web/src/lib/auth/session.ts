/**
 * Server helpers: who is signed in?
 *
 *   const user = await getSessionUser();          // AuthUserDto | null
 *   const me = await requireSession("/me");       // redirects to /login?next=/me
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { authApi } from "@ll/shared";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./cookies";
import { getServerApi } from "../api/server";
import { isApiError } from "../api/errors";

export async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies();
  return jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE);
}

/** Thrown by `getMe()` when the API cannot be reached or answers 5xx: the person's session is unknown, NOT gone. */
export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The API is unavailable");
    this.name = "ApiUnavailableError";
    (this as { cause?: unknown }).cause = cause;
  }
}

export function isApiUnavailable(e: unknown): e is ApiUnavailableError {
  return e instanceof ApiUnavailableError;
}

/**
 * The signed-in user's /v1/auth/me, or null (no cookie, or the API said 401/403: the session is really gone).
 * When the API is unreachable or answers 5xx it THROWS `ApiUnavailableError` instead of returning null: "I could not ask" is not
 * "you are signed out", and `requireMe` must not send a signed-in person to /login because of an outage (FS-03). A layout that can
 * show a screen for it uses `requireMeOrOutage`; elsewhere the route's error boundary shows "Something went wrong on our side".
 */
export async function getMe(): Promise<authApi.MeResponse | null> {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)?.value) return null;
  try {
    const api = await getServerApi();
    return await api.auth.me();
  } catch (e) {
    if (isApiError(e) && (e.status === 401 || e.status === 403)) return null;
    if (isApiError(e) && (e.isNetwork || e.status >= 500)) throw new ApiUnavailableError(e);
    throw e;
  }
}

export async function getSessionUser(): Promise<authApi.AuthUserDto | null> {
  return (await getMe())?.user ?? null;
}

/** For signed-in pages: redirects to /login with a return path when there is no session. Throws `ApiUnavailableError` during an outage (no redirect). */
export async function requireMe(nextPath: string, loginPath = "/login"): Promise<authApi.MeResponse> {
  const me = await getMe();
  if (!me) redirect(`${loginPath}?next=${encodeURIComponent(nextPath)}`);
  return me;
}

/**
 * `requireMe` for a layout: `{ me }` when signed in, `{ outage: true }` when the API cannot be reached (render `<ServiceUnreachable />`
 * from "@/components/errors/server" instead of the area), and a redirect to /login only when the session is really gone.
 * `nextPath` should be the path the person asked for (`currentPath()`), so they come back to it after signing in.
 */
export async function requireMeOrOutage(nextPath: string, loginPath = "/login"): Promise<{ me: authApi.MeResponse; outage?: undefined } | { me?: undefined; outage: true }> {
  try {
    return { me: await requireMe(nextPath, loginPath) };
  } catch (e) {
    if (isApiUnavailable(e)) return { outage: true };
    throw e;
  }
}

/** The path (and query) this request asked for, from the header the proxy forwards: for `?next=` after sign-in. Falls back to `fallback`. */
export async function currentPath(fallback: string): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const p = h.get("x-ll-next");
  return p && p.startsWith("/") && !p.startsWith("//") ? p : fallback;
}
