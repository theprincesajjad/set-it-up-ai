import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { leads, merchantStaff, merchants, users } from "@ll/db";
import { repApi } from "@ll/shared";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 3 });
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const DAY = 86400000;

async function rep(name = "Rita Rep") {
  const u = await createUser(env.db, { name, email: `${name.replace(/\s/g, "").toLowerCase()}${Math.random().toString(36).slice(2, 6)}@example.com`, platformRole: "rep" });
  return { user: u, token: await tokenFor(env, u) };
}

describe("rep console", () => {
  it("requires the rep platform role", async () => {
    const user = await createUser(env.db);
    expect((await env.app.inject({ method: "GET", url: "/v1/rep/leads" })).statusCode).toBe(401);
    expect((await env.app.inject({ method: "GET", url: "/v1/rep/leads", headers: auth(await tokenFor(env, user)) })).statusCode).toBe(403);
    const admin = await createUser(env.db, { platformRole: "admin" });
    expect((await env.app.inject({ method: "GET", url: "/v1/rep/leads", headers: auth(await tokenFor(env, admin)) })).statusCode).toBe(200);
  });

  it("runs the leads pipeline with activities and visibility rules", async () => {
    const r1 = await rep("Rita");
    const r2 = await rep("Sam");
    const hood = await createNeighbourhood(env.db);
    const create = await env.app.inject({
      method: "POST",
      url: "/v1/rep/leads",
      headers: auth(r1.token),
      payload: { businessName: "Cherry Bomb Coffee", vertical: "cafe", phone: "416 555 1111", neighbourhoodId: hood.id, currentLoyalty: "paper punch card" },
    });
    expect(create.statusCode).toBe(201);
    const lead = create.json();
    expect(lead).toMatchObject({ stage: "new", assignedRepId: r1.user.id, phone: "+14165551111" });
    // Reps can't assign to others.
    expect((await env.app.inject({ method: "POST", url: "/v1/rep/leads", headers: auth(r1.token), payload: { businessName: "X", assignedRepId: r2.user.id } })).statusCode).toBe(403);
    // Another rep can't see it; an unassigned lead is visible to everyone and claimed on touch.
    expect((await env.app.inject({ method: "GET", url: `/v1/rep/leads/${lead.id}`, headers: auth(r2.token) })).statusCode).toBe(404);
    await env.db.insert(leads).values({ businessName: "Unassigned Bakery", stage: "new" });
    const r2list = (await env.app.inject({ method: "GET", url: "/v1/rep/leads", headers: auth(r2.token) })).json();
    expect(r2list.items.map((l: { businessName: string }) => l.businessName)).toEqual(["Unassigned Bakery"]);

    const act = await env.app.inject({
      method: "POST",
      url: `/v1/rep/leads/${lead.id}/activities`,
      headers: auth(r1.token),
      payload: { kind: "call", outcome: "interested", notes: "Owner Maria, call back Tue", nextActionAt: new Date(env.clock.now.getTime() + DAY).toISOString() },
    });
    expect(act.json()).toMatchObject({ stage: "contacted", activityCount: 1 });
    expect(act.json().activities[0]).toMatchObject({ kind: "call", outcome: "interested" });
    const up = await env.app.inject({ method: "PATCH", url: `/v1/rep/leads/${lead.id}`, headers: auth(r1.token), payload: { stage: "visit_booked" } });
    expect(up.json().stage).toBe("visit_booked");
    expect((await env.app.inject({ method: "PATCH", url: `/v1/rep/leads/${lead.id}`, headers: auth(r1.token), payload: { stage: "maybe" } })).statusCode).toBe(400);

    const filtered = (await env.app.inject({ method: "GET", url: "/v1/rep/leads?stage=visit_booked&q=cherry", headers: auth(r1.token) })).json();
    expect(filtered.items).toHaveLength(1);
    expect((await env.app.inject({ method: "GET", url: "/v1/rep/leads?due=true", headers: auth(r1.token) })).json().items).toHaveLength(0);
  });

  it("creates a merchant on behalf of the owner (done-for-you), QR kit, activation tracking, commission", async () => {
    const r = await rep();
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    const lead = (await env.app.inject({ method: "POST", url: "/v1/rep/leads", headers: auth(r.token), payload: { businessName: "Roncy Repair", neighbourhoodId: hood.id } })).json();
    const res = await env.app.inject({
      method: "POST",
      url: "/v1/rep/merchants",
      headers: auth(r.token),
      payload: { name: "Roncy Repair", vertical: "repair_electronics", address: "200 Roncesvalles Ave", phone: "4165552222", owner: { name: "Omar", email: "omar@roncyrepair.example" }, leadId: lead.id },
    });
    expect(res.statusCode).toBe(201);
    const { merchant, program, locations } = res.json();
    expect(merchant.repUserId).toBe(r.user.id);
    expect(merchant.neighbourhoodId).toBe(hood.id);
    expect(program.earnType).toBe("per_dollar");
    expect(locations[0].qrCode).toBeTruthy();
    // Owner is the invited user, not the rep.
    const staff = await env.db.select().from(merchantStaff).where(eq(merchantStaff.merchantId, merchant.id));
    const [owner] = await env.db.select().from(users).where(eq(users.id, staff[0]!.userId));
    expect(owner!.email).toBe("omar@roncyrepair.example");
    expect(staff[0]!.role).toBe("owner");
    expect(env.ctx.providers.outbox.email.at(-1)).toMatchObject({ to: "omar@roncyrepair.example" });
    const [l] = await env.db.select().from(leads).where(eq(leads.id, lead.id));
    expect(l).toMatchObject({ stage: "signed", merchantId: merchant.id });
    // Rep acts as owner for setup through the merchant API.
    expect((await env.app.inject({ method: "PATCH", url: `/v1/merchants/${merchant.id}/program`, headers: auth(r.token), payload: { welcomeBonus: 100 } })).statusCode).toBe(200);
    // Creating again from the same lead is refused.
    expect(
      (await env.app.inject({ method: "POST", url: "/v1/rep/merchants", headers: auth(r.token), payload: { name: "Dup", vertical: "cafe", address: "1 St", phone: "4165552223", owner: { phone: "4165552224" }, leadId: lead.id } })).statusCode,
    ).toBe(400);
    expect((await env.app.inject({ method: "POST", url: "/v1/rep/merchants", headers: auth(r.token), payload: { name: "No owner", vertical: "cafe", address: "1 St", phone: "4165552223", owner: {} } })).statusCode).toBe(400);

    const kit = (await env.app.inject({ method: "GET", url: `/v1/rep/merchants/${merchant.id}/qr-kit`, headers: auth(r.token) })).json();
    expect(kit.locations[0].joinUrl).toBe(`http://localhost:3000/j/${locations[0].qrCode}`);
    expect(kit.locations[0].qrSvg).toContain("<svg");
    const other = await rep("Other");
    expect((await env.app.inject({ method: "GET", url: `/v1/rep/merchants/${merchant.id}/qr-kit`, headers: auth(other.token) })).statusCode).toBe(404);

    // Activation tracking.
    let mine = (await env.app.inject({ method: "GET", url: "/v1/rep/merchants", headers: auth(r.token) })).json().items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ activeMembers: 0, target: 3, progressPct: 0 });
    expect(mine[0].checkIns.map((c: { due: boolean }) => c.due)).toEqual([false, false]);
    let comm = (await env.app.inject({ method: "GET", url: "/v1/rep/commission", headers: auth(r.token) })).json();
    expect(comm).toMatchObject({ merchantsSigned: 1, signedEarnedCents: 5000, activationEarnedCents: 0, pendingBonusCents: 2500 });
    expect(comm.items[0].bonusStatus).toBe("pending");

    env.clock.now = new Date(env.clock.now.getTime() + 8 * DAY);
    const t2 = await tokenFor(env, r.user);
    mine = (await env.app.inject({ method: "GET", url: "/v1/rep/merchants", headers: auth(t2) })).json().items;
    expect(mine[0].checkIns[0].due).toBe(true);
    const ci = await env.app.inject({ method: "POST", url: `/v1/rep/merchants/${merchant.id}/check-ins`, headers: auth(t2), payload: { day: 7, outcome: "staff trained" } });
    expect(ci.statusCode).toBe(201);
    expect(ci.json().checkIns[0]).toMatchObject({ due: false });
    expect(ci.json().checkIns[0].doneAt).not.toBeNull();

    // Merchant activates (3 members with a visit) inside 30 days → bonus earned, lead → activated.
    for (let i = 0; i < 3; i++) await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 2500 });
    comm = (await env.app.inject({ method: "GET", url: "/v1/rep/commission", headers: auth(t2) })).json();
    expect(comm).toMatchObject({ merchantsActivated: 1, activationEarnedCents: repApi.REP_COMMISSION.activationBonusCents, totalEarnedCents: 7500, pendingBonusCents: 0 });
    const leadNow = (await env.app.inject({ method: "GET", url: `/v1/rep/leads/${lead.id}`, headers: auth(t2) })).json();
    expect(leadNow.stage).toBe("activated");
  });

  it("no activation bonus when the merchant activates after the 30-day window", async () => {
    const r = await rep();
    const m = await createMerchant(env);
    await env.db.update(merchants).set({ repUserId: r.user.id, createdAt: new Date(env.clock.now.getTime() - 40 * DAY), activatedAt: env.clock.now }).where(eq(merchants.id, m.merchant.id));
    const comm = (await env.app.inject({ method: "GET", url: "/v1/rep/commission", headers: auth(r.token) })).json();
    expect(comm.items[0]).toMatchObject({ bonusStatus: "missed", activationBonusCents: 0 });
    expect(comm.totalEarnedCents).toBe(5000);
  });
});
