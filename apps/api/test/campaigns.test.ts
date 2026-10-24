import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, campaignProgress, featureRollouts, ledgerAccounts, ledgerEntries, ledgerTransactions, merchantMembers, visits } from "@ll/db";
import type { campaignsApi } from "@ll/shared";
import { campaignVisitHook } from "../src/services/campaigns.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const HOUR = 3_600_000;
const DAY = 86_400_000;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function enableCampaigns(stage: "ga" | "hidden" = "ga") {
  await env.db
    .insert(featureRollouts)
    .values({ key: "campaigns.neighbourhood", stage })
    .onConflictDoUpdate({ target: featureRollouts.key, set: { stage } });
}

async function setup() {
  const hood = await createNeighbourhood(env.db);
  const otherHood = await createNeighbourhood(env.db);
  const shops = [];
  for (let i = 0; i < 3; i++) shops.push(await createMerchant(env, { neighbourhoodId: hood.id }));
  const outsider = await createMerchant(env, { neighbourhoodId: otherHood.id });
  const admin = await createUser(env.db, { platformRole: "admin" });
  const manager = await createUser(env.db, { email: `bia${Math.random()}@example.com` });
  const otherManager = await createUser(env.db);
  const a = { admin, manager, otherManager };
  const tokens = async () => ({ admin: auth(await tokenFor(env, admin)), manager: auth(await tokenFor(env, manager)), otherManager: auth(await tokenFor(env, otherManager)) });
  const t = await tokens();
  expect((await env.app.inject({ method: "POST", url: "/v1/admin/campaign-managers", headers: t.admin, payload: { neighbourhoodId: hood.id, email: manager.email } })).statusCode).toBe(201);
  await env.app.inject({ method: "POST", url: "/v1/admin/campaign-managers", headers: t.admin, payload: { neighbourhoodId: otherHood.id, userId: otherManager.id } });
  return { hood, otherHood, shops, outsider, ...a, tokens };
}

function campaignBody(hoodId: string, over: Partial<campaignsApi.CreateCampaignBody> = {}) {
  return {
    neighbourhoodId: hoodId,
    name: "Passport week",
    kind: "passport",
    startsAt: new Date(env.clock.now.getTime() + HOUR).toISOString(),
    endsAt: new Date(env.clock.now.getTime() + 7 * DAY).toISOString(),
    goalVisits: 3,
    bonusPoints: 10,
    prize: "Prize basket",
    ...over,
  };
}

/** Record a purchase at the test clock time (visits/members default to the DB clock). */
async function visit(merchantId: string, phone: string, amountCents = 1000) {
  const r = await awardPurchase(env.ctx, { merchantId, phone, source: "staff_app", amountCents });
  await env.db.update(visits).set({ createdAt: env.clock.now }).where(and(eq(visits.memberId, r.member.id), eq(visits.transactionId, r.transaction!.id)));
  if (r.memberCreated) await env.db.update(merchantMembers).set({ createdAt: env.clock.now }).where(eq(merchantMembers.id, r.member.id));
  return r;
}

