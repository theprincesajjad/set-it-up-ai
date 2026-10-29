/**
 * Landing-page A/B tests (packages/shared/src/experiments.ts; ab-spec §4–5): the beacon (validation, bots, dedupe, rate limit, no
 * IP stored), the variant carried into the signed_up milestone and joined to booking_link_live, the admin report (Wilson intervals,
 * the z-test against known values, p-values only while a pre-registered look is open), the three admin writes and retention.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, landingEvents, merchantMilestones, subscriptions } from "@ll/db";
import { RETENTION, experimentById } from "@ll/shared";
import { LANDING_EVENTS_PER_MINUTE } from "../src/routes/public/landing.js";
import { alphaFor, lookFor, normalCdf, twoProportionZ, wilson } from "../src/services/admin-experiments.js";
import { deviceClass, isBot } from "../src/services/landing-events.js";
import { purgeLandingEvents } from "../src/services/retention.js";
import { call } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const AID = "AbCdEfGhIjKlMnOpQrStUv";
const aid = (i: number) => `aid${String(i).padStart(19, "0")}`;

let env: TestEnv;
beforeEach(async () => {
  // T1 starts 2026-11-02; the default test clock (2026-11-03) is inside it.
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

function beacon(body: unknown, opts: { ua?: string | null; ip?: string; contentType?: string } = {}) {
  const headers: Record<string, string> = { "content-type": opts.contentType ?? "application/json" };
  if (opts.ua !== null) headers["user-agent"] = opts.ua ?? PHONE_UA;
  return env.app.inject({ method: "POST", url: "/v1/public/landing-events", headers, remoteAddress: opts.ip ?? "203.0.113.7", payload: typeof body === "string" ? body : JSON.stringify(body) });
}

const visit = (extra: Record<string, unknown> = {}) => ({
  aid: AID,
  v: "t1-nails-lead:yours",
  rv: "yours",
  p: "/for-nail-techs",
  tr: "lashes",
  src: "ad-3",
  ev: [{ k: "view", t: 1 }, { k: "scroll_90", t: 2 }, { k: "cta_click", t: 3, d: "hero" }, { k: "start_submit", t: 4 }],
  ...extra,
});

const rows = () => env.db.select().from(landingEvents);

async function admin() {
  const u = await createUser(env.db, { platformRole: "admin", email: `admin${Math.random().toString(36).slice(2)}@example.com` });
  return { user: u, token: await tokenFor(env, u) };
}

/** Bulk exposures (and submits) straight into the table. */
async function seedViews(experimentId: string, variant: string, n: number, submits = 0, from = 0) {
  const values = [];
  for (let i = 0; i < n; i++) {
    const anonId = aid(from + i);
    values.push({ anonId, experimentId, variant, page: "nail", trade: "nails", kind: "view", device: "phone", src: i % 2 ? "ad-1" : null });
    if (i < submits) values.push({ anonId, experimentId, variant, page: "nail", trade: "nails", kind: "start_submit", device: "phone", src: i % 2 ? "ad-1" : null });
  }
  for (let i = 0; i < values.length; i += 500) await env.db.insert(landingEvents).values(values.slice(i, i + 500));
}

async function signup(payload: Record<string, unknown>) {
  const owner = await createUser(env.db, { email: `o${Math.random().toString(36).slice(2)}@example.com` });
  const token = await tokenFor(env, owner);
  const res = await call(env, token, "POST", "/v1/merchants", { name: "Nails by Mo", vertical: "nails", workSetting: "home", postalCode: "m6s2k1", phone: "(416) 555-0134", source: "nail-techs", ...payload });
  expect(res.status).toBe(201);
  return res.body.merchant.id as string;
}

