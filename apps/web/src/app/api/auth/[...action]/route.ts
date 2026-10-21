/**
 * Session route handlers. The browser posts credentials here; we call the API,
 * keep the tokens in httpOnly cookies and return only the user.
 *
 *   POST /api/auth/otp/verify        { phone, code, name? }
 *   POST /api/auth/email-otp/verify  { email, code, name? }
 *   POST /api/auth/login             { email, password }
 *   POST /api/auth/register          { email, password, name }
 *   POST /api/auth/logout
 *   GET  /api/auth/session           → { user | null }
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedSessionCookies, type CookieSpec } from "@/lib/auth/cookies";
import { SIGN_IN_ACTIONS, signIn } from "@/lib/auth/handlers";
import { serverApiUrl } from "@/lib/env";

type Ctx = { params: Promise<{ action: string[] }> };

function withCookies(res: NextResponse, specs: CookieSpec[]) {
  for (const c of specs) res.cookies.set(c);
  return res;
}

export async function POST(req: Request, ctx: Ctx) {
  const action = (await ctx.params).action.join("/");
  if (action === "logout") {
    const jar = await cookies();
    const rt = jar.get(REFRESH_COOKIE)?.value;
    if (rt) {
      await fetch(`${serverApiUrl()}/v1/auth/logout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
        cache: "no-store",
      }).catch(() => undefined);
    }
    return withCookies(NextResponse.json({ ok: true }), clearedSessionCookies());
  }
  const apiPath = SIGN_IN_ACTIONS[action];
  if (!apiPath) return NextResponse.json({ error: { code: "not_found", message: "Unknown auth action" } }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const r = await signIn(apiPath, body, { userAgent: req.headers.get("user-agent"), forwardedFor: req.headers.get("x-forwarded-for") });
  return withCookies(NextResponse.json(r.json, { status: r.status, headers: { "cache-control": "no-store" } }), r.cookies);
}

export async function GET(_req: Request, ctx: Ctx) {
  const action = (await ctx.params).action.join("/");
  if (action !== "session") return NextResponse.json({ error: { code: "not_found", message: "Unknown auth action" } }, { status: 404 });
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null }, { headers: { "cache-control": "no-store" } });
  try {
    const res = await fetch(`${serverApiUrl()}/v1/auth/me`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ user: null }, { headers: { "cache-control": "no-store" } });
    const me = await res.json();
    return NextResponse.json({ user: me.user, merchants: me.merchants }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ user: null }, { headers: { "cache-control": "no-store" } });
  }
}
