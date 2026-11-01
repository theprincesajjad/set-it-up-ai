/**
 * The landing-page beacon (POST /v1/public/landing-events, relayed by the web app's /api/public/landing-events). First-party
 * counting for the A/B tests in packages/shared/src/experiments.ts: no IP stored (it is the rate-limit key only), no user agent
 * (reduced to phone | desktop), no referrer. Bots, crawlers and audit tools are dropped. `view` and `start_submit` are kept once
 * per anonymous id per test (unique partial index), so a refresh is not a second exposure.
 */
import { and, asc, eq } from "drizzle-orm";
import { experimentEnds, landingEvents, type DbOrTx } from "@ll/db";
import {
  CONTROL_VARIANT,
  LANDING_EVENT_KINDS,
  LANDING_LOOKS,
  experimentById,
  experimentsApi,
  experimentsNow,
  isArm,
  isRunning,
  pageOfLook,
  parseVariantCookie,
  type ExperimentPage,
  type LandingLook,
} from "@ll/shared";
import type { AppContext } from "../context.js";

/** Crawlers, link previews, headless browsers and audit tools. A missing user agent counts as a bot. */
const BOT = /bot|crawl|spider|slurp|preview|fetch|scan|monitor|lighthouse|pagespeed|headless|phantom|puppeteer|selenium|playwright\/|python|curl|wget|httpclient|okhttp|java\/|go-http|axios|node-fetch|facebookexternalhit|embedly|quora|whatsapp|telegram|discord|skype/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || ua.length < 20 || BOT.test(ua);
}

/** The only thing kept from the user agent. */
export function deviceClass(ua: string | null | undefined): "phone" | "desktop" {
  return ua && /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "phone" : "desktop";
}

const PAGE_BY_PATH: Record<string, ExperimentPage> = { "/for-nail-techs": "nail", "/for-barbers": "barber", "/for-groomers": "groom" };
/** The home page is counted too (wave N, admin funnel); it never runs an A/B test, so it has no ExperimentPage. */
export const HOME_PAGE = "home";
/** Stored page id → the public path the founder reads. */
export const PATH_BY_PAGE: Record<string, string> = { nail: "/for-nail-techs", barber: "/for-barbers", groom: "/for-groomers", [HOME_PAGE]: "/" };
const SRC = /^[A-Za-z0-9_.-]{1,40}$/;

/** The schedule clock: real time, or the test clock outside production (config.experiments). */
export function experimentClock(ctx: AppContext, header?: string | string[] | null): Date {
  const h = Array.isArray(header) ? header[0] : header;
  return experimentsNow(ctx.now(), { enabled: ctx.config.experiments.testClock, env: ctx.config.experiments.now, header: h });
}

export async function endedExperimentIds(ctx: AppContext): Promise<string[]> {
  return (await ctx.db.select({ id: experimentEnds.experimentId }).from(experimentEnds)).map((r) => r.id);
}

export interface BeaconMeta {
  userAgent: string | null;
  clockHeader?: string | string[] | null;
}

/** Store what the body carries; returns how many rows were written (0 for a bot, an unknown page or only unknown kinds). */
export async function recordLandingEvents(ctx: AppContext, body: experimentsApi.LandingEventsBody, meta: BeaconMeta): Promise<number> {
  if (isBot(meta.userAgent)) return 0;
  const path = body.p.replace(/\/+$/, "") || "/";
  if (path === "/signup") return recordSignupStart(ctx, body, meta);
  if (path === "/") return recordHome(ctx, body, meta);
  const page = PAGE_BY_PATH[path];
  if (!page) return 0;
  const look = (LANDING_LOOKS as readonly string[]).includes(body.tr ?? "") ? (body.tr as LandingLook) : page === "nail" ? "nails" : page;
  if (pageOfLook(look) !== page) return 0;

  // The test this visitor is in: only while it runs on this page, and only for one of its arms.
  const now = experimentClock(ctx, meta.clockHeader);
  const cookie = parseVariantCookie(body.v);
  let experimentId: string | null = null;
  let variant = cookie?.variant ?? body.rv ?? CONTROL_VARIANT;
  if (cookie?.experimentId) {
    const exp = experimentById(cookie.experimentId);
    const ended = exp ? (await ctx.db.select({ id: experimentEnds.experimentId }).from(experimentEnds).where(eq(experimentEnds.experimentId, exp.id))).map((r) => r.id) : [];
    if (exp && exp.pages.includes(page) && isRunning(exp, now, ended) && isArm(exp, cookie.variant)) experimentId = exp.id;
    else variant = body.rv ?? CONTROL_VARIANT;
  }

  let rawSrc = body.src ?? null;
  if (!rawSrc && body.q) {
    try {
      rawSrc = new URLSearchParams(body.q).get("src");
    } catch {
      rawSrc = null;
    }
  }
  const utm = utmOf(body.q);
  rawSrc ??= utm.utmSource;
  const src = rawSrc && SRC.test(rawSrc) ? rawSrc.toLowerCase() : null;
  const device = deviceClass(meta.userAgent);
  const seen = new Set<string>();
  const rows = body.ev
    .filter((e) => experimentsApi.KNOWN_KINDS.includes(e.k))
    .filter((e) => (seen.has(e.k) ? false : (seen.add(e.k), true)))
    .map((e) => ({
      anonId: body.aid,
      experimentId,
      variant,
      page,
      trade: look,
      src,
      kind: e.k,
      data: e.k === "cta_click" && e.d && /^[a-z]{1,10}$/.test(e.d) ? e.d : null,
      device,
      ...utm,
      createdAt: ctx.now(),
    }));
  if (!rows.length) return 0;
  const written = await ctx.db.insert(landingEvents).values(rows).onConflictDoNothing().returning({ id: landingEvents.id });
  return written.length;
}