describe("statistics (known values)", () => {
  it("normal CDF", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normalCdf(-1)).toBeCloseTo(0.1586553, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
  });
  it("Wilson 95% interval", () => {
    const a = wilson(10, 100);
    expect(a.p).toBe(0.1);
    expect(a.lo).toBeCloseTo(0.0552291, 6);
    expect(a.hi).toBeCloseTo(0.1743657, 6);
    const b = wilson(22, 440);
    expect(b.lo).toBeCloseTo(0.0332481, 6);
    expect(b.hi).toBeCloseTo(0.0745414, 6);
    const zero = wilson(0, 50);
    expect(zero.lo).toBeCloseTo(0, 9);
    expect(zero.hi).toBeCloseTo(0.0713476, 6);
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 1 });
  });
  it("two-proportion z-test, two-sided", () => {
    const a = twoProportionZ(44, 440, 22, 440);
    expect(a.z).toBeCloseTo(2.8156576, 6);
    expect(a.pValue).toBeCloseTo(0.0048678, 6);
    expect(twoProportionZ(30, 220, 15, 220).pValue).toBeCloseTo(0.0182747, 6);
    expect(twoProportionZ(12, 220, 11, 220).pValue).toBeCloseTo(0.8304007, 5);
    expect(twoProportionZ(0, 10, 0, 10).pValue).toBe(1);
  });
  it("opens the interim at 50% of the horizon until it is recorded, and the final at the horizon", () => {
    const exp = experimentById("t1-nails-lead")!;
    expect(lookFor(exp, 439, false)).toBe("none");
    expect(lookFor(exp, 440, false)).toBe("interim");
    expect(lookFor(exp, 700, true)).toBe("none");
    expect(lookFor(exp, 880, true)).toBe("final");
    expect([alphaFor(exp, "interim"), alphaFor(exp, "final"), alphaFor(exp, "none")]).toEqual([0.01, 0.045, null]);
  });
});

