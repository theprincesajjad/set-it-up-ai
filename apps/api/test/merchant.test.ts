import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, discountCards, ledgerEntries, merchantCategories, merchantMembers, merchantStaff, merchants, neighbourhoods } from "@ll/db";
import { VERTICAL_TEMPLATES } from "@ll/shared";
import { awardPurchase, ledgerBalance } from "../src/services/ledger.js";
import { verifyMerchantApiKey } from "../src/services/merchant.js";
import { createMerchant, createNeighbourhood, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv, grantFeatures } from "./helpers.js";

/** Pricing v2: promos, VIP, discount cards, CSV and the API are Plus (hidden at launch). Pilot shops get them via admin overrides. */
const PLUS_PROGRAM_FEATURES = ["promos.basic", "promos.double_points", "loyalty.vip_levels", "discount_cards", "customers.csv_export", "customers.csv_import", "integrations.webhooks"] as const;
async function createPilotMerchant(env: TestEnv, opts: Parameters<typeof createMerchant>[1] = {}) {
  const m = await createMerchant(env, opts);
  await grantFeatures(env, m.merchant.id, [...PLUS_PROGRAM_FEATURES]);
  return m;
}

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ activationThreshold: 3 });
});
afterEach(async () => env.close());

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signup(token: string, body: Record<string, unknown> = {}) {
  return env.app.inject({
    method: "POST",
    url: "/v1/merchants",
    headers: auth(token),
    payload: { name: "Sorauren Pharmacy", vertical: "pharmacy", address: "123 Roncesvalles Ave", phone: "(416) 555-0199", ...body },
  });
}

/** Add a user to a merchant with a role; returns their token. */
async function addStaff(merchantId: string, role: "owner" | "manager" | "staff") {
  const u = await createUser(env.db, { email: `${role}${Math.random().toString(36).slice(2)}@example.com` });
  await env.db.insert(merchantStaff).values({ merchantId, userId: u.id, role });
  return { user: u, token: await tokenFor(env, u) };
}

describe("merchant signup + template", () => {
  it("creates merchant, owner, location with QR, and applies the pharmacy template", async () => {
    const hood = await createNeighbourhood(env.db, "roncesvalles");
    const owner = await createUser(env.db, { email: "owner@example.com" });
    const res = await signup(await tokenFor(env, owner), { neighbourhoodSlug: "roncesvalles" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.role).toBe("owner");
    expect(body.merchant.slug).toBe("sorauren-pharmacy");
    expect(body.merchant.status).toBe("onboarding");
    expect(body.merchant.phone).toBe("+14165550199");
    expect(body.merchant.neighbourhoodId).toBe(hood.id);
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].qrCode).toMatch(/^[A-Z0-9]{7}$/);
    expect(body.locations[0].joinUrl).toBe(`http://localhost:3000/j/${body.locations[0].qrCode}`);
    expect(body.program.earnType).toBe("per_dollar");
    expect(body.program.expiryMonths).toBeNull();
    expect(body.program.expiryDisclosure).toMatch(/never expire/);

    const cats = await env.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, body.merchant.id));
    const rx = cats.find((c) => c.name === "Prescriptions")!;
    expect(rx.earnEligible).toBe(false);
    expect(rx.discountEligible).toBe(false);
    expect(cats).toHaveLength(VERTICAL_TEMPLATES.pharmacy.categories.length);
    const [card] = await env.db.select().from(discountCards).where(eq(discountCards.merchantId, body.merchant.id));
    expect(card!.excludedCategoryIds).toContain(rx.id);
    const [staff] = await env.db.select().from(merchantStaff).where(eq(merchantStaff.merchantId, body.merchant.id));
    expect(staff!.userId).toBe(owner.id);

    // Second shop with the same name gets a unique slug.
    const res2 = await signup(await tokenFor(env, owner));
    expect(res2.json().merchant.slug).toBe("sorauren-pharmacy-2");

    // Lists my merchants.
    const mine = await env.app.inject({ method: "GET", url: "/v1/merchants", headers: auth(await tokenFor(env, owner)) });
    expect(mine.json().items).toHaveLength(2);
  });

  it("validates input and requires auth", async () => {
    const owner = await createUser(env.db);
    expect((await env.app.inject({ method: "POST", url: "/v1/merchants", payload: {} })).statusCode).toBe(401);
    expect((await signup(await tokenFor(env, owner), { vertical: "casino" })).statusCode).toBe(400);
    expect((await signup(await tokenFor(env, owner), { phone: "12" })).statusCode).toBe(400);
    expect((await signup(await tokenFor(env, owner), { neighbourhoodSlug: "nope" })).statusCode).toBe(400);
  });

  it("a stamp-card template works end to end with the ledger", async () => {
    const owner = await createUser(env.db);
    const res = await signup(await tokenFor(env, owner), { name: "Cafe Uno", vertical: "cafe" });
    const id = res.json().merchant.id;
    const r = await awardPurchase(env.ctx, { merchantId: id, phone: nextPhone(), source: "staff_app" });
    expect(r.member.balance).toBe(2); // 1 welcome stamp + 1 visit stamp
  });
});

