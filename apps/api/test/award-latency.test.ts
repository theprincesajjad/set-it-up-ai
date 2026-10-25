/**
 * The counter must feel instant: one stamp (look the customer up, then award) is a handful of round trips, and
 * everything that is not the ledger write or the response (notifications, wallet pass pushes, passport messages,
 * onboarding milestones, ad attribution) is delivered from the after-commit outbox instead.
 *
 * Single-user test on PGlite: counts every statement the request runs. A change that puts a notification fan-out (or
 * an N+1) back into the request path fails the query budget long before it shows up as latency.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaignMerchants, campaigns, merchantMembers, merchantStaff, networkPerks, notifications, outboxEvents, pushTokens, users, walletPasses } from "@ll/db";
import { awardPurchase } from "../src/services/ledger.js";
import { drainOutbox, outboxBacklog } from "../src/services/outbox.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

/** Statements per request (steady state: a regular, caches warm). The ledger write is 3, the visit 2; the rest are the staff and member reads, the hooks' reads and the response summary. */
const AWARD_QUERY_BUDGET = 20;
/** The first stamp at a shop in a live passport campaign also posts the network-funded bonus (a second ledger transaction). */
const CAMPAIGN_BONUS_AWARD_QUERY_BUDGET = 28;
const LOOKUP_QUERY_BUDGET = 8;
/** Server time per award, in-process on an idle database (the brief is < 300 ms on a production-like one). */
const AWARD_P50_MS_BUDGET = 300;

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
  // Production behaviour: the request returns before the side effects run (tests default to delivering inline); no
  // next-tick delivery either, so the statements counted below are the request's own.
  env.ctx.config.outbox = { inline: false, fastPath: false };
});
afterEach(async () => env.close());

interface Counter {
  statements: string[];
}
function countStatements(): { counter: Counter; stop: () => void } {
  const counter: Counter = { statements: [] };
  const client = (env.db as unknown as { $client: { query: (...a: unknown[]) => Promise<unknown>; transaction: (fn: (tx: never) => Promise<unknown>) => Promise<unknown> } }).$client;
  const origQuery = client.query.bind(client);
  const origTx = client.transaction.bind(client);
  let on = true;
  const wrap = (obj: { query: (...a: unknown[]) => Promise<unknown> }) => {
    const q = obj.query.bind(obj);
    obj.query = (async (...a: unknown[]) => {
      if (on) counter.statements.push(String(a[0]).replace(/\s+/g, " "));
      return q(...a);
    }) as never;
  };
  wrap(client);
  client.transaction = ((fn: (t: never) => Promise<unknown>) =>
    origTx(async (t: never) => {
      wrap(t as never);
      return fn(t);
    })) as never;
  return {
    counter,
    stop: () => {
      on = false;
      client.query = origQuery as never;
      client.transaction = origTx as never;
    },
  };
}

