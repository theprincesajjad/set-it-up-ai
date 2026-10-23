import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { featureRollouts, leads, merchantMembers, merchants, neighbourhoods, visits } from "@ll/db";
import { campaignsApi, type networkApi, type repApi } from "@ll/shared";
import { runCampaignLifecycle } from "../src/services/campaigns.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

const DAY = 86_400_000;
const HOUR = 3_600_000;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const get = (url: string, headers?: Record<string, string>) => env.app.inject({ method: "GET", url, headers });

/** Record a purchase `ms` from now, with the visit and the membership stamped at that time (the clock is put back after). */
async function visit(merchantId: string, phone: string, ms: number) {
  const base = env.clock.now;
  const at = new Date(base.getTime() + ms);
  env.clock.now = at;
  try {
    const r = await awardPurchase(env.ctx, { merchantId, phone, source: "staff_app", amountCents: 1000 });
    await env.db.update(visits).set({ createdAt: at }).where(and(eq(visits.memberId, r.member.id), eq(visits.transactionId, r.transaction!.id)));
    if (r.memberCreated) await env.db.update(merchantMembers).set({ createdAt: at }).where(eq(merchantMembers.id, r.member.id));
    return r;
  } finally {
    env.clock.now = base;
  }
}

/** Campaigns can only be created before they end, so build one with the clock set back, then return to now. */
async function withClockAt<T>(at: Date, fn: () => Promise<T>): Promise<T> {
  const now = env.clock.now;
  env.clock.now = at;
  try {
    return await fn();
  } finally {
    env.clock.now = now;
  }
}

async function street(n = 3) {
  const hood = await createNeighbourhood(env.db);
  const shops = [];
  for (let i = 0; i < n; i++) shops.push(await createMerchant(env, { neighbourhoodId: hood.id }));
  const admin = await createUser(env.db, { platformRole: "admin" });
  const manager = await createUser(env.db, { email: `bia${Math.random()}@example.com` });
  const stranger = await createUser(env.db);
  const adminH = auth(await tokenFor(env, admin));
  await env.app.inject({ method: "POST", url: "/v1/admin/campaign-managers", headers: adminH, payload: { neighbourhoodId: hood.id, userId: manager.id } });
  return { hood, shops, ids: shops.map((s) => s.merchant.id), admin: adminH, manager: auth(await tokenFor(env, manager)), stranger: auth(await tokenFor(env, stranger)) };
}

describe("GET /v1/public/plans: network stats", () => {
  it("counts members, the share at two or more shops and the streets where the card works", async () => {
    const s = await street(3);
    const empty = await createNeighbourhood(env.db); // no active shops: not a live street
    expect(empty.id).toBeTruthy();
    const [a, b, c] = [nextPhone(), nextPhone(), nextPhone()];
    await visit(s.ids[0]!, a, -HOUR);
    await visit(s.ids[1]!, a, -HOUR); // a is at two shops
    await visit(s.ids[0]!, b, -HOUR);
    await visit(s.ids[2]!, c, -HOUR);
    const res = await get("/v1/public/plans");
    expect(res.statusCode).toBe(200);
    const n = (res.json() as networkApi.PublicPlansResponse).network;
    expect(n).toMatchObject({ activeMerchants: 3, neighbourhoods: 2, members: 3, multiShopMemberPct: 33.3, liveStreets: 1 });
    for (const p of [a, b, c]) expect(res.body).not.toContain(p.slice(2));
  });

  it("is all zeros on an empty network", async () => {
    const n = ((await get("/v1/public/plans")).json() as networkApi.PublicPlansResponse).network;
    expect(n).toMatchObject({ activeMerchants: 0, members: 0, multiShopMemberPct: 0, liveStreets: 0 });
  });
});

