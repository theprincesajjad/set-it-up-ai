import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerEntries, locations, merchantMembers, merchantStaff, merchants, messageDeliveries, users, visits } from "@ll/db";
import type { staffApi } from "@ll/shared";
import { awardPurchase, ledgerBalance, redeemReward } from "../src/services/ledger.js";
import { flushReceipts, localDayStart } from "../src/services/staff.js";
import { createMerchant, createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => {
  await flushReceipts();
  await env.close();
});

const call = (method: "GET" | "POST", url: string, payload?: unknown, token?: string, headers: Record<string, string> = {}) =>
  env.app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

/** Ledger/visit rows take created_at from the database clock; tests comparing them with ctx.now() use real time. */
async function realClock() {
  await env.close();
  env = await createTestEnv({ now: new Date() });
}

let seq = 0;
const key = () => `key-${Date.now()}-${seq++}`;

async function shop(opts: Parameters<typeof createMerchant>[1] = {}) {
  const m = await createMerchant(env, opts);
  const [loc] = await env.db
    .insert(locations)
    .values({ merchantId: m.merchant.id, name: "Main", address: "1 Queen St W", qrCode: `QR${m.merchant.slug}` })
    .returning();
  const staffUser = await createUser(env.db, { name: "Jo Staff" });
  await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: staffUser.id, role: "staff" });
  const manager = await createUser(env.db, { name: "Max Manager" });
  await env.db.insert(merchantStaff).values({ merchantId: m.merchant.id, userId: manager.id, role: "manager" });
  const base = `/v1/merchants/${m.merchant.id}/counter`;
  return { ...m, location: loc!, base, staffUser, staffToken: await tokenFor(env, staffUser), manager, managerToken: await tokenFor(env, manager) };
}

describe("lookup", () => {
  it("finds members by phone, QR payload, member code and last 4 digits, with masked phones", async () => {
    const s = await shop();
    const phone = "+14165557788";
    const award = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone, customerName: "Pat Q", source: "staff_app", amountCents: 6000 });
    const [u] = await env.db.select().from(users).where(eq(users.phone, phone));

    const byPhone = await call("GET", `${s.base}/lookup?q=${encodeURIComponent("(416) 555-7788")}`, undefined, s.staffToken);
    expect(byPhone.statusCode).toBe(200);
    const r: staffApi.LookupResponse = byPhone.json();
    expect(r.matchedBy).toBe("phone");
    expect(r.items[0]).toMatchObject({
      memberId: award.member.id,
      name: "Pat Q",
      maskedPhone: "(416) ***-7788",
      balance: 60,
      rewardsAffordable: [{ id: s.reward.id, name: "$5 off", pointsCost: 50 }],
      expiryDisclosure: "Points never expire.",
    });
    expect(JSON.stringify(r)).not.toContain("5557788");

    const byQr = await call("GET", `${s.base}/lookup?q=LL:${u!.memberCode}`, undefined, s.staffToken);
    expect(byQr.json()).toMatchObject({ matchedBy: "member_code", items: [{ memberId: award.member.id }] });
    const byCode = await call("GET", `${s.base}/lookup?q=${u!.memberCode.toLowerCase()}`, undefined, s.staffToken);
    expect(byCode.json().items).toHaveLength(1);
    const last4 = await call("GET", `${s.base}/lookup?q=7788`, undefined, s.staffToken);
    expect(last4.json()).toMatchObject({ matchedBy: "last4", items: [{ memberId: award.member.id }] });
    const none = await call("GET", `${s.base}/lookup?q=4165550000`, undefined, s.staffToken);
    expect(none.json()).toEqual({ matchedBy: "phone", items: [], normalizedPhone: "+14165550000" });
    expect((await call("GET", `${s.base}/lookup?q=hello`, undefined, s.staffToken)).statusCode).toBe(400);
  });

  it("isolates merchants: staff of B never see A's members", async () => {
    const a = await shop();
    const b = await shop();
    const phone = nextPhone();
    const award = await awardPurchase(env.ctx, { merchantId: a.merchant.id, phone, source: "staff_app", amountCents: 1000 });
    const [u] = await env.db.select().from(users).where(eq(users.phone, phone));
    for (const q of [phone, `LL:${u!.memberCode}`, phone.slice(-4)]) {
      const res = await call("GET", `${b.base}/lookup?q=${encodeURIComponent(q)}`, undefined, b.staffToken);
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toEqual([]);
    }
    // B's staff can't use A's counter, and can't address A's member by id from B's counter.
    expect((await call("GET", `${a.base}/lookup?q=${phone}`, undefined, b.staffToken)).statusCode).toBe(403);
    const cross = await call("POST", `${b.base}/award`, { memberId: award.member.id, amountCents: 1000, idempotencyKey: key() }, b.staffToken);
    expect(cross.statusCode).toBe(404);
    const crossRedeem = await call("POST", `${b.base}/redeem`, { memberId: award.member.id, rewardId: a.reward.id, idempotencyKey: key() }, b.staffToken);
    expect(crossRedeem.statusCode).toBe(404);
    // Customers and anonymous callers are refused.
    const cust = await createUser(env.db);
    expect((await call("GET", `${a.base}/lookup?q=${phone}`, undefined, await tokenFor(env, cust))).statusCode).toBe(403);
    expect((await call("GET", `${a.base}/lookup?q=${phone}`)).statusCode).toBe(401);
  });
});