describe("POST /v1/public/landing-events", () => {
  it("a view, a scroll past 90%, a hero click and a start submit make exactly four rows; a refresh adds no view or submit", async () => {
    expect((await beacon(visit())).statusCode).toBe(204);
    const r = await rows();
    expect(r).toHaveLength(4);
    expect(r.map((x) => x.kind).sort()).toEqual(["cta_click", "scroll_90", "start_submit", "view"]);
    for (const x of r) expect(x).toMatchObject({ anonId: AID, experimentId: "t1-nails-lead", variant: "yours", page: "nail", trade: "lashes", src: "ad-3", device: "phone" });
    expect(r.find((x) => x.kind === "cta_click")!.data).toBe("hero");
    // Nothing that identifies the device or the network is stored.
    expect(Object.keys(r[0]!).sort()).toEqual(["anonId", "createdAt", "data", "device", "experimentId", "id", "kind", "page", "src", "trade", "variant"]);

    await beacon(visit({ ev: [{ k: "view" }, { k: "start_submit" }] }));
    expect(await rows()).toHaveLength(4);
  });

  it("drops unknown kinds, bots and pages that are not landing pages; reads the device class only", async () => {
    expect((await beacon(visit({ ev: [{ k: "mouse_move" }, { k: "view" }] }))).statusCode).toBe(204);
    expect((await rows()).map((x) => x.kind)).toEqual(["view"]);
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0 Safari/537.36", "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse", "curl/8.4.0", null]) {
      expect((await beacon(visit({ aid: "BotBotBotBotBotBotBot0" }), { ua })).statusCode).toBe(204);
    }
    expect((await beacon(visit({ aid: "OtherPageOtherPage0000", p: "/pricing" }))).statusCode).toBe(204);
    expect(await rows()).toHaveLength(1);
    expect(isBot(PHONE_UA)).toBe(false);
    expect([deviceClass(PHONE_UA), deviceClass(DESKTOP_UA)]).toEqual(["phone", "desktop"]);
    await beacon(visit({ aid: "DesktopDesktopDesktop0", ev: [{ k: "view" }] }), { ua: DESKTOP_UA });
    expect((await rows()).find((x) => x.anonId === "DesktopDesktopDesktop0")!.device).toBe("desktop");
  });

  it("refuses a bad id, too many events and a body over 2 KB; accepts text/plain JSON (sendBeacon)", async () => {
    expect((await beacon(visit({ aid: "short" }))).statusCode).toBe(400);
    expect((await beacon(visit({ ev: Array.from({ length: 11 }, () => ({ k: "view" })) }))).statusCode).toBe(400);
    expect((await beacon(visit({ pad: "x".repeat(2100) }))).statusCode).toBe(413);
    // What the page's inline script sends: text/plain JSON, one event, the query string instead of src.
    const page = { aid: AID, v: "t1-nails-lead%3Ayours", p: "/for-nail-techs", q: "?trade=lashes&src=ad-3", tr: "lashes", ev: [{ k: "view" }] };
    expect((await beacon(JSON.stringify(page), { contentType: "text/plain;charset=UTF-8" })).statusCode).toBe(204);
    expect(await rows()).toEqual([expect.objectContaining({ kind: "view", experimentId: "t1-nails-lead", variant: "yours", src: "ad-3", trade: "lashes" })]);
  });

  it("records the test only while it runs on that page and for one of its arms", async () => {
    // Wrong page for the cookie's test, then an arm the test does not have: counted under the rendered variant, no test.
    await beacon(visit({ aid: "WrongPageWrongPage0000", v: "t1-barber-lead:price", rv: "control", ev: [{ k: "view" }] }));
    await beacon(visit({ aid: "NotAnArmNotAnArm000000", v: "t1-nails-lead:private", rv: "control", ev: [{ k: "view" }] }));
    // Before the start date.
    env.clock.now = new Date("2026-10-30T12:00:00Z");
    await beacon(visit({ aid: "TooEarlyTooEarly000000", ev: [{ k: "view" }] }));
    const r = await rows();
    expect(r.map((x) => [x.anonId, x.experimentId, x.variant])).toEqual([
      ["WrongPageWrongPage0000", null, "control"],
      ["NotAnArmNotAnArm000000", null, "control"],
      ["TooEarlyTooEarly000000", null, "yours"],
    ]);
  });

  it("is rate-limited to 60 a minute per IP (the IP is the limiter's key only)", async () => {
    for (let i = 0; i < LANDING_EVENTS_PER_MINUTE; i++) expect((await beacon(visit({ ev: [{ k: "scroll_50" }] }))).statusCode).toBe(204);
    const over = await beacon(visit({ ev: [{ k: "scroll_50" }] }));
    expect(over.statusCode).toBe(429);
    expect((await beacon(visit({ ev: [{ k: "scroll_50" }] }), { ip: "198.51.100.9" })).statusCode).toBe(204);
    env.clock.now = new Date(env.clock.now.getTime() + 61_000);
    expect((await beacon(visit({ ev: [{ k: "scroll_50" }] }))).statusCode).toBe(204);
  });

  it("raw rows go after 90 days", async () => {
    await beacon(visit({ ev: [{ k: "view" }] }));
    env.clock.now = new Date(env.clock.now.getTime() + (RETENTION.landingEventDays - 1) * 86_400_000);
    expect(await purgeLandingEvents(env.ctx)).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * 86_400_000);
    expect(await purgeLandingEvents(env.ctx)).toBe(1);
    expect(await rows()).toHaveLength(0);
  });
});