describe("campaigns: access and gating", () => {
  it("402 for BIA managers and merchants while hidden; admins can set up pilots", async () => {
    const s = await setup();
    const t = await s.tokens();
    const byManager = await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: t.manager, payload: campaignBody(s.hood.id) });
    expect(byManager.statusCode).toBe(402);
    expect(byManager.json().error.code).toBe("feature_locked");
    const merchantView = await env.app.inject({ method: "GET", url: `/v1/merchants/${s.shops[0]!.merchant.id}/campaigns`, headers: auth(s.shops[0]!.ownerToken) });
    expect(merchantView.statusCode).toBe(402);
    // The list is the probe the BIA console uses to show its "coming soon" state.
    const listed = await env.app.inject({ method: "GET", url: "/v1/campaigns", headers: t.manager });
    expect(listed.statusCode).toBe(402);
    expect(listed.json().error.code).toBe("feature_locked");
    expect((await env.app.inject({ method: "GET", url: "/v1/campaigns", headers: t.admin })).statusCode).toBe(200);
    const byAdmin = await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: t.admin, payload: campaignBody(s.hood.id) });
    expect(byAdmin.statusCode).toBe(201);
  });

  it("scopes BIA managers to their neighbourhood and requires payment before scheduling", async () => {
    await enableCampaigns();
    const s = await setup();
    const t = await s.tokens();
    expect((await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: t.otherManager, payload: campaignBody(s.hood.id) })).statusCode).toBe(403);
    const random = await createUser(env.db);
    expect((await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: auth(await tokenFor(env, random)), payload: campaignBody(s.hood.id) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "GET", url: "/v1/campaigns" })).statusCode).toBe(401);

    const res = await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: t.manager, payload: campaignBody(s.hood.id, { priceCents: 0 }) });
    expect(res.statusCode).toBe(201);
    const c = res.json() as campaignsApi.Campaign;
    expect(c.priceCents).toBe(225_000); // Silver package; managers can't set their own price
    expect(c.status).toBe("draft");
    expect((await env.app.inject({ method: "GET", url: `/v1/campaigns/${c.id}`, headers: t.otherManager })).statusCode).toBe(403);
    const list = await env.app.inject({ method: "GET", url: "/v1/campaigns", headers: t.manager });
    expect(list.json().items.map((x: campaignsApi.Campaign) => x.id)).toEqual([c.id]);

    const unpaid = await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/schedule`, headers: t.manager });
    expect(unpaid.statusCode).toBe(402);
    expect((await env.app.inject({ method: "POST", url: `/v1/admin/campaigns/${c.id}/mark-paid`, headers: t.manager, payload: {} })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "POST", url: `/v1/admin/campaigns/${c.id}/mark-paid`, headers: t.admin, payload: {} })).json().paid).toBe(true);
    const scheduled = await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/schedule`, headers: t.manager });
    expect(scheduled.json().status).toBe("scheduled");
    // Marking a campaign paid is a money action: it is audited with who did it.
    const audited = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "campaign.marked_paid"));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({ entityId: c.id, data: { paid: true } });
    expect((await env.db.select().from(auditLogs).where(eq(auditLogs.action, "campaign.manager_added"))).length).toBeGreaterThan(0);
  });
});

