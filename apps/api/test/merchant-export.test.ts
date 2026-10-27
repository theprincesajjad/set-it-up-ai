/**
 * The owner's export of Merchant Customer Data (merchant agreement 2.1): a CSV per kind of record and a ZIP of all
 * of them, on paid plans and for 90 days after leaving, scoped to the one shop, consent and secrets respected.
 */
import { unzipSync, strFromU8 } from "fflate";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, classBookings, classCharges, classMemberships, classPasses, classSessions, commOptOuts, locations, merchantMembers, merchantStaff, messageDeliveries, messages, orderItems, orders, serviceTickets, users, visits } from "@ll/db";
import { MERCHANT_EXPORTS, MERCHANT_EXPORT_KEYS, RETENTION } from "@ll/shared";
import { MemoryStorage, UPLOAD_PATH } from "../src/providers/storage.js";
import { setMerchantStatus } from "../src/services/admin.js";
import { deleteAccount } from "../src/services/customer.js";
import { parseCsvObjects } from "../src/services/csv.js";
import { PAID_FEATURES, setPlan, setStage, staffMember } from "./commerce-fixtures.js";
import { createMerchant, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";
import { seedEverything } from "./privacy-fixtures.js";

let env: TestEnv;
const DAY = 86_400_000;
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-03T15:00:00Z") });
});
afterEach(async () => env.close());

type Seeded = Awaited<ReturnType<typeof seedEverything>>;
interface Shop {
  s: Seeded;
  id: string;
  token: string;
}

/** The one shop with data in every module (seedEverything can run once per database); `other()` makes a small second shop. */
async function shop(plan: "free" | "plus" = "plus"): Promise<Shop> {
  await setStage(env, PAID_FEATURES, "ga");
  const s = await seedEverything(env);
  const [staff] = await env.db.select().from(merchantStaff).where(eq(merchantStaff.merchantId, s.merchant.id));
  const owner = (await env.db.select().from(users).where(eq(users.id, staff!.userId)))[0]!;
  await setPlan(env, s.merchant.id, plan);
  return { s, id: s.merchant.id, token: await tokenFor(env, owner) };
}
async function other(): Promise<Shop & { customerName: string }> {
  await setStage(env, PAID_FEATURES, "ga");
  const { merchant, owner } = await createMerchant(env);
  await setPlan(env, merchant.id, "plus");
  const customerUser = await createUser(env.db, { name: "Zed Other", email: `zed${Math.random().toString(36).slice(2, 8)}@example.com` });
  const [member] = await env.db.insert(merchantMembers).values({ merchantId: merchant.id, userId: customerUser.id }).returning();
  await env.db.insert(orders).values({ merchantId: merchant.id, userId: customerUser.id, number: 1, subtotalCents: 500, totalCents: 565, status: "picked_up", notes: "Zed's order" });
  await env.db.insert(visits).values({ merchantId: merchant.id, memberId: member!.id, userId: customerUser.id, amountCents: 500, source: "staff_app" });
  return { s: undefined as never, id: merchant.id, token: await tokenFor(env, owner), customerName: "Zed Other" };
}
const reauth = async (m: Shop) => ({ ...m, token: await tokenFor(env, (await env.db.select().from(users).where(eq(users.id, (await env.db.select().from(merchantStaff).where(eq(merchantStaff.merchantId, m.id)))[0]!.userId)))[0]!) });

async function get(m: Shop, file: string, token = m.token) {
  const r = await env.app.inject({ method: "GET", url: `/v1/merchants/${m.id}/exports/${file}`, headers: { authorization: `Bearer ${token}` } });
  return { status: r.statusCode, headers: r.headers, text: r.body, raw: r.rawPayload };
}
const csv = async (m: Shop, key: string) => {
  const r = await get(m, `${key}.csv`);
  expect(r.status, key).toBe(200);
  return parseCsvObjects(r.text);
};
const unzip = async (m: Shop) => {
  const r = await get(m, "all.zip");
  expect(r.status).toBe(200);
  return unzipSync(new Uint8Array(r.raw));
};