describe("signup carries the variant; the report joins it to link live", () => {
  it("writes variant, experimentId and anonId into signed_up, and counts link live within 7 days", async () => {
    await beacon(visit());
    const id = await signup({ variant: "yours", experimentId: "t1-nails-lead", anonId: AID });
    const [ms] = await env.db.select().from(merchantMilestones).where(and(eq(merchantMilestones.merchantId, id), eq(merchantMilestones.key, "signed_up")));
    expect(ms!.data).toEqual({ source: "nail-techs", workSetting: "home", variant: "yours", experimentId: "t1-nails-lead", anonId: AID });

    // A variant that is not an arm keeps the variant and drops the test; a signup with no view row is "unmatched".
    const stray = await signup({ variant: "private", experimentId: "t1-nails-lead", anonId: "StrayStrayStrayStray00" });
    const [s2] = await env.db.select().from(merchantMilestones).where(and(eq(merchantMilestones.merchantId, stray), eq(merchantMilestones.key, "signed_up")));
    expect(s2!.data).toEqual({ source: "nail-techs", workSetting: "home", variant: "private", anonId: "StrayStrayStrayStray00" });
    const unmatched = await signup({ variant: "yours", experimentId: "t1-nails-lead", anonId: "NoViewNoViewNoView0000" });
    expect((await call(env, (await tokenFor(env, await createUser(env.db))), "POST", "/v1/merchants", { name: "X shop", vertical: "nails", workSetting: "home", postalCode: "m6s2k1", phone: "(416) 555-0135", anonId: "bad" })).status).toBe(400);

    // Link live on day 2 for the first; on day 9 for the unmatched one (too late); a Pro subscription inside 30 days.
    const day = (n: number) => new Date(env.clock.now.getTime() + n * 86_400_000);
    await env.db.insert(merchantMilestones).values([
      { merchantId: id, key: "booking_link_live", reachedAt: day(2) },
      { merchantId: id, key: "first_online_booking", reachedAt: day(4) },
      { merchantId: unmatched, key: "booking_link_live", reachedAt: day(9) },
    ]);
    await env.db.insert(subscriptions).values({ merchantId: id, plan: "plus", status: "active", createdAt: day(20) });

    const { token } = await admin();
    const res = await call(env, token, "GET", "/v1/admin/experiments/t1-nails-lead");
    expect(res.status).toBe(200);
    const yours = res.body.arms.find((a: { variant: string }) => a.variant === "yours");
    expect(yours).toMatchObject({ exposures: 1, startSubmits: 1, signedUp: 2, linkLive: 1, firstBooking7d: 1, paid30d: 1, unmatchedSignups: 1 });
    expect(yours.rates.startSubmit).toMatchObject({ p: 1 });
    expect(res.body.byTrade).toEqual([{ trade: "lashes", variant: "yours", exposures: 1, startSubmits: 1, linkLive: 1 }]);
    expect(res.body.bySrc).toEqual([{ src: "ad-3", variant: "yours", exposures: 1, startSubmits: 1, linkLive: 1 }]);
    expect(res.body.look).toBe("none");
    expect(JSON.stringify(res.body)).not.toContain('"lift"');
  });
});