describe("GET /v1/public/restaurants/founding", () => {
  it("lists corridors with restaurants and how many of the 20 founding spots are taken, cached for 300 s", async () => {
    const hood = await createNeighbourhood(env.db, "ridgeway");
    await env.db.update(neighbourhoods).set({ name: "Ridgeway Plaza" }).where(eq(neighbourhoods.id, hood.id));
    const other = await createNeighbourhood(env.db, "no-restaurants");
    const a = await createMerchant(env, { neighbourhoodId: hood.id });
    const b = await createMerchant(env, { neighbourhoodId: hood.id });
    const c = await createMerchant(env, { neighbourhoodId: hood.id });
    await createMerchant(env, { neighbourhoodId: other.id }); // a café street: not a corridor
    await env.db.update(merchants).set({ restaurantTier: "growth", foundingOffer: true }).where(eq(merchants.id, a.merchant.id));
    await env.db.update(merchants).set({ restaurantTier: "starter", foundingOffer: true }).where(eq(merchants.id, b.merchant.id));
    await env.db.update(merchants).set({ restaurantTier: "starter" }).where(eq(merchants.id, c.merchant.id));
    const res = await get("/v1/public/restaurants/founding");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect((res.json() as networkApi.FoundingResponse).corridors).toEqual([{ slug: "ridgeway", name: "Ridgeway Plaza", taken: 2, total: 20 }]);
  });

  it("does not count a closed restaurant", async () => {
    const hood = await createNeighbourhood(env.db, "gerrard");
    const a = await createMerchant(env, { neighbourhoodId: hood.id });
    await env.db.update(merchants).set({ restaurantTier: "growth", foundingOffer: true, status: "closed" }).where(eq(merchants.id, a.merchant.id));
    expect(((await get("/v1/public/restaurants/founding")).json() as networkApi.FoundingResponse).corridors).toEqual([]);
  });
});

describe("POST /v1/public/leads: restaurant and BIA fields", () => {
  const post = (payload: unknown) => env.app.inject({ method: "POST", url: "/v1/public/leads", payload: payload as object });

  it("stores a restaurant lead with the chosen language and needs a phone", async () => {
    expect((await post({ businessName: "Karahi House", email: "a@example.com", kind: "restaurant" })).statusCode).toBe(400);
    const res = await post({ businessName: "Karahi House", contactName: "Imran", phone: nextPhone(), kind: "restaurant", language: "ur" });
    expect(res.statusCode).toBe(201);
    const [lead] = await env.db.select().from(leads).where(eq(leads.id, res.json().id));
    expect(lead).toMatchObject({ businessName: "Karahi House", language: "ur", vertical: "restaurant", stage: "new" });
    expect(lead!.notes).toContain("restaurant");
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain("Language: Urdu");
    expect((await post({ businessName: "X", phone: nextPhone(), kind: "restaurant", language: "fr" })).statusCode).toBe(400);
  });

  it("stores a BIA lead's role, event date, board meeting and member count; the rep inbox returns them", async () => {
    const res = await post({ businessName: "Roncesvalles Village BIA", contactName: "Maya", role: "Executive director", email: "maya@example.com", kind: "bia", eventDate: "2026-12-05", boardMeetingAt: "2026-11-20", memberCount: 74 });
    expect(res.statusCode).toBe(201);
    expect((await post({ businessName: "X", email: "a@example.com", kind: "bia", boardMeetingAt: "next month" })).statusCode).toBe(400);
    const admin = await createUser(env.db, { platformRole: "admin" });
    const inbox = await get("/v1/rep/leads?q=Roncesvalles", auth(await tokenFor(env, admin)));
    expect(inbox.statusCode).toBe(200);
    expect((inbox.json().items as repApi.Lead[])[0]).toMatchObject({ contactRole: "Executive director", eventDate: "2026-12-05", boardMeetingAt: "2026-11-20", memberCount: 74, language: null });
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain("Next board meeting: 2026-11-20");
  });
});