async function setup(opts: { bonusPoints?: number; campaignStatus?: "live" | "draft" } = {}) {
  const hood = await createNeighbourhood(env.db);
  const shop = await createMerchant(env, { neighbourhoodId: hood.id });
  await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 3, bonusPoints: 25 });
  const staff = await createUser(env.db, { name: "Jo Staff" });
  await env.db.insert(merchantStaff).values({ merchantId: shop.merchant.id, userId: staff.id, role: "staff" });
  const customer = await createUser(env.db, { name: "Pat Q", email: "pat@example.com" });
  // A customer who is reachable the way most are: an app token and a wallet pass, so the outbox has real work to do.
  await env.db.insert(pushTokens).values({ userId: customer.id, token: "ExponentPushToken[perf]", platform: "ios" });
  await env.db.insert(walletPasses).values({ userId: customer.id, platform: "apple", serialNumber: `perf-${customer.id}`, authToken: "t" } as never).catch(() => undefined);
  // A live passport campaign that includes the shop: the visit hook has to look at it on every stamp.
  const [camp] = await env.db
    .insert(campaigns)
    .values({ neighbourhoodId: hood.id, name: "Passport week", kind: "passport", status: opts.campaignStatus ?? "live", startsAt: new Date(env.clock.now.getTime() - 86_400_000), endsAt: new Date(env.clock.now.getTime() + 6 * 86_400_000), goalVisits: 3, bonusPoints: opts.bonusPoints ?? 0 } as never)
    .returning();
  await env.db.insert(campaignMerchants).values({ campaignId: camp!.id, merchantId: shop.merchant.id } as never);
  const token = await tokenFor(env, staff);
  const base = `/v1/merchants/${shop.merchant.id}/counter`;
  const code = customer.memberCode!;
  const call = (method: "GET" | "POST", url: string, payload?: unknown) => env.app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${token}` } });
  // Make them a regular first (a first-ever visit also creates the member, which is not the steady state).
  await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: customer.id, source: "staff_app", amountCents: 450 });
  await awardPurchase(env.ctx, { merchantId: shop.merchant.id, userId: customer.id, source: "staff_app", amountCents: 450 });
  await drainOutbox(env.ctx);
  return { shop, customer, code, base, call, campaignId: camp!.id };
}

// Counts statements through the PGlite client; the real-server variant of this check is the load script (`--pg`).
describe.skipIf(!!process.env.TEST_PG_URL)("counter stamp: query budget and outbox", () => {
  it("lookup + award stay within the query budget; side effects come from the outbox", async () => {
    const s = await setup();
    let n = 0;
    const award = () => s.call("POST", `${s.base}/award`, { memberCode: s.code, amountCents: 450, idempotencyKey: `perf-${n++}-${Math.random()}` });

    // Warm the process caches (account ids, prepared plans) the way a counter that has been open for a minute is.
    expect((await award()).statusCode).toBe(200);
    await drainOutbox(env.ctx);

    const look = countStatements();
    const lookup = await s.call("GET", `${s.base}/lookup?q=${encodeURIComponent(`LL:${s.code}`)}`);
    look.stop();
    expect(lookup.statusCode).toBe(200);

    const times: number[] = [];
    let perAward = 0;
    for (let i = 0; i < 5; i++) {
      const c = countStatements();
      const t0 = performance.now();
      const res = await award();
      times.push(performance.now() - t0);
      c.stop();
      expect(res.statusCode).toBe(200);
      expect(res.json().pointsEarned).toBeGreaterThan(0);
      perAward = Math.max(perAward, c.counter.statements.length);
      if (i === 4 && process.env.PERF_TRACE) console.log(c.counter.statements.map((q, k) => `${k + 1}. ${q.slice(0, 150)}`).join("\n"));
      if (i === 4) console.log(`[award-latency] lookup ${look.counter.statements.length} statements, award ${c.counter.statements.length} statements, award times ${times.map((t) => t.toFixed(0)).join("/")} ms`);
      // No notification, wallet or inbox statement in the request.
      const fanOut = c.counter.statements.filter((q) => /"notifications"|"push_tokens"|"user_notification_prefs"|"wallet_passes"|"message_deliveries"|"wallet_device_registrations"|"merchant_milestones"|"ad_events"/.test(q));
      expect(fanOut).toEqual([]);
      expect(c.counter.statements.filter((q) => /insert into "outbox_events"/.test(q))).toHaveLength(1);
    }
    expect(look.counter.statements.length).toBeLessThanOrEqual(LOOKUP_QUERY_BUDGET);
    expect(perAward).toBeLessThanOrEqual(AWARD_QUERY_BUDGET);
    expect([...times].sort((a, b) => a - b)[2]).toBeLessThan(AWARD_P50_MS_BUDGET);

    // The side effects are durable and still arrive: the events are waiting, and one drain delivers them.
    expect(await outboxBacklog(env.ctx)).toBe(5);
    const before = await env.db.select().from(notifications).where(eq(notifications.userId, s.customer.id));
    const drained = await drainOutbox(env.ctx);
    expect(drained.done).toBe(5);
    expect(await outboxBacklog(env.ctx)).toBe(0);
    const after = await env.db.select().from(notifications).where(eq(notifications.userId, s.customer.id));
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    expect(after.some((x) => x.type === "points_earned")).toBe(true);
    const [member] = await env.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, s.shop.merchant.id), eq(merchantMembers.userId, s.customer.id)));
    expect(member!.visitCount).toBe(8);
    expect(await env.db.select().from(outboxEvents).where(eq(outboxEvents.status, "dead"))).toHaveLength(0);
    void users;
  });

  it("the first stamp in a live passport campaign (network-funded bonus posted in the same transaction) stays within its own budget", async () => {
    // Two regulars first; the campaign goes live afterwards, so their next stamp is their first visit "in" it.
    const s = await setup({ bonusPoints: 10, campaignStatus: "draft" });
    const other = await createUser(env.db, { name: "Sam" });
    await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, userId: other.id, source: "staff_app", amountCents: 450 });
    await awardPurchase(env.ctx, { merchantId: s.shop.merchant.id, userId: other.id, source: "staff_app", amountCents: 450 });
    await env.db.update(campaigns).set({ status: "live" }).where(eq(campaigns.id, s.campaignId));
    // Warm the caches with the other customer's first campaign stamp.
    const warm = await s.call("POST", `${s.base}/award`, { memberCode: s.code, amountCents: 450, idempotencyKey: "warm-key-1" });
    expect(warm.json(), JSON.stringify(warm.json())).toMatchObject({ extraPoints: 10 });
    await drainOutbox(env.ctx);
    const c = countStatements();
    const res = await s.call("POST", `${s.base}/award`, { memberCode: other.memberCode, amountCents: 450, idempotencyKey: "measured-key-1" });
    c.stop();
    expect(res.statusCode).toBe(200);
    expect(res.json().extraPoints).toBe(10);
    expect(res.json().messages.join(" ")).toContain("Passport week");
    if (process.env.PERF_TRACE) console.log(c.counter.statements.map((q, k) => `${k + 1}. ${q.slice(0, 150)}`).join("\n"));
    console.log(`[award-latency] first campaign stamp: ${c.counter.statements.length} statements`);
    expect(c.counter.statements.length).toBeLessThanOrEqual(CAMPAIGN_BONUS_AWARD_QUERY_BUDGET);
    expect(c.counter.statements.filter((q) => /"notifications"|"push_tokens"|"wallet_passes"|"merchant_milestones"|"ad_events"/.test(q))).toEqual([]);
    // The passport message still reaches the customer, from the outbox.
    await drainOutbox(env.ctx);
    const inbox = await env.db.select().from(notifications).where(eq(notifications.userId, other.id));
    expect(inbox.map((n) => n.type)).toContain("passport_progress");
  });
});