describe("the export covers every kind of record", () => {
  it("lists the same datasets the panel shows, and each one downloads as CSV with its header row", async () => {
    const m = await shop();
    expect(MERCHANT_EXPORT_KEYS).toHaveLength(MERCHANT_EXPORTS.length);
    for (const k of MERCHANT_EXPORT_KEYS) {
      const r = await get(m, `${k}.csv`);
      expect(r.status, k).toBe(200);
      expect(r.headers["content-type"], k).toContain("text/csv");
      expect(r.headers["content-disposition"], k).toMatch(new RegExp(`attachment; filename=".*-${k}-2026-11-03\\.csv"`));
      expect(parseCsvObjects(r.text).headers.length, k).toBeGreaterThan(3);
    }
  });

  it("has the shop's rows in members, orders, appointments, tiffin, catering, halls, tickets, quotes, invoices, reviews, WhatsApp and phone orders", async () => {
    const m = await shop();
    const { s } = m;
    await env.db.insert(visits).values({ merchantId: m.id, memberId: s.member.id, userId: s.user.id, amountCents: 1250, source: "staff_app" });
    await env.db.insert(orderItems).values({ orderId: s.ids.order.id, name: "Chicken biryani", quantity: 2, unitPriceCents: 1100, modifiers: [{ name: "Spice", option: "Hot", priceCents: 100 }], notes: "no raita" });
    const [campaign] = await env.db.insert(messages).values({ merchantId: m.id, channel: "sms", subject: null, body: "Eid special, 10% off", status: "sent", sentAt: env.clock.now, recipientCount: 1 }).returning();
    await env.db.insert(messageDeliveries).values({ messageId: campaign!.id, userId: s.user.id, merchantId: m.id, channel: "sms", to: s.phone, body: "Eid special, 10% off", kind: "campaign", status: "sent" });

    const rows = async (k: string) => (await csv(m, k)).rows;
    // a leading + is written as '+ so a spreadsheet never reads a phone number as a formula (the members CSV has always done this)
    expect(await rows("members")).toEqual([expect.objectContaining({ name: "Sam Secret", phone: `'${s.phone}`, email: "sam@example.com", tags: "vip", notes: "SECRET note", marketing_consent_text: "I agree" }), expect.anything()]);
    expect(await rows("visits")).toEqual([expect.objectContaining({ customer_name: "Sam Secret", amount: "12.50", source: "staff_app" })]);
    expect(await rows("orders")).toEqual([expect.objectContaining({ number: "1", customer_name: "Sam Secret", total: "22.60", allergy_note: "SECRET shellfish", notes: "SECRET order note", payment_status: "paid" })]);
    expect(await rows("order-items")).toEqual([expect.objectContaining({ name: "Chicken biryani", quantity: "2", line_total: "24.00", notes: "no raita" })]);
    expect(await rows("appointments")).toEqual([expect.objectContaining({ customer_name: "Sam Secret", notes: "SECRET appt note", client_note: "SECRET client note" })]);
    expect(await rows("tiffin-subscriptions")).toEqual([expect.objectContaining({ plan: "Thali", address: "SECRET 5 Elm St", dietary_notes: "SECRET no onions", delivery_notes: "SECRET side door", price: "120.00" })]);
    expect(await rows("tiffin-deliveries")).toEqual([expect.objectContaining({ date: "2026-11-04", note: "SECRET leave with neighbour" })]);
    expect(await rows("catering-events")).toEqual([expect.objectContaining({ headcount: "40", venue: "SECRET Hall", total: "5000.00", deposit: "1000.00", approved_by_name: "Sam Secret" })]);
    expect(await rows("hall-bookings")).toEqual([expect.objectContaining({ hall: "Grand", headcount: "100", total: "3000.00", notes: "SECRET hall note" })]);
    expect(await rows("tickets")).toEqual([expect.objectContaining({ number: "1", issue: "SECRET cracked screen", intake_notes: "SECRET passcode", status: "picked_up" })]);
    expect(await rows("quotes")).toEqual([expect.objectContaining({ ticket_number: "1", total: "169.50", signed_by_name: "Sam Secret", status: "approved" })]);
    expect(await rows("invoices")).toEqual([expect.objectContaining({ number: "1", total: "169.50", status: "paid" })]);
    expect(await rows("reviews")).toEqual([expect.objectContaining({ rating: "2", private_comment: "SECRET rude waiter", your_reply: "SECRET sorry Sam" })]);
    expect(await rows("messages")).toEqual([expect.objectContaining({ kind: "campaign", body: "Eid special, 10% off", recipients: "1" })]);
    expect(await rows("message-deliveries")).toEqual([expect.objectContaining({ customer_name: "Sam Secret", to: `'${s.phone}`, status: "sent" })]);
    expect(await rows("whatsapp-messages")).toEqual([expect.objectContaining({ customer_phone: `'${s.phone}`, direction: "in", body: "SECRET hello I am Sam" })]);
    expect(await rows("phone-orders")).toEqual([expect.objectContaining({ caller_phone: `'${s.phone}`, transcript: "SECRET transcript" })]);
    expect((await rows("points-ledger")).length).toBe(0); // nothing earned in this fixture; the file still has its header
    expect((await csv(m, "points-ledger")).headers).toContain("transaction_id");
  });

  it("scopes everything to the one shop: a second shop's data never appears", async () => {
    const a = await shop();
    const b = await other();
    const zip = await unzip(a);
    for (const [name, bytes] of Object.entries(zip)) {
      expect(strFromU8(bytes), name).not.toContain("Zed");
      expect(strFromU8(bytes), name).not.toMatch(/zed[a-z0-9]{6}@example\.com/);
    }
    // and the second shop's own file has only its own rows
    const mine = await csv(b, "orders");
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({ customer_name: "Zed Other", notes: "Zed's order" });
    expect((await csv(b, "members")).rows.map((r) => r.name)).toEqual(["Zed Other"]);
    expect((await csv(b, "tiffin-subscriptions")).rows).toHaveLength(0);
    for (const k of MERCHANT_EXPORT_KEYS) expect(Object.keys(zip)).toContain(`${k.replaceAll("-", "_")}.csv`);
    expect((await csv(a, "orders")).rows).toHaveLength(1);
  });
});

