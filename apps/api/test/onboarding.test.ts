import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantMilestones, merchants } from "@ll/db";
import { VERTICAL_TEMPLATES } from "@ll/shared";
import { awardPurchase } from "../src/services/ledger.js";
import { backfillMilestones, getOnboardingChecklist, milestonesFor, runOnboardingNudges } from "../src/services/onboarding.js";
import { createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 25 });
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const DAY = 86_400_000;

const owners = new Map<string, Awaited<ReturnType<typeof createUser>>>();
async function signup(vertical = "cafe", name = "Sunrise Bakery") {
  const owner = await createUser(env.db, { email: `o${Math.random().toString(36).slice(2)}@example.com` });
  const token = await tokenFor(env, owner);
  const res = await env.app.inject({ method: "POST", url: "/v1/merchants", headers: auth(token), payload: { name, vertical, address: "2210 Danforth Ave", phone: "(416) 555-0134" } });
  expect(res.statusCode).toBe(201);
  owners.set(res.json().merchant.id, owner);
  return { owner, token, id: res.json().merchant.id as string };
}
const stamp = (merchantId: string, n = 1) => Promise.all(Array.from({ length: n }, () => awardPurchase(env.ctx, { merchantId, phone: nextPhone(), source: "staff_app" })));
/** Re-mints the owner token on every call: tests move the clock past the access-token lifetime. */
const checklist = async (id: string, _token?: string) => (await env.app.inject({ method: "GET", url: `/v1/merchants/${id}/onboarding`, headers: auth(await tokenFor(env, owners.get(id)!)) })).json();

describe("new verticals", () => {
  it("South Asian restaurant and tiffin kitchen get their own program on signup", async () => {
    const r = await signup("restaurant_south_asian", "Sarson Dhaba");
    const t = await signup("tiffin", "Shree Tiffin");
    const c1 = await checklist(r.id, r.token);
    expect(c1.playbook.key).toBe("desi");
    expect(c1.playbook.scriptLanguages).toEqual(["ur", "hi", "pa"]);
    const c2 = await checklist(t.id, t.token);
    expect(c2.playbook.key).toBe("tiffin");
    expect(VERTICAL_TEMPLATES.tiffin.earnType).toBe("stamps");
    expect(VERTICAL_TEMPLATES.restaurant_south_asian.rewards[0]!.name).toBe("Free masala chai");
  });
});

describe("checklist and first stamp", () => {
  it("lists five core steps, puts the first stamp second, keeps profile and POS optional", async () => {
    const { id, token } = await signup();
    const cl = await checklist(id, token);
    expect(cl.steps.map((s: { key: string }) => s.key)).toEqual(["program", "first_stamp", "qr_kit", "staff", "first_members"]);
    expect(cl.later.map((s: { key: string }) => s.key)).toEqual(["profile", "pos"]);
    expect(cl.currentStep).toBe("first_stamp");
    expect(cl.percentComplete).toBe(20);
    expect(cl.activation.nextMove.path).toBe("/setup?step=first_stamp");
    const ms = await milestonesFor(env.db, id);
    expect(ms.has("signed_up")).toBe(true);
    expect(ms.has("first_stamp")).toBe(false);
  });

  it("records the first stamp with its time to value and advances", async () => {
    const { id, token } = await signup();
    env.clock.now = new Date(env.clock.now.getTime() + 12 * 60_000);
    await stamp(id);
    const cl = await checklist(id, token);
    expect(cl.steps.find((s: { key: string }) => s.key === "first_stamp").done).toBe(true);
    expect(cl.currentStep).toBe("qr_kit");
    expect(cl.activation.firstStampMinutes).toBe(12);
    expect(cl.activation.milestones.find((m: { key: string }) => m.key === "first_stamp").detail).toBe("12 min later");
  });

  it("marks qr, staff and POS steps and records milestones", async () => {
    const { id, token } = await signup();
    for (const step of ["qr_kit", "staff", "pos"]) await env.app.inject({ method: "POST", url: `/v1/merchants/${id}/onboarding/complete`, headers: auth(token), payload: { step } });
    const ms = await milestonesFor(env.db, id);
    expect(ms.has("qr_printed")).toBe(true);
    expect(ms.has("staff_added")).toBe(true);
    const cl = await checklist(id, token);
    expect(cl.later.find((s: { key: string }) => s.key === "pos").done).toBe(true);
    const bad = await env.app.inject({ method: "POST", url: `/v1/merchants/${id}/onboarding/complete`, headers: auth(token), payload: { step: "first_stamp" } });
    expect(bad.statusCode).toBe(400);
  });
});

