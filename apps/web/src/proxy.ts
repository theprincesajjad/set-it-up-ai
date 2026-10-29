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
// ---- phase-solo: G ----
import { SITE_HOST_HEADER, isCustomSiteHost } from "@/lib/siteHost";
// ---- end phase-solo: G ----
// ---- landing A/B ----
import { EXPERIMENTS_CLOCK_HEADER, experimentsNow } from "@ll/shared";
import { endedExperiments } from "@/lib/marketing/experiments-state";
import { assignLanding, randomAid } from "@/lib/marketing/landing-assign";
import { variantIds } from "@/lib/marketing/landing-variants";
// ---- end landing A/B ----

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
  // ---- phase-solo: G ---- a shop's own domain: its home page is the built-in website (app/(site)/[domain]).
  const siteHost = isCustomSiteHost(request.headers.get("host"), { siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000", appHosts: process.env.SITE_APP_HOSTS, enabled: process.env.SITE_CUSTOM_HOSTS });
  if (siteHost && request.nextUrl.pathname === "/") {
    const headers = new Headers(request.headers);
    headers.set(SITE_HOST_HEADER, siteHost);
    const url = request.nextUrl.clone();
    url.pathname = `/${siteHost}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  // ---- end phase-solo: G ----
  // ---- landing A/B ---- the solo landing pages pick their variant here (lib/marketing/landing-assign.ts).
  const landing = await landingResponse(request);
  if (landing) return landing;
  // ---- end landing A/B ----
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

// ---- landing A/B ----
const LANDING_RE = /^\/for-(nail-techs|barbers|groomers)(\/|$)/;

/**
 * /for-nail-techs, /for-barbers, /for-groomers: rewrite to the prerendered variant path and write the sticky cookies (first-party,
 * no personal information). Internal variant paths fetched directly get X-Robots-Tag: noindex. Null for every other request.
 */
async function landingResponse(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (!LANDING_RE.test(pathname)) return null;
  // Test clock (e2e only): EXPERIMENTS_TEST_CLOCK=1 lets EXPERIMENTS_NOW and the x-ll-experiments-now header move the schedule.
  const now = experimentsNow(new Date(), { enabled: process.env.EXPERIMENTS_TEST_CLOCK === "1", env: process.env.EXPERIMENTS_NOW, header: request.headers.get(EXPERIMENTS_CLOCK_HEADER) });
  const a = assignLanding({
    pathname,
    search: request.nextUrl.searchParams,
    cookie: (n) => request.cookies.get(n)?.value,
    header: (n) => request.headers.get(n),
    now,
    ended: await endedExperiments(),
    variantsOf: variantIds,
    newAid: randomAid,
  });
  if (a.kind === "pass" || a.kind === "excluded") return null;
  if (a.kind === "noindex") {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  }
  const url = request.nextUrl.clone();
  url.pathname = a.pathname;
  const res = NextResponse.rewrite(url);
  // The same URL serves different HTML per visitor: a shared cache must not mix them up.
  res.headers.set("Vary", "Cookie, Sec-GPC");
  const secure = process.env.NODE_ENV === "production";
  for (const c of a.cookies) res.cookies.set({ name: c.name, value: c.value, maxAge: c.maxAge, path: "/", sameSite: "lax", secure, httpOnly: false });
  return res;
}
// ---- end landing A/B ----

export const config = {
  // Pages only: API routes refresh on their own, static assets never need a session.
  matcher: ["/((?!api|_next/static|_next/image|brand|favicon.ico|icon|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|txt|xml)$).*)"],
};
