/**
 * Shared logic for the session route handlers and the BFF proxy route.
 * Kept free of `next/headers` so it is unit-testable.
 */
import type { authApi } from "@ll/shared";
import { serverApiUrl } from "../env";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedSessionCookies, sessionCookies, type CookieSpec } from "./cookies";
import { refreshSession } from "./refresh";

/** Sign-in endpoints the browser may call through /api/auth/<action>. */
export const SIGN_IN_ACTIONS: Record<string, string> = {
  "otp/verify": "/v1/auth/otp/verify",
  "email-otp/verify": "/v1/auth/email-otp/verify",
  login: "/v1/auth/login",
  register: "/v1/auth/register",
};

/** API paths the BFF refuses: they return tokens in the body and must go through /api/auth. */
export function isBlockedBffPath(apiPath: string): boolean {
  return /^\/v1\/auth\/(otp\/verify|email-otp\/verify|login|register|refresh|logout)\/?$/.test(apiPath);
}

export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface ForwardResult {
  status: number;
  body: BodyInit | null;
  headers: Headers;
  cookies: CookieSpec[];
}

/**
 * A counter staff token (the `accessToken` from POST staff-pin/verify) the browser may send, for counter calls only (the grocer's counter pantry log is one),
 * so awards are attributed to the staff member who typed their PIN. Never applies to any other path.
 */
export function counterStaffToken(req: Request, apiPath: string): string | null {
  const t = req.headers.get("x-counter-staff-token");
  return t && /^\/v1\/merchants\/[0-9a-f-]{36}\/(grocery\/)?counter\//i.test(apiPath) ? t : null;
}

const PASS_REQUEST_HEADERS = ["content-type", "accept", "idempotency-key", "user-agent", "accept-language", "x-agent-session"];
const PASS_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control", "last-modified", "etag"];

/**
 * Forward one browser request to the API with the session's bearer token.
 * On 401, rotate the refresh token once, retry, and return the new cookies.
 */
export async function forwardToApi(
  req: Request,
  apiPath: string,
  jar: CookieReader,
  fetchImpl: typeof fetch = fetch,
): Promise<ForwardResult> {
  const url = new URL(req.url);
  const target = `${serverApiUrl()}${apiPath}${url.search}`;
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const baseHeaders = new Headers();
  for (const h of PASS_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) baseHeaders.set(h, v);
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) baseHeaders.set("x-forwarded-for", fwd);

  const call = (token: string | undefined) => {
    const headers = new Headers(baseHeaders);
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetchImpl(target, { method: req.method, headers, body: body && body.byteLength ? body : undefined, cache: "no-store", redirect: "manual" });
  };

  let cookies: CookieSpec[] = [];
  let res: Response;
  const staffToken = counterStaffToken(req, apiPath);
  try {
    // A PIN token that expired answers 401 and the counter asks for the PIN again; the shop's own session is not rotated for it.
    res = await call(staffToken ?? jar.get(ACCESS_COOKIE)?.value);
    const rt = jar.get(REFRESH_COOKIE)?.value;
    if (res.status === 401 && rt && !staffToken) {
      const fresh = await refreshSession(rt, fetchImpl);
      if (fresh) {
        cookies = sessionCookies(fresh);
        res = await call(fresh.accessToken);
      } else {
        cookies = clearedSessionCookies();
      }
    }
  } catch {
    return {
      status: 502,
      body: JSON.stringify({ error: { code: "network_error", message: "Can't connect right now. Check your connection and try again." } }),
      headers: new Headers({ "content-type": "application/json" }),
      cookies,
    };
  }

  const headers = new Headers();
  for (const h of PASS_RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  const payload = res.status === 204 ? null : await res.arrayBuffer();
  return { status: res.status, body: payload, headers, cookies };
}

/** Call a sign-in endpoint; on success return the public session + cookies to set. */
export async function signIn(
  apiPath: string,
  body: unknown,
  meta: { userAgent?: string | null; forwardedFor?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; json: unknown; cookies: CookieSpec[] }> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (meta.userAgent) headers["user-agent"] = meta.userAgent;
  if (meta.forwardedFor) headers["x-forwarded-for"] = meta.forwardedFor;
  let res: Response;
  try {
    res = await fetchImpl(`${serverApiUrl()}${apiPath}`, { method: "POST", headers, body: JSON.stringify(body ?? {}), cache: "no-store" });
  } catch {
    return { status: 502, json: { error: { code: "network_error", message: "Can't connect right now. Check your connection and try again." } }, cookies: [] };
  }
  const json = (await res.json().catch(() => null)) as authApi.AuthResponse | null;
  if (!res.ok || !json || !("accessToken" in json)) {
    return { status: res.status, json: json ?? { error: { code: "server_error", message: "Something went wrong on our end. Try again in a moment." } }, cookies: [] };
  }
  return { status: res.status, json: { user: json.user, created: json.created }, cookies: sessionCookies(json) };
}
