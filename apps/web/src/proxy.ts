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
import { env, isLocalUrl } from "@/lib/env";
import { CUT_LINK_HEADER, NEXT_HEADER, PATH_HEADER } from "@/components/errors/notFoundCopy";
// ---- phase-solo: G ----
import { SITE_HOST_HEADER, isCustomSiteHost } from "@/lib/siteHost";
// ---- end phase-solo: G ----
// ---- landing A/B ----
import { EXPERIMENTS_CLOCK_HEADER, experimentsNow } from "@ll/shared";
import { endedExperiments } from "@/lib/marketing/experiments-state";
import { assignLanding, homeAidCookie, randomAid } from "@/lib/marketing/landing-assign";
import { variantIds } from "@/lib/marketing/landing-variants";
// ---- end landing A/B ----

const LANG_HEADER = "x-ll-lang";

/** Layouts can't read searchParams: hand them this request's ?lang= (pass footer, error pages). Built last so it carries any refreshed cookies. */
function forwarded(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(LANG_HEADER);
  // The path asked for, so a 404 can say "that shop" or "this link" (components/errors/notFoundCopy.ts).
  headers.set(PATH_HEADER, request.nextUrl.pathname);
  // Path plus query, for /login?next= after a sign-in is needed (lib/auth/session.ts currentPath).
  headers.set(NEXT_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  const lang = normalizeLocale(request.nextUrl.searchParams.get("lang"));
  if (lang) headers.set(LANG_HEADER, lang);
  return { request: { headers } };
}

/** A path with a broken percent-escape ("%E0%A4%A": a link cut off by a text message, a QR scanner or a chat app) cannot be decoded by the router. */
function hasBrokenEscape(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  // A cut-off link would be a bare "Internal Server Error" from the router. Answer with the 404 page instead: "That link looks cut off".
  if (hasBrokenEscape(request.nextUrl.pathname)) {
    const headers = new Headers(request.headers);
    headers.set(CUT_LINK_HEADER, "1");
    headers.set(PATH_HEADER, "/link-cut");
    const url = request.nextUrl.clone();
    url.pathname = "/link-cut";
    url.search = "";
    return NextResponse.rewrite(url, { request: { headers } });
  }
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
  // ---- wave N: admin funnel ---- a first, signed-out visit to "/" gets the landing id (no A/B test runs on the home page).
  const homeAid = homeAidCookie({ pathname: request.nextUrl.pathname, cookie: (n) => request.cookies.get(n)?.value, header: (n) => request.headers.get(n), newAid: randomAid });
  if (homeAid) {
    const res = NextResponse.next(forwarded(request));
    res.cookies.set({ name: homeAid.name, value: homeAid.value, maxAge: homeAid.maxAge, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", httpOnly: false });
    return res;
  }
  // ---- end wave N: admin funnel ----
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
  const now = experimentsNow(new Date(), { enabled: process.env.EXPERIMENTS_TEST_CLOCK === "1" && (process.env.NODE_ENV !== "production" || isLocalUrl(env.apiUrl)), env: process.env.EXPERIMENTS_NOW, header: request.headers.get(EXPERIMENTS_CLOCK_HEADER) });
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
  matcher: ["/((?!api|_next/static|_next/image|brand|favicon.ico|icon|apple-icon|og/|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|txt|xml)$).*)"],
};