describe("profile, onboarding, features", () => {
  it("updates profile (manager+), drives the onboarding checklist", async () => {
    const owner = await createUser(env.db);
    const ownerToken = await tokenFor(env, owner);
    const { merchant } = (await signup(ownerToken, { vertical: "bakery", name: "Bread & Co" })).json();
    const staff = await addStaff(merchant.id, "staff");
    let r = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${merchant.id}`, headers: auth(staff.token), payload: { description: "x" } });
    expect(r.statusCode).toBe(403);

    let cl = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/onboarding`, headers: auth(staff.token) })).json();
    expect(cl.currentStep).toBe("profile");
    expect(cl.steps.find((s: { key: string }) => s.key === "program").done).toBe(true);
    expect(cl.steps.find((s: { key: string }) => s.key === "staff").done).toBe(true); // owner + staff

    r = await env.app.inject({
      method: "PATCH",
      url: `/v1/merchants/${merchant.id}`,
      headers: auth(ownerToken),
      payload: { description: "Sourdough on Roncy", logoUrl: "https://cdn.example.com/logo.png", brandColor: "#AA3311", instagram: "@breadco", hours: { mon: [["07:00", "15:00"]] } },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().merchant.instagram).toBe("breadco");
    expect(r.json().merchant.hours.mon).toEqual([["07:00", "15:00"]]);
    expect(r.json().locations[0].hours.mon).toEqual([["07:00", "15:00"]]);
    expect((await env.app.inject({ method: "PATCH", url: `/v1/merchants/${merchant.id}`, headers: auth(ownerToken), payload: { brandColor: "red" } })).statusCode).toBe(400);

    cl = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/onboarding`, headers: auth(ownerToken) })).json();
    expect(cl.currentStep).toBe("qr_kit");
    cl = (await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/onboarding/complete`, headers: auth(ownerToken), payload: { step: "qr_kit" } })).json();
    expect(cl.currentStep).toBe("first_members");
    for (let i = 0; i < 3; i++) await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app" });
    cl = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/onboarding`, headers: auth(ownerToken) })).json();
    expect(cl.currentStep).toBe("done");
    expect(cl.percentComplete).toBe(100);
    expect(cl.activatedAt).not.toBeNull();
  });

  it("returns features with lock reasons and lets owners opt into betas", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const r = await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/features`, headers: auth(ownerToken) });
    expect(r.statusCode).toBe(200);
    const f = Object.fromEntries(r.json().features.map((x: { key: string }) => [x.key, x]));
    expect(f["loyalty.points"].enabled).toBe(true);
    expect(f["marketing.sms"]).toMatchObject({ enabled: false, lockedReason: "rollout", minPlan: "plus" });
    expect(r.json().plansAvailable).toEqual({ free: true, plus: false, pro: false });
    const staff = await addStaff(merchant.id, "manager");
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/beta`, headers: auth(staff.token), payload: { optIn: true } })).statusCode).toBe(403);
    const b = await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/beta`, headers: auth(ownerToken), payload: { optIn: true } });
    expect(b.json().betaOptIn).toBe(true);
  });

  it("isolates merchants and rejects malformed ids", async () => {
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${b.merchant.id}`, headers: auth(a.ownerToken) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${b.merchant.id}/customers`, headers: auth(a.ownerToken) })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/not-a-uuid`, headers: auth(a.ownerToken) })).statusCode).toBe(404);
    // A reward id from merchant B can't be edited through merchant A.
    expect(
      (await env.app.inject({ method: "PATCH", url: `/v1/merchants/${a.merchant.id}/rewards/${b.reward.id}`, headers: auth(a.ownerToken), payload: { name: "hack" } })).statusCode,
    ).toBe(404);
  });

  it("generates, verifies and revokes API keys (owner only)", async () => {
    const { merchant, ownerToken } = await createPilotMerchant(env);
    const mgr = await addStaff(merchant.id, "manager");
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/api-key`, headers: auth(mgr.token) })).statusCode).toBe(403);
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/api-key`, headers: auth(ownerToken) });
    expect(r.statusCode).toBe(201);
    const key = r.json().apiKey as string;
    expect(key.startsWith("llk_")).toBe(true);
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, merchant.id));
    expect(m!.apiKeyHash).not.toContain(key);
    expect((await verifyMerchantApiKey(env.db, key))?.id).toBe(merchant.id);
    const r2 = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/api-key`, headers: auth(ownerToken) });
    expect(await verifyMerchantApiKey(env.db, key)).toBeNull();
    expect((await verifyMerchantApiKey(env.db, r2.json().apiKey))?.id).toBe(merchant.id);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/api-key`, headers: auth(ownerToken) })).json()).toEqual({ configured: true });
    await env.app.inject({ method: "DELETE", url: `/v1/merchants/${merchant.id}/api-key`, headers: auth(ownerToken) });
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/api-key`, headers: auth(ownerToken) })).json()).toEqual({ configured: false });
  });

  it("builds a printable QR kit", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/locations`, headers: auth(ownerToken), payload: { name: "Main", address: "1 Main St" } });
    const kit = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/qr-kit`, headers: auth(ownerToken) })).json();
    expect(kit.locations).toHaveLength(1);
    expect(kit.locations[0].qrSvg).toContain("<svg");
    expect(kit.locations[0].joinUrl).toContain("/j/");
  });
});