describe("award", () => {
  it("awards a purchase, excludes no-earn lines, and is idempotent via the Idempotency-Key header", async () => {
    const s = await shop({ welcomeBonus: 5 });
    const phone = nextPhone();
    const payload = {
      phone,
      customerName: "New Person",
      lines: [{ amountCents: 1250 }, { amountCents: 4000, categoryId: s.noEarnCategory.id }],
      locationId: s.location.id,
      consent: { text: "Yes, Test Shop may text me offers. Reply STOP to opt out." },
    };
    const k = key();
    const res = await call("POST", `${s.base}/award`, payload, s.staffToken, { "idempotency-key": k });
    expect(res.statusCode).toBe(200);
    const body: staffApi.AwardResponse = res.json();
    expect(body).toMatchObject({ memberCreated: true, duplicate: false, pointsEarned: 12, balance: 17, eligibleCents: 1250, excludedCents: 4000, receiptQueued: false });
    expect(body.breakdown.join(" ")).toContain("excluded");
    expect(body.member).toMatchObject({ name: "New Person", marketingConsent: true, visitCount: 1 });
    const dup = await call("POST", `${s.base}/award`, payload, s.staffToken, { "idempotency-key": k });
    expect(dup.json()).toMatchObject({ duplicate: true, balance: 17 });
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, body.member.memberId));
    expect(m!.visitCount).toBe(1);
    expect(m!.marketingConsentSource).toBe("counter_staff");
    expect(await ledgerBalance(env.db, m!.id)).toBe(17);
  });

  it("validates input", async () => {
    const s = await shop();
    expect((await call("POST", `${s.base}/award`, { phone: nextPhone(), amountCents: 100 }, s.staffToken)).statusCode).toBe(400);
    expect((await call("POST", `${s.base}/award`, { amountCents: 100, idempotencyKey: key() }, s.staffToken)).statusCode).toBe(400);
    expect((await call("POST", `${s.base}/award`, { phone: "123", amountCents: 100, idempotencyKey: key() }, s.staffToken)).statusCode).toBe(400);
    expect((await call("POST", `${s.base}/award`, { memberCode: "LL:ZZZZZZZZ", amountCents: 100, idempotencyKey: key() }, s.staffToken)).statusCode).toBe(404);
    expect((await call("POST", `${s.base}/award`, { phone: nextPhone(), amountCents: -5, idempotencyKey: key() }, s.staffToken)).statusCode).toBe(400);
  });

  it("sends an SMS receipt outside the transaction only when enabled and not muted", async () => {
    const s = await shop();
    const phone = nextPhone();
    const first = await call("POST", `${s.base}/award`, { phone, amountCents: 1200, idempotencyKey: key() }, s.staffToken);
    expect(first.json().receiptQueued).toBe(false);
    await flushReceipts();
    expect(env.ctx.providers.outbox.sms).toHaveLength(0);

    await env.db.update(merchants).set({ smsReceiptsEnabled: true }).where(eq(merchants.id, s.merchant.id));
    const second = await call("POST", `${s.base}/award`, { phone, amountCents: 3600, idempotencyKey: key() }, s.staffToken);
    expect(second.json().receiptQueued).toBe(true);
    await flushReceipts();
    expect(env.ctx.providers.outbox.sms.at(-1)).toMatchObject({ to: phone, body: "You earned 36 points at Test Shop. Balance 48. Reply STOP to opt out" });
    const [d] = await env.db.select().from(messageDeliveries);
    expect(d).toMatchObject({ kind: "transactional", status: "sent", channel: "sms" });

    await env.db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, second.json().member.memberId));
    const third = await call("POST", `${s.base}/award`, { phone, amountCents: 1000, idempotencyKey: key() }, s.staffToken);
    expect(third.json().receiptQueued).toBe(false);
    await flushReceipts();
    expect(env.ctx.providers.outbox.sms).toHaveLength(1);
  });

  it("enforces the visit cooldown on stamp programs", async () => {
    const s = await shop({ earnType: "stamps" });
    const phone = nextPhone();
    expect((await call("POST", `${s.base}/award`, { phone, idempotencyKey: key() }, s.staffToken)).json().pointsEarned).toBe(1);
    const again = await call("POST", `${s.base}/award`, { phone, idempotencyKey: key() }, s.staffToken);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("cooldown");
  });
});