describe("the ZIP", () => {
  it("has every CSV, a README, and the ticket photo files named in tickets.csv", async () => {
    const m = await shop();
    const store = new MemoryStorage();
    env.ctx.providers.storage = store;
    const put = await store.put({ merchantId: m.id, contentType: "image/png", body: Buffer.from("PNGBYTES-repair-photo") });
    await env.db.update(serviceTickets).set({ photos: [`${UPLOAD_PATH}${put.key}`, "https://example.com/pasted.jpg"] }).where(eq(serviceTickets.id, m.s.ids.ticket.id));

    const r = await get(m, "all.zip");
    expect(r.headers["content-type"]).toBe("application/zip");
    expect(r.headers["content-disposition"]).toMatch(/attachment; filename=".*-customer-data-2026-11-03\.zip"/);
    const zip = unzipSync(new Uint8Array(r.raw));
    expect(Object.keys(zip).sort()).toEqual([...MERCHANT_EXPORT_KEYS.map((k) => `${k.replaceAll("-", "_")}.csv`), "README.txt", "photos/ticket-1-1.png"].sort());
    expect(strFromU8(zip["photos/ticket-1-1.png"]!)).toBe("PNGBYTES-repair-photo");
    const tickets = parseCsvObjects(strFromU8(zip["tickets.csv"]!));
    expect(tickets.rows[0]!.photos).toBe("photos/ticket-1-1.png;https://example.com/pasted.jpg");
    expect(strFromU8(zip["README.txt"]!)).toContain("may_follow_up");
    // the CSV on its own names the same file
    expect((await csv(m, "tickets")).rows[0]!.photos).toBe("photos/ticket-1-1.png;https://example.com/pasted.jpg");
  });

  it("carries no link, token, signature device or payment identifier", async () => {
    const m = await shop();
    const zip = await unzip(m);
    const all = Object.values(zip).map((b) => strFromU8(b)).join("\n");
    for (const secret of ["rev-tok", "q-tok", "inv-tok", "st-tok", "tok-cat", "split-tok", "203.0.113.9", "SECRET UA", "cus_x", "cus_t", "pm_x", "pm_t"]) expect(all, secret).not.toContain(secret);
    for (const [name, bytes] of Object.entries(zip)) if (name.endsWith(".csv")) expect(strFromU8(bytes).split("\r\n")[0]!.toLowerCase(), name).not.toMatch(/token|stripe|ip_address|user_agent|signature_ip/);
  });
});