describe("neighbourhoods.biaMemberCount", () => {
  it("is admin-editable and shows as 'members' on the overview", async () => {
    const s = await street(1);
    expect(((await get(`/v1/neighbourhoods/${s.hood.id}/overview`, s.manager)).json() as campaignsApi.NeighbourhoodOverview).shops.members).toBeNull();
    const patch = await env.app.inject({ method: "PATCH", url: `/v1/admin/neighbourhoods/${s.hood.id}`, headers: s.admin, payload: { biaMemberCount: 74 } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().biaMemberCount).toBe(74);
    expect(((await get(`/v1/neighbourhoods/${s.hood.id}/overview`, s.manager)).json() as campaignsApi.NeighbourhoodOverview).shops.members).toBe(74);
  });
});

describe("GET /v1/neighbourhoods/:id/overview", () => {
  it("is for that neighbourhood's manager or an admin", async () => {
    const s = await street(1);
    const url = `/v1/neighbourhoods/${s.hood.id}/overview`;
    expect((await get(url)).statusCode).toBe(401);
    expect((await get(url, s.stranger)).statusCode).toBe(403);
    expect((await get(url, s.manager)).statusCode).toBe(200);
    expect((await get(url, s.admin)).statusCode).toBe(200);
    expect((await get(`/v1/neighbourhoods/${(await createNeighbourhood(env.db)).id}/overview`, s.manager)).statusCode).toBe(403);
    expect((await get("/v1/neighbourhoods/00000000-0000-4000-8000-000000000000/overview", s.admin)).statusCode).toBe(404);
    expect((await get(`${url}?from=2026-10-01&to=2026-09-01`, s.manager)).statusCode).toBe(400);
    expect((await get(`${url}?from=2024-01-01&to=2026-09-01`, s.manager)).statusCode).toBe(400);
  });

  it("adds up: visits equal the sum of the shops table, deltas compare with the period before, no customer is identified", async () => {
    const s = await street(3);
    await env.db.update(merchants).set({ activatedAt: new Date(env.clock.now.getTime() - 200 * DAY) }).where(eq(merchants.id, s.ids[0]!));
    await env.db.update(merchants).set({ createdAt: new Date(env.clock.now.getTime() - 5 * DAY) }).where(eq(merchants.neighbourhoodId, s.hood.id));
    const [a, b, c, d] = [nextPhone(), nextPhone(), nextPhone(), nextPhone()];
    // Prior 30 days [-60d, -30d): 2 visits, 2 shoppers, none at two shops.
    await visit(s.ids[0]!, a, -45 * DAY);
    await visit(s.ids[1]!, b, -40 * DAY);
    // This period: a at shops 0 and 1, b at shop 1, c at shop 2 (3 shoppers, 1 at two shops), d at shop 0 twice.
    await visit(s.ids[0]!, a, -10 * DAY);
    await visit(s.ids[1]!, a, -9 * DAY);
    await visit(s.ids[1]!, b, -8 * DAY);
    await visit(s.ids[2]!, c, -2 * DAY);
    await visit(s.ids[0]!, d, -3 * DAY);
    await visit(s.ids[0]!, d, -1 * DAY);

    const res = await get(`/v1/neighbourhoods/${s.hood.id}/overview`, s.manager);
    expect(res.statusCode).toBe(200);
    const o = res.json() as campaignsApi.NeighbourhoodOverview;
    expect(o.visits.value).toBe(o.shopsTable.reduce((n, r) => n + r.visits, 0));
    expect(o).toMatchObject({
      shops: { live: 3, members: null },
      activeMembers: { value: 4, delta: 2 },
      multiShopPct: { value: 25, deltaPoints: 25 },
      visits: { value: 6, deltaPct: 200 },
    });
    expect(new Date(o.period.to).getTime() - new Date(o.period.from).getTime()).toBe(30 * DAY);
    expect(o.prior.to).toBe(o.period.from);
    expect(o.shopsTable.find((r) => r.id === s.ids[0])).toMatchObject({ visits: 3, newMembers: 1, activated: true, status: "active" });
    expect(o.shopsTable.find((r) => r.id === s.ids[1])).toMatchObject({ visits: 2, activated: false });
    expect(o.shops.joinedInPeriod).toBe(3);
    expect(o.gates).toMatchObject({ liveMonths: 6, activeShops: 3, activeCustomers: 4, multiShopPct: 25, thresholds: { liveMonths: 6, activeShops: 20, activeCustomers: 1500, multiShopPct: 25 } });
    expect(o.gates.thresholds).toEqual(campaignsApi.UNLOCK_PER_NEIGHBOURHOOD);
    // Privacy: the response has only these keys, and no phone number appears.
    expect(Object.keys(o).sort()).toEqual(["activeMembers", "gates", "multiShopPct", "period", "prior", "shops", "shopsTable", "visits", "weekly"]);
    expect(Object.keys(o.shopsTable[0]!).sort()).toEqual(["activated", "id", "name", "newMembers", "status", "visits"]);
    for (const p of [a, b, c, d]) expect(res.body).not.toContain(p.slice(2));
    expect(res.body).not.toMatch(/userId|memberCode|"phone"|"email"|memberId/);
  });

  it("returns 12 weekly buckets and marks the weeks a campaign runs", async () => {
    const s = await street(2);
    const starts = new Date(env.clock.now.getTime() - 15 * DAY);
    await env.db.insert(featureRollouts).values({ key: "campaigns.neighbourhood", stage: "ga" }).onConflictDoNothing();
    const id = await withClockAt(new Date(starts.getTime() - HOUR), async () => {
      const c = await env.app.inject({
        method: "POST",
        url: "/v1/campaigns",
        headers: s.admin,
        payload: { neighbourhoodId: s.hood.id, name: "Passport week", kind: "passport", startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 7 * DAY).toISOString() },
      });
      expect(c.statusCode).toBe(201);
      expect((await env.app.inject({ method: "POST", url: `/v1/campaigns/${c.json().id}/schedule`, headers: s.admin })).statusCode).toBe(200);
      return c.json().id as string;
    });
    await visit(s.ids[0]!, nextPhone(), -9 * DAY);
    const o = (await get(`/v1/neighbourhoods/${s.hood.id}/overview`, s.manager)).json() as campaignsApi.NeighbourhoodOverview;
    expect(o.weekly).toHaveLength(12);
    const marked = o.weekly.filter((w) => w.campaignIds.includes(id));
    expect(marked.length).toBeGreaterThanOrEqual(2);
    expect(marked.length).toBeLessThanOrEqual(3);
    expect(o.weekly.some((w) => w.campaignIds.length === 0)).toBe(true);
    expect(o.weekly.reduce((n, w) => n + w.visits, 0)).toBe(1);
    expect(o.weekly.every((w) => new Date(`${w.weekStart}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
  });

  it("reads zeros on a street with no activity", async () => {
    const s = await street(1);
    const o = (await get(`/v1/neighbourhoods/${s.hood.id}/overview`, s.manager)).json() as campaignsApi.NeighbourhoodOverview;
    expect(o.gates).toMatchObject({ liveMonths: 0, activeShops: 1, activeCustomers: 0, multiShopPct: 0 });
    expect(o.visits).toEqual({ value: 0, deltaPct: null });
    expect(o.weekly.every((w) => w.visits === 0)).toBe(true);
  });
});

describe("GET /v1/neighbourhoods/:id/report", () => {
  async function ranCampaign() {
    await env.db.insert(featureRollouts).values({ key: "campaigns.neighbourhood", stage: "ga" }).onConflictDoNothing();
    const s = await street(2);
    const start = new Date(env.clock.now.getTime() - 20 * DAY);
    const c = await withClockAt(new Date(start.getTime() - HOUR), async () => {
      const made = (
        await env.app.inject({
          method: "POST",
          url: "/v1/campaigns",
          headers: s.admin,
          payload: { neighbourhoodId: s.hood.id, name: "=SUM(1+1) Passport week", kind: "passport", startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 7 * DAY).toISOString(), goalVisits: 2 },
        })
      ).json();
      await env.app.inject({ method: "POST", url: `/v1/campaigns/${made.id}/schedule`, headers: s.admin });
      for (const id of s.ids) await env.app.inject({ method: "POST", url: `/v1/campaigns/${made.id}/merchants`, headers: s.admin, payload: { merchantId: id } });
      return made;
    });
    return { s, c, start };
  }

  it("returns the period report as JSON with each campaign's summary, aggregates only", async () => {
    const { s, c, start } = await ranCampaign();
    const phone = nextPhone();
    await visit(s.ids[0]!, phone, start.getTime() + 2 * DAY - env.clock.now.getTime());
    await runCampaignLifecycle(env.ctx);
    const res = await get(`/v1/neighbourhoods/${s.hood.id}/report`, s.manager);
    expect(res.statusCode).toBe(200);
    const r = res.json() as campaignsApi.NeighbourhoodReport;
    expect(r.campaigns.map((x) => x.id)).toEqual([c.id]);
    expect(r.campaigns[0]).toMatchObject({ status: "ended", shops: 2, report: { visits: 1, uniqueCustomers: 1 } });
    expect(r.overview.visits.value).toBe(1);
    expect(r.generatedAt).toBe(env.clock.now.toISOString());
    expect(res.body).not.toContain(phone.slice(2));
    expect(res.body).not.toMatch(/userId|memberCode|"phone"|"email"|memberId/);
    expect((await get(`/v1/neighbourhoods/${s.hood.id}/report`, s.stranger)).statusCode).toBe(403);
    // A period before the campaign has none.
    const before = await get(`/v1/neighbourhoods/${s.hood.id}/report?from=2026-01-01&to=2026-02-01`, s.manager);
    expect((before.json() as campaignsApi.NeighbourhoodReport).campaigns).toEqual([]);
  });

  it("returns a CSV download with a formula-safe campaign name", async () => {
    const { s } = await ranCampaign();
    const res = await get(`/v1/neighbourhoods/${s.hood.id}/report?format=csv`, s.manager);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="[a-z0-9-]+-board-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.body).toContain("came_back_within_30_days");
    expect(res.body).toContain("'=SUM(1+1) Passport week");
    expect(res.body).toContain("Aggregates only");
    expect((await get(`/v1/neighbourhoods/${s.hood.id}/report?format=pdf`, s.manager)).statusCode).toBe(400);
  });
});

describe("CampaignReport: came back within 30 days", () => {
  it("counts a customer back 10 days after, not one back after 40; null with the date until the window closes", async () => {
    await env.db.insert(featureRollouts).values({ key: "campaigns.neighbourhood", stage: "ga" }).onConflictDoNothing();
    const s = await street(3);
    const start = new Date(env.clock.now.getTime() - 60 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const c = await withClockAt(new Date(start.getTime() - HOUR), async () => {
      const made = (
        await env.app.inject({ method: "POST", url: "/v1/campaigns", headers: s.admin, payload: { neighbourhoodId: s.hood.id, name: "Passport week", kind: "passport", startsAt: start.toISOString(), endsAt: end.toISOString() } })
      ).json();
      await env.app.inject({ method: "POST", url: `/v1/campaigns/${made.id}/schedule`, headers: s.admin });
      // Only shops 0 and 1 take part; shop 2 is on the street but not in the campaign.
      for (const id of s.ids.slice(0, 2)) await env.app.inject({ method: "POST", url: `/v1/campaigns/${made.id}/merchants`, headers: s.admin, payload: { merchantId: id } });
      return made;
    });
    const [early, late, none, back] = [nextPhone(), nextPhone(), nextPhone(), nextPhone()];
    const at = (d: number) => start.getTime() + d * DAY - env.clock.now.getTime();
    // Event visits (days 1 to 3 of the campaign).
    await visit(s.ids[0]!, early, at(1));
    await visit(s.ids[1]!, late, at(2));
    await visit(s.ids[0]!, none, at(3));
    await visit(s.ids[1]!, back, at(4));
    // Visits after the end (day 7): early +10 days at the OTHER street shop (counts: any shop in the neighbourhood);
    // late +40 days (does not); back +25 days at a participating shop (counts); a stranger who never came to the event.
    await visit(s.ids[2]!, early, at(17));
    await visit(s.ids[0]!, late, at(47));
    await visit(s.ids[1]!, back, at(32));
    await visit(s.ids[2]!, nextPhone(), at(20));

    // The window is still open the day before it closes.
    env.clock.now = new Date(end.getTime() + 29 * DAY);
    const open = (await get(`/v1/campaigns/${c.id}/report`, s.manager)).json() as campaignsApi.CampaignReport;
    expect(open.returnedWithin30d).toBeNull();
    expect(open.returnedWithin30dPct).toBeNull();
    expect(open.returnWindowEndsAt).toBe(new Date(end.getTime() + 30 * DAY).toISOString());

    env.clock.now = new Date(end.getTime() + 30 * DAY);
    const res = await get(`/v1/campaigns/${c.id}/report`, s.manager);
    const r = res.json() as campaignsApi.CampaignReport;
    expect(r.uniqueCustomers).toBe(4);
    expect(r.returnedWithin30d).toBe(2); // early and back; late came back 40 days after, none never did
    expect(r.returnedWithin30dPct).toBe(50);
    // The baseline window has no event visitors, so its measure is 0 of 0.
    expect(r.baselineReturnedWithin30d).toBe(0);
    expect(r.baselineReturnedWithin30dPct).toBeNull();
    for (const p of [early, late, none, back]) expect(res.body).not.toContain(p.slice(2));
  });
});