describe("redeem and redemption codes", () => {
  it("redeems at the counter and verifies app-issued codes exactly once", async () => {
    const s = await shop();
    const r = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 12000 });
    const red = await call("POST", `${s.base}/redeem`, { memberId: r.member.id, rewardId: s.reward.id, subtotalCents: 300, idempotencyKey: key() }, s.staffToken);
    expect(red.statusCode).toBe(200);
    expect(red.json()).toMatchObject({ duplicate: false, redemption: { status: "used", discountCents: 300 }, member: { balance: 70 } });

    const issued = await redeemReward(env.ctx, { merchantId: s.merchant.id, memberId: r.member.id, rewardId: s.reward.id, source: "customer_app" });
    expect(issued.redemption.status).toBe("issued");
    const b = await shop();
    expect((await call("POST", `${b.base}/redemptions/verify`, { code: issued.redemption.code }, b.staffToken)).statusCode).toBe(404);
    const v = await call("POST", `${s.base}/redemptions/verify`, { code: issued.redemption.code.toLowerCase() }, s.staffToken);
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ redemption: { status: "used", code: issued.redemption.code, reward: { name: "$5 off" } }, member: { balance: 20 } });
    const twice = await call("POST", `${s.base}/redemptions/verify`, { code: issued.redemption.code }, s.staffToken);
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.code).toBe("already_used");
    const broke = await call("POST", `${s.base}/redeem`, { memberId: r.member.id, rewardId: s.reward.id, idempotencyKey: key() }, s.staffToken);
    expect(broke.json().error.code).toBe("insufficient_points");
  });
});

describe("today, activity and undo", () => {
  it("lists today's visits and recent activity", async () => {
    await realClock();
    const s = await shop();
    await call("POST", `${s.base}/award`, { phone: nextPhone(), amountCents: 1000, locationId: s.location.id, idempotencyKey: key() }, s.staffToken);
    await call("POST", `${s.base}/award`, { phone: nextPhone(), amountCents: 2000, idempotencyKey: key() }, s.staffToken);
    const t = await call("GET", `${s.base}/today`, undefined, s.staffToken);
    expect(t.json()).toMatchObject({ date: localDayStart(env.clock.now, "America/Toronto").date, visitCount: 2, newMembers: 2, pointsIssued: 30, redemptions: 0 });
    const loc = await call("GET", `${s.base}/today?locationId=${s.location.id}`, undefined, s.staffToken);
    expect(loc.json().items).toHaveLength(1);
    expect(loc.json().items[0]).toMatchObject({ points: 10, amountCents: 1000 });
    const a = await call("GET", `${s.base}/activity?limit=10`, undefined, s.staffToken);
    expect(a.json().items).toHaveLength(2);
    expect(a.json().items[0]).toMatchObject({ type: "earn", staffName: "Jo Staff", canUndo: true });
    const other = await shop();
    expect((await call("GET", `${other.base}/activity`, undefined, other.staffToken)).json().items).toEqual([]);
  });

  it("lets staff undo their own award for 15 minutes, managers any time, and clears the visit", async () => {
    await realClock();
    const s = await shop({ earnType: "stamps" });
    const phone = nextPhone();
    const aw = (await call("POST", `${s.base}/award`, { phone, idempotencyKey: key() }, s.staffToken)).json();
    const undo = await call("POST", `${s.base}/transactions/${aw.transactionId}/undo`, { reason: "Wrong customer" }, s.staffToken);
    expect(undo.statusCode).toBe(200);
    expect(undo.json().member).toMatchObject({ balance: 0, visitCount: 0, lastVisitAt: null });
    expect(await env.db.select().from(visits)).toHaveLength(0);
    // The visit was removed, so the cooldown no longer blocks the correct award.
    const redo = await call("POST", `${s.base}/award`, { phone, idempotencyKey: key() }, s.staffToken);
    expect(redo.statusCode).toBe(200);
    expect((await call("POST", `${s.base}/transactions/${aw.transactionId}/undo`, {}, s.managerToken)).statusCode).toBe(409);

    const colleague = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: s.merchant.id, userId: colleague.id, role: "staff" });
    const colleagueToken = await tokenFor(env, colleague);
    expect((await call("POST", `${s.base}/transactions/${redo.json().transactionId}/undo`, {}, colleagueToken)).statusCode).toBe(403);
    env.clock.now = new Date(env.clock.now.getTime() + 16 * 60_000);
    expect((await call("POST", `${s.base}/transactions/${redo.json().transactionId}/undo`, {}, s.staffToken)).statusCode).toBe(403);
    const mgr = await call("POST", `${s.base}/transactions/${redo.json().transactionId}/undo`, {}, s.managerToken);
    expect(mgr.statusCode).toBe(200);
    expect(mgr.json().member.balance).toBe(0);
    const b = await shop();
    expect((await call("POST", `${b.base}/transactions/${aw.transactionId}/undo`, {}, b.managerToken)).statusCode).toBe(404);
    expect((await env.db.select().from(ledgerEntries)).reduce((sum, e) => sum + e.amount, 0)).toBe(0);
  });
});

