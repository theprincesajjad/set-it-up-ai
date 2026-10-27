/**
 * Pharmacy vertical (docs/research/pharmacies-wellness.md): nothing tied to a prescription or a pharmacy service can earn, be discounted,
 * be messaged or be stored. Every way in is walked here: the counter, redeem, manual adjustment, POS lines, categories, rewards, promos,
 * discount cards, campaigns, automations, customer notes and tags, referrals, appointments, reminders, order-ready text and retention.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { appointments, ledgerTransactions, merchantCategories, merchantMembers, merchants, messageDeliveries, messages, notifications, users, visits } from "@ll/db";
import { PHARMACY_RULES, RETENTION, checkPharmacyText } from "@ll/shared";
import { createMerchantWithTemplate } from "../src/services/merchant.js";
import { awardPurchase, redeemReward } from "../src/services/ledger.js";
import { runAutomations } from "../src/services/messaging.js";
import { sendReminders } from "../src/services/appointments-booking.js";
import { rebookingCandidates } from "../src/services/rebooking.js";
import { runRetention, scrubPharmacyAppointments } from "../src/services/retention.js";
import { ensureLockedCategories } from "../src/services/pharmacy.js";
import { zonedToUtc } from "../src/services/bookings.js";
import { call, customer, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { signAccessToken } from "../src/lib/auth.js";
import { createTestEnv, createUser, grantFeatures, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") }); // Tue 10:00 in Toronto
});
afterEach(async () => env.close());

const at = (local: string) => {
  const [d, t] = local.split(" ") as [string, string];
  const [h, m] = t.split(":").map(Number) as [number, number];
  return zonedToUtc(d, h * 60 + m, "America/Toronto").toISOString();
};

/** A Plus pharmacy with its locked categories, a front-store category and the marketing features. */
async function pharmacy(opts: { welcomeBonus?: number; unconfirmed?: boolean } = {}) {
  const m = await paidMerchant(env, { plan: "plus", vertical: "pharmacy" });
  // The pharmacist-owner has confirmed the rules (points stay off until then; see "the pharmacist-owner confirmation" below).
  if (!opts.unconfirmed) await env.db.update(merchants).set({ pharmacyConfirmedAt: env.clock.now, pharmacyConfirmedByName: "Amira Rahman", pharmacyOcpNumber: "1234567" }).where(eq(merchants.id, m.merchant.id));
  await ensureLockedCategories(env.db, m.merchant.id);
  await grantFeatures(env, m.merchant.id, ["marketing.email", "marketing.automations", "promos.double_points", "promos.basic", "discount_cards", "loyalty.referrals"]);
  if (opts.welcomeBonus) await env.db.update((await import("@ll/db")).loyaltyPrograms).set({ welcomeBonus: opts.welcomeBonus }).where(eq((await import("@ll/db")).loyaltyPrograms.merchantId, m.merchant.id));
  const [front] = await env.db.insert(merchantCategories).values({ merchantId: m.merchant.id, name: "Front store" }).returning();
  const cats = await env.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, m.merchant.id));
  const rx = cats.find((c) => c.name === "Prescriptions")!;
  const services = cats.find((c) => c.name === "Pharmacy services")!;
  return { ...m, base: `/v1/merchants/${m.merchant.id}`, front: front!, rx, services };
}
type Rx = Awaited<ReturnType<typeof pharmacy>>;

const award = (p: Rx, body: Record<string, unknown>) => call(env, p.ownerToken, "POST", `${p.base}/counter/award`, { phone: nextPhone(), idempotencyKey: randomUUID(), ...body });
const ledgerRows = async (merchantId: string) => env.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.merchantId, merchantId));
const memberRows = async (merchantId: string) => env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, merchantId));
const visitRows = async (merchantId: string) => env.db.select().from(visits).where(eq(visits.merchantId, merchantId));

