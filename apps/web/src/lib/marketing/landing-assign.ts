/**
 * Server-side, sticky A/B assignment for the solo landing pages (ab-spec §3), run by the proxy (src/proxy.ts) on
 * /for-nail-techs, /for-barbers and /for-groomers. Every variant is prerendered at its own internal path
 * (/for-nail-techs/[trade]/[variant], /for-barbers/[variant], /for-groomers/[variant]); this picks one and the proxy rewrites to it,
 * so the visitor's URL never changes, nothing flickers and the page stays static.
 *
 * Precedence: `?v=` (an arm of the running test, or any variant of the look when no test runs) → the `ll_v` cookie (if its test
 * still runs and the variant still exists) → a draw by weight from `ll_aid` (the same id always draws the same arm) → control.
 * Excluded (control, no cookies written, no beacon): `Sec-GPC: 1`, `ll_aid=off`, or a dashboard session with a platform role.
 *
 * The nail page's look (`?trade=brows|lashes|makeup`) is decided here too for an assigned visitor; for an excluded one the
 * `beforeFiles` rewrite in next.config.ts still serves /for-nail-techs/[trade] as before.
 */
import {
  AID_OFF,
  AID_PATTERN,
  CONTROL_VARIANT,
  LANDING_COOKIES,
  LANDING_COOKIE_DAYS,
  activeExperiment,
  drawArm,
  isArm,
  isVariantId,
  parseVariantCookie,
  variantCookie,
  type ExperimentPage,
  type LandingLook,
} from "@ll/shared";

const PAGES: Record<string, ExperimentPage> = { "/for-nail-techs": "nail", "/for-barbers": "barber", "/for-groomers": "groom" };
const NAIL_LOOKS = ["brows", "lashes", "makeup"] as const;

export interface CookieWrite {
  name: string;
  value: string;
  maxAge: number;
}

export type Assignment =
  /** Not a landing page. */
  | { kind: "pass" }
  /** An internal variant path fetched directly: serve it, but tell crawlers not to index it. */
  | { kind: "noindex" }
  /** GPC, counting off or staff: the page renders control as before; nothing is written. */
  | { kind: "excluded" }
  | { kind: "rewrite"; pathname: string; variant: string; experimentId: string | null; look: LandingLook; cookies: CookieWrite[] };

export interface AssignInput {
  pathname: string;
  search: URLSearchParams;
  cookie: (name: string) => string | undefined;
  header: (name: string) => string | null;
  now: Date;
  /** Tests ended from the admin page (GET /v1/public/experiments). */
  ended: readonly string[];
  /** The variant ids each look has (landing-variants.ts `variantIds`). */
  variantsOf: (look: LandingLook) => readonly string[];
  newAid: () => string;
}

/** A platform role (admin, rep) in the access token, read without verifying: it only ever excludes the visitor from counting. */
export function platformRoleOf(token: string | undefined): string | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

/** The internal variant paths: /for-nail-techs/<look>/<variant>, /for-barbers/<variant>, /for-groomers/<variant>. */
export function isVariantPath(pathname: string): boolean {
  if (/\/opengraph-image|\./.test(pathname)) return false;
  return /^\/for-nail-techs\/[a-z]+\/[a-z0-9_-]+\/?$/.test(pathname) || /^\/for-(barbers|groomers)\/[a-z0-9_-]+\/?$/.test(pathname);
}

export function variantPath(page: ExperimentPage, look: LandingLook, variant: string): string {
  return page === "nail" ? `/for-nail-techs/${look}/${variant}` : page === "barber" ? `/for-barbers/${variant}` : `/for-groomers/${variant}`;
}

/** 16 random bytes, base64url. */
export function randomAid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function assignLanding(i: AssignInput): Assignment {
  const path = i.pathname.length > 1 ? i.pathname.replace(/\/+$/, "") : i.pathname;
  const page = PAGES[path];
  if (!page) return isVariantPath(i.pathname) ? { kind: "noindex" } : { kind: "pass" };

  const aidCookie = i.cookie(LANDING_COOKIES.aid);
  const role = platformRoleOf(i.cookie("ll_at"));
  if (i.header("sec-gpc") === "1" || aidCookie === AID_OFF || role === "admin" || role === "rep") return { kind: "excluded" };

  const trade = i.search.get("trade");
  const look: LandingLook = page === "barber" ? "barber" : page === "groom" ? "groom" : (NAIL_LOOKS as readonly string[]).includes(trade ?? "") ? (trade as LandingLook) : "nails";
  const exists = (v: string) => i.variantsOf(look).includes(v);

  const cookies: CookieWrite[] = [];
  const maxAge = LANDING_COOKIE_DAYS * 86_400;
  let aid = aidCookie && AID_PATTERN.test(aidCookie) ? aidCookie : null;
  if (!aid) {
    aid = i.newAid();
    cookies.push({ name: LANDING_COOKIES.aid, value: aid, maxAge });
  }

  // A test whose arms are not all built for this look (no copy for the variant yet) does not run on it.
  const running = activeExperiment(page, i.now, i.ended);
  const exp = running && running.arms.every((a) => exists(a.variant)) ? running : undefined;
  const q = i.search.get("v");
  const fromCookie = parseVariantCookie(i.cookie(LANDING_COOKIES.variant));
  let variant: string | null = null;

  if (isVariantId(q) && exists(q) && (exp ? isArm(exp, q) : true)) {
    // 1. An ad URL names the variant: use it and remember it.
    variant = q;
    cookies.push({ name: LANDING_COOKIES.variant, value: variantCookie(exp?.id ?? null, q), maxAge });
  } else if (fromCookie && exists(fromCookie.variant) && (exp ? fromCookie.experimentId === exp.id && isArm(exp, fromCookie.variant) : fromCookie.experimentId === null)) {
    // 2. The visitor's earlier assignment, while its test still runs (or, with no test, the variant an ad named).
    variant = fromCookie.variant;
  } else if (exp) {
    // 3. A fresh draw, from the anonymous id so a lost ll_v cookie draws the same arm again.
    variant = drawArm(exp, aid);
    cookies.push({ name: LANDING_COOKIES.variant, value: variantCookie(exp.id, variant), maxAge });
  }
  // 4. No test: control, and no ll_v.
  variant ??= CONTROL_VARIANT;
  return { kind: "rewrite", pathname: variantPath(page, look, variant), variant, experimentId: exp && isArm(exp, variant) ? exp.id : null, look, cookies };
}