describe("class data: classes, bookings, passes, memberships and charges", () => {
  /** A women-only class with one booking on a membership, one on a pack, a waitlisted guest, a pack, a membership and its charges. */
  async function studio(m: Shop) {
    const { s } = m;
    const [loc] = await env.db.insert(locations).values({ merchantId: m.id, name: "Studio A", address: "1523 Birchmount Rd", qrCode: `qr-class-${m.id.slice(0, 8)}` }).returning();
    const [cls] = await env.db.insert(classSessions).values({ merchantId: m.id, locationId: loc!.id, name: "Bhangra Cardio", instructorName: "Simran G.", room: "Studio A", startsAt: new Date("2026-11-09T23:30:00Z"), endsAt: new Date("2026-11-10T00:30:00Z"), capacity: 16, womenOnly: true, notes: "Bring a water bottle" }).returning();
    const [pass] = await env.db.insert(classPasses).values({ merchantId: m.id, userId: s.user.id, name: "10-class pack", creditsTotal: 10, creditsLeft: 7, expiresAt: new Date("2026-12-20T05:00:00Z"), status: "active" }).returning();
    const [mem] = await env.db.insert(classMemberships).values({ merchantId: m.id, userId: s.user.id, name: "Unlimited monthly", status: "active", priceCents: 12900, startDate: "2026-10-12", currentPeriodStart: "2026-10-12", currentPeriodEnd: "2026-11-11", nextBillingDate: "2026-11-12", agreementText: "MEMBERSHIP AGREEMENT\nMember: Sam Secret\nSECRET agreement body", agreementAcceptedAt: new Date("2026-10-12T14:00:00Z"), coolingOffEndsOn: "2026-10-22", cancelReason: "SECRET moving away", paymentMethodBrand: "visa", paymentMethodLast4: "4242", stripeCustomerId: "cus_SECRETSTRIPE", paymentMethodId: "pm_SECRETSTRIPE", setupIntentId: "seti_SECRETSTRIPE" }).returning();
    const [b1] = await env.db.insert(classBookings).values({ merchantId: m.id, sessionId: cls!.id, userId: s.user.id, status: "attended", payWith: "membership", membershipId: mem!.id, checkedInAt: new Date("2026-11-09T23:20:00Z") }).returning();
    const guest = await createUser(env.db, { name: "Waitlist Wanda", email: "wanda@example.com" });
    await env.db.insert(classBookings).values({ merchantId: m.id, sessionId: cls!.id, userId: guest.id, status: "waitlisted", waitlistedAt: new Date("2026-11-08T12:00:00Z") });
    await env.db.insert(classCharges).values({ merchantId: m.id, userId: s.user.id, kind: "membership", membershipId: mem!.id, periodStart: "2026-10-12", periodEnd: "2026-11-11", amountCents: 14577, taxCents: 1677, platformFeeCents: 146, status: "paid", paymentMethod: "card", stripePaymentIntentId: "pi_SECRETSTRIPE", paidAt: new Date("2026-10-12T14:01:00Z"), attempts: 1 });
    await env.db.insert(classCharges).values({ merchantId: m.id, userId: s.user.id, kind: "pack", passId: pass!.id, amountCents: 11300, taxCents: 1300, status: "paid", paymentMethod: "card" });
    return { cls: cls!, mem: mem!, pass: pass!, b1: b1!, guest };
  }

  it("has a file for each, with the shop's rows and the money in dollars", async () => {
    const m = await shop();
    const { cls, mem, pass } = await studio(m);
    expect(await csv(m, "classes").then((c) => c.rows)).toEqual([expect.objectContaining({ class_id: cls.id, name: "Bhangra Cardio", instructor: "Simran G.", room: "Studio A", location: "Studio A", capacity: "16", booked: "1", attended: "1", waitlisted: "1", women_only: "true", status: "scheduled" })]);
    const bookings = (await csv(m, "class-bookings")).rows;
    expect(bookings).toHaveLength(2);
    expect(bookings.find((b) => b.customer_name === "Sam Secret")).toMatchObject({ class_name: "Bhangra Cardio", status: "attended", paid_with: "membership", membership_id: mem.id, women_only: "true", checked_in_at: "2026-11-09T23:20:00.000Z" });
    expect(bookings.find((b) => b.customer_name === "Waitlist Wanda")).toMatchObject({ status: "waitlisted", paid_with: "", waitlisted_at: "2026-11-08T12:00:00.000Z" });
    expect((await csv(m, "class-passes")).rows).toEqual([expect.objectContaining({ pass_id: pass.id, customer_name: "Sam Secret", pass: "10-class pack", credits_total: "10", credits_left: "7", status: "active" })]);
    expect((await csv(m, "class-memberships")).rows).toEqual([expect.objectContaining({ membership: "Unlimited monthly", status: "active", price_per_period: "129.00", next_billing_date: "2026-11-12", agreement_accepted_at: "2026-10-12T14:00:00.000Z", card_brand: "visa", card_last4: "4242" })]);
    const charges = (await csv(m, "class-charges")).rows;
    expect(charges.map((c) => [c.kind, c.amount, c.tax, c.platform_fee, c.status])).toEqual([["membership", "145.77", "16.77", "1.46", "paid"], ["pack", "113.00", "13.00", "0.00", "paid"]]);
  });

  it("never carries card or Stripe identifiers, or the agreement text with its member name", async () => {
    const m = await shop();
    await studio(m);
    const all = [];
    for (const k of ["classes", "class-bookings", "class-passes", "class-memberships", "class-charges"]) all.push((await get(m, `${k}.csv`)).text);
    const text = all.join("\n");
    expect(text).not.toMatch(/SECRETSTRIPE|cus_|pm_|seti_|pi_/);
    expect(text).not.toContain("SECRET agreement body");
    for (const k of ["classes", "class-bookings", "class-passes", "class-memberships", "class-charges"]) expect((await csv(m, k)).headers.join(",").toLowerCase(), k).not.toMatch(/token|stripe|payment_method_id|intent|agreement_text|ip_address/);
  });

  it("scopes the class files to the one shop", async () => {
    const a = await shop();
    await studio(a);
    const b = await other();
    for (const k of ["classes", "class-bookings", "class-passes", "class-memberships", "class-charges"]) expect((await csv(b, k)).rows, k).toHaveLength(0);
    const zip = await unzip(a);
    for (const k of ["classes", "class_bookings", "class_passes", "class_memberships", "class_charges"]) expect(Object.keys(zip)).toContain(`${k}.csv`);
    expect(strFromU8(zip["class_bookings.csv"]!)).not.toContain("Zed");
  });

  it("says whether the customer may be texted: consent on file, not muted, not STOPped, and a deleted account is nobody", async () => {
    const m = await shop();
    const { guest } = await studio(m);
    const may = async (file: string, name: string) => (await csv(m, file)).rows.find((r) => r.customer_name === name)!.may_text;
    expect(await may("class-bookings", "Sam Secret")).toBe("false"); // the fixture's customer replied STOP
    await env.db.update(commOptOuts).set({ resubscribedAt: env.clock.now }).where(eq(commOptOuts.phone, m.s.phone));
    expect(await may("class-bookings", "Sam Secret")).toBe("true");
    expect(await may("class-memberships", "Sam Secret")).toBe("true");
    expect(await may("class-bookings", "Waitlist Wanda")).toBe("false"); // never joined the shop's list, no consent
    await env.db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, m.s.member.id));
    expect(await may("class-bookings", "Sam Secret")).toBe("false");
    expect(await may("class-memberships", "Sam Secret")).toBe("false");
    void guest;
  });

  it("a customer who deleted their account has no name, phone, reason or card in the class files, but the amounts stay", async () => {
    const m = await shop();
    await studio(m);
    await deleteAccount(env.ctx, m.s.user.id);
    const bookings = (await csv(m, "class-bookings")).rows;
    expect(bookings.find((b) => b.status === "attended" || b.status === "cancelled")).toMatchObject({ customer_name: "", phone: "", may_text: "false" });
    expect((await csv(m, "class-memberships")).rows[0]).toMatchObject({ customer_name: "", phone: "", cancel_reason: "", card_brand: "", card_last4: "", may_text: "false", price_per_period: "129.00" });
    expect((await csv(m, "class-passes")).rows[0]).toMatchObject({ customer_name: "", phone: "", credits_total: "10" });
    expect((await csv(m, "class-charges")).rows.map((c) => [c.customer_name, c.amount])).toEqual([["", "145.77"], ["", "113.00"]]);
    const all = Object.values(await unzip(m)).map((b) => strFromU8(b)).join("\n");
    for (const gone of ["sam@example.com", m.s.phone, "SECRET", "Sam Secret"]) expect(all, gone).not.toContain(gone);
  });
});