describe("/admin/experiments", () => {
  it("is admin only", async () => {
    const rep = await createUser(env.db, { platformRole: "rep" });
    expect((await call(env, await tokenFor(env, rep), "GET", "/v1/admin/experiments")).status).toBe(403);
    expect((await call(env, null, "GET", "/v1/admin/experiments")).status).toBe(401);
    const { token } = await admin();
    const list = await call(env, token, "GET", "/v1/admin/experiments");
    expect(list.body.items.map((i: { experiment: { id: string }; status: string }) => [i.experiment.id, i.status])).toEqual([
      ["t1-nails-lead", "running"],
      ["t1-barber-lead", "running"],
    ]);
    expect((await call(env, token, "GET", "/v1/admin/experiments/nope")).status).toBe(404);
  });

  it("sends no p-value before the interim, opens it at 440 with α = 0.01, hides it again once recorded, and opens the final at 880", async () => {
    const { token, user } = await admin();
    const report = () => call(env, token, "GET", "/v1/admin/experiments/t1-nails-lead");
    await seedViews("t1-nails-lead", "control", 220, 11, 0);
    await seedViews("t1-nails-lead", "yours", 219, 30, 1000);
    let r = await report();
    expect(r.body).toMatchObject({ exposures: 439, look: "none", alpha: null, status: "running" });
    expect(JSON.stringify(r.body)).not.toContain('"lift"');
    expect((await call(env, token, "POST", "/v1/admin/experiments/t1-nails-lead/looks", { look: "interim" })).status).toBe(409);

    await seedViews("t1-nails-lead", "yours", 1, 0, 2000);
    r = await report();
    expect(r.body).toMatchObject({ exposures: 440, horizonPct: 50, look: "interim", alpha: 0.01, status: "interim" });
    const control = r.body.arms.find((a: { variant: string }) => a.variant === "control");
    const yours = r.body.arms.find((a: { variant: string }) => a.variant === "yours");
    expect(control.lift).toBeUndefined();
    expect(yours.lift.startSubmit.pValue).toBeCloseTo(twoProportionZ(30, 220, 11, 220).pValue, 9);
    expect(yours.lift.startSubmit.relative).toBeCloseTo((30 / 220 - 11 / 220) / (11 / 220), 9);
    expect(yours.lift.startSubmit.verdict).toBe("unlikely_chance");
    expect(yours.lift.linkLive).toMatchObject({ relative: null, pValue: 1, verdict: "chance" });

    const taken = await call(env, token, "POST", "/v1/admin/experiments/t1-nails-lead/looks", { look: "interim" });
    expect(taken.status).toBe(200);
    expect(taken.body).toMatchObject({ look: "none", alpha: null });
    expect(taken.body.interimTakenAt).toBeTruthy();
    expect(JSON.stringify(taken.body)).not.toContain('"lift"');
    expect((await call(env, token, "POST", "/v1/admin/experiments/t1-nails-lead/looks", { look: "interim" })).status).toBe(409);
    const [audit] = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "experiment.look"));
    expect(audit).toMatchObject({ actorUserId: user.id, entity: "experiment", entityId: "t1-nails-lead" });

    await seedViews("t1-nails-lead", "control", 220, 0, 3000);
    await seedViews("t1-nails-lead", "yours", 219, 0, 4000);
    expect((await report()).body).toMatchObject({ exposures: 879, look: "none" });
    await seedViews("t1-nails-lead", "control", 1, 0, 5000);
    r = await report();
    expect(r.body).toMatchObject({ exposures: 880, look: "final", alpha: 0.045, status: "horizon" });
    expect(r.body.arms.find((a: { variant: string }) => a.variant === "yours").lift.startSubmit.verdict).toBe("unlikely_chance");
  });

  it("guardrails: two weekly costs over the bar make an arm red, one is a warning; only arms are accepted", async () => {
    const { token } = await admin();
    const url = "/v1/admin/experiments/t1-barber-lead/guardrails";
    expect((await call(env, token, "POST", url, { variant: "yours", costPerSignupCents: 5000 })).status).toBe(400);
    let r = await call(env, token, "POST", url, { variant: "price", costPerSignupCents: 9500 });
    expect(r.body.arms.find((a: { variant: string }) => a.variant === "price").guardrails).toMatchObject({ costPerSignupCents: 9500, status: "watch" });
    env.clock.now = new Date(env.clock.now.getTime() + 7 * 86_400_000);
    r = await call(env, (await admin()).token, "POST", url, { variant: "price", costPerSignupCents: 9100 });
    expect(r.body.arms.find((a: { variant: string }) => a.variant === "price").guardrails).toMatchObject({ costPerSignupCents: 9100, status: "red", lighthouse: null });
    expect(r.body.arms.find((a: { variant: string }) => a.variant === "control").guardrails.status).toBe("ok");
  });

  it("End experiment needs a reason, is audited, stops new exposures and is listed for the web proxy", async () => {
    const { token } = await admin();
    const url = "/v1/admin/experiments/t1-nails-lead/end";
    expect((await call(env, token, "POST", url, {})).status).toBe(400);
    const r = await call(env, token, "POST", url, { reason: "Guardrail: cost per signup over $90 two weeks running" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "ended", ended: { reason: "Guardrail: cost per signup over $90 two weeks running" } });
    expect((await call(env, token, "POST", url, { reason: "again" })).status).toBe(409);
    expect((await call(env, null, "GET", "/v1/public/experiments")).body).toEqual({ ended: ["t1-nails-lead"] });
    const [audit] = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "experiment.end"));
    expect(audit!.data).toEqual({ reason: "Guardrail: cost per signup over $90 two weeks running" });
    await beacon(visit({ ev: [{ k: "view" }] }));
    expect((await rows())[0]).toMatchObject({ experimentId: null, variant: "yours" });
  });
});
