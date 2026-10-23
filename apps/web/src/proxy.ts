/**
 * Proxy (Next 16's replacement for middleware): keeps the session fresh.
 * When the access cookie is missing or about to expire and a refresh cookie
 * exists, rotate the pair before the page renders, so server components always
 * see a valid token (they can't set cookies themselves).
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessTokenStale, clearedSessionCookies, sessionCookies } from "@/lib/auth/cookies";
import { refreshSession } from "@/lib/auth/refresh";
import { normalizeLocale } from "@ll/shared";

const LANG_HEADER = "x-ll-lang";

/** Layouts can't read searchParams: hand them this request's ?lang= (pass footer, error pages). Built last so it carries any refreshed cookies. */
function forwarded(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(LANG_HEADER);
  const lang = normalizeLocale(request.nextUrl.searchParams.get("lang"));
  if (lang) headers.set(LANG_HEADER, lang);
  return { request: { headers } };
}

export async function proxy(request: NextRequest) {
  const rt = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!rt || !accessTokenStale(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next(forwarded(request));

  const fresh = await refreshSession(rt);
  const specs = fresh ? sessionCookies(fresh) : clearedSessionCookies();
  for (const c of specs) {
    if (c.value) request.cookies.set(c.name, c.value);
    else request.cookies.delete(c.name);
  }
  const res = NextResponse.next(forwarded(request));
  for (const c of specs) res.cookies.set(c);
  return res;
}

export const config = {
  // Pages only: API routes refresh on their own, static assets never need a session.
  matcher: ["/((?!api|_next/static|_next/image|brand|favicon.ico|icon|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|txt|xml)$).*)"],
};