describe("offline sync", () => {
  it("processes queued events idempotently with per-event results", async () => {
    const s = await shop();
    const known = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 9000 });
    const other = await shop();
    const foreign = await awardPurchase(env.ctx, { merchantId: other.merchant.id, phone: nextPhone(), source: "staff_app", amountCents: 9000 });
    const at = (minAgo: number) => new Date(env.clock.now.getTime() - minAgo * 60_000).toISOString();
    const events = [
      { type: "award", idempotencyKey: "off-0001", occurredAt: at(20), phone: nextPhone(), amountCents: 1500 },
      { type: "award", idempotencyKey: "off-0002", occurredAt: at(15), memberId: known.member.id, amountCents: 1000 },
      { type: "redeem", idempotencyKey: "off-0003", occurredAt: at(10), memberId: known.member.id, rewardId: s.reward.id },
      { type: "award", idempotencyKey: "off-0004", occurredAt: at(9), memberId: foreign.member.id, amountCents: 1000 },
      { type: "award", idempotencyKey: "off-0005", occurredAt: new Date(env.clock.now.getTime() - 8 * 86400_000).toISOString(), phone: nextPhone(), amountCents: 1000 },
      { type: "award", idempotencyKey: "off-0006", occurredAt: new Date(env.clock.now.getTime() + 60 * 60_000).toISOString(), phone: nextPhone(), amountCents: 1000 },
    ];
    const res = await call("POST", `${s.base}/sync`, { events }, s.staffToken);
    expect(res.statusCode).toBe(200);
    const body: staffApi.SyncResponse = res.json();
    expect(body.results.map((r) => [r.idempotencyKey, r.status])).toEqual([
      ["off-0001", "ok"],
      ["off-0002", "ok"],
      ["off-0003", "ok"],
      ["off-0004", "error"],
      ["off-0005", "error"],
      ["off-0006", "error"],
    ]);
    expect(body.summary).toEqual({ ok: 3, duplicate: 0, error: 3 });
    const r4 = body.results[3]!;
    expect(r4.status === "error" && r4.error.code).toBe("not_found");
    const r5 = body.results[4]!;
    expect(r5.status === "error" && r5.error.code).toBe("too_old");
    const r3 = body.results[2]!;
    expect(r3.status === "ok" && r3.type === "redeem" && r3.result.member.balance).toBe(50);

    // The device retries the whole queue after a timeout: nothing is double-counted.
    const retry: staffApi.SyncResponse = (await call("POST", `${s.base}/sync`, { events: events.slice(0, 3) }, s.staffToken)).json();
    expect(retry.summary).toEqual({ ok: 0, duplicate: 3, error: 0 });
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.id, known.member.id));
    expect(m!.balance).toBe(50);
    expect(m!.visitCount).toBe(2);
    // An online award retried through the offline queue is the same tap.
    const online = await call("POST", `${s.base}/award`, { memberId: known.member.id, amountCents: 500, idempotencyKey: "tap-same-1" }, s.staffToken);
    const replay = (await call("POST", `${s.base}/sync`, { events: [{ type: "award", idempotencyKey: "tap-same-1", occurredAt: at(1), memberId: known.member.id, amountCents: 500 }] }, s.staffToken)).json();
    expect(replay.results[0]).toMatchObject({ status: "duplicate", result: { transactionId: online.json().transactionId } });
  });

  it("applies the cooldown using occurredAt for visit programs", async () => {
    const s = await shop({ earnType: "per_visit" });
    const phone = nextPhone();
    const at = (minAgo: number) => new Date(env.clock.now.getTime() - minAgo * 60_000).toISOString();
    const res: staffApi.SyncResponse = (
      await call(
        "POST",
        `${s.base}/sync`,
        {
          events: [
            { type: "award", idempotencyKey: "v-000001", occurredAt: at(120), phone },
            { type: "award", idempotencyKey: "v-000002", occurredAt: at(110), phone },
            { type: "award", idempotencyKey: "v-000003", occurredAt: at(60), phone },
          ],
        },
        s.staffToken,
      )
    ).json();
    expect(res.results.map((r) => r.status)).toEqual(["ok", "error", "ok"]);
    const r2 = res.results[1]!;
    expect(r2.status === "error" && r2.error.code).toBe("cooldown");
    expect((await call("POST", `${s.base}/sync`, { events: [] }, s.staffToken)).statusCode).toBe(400);
  });
});