// ---------------------------------------------------------------------------
// Wave N (admin funnel): UTM, the home page and the signup wizard's start
// ---------------------------------------------------------------------------
const clean = (v: string | null | undefined) => (v && SRC.test(v) ? v.toLowerCase() : null);

/** utm_source, utm_medium and utm_campaign from location.search (same character rules as src; anything else is dropped). */
export function utmOf(q: string | null | undefined): { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null } {
  if (!q) return { utmSource: null, utmMedium: null, utmCampaign: null };
  try {
    const p = new URLSearchParams(q);
    return { utmSource: clean(p.get("utm_source")), utmMedium: clean(p.get("utm_medium")), utmCampaign: clean(p.get("utm_campaign")) };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

function srcOf(body: experimentsApi.LandingEventsBody, utmSource: string | null): string | null {
  let raw = body.src ?? null;
  if (!raw && body.q) {
    try {
      raw = new URLSearchParams(body.q).get("src");
    } catch {
      raw = null;
    }
  }
  return clean(raw ?? utmSource);
}

/** "/": no test runs there, so every row is control with no experiment; CTAs are the page's data-cta ids. */
async function recordHome(ctx: AppContext, body: experimentsApi.LandingEventsBody, meta: BeaconMeta): Promise<number> {
  const utm = utmOf(body.q);
  const src = srcOf(body, utm.utmSource);
  const device = deviceClass(meta.userAgent);
  const seen = new Set<string>();
  const rows = body.ev
    .filter((e) => (LANDING_EVENT_KINDS as readonly string[]).includes(e.k))
    .filter((e) => (seen.has(e.k) ? false : (seen.add(e.k), true)))
    .map((e) => ({ anonId: body.aid, experimentId: null, variant: CONTROL_VARIANT, page: HOME_PAGE, trade: HOME_PAGE, src, kind: e.k, data: e.k === "cta_click" && e.d && /^[a-z]{1,10}$/.test(e.d) ? e.d : null, device, ...utm, createdAt: ctx.now() }));
  if (!rows.length) return 0;
  // The once-per-visitor index does not cover a null experiment, so a refresh is skipped here instead.
  const once = rows.filter((r) => r.kind === "view");
  if (once.length) {
    const [prior] = await ctx.db.select({ id: landingEvents.id }).from(landingEvents).where(and(eq(landingEvents.anonId, body.aid), eq(landingEvents.page, HOME_PAGE), eq(landingEvents.kind, "view"))).limit(1);
    if (prior) rows.splice(rows.indexOf(once[0]!), 1);
  }
  if (!rows.length) return 0;
  return (await ctx.db.insert(landingEvents).values(rows).onConflictDoNothing().returning({ id: landingEvents.id })).length;
}

/**
 * The signup wizard opened by a counted visitor: one `signup_start` per anonymous id, filed under the page, variant, source and
 * device of that visitor's first landing view (so the funnel can say which page started the signup). No view: nothing is stored.
 */
async function recordSignupStart(ctx: AppContext, body: experimentsApi.LandingEventsBody, _meta: BeaconMeta): Promise<number> {
  if (!body.ev.some((e) => e.k === experimentsApi.SIGNUP_START_KIND)) return 0;
  const [view] = await ctx.db.select().from(landingEvents).where(and(eq(landingEvents.anonId, body.aid), eq(landingEvents.kind, "view"))).orderBy(asc(landingEvents.createdAt)).limit(1);
  if (!view) return 0;
  const [prior] = await ctx.db.select({ id: landingEvents.id }).from(landingEvents).where(and(eq(landingEvents.anonId, body.aid), eq(landingEvents.kind, experimentsApi.SIGNUP_START_KIND))).limit(1);
  if (prior) return 0;
  const { id: _id, createdAt: _c, data: _d, kind: _k, ...rest } = view;
  await ctx.db.insert(landingEvents).values({ ...rest, kind: experimentsApi.SIGNUP_START_KIND, data: null, createdAt: ctx.now() });
  return 1;
}

/**
 * The landing attribution stored on a new shop: the anonymous id's first view (page path, variant, test, src, UTM, device).
 * Only called with an anonId the signup carried, which the wizard sends only without GPC and with counting on. With no matching
 * view, the signup's own src / variant are kept.
 */
export async function signupAttribution(
  db: DbOrTx,
  b: { anonId?: string; variant?: string; experimentId?: string; source?: string },
): Promise<Partial<Record<"signupAnonId" | "signupPage" | "signupVariant" | "signupExperimentId" | "signupSrc" | "signupUtmSource" | "signupUtmMedium" | "signupUtmCampaign" | "signupDevice", string | null>>> {
  if (!b.anonId && !b.variant && !b.source) return {};
  const [view] = b.anonId ? await db.select().from(landingEvents).where(and(eq(landingEvents.anonId, b.anonId), eq(landingEvents.kind, "view"))).orderBy(asc(landingEvents.createdAt)).limit(1) : [];
  return {
    signupAnonId: b.anonId ?? null,
    signupPage: view ? (PATH_BY_PAGE[view.page] ?? null) : null,
    signupVariant: b.variant ?? view?.variant ?? null,
    signupExperimentId: b.experimentId ?? view?.experimentId ?? null,
    signupSrc: clean(b.source) ?? view?.src ?? null,
    signupUtmSource: view?.utmSource ?? null,
    signupUtmMedium: view?.utmMedium ?? null,
    signupUtmCampaign: view?.utmCampaign ?? null,
    signupDevice: view?.device ?? null,
  };
}
