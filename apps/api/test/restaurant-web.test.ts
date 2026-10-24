/** Restaurant customer web pages (desi1): halal certification, dish options, pre-order availability, shop summary, cancel rule, private feedback. */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogItems, locations, merchants, orders, redemptions, reviewRequests, rewards, users, whatsappSessions, type ItemOptions } from "@ll/db";
import { sendHalalExpiryReminders } from "../src/services/halal.js";
import { scheduleReviewRequest } from "../src/services/reviews.js";
import { call, customer, deliver, fake } from "./commerce-fixtures.js";
import { createTestEnv, tokenFor, type TestEnv } from "./helpers.js";
import { req, restaurantShop } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv(); // Tue 2026-11-03 10:00 Toronto
});
afterEach(async () => env.close());

type Shop = Awaited<ReturnType<typeof restaurantShop>>;
const day = (n: number, from = env.clock.now) => new Date(from.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const advance = (ms: number) => (env.clock.now = new Date(env.clock.now.getTime() + ms));
const DAYMS = 86_400_000;

const CERT = { certifier: "Crescent Halal Council", certificateNo: "CHC-20418", scope: "all_meat", slaughter: "zabihah", validUntil: "2027-03-14" } as const;
const certUrl = (s: Shop) => `/v1/merchants/${s.merchant.id}/menu/halal-certification`;
const menuUrl = (s: Shop, q = "") => `/v1/public/shops/${s.merchant.slug}/menu${q}`;

describe("halal certification", () => {
  it("is the owner's own record: save, read, validate, clear", async () => {
    const s = await restaurantShop(env, "starter");
    expect((await req(env, s.ownerToken, "GET", certUrl(s))).body).toEqual({ halalCertification: null });
    const put = await req(env, s.ownerToken, "PUT", certUrl(s), CERT);
    expect(put.status).toBe(200);
    expect(put.body.halalCertification).toMatchObject({ certifier: "Crescent Halal Council", certificateNo: "CHC-20418", scope: "all_meat", slaughter: "zabihah", validUntil: "2027-03-14", expired: false });
    expect(put.body.halalCertification.daysLeft).toBeGreaterThan(100);
    expect((await req(env, s.ownerToken, "GET", certUrl(s))).body.halalCertification.certifier).toBe("Crescent Halal Council");

    // No certifier, no claim; zabihah needs the certifier; bad scope; file must be https.
    expect((await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, certifier: "  " })).status).toBe(400);
    expect((await req(env, s.ownerToken, "PUT", certUrl(s), { scope: "all_meat", slaughter: "zabihah" })).status).toBe(400);
    expect((await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, scope: "everything" })).status).toBe(400);
    expect((await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, fileUrl: "http://example.com/c.pdf" })).status).toBe(400);
    expect((await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, slaughter: undefined })).body.halalCertification.slaughter).toBe("unspecified");

    expect((await req(env, s.ownerToken, "DELETE", certUrl(s))).body).toEqual({ halalCertification: null });
    expect((await req(env, s.ownerToken, "GET", certUrl(s))).body.halalCertification).toBeNull();
  });

  it("is owner only and needs the restaurant pack", async () => {
    const s = await restaurantShop(env, "starter");
    const mgr = await customer(env);
    expect((await req(env, mgr.token, "GET", certUrl(s))).status).toBe(403);
    expect((await req(env, mgr.token, "PUT", certUrl(s), CERT)).status).toBe(403);
    await env.db.update(merchants).set({ restaurantTier: null }).where(eq(merchants.id, s.merchant.id));
    expect((await req(env, s.ownerToken, "PUT", certUrl(s), CERT)).status).toBe(402);
  });

  it("prints only what the owner states: shop block, per-dish override only when it differs, expired hides the certifier", async () => {
    const s = await restaurantShop(env, "starter");
    await env.db.update(catalogItems).set({ dietary: { halal: true, zabihah: true, halalCertifier: "crescent halal council " } }).where(eq(catalogItems.id, s.items.chicken.id));
    await env.db.update(catalogItems).set({ dietary: { halal: true, halalCertifier: "Coastal Seafood Halal Services" } }).where(eq(catalogItems.id, s.items.mutton.id));
    await env.db.update(catalogItems).set({ dietary: { halal: true, zabihah: true } }).where(eq(catalogItems.id, s.items.naan.id));

    // No certificate on file: nothing is printed for the shop, and a dish's own certifier is still just the dish's.
    let m = await req(env, null, "GET", menuUrl(s));
    expect(m.body.halalCertification).toBeNull();

    await req(env, s.ownerToken, "PUT", certUrl(s), CERT);
    m = await req(env, null, "GET", menuUrl(s));
    expect(m.body.halalCertification).toEqual({ scope: "all_meat", slaughter: "zabihah", certifier: "Crescent Halal Council", validUntil: "2027-03-14", fileUrl: null, expired: false });
    const items = [...m.body.categories.flatMap((c: { items: unknown[] }) => c.items), ...m.body.uncategorized] as { id: string; dietary?: { halalCertifier?: string; zabihah?: boolean } }[];
    const by = (id: string) => items.find((i) => i.id === id)!;
    expect(by(s.items.chicken.id).dietary?.halalCertifier).toBeUndefined(); // same as the shop's: not repeated
    expect(by(s.items.mutton.id).dietary?.halalCertifier).toBe("Coastal Seafood Halal Services"); // someone else certified this one
    expect(by(s.items.naan.id).dietary).toMatchObject({ zabihah: true }); // zabihah with no certifier line
    expect(by(s.items.naan.id).dietary?.halalCertifier).toBeUndefined();

    // Past its date: say so, and withhold the certifier name and the file.
    await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, validUntil: day(-1), fileUrl: "https://example.com/c.pdf" });
    m = await req(env, null, "GET", menuUrl(s));
    expect(m.body.halalCertification).toEqual({ scope: "all_meat", slaughter: "zabihah", certifier: null, validUntil: day(-1), fileUrl: null, expired: true });
    const after = [...m.body.categories.flatMap((c: { items: unknown[] }) => c.items), ...m.body.uncategorized] as { id: string; dietary?: { halalCertifier?: string } }[];
    expect(after.find((i) => i.id === s.items.chicken.id)!.dietary?.halalCertifier).toBeUndefined(); // never the expired name
  });

  it("filters 'without' allergens on the public menu (free-text tags map to the priority list)", async () => {
    const s = await restaurantShop(env, "starter");
    await env.db.update(catalogItems).set({ dietary: { allergens: ["Peanuts", "Sesame"] } }).where(eq(catalogItems.id, s.items.chicken.id));
    await env.db.update(catalogItems).set({ dietary: { allergens: ["nuts", "dairy"] } }).where(eq(catalogItems.id, s.items.mutton.id));
    await env.db.update(catalogItems).set({ dietary: { allergens: ["wheat"] } }).where(eq(catalogItems.id, s.items.naan.id));
    const names = async (q: string) => {
      const m = await req(env, null, "GET", menuUrl(s, q));
      return ([...m.body.categories.flatMap((c: { items: unknown[] }) => c.items), ...m.body.uncategorized] as { name: string }[]).map((i) => i.name).sort();
    };
    expect(await names("")).toContain("Chicken Biryani");
    expect(await names("?without=peanut,tree_nut")).not.toContain("Chicken Biryani");
    expect(await names("?without=peanut,tree_nut")).not.toContain("Mutton Biryani");
    expect(await names("?without=peanut,tree_nut")).toContain("Garlic Naan");
    expect(await names("?without=tree_nut")).toContain("Chicken Biryani");
    expect(await names("?without=milk")).not.toContain("Mutton Biryani");
    expect(await names("?without=unicorn")).toContain("Mutton Biryani"); // unknown keys are ignored
  });

  it("reminds the owner 60 and 30 days before it expires, once each, and starts over for a new date", async () => {
    const s = await restaurantShop(env, "starter");
    await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, validUntil: day(75) });
    const mails = () => env.ctx.providers.outbox.email.filter((e) => /halal certificate/i.test(e.subject));
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(0); // 75 days: too early

    advance(20 * DAYMS); // 55 days left
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(1);
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(0);
    expect(mails()).toHaveLength(1);
    expect(mails()[0]!.subject).toBe("Your halal certificate expires in 55 days");
    expect(mails()[0]!.text).toContain("Crescent Halal Council");
    expect(mails()[0]!.text).toContain("Certificate expired, ask the restaurant");

    advance(26 * DAYMS); // 29 days left
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(1);
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(0);
    expect(mails()).toHaveLength(2);

    // Renewed: a new date, so the schedule starts over. (Access tokens expire as the fake clock moves.)
    s.ownerToken = await tokenFor(env, s.owner);
    await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, validUntil: day(50) });
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(1); // 50 days: the 60-day reminder
    expect(mails()).toHaveLength(3);

    // Skipped the 60 when first noticed late: only the 30 goes out. Expired shops get nothing more.
    await req(env, s.ownerToken, "PUT", certUrl(s), { ...CERT, validUntil: day(10) });
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(1);
    expect(mails().at(-1)!.subject).toBe("Your halal certificate expires in 10 days");
    advance(11 * DAYMS);
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(0);
    await req(env, s.ownerToken, "DELETE", certUrl(s));
    expect(await sendHalalExpiryReminders(env.ctx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("dish options", () => {
  const OPTIONS: ItemOptions = {
    groups: [
      { id: "size", name: "Size", type: "single", required: true, priceMode: "absolute", options: [{ id: "full", name: "Full degh", priceCents: 18900, serves: 15 }, { id: "half", name: "Half degh", priceCents: 9900, serves: 8 }] },
      { id: "spice", name: "Spice", type: "single", required: false, priceMode: "delta", options: [{ id: "mild", name: "Mild", priceCents: 0 }, { id: "medium", name: "Medium", priceCents: 0, default: true }, { id: "hot", name: "Hot", priceCents: 0 }] },
      { id: "pot", name: "Add to the pot", type: "multi", required: false, priceMode: "delta", options: [{ id: "raita", name: "Raita, 1 L", priceCents: 800 }, { id: "naan", name: "Garlic naan × 20", priceCents: 3000 }] },
    ],
  };

  async function deghShop(opts: { cap?: number } = {}) {
    const s = await restaurantShop(env, "growth");
    await env.db.update(catalogItems).set({ name: "Chicken biryani degh", priceCents: 18900, preorderOnly: true, leadTimeHours: 24, serves: 15, depositBps: 3000, options: OPTIONS }).where(eq(catalogItems.id, s.items.pot.id));
    if (opts.cap) await env.db.update(merchants).set({ preorderDailyCap: opts.cap }).where(eq(merchants.id, s.merchant.id));
    return s;
  }
  const place = (s: Shop, token: string, items: object[], extra: object = {}) =>
    call(env, token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items, kind: "preorder", channel: "web", idempotencyKey: `web-${Math.random().toString(36).slice(2)}`, ...extra });
  // Fri 2026-11-06 5 p.m. Toronto
  const PICKUP = "2026-11-06T22:00:00.000Z";

  it("validates options on create and exposes them on the public menu", async () => {
    const s = await restaurantShop(env, "growth");
    const url = `/v1/merchants/${s.merchant.id}/catalog/items`;
    const ok = await call(env, s.ownerToken, "POST", url, { name: "Biryani plate", priceCents: 1899, options: OPTIONS });
    expect(ok.status).toBe(201);
    expect(ok.body.options.groups).toHaveLength(3);
    const twoAbs = { groups: [OPTIONS.groups[0], { ...OPTIONS.groups[0], id: "size2" }] };
    expect((await call(env, s.ownerToken, "POST", url, { name: "X", priceCents: 1, options: twoAbs })).status).toBe(400);
    expect((await call(env, s.ownerToken, "POST", url, { name: "X", priceCents: 1, options: { groups: [{ ...OPTIONS.groups[0], required: false }] } })).status).toBe(400);
    expect((await call(env, s.ownerToken, "POST", url, { name: "X", priceCents: 1, options: { groups: [OPTIONS.groups[2], OPTIONS.groups[2]] } })).status).toBe(400);
    const upd = await call(env, s.ownerToken, "PATCH", `${url}/${ok.body.id}`, { options: null });
    expect(upd.body.options).toBeNull();
    const menu = await req(env, null, "GET", menuUrl(s));
    const all = [...menu.body.categories.flatMap((c: { items: unknown[] }) => c.items), ...menu.body.uncategorized] as { name: string; options?: unknown }[];
    expect(all.find((i) => i.name === "Chicken Biryani")!.options ?? null).toBeNull();
  });

  it("prices from the server's options: size sets the price, add-ons add to it, deposit is a share of the bill with tax", async () => {
    const s = await deghShop();
    const c = await customer(env);
    // Half degh + raita + 20 naan: 9900 + 800 + 3000 = 13700, HST 1781, deposit 30% of 15481 = 4644.
    const r = await place(s, c.token, [{ catalogItemId: s.items.pot.id, quantity: 1, optionIds: ["half", "hot", "raita", "naan"] }], { pickupAt: PICKUP });
    expect(r.status).toBe(201);
    expect(r.body.order).toMatchObject({ kind: "preorder", channel: "web", subtotalCents: 13700, taxCents: 1781, depositCents: 4644 });
    expect(r.body.order.items[0]).toMatchObject({ unitPriceCents: 13700 });
    expect(r.body.order.items[0].modifiers).toEqual([
      { name: "Size", option: "Half degh", priceCents: -9000 },
      { name: "Spice", option: "Hot", priceCents: 0 },
      { name: "Add to the pot", option: "Raita, 1 L", priceCents: 800 },
      { name: "Add to the pot", option: "Garlic naan × 20", priceCents: 3000 },
    ]);
    const [row] = await env.db.select().from(orders).where(eq(orders.id, r.body.order.id));
    expect(row).toMatchObject({ channel: "web", kind: "preorder", subtotalCents: 13700 });

    // Nothing picked: the required size defaults to the listed (full) price. A client can never send a price.
    const plain = await place(s, c.token, [{ catalogItemId: s.items.pot.id, quantity: 1, price: 1, unitPriceCents: 1 }], { pickupAt: PICKUP });
    expect(plain.body.order.subtotalCents).toBe(18900);
    expect(plain.body.order.items[0].modifiers).toEqual([{ name: "Size", option: "Full degh", priceCents: 0 }]);
  });

  it("refuses unknown, repeated and conflicting picks", async () => {
    const s = await deghShop();
    const c = await customer(env);
    const bad = async (optionIds: string[]) => (await place(s, c.token, [{ catalogItemId: s.items.pot.id, quantity: 1, optionIds }], { pickupAt: PICKUP })).status;
    expect(await bad(["gold"])).toBe(400);
    expect(await bad(["full", "half"])).toBe(400); // one size
    expect(await bad(["mild", "hot"])).toBe(400); // one spice
    expect(await bad(["raita", "raita"])).toBe(400);
    const noOptions = await place(s, c.token, [{ catalogItemId: s.items.chicken.id, quantity: 1, optionIds: ["raita"] }], { kind: "pickup", paymentMethod: "at_pickup" });
    expect(noOptions.status).toBe(400);
  });

  it("a plain pickup order from the web: channel web, options priced, ASAP", async () => {
    const s = await restaurantShop(env, "growth");
    await env.db.update(catalogItems).set({ options: { groups: [OPTIONS.groups[2]!] } }).where(eq(catalogItems.id, s.items.chicken.id));
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: s.items.chicken.id, quantity: 2, optionIds: ["raita"] }], paymentMethod: "at_pickup", channel: "web", idempotencyKey: "web-pickup-0001" });
    expect(r.status).toBe(201);
    expect(r.body.order).toMatchObject({ channel: "web", subtotalCents: 2 * (1400 + 800), paymentMethod: "at_pickup" });
    // Same key: same order, no second one (double tap).
    const again = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: s.items.chicken.id, quantity: 2, optionIds: ["raita"] }], paymentMethod: "at_pickup", channel: "web", idempotencyKey: "web-pickup-0001" });
    expect(again.status).toBe(200);
    expect(again.body.order.id).toBe(r.body.order.id);
    expect(await env.db.select().from(orders)).toHaveLength(1);
    expect((await call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: s.items.chicken.id, quantity: 1 }], channel: "fax", idempotencyKey: "web-pickup-0002" })).status).toBe(400);
  });

  it("older clients that send no optionIds keep paying the listed price", async () => {
    const s = await deghShop();
    const c = await customer(env);
    const r = await place(s, c.token, [{ catalogItemId: s.items.pot.id, quantity: 1 }], { pickupAt: PICKUP, channel: undefined });
    expect(r.status).toBe(201);
    expect(r.body.order).toMatchObject({ channel: "app", subtotalCents: 18900 });
  });
});