describe("earning: only front-store dollars, confirmed by the cashier", () => {
  it("refuses an amount with no front-store confirmation and records nothing", async () => {
    const p = await pharmacy();
    const r = await award(p, { amountCents: 4500 });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("front_store_confirmation_required");
    expect(await ledgerRows(p.merchant.id)).toHaveLength(0);
    expect(await memberRows(p.merchant.id)).toHaveLength(0);
    expect(await visitRows(p.merchant.id)).toHaveLength(0);
  });

  it("earns on the whole amount once the cashier confirms it is front store", async () => {
    const p = await pharmacy();
    const r = await award(p, { amountCents: 4500, frontStoreOnly: true });
    expect(r.status).toBe(200);
    expect(r.body.pointsEarned).toBe(45);
  });

  it("counts only the front-store part of a mixed sale, and records only that amount", async () => {
    const p = await pharmacy();
    const phone = nextPhone();
    const r = await award(p, { phone, lines: [{ amountCents: 2000, categoryId: p.front.id }, { amountCents: 8000, categoryId: p.rx.id }, { amountCents: 1500, categoryId: p.services.id }] });
    expect(r.status).toBe(200);
    expect(r.body.pointsEarned).toBe(20);
    const [v] = await visitRows(p.merchant.id);
    expect(v!.amountCents).toBe(2000); // never the prescription part
    const [m] = await memberRows(p.merchant.id);
    expect(m!.totalSpendCents).toBe(2000);
    const [t] = await ledgerRows(p.merchant.id);
    expect(t!.amountCents).toBe(2000);
  });

  it("a sale with nothing from the front store is not a visit: no member, no welcome bonus, no bonus promo, no network perk", async () => {
    const p = await pharmacy({ welcomeBonus: 50 });
    // A live bonus promo would add flat points to any qualifying visit.
    await call(env, p.ownerToken, "POST", `${p.base}/promos`, { title: "Weekend bonus", body: "50 bonus points.", kind: "bonus_points", bonusPoints: 50, startsAt: new Date(env.clock.now.getTime() - 3600_000).toISOString(), publish: true });
    for (const body of [
      { lines: [{ amountCents: 8000, categoryId: p.rx.id }] },
      { lines: [{ amountCents: 8000, categoryId: p.rx.id }], frontStoreOnly: true },
      { lines: [{ amountCents: 1500, categoryId: p.services.id }] },
      { lines: [{ amountCents: 3000 }] }, // no category and no confirmation: counts for nothing
    ]) {
      const r = await award(p, body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_no_front_store");
    }
    expect(await memberRows(p.merchant.id)).toHaveLength(0);
    expect(await ledgerRows(p.merchant.id)).toHaveLength(0);
    expect(await visitRows(p.merchant.id)).toHaveLength(0);
  });

  it("an uncategorised line earns nothing unless the cashier confirmed the sale", async () => {
    const p = await pharmacy();
    const mixed = await award(p, { lines: [{ amountCents: 2000, categoryId: p.front.id }, { amountCents: 6000 }] });
    expect(mixed.body.pointsEarned).toBe(20);
    const confirmed = await award(p, { lines: [{ amountCents: 6000 }], frontStoreOnly: true });
    expect(confirmed.body.pointsEarned).toBe(60);
  });

  it("a locked category cannot earn even if a row says it can (legacy data)", async () => {
    const p = await pharmacy();
    await env.db.update(merchantCategories).set({ earnEligible: true }).where(eq(merchantCategories.id, p.rx.id)); // dispensary flag stays
    const r = await award(p, { lines: [{ amountCents: 8000, categoryId: p.rx.id }], frontStoreOnly: true });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("pharmacy_no_front_store");
  });

  it("has no points or stamps for a visit: the program can't be switched, and a stored visit program awards nothing", async () => {
    const p = await pharmacy();
    for (const earnType of ["per_visit", "stamps"]) {
      const r = await call(env, p.ownerToken, "PATCH", `${p.base}/program`, { earnType, pointsPerVisit: 5, stampGoal: 10 });
      expect(r.status, earnType).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_visit_earn");
    }
    await env.db.update((await import("@ll/db")).loyaltyPrograms).set({ earnType: "per_visit", pointsPerVisit: 5 }).where(eq((await import("@ll/db")).loyaltyPrograms.merchantId, p.merchant.id));
    const r = await award(p, { frontStoreOnly: true });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("pharmacy_visit_earn");
    expect(await visitRows(p.merchant.id)).toHaveLength(0);
  });

  it("POS and API sales: a pharmacy keeps only front-store lines", async () => {
    const p = await pharmacy();
    const ok = await awardPurchase(env.ctx, { merchantId: p.merchant.id, phone: nextPhone(), lines: [{ amountCents: 1200, categoryId: p.front.id }, { amountCents: 5000, categoryId: p.rx.id }], source: "square", ignoreCooldown: true });
    expect(ok.transaction?.points).toBe(12);
    await expect(awardPurchase(env.ctx, { merchantId: p.merchant.id, phone: nextPhone(), lines: [{ amountCents: 5000, categoryId: p.rx.id }], source: "square", ignoreCooldown: true })).rejects.toMatchObject({ code: "pharmacy_no_front_store" });
    await expect(awardPurchase(env.ctx, { merchantId: p.merchant.id, phone: nextPhone(), amountCents: 5000, source: "api", ignoreCooldown: true })).rejects.toMatchObject({ code: "front_store_confirmation_required" });
  });

  it("other shops are unaffected", async () => {
    const m = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    const r = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/counter/award`, { phone: nextPhone(), amountCents: 4500, idempotencyKey: randomUUID() });
    expect(r.status).toBe(200);
    expect(r.body.pointsEarned).toBe(45);
  });
});

describe("redeem, adjustments and referrals", () => {
  it("a reward is applied to front-store items only: the cashier confirms, at the counter and for a customer's code", async () => {
    const p = await pharmacy();
    const a = await award(p, { amountCents: 10000, frontStoreOnly: true });
    const memberId = a.body.member.memberId as string;
    const body = { memberId, rewardId: p.reward.id, idempotencyKey: randomUUID() };
    const no = await call(env, p.ownerToken, "POST", `${p.base}/counter/redeem`, body);
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe("front_store_confirmation_required");
    const yes = await call(env, p.ownerToken, "POST", `${p.base}/counter/redeem`, { ...body, frontStoreOnly: true });
    expect(yes.status).toBe(200);
    const code = await call(env, p.ownerToken, "POST", `${p.base}/counter/redemptions/verify`, { code: "ABCDEF" });
    expect(code.status).toBe(422);
    expect(code.body.error.code).toBe("front_store_confirmation_required");
  });

  it("a manual adjustment can't be for a prescription or a health reason", async () => {
    const p = await pharmacy();
    const a = await award(p, { amountCents: 1000, frontStoreOnly: true });
    const memberId = a.body.member.memberId as string;
    const adjust = (reason: string) => call(env, p.ownerToken, "POST", `${p.base}/customers/${memberId}/adjust`, { points: 50, reason, idempotencyKey: randomUUID() });
    for (const reason of ["Goodwill for prescription delay", "Rx pickup bonus", "Diabetes supplies thank-you"]) {
      const r = await adjust(reason);
      expect(r.status, reason).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_text");
    }
    expect((await adjust("Goodwill: till error on a front-store sale")).status).toBe(200);
  });

  it("no referral reward: nobody is paid to bring in a patient", async () => {
    const p = await pharmacy();
    const a = await award(p, { amountCents: 1000, frontStoreOnly: true });
    const m = (await memberRows(p.merchant.id))[0]!;
    const c = { token: await tokenFor(env, { id: m.userId, platformRole: "none" }) };
    const r = await call(env, c.token, "GET", `/v1/me/memberships/${a.body.member.memberId}/referral`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("pharmacy_no_referrals");
  });
});

describe("categories stay locked", () => {
  it("the template gives every pharmacy locked categories and a per-dollar program", async () => {
    const owner = await createUser(env.db, { email: "rx-owner@example.com" });
    const created = await createMerchantWithTemplate(env.ctx, { body: { name: "Roncy Rx", vertical: "pharmacy", address: "1 Roncy Ave", phone: "+14165550199" } as never, ownerUserId: owner.id, actorUserId: owner.id });
    const cats = await env.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, created.merchant.id));
    for (const name of ["Prescriptions", "Pharmacy services", "Dispensing fees and compounding"]) expect(cats.find((c) => c.name === name), name).toMatchObject({ dispensary: true, earnEligible: false, discountEligible: false });
    expect(cats.find((c) => c.name === "Front store")).toMatchObject({ dispensary: false, earnEligible: true });
  });

  it("can't be turned on, renamed or deleted, and look-alike names are locked on creation and stay locked after a rename", async () => {
    const p = await pharmacy();
    const patch = (id: string, body: Record<string, unknown>) => call(env, p.ownerToken, "PATCH", `${p.base}/categories/${id}`, body);
    for (const c of [p.rx, p.services]) {
      expect((await patch(c.id, { earnEligible: true })).status).toBe(422);
      expect((await patch(c.id, { discountEligible: true })).status).toBe(422);
      expect((await patch(c.id, { name: "Shelf" })).status).toBe(422);
      const del = await call(env, p.ownerToken, "DELETE", `${p.base}/categories/${c.id}`);
      expect(del.status).toBe(422);
    }
    for (const name of ["Medication aisle", "Vaccines", "Blister packs", "Compounding", "Methadone program", "Pharmacist clinic"]) {
      const asked = await call(env, p.ownerToken, "POST", `${p.base}/categories`, { name, earnEligible: true });
      expect(asked.status, name).toBe(422);
      const made = await call(env, p.ownerToken, "POST", `${p.base}/categories`, { name });
      expect(made.body).toMatchObject({ earnEligible: false, discountEligible: false, protected: true });
      expect((await patch(made.body.id, { name: "Shelf" })).status).toBe(422);
    }
    const vitamins = await call(env, p.ownerToken, "POST", `${p.base}/categories`, { name: "Vitamins" });
    expect(vitamins.body).toMatchObject({ earnEligible: true, protected: false });
  });

  it("a discount card always excludes every locked category", async () => {
    const p = await pharmacy();
    const r = await call(env, p.ownerToken, "POST", `${p.base}/discount-cards`, { name: "Seniors 10% off", percentOff: 10, eligibility: "seniors", terms: "Front-store items only. Not valid on prescriptions or pharmacy services.", excludedCategoryIds: [] });
    expect(r.status).toBe(201);
    for (const c of [p.rx, p.services]) expect(r.body.excludedCategoryIds).toContain(c.id);
    expect(r.body.excludedCategoryIds).not.toContain(p.front.id);
  });
});

describe("offers and messages never mention the dispensary", () => {
  it("rewards, promos and discount cards", async () => {
    const p = await pharmacy();
    const bad = [
      ["POST", "/rewards", { name: "Free refill", pointsCost: 100, rewardType: "custom", value: 0 }],
      ["POST", "/rewards", { name: "Thank you", description: "10% off your prescription", pointsCost: 100, rewardType: "custom", value: 0 }],
      ["POST", "/promos", { title: "Prescription transfer bonus", kind: "offer", startsAt: env.clock.now.toISOString() }],
      ["POST", "/promos", { title: "Seniors Day", body: "Refills ready, not valid on vitamins", kind: "offer", startsAt: env.clock.now.toISOString() }],
      ["POST", "/promos", { title: "Diabetes week", kind: "offer", startsAt: env.clock.now.toISOString() }],
      ["POST", "/discount-cards", { name: "Medication club", percentOff: 10, eligibility: "everyone", excludedCategoryIds: [] }],
      ["POST", "/discount-cards", { name: "Seniors", percentOff: 10, eligibility: "seniors", terms: "Applies to flu shots", excludedCategoryIds: [] }],
    ] as const;
    for (const [method, path, body] of bad) {
      const r = await call(env, p.ownerToken, method, `${p.base}${path}`, body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_text");
    }
    expect((await call(env, p.ownerToken, "POST", `${p.base}/rewards`, { name: "$5 off front store", description: "Not valid on prescriptions or pharmacy services.", pointsCost: 500, rewardType: "amount_off", value: 500 })).status).toBe(201);
    expect((await call(env, p.ownerToken, "POST", `${p.base}/promos`, { title: "Flu season: double points on vitamins", body: "Vitamins and cold remedies. Not valid on prescriptions.", kind: "offer", startsAt: env.clock.now.toISOString() })).status).toBe(201);
    // Editing into a bad text is refused too.
    const reward = (await call(env, p.ownerToken, "GET", `${p.base}/rewards`)).body.items[0];
    expect((await call(env, p.ownerToken, "PATCH", `${p.base}/rewards/${reward.id}`, { name: "Free prescription" })).status).toBe(422);
  });

  it("campaigns: create, edit, send and automations all refuse dispensary text, and a stored bad message never goes out", async () => {
    const p = await pharmacy();
    const sub = await awardPurchase(env.ctx, { merchantId: p.merchant.id, phone: nextPhone(), customerName: "Ana", amountCents: 3000, source: "staff_app", consent: { text: "Yes, send me offers", source: "counter" }, lines: [{ amountCents: 3000, categoryId: p.front.id }] });
    await env.db.update(users).set({ email: "ana@example.com" }).where(eq(users.id, sub.member.userId));
    const create = (subject: string, body: string, extra: Record<string, unknown> = {}) => call(env, p.ownerToken, "POST", `${p.base}/messages`, { channel: "email", subject, body, segment: { kind: "all" }, ...extra });
    for (const [s, b] of [["Your prescription is ready", "Come by."], ["Hello", "Time for your refill, 10% off."], ["Hello", "Managing your blood pressure? Visit us."], ["Flu shots", "Book your flu shot now."]]) {
      const r = await create(s!, b!);
      expect(r.status, `${s} / ${b}`).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_text");
    }
    const ok = await create("Flu season: double points on vitamins", "Vitamins, tissues and cold remedies earn double points until Sunday. Front-store items only.");
    expect(ok.status).toBe(201);
    // Editing a good draft into a bad one is refused.
    expect((await call(env, p.ownerToken, "PATCH", `${p.base}/messages/${ok.body.id}`, { body: "Your refill is ready" })).status).toBe(422);
    // A draft that got in some other way (a script, an old record) is still refused at send.
    const [bad] = await env.db.insert(messages).values({ merchantId: p.merchant.id, channel: "email", subject: "Reminder", body: "Your prescription is ready for pickup", segment: { kind: "all" }, status: "draft" }).returning();
    const send = await call(env, p.ownerToken, "POST", `${p.base}/messages/${bad!.id}/send`, {});
    expect(send.status).toBe(422);
    expect(await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.messageId, bad!.id))).toHaveLength(0);
    // Automations: refused on save, and a stored one is skipped by the runner.
    const auto = await call(env, p.ownerToken, "PUT", `${p.base}/automations/welcome`, { enabled: true, channel: "email", subject: "Welcome", body: "Welcome! Transfer your prescriptions to us." });
    expect(auto.status).toBe(422);
    await env.db.insert(messages).values({ merchantId: p.merchant.id, channel: "email", subject: "Welcome", body: "Transfer your prescriptions to us", segment: { kind: "automation", days: null, enabledAt: new Date(0).toISOString() }, automation: "welcome", status: "scheduled" });
    const before = (await env.db.select().from(messageDeliveries)).length;
    await runAutomations(env.ctx);
    expect((await env.db.select().from(messageDeliveries)).length).toBe(before);
  });

  it("a shop that is not a pharmacy can still use these words", async () => {
    const m = await paidMerchant(env, { plan: "plus", vertical: "pet" });
    const r = await call(env, m.ownerToken, "POST", `/v1/merchants/${m.merchant.id}/rewards`, { name: "Free pet medication refill", pointsCost: 100, rewardType: "custom", value: 0 });
    expect(r.status).toBe(201);
  });

  it("no notes or tags on a customer", async () => {
    const p = await pharmacy();
    const a = await award(p, { amountCents: 1000, frontStoreOnly: true });
    const id = a.body.member.memberId;
    for (const body of [{ notes: "On insulin, call before pickup" }, { tags: ["asthma"] }, { tags: ["regular"] }]) {
      const r = await call(env, p.ownerToken, "PATCH", `${p.base}/customers/${id}`, body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_no_notes");
    }
    expect((await call(env, p.ownerToken, "PATCH", `${p.base}/customers/${id}`, { notes: null, tags: [] })).status).toBe(200);
  });
});

describe("pharmacist appointments keep only that a booking exists", () => {
  const MON_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" }));
  async function clinic() {
    const p = await pharmacy();
    const pharmacist = await staffMember(env, p.merchant.id, "staff");
    expect((await call(env, p.ownerToken, "PUT", `${p.base}/staff/${pharmacist.user.id}/hours`, { days: MON_SAT })).status).toBe(200);
    const mk = (body: Record<string, unknown>) => call(env, p.ownerToken, "POST", `${p.base}/services`, body);
    const flu = await mk({ name: "Flu shot", durationMin: 15, priceCents: 5000, depositCents: 1000, rebookAfterDays: 365, taxable: true, categoryId: p.front.id, description: "Quick" });
    return { ...p, pharmacist, flu };
  }

  it("forces no price, deposit, rebooking or tax, files the type under Pharmacy services, and names no condition", async () => {
    const c = await clinic();
    expect(c.flu.status).toBe(201);
    expect(c.flu.body).toMatchObject({ priceCents: 0, depositCents: 0, rebookAfterDays: null, taxable: false, priceFrom: false, categoryId: c.services.id });
    const upd = await call(env, c.ownerToken, "PATCH", `${c.base}/services/${c.flu.body.id}`, { priceCents: 9900, depositCents: 500, rebookAfterDays: 30 });
    expect(upd.body).toMatchObject({ priceCents: 0, depositCents: 0, rebookAfterDays: null });
    for (const name of ["Diabetes review", "Birth control consult", "Asthma check"]) {
      const r = await call(env, c.ownerToken, "POST", `${c.base}/services`, { name, durationMin: 20, priceCents: 0 });
      expect(r.status, name).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_text");
    }
    for (const name of ["Vaccine appointment", "Medication review", "Pharmacist consultation"]) expect((await call(env, c.ownerToken, "POST", `${c.base}/services`, { name, durationMin: 20, priceCents: 0 })).status, name).toBe(201);
    expect((await call(env, c.ownerToken, "PUT", `${c.base}/appointments/settings`, { noShowFeeCents: 2500 })).status).toBe(400);
  });

  it("a customer books free, with no notes, no card step, and a reminder that does not name the service", async () => {
    const c = await clinic();
    const who = await customer(env);
    await env.db.update(users).set({ locale: "en" }).where(eq(users.id, who.user.id));
    const withNote = await call(env, who.token, "POST", "/v1/me/appointments", { serviceIds: [c.flu.body.id], staffId: null, startsAt: at("2026-11-05 10:00"), notes: "I take metformin" });
    expect(withNote.status).toBe(422);
    expect(withNote.body.error.code).toBe("pharmacy_no_notes");
    const r = await call(env, who.token, "POST", "/v1/me/appointments", { serviceIds: [c.flu.body.id], staffId: null, startsAt: at("2026-11-05 10:00") });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ confirmed: true, deposit: null, setup: null, appointment: { depositCents: 0, pending: false } });
    const [row] = await env.db.select().from(appointments).where(eq(appointments.id, r.body.appointment.id));
    expect(row).toMatchObject({ clientNote: null, notes: null, depositCents: 0, noShowFeeCents: null });
    expect(row!.items.every((i) => i.priceCents === 0)).toBe(true);
    // The confirmation and the reminder say "appointment", never "flu shot".
    const sms = env.ctx.providers.outbox.sms;
    env.clock.now = new Date(at("2026-11-04 10:30"));
    expect(await sendReminders(env.ctx)).toBe(1);
    for (const m of sms.filter((x) => x.to === who.user.phone)) { expect(m.body.toLowerCase(), m.body).not.toContain("flu"); expect(m.body, m.body).not.toContain(c.merchant.name); }
    expect(sms.at(-1)!.body).toContain("appointment");
    // Public booking page: the shop is marked a pharmacy, no card is taken, no fee.
    const pub = await call(env, null, "GET", `/v1/public/shops/${c.merchant.slug}/booking`);
    if (pub.status === 200) expect(pub.body).toMatchObject({ shop: { pharmacy: true }, policy: { takesCards: false, noShowFeeCents: 0 } });
  });

  it("the booked screen shows the exact fixed reminder text, and that is the text the phone gets, day before and two hours before", async () => {
    const c = await clinic();
    const who = await customer(env);
    await env.db.update(users).set({ locale: "en" }).where(eq(users.id, who.user.id));
    const r = await call(env, who.token, "POST", "/v1/me/appointments", { serviceIds: [c.flu.body.id], staffId: null, startsAt: at("2026-11-05 10:00") });
    expect(r.status).toBe(201);
    const shown = r.body.appointment.reminderText as string;
    const link = `${env.ctx.config.publicWebUrl}/shops/${c.merchant.slug}/book/${r.body.appointment.id}`;
    // Weekday and time, a link to change it, the STOP line. No service, no address, no price.
    expect(shown).toMatch(/^Reminder: your appointment is Thu,? 10:00 am\. Change it: /);
    expect(shown).not.toContain(c.merchant.name);
    expect(shown).toContain(link);
    expect(shown.endsWith("Reply STOP to opt out.")).toBe(true);
    expect(shown.toLowerCase()).not.toMatch(/flu|shot|vaccin|medic|prescri|rx|\$/);
    // The same text over GET (the manage page and the app read it there).
    const again = await call(env, who.token, "GET", `/v1/me/appointments/${r.body.appointment.id}`);
    expect(again.body.appointment.reminderText).toBe(shown);
    // Day before, then two hours before: both are that text.
    const sms = env.ctx.providers.outbox.sms;
    env.clock.now = new Date(at("2026-11-04 10:30"));
    expect(await sendReminders(env.ctx)).toBe(1);
    expect(sms.filter((x) => x.to === who.user.phone).at(-1)!.body).toBe(shown);
    env.clock.now = new Date(at("2026-11-05 08:30"));
    expect(await sendReminders(env.ctx)).toBe(1);
    expect(sms.filter((x) => x.to === who.user.phone).at(-1)!.body).toBe(shown);
    // In the customer's own language, with the same fixed words.
    await env.db.update(users).set({ locale: "ur-CA" }).where(eq(users.id, who.user.id));
    const fresh = await signAccessToken(env.ctx, { id: who.user.id, platformRole: "none" }); // the clock moved past the first token
    const ur = await call(env, fresh, "GET", `/v1/me/appointments/${r.body.appointment.id}`);
    expect(ur.body.appointment.reminderText).toContain("اپائنٹمنٹ");
    expect(ur.body.appointment.reminderText).toContain("STOP");
    expect(ur.body.appointment.reminderText).toContain(link);
  });

  it("staff can't add notes or custom lines, checkout is closed (no invoice, no points, no reward), and no-show fees never charge", async () => {
    const c = await clinic();
    const book = (extra: Record<string, unknown> = {}) => call(env, c.ownerToken, "POST", `${c.base}/appointments`, { staffId: c.pharmacist.user.id, serviceIds: [c.flu.body.id], startsAt: at("2026-11-05 11:00"), customer: { phone: nextPhone(), name: "Neha" }, ...extra });
    expect((await book({ notes: "diabetic" })).status).toBe(422);
    expect((await book({ clientNote: "refill" })).status).toBe(422);
    expect((await book({ serviceIds: [], items: [{ name: "Rx counselling", durationMin: 10, priceCents: 2000 }] })).status).toBe(400);
    const ok = await book();
    expect(ok.status).toBe(201);
    expect((await call(env, c.ownerToken, "PATCH", `${c.base}/appointments/${ok.body.id}`, { notes: "on warfarin" })).status).toBe(422);
    const checkout = await call(env, c.ownerToken, "POST", `${c.base}/appointments/${ok.body.id}/checkout`, { mode: "counter", counterMethod: "cash", tipCents: 0 });
    expect(checkout.status).toBe(409);
    expect(checkout.body.error.code).toBe("pharmacy_no_checkout");
    const done = await call(env, c.ownerToken, "POST", `${c.base}/appointments/${ok.body.id}/status`, { status: "completed" });
    expect(done.status).toBe(200);
    expect(await ledgerRows(c.merchant.id)).toHaveLength(0);
  });

  it("no rebooking reminders and no review requests", async () => {
    const c = await clinic();
    await env.db.update((await import("@ll/db")).services).set({ rebookAfterDays: 30 }).where(eq((await import("@ll/db")).services.id, c.flu.body.id));
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, c.merchant.id));
    expect(await rebookingCandidates(env.ctx, m!)).toEqual([]);
    expect((await call(env, c.ownerToken, "PUT", `${c.base}/rebooking/rules/${c.flu.body.id}`, { rebookAfterDays: 30 })).status).toBe(400);
  });

  it("de-identifies a pharmacy appointment 30 days after the visit, and leaves other shops alone", async () => {
    const c = await clinic();
    const retail = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    const user = await createUser(env.db, { name: "Neha" });
    const old = new Date(env.clock.now.getTime() - (RETENTION.pharmacyAppointmentDays + 2) * 86_400_000);
    const recent = new Date(env.clock.now.getTime() - 5 * 86_400_000);
    const [loc] = await env.db.query.locations.findMany({ where: (l, { eq: e }) => e(l.merchantId, c.merchant.id) });
    const row = (merchantId: string, locationId: string, when: Date) => ({ merchantId, locationId, userId: user.id, customerName: "Neha S.", items: [{ serviceId: c.flu.body.id as string, name: "Flu shot", durationMin: 15, priceCents: 0 }], notes: "n", clientNote: "c", startsAt: when, endsAt: new Date(when.getTime() + 900_000), status: "completed" });
    const [oldRx] = await env.db.insert(appointments).values(row(c.merchant.id, loc!.id, old)).returning();
    const [newRx] = await env.db.insert(appointments).values(row(c.merchant.id, loc!.id, recent)).returning();
    const [retailLoc] = await env.db.query.locations.findMany({ where: (l, { eq: e }) => e(l.merchantId, retail.merchant.id) });
    const [oldRetail] = await env.db.insert(appointments).values(row(retail.merchant.id, retailLoc!.id, old)).returning();
    expect(await scrubPharmacyAppointments(env.ctx)).toBe(1);
    const get = async (id: string) => (await env.db.select().from(appointments).where(eq(appointments.id, id)))[0]!;
    expect(await get(oldRx!.id)).toMatchObject({ userId: null, customerName: null, notes: null, clientNote: null, status: "completed" });
    expect((await get(oldRx!.id)).items).toEqual([{ serviceId: null, name: "Pharmacy appointment", durationMin: 15, priceCents: 0 }]);
    expect(await get(newRx!.id)).toMatchObject({ userId: user.id, customerName: "Neha S." });
    expect(await get(oldRetail!.id)).toMatchObject({ userId: user.id, customerName: "Neha S." });
    expect(await scrubPharmacyAppointments(env.ctx)).toBe(0); // idempotent
    expect(Object.keys(await runRetention(env.ctx))).toEqual(expect.arrayContaining(["pharmacyAppointments", "pharmacyMessages"]));
  });
});

describe("order-ready text", () => {
  it("is fixed, in the customer's language, and names nothing", async () => {
    const p = await pharmacy();
    const who = await customer(env, { name: "Priya Nair" });
    const outbox = env.ctx.providers.outbox.sms;
    const denied = await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/pickup-ready`, { phone: who.user.phone });
    expect(denied.status).toBe(400);
    const n0 = outbox.length;
    const r = await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/pickup-ready`, { phone: who.user.phone, customerAsked: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true });
    expect(r.body.to).toMatch(/••\d\d$/);
    const sent = outbox.slice(n0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toBe("Test Shop: your order is ready for pickup. Reply STOP to opt out.");
    expect(sent[0]!.body).not.toContain("Priya");
    // Hindi speaker, Hindi text.
    await env.db.update(users).set({ locale: "hi" }).where(eq(users.id, who.user.id));
    await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/pickup-ready`, { phone: who.user.phone, customerAsked: true });
    expect(outbox.at(-1)!.body).toContain("पिकअप");
    // There is no field for free text: an extra "message" is rejected or ignored, and never sent.
    await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/pickup-ready`, { phone: who.user.phone, customerAsked: true, message: "Your metformin is ready" });
    expect(outbox.every((m) => !m.body.includes("metformin"))).toBe(true);
    // Not a pharmacy: not available.
    const shop = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    expect((await call(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/pharmacy/pickup-ready`, { phone: who.user.phone, customerAsked: true })).status).toBe(400);
  });

  it("the delivery log and the inbox copy are deleted after 30 days, for pharmacies only", async () => {
    const p = await pharmacy();
    const retail = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    const who = await customer(env);
    await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/pickup-ready`, { phone: who.user.phone, customerAsked: true });
    await env.db.insert(messageDeliveries).values({ userId: who.user.id, merchantId: retail.merchant.id, channel: "sms", to: "x", body: "retail text", kind: "transactional" });
    env.clock.now = new Date(env.clock.now.getTime() + (RETENTION.pharmacyMessageDays + 1) * 86_400_000);
    // DB defaults stamp real "now"; age them by hand to the test clock.
    await env.db.update(messageDeliveries).set({ createdAt: new Date(env.clock.now.getTime() - 40 * 86_400_000) });
    await env.db.update(notifications).set({ createdAt: new Date(env.clock.now.getTime() - 40 * 86_400_000) });
    const { purgePharmacyMessages } = await import("../src/services/pharmacy.js");
    expect(await purgePharmacyMessages(env.ctx)).toBeGreaterThan(0);
    const left = await env.db.select().from(messageDeliveries);
    expect(left.map((d) => d.body)).toEqual(["retail text"]);
  });
});

describe("the rules page and the pharmacist-owner confirmation", () => {
  it("lists the rules and locked categories; only the owner confirms, once recorded with a name", async () => {
    const p = await pharmacy({ unconfirmed: true });
    const rules = await call(env, p.ownerToken, "GET", `${p.base}/pharmacy/rules`);
    expect(rules.body.pharmacy).toBe(true);
    expect(rules.body.rules.map((r: { id: string }) => r.id)).toEqual(PHARMACY_RULES.map((r) => r.id));
    expect(rules.body.lockedCategories.map((c: { name: string }) => c.name).sort()).toEqual(["Dispensing fees and compounding", "Pharmacy services", "Prescriptions"]);
    expect(rules.body.lockedCategories.every((c: { earnEligible: boolean; discountEligible: boolean }) => !c.earnEligible && !c.discountEligible)).toBe(true);
    expect(rules.body.confirmation).toBeNull();
    expect(rules.body.retention).toEqual({ appointmentDays: 30, messageDays: 30 });
    const manager = await staffMember(env, p.merchant.id, "manager");
    expect((await call(env, manager.token, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman", ocpNumber: "1234567", agree: true })).status).toBe(403);
    expect((await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman", ocpNumber: "1234567", agree: false })).status).toBe(400);
    // The OCP accreditation number is required (digits, 4 to 10).
    expect((await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman", agree: true })).status).toBe(400);
    expect((await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman", ocpNumber: "abc", agree: true })).status).toBe(400);
    const ok = await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman, B.Sc.Phm", ocpNumber: "12 34-567", agree: true });
    expect(ok.status).toBe(200);
    expect(ok.body.confirmation).toMatchObject({ confirmedByName: "Amira Rahman, B.Sc.Phm", ocpNumber: "1234567" });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, p.merchant.id));
    expect(m!.pharmacyConfirmedByUserId).toBe(p.owner.id);
    const shop = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    expect((await call(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/pharmacy/rules`)).body).toMatchObject({ pharmacy: false, rules: [] });
    expect((await call(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/pharmacy/confirm`, { name: "Someone", ocpNumber: "1234567", agree: true })).status).toBe(400);
  });
});

describe("reports count the front store only", () => {
  it("says so, and counts the front-store amount only", async () => {
    const p = await pharmacy();
    await award(p, { lines: [{ amountCents: 2000, categoryId: p.front.id }, { amountCents: 9000, categoryId: p.rx.id }] });
    env.clock.now = new Date(env.clock.now.getTime() + 60_000); // the range ends before "now"
    const r = await call(env, p.ownerToken, "GET", `${p.base}/reports/overview`);
    expect(r.body.scope).toBe("front_store");
    expect(r.body.current.revenueFromMembersCents).toBe(2000); // the $90 prescription part is never counted
    const shop = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    expect((await call(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/reports/overview`)).body.scope).toBe("all");
  });
});

