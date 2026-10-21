import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, featureRollouts, merchants, users } from "@ll/db";
import { FEATURES, FREE_FOREVER } from "@ll/shared";
import { requireFeature } from "../src/services/features.js";
import { awardPurchase } from "../src/services/ledger.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
let adminToken: string;
let admin: Awaited<ReturnType<typeof createUser>>;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 1 });
  admin = await createUser(env.db, { email: "admin@example.com", name: "Ada Admin", platformRole: "admin" });
  adminToken = await tokenFor(env, admin);
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const get = (url: string, token = adminToken) => env.app.inject({ method: "GET", url, headers: auth(token) });

describe("admin", () => {
  it("is admin-only (reps and merchants are refused)", async () => {
    const rep = await createUser(env.db, { platformRole: "rep" });
    const { ownerToken } = await createMerchant(env);
    expect((await env.app.inject({ method: "GET", url: "/v1/admin/dashboard" })).statusCode).toBe(401);
    expect((await get("/v1/admin/dashboard", await tokenFor(env, rep))).statusCode).toBe(403);
    expect((await get("/v1/admin/features", ownerToken)).statusCode).toBe(403);
    expect((await get("/v1/admin/dashboard")).statusCode).toBe(200);
  });

  it("network dashboard", async () => {
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    const a = await createMerchant(env, { neighbourhoodId: hood.id });
    const b = await createMerchant(env, { neighbourhoodId: hood.id });
    await createMerchant(env);
    const phone = nextPhone();
    await awardPurchase(env.ctx, { merchantId: a.merchant.id, phone, source: "staff_app", amountCents: 1000 });
    await awardPurchase(env.ctx, { merchantId: b.merchant.id, phone, source: "staff_app", amountCents: 1000 });
    await awardPurchase(env.ctx, { merchantId: a.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });
    const d = (await get("/v1/admin/dashboard")).json();
    expect(d.merchants.total).toBe(3);
    expect(d.merchants.byStatus.active).toBe(3);
    expect(d.merchants.byVertical).toEqual([{ vertical: "pharmacy", count: 3 }]);
    expect(d.merchants.byNeighbourhood.find((h: { name: string }) => h.name === "roncesvalles")).toMatchObject({ merchants: 2, activated: 2 });
    expect(d).toMatchObject({ activatedMerchants: 2, customers: 2, multiShopCustomers: 1, multiShopPct: 0.5, memberships: 3 });
    expect(d.weeklyVisits).toHaveLength(8);
  });

  it("feature rollout: stages, free-forever protection, audit, overrides, plan availability", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const list = (await get("/v1/admin/features")).json().items;
    const sms = list.find((f: { key: string }) => f.key === "marketing.sms");
    expect(sms).toMatchObject({ stage: "hidden", minPlan: "plus", unlockAtMerchants: FEATURES["marketing.sms"].unlockAtMerchants, activeMerchants: 1, readyToUnlock: false, freeForever: false });
    expect(list.find((f: { key: string }) => f.key === "loyalty.points").freeForever).toBe(true);

    // Free-forever features can only be GA.
    for (const key of ["loyalty.points", "customers.csv_export", "marketing.email"]) {
      for (const stage of ["hidden", "beta"]) {
        const r = await env.app.inject({ method: "PUT", url: `/v1/admin/features/${key}/stage`, headers: auth(adminToken), payload: { stage } });
        expect(r.statusCode).toBe(422);
        expect(r.json().error.code).toBe("free_forever");
      }
    }
    expect(FREE_FOREVER.length).toBeGreaterThan(20);
    expect((await env.app.inject({ method: "PUT", url: `/v1/admin/features/loyalty.points/stage`, headers: auth(adminToken), payload: { stage: "ga" } })).statusCode).toBe(200);
    expect((await env.app.inject({ method: "PUT", url: `/v1/admin/features/nope.nope/stage`, headers: auth(adminToken), payload: { stage: "ga" } })).statusCode).toBe(404);

    // Plans become purchasable when a paid feature leaves "hidden".
    let plans = (await get("/v1/admin/plans")).json().items;
    expect(plans.map((p: { available: boolean }) => p.available)).toEqual([true, false, false]);
    const beta = await env.app.inject({ method: "PUT", url: `/v1/admin/features/marketing.sms/stage`, headers: auth(adminToken), payload: { stage: "beta", note: "Pilot on Roncy" } });
    expect(beta.json()).toMatchObject({ stage: "beta", note: "Pilot on Roncy", updatedBy: admin.id });
    plans = (await get("/v1/admin/plans")).json().items;
    expect(plans[1]).toMatchObject({ id: "plus", available: true });
    const [row] = await env.db.select().from(featureRollouts).where(eq(featureRollouts.key, "marketing.sms"));
    expect(row!.stage).toBe("beta");
    const audit = (await get("/v1/admin/audit?action=feature.")).json().items;
    expect(audit[0]).toMatchObject({ action: "feature.stage_changed", entityId: "marketing.sms", actorName: "Ada Admin", data: { from: "hidden", to: "beta" } });

    // Merchant sees it as a beta (plan lock since they're free).
    const f = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/features`, headers: auth(ownerToken) })).json();
    expect(f.features.find((x: { key: string }) => x.key === "marketing.sms").lockedReason).toBe("rollout");

    // Per-merchant override (pilot shop).
    await expect(requireFeature(env.db, merchant, "service.tickets")).rejects.toMatchObject({ statusCode: 402 });
    const ov = await env.app.inject({ method: "PUT", url: `/v1/admin/features/service.tickets/overrides`, headers: auth(adminToken), payload: { merchantId: merchant.id, enabled: true, reason: "Pro pilot" } });
    expect(ov.json().items).toEqual([expect.objectContaining({ merchantId: merchant.id, enabled: true, reason: "Pro pilot" })]);
    await expect(requireFeature(env.db, merchant, "service.tickets")).resolves.toBeUndefined();
    // Can't force a free-forever feature off for a merchant.
    const off = await env.app.inject({ method: "PUT", url: `/v1/admin/features/loyalty.points/overrides`, headers: auth(adminToken), payload: { merchantId: merchant.id, enabled: false } });
    expect(off.statusCode).toBe(422);
    expect((await get("/v1/admin/features")).json().items.find((x: { key: string }) => x.key === "service.tickets").overrides).toEqual({ enabled: 1, disabled: 0 });
    expect((await env.app.inject({ method: "DELETE", url: `/v1/admin/features/service.tickets/overrides/${merchant.id}`, headers: auth(adminToken) })).statusCode).toBe(204);
    await expect(requireFeature(env.db, merchant, "service.tickets")).rejects.toMatchObject({ statusCode: 402 });
  });

  it("neighbourhoods and network perks CRUD", async () => {
    const c = await env.app.inject({
      method: "POST",
      url: "/v1/admin/neighbourhoods",
      headers: auth(adminToken),
      payload: { slug: "junction", name: "The Junction", status: "scouting", centerLat: 43.665, centerLng: -79.467, biaName: "The Junction BIA", biaContactPhone: "416-555-3333", storefrontEstimate: 120 },
    });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ slug: "junction", biaContactPhone: "+14165553333", merchants: 0 });
    expect((await env.app.inject({ method: "POST", url: "/v1/admin/neighbourhoods", headers: auth(adminToken), payload: { slug: "junction", name: "Dup" } })).statusCode).toBe(409);
    expect((await env.app.inject({ method: "POST", url: "/v1/admin/neighbourhoods", headers: auth(adminToken), payload: { slug: "Bad Slug", name: "x" } })).statusCode).toBe(400);
    const id = c.json().id;
    const u = await env.app.inject({ method: "PATCH", url: `/v1/admin/neighbourhoods/${id}`, headers: auth(adminToken), payload: { status: "pilot" } });
    expect(u.json().status).toBe("pilot");

    const perk = await env.app.inject({ method: "POST", url: "/v1/admin/perks", headers: auth(adminToken), payload: { neighbourhoodId: id, name: "Visit 3 shops", bonusPoints: 75 } });
    expect(perk.statusCode).toBe(201);
    expect(perk.json()).toMatchObject({ threshold: 3, windowDays: 30, bonusPoints: 75, active: true, awards: 0 });
    const list = (await get(`/v1/admin/perks?neighbourhoodId=${id}`)).json().items;
    expect(list).toHaveLength(1);
    const up = await env.app.inject({ method: "PATCH", url: `/v1/admin/perks/${perk.json().id}`, headers: auth(adminToken), payload: { threshold: 4 } });
    expect(up.json().threshold).toBe(4);

    // Perk actually fires through the ledger.
    const shops = await Promise.all([1, 2, 3, 4].map(() => createMerchant(env, { neighbourhoodId: id })));
    const phone = nextPhone();
    let last;
    for (const s of shops) last = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, source: "staff_app", amountCents: 500 });
    expect(last!.extraPoints).toBe(75);
    expect((await env.app.inject({ method: "DELETE", url: `/v1/admin/perks/${perk.json().id}`, headers: auth(adminToken) })).json()).toEqual({ deleted: false, deactivated: true });
    expect((await env.app.inject({ method: "DELETE", url: `/v1/admin/neighbourhoods/${id}`, headers: auth(adminToken) })).statusCode).toBe(409);
    const n2 = await env.app.inject({ method: "POST", url: "/v1/admin/neighbourhoods", headers: auth(adminToken), payload: { slug: "empty", name: "Empty" } });
    expect((await env.app.inject({ method: "DELETE", url: `/v1/admin/neighbourhoods/${n2.json().id}`, headers: auth(adminToken) })).statusCode).toBe(204);
  });

  it("merchants list/search/pause/close", async () => {
    const a = await createMerchant(env, { slug: "cafe-one" });
    await env.db.update(merchants).set({ name: "Cafe One" }).where(eq(merchants.id, a.merchant.id));
    await createMerchant(env, { slug: "bakery-two" });
    const list = (await get("/v1/admin/merchants?q=cafe")).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ slug: "cafe-one", members: 0 });
    const page = (await get("/v1/admin/merchants?limit=1")).json();
    expect(page.nextCursor).not.toBeNull();
    const detail = (await get(`/v1/admin/merchants/${a.merchant.id}`)).json();
    expect(detail.staff[0].role).toBe("owner");
    expect((await env.app.inject({ method: "POST", url: `/v1/admin/merchants/${a.merchant.id}/status`, headers: auth(adminToken), payload: { status: "paused" } })).statusCode).toBe(400);
    const paused = await env.app.inject({ method: "POST", url: `/v1/admin/merchants/${a.merchant.id}/status`, headers: auth(adminToken), payload: { status: "paused", reason: "Owner request" } });
    expect(paused.json().status).toBe("paused");
    await expect(awardPurchase(env.ctx, { merchantId: a.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 100 })).rejects.toMatchObject({ statusCode: 409 });
    expect((await get("/v1/admin/merchants?status=paused")).json().items).toHaveLength(1);
    const logs = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "merchant.status_changed"));
    expect(logs[0]!.data).toMatchObject({ from: "active", to: "paused", reason: "Owner request" });
  });

  it("users search and platform roles", async () => {
    const u = await createUser(env.db, { name: "Riley Rep", email: "riley@example.com", phone: "+14165559090" });
    expect((await get("/v1/admin/users?q=riley")).json().items[0].id).toBe(u.id);
    expect((await get("/v1/admin/users?q=559090")).json().items[0].id).toBe(u.id);
    const r = await env.app.inject({ method: "PUT", url: `/v1/admin/users/${u.id}/role`, headers: auth(adminToken), payload: { platformRole: "rep" } });
    expect(r.json()).toEqual({ id: u.id, platformRole: "rep" });
    const [row] = await env.db.select().from(users).where(eq(users.id, u.id));
    expect(row!.platformRole).toBe("rep");
    expect((await get("/v1/admin/users?platformRole=rep")).json().items).toHaveLength(1);
    expect((await env.app.inject({ method: "PUT", url: `/v1/admin/users/${admin.id}/role`, headers: auth(adminToken), payload: { platformRole: "none" } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "PUT", url: `/v1/admin/users/${u.id}/role`, headers: auth(adminToken), payload: { platformRole: "god" } })).statusCode).toBe(400);
    const audit = (await get(`/v1/admin/audit?entity=user`)).json().items;
    expect(audit[0]).toMatchObject({ action: "user.platform_role_changed", entityId: u.id });
  });
});
