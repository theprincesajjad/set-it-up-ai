/**
 * The landing-page beacon (POST /v1/public/landing-events, relayed by the web app's /api/public/landing-events). First-party
 * counting for the A/B tests in packages/shared/src/experiments.ts: no IP stored (it is the rate-limit key only), no user agent
 * (reduced to phone | desktop), no referrer. Bots, crawlers and audit tools are dropped. `view` and `start_submit` are kept once
 * per anonymous id per test (unique partial index), so a refresh is not a second exposure.
 */
import { eq } from "drizzle-orm";
import { experimentEnds, landingEvents } from "@ll/db";
import {
  CONTROL_VARIANT,
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
      createdAt: ctx.now(),
    }));
  if (!rows.length) return 0;
  const written = await ctx.db.insert(landingEvents).values(rows).onConflictDoNothing().returning({ id: landingEvents.id });
  return written.length;
}