describe("activation", () => {
  it("records members_10 and activated, and flips status to active", async () => {
    const { id, token } = await signup();
    await stamp(id, 10);
    expect((await milestonesFor(env.db, id)).has("members_10")).toBe(true);
    expect((await milestonesFor(env.db, id)).has("activated")).toBe(false);
    await stamp(id, 15);
    expect((await milestonesFor(env.db, id)).has("activated")).toBe(true);
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, id));
    expect(m!.status).toBe("active");
    const cl = await checklist(id, token);
    expect(cl.activation.pace).toBe("activated");
    expect(cl.currentStep).toBe("qr_kit");
    expect(cl.activation.nextMove.path).toBe("/integrations");
  });

  it("reports pace against the 25-in-30-days line", async () => {
    const { id, token } = await signup();
    await stamp(id, 3);
    env.clock.now = new Date(env.clock.now.getTime() + 10 * DAY);
    expect((await checklist(id, token)).activation.pace).toBe("behind");
    await stamp(id, 6);
    const cl = await checklist(id, token);
    expect(cl.activation.members).toBe(9);
    expect(cl.activation.day).toBe(10);
    expect(["on_track", "ahead"]).toContain(cl.activation.pace);
    env.clock.now = new Date(env.clock.now.getTime() + 25 * DAY);
    expect((await checklist(id, token)).activation.pace).toBe("late");
  });

  it("counts where members came from", async () => {
    const { id, token } = await signup();
    await stamp(id, 2);
    const cl = await checklist(id, token);
    expect(cl.activation.sources).toEqual([{ source: "counter", label: "At the counter, asked by staff", count: 2 }]);
  });
});