describe("locations + team", () => {
  it("manages locations (unlimited) and keeps one active", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const staff = await addStaff(merchant.id, "staff");
    const payload = { name: "Queen West", address: "800 Queen St W", hours: { sat: [["10:00", "18:00"]] } };
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/locations`, headers: auth(staff.token), payload })).statusCode).toBe(403);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/locations`, headers: auth(ownerToken), payload });
      expect(r.statusCode).toBe(201);
      ids.push(r.json().id);
    }
    const codes = new Set((await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/locations`, headers: auth(staff.token) })).json().items.map((l: { qrCode: string }) => l.qrCode));
    expect(codes.size).toBe(3);
    const rot = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/locations/${ids[0]}/rotate-qr`, headers: auth(ownerToken) });
    expect(codes.has(rot.json().qrCode)).toBe(false);
    expect((await env.app.inject({ method: "DELETE", url: `/v1/merchants/${merchant.id}/locations/${ids[0]}`, headers: auth(ownerToken) })).statusCode).toBe(204);
    expect((await env.app.inject({ method: "DELETE", url: `/v1/merchants/${merchant.id}/locations/${ids[1]}`, headers: auth(ownerToken) })).statusCode).toBe(204);
    expect((await env.app.inject({ method: "DELETE", url: `/v1/merchants/${merchant.id}/locations/${ids[2]}`, headers: auth(ownerToken) })).statusCode).toBe(409);
  });

  it("invites staff, changes roles, sets PINs, protects the last owner", async () => {
    const { merchant, owner, ownerToken } = await createMerchant(env);
    const mgr = await addStaff(merchant.id, "manager");
    const invite = { email: "Barista@Example.com", name: "Bea", role: "staff" };
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/team`, headers: auth(mgr.token), payload: invite })).statusCode).toBe(403);
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/team`, headers: auth(ownerToken), payload: invite });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ role: "staff", name: "Bea", hasPin: false });
    expect(env.ctx.providers.outbox.email.at(-1)?.to).toBe("Barista@Example.com");
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/team`, headers: auth(ownerToken), payload: invite })).statusCode).toBe(409);
    const phoneInvite = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/team`, headers: auth(ownerToken), payload: { phone: "416 555 7777", role: "manager" } });
    expect(phoneInvite.json().phone).toBe("+14165557777");
    expect(env.ctx.providers.outbox.sms.at(-1)?.to).toBe("+14165557777");
    const bea = r.json().userId;

    // PIN: hashed, unique per shop, owner can set others', staff only their own.
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/team/${bea}/pin`, headers: auth(ownerToken), payload: { pin: "12a4" } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/team/${bea}/pin`, headers: auth(ownerToken), payload: { pin: "4321" } })).statusCode).toBe(204);
    const [row] = await env.db.select().from(merchantStaff).where(and(eq(merchantStaff.merchantId, merchant.id), eq(merchantStaff.userId, bea)));
    expect(row!.pinHash).toBeTruthy();
    expect(row!.pinHash).not.toBe("4321");
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/team/${mgr.user.id}/pin`, headers: auth(ownerToken), payload: { pin: "4321" } })).statusCode).toBe(409);
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/team/${bea}/pin`, headers: auth(mgr.token), payload: { pin: "5555" } })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "PUT", url: `/v1/merchants/${merchant.id}/team/${mgr.user.id}/pin`, headers: auth(mgr.token), payload: { pin: "5555" } })).statusCode).toBe(204);

    // Last owner can't be demoted or removed.
    expect((await env.app.inject({ method: "PATCH", url: `/v1/merchants/${merchant.id}/team/${owner.id}`, headers: auth(ownerToken), payload: { role: "manager" } })).statusCode).toBe(409);
    expect((await env.app.inject({ method: "DELETE", url: `/v1/merchants/${merchant.id}/team/${owner.id}`, headers: auth(ownerToken) })).statusCode).toBe(409);
    expect((await env.app.inject({ method: "PATCH", url: `/v1/merchants/${merchant.id}/team/${bea}`, headers: auth(ownerToken), payload: { role: "owner" } })).statusCode).toBe(200);
    expect((await env.app.inject({ method: "DELETE", url: `/v1/merchants/${merchant.id}/team/${owner.id}`, headers: auth(ownerToken) })).statusCode).toBe(204);
    const list = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/team`, headers: auth(mgr.token) })).json();
    expect(list.items.map((s: { userId: string }) => s.userId)).not.toContain(owner.id);
    const audits = await env.db.select().from(auditLogs).where(eq(auditLogs.merchantId, merchant.id));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["staff.invited", "staff.pin_set", "staff.role_changed", "staff.removed"]));
  });
});

describe("loyalty program configuration", () => {
  it("staff can't change the program; manager can; expiry must be >= 12 months", async () => {
    const { merchant } = await createMerchant(env);
    const staff = await addStaff(merchant.id, "staff");
    const mgr = await addStaff(merchant.id, "manager");
    const url = `/v1/merchants/${merchant.id}/program`;
    expect((await env.app.inject({ method: "GET", url, headers: auth(staff.token) })).statusCode).toBe(200);
    expect((await env.app.inject({ method: "PATCH", url, headers: auth(staff.token), payload: { pointsPerDollar: 5 } })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "PATCH", url, headers: auth(mgr.token), payload: { expiryMonths: 6 } })).statusCode).toBe(400);
    const ok = await env.app.inject({
      method: "PATCH",
      url,
      headers: auth(mgr.token),
      payload: { pointsPerDollar: 5, expiryMonths: 18, birthdayBonus: 100, welcomeBonus: 25, referralBonus: 50, visitCooldownMinutes: 10, termsText: "No cash value." },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ pointsPerDollar: 5, expiryMonths: 18, birthdayBonus: 100 });
    expect(ok.json().expiryDisclosure).toMatch(/18 months/);
    const off = await env.app.inject({ method: "PATCH", url, headers: auth(mgr.token), payload: { expiryMonths: null } });
    expect(off.json().expiryMonths).toBeNull();
    expect((await env.app.inject({ method: "PATCH", url, headers: auth(mgr.token), payload: { earnType: "stamps", stampGoal: 0 } })).statusCode).toBe(400);
    expect((await env.app.inject({ method: "PATCH", url, headers: auth(mgr.token), payload: { earnType: "stamps", stampGoal: 10, pointsPerVisit: 1 } })).statusCode).toBe(200);
  });

  it("CRUDs rewards, VIP levels and discount cards", async () => {
    const { merchant, ownerToken, noEarnCategory } = await createPilotMerchant(env);
    const base = `/v1/merchants/${merchant.id}`;
    const bad = await env.app.inject({ method: "POST", url: `${base}/rewards`, headers: auth(ownerToken), payload: { name: "x", pointsCost: 100, rewardType: "percent_off", value: 150 } });
    expect(bad.statusCode).toBe(400);
    const rw = await env.app.inject({ method: "POST", url: `${base}/rewards`, headers: auth(ownerToken), payload: { name: "15% off", pointsCost: 300, rewardType: "percent_off", value: 15, maxDiscountCents: 2000 } });
    expect(rw.statusCode).toBe(201);
    const upd = await env.app.inject({ method: "PATCH", url: `${base}/rewards/${rw.json().id}`, headers: auth(ownerToken), payload: { sortOrder: 2, active: false } });
    expect(upd.json()).toMatchObject({ sortOrder: 2, active: false });
    const del = await env.app.inject({ method: "DELETE", url: `${base}/rewards/${rw.json().id}`, headers: auth(ownerToken) });
    expect(del.json()).toEqual({ deleted: true, archived: false });

    // VIP: members re-levelled when a level is created.
    const r = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 20000 });
    const vip = await env.app.inject({ method: "POST", url: `${base}/vip-levels`, headers: auth(ownerToken), payload: { name: "Gold", thresholdPoints: 100, multiplierPct: 150 } });
    expect(vip.statusCode).toBe(201);
    expect(vip.json().memberCount).toBe(1);
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, r.member.id));
    expect(m!.vipLevelId).toBe(vip.json().id);
    expect((await env.app.inject({ method: "DELETE", url: `${base}/vip-levels/${vip.json().id}`, headers: auth(ownerToken) })).statusCode).toBe(204);
    const [m2] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, r.member.id));
    expect(m2!.vipLevelId).toBeNull();

    // Discount card always excludes non-discount-eligible categories.
    const card = await env.app.inject({ method: "POST", url: `${base}/discount-cards`, headers: auth(ownerToken), payload: { name: "Students 10%", percentOff: 10, eligibility: "students" } });
    expect(card.statusCode).toBe(201);
    expect(card.json().excludedCategoryIds).toContain(noEarnCategory.id);
    const card2 = await env.app.inject({ method: "PATCH", url: `${base}/discount-cards/${card.json().id}`, headers: auth(ownerToken), payload: { excludedCategoryIds: [] } });
    expect(card2.json().excludedCategoryIds).toContain(noEarnCategory.id);
  });

  it("protects pharmacy no-earn categories (Ontario rule)", async () => {
    const owner = await createUser(env.db);
    const token = await tokenFor(env, owner);
    const { merchant } = (await signup(token)).json();
    const base = `/v1/merchants/${merchant.id}/categories`;
    const cats = (await env.app.inject({ method: "GET", url: base, headers: auth(token) })).json().items;
    const rx = cats.find((c: { name: string }) => c.name === "Prescriptions");
    const svc = cats.find((c: { name: string }) => c.name === "Pharmacy services");
    expect(rx.protected).toBe(true);
    for (const c of [rx, svc]) {
      const r = await env.app.inject({ method: "PATCH", url: `${base}/${c.id}`, headers: auth(token), payload: { earnEligible: true } });
      expect(r.statusCode).toBe(422);
      expect(r.json().error.code).toBe("no_earn_category");
      expect(r.json().error.message).toMatch(/regulated/);
    }
    expect((await env.app.inject({ method: "PATCH", url: `${base}/${rx.id}`, headers: auth(token), payload: { discountEligible: true } })).statusCode).toBe(422);
    expect((await env.app.inject({ method: "PATCH", url: `${base}/${rx.id}`, headers: auth(token), payload: { name: "Misc" } })).statusCode).toBe(422);
    expect((await env.app.inject({ method: "DELETE", url: `${base}/${rx.id}`, headers: auth(token) })).statusCode).toBe(422);
    // Creating a new regulated category defaults to no-earn; asking for earn is refused.
    const c1 = await env.app.inject({ method: "POST", url: base, headers: auth(token), payload: { name: "Rx refills" } });
    expect(c1.json()).toMatchObject({ earnEligible: false, discountEligible: false, protected: true });
    expect((await env.app.inject({ method: "POST", url: base, headers: auth(token), payload: { name: "Lottery tickets", earnEligible: true } })).statusCode).toBe(422);
    // Normal categories are editable.
    const front = cats.find((c: { name: string }) => c.name === "Front store");
    expect((await env.app.inject({ method: "PATCH", url: `${base}/${front.id}`, headers: auth(token), payload: { discountEligible: false } })).statusCode).toBe(200);
    // Bonus promos can't target the prescriptions category (promos are Plus: enable for this pilot shop).
    await grantFeatures(env, merchant.id, ["promos.double_points"]);
    const promo = await env.app.inject({
      method: "POST",
      url: `/v1/merchants/${merchant.id}/promos`,
      headers: auth(token),
      payload: { title: "2x on Rx", kind: "multiplier", multiplierPct: 200, categoryId: rx.id, startsAt: "2026-11-01T00:00:00Z" },
    });
    expect(promo.statusCode).toBe(422);
    // And prescriptions still earn nothing.
    const r = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: nextPhone(), source: "staff_app", lines: [{ amountCents: 5000, categoryId: rx.id }] });
    expect(r.earn.basePoints).toBe(0);
  });

  it("Pricing v2: a free shop can't create or edit paid program features, but keeps, reads and deletes its data", async () => {
    const { merchant, ownerToken } = await createMerchant(env);
    const base = `/v1/merchants/${merchant.id}`;
    const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: Record<string, unknown>) =>
      env.app.inject({ method, url: `${base}${url}`, headers: auth(ownerToken), ...(payload ? { payload } : {}) });
    const locked = async (r: Awaited<ReturnType<typeof call>>) => {
      expect(r.statusCode).toBe(402);
      expect(r.json().error.code).toBe("feature_locked");
    };
    await locked(await call("POST", "/promos", { title: "Offer", kind: "offer", startsAt: "2026-11-10T00:00:00Z" }));
    await locked(await call("POST", "/promos", { title: "2x", kind: "multiplier", multiplierPct: 200, startsAt: "2026-11-10T00:00:00Z" }));
    await locked(await call("POST", "/vip-levels", { name: "Gold", thresholdPoints: 500, multiplierPct: 150 }));
    await locked(await call("POST", "/discount-cards", { name: "Seniors", percentOff: 10 }));
    await locked(await env.app.inject({ method: "GET", url: `${base}/customers/export.csv`, headers: auth(ownerToken) }));
    await locked(await call("POST", "/customers/import", { csv: "phone,points\n4165550101,25" }));
    await locked(await call("POST", "/api-key"));
    // Free forever: rewards, manual adjustments, the directory.
    expect((await call("POST", "/rewards", { name: "Free coffee", pointsCost: 100, rewardType: "free_item", value: 0 })).statusCode).toBe(201);
    expect((await call("GET", "/customers")).statusCode).toBe(200);

    // Data created while a pilot override was on stays readable/deletable after it's removed; edits are locked.
    await grantFeatures(env, merchant.id, ["promos.basic", "loyalty.vip_levels"]);
    const promo = (await call("POST", "/promos", { title: "Offer", kind: "offer", startsAt: "2026-11-10T00:00:00Z" })).json();
    const vip = (await call("POST", "/vip-levels", { name: "Gold", thresholdPoints: 500, multiplierPct: 150 })).json();
    await grantFeatures(env, merchant.id, ["promos.basic", "loyalty.vip_levels"], false);
    expect((await call("GET", "/promos")).json().items).toHaveLength(1);
    await locked(await call("PATCH", `/promos/${promo.id}`, { title: "Edited" }));
    await locked(await call("POST", `/promos/${promo.id}/status`, { status: "live" }));
    await locked(await call("PATCH", `/vip-levels/${vip.id}`, { name: "Platinum" }));
    expect((await call("GET", "/vip-levels")).json().items).toHaveLength(1);
    expect((await call("DELETE", `/promos/${promo.id}`)).statusCode).toBe(204);
    expect((await call("DELETE", `/vip-levels/${vip.id}`)).statusCode).toBe(204);
  });

  it("schedules promos and enforces status transitions", async () => {
    const { merchant, ownerToken } = await createPilotMerchant(env);
    const base = `/v1/merchants/${merchant.id}/promos`;
    const create = (payload: Record<string, unknown>) => env.app.inject({ method: "POST", url: base, headers: auth(ownerToken), payload });
    expect((await create({ title: "2x", kind: "multiplier", startsAt: "2026-11-10T00:00:00Z" })).statusCode).toBe(400);
    const draft = await create({ title: "Tuesday double points", kind: "multiplier", multiplierPct: 200, daysOfWeek: [2], startTime: "14:00", endTime: "17:00", startsAt: "2026-11-10T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" });
    expect(draft.statusCode).toBe(201);
    expect(draft.json().status).toBe("draft");
    const id = draft.json().id;
    const sched = await env.app.inject({ method: "POST", url: `${base}/${id}/status`, headers: auth(ownerToken), payload: { status: "scheduled" } });
    expect(sched.json().status).toBe("scheduled");
    const bad = await env.app.inject({ method: "POST", url: `${base}/${id}/status`, headers: auth(ownerToken), payload: { status: "archived" } });
    expect(bad.statusCode).toBe(200); // scheduled -> archived allowed
    const again = await env.app.inject({ method: "POST", url: `${base}/${id}/status`, headers: auth(ownerToken), payload: { status: "live" } });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("invalid_transition");

    const live = await create({ title: "Welcome week", kind: "bonus_points", bonusPoints: 20, startsAt: "2026-11-01T00:00:00Z", publish: true });
    expect(live.json().status).toBe("live");
    expect((await env.app.inject({ method: "PATCH", url: `${base}/${live.json().id}`, headers: auth(ownerToken), payload: { bonusPoints: 500 } })).statusCode).toBe(409);
    expect((await env.app.inject({ method: "PATCH", url: `${base}/${live.json().id}`, headers: auth(ownerToken), payload: { title: "Welcome week!" } })).statusCode).toBe(200);
    const ended = await env.app.inject({ method: "POST", url: `${base}/${live.json().id}/status`, headers: auth(ownerToken), payload: { status: "ended" } });
    expect(ended.json().endsAt).toBe(env.clock.now.toISOString());
    expect((await env.app.inject({ method: "DELETE", url: `${base}/${live.json().id}`, headers: auth(ownerToken) })).statusCode).toBe(409);
    const list = (await env.app.inject({ method: "GET", url: `${base}?status=ended`, headers: auth(ownerToken) })).json();
    expect(list.items).toHaveLength(1);
  });
});

describe("customers directory", () => {
  it("searches, filters, adjusts, reverses and exports", async () => {
    const { merchant, owner } = await createPilotMerchant(env);
    const base = `/v1/merchants/${merchant.id}/customers`;
    const a = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: "+14165551234", customerName: "Alice Nguyen", source: "staff_app", amountCents: 6000 });
    env.clock.now = new Date(env.clock.now.getTime() + 40 * 86400000);
    // Tokens are minted after the clock moves (access tokens last 1h).
    const ownerToken = await tokenFor(env, owner);
    const staff = await addStaff(merchant.id, "staff");
    const b = await awardPurchase(env.ctx, { merchantId: merchant.id, phone: "+14165559876", customerName: "Bob Singh", source: "staff_app", amountCents: 1000 });
    await env.app.inject({ method: "PATCH", url: `${base}/${b.member.id}`, headers: auth(staff.token), payload: { tags: ["Regular"], notes: "Oat milk" } });

    const get = async (qs: string) => (await env.app.inject({ method: "GET", url: `${base}?${qs}`, headers: auth(staff.token) })).json();
    expect((await get("q=alice")).items.map((c: { name: string }) => c.name)).toEqual(["Alice Nguyen"]);
    expect((await get("phoneLast4=9876")).items).toHaveLength(1);
    expect((await get("tag=regular")).items[0].memberId).toBe(b.member.id);
    expect((await get("lapsedDays=30")).items[0].memberId).toBe(a.member.id);
    const ready = await get("rewardAvailable=true");
    expect(ready.items).toHaveLength(1);
    expect(ready.items[0]).toMatchObject({ memberId: a.member.id, rewardAvailable: true, balance: 60 });
    const page1 = await get("limit=1&sort=balance");
    expect(page1.items[0].memberId).toBe(a.member.id);
    const page2 = await get(`limit=1&sort=balance&cursor=${page1.nextCursor}`);
    expect(page2.items[0].memberId).toBe(b.member.id);
    expect(page2.nextCursor).toBeNull();

    // Manual adjust: manager+, reason required.
    const adjUrl = `${base}/${a.member.id}/adjust`;
    expect((await env.app.inject({ method: "POST", url: adjUrl, headers: auth(staff.token), payload: { points: 10, reason: "Goodwill" } })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "POST", url: adjUrl, headers: auth(ownerToken), payload: { points: 10, reason: "" } })).statusCode).toBe(400);
    const adj = await env.app.inject({ method: "POST", url: adjUrl, headers: { ...auth(ownerToken), "idempotency-key": "adj-1" }, payload: { points: 10, reason: "Goodwill" } });
    expect(adj.json().balance).toBe(70);
    const adjDup = await env.app.inject({ method: "POST", url: adjUrl, headers: { ...auth(ownerToken), "idempotency-key": "adj-1" }, payload: { points: 10, reason: "Goodwill" } });
    expect(adjDup.json()).toMatchObject({ balance: 70, duplicate: true });
    expect((await env.app.inject({ method: "POST", url: adjUrl, headers: auth(ownerToken), payload: { points: -500, reason: "Oops" } })).statusCode).toBe(409);

    // Detail shows ledger history and visits.
    const detail = (await env.app.inject({ method: "GET", url: `${base}/${a.member.id}`, headers: auth(staff.token) })).json();
    expect(detail.transactions.map((t: { type: string }) => t.type)).toEqual(["adjust", "earn"]);
    expect(detail.visits).toHaveLength(1);
    // Reverse the earn.
    const earnTx = detail.transactions.find((t: { type: string }) => t.type === "earn");
    const rev = await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/activity/${earnTx.id}/reverse`, headers: auth(ownerToken), payload: { reason: "Refund" } });
    expect(rev.json().balance).toBe(10);
    expect(await ledgerBalance(env.db, a.member.id)).toBe(10);
    expect((await env.app.inject({ method: "POST", url: `/v1/merchants/${merchant.id}/activity/${earnTx.id}/reverse`, headers: auth(ownerToken), payload: { reason: "Again" } })).statusCode).toBe(409);

    // Activity feed + CSV exports.
    const act = (await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/activity?limit=2`, headers: auth(staff.token) })).json();
    expect(act.items).toHaveLength(2);
    expect(act.nextCursor).not.toBeNull();
    expect((await env.app.inject({ method: "GET", url: `${base}/export.csv`, headers: auth(staff.token) })).statusCode).toBe(403);
    const csv = await env.app.inject({ method: "GET", url: `${base}/export.csv`, headers: auth(ownerToken) });
    expect(csv.headers["content-type"]).toContain("text/csv");
    const lines = csv.body.trim().split("\r\n");
    expect(lines[0]).toContain("member_id,name,phone");
    expect(lines).toHaveLength(3);
    expect(csv.body).toContain("Oat milk");
    const txCsv = await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/activity/export.csv`, headers: auth(ownerToken) });
    expect(txCsv.body.trim().split("\r\n")).toHaveLength(1 + 4); // header + 2 earns, adjust, reversal
    expect(txCsv.body).toContain("reversal");
    const all = await env.db.select().from(ledgerEntries);
    expect(all.reduce((s, e) => s + e.amount, 0)).toBe(0);
  });

  it("does not leak another merchant's member", async () => {
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    const r = await awardPurchase(env.ctx, { merchantId: b.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 1000 });
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${a.merchant.id}/customers/${r.member.id}`, headers: auth(a.ownerToken) })).statusCode).toBe(404);
    expect(
      (await env.app.inject({ method: "POST", url: `/v1/merchants/${a.merchant.id}/customers/${r.member.id}/adjust`, headers: auth(a.ownerToken), payload: { points: 5, reason: "x" } })).statusCode,
    ).toBe(404);
    expect(
      (await env.app.inject({ method: "POST", url: `/v1/merchants/${a.merchant.id}/activity/${r.transaction!.id}/reverse`, headers: auth(a.ownerToken), payload: { reason: "x" } })).statusCode,
    ).toBe(404);
    expect((await env.app.inject({ method: "GET", url: `/v1/merchants/${a.merchant.id}/customers`, headers: auth(a.ownerToken) })).json().items).toHaveLength(0);
  });
});

describe("CSV import", () => {
  const csv = [
    "Phone,Name,Email,Points,Visits,Birthday,Consent,Consent_Date",
    "416-555-0101,Ana Silva,ana@example.com,120,8,1990-04-12,yes,2025-06-01",
    "(647) 555-0102,Ben Ho,,40,2,,yes,",
    "4165550103,\"Chan, Carmen\",carmen@example.com,0,0,1985-13-01,,",
    "not-a-phone,Nobody,,10,,,,",
    "416-555-0101,Ana Dup,,999,,,,",
  ].join("\n");

  it("imports members with opening balances, no welcome bonus, CASL-safe consent, idempotently", async () => {
    const { merchant, ownerToken } = await createPilotMerchant(env, { welcomeBonus: 50 });
    const staff = await addStaff(merchant.id, "staff");
    const url = `/v1/merchants/${merchant.id}/customers/import`;
    expect((await env.app.inject({ method: "POST", url, headers: auth(staff.token), payload: { csv } })).statusCode).toBe(403);

    const dry = (await env.app.inject({ method: "POST", url, headers: auth(ownerToken), payload: { csv, dryRun: true } })).json();
    expect(dry).toMatchObject({ dryRun: true, rows: 5, membersCreated: 3, pointsImported: 160 });
    expect(await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, merchant.id))).toHaveLength(0);

    const res = await env.app.inject({ method: "POST", url, headers: auth(ownerToken), payload: { csv, sourceName: "Paper punch card" } });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r).toMatchObject({ rows: 5, membersCreated: 3, membersExisting: 0, pointsImported: 160, consentRecorded: 1 });
    expect(r.errors.map((e: { row: number }) => e.row)).toEqual([4, 5]);
    expect(r.warnings.map((e: { row: number }) => e.row).sort()).toEqual([2, 3]);

    const members = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, merchant.id));
    expect(members).toHaveLength(3);
    expect(members.every((m) => m.joinedVia === "import")).toBe(true);
    const byBal = Object.fromEntries(members.map((m) => [m.balance, m]));
    expect(byBal[120]!.marketingConsentAt?.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(byBal[40]!.marketingConsentAt).toBeNull(); // consent without a date is not consent
    expect(byBal[0]!.marketingConsentAt).toBeNull();
    for (const m of members) expect(await ledgerBalance(env.db, m.id)).toBe(m.balance); // no welcome bonus

    // Re-running the same file doesn't double the balances.
    const again = (await env.app.inject({ method: "POST", url, headers: auth(ownerToken), payload: { csv } })).json();
    expect(again).toMatchObject({ membersCreated: 0, membersExisting: 3, pointsImported: 0 });
    expect(again.duplicates).toBeGreaterThanOrEqual(2);
    const after = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, merchant.id));
    expect(after.reduce((s, m) => s + m.balance, 0)).toBe(160);

    // Imported visits don't count toward activation.
    expect(after.every((m) => m.visitCount === 0)).toBe(true);
    expect((await env.app.inject({ method: "POST", url, headers: auth(ownerToken), payload: { csv: "name,points\nx,1" } })).statusCode).toBe(400);
  });

  it("reuses the network identity of existing customers", async () => {
    const a = await createPilotMerchant(env);
    const b = await createPilotMerchant(env);
    await awardPurchase(env.ctx, { merchantId: a.merchant.id, phone: "+14165550101", source: "staff_app", amountCents: 1000 });
    const r = (await env.app.inject({ method: "POST", url: `/v1/merchants/${b.merchant.id}/customers/import`, headers: auth(b.ownerToken), payload: { csv: "phone,points\n4165550101,25" } })).json();
    expect(r.membersCreated).toBe(1);
    const [ma] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, a.merchant.id));
    const [mb] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, b.merchant.id));
    expect(ma!.userId).toBe(mb!.userId);
    expect(ma!.balance).toBe(10); // A's balance untouched
    void neighbourhoods;
  });
});