describe("campaigns: passport progress, bonuses and completion", () => {
  it("tracks distinct shops, awards a network-funded bonus once per shop, completes and enters the draw", async () => {
    await enableCampaigns();
    const s = await setup();
    const t = await s.tokens();
    const c = (await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: t.admin, payload: campaignBody(s.hood.id) })).json() as campaignsApi.Campaign;
    await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/schedule`, headers: t.admin });

    // Two shops opt in themselves, the BIA adds the third; outsiders can't join.
    for (const shop of s.shops.slice(0, 2)) {
      const j = await env.app.inject({ method: "POST", url: `/v1/merchants/${shop.merchant.id}/campaigns/${c.id}/join`, headers: auth(shop.ownerToken) });
      expect(j.json()).toMatchObject({ joined: true, canChange: true });
    }
    expect((await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/merchants`, headers: t.manager, payload: { merchantId: s.shops[2]!.merchant.id } })).json().merchants).toHaveLength(3);
    expect((await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/merchants`, headers: t.manager, payload: { merchantId: s.outsider.merchant.id } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${s.outsider.merchant.id}/campaigns/${c.id}/join`, headers: auth(s.outsider.ownerToken) })).statusCode).toBe(404);

    const phone = nextPhone();
    const customer = await createUser(env.db, { phone, name: "Jamie Rivera" });
    // Before the campaign starts: no progress.
    await visit(s.shops[0]!.merchant.id, phone);
    expect(await env.db.select().from(campaignProgress)).toHaveLength(0);

    env.clock.now = new Date(env.clock.now.getTime() + 2 * HOUR);
    const v1 = await visit(s.shops[0]!.merchant.id, phone);
    expect(v1.extraPoints).toBe(10);
    expect(v1.messages).toContain("Passport week: 1 of 3 shops visited.");
    const again = await visit(s.shops[0]!.merchant.id, phone);
    expect(again.extraPoints).toBe(0); // same shop: no second bonus
    await visit(s.outsider.merchant.id, phone); // not participating
    await visit(s.shops[1]!.merchant.id, phone);
    const last = await visit(s.shops[2]!.merchant.id, phone);
    expect(last.extraPoints).toBe(10);
    expect(last.messages).toContain("Passport week complete! You're entered in the draw for Prize basket.");

    const [p] = await env.db.select().from(campaignProgress).where(eq(campaignProgress.campaignId, c.id));
    expect(p!.merchantIds).toHaveLength(3);
    expect(p!.completedAt).not.toBeNull();

    const bonusTx = await env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.type, "campaign_bonus"));
    expect(bonusTx).toHaveLength(3);
    expect(bonusTx.every((x) => x.campaignId === c.id && x.points === 10)).toBe(true);
    // Funded by the network account, not the merchant.
    const [network] = await env.db.select().from(ledgerAccounts).where(and(isNull(ledgerAccounts.merchantId), eq(ledgerAccounts.kind, "network_issued")));
    const netEntries = await env.db.select().from(ledgerEntries).where(eq(ledgerEntries.accountId, network!.id));
    expect(netEntries.reduce((sum, e) => sum + e.amount, 0)).toBe(-30);

    // Customer view.
    const ct = auth(await tokenFor(env, customer));
    const mine = await env.app.inject({ method: "GET", url: "/v1/me/campaigns", headers: ct });
    const item = (mine.json().items as campaignsApi.MyCampaign[]).find((x) => x.id === c.id)!;
    expect(item.progress).toMatchObject({ visited: 3, goal: 3, enteredInDraw: true });
    expect(item.merchants).toHaveLength(3);

    // Public page shows no price.
    const pub = await env.app.inject({ method: "GET", url: `/v1/public/campaigns/${c.id}` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).not.toHaveProperty("priceCents");
    const draft = (await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: (await s.tokens()).admin, payload: campaignBody(s.hood.id, { name: "Draft one" }) })).json();
    expect((await env.app.inject({ method: "GET", url: `/v1/public/campaigns/${draft.id}` })).statusCode).toBe(404);

    // Merchants can't leave once it has started.
    expect((await env.app.inject({ method: "DELETE", url: `/v1/merchants/${s.shops[0]!.merchant.id}/campaigns/${c.id}/join`, headers: auth(await tokenFor(env, s.shops[0]!.owner)) })).statusCode).toBe(409);

    // Prize draw: admin only, after the end, first name + masked phone only.
    const t2 = await s.tokens();
    expect((await env.app.inject({ method: "POST", url: `/v1/admin/campaigns/${c.id}/draw`, headers: t2.admin, payload: {} })).statusCode).toBe(409);
    env.clock.now = new Date(env.clock.now.getTime() + 8 * DAY);
    const t3 = await s.tokens();
    expect((await env.app.inject({ method: "POST", url: `/v1/admin/campaigns/${c.id}/draw`, headers: t3.manager, payload: {} })).statusCode).toBe(403);
    const draw = await env.app.inject({ method: "POST", url: `/v1/admin/campaigns/${c.id}/draw`, headers: t3.admin, payload: {} });
    expect(draw.statusCode).toBe(200);
    const result = draw.json() as campaignsApi.DrawResult;
    expect(result.eligibleCount).toBe(1);
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "campaign.winner_drawn"))).toHaveLength(1);
    expect(result.winner).toEqual({ firstName: "Jamie", maskedPhone: `(${phone.slice(2, 5)}) ***-${phone.slice(-4)}` });
    expect(draw.body).not.toContain(phone);
    expect(draw.body).not.toContain(customer.id);
    expect(draw.body).not.toContain("Rivera");
    expect((await env.app.inject({ method: "POST", url: `/v1/admin/campaigns/${c.id}/draw`, headers: t3.admin, payload: {} })).statusCode).toBe(409);
  });

  it("multiplier campaigns add base × (pct/100 − 1) once per visit", async () => {
    await enableCampaigns();
    const s = await setup();
    const t = await s.tokens();
    const c = (
      await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: t.admin, payload: campaignBody(s.hood.id, { kind: "multiplier", name: "Triple points", multiplierPct: 300, bonusPoints: 0, prize: undefined }) })
    ).json() as campaignsApi.Campaign;
    await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/schedule`, headers: t.admin });
    await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/merchants`, headers: t.admin, payload: { merchantId: s.shops[0]!.merchant.id } });
    env.clock.now = new Date(env.clock.now.getTime() + 2 * HOUR);
    const phone = nextPhone();
    const r = await visit(s.shops[0]!.merchant.id, phone, 1250); // base 12 points
    expect(r.extraPoints).toBe(24);
    expect(r.member.balance).toBe(36);

    // Re-running the hook for the same visit is idempotent (no double award).
    const [v] = await env.db.select().from(visits).where(eq(visits.memberId, r.member.id));
    const out = await env.db.transaction((tx) =>
      campaignVisitHook(tx, { ctx: env.ctx, merchant: s.shops[0]!.merchant, member: r.member, visitId: v!.id, at: env.clock.now, source: "staff_app" }),
    );
    expect(out?.pointsAwarded ?? 0).toBe(0);
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, r.member.id));
    expect(m!.balance).toBe(36);
  });
});