describe("consent rules", () => {
  it("members.csv carries the consent, the shop mute and the STOP list", async () => {
    const m = await shop();
    const row = (await csv(m, "members")).rows.find((r) => r.name === "Sam Secret")!;
    expect(row.marketing_consent_at).toBe("2026-11-03T15:00:00.000Z");
    expect(row.marketing_consent_source).toBe("app");
    expect(row.muted).toBe("false");
    expect(row.stopped_sms).toBe("true"); // the fixture's customer replied STOP
    expect(row.stopped_whatsapp).toBe("false");
    await env.db.update(commOptOuts).set({ resubscribedAt: env.clock.now }).where(eq(commOptOuts.phone, m.s.phone));
    expect((await csv(m, "members")).rows.find((r) => r.name === "Sam Secret")!.stopped_sms).toBe("false");
  });

  it("reviews.csv says whether the customer may be followed up: consent on file, not muted, not STOPped", async () => {
    const m = await shop();
    const may = async () => (await csv(m, "reviews")).rows[0]!.may_follow_up;
    expect(await may()).toBe("false"); // STOPped
    await env.db.update(commOptOuts).set({ resubscribedAt: env.clock.now }).where(eq(commOptOuts.phone, m.s.phone));
    expect(await may()).toBe("true");
    await env.db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, m.s.member.id));
    expect(await may()).toBe("false"); // muted this shop
    await env.db.update(merchantMembers).set({ muted: false, marketingConsentAt: null }).where(eq(merchantMembers.id, m.s.member.id));
    expect(await may()).toBe("false"); // never consented
  });

  it("a customer who deleted their account has no name, phone, email or birthday in any file, but the amounts stay", async () => {
    const m = await shop();
    await deleteAccount(env.ctx, m.s.user.id);
    const members = (await csv(m, "members")).rows[0]!;
    expect(members).toMatchObject({ name: "", phone: "", email: "", birthday: "", notes: "" });
    const order = (await csv(m, "orders")).rows[0]!;
    expect(order).toMatchObject({ customer_name: "", phone: "", total: "22.60" });
    expect((await csv(m, "reviews")).rows[0]).toMatchObject({ customer_name: "", may_follow_up: "false" });
    const all = Object.values(await unzip(m)).map((b) => strFromU8(b)).join("\n");
    for (const gone of ["sam@example.com", m.s.phone, "SECRET", "Sam Secret"]) expect(all, gone).not.toContain(gone);
    expect(parseCsvObjects(strFromU8((await unzip(m))["members.csv"]!).replace(/^\uFEFF/, "")).rows[0]!.name).toBe("");
  });
});