// ---------------------------------------------------------------------------
describe("pre-order availability and the shop summary", () => {
  async function shop(cap = 12) {
    const s = await restaurantShop(env, "growth");
    await env.db.update(catalogItems).set({ name: "Chicken biryani degh", priceCents: 18900, preorderOnly: true, leadTimeHours: 24, serves: 15, depositBps: 3000 }).where(eq(catalogItems.id, s.items.pot.id));
    await env.db.update(merchants).set({ preorderDailyCap: cap }).where(eq(merchants.id, s.merchant.id));
    return s;
  }
  const avail = (s: Shop, q: string) => req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/preorders/availability?${q}`);
  const book = async (s: Shop, qty: number, pickupAt: string) => {
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: s.items.pot.id, quantity: qty }], kind: "preorder", pickupAt, channel: "web", idempotencyKey: `book-${Math.random().toString(36).slice(2)}` });
    expect(r.status).toBe(201);
    return r.body.order as { id: string };
  };

  it("shows pots left per day, full days, and one-hour windows after the notice period", async () => {
    const s = await shop(12);
    await book(s, 2, "2026-11-06T22:00:00.000Z"); // Fri
    await book(s, 12, "2026-11-07T17:00:00.000Z"); // Sat: full
    const r = await avail(s, `itemId=${s.items.pot.id}&from=2026-11-03&to=2026-11-09`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ itemId: s.items.pot.id, leadHours: 24, perHourCap: null });
    type Day = { date: string; potsLeft: number | null; full: boolean; tooSoon: boolean; windows: { start: string; end: string; full: boolean }[] };
    const days = new Map((r.body.days as Day[]).map((d) => [d.date, d] as const));
    expect(days.size).toBe(7);
    // Tue 3rd, now 10:00 and 24 hours' notice: Tuesday has nothing left to pick, Wednesday opens from 10:00.
    expect(days.get("2026-11-03")).toMatchObject({ tooSoon: true, potsLeft: 12, full: false });
    expect(days.get("2026-11-03")!.windows.every((w) => w.full)).toBe(true);
    const wed = days.get("2026-11-04")!;
    expect(wed.tooSoon).toBe(false);
    expect(wed.windows.map((w) => `${w.start}-${w.end}`)).toEqual(["09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00", "13:00-14:00", "14:00-15:00", "15:00-16:00", "16:00-17:00"]);
    expect(wed.windows[0]!.full).toBe(true); // 09:00 Wed is under 24 hours away
    expect(wed.windows[1]!.full).toBe(false);
    expect(days.get("2026-11-06")).toMatchObject({ potsLeft: 10, full: false });
    expect(days.get("2026-11-07")).toMatchObject({ potsLeft: 0, full: true });
    expect(days.get("2026-11-07")!.windows.every((w) => w.full)).toBe(true);
  });

  it("uses the planning caps (weekday, per hour, date override) and shows a closed weekday as closed, not busy", async () => {
    const s = await shop(12);
    await env.db.update(locations).set({ hours: { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [["10:00", "14:00"]] } }).where(eq(locations.merchantId, s.merchant.id));
    await env.db.update(merchants).set({ preorderCapByWeekday: { sat: 4 }, preorderPerHourCap: 2, preorderOverrides: [{ from: "2026-11-11", to: "2026-11-11", cap: 30, label: "Remembrance eve" }] }).where(eq(merchants.id, s.merchant.id));
    const r = await avail(s, `itemId=${s.items.pot.id}&from=2026-11-06&to=2026-11-11`);
    type Day = { date: string; potsLeft: number | null; full: boolean; closed: boolean; note: string | null; windows: { start: string }[] };
    const days = new Map((r.body.days as Day[]).map((d) => [d.date, d] as const));
    expect(r.body.perHourCap).toBe(2);
    expect(days.get("2026-11-07")).toMatchObject({ potsLeft: 4, closed: false, full: false }); // Saturday: weekday cap, not the daily 12
    expect(days.get("2026-11-07")!.windows.map((w) => w.start)).toEqual(["10:00", "11:00", "12:00", "13:00"]);
    expect(days.get("2026-11-08")).toMatchObject({ closed: true, full: false, windows: [] }); // Sunday: no hours
    expect(days.get("2026-11-11")).toMatchObject({ potsLeft: 30, note: "Remembrance eve", closed: false }); // override wins
    // The shop summary agrees: the weekend chips come from the same caps.
    const sum = await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`);
    expect(sum.body.weekend).toEqual([expect.objectContaining({ date: "2026-11-07", potsLeft: 4, closed: false }), expect.objectContaining({ date: "2026-11-08", closed: true })]);
  });

  it("has no cap: potsLeft is null. Cancelled pre-orders free their pots", async () => {
    const s = await shop(12);
    await env.db.update(merchants).set({ preorderDailyCap: null }).where(eq(merchants.id, s.merchant.id));
    expect((await avail(s, `itemId=${s.items.pot.id}&from=2026-11-05&to=2026-11-05`)).body.days[0]).toMatchObject({ potsLeft: null, full: false });
    await env.db.update(merchants).set({ preorderDailyCap: 5 }).where(eq(merchants.id, s.merchant.id));
    const o = await book(s, 5, "2026-11-06T22:00:00.000Z");
    expect((await avail(s, `itemId=${s.items.pot.id}&from=2026-11-06&to=2026-11-06`)).body.days[0]).toMatchObject({ potsLeft: 0, full: true });
    await env.db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id));
    expect((await avail(s, `itemId=${s.items.pot.id}&from=2026-11-06&to=2026-11-06`)).body.days[0]).toMatchObject({ potsLeft: 5, full: false });
  });

  it("answers 404 for an unknown dish or shop, 400 for a bad itemId, and needs the degh feature", async () => {
    const s = await shop();
    expect((await avail(s, `itemId=${crypto.randomUUID()}`)).status).toBe(404);
    expect((await avail(s, "itemId=nope")).status).toBe(400);
    expect((await req(env, null, "GET", `/v1/public/shops/nobody/preorders/availability?itemId=${s.items.pot.id}`)).status).toBe(404);
    const starter = await restaurantShop(env, "starter");
    expect((await avail(starter, `itemId=${starter.items.pot.id}`)).status).toBe(402);
  });

  it("summarises the shop page: weekend pots, popular dishes, wait, halal block, features", async () => {
    const s = await shop(12);
    const wk = (await env.db.select().from(locations).where(eq(locations.merchantId, s.merchant.id)))[0]!.hours ?? {};
    await env.db.update(locations).set({ hours: { ...wk, sat: [["09:00", "17:00"]], sun: [["09:00", "17:00"]] } }).where(eq(locations.merchantId, s.merchant.id));
    await req(env, s.ownerToken, "PUT", `/v1/merchants/${s.merchant.id}/menu/halal-certification`, CERT);
    await book(s, 3, "2026-11-07T17:00:00.000Z"); // Sat
    await book(s, 12, "2026-11-08T17:00:00.000Z"); // Sun: full
    // Most ordered: Mutton x5 beats Chicken x2; the pot never appears.
    const c = await customer(env);
    const place = (id: string, quantity: number) => call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: id, quantity }], paymentMethod: "at_pickup", channel: "web", idempotencyKey: `pop-${Math.random().toString(36).slice(2)}` });
    await place(s.items.mutton.id, 5);
    await place(s.items.chicken.id, 2);
    const r = await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`);
    expect(r.status).toBe(200);
    expect(r.body.weekend).toEqual([{ date: "2026-11-07", potsLeft: 9, full: false, closed: false }, { date: "2026-11-08", potsLeft: 0, full: true, closed: false }]);
    expect(r.body.popular.slice(0, 2)).toEqual([s.items.mutton.id, s.items.chicken.id]);
    expect(r.body.popular).not.toContain(s.items.pot.id);
    expect(r.body).toMatchObject({ acceptingOrders: true, quotedWaitMin: 20, whatsappNumber: "+14165550100", features: { pickup: true, preorder: true }, cancelCutoffHours: null });
    expect(r.body.halalCertification).toMatchObject({ certifier: "Crescent Halal Council", scope: "all_meat", slaughter: "zabihah", expired: false });
    expect(r.body.preorderItems).toEqual([{ id: s.items.pot.id, name: "Chicken biryani degh", serves: 15, priceCents: 18900, leadTimeHours: 24, depositBps: 3000 }]);

    // Busy mode adds minutes to the quote while it lasts; a paused shop is not accepting.
    await env.db.update(merchants).set({ busyAddMinutes: 15, busyUntil: new Date(env.clock.now.getTime() + 3600_000) }).where(eq(merchants.id, s.merchant.id));
    expect((await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`)).body.quotedWaitMin).toBe(35);
    advance(2 * 3600_000);
    expect((await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`)).body.quotedWaitMin).toBe(20);
    await env.db.update(merchants).set({ status: "paused" }).where(eq(merchants.id, s.merchant.id));
    expect((await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`)).body.acceptingOrders).toBe(false);
  });

  it("hides pre-orders when the shop has none, and is a 404 for non-restaurants", async () => {
    const s = await restaurantShop(env, "starter");
    const r = await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`);
    expect(r.body).toMatchObject({ weekend: [], features: { pickup: true, preorder: false }, preorderItems: [] });
    await env.db.update(merchants).set({ restaurantTier: null }).where(eq(merchants.id, s.merchant.id));
    expect((await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("pre-order cancel rule", () => {
  async function reserved(cutoff?: number) {
    const s = await restaurantShop(env, "growth");
    await env.db.update(catalogItems).set({ priceCents: 18900, preorderOnly: true, leadTimeHours: 48, depositBps: 3000, serves: 15 }).where(eq(catalogItems.id, s.items.pot.id));
    if (cutoff != null) await env.db.update(merchants).set({ preorderCancelCutoffHours: cutoff }).where(eq(merchants.id, s.merchant.id));
    const c = await customer(env);
    const pickupAt = "2026-11-07T19:00:00.000Z"; // Sat 2 p.m. Toronto
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: s.items.pot.id, quantity: 1 }], kind: "preorder", pickupAt, channel: "web", idempotencyKey: `res-${Math.random().toString(36).slice(2)}` });
    expect(r.status).toBe(201);
    await deliver(env, fake(env).succeedPaymentIntent(r.body.payment.paymentIntentId));
    return { s, c, order: r.body.order, payment: r.body.payment, pickupAt };
  }

  it("is free until the notice period before pickup, and refunds the deposit", async () => {
    const { c, order, pickupAt, payment } = await reserved();
    const mine = await call(env, c.token, "GET", `/v1/me/orders/${order.id}`);
    expect(mine.body.cancelFreeUntil).toBe(new Date(Date.parse(pickupAt) - 48 * 3600_000).toISOString());
    expect(mine.body).toMatchObject({ merchantSlug: expect.any(String), shopAddress: expect.stringContaining("Roncesvalles"), paymentStatus: "authorized" });
    const out = await call(env, c.token, "POST", `/v1/me/orders/${order.id}/cancel`, {});
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ status: "cancelled", paymentStatus: "refunded" });
    expect(fake(env).intents.get(payment.paymentIntentId)?.refundedCents).toBe(payment.amountCents);
  });

  it("keeps the deposit after the cutoff (409 cancel_cutoff), but the shop can still cancel and refund", async () => {
    const { s, c, order, payment } = await reserved();
    env.clock.now = new Date("2026-11-05T20:00:00Z"); // Thu 3 p.m.: under 48 hours to Saturday 2 p.m.
    c.token = await tokenFor(env, c.user);
    s.ownerToken = await tokenFor(env, s.owner);
    const late = await call(env, c.token, "POST", `/v1/me/orders/${order.id}/cancel`, {});
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("cancel_cutoff");
    expect(late.body.error.message).toContain("deposit is kept");
    expect((await env.db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("pending");
    const shop = await call(env, s.ownerToken, "POST", `/v1/merchants/${s.merchant.id}/orders/${order.id}/status`, { status: "cancelled", reason: "Family emergency" });
    expect(shop.body.paymentStatus).toBe("refunded");
    expect(fake(env).intents.get(payment.paymentIntentId)?.refundedCents).toBe(payment.amountCents);
  });

  it("uses the shop's own cutoff when it sets one", async () => {
    const { c, order, pickupAt } = await reserved(12);
    expect((await call(env, c.token, "GET", `/v1/me/orders/${order.id}`)).body.cancelFreeUntil).toBe(new Date(Date.parse(pickupAt) - 12 * 3600_000).toISOString());
    env.clock.now = new Date("2026-11-06T19:00:00Z"); // 31 hours out: inside the 48 hour notice but before the 12 hour cutoff
    c.token = await tokenFor(env, c.user);
    expect((await call(env, c.token, "POST", `/v1/me/orders/${order.id}/cancel`, {})).status).toBe(200);
  });

  it("the owner sets the rule: hours before pickup, or null for each dish's own notice", async () => {
    const s = await restaurantShop(env, "growth");
    const url = `/v1/merchants/${s.merchant.id}/preorders/cancel-rule`;
    expect((await req(env, s.ownerToken, "GET", url)).body).toEqual({ cancelCutoffHours: null });
    expect((await req(env, s.ownerToken, "PUT", url, { cancelCutoffHours: 12 })).body).toEqual({ cancelCutoffHours: 12 });
    expect((await req(env, s.ownerToken, "GET", url)).body).toEqual({ cancelCutoffHours: 12 });
    expect((await req(env, s.ownerToken, "GET", `/v1/public/shops/${s.merchant.slug}/restaurant`)).body.cancelCutoffHours).toBe(12);
    expect((await req(env, s.ownerToken, "PUT", url, { cancelCutoffHours: -1 })).status).toBe(400);
    expect((await req(env, s.ownerToken, "PUT", url, { cancelCutoffHours: null })).body).toEqual({ cancelCutoffHours: null });
    const starter = await restaurantShop(env, "starter");
    expect((await req(env, starter.ownerToken, "PUT", `/v1/merchants/${starter.merchant.id}/preorders/cancel-rule`, { cancelCutoffHours: 6 })).status).toBe(402);
  });

  it("plain pickup orders keep the old rule: only before the shop accepts", async () => {
    const s = await restaurantShop(env, "growth");
    const c = await customer(env);
    const r = await call(env, c.token, "POST", "/v1/me/orders", { merchantId: s.merchant.id, locationId: s.location.id, items: [{ catalogItemId: s.items.chicken.id, quantity: 1 }], paymentMethod: "at_pickup", channel: "web", idempotencyKey: "plain-cancel-1" });
    expect((await call(env, c.token, "GET", `/v1/me/orders/${r.body.order.id}`)).body.cancelFreeUntil).toBeNull();
    await call(env, s.ownerToken, "POST", `/v1/merchants/${s.merchant.id}/orders/${r.body.order.id}/status`, { status: "accepted" });
    expect((await call(env, c.token, "POST", `/v1/me/orders/${r.body.order.id}/cancel`, {})).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
describe("review policy and private feedback", () => {
  let orderSeq = 500;
  const url = (s: Shop) => `/v1/merchants/${s.merchant.id}/reviews`;

  async function asked(s: Shop, opts: { name?: string; locale?: string; channel?: string; number?: number; withOrder?: boolean } = {}) {
    const c = await customer(env, { name: opts.name ?? "Aisha Khan" });
    if (opts.locale) await env.db.update(users).set({ locale: opts.locale }).where(eq(users.id, c.user.id));
    let sourceId: string = crypto.randomUUID();
    if (opts.withOrder !== false) {
      const [o] = await env.db.insert(orders).values({ merchantId: s.merchant.id, locationId: s.location.id, userId: c.user.id, number: opts.number ?? ++orderSeq, status: "picked_up", pickedUpAt: env.clock.now, subtotalCents: 1400, totalCents: 1582, channel: opts.channel ?? "phone" }).returning();
      sourceId = o!.id;
    }
    const r = await scheduleReviewRequest(env.ctx, { merchantId: s.merchant.id, userId: c.user.id, sourceId });
    expect(r).toBeTruthy();
    return { c, token: r!.token, id: r!.id };
  }
  const rate = (token: string, rating: number, feedback?: string) => req(env, null, "POST", `/v1/public/reviews/${token}`, { rating, ...(feedback ? { feedback } : {}) });

  it("gives every rating the same answer: same options, same words, only the rating differs", async () => {
    const s = await restaurantShop(env, "starter");
    const bodies: Record<string, unknown>[] = [];
    for (const rating of [1, 2, 3, 4, 5]) {
      const a = await asked(s, { number: 100 + rating });
      const r = await rate(a.token, rating, rating <= 3 ? "Cold on arrival" : undefined);
      expect(r.status).toBe(200);
      bodies.push(r.body);
    }
    const strip = (b: Record<string, unknown>) => ({ ...b, rating: 0 });
    for (const b of bodies) {
      expect(strip(b)).toEqual(strip(bodies[0]!));
      expect(b).toMatchObject({ leadWithGoogle: true, googleReviewUrl: "https://g.page/r/test-biryani/review" });
    }
    expect(bodies.map((b) => b.rating)).toEqual([1, 2, 3, 4, 5]);
    expect(String(bodies[0]!.message)).toContain("Google review");
  });

  it("tells the owner about ratings of 3 or less and never about 4 and 5", async () => {
    const s = await restaurantShop(env, "starter");
    await env.db.update(merchants).set({ email: "owner@biryani.example" }).where(eq(merchants.id, s.merchant.id));
    for (const rating of [3, 4, 2, 5]) {
      const a = await asked(s);
      await rate(a.token, rating, "ok");
    }
    const mail = env.ctx.providers.outbox.email.filter((e) => e.to === "owner@biryani.example");
    expect(mail.map((m) => m.subject)).toEqual(["3-star feedback at Biryani House", "2-star feedback at Biryani House"]);
  });

  it("counts taps on the Google button once, without changing what the guest sees", async () => {
    const s = await restaurantShop(env, "starter");
    const a = await asked(s);
    expect((await req(env, null, "POST", `/v1/public/reviews/${a.token}/google-opened`)).body).toEqual({ ok: true });
    const first = (await env.db.select().from(reviewRequests).where(eq(reviewRequests.id, a.id)))[0]!.googleClickedAt;
    expect(first).toBeTruthy();
    advance(60_000);
    await req(env, null, "POST", `/v1/public/reviews/${a.token}/google-opened`);
    expect((await env.db.select().from(reviewRequests).where(eq(reviewRequests.id, a.id)))[0]!.googleClickedAt).toEqual(first);
    expect((await req(env, null, "POST", "/v1/public/reviews/nope/google-opened")).status).toBe(404);
    const stats = await req(env, s.ownerToken, "GET", `${url(s)}/stats`);
    expect(stats.body.googleOpened).toBe(1);
  });

  it("lists private feedback to read first with its order, language and phone, and counts it", async () => {
    const s = await restaurantShop(env, "starter");
    const low = await asked(s, { name: "Imran Sheikh", locale: "ur-CA", channel: "phone", number: 98 });
    const mid = await asked(s, { name: "Sana Malik", locale: "en-CA", channel: "whatsapp", number: 92 });
    const high = await asked(s, { name: "Gurpreet Singh", number: 101 });
    await rate(low.token, 1, "Biryani was cold when I picked up.");
    await rate(mid.token, 3, "Naan was great, haleem too salty.");
    await rate(high.token, 5, "Best in the GTA");

    const list = await req(env, s.ownerToken, "GET", `${url(s)}?maxRating=3&handled=0`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    const imran = list.body.items.find((i: { customer: { name: string } }) => i.customer.name === "Imran Sheikh");
    expect(imran).toMatchObject({ rating: 1, orderNumber: 98, orderChannel: "phone", customerLanguage: "ur", handledAt: null, reply: null, feedback: "Biryani was cold when I picked up." });
    expect(imran.customerPhone).toBe(low.c.user.phone);
    const stats = await req(env, s.ownerToken, "GET", `${url(s)}/stats`);
    expect(stats.body).toMatchObject({ privateToRead: 2, privateToReadByRating: { "1": 1, "2": 0, "3": 1 }, responded: 3 });

    const handled = await req(env, s.ownerToken, "POST", `${url(s)}/${low.id}/handled`);
    expect(handled.status).toBe(200);
    expect(handled.body.handledAt).toBeTruthy();
    const firstAt = handled.body.handledAt;
    advance(5000);
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${low.id}/handled`)).body.handledAt).toBe(firstAt); // idempotent
    expect((await req(env, s.ownerToken, "GET", `${url(s)}?maxRating=3&handled=0`)).body.items.map((i: { id: string }) => i.id)).toEqual([mid.id]);
    expect((await req(env, s.ownerToken, "GET", `${url(s)}?maxRating=3&handled=1`)).body.items.map((i: { id: string }) => i.id)).toEqual([low.id]);
    expect((await req(env, s.ownerToken, "GET", `${url(s)}/stats`)).body.privateToRead).toBe(1);
  });

  it("only answered reviews of this shop can be handled, replied to or offered a chai", async () => {
    const s = await restaurantShop(env, "starter");
    const other = await restaurantShop(env, "starter");
    const a = await asked(s);
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/handled`)).status).toBe(400); // not answered yet
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "email", body: "Sorry" })).status).toBe(400);
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/offer-chai`)).status).toBe(400);
    await rate(a.token, 2, "Slow");
    expect((await req(env, other.ownerToken, "POST", `${url(other)}/${a.id}/handled`)).status).toBe(404);
    expect((await req(env, other.ownerToken, "POST", `${url(s)}/${a.id}/handled`)).status).toBe(403);
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/not-a-uuid/handled`)).status).toBe(404);
  });

  it("replies by email or text, and by WhatsApp only inside the 24 hour window", async () => {
    const s = await restaurantShop(env, "growth");
    await req(env, s.ownerToken, "PUT", `/v1/merchants/${s.merchant.id}/whatsapp/settings`, { phoneNumberId: "pn_1001", displayNumber: "+14165550100", approvedTemplates: [] });
    const a = await asked(s, { name: "Imran Sheikh" });
    await rate(a.token, 1, "Cold");
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "email", body: "" })).status).toBe(400);

    // No email on file.
    const noEmail = await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "email", body: "We are sorry." });
    expect(noEmail.status).toBe(409);
    expect(noEmail.body.error.code).toBe("no_contact");
    await env.db.update(users).set({ email: "imran@example.com" }).where(eq(users.id, a.c.user.id));
    const mail = await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "email", body: "We are sorry. Come back on us." });
    expect(mail.body).toEqual({ sent: true, channel: "email" });
    expect(env.ctx.providers.outbox.email.at(-1)).toMatchObject({ to: "imran@example.com" });
    const row = (await env.db.select().from(reviewRequests).where(eq(reviewRequests.id, a.id)))[0]!;
    expect(row).toMatchObject({ replyChannel: "email", replyBody: "We are sorry. Come back on us." });
    expect(row.repliedAt).toBeTruthy();
    expect(row.handledAt).toBeTruthy(); // a sent reply handles it
    const listed = await req(env, s.ownerToken, "GET", `${url(s)}?maxRating=3`);
    expect(listed.body.items[0].reply).toMatchObject({ channel: "email", body: "We are sorry. Come back on us." });

    // WhatsApp: the guest has not messaged in the last 24 hours.
    const closed = await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "whatsapp", body: "Salaam, sorry about the biryani." });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe("window_closed");
    await env.db.insert(whatsappSessions).values({ merchantId: s.merchant.id, phone: a.c.user.phone!, state: "browsing", lastInboundAt: new Date(env.clock.now.getTime() - 3600_000), marketingOptInAt: env.clock.now });
    const open = await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "whatsapp", body: "Salaam, sorry about the biryani." });
    expect(open.body).toEqual({ sent: true, channel: "whatsapp" });

    // Text costs a credit; none left, no send.
    await env.db.update(merchants).set({ smsCreditsUsed: 100_000 }).where(eq(merchants.id, s.merchant.id));
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "sms", body: "Sorry." })).body.error.code).toBe("no_credits");
    await env.db.update(merchants).set({ smsCreditsUsed: 0 }).where(eq(merchants.id, s.merchant.id));
    const sms = await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/reply`, { channel: "sms", body: "Sorry." });
    expect(sms.body).toEqual({ sent: true, channel: "sms" });
    expect(env.ctx.providers.outbox.sms.at(-1)!.body).toContain("Sorry.");
  });

  it("offers one free chai: a one-use code that never shows in the rewards catalog, and asking twice returns the same code", async () => {
    const s = await restaurantShop(env, "starter");
    const a = await asked(s);
    await rate(a.token, 2, "Slow");
    const offer = await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/offer-chai`);
    expect(offer.status).toBe(200);
    expect(offer.body.code).toMatch(/^[2-9A-Z]{6}$/);
    expect(new Date(offer.body.expiresAt).getTime()).toBe(env.clock.now.getTime() + 30 * DAYMS);
    const [red] = await env.db.select().from(redemptions).where(eq(redemptions.id, offer.body.redemptionId));
    expect(red).toMatchObject({ code: offer.body.code, status: "issued", transactionId: null });
    const [reward] = await env.db.select().from(rewards).where(eq(rewards.id, red!.rewardId));
    expect(reward).toMatchObject({ name: "Free chai (thank-you)", active: false, pointsCost: 0 });
    expect((await req(env, s.ownerToken, "POST", `${url(s)}/${a.id}/offer-chai`)).body).toEqual(offer.body);
    expect(await env.db.select().from(redemptions).where(eq(redemptions.rewardId, reward!.id))).toHaveLength(1);
    // The inactive reward stays out of the public shop page.
    const shopPage = await req(env, null, "GET", `/v1/public/shops/${s.merchant.slug}`);
    expect((shopPage.body.rewards as { name: string }[]).map((r) => r.name)).not.toContain("Free chai (thank-you)");
  });
});