describe("network overlap never names a pharmacy", () => {
  it("another shop's overlap report leaves pharmacies out", async () => {
    const hood = await (await import("./helpers.js")).createNeighbourhood(env.db);
    const rx = await paidMerchant(env, { plan: "plus", vertical: "pharmacy" });
    await env.db.update(merchants).set({ pharmacyConfirmedAt: env.clock.now, pharmacyConfirmedByName: "Amira Rahman", pharmacyOcpNumber: "1234567" }).where(eq(merchants.id, rx.merchant.id));
    const cafe = await paidMerchant(env, { plan: "plus", vertical: "cafe" });
    await env.db.update(merchants).set({ neighbourhoodId: hood.id }).where(eq(merchants.id, rx.merchant.id));
    await env.db.update(merchants).set({ neighbourhoodId: hood.id }).where(eq(merchants.id, cafe.merchant.id));
    await ensureLockedCategories(env.db, rx.merchant.id);
    await grantFeatures(env, cafe.merchant.id, ["reports.advanced"]);
    for (let i = 0; i < 12; i++) {
      const phone = nextPhone();
      await awardPurchase(env.ctx, { merchantId: cafe.merchant.id, phone, source: "staff_app", amountCents: 500 });
      await awardPurchase(env.ctx, { merchantId: rx.merchant.id, phone, source: "staff_app", amountCents: 500, frontStoreOnly: true });
    }
    const r = await call(env, cafe.ownerToken, "GET", `/v1/merchants/${cafe.merchant.id}/reports/network-overlap`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sharedMembers: 0, shops: [], suppressedShops: 0 });
  });
});