describe("kiosk check-in", () => {
  it("awards a visit on stamp programs and respects the cooldown", async () => {
    const s = await shop({ earnType: "stamps", welcomeBonus: 1 });
    const phone = "647 555 0199";
    const first = await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: s.location.id, consent: { text: "Yes, send me Test Shop offers. Reply STOP to opt out." } }, s.staffToken);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ memberCreated: true, outcome: "visit", pointsEarned: 1, balance: 2, maskedPhone: "(647) ***-0199" });
    expect(first.json().message).toContain("Welcome to Test Shop");
    const [m] = await env.db.select().from(merchantMembers).where(eq(merchantMembers.merchantId, s.merchant.id));
    expect(m!.marketingConsentSource).toBe("kiosk");
    const again = await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: s.location.id }, s.staffToken);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("cooldown");
    env.clock.now = new Date(env.clock.now.getTime() + 31 * 60_000);
    const later = await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: s.location.id }, s.staffToken);
    expect(later.json()).toMatchObject({ memberCreated: false, pointsEarned: 1, balance: 3 });
  });

  it("only enrolls on per-dollar programs and needs a staff token", async () => {
    const s = await shop({ welcomeBonus: 20 });
    const phone = nextPhone();
    const res = await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: s.location.id }, s.staffToken);
    expect(res.json()).toMatchObject({ memberCreated: true, outcome: "enrolled", pointsEarned: 0, balance: 20 });
    expect((await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: s.location.id }, s.staffToken)).json()).toMatchObject({ memberCreated: false, balance: 20 });
    expect((await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: s.location.id })).statusCode).toBe(401);
    const b = await shop();
    expect((await call("POST", `${s.base}/kiosk/check-in`, { phone, locationId: b.location.id }, s.staffToken)).statusCode).toBe(400);
  });
});

describe("merge duplicates", () => {
  it("moves balance with balanced ledger transactions, hides the duplicate and forwards future awards", async () => {
    const s = await shop();
    const oldPhone = nextPhone();
    const newPhone = nextPhone();
    const src = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: oldPhone, source: "staff_app", amountCents: 3000 });
    const tgt = await awardPurchase(env.ctx, { merchantId: s.merchant.id, phone: newPhone, source: "staff_app", amountCents: 2500 });
    const body = { sourceMemberId: src.member.id, targetMemberId: tgt.member.id, reason: "Customer changed phone number" };
    expect((await call("POST", `${s.base}/members/merge`, body, s.staffToken)).statusCode).toBe(403);
    const res = await call("POST", `${s.base}/members/merge`, body, s.managerToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ movedPoints: 30, movedVisits: 1, target: { memberId: tgt.member.id, balance: 55, visitCount: 2 } });
    expect(res.json().transferTransactionIds).toHaveLength(2);
    expect(await ledgerBalance(env.db, src.member.id)).toBe(0);
    expect(await ledgerBalance(env.db, tgt.member.id)).toBe(55);
    expect((await env.db.select().from(ledgerEntries)).reduce((sum, e) => sum + e.amount, 0)).toBe(0);

    expect((await call("GET", `${s.base}/lookup?q=${oldPhone}`, undefined, s.staffToken)).json().items).toEqual([]);
    const fwd = await call("POST", `${s.base}/award`, { phone: oldPhone, amountCents: 1000, idempotencyKey: key() }, s.staffToken);
    expect(fwd.json()).toMatchObject({ memberCreated: false, balance: 65, member: { memberId: tgt.member.id } });
    expect((await call("POST", `${s.base}/members/merge`, body, s.managerToken)).statusCode).toBe(409);
    const b = await shop();
    expect((await call("POST", `${b.base}/members/merge`, body, b.managerToken)).statusCode).toBe(404);
  });
});