describe("campaigns: BIA report", () => {
  it("compares campaign visits to a same-length baseline, with per-merchant numbers and no PII", async () => {
    await enableCampaigns();
    const s = await setup();
    const [shop1, shop2] = [s.shops[0]!.merchant.id, s.shops[1]!.merchant.id];
    const start = new Date(env.clock.now.getTime() + 3 * DAY);
    const t = await s.tokens();
    const c = (
      await env.app.inject({
        method: "POST",
        url: "/v1/campaigns",
        headers: t.admin,
        payload: campaignBody(s.hood.id, { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * DAY).toISOString() }),
      })
    ).json() as campaignsApi.Campaign;
    await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/schedule`, headers: t.admin });
    for (const id of [shop1, shop2]) await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.id}/merchants`, headers: t.admin, payload: { merchantId: id } });

    const [A, B, C, D] = [nextPhone(), nextPhone(), nextPhone(), nextPhone()];
    const at = (ms: number) => (env.clock.now = new Date(start.getTime() + ms));
    // Outside both windows (ignored).
    at(-3 * DAY + HOUR);
    await visit(shop1, B);
    // Baseline window [start - 2d, start): 3 visits, 2 customers, 2 new members (A@1; B@2).
    at(-2 * DAY + HOUR);
    await visit(shop1, A);
    at(-DAY);
    await visit(shop1, A);
    await visit(shop2, B);
    // Campaign window: 4 visits, 3 customers (A, C, D), 3 new members (C@1, C@2, D@2).
    at(HOUR);
    await visit(shop1, A);
    await visit(shop1, C);
    at(DAY);
    await visit(shop2, C);
    await visit(shop2, D);
    at(3 * DAY);

    const t2 = await s.tokens();
    expect((await env.app.inject({ method: "GET", url: `/v1/campaigns/${c.id}/report`, headers: t2.otherManager })).statusCode).toBe(403);
    const res = await env.app.inject({ method: "GET", url: `/v1/campaigns/${c.id}/report`, headers: t2.manager });
    expect(res.statusCode).toBe(200);
    const r = res.json() as campaignsApi.CampaignReport;
    expect(r).toMatchObject({
      visits: 4,
      baselineVisits: 3,
      visitLiftPct: 33.3,
      uniqueCustomers: 3,
      baselineUniqueCustomers: 2,
      newMembers: 3,
      baselineNewMembers: 2,
      participants: 3,
      completions: 0,
      bonusPointsIssued: 40,
    });
    expect(r.baselineWindow).toEqual({ startsAt: new Date(start.getTime() - 2 * DAY).toISOString(), endsAt: start.toISOString() });
    const per = Object.fromEntries(r.perMerchant.map((m) => [m.merchantId, m]));
    expect(per[shop1]).toMatchObject({ visits: 2, baselineVisits: 2, uniqueCustomers: 2, newMembers: 1 });
    expect(per[shop2]).toMatchObject({ visits: 2, baselineVisits: 1, uniqueCustomers: 2, newMembers: 2 });
    for (const p of [A, B, C, D]) expect(res.body).not.toContain(p.slice(2));
  });
});