describe("who can download, and when", () => {
  it("a Free shop that has not left cannot (402), a manager can, a plain staff member cannot, an unknown dataset is a 404", async () => {
    const paid = await shop("plus");
    const free = await other();
    await setPlan(env, free.id, "free");
    expect((await get(free, "orders.csv")).status).toBe(402);
    expect((await get(free, "all.zip")).status).toBe(402);

    const staff = await staffMember(env, paid.id, "staff");
    expect((await get(paid, "orders.csv", staff.token)).status).toBe(403);
    expect((await get(paid, "all.zip", staff.token)).status).toBe(403);
    const manager = await staffMember(env, paid.id, "manager");
    expect((await get(paid, "orders.csv", manager.token)).status).toBe(200);
    expect((await get(paid, "nothing.csv")).status).toBe(404);
    expect((await get(paid, "orders")).status).toBe(404);
    expect((await get(paid, "../members.csv")).status).toBe(404);
    // another shop's owner cannot read this shop's export
    const stranger = await other();
    const cross = await env.app.inject({ method: "GET", url: `/v1/merchants/${paid.id}/exports/orders.csv`, headers: { authorization: `Bearer ${stranger.token}` } });
    expect(cross.statusCode).toBe(403);
  });

  it("after the shop closes the owner can export everything for 90 days, then not", async () => {
    const m = await shop("free");
    const admin = await createUser(env.db, { platformRole: "admin" });
    await setMerchantStatus(env.ctx, admin.id, m.id, "closed", "owner asked");
    await env.db.update(auditLogs).set({ createdAt: env.clock.now }).where(eq(auditLogs.action, "merchant.status_changed"));
    expect((await get(m, "orders.csv")).status).toBe(200);
    expect((await get(m, "all.zip")).status).toBe(200);

    env.clock.now = new Date(env.clock.now.getTime() + (RETENTION.leaverExportDays - 1) * DAY);
    const near = await reauth(m);
    expect((await get(near, "tickets.csv")).status).toBe(200);
    expect((await get(near, "all.zip")).status).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * DAY);
    const late = await reauth(m);
    expect((await get(late, "orders.csv")).status).toBe(402);
    expect((await get(late, "all.zip")).status).toBe(402);
  });

  it("every download is audited with what was downloaded", async () => {
    const m = await shop();
    await get(m, "reviews.csv");
    await get(m, "all.zip");
    const rows = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "data.exported"));
    expect(rows.map((r) => (r.data as { dataset: string }).dataset).sort()).toEqual(["all", "reviews"]);
    expect(rows.every((r) => r.merchantId === m.id)).toBe(true);
  });
});

// the exports are the ones the agreement names
describe("the agreement's list", () => {
  it("includes members, visits, orders and items, appointments, tiffin subscriptions and deliveries, catering, hall bookings, tickets, quotes, invoices, reviews and messages sent", () => {
    for (const k of ["members", "visits", "orders", "order-items", "appointments", "tiffin-subscriptions", "tiffin-deliveries", "catering-events", "hall-bookings", "tickets", "quotes", "invoices", "reviews", "messages", "message-deliveries", "whatsapp-messages"]) expect(MERCHANT_EXPORT_KEYS).toContain(k);
  });
});