describe("upsell moment", () => {
  it("restaurants: nothing before the first stamp, preview at 10, offer when active, quiet after Not now", async () => {
    const { id, token } = await signup("restaurant_south_asian", "Sarson Dhaba");
    expect((await checklist(id, token)).upsell.moment).toBe("none");
    await stamp(id, 3);
    expect((await checklist(id, token)).upsell.moment).toBe("none");
    await stamp(id, 7);
    let u = (await checklist(id, token)).upsell;
    expect(u.moment).toBe("preview");
    expect(u.plan).toBe("restaurant_growth");
    await stamp(id, 15);
    u = (await checklist(id, token)).upsell;
    expect(u.moment).toBe("offer");
    expect(u.priceLine).toContain("$199 a month");
    expect(u.foundingLine).toContain("50% off for 12 months");
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${id}/onboarding/upsell/dismiss`, headers: auth(await tokenFor(env, owners.get(id)!)) });
    expect(r.json().upsell.moment).toBe("none");
    env.clock.now = new Date(env.clock.now.getTime() + 15 * DAY);
    expect((await checklist(id, token)).upsell.moment).toBe("offer");
  });

  it("is never shown while behind pace, or to a paying shop", async () => {
    const { id, token } = await signup("restaurant");
    await stamp(id, 10);
    env.clock.now = new Date(env.clock.now.getTime() + 28 * DAY);
    expect((await checklist(id, token)).upsell.moment).toBe("none");
    await env.db.update(merchants).set({ plan: "plus" }).where(eq(merchants.id, id));
    await stamp(id, 15);
    expect((await checklist(id, token)).upsell.moment).toBe("none");
  });

  it("only owners can dismiss or toggle nudges", async () => {
    const { id } = await signup();
    const other = await createUser(env.db);
    const t = await tokenFor(env, other);
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${id}/onboarding/upsell/dismiss`, headers: auth(t) })).statusCode).toBeGreaterThanOrEqual(403);
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${id}/onboarding/nudges`, headers: auth(t), payload: { enabled: false } })).statusCode).toBeGreaterThanOrEqual(403);
  });
});

describe("setup nudges", () => {
  it("sends day-1 once when there is no first stamp, then a day-3 text, never twice", async () => {
    const { id, owner } = await signup("cafe");
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0); // too early
    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3_600_000); // 11:00 next day Toronto
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(1);
    const sms = env.ctx.providers.outbox.sms.at(-1)!;
    expect(sms.to).toBe(owner.phone);
    expect(sms.body).toContain("add a stamp");
    expect(sms.body).toContain(`/m/${id}/setup`);
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * DAY);
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(1);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("0 members so far");
  });

  it("a late shop gets one message, not a pile", async () => {
    await signup("cafe");
    env.clock.now = new Date(env.clock.now.getTime() + 15 * DAY);
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(1);
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("We will call you");
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
  });

  it("respects quiet hours, the opt-out and activation", async () => {
    const a = await signup("cafe", "Shop A");
    const b = await signup("cafe", "Shop B");
    const c = await signup("cafe", "Shop C");
    await env.app.inject({ method: "PUT", url: `/v1/merchants/${b.id}/onboarding/nudges`, headers: auth(b.token), payload: { enabled: false } });
    await stamp(c.id, 25);
    env.clock.now = new Date("2026-11-04T06:00:00Z"); // 01:00 Toronto
    expect((await runOnboardingNudges(env.ctx)).sent).toBe(0);
    env.clock.now = new Date("2026-11-04T16:00:00Z"); // 11:00 Toronto, day 1
    const r = await runOnboardingNudges(env.ctx);
    expect(r.sent).toBe(1);
    const sent = await env.db.select().from(merchantMilestones).where(and(eq(merchantMilestones.key, "nudge_d1")));
    expect(sent.map((s) => s.merchantId)).toEqual([a.id]);
    const on = await env.app.inject({ method: "PUT", url: `/v1/merchants/${b.id}/onboarding/nudges`, headers: auth(await tokenFor(env, b.owner)), payload: { enabled: true } });
    expect(on.json().nudgesOn).toBe(true);
  });

  it("flags shops that need a call at day 14", async () => {
    const { id } = await signup("cafe");
    await stamp(id, 2);
    env.clock.now = new Date(env.clock.now.getTime() + 15 * DAY);
    await runOnboardingNudges(env.ctx);
    expect((await milestonesFor(env.db, id)).has("needs_call")).toBe(true);
  });
});

describe("admin funnel", () => {
  it("counts the funnel and lists who to call", async () => {
    const admin = await createUser(env.db, { platformRole: "admin", email: "admin@example.com" });
    const a = await signup("cafe", "Activated");
    const b = await signup("cafe", "Stamped");
    const c = await signup("restaurant", "Stuck");
    env.clock.now = new Date(env.clock.now.getTime() + 20 * 60_000);
    await stamp(a.id, 25);
    await stamp(b.id, 4);
    env.clock.now = new Date(env.clock.now.getTime() + 3 * DAY);
    const r = await env.app.inject({ method: "GET", url: "/v1/admin/onboarding/funnel?days=90", headers: auth(await tokenFor(env, admin)) });
    expect(r.statusCode).toBe(200);
    const f = r.json();
    expect(f.signedUp).toBe(3);
    expect(f.steps.map((s: { key: string; count: number }) => [s.key, s.count])).toEqual([["signed_up", 3], ["first_stamp", 2], ["members_10", 1], ["activated", 1]]);
    expect(f.medianMinutesToFirstStamp).toBe(20);
    expect(f.stuckNoStamp).toBe(1);
    expect(f.callList[0]).toMatchObject({ merchantId: c.id, reason: "No first stamp" });
    expect(f.activatedIn30dPct).toBeNull();
    expect(f.byVertical.find((v: { vertical: string }) => v.vertical === "cafe")).toMatchObject({ signedUp: 2, activated: 1, pct: 50 });
    const nope = await env.app.inject({ method: "GET", url: "/v1/admin/onboarding/funnel", headers: auth(await tokenFor(env, a.owner)) });
    expect(nope.statusCode).toBeGreaterThanOrEqual(403);
  });

  it("reports the 30-day activation rate for shops old enough", async () => {
    const admin = await createUser(env.db, { platformRole: "admin", email: "admin2@example.com" });
    const a = await signup("cafe", "Quick");
    const b = await signup("cafe", "Slow");
    await stamp(a.id, 25);
    env.clock.now = new Date(env.clock.now.getTime() + 31 * DAY);
    const f = (await env.app.inject({ method: "GET", url: "/v1/admin/onboarding/funnel", headers: auth(await tokenFor(env, admin)) })).json();
    expect(f.activatedIn30dPct).toBe(50);
    expect(b.id).toBeTruthy();
  });

  it("backfills milestones for shops created outside the app", async () => {
    const { id } = await signup();
    await env.db.delete(merchantMilestones);
    await env.db.update(merchants).set({ activatedAt: env.clock.now }).where(eq(merchants.id, id));
    await backfillMilestones(env.db);
    await backfillMilestones(env.db);
    const ms = await milestonesFor(env.db, id);
    expect([...ms.keys()].sort()).toEqual(["activated", "signed_up"]);
    const cl = await getOnboardingChecklist(env.ctx, id);
    expect(cl.steps.find((s) => s.key === "first_members")!.done).toBe(true);
  });
});
