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

/** The signed-in user's /v1/auth/me, or null (no cookie, expired, API down). */
export async function getMe(): Promise<authApi.MeResponse | null> {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)?.value) return null;
  try {
    const api = await getServerApi();
    return await api.auth.me();
  } catch (e) {
    if (isApiError(e) && (e.status === 401 || e.status === 403 || e.isNetwork)) return null;
    throw e;
  }
}

export async function getSessionUser(): Promise<authApi.AuthUserDto | null> {
  return (await getMe())?.user ?? null;
}

/** For signed-in pages: redirects to /login with a return path when there is no session. */
export async function requireMe(nextPath: string, loginPath = "/login"): Promise<authApi.MeResponse> {
  const me = await getMe();
  if (!me) redirect(`${loginPath}?next=${encodeURIComponent(nextPath)}`);
  return me;
}