describe("the text checker", () => {
  it("blocks dispensary and health words, allows exclusion wording and front-store talk", () => {
    const bad = ["Your prescription is ready", "Refill reminder", "Transfer your Rx", "Book a flu shot", "10% off medications", "Diabetes supplies", "blood pressure checks", "Blister packs available", "MedsCheck this week"];
    for (const t of bad) expect(checkPharmacyText(t).ok, t).toBe(false);
    const good = ["Vitamins, tissues and cold remedies earn double points.", "Seniors Day: 10% off front store. Not valid on prescriptions or pharmacy services.", "Front-store items only", "Welcome! 50 points to start."];
    for (const t of good) expect(checkPharmacyText(t).ok, t).toBe(true);
    // The exclusion clause is dropped, what is left is checked: "refills ready" is not an exclusion.
    expect(checkPharmacyText("Refills ready, not valid on vitamins").ok).toBe(false);
    expect(checkPharmacyText("Vitamins 10% off, not valid on refills").ok).toBe(true);
    // Labels allow service words but never conditions.
    expect(checkPharmacyText("Flu shot", { mode: "label", allowServiceWords: true }).ok).toBe(true);
    expect(checkPharmacyText("Diabetes review", { mode: "label", allowServiceWords: true }).ok).toBe(false);
    expect(checkPharmacyText("Rx points goodwill", { mode: "label" }).ok).toBe(false);
  });
});

describe("fix wave: welcome bonus, network perks, confirmation, text check, categories", () => {
  it("the pharmacy template has no welcome bonus, and a program change cannot add one", async () => {
    const p = await pharmacy();
    const prog = await call(env, p.ownerToken, "GET", `${p.base}/program`);
    expect(prog.body.welcomeBonus).toBe(0);
    const patched = await call(env, p.ownerToken, "PATCH", `${p.base}/program`, { welcomeBonus: 50 });
    expect(patched.status).toBe(200);
    expect(patched.body.welcomeBonus).toBe(0);
  });

  it("an old pharmacy program with a welcome bonus pays none: joining pays nothing, a front-store sale pays only its own points", async () => {
    const p = await pharmacy({ welcomeBonus: 50 });
    const r = await award(p, { amountCents: 1250, frontStoreOnly: true });
    expect(r.status).toBe(200);
    expect(r.body.pointsEarned).toBe(12);
    expect(r.body.member.balance).toBe(12);
    expect((await ledgerRows(p.merchant.id)).some((t) => t.type === "welcome_bonus")).toBe(false);
    // A non-pharmacy keeps its welcome bonus.
    const shop = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    await env.db.update((await import("@ll/db")).loyaltyPrograms).set({ welcomeBonus: 50 }).where(eq((await import("@ll/db")).loyaltyPrograms.merchantId, shop.merchant.id));
    const s = await call(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/counter/award`, { phone: nextPhone(), amountCents: 1000, idempotencyKey: randomUUID() });
    expect(s.body.member.balance).toBe(60);
  });

  it("network perks and campaign bonuses never pay at a pharmacy, and a pharmacy visit does not count toward them", async () => {
    const { networkPerks, ledgerTransactions: lt } = await import("@ll/db");
    const hood = await (await import("./helpers.js")).createNeighbourhood(env.db);
    await env.db.insert(networkPerks).values({ neighbourhoodId: hood.id, name: "Strip explorer", threshold: 2, bonusPoints: 50 });
    const rx = await pharmacy();
    const cafe = await paidMerchant(env, { plan: "plus", vertical: "cafe" });
    const cafe2 = await paidMerchant(env, { plan: "plus", vertical: "cafe" });
    for (const m of [rx, cafe, cafe2]) await env.db.update(merchants).set({ neighbourhoodId: hood.id }).where(eq(merchants.id, m.merchant.id));
    const phone = nextPhone();
    const a = await call(env, rx.ownerToken, "POST", `${rx.base}/counter/award`, { phone, amountCents: 1000, frontStoreOnly: true, idempotencyKey: randomUUID() });
    expect(a.status).toBe(200);
    expect(a.body.extraPoints).toBe(0);
    // One café visit after the pharmacy visit is only the first non-pharmacy shop: no perk yet.
    const c1 = await call(env, cafe.ownerToken, "POST", `/v1/merchants/${cafe.merchant.id}/counter/award`, { phone, amountCents: 500, idempotencyKey: randomUUID() });
    expect(c1.body.extraPoints).toBe(0);
    // The second non-pharmacy shop earns it.
    const c2 = await call(env, cafe2.ownerToken, "POST", `/v1/merchants/${cafe2.merchant.id}/counter/award`, { phone, amountCents: 500, idempotencyKey: randomUUID() });
    expect(c2.body.extraPoints).toBe(50);
    const bonus = await env.db.select().from(lt).where(eq(lt.type, "network_bonus"));
    expect(bonus.every((t) => t.merchantId !== rx.merchant.id)).toBe(true);
  });

  it("nothing is awarded or redeemed until the pharmacist-owner has confirmed, and the number is kept", async () => {
    const p = await pharmacy({ unconfirmed: true });
    const refused = await award(p, { amountCents: 1000, frontStoreOnly: true });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("pharmacy_not_confirmed");
    expect(await memberRows(p.merchant.id)).toHaveLength(0);
    expect(await ledgerRows(p.merchant.id)).toHaveLength(0);
    const ok = await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman", ocpNumber: "7654321", agree: true });
    expect(ok.body.confirmation).toMatchObject({ ocpNumber: "7654321" });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, p.merchant.id));
    expect(m!.pharmacyOcpNumber).toBe("7654321");
    expect((await award(p, { amountCents: 1000, frontStoreOnly: true })).status).toBe(200);
  });

  it("setup lists the pharmacist confirmation as a core step for a pharmacy only, and it completes on confirm", async () => {
    const p = await pharmacy({ unconfirmed: true });
    const before = await call(env, p.ownerToken, "GET", `${p.base}/onboarding`);
    const keys = before.body.steps.map((s: { key: string }) => s.key);
    expect(keys.slice(0, 2)).toEqual(["program", "pharmacy_rules"]);
    expect(before.body.steps.find((s: { key: string }) => s.key === "pharmacy_rules").done).toBe(false);
    expect(before.body.steps.find((s: { key: string }) => s.key === "first_stamp").label).toBe("Record your first front-store sale");
    await call(env, p.ownerToken, "POST", `${p.base}/pharmacy/confirm`, { name: "Amira Rahman", ocpNumber: "7654321", agree: true });
    const after = await call(env, p.ownerToken, "GET", `${p.base}/onboarding`);
    expect(after.body.steps.find((s: { key: string }) => s.key === "pharmacy_rules").done).toBe(true);
    const shop = await paidMerchant(env, { plan: "plus", vertical: "retail" });
    const other = await call(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/onboarding`);
    expect(other.body.steps.map((s: { key: string }) => s.key)).not.toContain("pharmacy_rules");
  });

  it("the text check catches Hindi, Urdu and Punjabi drug-discount wording, health claims, referral offers and a flu jab", () => {
    for (const t of [
      "दवाई पर 10% छूट",
      "दवा पर 10% छूट",
      "ادویات پر 10 فیصد رعایت",
      "دوائی پر رعایت",
      "ਦਵਾਈ ’ਤੇ 10% ਛੋਟ",
      "dawai par 10% discount",
      "Cold and flu season: vitamin C boosts immunity, 20% off vitamins",
      "Supports your immune system. 2x points.",
      "This cures colds",
      "Refer a friend and get $5",
      "Bring a friend, both get points",
      "Come get your flu jab, 10% off at the till",
    ]) expect(checkPharmacyText(t).ok, t).toBe(false);
    expect(checkPharmacyText("Cold and flu season: vitamin C boosts immunity").kind).toBe("claim");
    expect(checkPharmacyText("Refer a friend and get $5").kind).toBe("referral");
    // Front-store wording is still fine, and an appointment type may say "jab".
    for (const t of ["Vitamins and tissues earn double points this week", "Sweet treats at the till", "Prefer to pay by card? Tap and go"]) expect(checkPharmacyText(t).ok, t).toBe(true);
    expect(checkPharmacyText("Flu jab", { mode: "label", allowServiceWords: true }).ok).toBe(true);
  });

  it("a pharmacy cannot send the claim, referral or Hindi wording in a message", async () => {
    const p = await pharmacy();
    for (const body of ["Vitamin C boosts immunity. 20% off.", "Refer a friend and get $5.", "दवाई पर 10% छूट"]) {
      const r = await call(env, p.ownerToken, "POST", `${p.base}/messages`, { channel: "email", subject: "Hello", body, segment: { kind: "all" } });
      expect(r.status, body).toBe(422);
      expect(r.body.error.code).toBe("pharmacy_text");
    }
  });

  it("copay, insurance, ODB, test strips and Schedule II or III names lock as categories", async () => {
    const p = await pharmacy();
    for (const name of ["Insurance copay", "Diabetes test strips", "ODB items", "Schedule II drugs", "Schedule 3 products", "Behind the counter", "Pseudoephedrine", "Low-dose codeine"]) {
      expect((await call(env, p.ownerToken, "POST", `${p.base}/categories`, { name, earnEligible: true })).status, name).toBe(422);
      const made = await call(env, p.ownerToken, "POST", `${p.base}/categories`, { name });
      expect(made.status, name).toBe(201);
      expect(made.body, name).toMatchObject({ earnEligible: false, discountEligible: false });
    }
    // The shop can still have ordinary categories.
    expect((await call(env, p.ownerToken, "POST", `${p.base}/categories`, { name: "Cough and cold" })).body.earnEligible).toBe(true);
  });

  it("the confirmation text and the reminder name neither the shop nor the service", async () => {
    const who = await customer(env);
    await env.db.update(users).set({ locale: "en" }).where(eq(users.id, who.user.id));
    const p = await pharmacy();
    const pharmacist = await staffMember(env, p.merchant.id, "staff");
    expect((await call(env, p.ownerToken, "PUT", `${p.base}/staff/${pharmacist.user.id}/hours`, { days: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" })) })).status).toBe(200);
    const flu = await call(env, p.ownerToken, "POST", `${p.base}/services`, { name: "Flu shot", durationMin: 15, priceCents: 0, categoryId: p.front.id });
    expect(flu.status).toBe(201);
    const r = await call(env, who.token, "POST", "/v1/me/appointments", { serviceIds: [flu.body.id], staffId: null, startsAt: at("2026-11-05 10:00") });
    expect(r.status).toBe(201);
    const sms = env.ctx.providers.outbox.sms.filter((x) => x.to === who.user.phone);
    for (const m of sms) {
      expect(m.body, m.body).not.toContain(p.merchant.name);
      expect(m.body.toLowerCase()).not.toMatch(/flu|shot|pharm/);
    }
  });
});
