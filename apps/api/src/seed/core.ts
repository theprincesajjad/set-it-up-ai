/**
 * Core-module demo data for the Roncesvalles pilot shops, so every dashboard page (promos, discount cards,
 * ads, slots, tickets, orders, catalog) shows something real instead of an empty state:
 *
 *   Pinecone Coffee      catalog (drinks, food), a week of orders in every status, pickup slots + bookings,
 *                        promos (live / scheduled / ended), a student discount card
 *   Hearth & Crumb       catalog, orders, pickup slots, promos, a discount card, ads (draft / live / ended)
 *   Village Apothecary   an ended promo next to its live one (and the template's seniors card)
 *   Fix-It Phone Lab     catalog, service tickets in every status with quotes and invoices, drop-off slots
 *
 * Goes through the real services (placeOrder, createTicket, createQuote, createInvoice, generateSlots,
 * createBooking, createAdCampaign, ...) with the clock moved to when each thing happened; only the
 * timestamps the services stamp with the database clock are back-dated afterwards. Runs on its own RNG so
 * the existing demo history (customers, visits) stays byte-identical. Guarded: a second run does nothing.
 */
import { deflateSync } from "node:zlib";
import { and, asc, eq, gt, inArray, like, sql } from "drizzle-orm";
import type { FeatureKey } from "@ll/shared";
import {
  adCampaigns,
  adEvents,
  bookings,
  catalogItems,
  discountCards,
  featureOverrides,
  invoices,
  ledgerTransactions,
  locations,
  merchantCategories,
  merchants,
  neighbourhoods,
  orders,
  promos,
  quotes,
  serviceTickets,
  ticketEvents,
  users,
  visits,
  type Db,
} from "@ll/db";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { cpmSpend, createAdCampaign, reviewAd, markAdPaid, runAdsLifecycle } from "../services/ads.js";
import { createBooking, generateSlots, listSlots, zonedToUtc } from "../services/bookings.js";
import { createItem } from "../services/catalog.js";
import { createInvoice, markInvoicePaid } from "../services/invoices.js";
import { placeOrder, updateOrderStatus } from "../services/orders.js";
import { authorizeQuoteByPhone, createQuote, getMerchantQuote, markQuoteViewed, respondToQuote } from "../services/quotes.js";
import { getStorage } from "../providers/storage.js";
import { addNote, createTicket, setTicketStatus } from "../services/tickets.js";

const DAY = 86_400_000;
const MIN = 60_000;

/** Features switched on (admin overrides, like the other pilot features) for the shops below. */
const ORDER_FEATURES: FeatureKey[] = ["orders.order_ahead", "orders.pickup_status", "booking.pickup_slots"];
const AD_FEATURES: FeatureKey[] = ["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"];
const SERVICE_FEATURES: FeatureKey[] = ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices", "service.rebooking", "booking.dropoff_scheduling", "booking.pickup_slots", "orders.order_ahead", "orders.pickup_status"];
export const CORE_SHOP_FEATURES: Record<string, FeatureKey[]> = {
  "pinecone-coffee": ORDER_FEATURES,
  "hearth-and-crumb": [...ORDER_FEATURES, ...AD_FEATURES],
  "fix-it-phone-lab": SERVICE_FEATURES,
};

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]! };
}

/** A small solid-colour PNG, so intake photos in the demo are real stored files (CRC and zlib from node, no dependency). */
function solidPng(r: number, g: number, b: number, size = 96): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

interface ItemSeed {
  name: string;
  cat: string;
  price: number;
  description?: string;
  mods?: { name: string; options: [string, number][] }[];
  available?: boolean;
  orderable?: boolean;
}

const CAFE_ITEMS: ItemSeed[] = [
  { name: "Flat white", cat: "Drinks", price: 475, description: "Double ristretto, steamed milk.", mods: [{ name: "Milk", options: [["Dairy", 0], ["Oat", 75], ["Almond", 75]] }, { name: "Size", options: [["Small", 0], ["Large", 60]] }] },
  { name: "Latte", cat: "Drinks", price: 525, description: "Espresso and a lot of steamed milk.", mods: [{ name: "Milk", options: [["Dairy", 0], ["Oat", 75]] }] },
  { name: "Cortado", cat: "Drinks", price: 425, description: "Equal parts espresso and warm milk." },
  { name: "Cold brew", cat: "Drinks", price: 550, description: "Steeped 18 hours. Served over ice." },
  { name: "Drip coffee", cat: "Drinks", price: 325, description: "Today's single-origin batch brew." },
  { name: "Chai latte", cat: "Drinks", price: 550, description: "House-made spiced chai concentrate." },
  { name: "Pumpkin spice latte", cat: "Drinks", price: 625, description: "Back in October. Sold out for today.", available: false },
  { name: "Butter croissant", cat: "Food", price: 400, description: "Baked each morning by Hearth & Crumb, up the street." },
  { name: "Almond croissant", cat: "Food", price: 475 },
  { name: "Banana bread slice", cat: "Food", price: 375, description: "Walnuts, brown butter." },
  { name: "Egg and cheddar sandwich", cat: "Food", price: 850, description: "Soft egg, aged cheddar, chive mayo on a brioche bun." },
];
const BAKERY_ITEMS: ItemSeed[] = [
  { name: "Sourdough loaf", cat: "Baked goods", price: 950, description: "Long-ferment, 24 hours. Baked daily.", mods: [{ name: "Slicing", options: [["Whole", 0], ["Sliced", 0]] }] },
  { name: "Rye loaf", cat: "Baked goods", price: 1050, description: "Dark rye with caraway." },
  { name: "Cinnamon bun", cat: "Baked goods", price: 425, description: "Cardamom and brown sugar, cream cheese glaze." },
  { name: "Pączki", cat: "Baked goods", price: 350, description: "Rose-jam filled. Saturdays until they're gone." },
  { name: "Butter tart", cat: "Baked goods", price: 325 },
  { name: "Rugelach (6)", cat: "Baked goods", price: 1100, description: "Apricot and walnut." },
  { name: "Challah", cat: "Baked goods", price: 850, description: "Fridays only.", orderable: false },
  { name: "Chocolate babka", cat: "Baked goods", price: 1450, description: "Sold out, back Thursday.", available: false },
];
const REPAIR_ITEMS: ItemSeed[] = [
  { name: "iPhone screen repair", cat: "Repairs", price: 14900, description: "OEM-grade panel. Most iPhones 11 to 15, done in about an hour.", orderable: false },
  { name: "Battery replacement", cat: "Repairs", price: 7900, description: "New cell, 90-day warranty.", orderable: false },
  { name: "Charging port repair", cat: "Repairs", price: 9900, description: "Clean or replace the port.", orderable: false },
  { name: "Tempered glass protector", cat: "Accessories", price: 2499, description: "Installed free at the counter." },
  { name: "USB-C cable, 1 m", cat: "Accessories", price: 1999 },
  { name: "20 W wall charger", cat: "Accessories", price: 2999 },
  { name: "Phone case, clear", cat: "Accessories", price: 2499, available: false },
];

const DEVICES: { make: string; model: string; issue: string }[] = [
  { make: "Apple", model: "iPhone 14", issue: "Cracked screen, touch works" },
  { make: "Google", model: "Pixel 7", issue: "Battery drains in a few hours" },
  { make: "Apple", model: "iPad Air", issue: "Won't charge" },
  { make: "Samsung", model: "Galaxy S22", issue: "Screen flickers and has a green line" },
  { make: "Apple", model: "MacBook Air 2020", issue: "Several keys stopped working" },
  { make: "Apple", model: "iPhone 12", issue: "Battery health at 71%" },
  { make: "Apple", model: "iPhone 13", issue: "Cracked back glass" },
  { make: "Nintendo", model: "Switch", issue: "Left Joy-Con drifts" },
  { make: "Samsung", model: "Galaxy A54", issue: "Water damage, won't turn on" },
  { make: "Apple", model: "iPhone SE", issue: "Speaker is crackly" },
];

interface Shop {
  id: string;
  slug: string;
  row: typeof merchants.$inferSelect;
  locationId: string;
  staff: StaffContext;
}

/** Idempotent: does nothing when Pinecone already has a catalog (a previous run, or a shop that set one up). */
export async function seedCoreModules(db: Db, ctx: AppContext, clock: { now: Date }, opts: { seed?: number; log?: (m: string) => void } = {}): Promise<{ skipped: boolean }> {
  const log = opts.log ?? (() => {});
  const R = rng((opts.seed ?? 20261021) ^ 0x5eed);
  const realNow = new Date();
  const setClock = (d: Date) => {
    clock.now = d;
  };
  const shopRows = await db.select().from(merchants).where(inArray(merchants.slug, Object.keys(CORE_SHOP_FEATURES).concat("village-apothecary")));
  const bySlug = new Map(shopRows.map((m) => [m.slug, m]));
  const cafeRow = bySlug.get("pinecone-coffee");
  if (!cafeRow || !bySlug.get("hearth-and-crumb") || !bySlug.get("fix-it-phone-lab") || !bySlug.get("village-apothecary")) return { skipped: true };
  const [has] = await db.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.merchantId, cafeRow.id)).limit(1);
  if (has) return { skipped: true };

  // ---- Pilot overrides for the modules these shops show ----
  await db.insert(featureOverrides).values(
    Object.entries(CORE_SHOP_FEATURES).flatMap(([slug, keys]) => keys.map((key) => ({ merchantId: bySlug.get(slug)!.id, key, enabled: true, reason: "Demo pilot shop (core modules)", createdAt: cafeRow.createdAt }))),
  ).onConflictDoNothing();

  const shopOf = async (slug: string): Promise<Shop> => {
    const row = bySlug.get(slug)!;
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, `owner+${slug}@example.com`)).limit(1);
    const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.merchantId, row.id)).orderBy(asc(locations.createdAt)).limit(1);
    return { id: row.id, slug, row, locationId: loc!.id, staff: { user: { id: owner!.id, platformRole: "none" }, merchant: row, role: "owner", impersonated: false } };
  };
  const cafe = await shopOf("pinecone-coffee");
  const bakery = await shopOf("hearth-and-crumb");
  const apothecary = await shopOf("village-apothecary");
  const repair = await shopOf("fix-it-phone-lab");

  // Customers: the demo's Roncesvalles regulars, in a stable order.
  const pool = await db.select({ id: users.id, phone: users.phone, name: users.name }).from(users).where(like(users.phone, "+1647555%")).orderBy(asc(users.phone)).limit(60);
  if (pool.length < 12) return { skipped: true };
  const customer = (i: number) => pool[i % pool.length]!;

  // ---- Catalog ----
  const seedCatalog = async (shop: Shop, items: ItemSeed[]) => {
    const cats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, shop.id));
    const out: { id: string; name: string; price: number; orderable: boolean; available: boolean }[] = [];
    for (const [i, it] of items.entries()) {
      const cat = cats.find((c) => c.name === it.cat);
      const row = await createItem(db, shop.id, {
        name: it.name,
        description: it.description ?? null,
        priceCents: it.price,
        categoryId: cat?.id ?? null,
        modifiers: (it.mods ?? []).map((g) => ({ name: g.name, options: g.options.map(([name, priceCents]) => ({ name, priceCents })) })),
        available: it.available ?? true,
        orderable: it.orderable ?? true,
        sortOrder: i,
      });
      out.push({ id: row.id, name: it.name, price: it.price, orderable: row.orderable, available: row.available });
    }
    return out;
  };
  const cafeMenu = await seedCatalog(cafe, CAFE_ITEMS);
  const bakeryMenu = await seedCatalog(bakery, BAKERY_ITEMS);
  await seedCatalog(repair, REPAIR_ITEMS);

  // ---- Promos (live / scheduled / ended; the history behind the visits is already in the ledger) ----
  const day = (n: number) => new Date(realNow.getTime() + n * DAY);
  await db.insert(promos).values([
    { merchantId: cafe.id, title: "Cold brew launch: double stamps", body: "The first week of cold brew season, every iced drink earns two stamps.", kind: "multiplier", multiplierPct: 200, startsAt: day(6), endsAt: day(13), status: "scheduled", audience: "network", viewCount: 0, claimCount: 0 },
    { merchantId: cafe.id, title: "Holiday stamp bonus", body: "Extra stamp on every drink in the last two weeks of the year.", kind: "bonus_points", bonusPoints: 1, startsAt: day(-41), endsAt: day(-28), status: "ended", audience: "members", viewCount: 318, claimCount: 74 },
    { merchantId: bakery.id, title: "Babka Thursday", body: "Chocolate babka is back on Thursdays. Pre-order and skip the line.", kind: "offer", daysOfWeek: [4], startsAt: day(2), endsAt: day(30), status: "scheduled", audience: "network", viewCount: 0, claimCount: 0 },
    { merchantId: bakery.id, title: "Back-to-school muffin box", body: "Dozen mini muffins for $12, September only.", kind: "offer", startsAt: day(-52), endsAt: day(-22), status: "ended", audience: "network", viewCount: 540, claimCount: 119 },
    { merchantId: apothecary.id, title: "Flu season: double points on front store", body: "Vitamins, tissues and cold remedies earn double points. Not valid on prescriptions.", kind: "multiplier", multiplierPct: 200, startsAt: day(-47), endsAt: day(-33), status: "ended", audience: "network", viewCount: 233, claimCount: 58 },
  ]);
  // The seed's live promos had no redemptions yet.
  await db.update(promos).set({ claimCount: 58 }).where(and(eq(promos.merchantId, cafe.id), eq(promos.title, "Two-stamp Tuesdays")));

  // ---- Discount cards ----
  const cafeCats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, cafe.id));
  const bakeryCats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, bakery.id));
  await db.insert(discountCards).values([
    { merchantId: cafe.id, name: "Students 10% off", percentOff: 10, eligibility: "students", terms: "Drinks and food with a valid student card. One discount per visit.", excludedCategoryIds: [], active: true },
    { merchantId: bakery.id, name: "Roncy neighbours: $1 off a loaf", amountOffCents: 100, eligibility: "members_only", terms: "Any loaf, any day. Show your card at the counter.", excludedCategoryIds: bakeryCats.filter((c) => !c.discountEligible).map((c) => c.id), active: true },
    { merchantId: cafe.id, name: "Staff and neighbours", percentOff: 15, eligibility: "vip", terms: "For VIP members. Not combined with other offers.", excludedCategoryIds: cafeCats.filter((c) => c.name === "Food").map((c) => c.id), active: false },
  ]);

  // ---- Pickup slots (next 7 days) at the café and bakery, drop-off slots at the repair shop ----
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(realNow);
  setClock(realNow);
  await generateSlots(ctx, cafe.row, { locationId: cafe.locationId, kind: "pickup", startDate: today, days: 7, slotMinutes: 30, capacity: 4 });
  await generateSlots(ctx, bakery.row, { locationId: bakery.locationId, kind: "pickup", startDate: today, days: 7, slotMinutes: 30, capacity: 3 });
  await generateSlots(ctx, repair.row, { locationId: repair.locationId, kind: "dropoff", startDate: today, days: 7, slotMinutes: 30, capacity: 2 });

  // ---- Orders ----
  const since = new Date();
  /** Back-date what the services stamp with the database clock. */
  const backdateOrder = async (orderId: string, userId: string, merchantId: string, at: Date, end: Date) => {
    await db.update(orders).set({ createdAt: at, updatedAt: end }).where(eq(orders.id, orderId));
    await db.update(ledgerTransactions).set({ createdAt: end }).where(and(eq(ledgerTransactions.merchantId, merchantId), gt(ledgerTransactions.createdAt, since), sql`${ledgerTransactions.memberId} in (select id from merchant_members where merchant_id = ${merchantId} and user_id = ${userId})`));
    await db.update(visits).set({ createdAt: end }).where(and(eq(visits.merchantId, merchantId), gt(visits.createdAt, since), sql`${visits.memberId} in (select id from merchant_members where merchant_id = ${merchantId} and user_id = ${userId})`));
  };
  let orderSeq = 0;
  const makeOrder = async (shop: Shop, menu: typeof cafeMenu, at: Date, target: "pending" | "accepted" | "preparing" | "ready" | "picked_up" | "cancelled", opts2: { slotId?: string; who?: number } = {}) => {
    const buyer = customer(opts2.who ?? 10 + (orderSeq % 25));
    const orderable = menu.filter((m) => m.orderable && m.available);
    const chosen = new Set<string>();
    for (let k = R.int(1, 3); k > 0; k--) chosen.add(R.pick(orderable).id);
    const lines = [...chosen].map((catalogItemId) => ({ catalogItemId, quantity: R.int(1, 2), modifiers: [] as { name: string; option: string }[] }));
    setClock(at);
    const placed = await placeOrder(ctx, buyer.id, {
      merchantId: shop.id,
      locationId: shop.locationId,
      items: lines,
      pickupAt: opts2.slotId ? null : new Date(at.getTime() + 20 * MIN).toISOString(),
      slotId: opts2.slotId ?? null,
      tipCents: R.int(0, 2) * 100,
      notes: R.int(0, 5) === 0 ? "Please cut the sandwich in half" : null,
      kind: "pickup",
      paymentMethod: "at_pickup",
      idempotencyKey: `seed-${shop.slug}-${orderSeq++}`,
    });
    const id = placed.order.id;
    let t = at;
    const step = async (status: "accepted" | "preparing" | "ready" | "picked_up", after: number) => {
      t = new Date(t.getTime() + after * MIN);
      setClock(t);
      await updateOrderStatus(ctx, shop.staff, id, { status });
    };
    if (target === "cancelled") {
      t = new Date(at.getTime() + 4 * MIN);
      setClock(t);
      await updateOrderStatus(ctx, shop.staff, id, { status: "cancelled", reason: "Sold out of what you ordered. Sorry! Come by for a free drink on us." });
    } else if (target !== "pending") {
      await step("accepted", 1);
      if (target !== "accepted") await step("preparing", 2);
      if (target === "ready" || target === "picked_up") await step("ready", 8);
      if (target === "picked_up") await step("picked_up", 10 + R.int(0, 12));
    }
    if (at < new Date(realNow.getTime() - 3 * 3600_000)) await backdateOrder(id, buyer.id, shop.id, at, t);
    return id;
  };
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" });
  /** A wall-clock time in Toronto `daysAgo` days back (never later than a few minutes ago). */
  const toronto = (daysAgo: number, hour: number, minute: number) => {
    const at = zonedToUtc(localDay.format(new Date(realNow.getTime() - daysAgo * DAY)), hour * 60 + minute, "America/Toronto");
    return at > realNow ? new Date(realNow.getTime() - 20 * MIN - R.int(0, 9) * MIN) : at;
  };
  // A week of history (mostly picked up, one cancelled), then the live queue in the last half hour.
  for (let d = 7; d >= 1; d--) {
    for (const [h, m] of [[7, 40], [8, 15], [9, 5], [12, 20]] as const) {
      if (R.next() < 0.25) continue;
      await makeOrder(cafe, cafeMenu, toronto(d, h, m + R.int(0, 9)), d === 4 && h === 12 ? "cancelled" : "picked_up");
    }
    for (const [h, m] of [[8, 30], [10, 10]] as const) {
      if (R.next() < 0.4) continue;
      await makeOrder(bakery, bakeryMenu, toronto(d, h, m + R.int(0, 9)), "picked_up");
    }
  }
  const mins = (n: number) => new Date(realNow.getTime() - n * MIN);
  await makeOrder(cafe, cafeMenu, mins(2), "pending", { who: 3 });
  await makeOrder(cafe, cafeMenu, mins(6), "pending", { who: 4 });
  await makeOrder(cafe, cafeMenu, mins(14), "accepted", { who: 5 });
  await makeOrder(cafe, cafeMenu, mins(22), "preparing", { who: 6 });
  await makeOrder(cafe, cafeMenu, mins(35), "ready", { who: 7 });
  await makeOrder(bakery, bakeryMenu, mins(5), "pending", { who: 8 });
  await makeOrder(bakery, bakeryMenu, mins(18), "preparing", { who: 9 });
  // Orders for pickup slots later this week.
  for (const shop of [{ s: cafe, menu: cafeMenu }, { s: bakery, menu: bakeryMenu }]) {
    const slots = (await listSlots(db, shop.s.id, { kind: "pickup", from: new Date(realNow.getTime() + 20 * 3600_000), onlyAvailable: true })).filter((s) => new Date(s.startsAt).getUTCHours() >= 12);
    for (const [i, idx] of [2, 9, 17, 33].entries()) if (slots[idx]) await makeOrder(shop.s, shop.menu, mins(60 + i * 30), "pending", { slotId: slots[idx]!.id, who: 12 + i });
  }
  setClock(realNow);

  // ---- Service tickets, quotes and invoices at the repair shop ----
  // Drop-off terms, a stated warranty and rolling drop-off settings for the repair shop. The staff context holds the row, so refresh it too.
  const TERMS = "We back up nothing: please save your data before you drop off. We call before any work beyond the quote. Items not collected within 60 days are handled under Ontario's Repair and Storage Liens Act.";
  await db.update(merchants).set({ intakeTerms: TERMS, warrantyDays: 90, dropoffSlotMinutes: 30, dropoffCapacity: 3, dropoffDaysAhead: 14 }).where(eq(merchants.id, repair.id));
  Object.assign(repair.row, { intakeTerms: TERMS, warrantyDays: 90 });
  const repairCats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, repair.id));
  const repairsCat = repairCats.find((c) => c.name === "Repairs")?.id ?? null;
  const dropoffSlots = await listSlots(db, repair.id, { kind: "dropoff", onlyAvailable: true });
  const labour = (cents: number, what = "Labour") => ({ description: what, quantity: 1, unitPriceCents: cents, kind: "labour" as const, categoryId: repairsCat });
  const part = (cents: number, what: string) => ({ description: what, quantity: 1, unitPriceCents: cents, kind: "part" as const, categoryId: repairsCat });
  type Plan = { dev: number; daysAgo: number; hour: number; stage: "intake" | "diagnosing" | "quote_sent" | "approved" | "in_progress" | "waiting_parts" | "ready" | "picked_up" | "declined" | "cancelled"; lines?: Parameters<typeof createQuote>[3]["lineItems"]; diagnosis?: string; promisedIn?: number; slot?: number;
    /** Everything below is optional and only fills in what the new repair screens show. */
    minute?: number; photos?: number; checks?: string[]; shelf?: string; assign?: boolean; locale?: "pa" | "hi" | "ur"; viewed?: boolean; phone?: boolean; depositPct?: number; readyDaysAgo?: number; ladder?: number };
  const plans: Plan[] = [
    { dev: 0, daysAgo: 0, hour: 9, stage: "intake", slot: 3 },
    { dev: 1, daysAgo: 1, hour: 11, stage: "diagnosing", slot: 7 },
    { dev: 2, daysAgo: 2, hour: 14, stage: "quote_sent", lines: [part(6500, "Charging port assembly"), labour(5500)], diagnosis: "Port is bent and full of lint. Needs a new assembly.", promisedIn: 3 },
    { dev: 3, daysAgo: 3, hour: 10, stage: "in_progress", lines: [part(21900, "OLED display (OEM)"), labour(6000)], diagnosis: "Panel is failing. Replace the display.", promisedIn: 1 },
    { dev: 4, daysAgo: 6, hour: 13, stage: "waiting_parts", lines: [part(18500, "Keyboard top case, ISO"), labour(8000)], diagnosis: "Liquid damage on the keyboard flex. Top case replacement.", promisedIn: 4 },
    { dev: 5, daysAgo: 2, hour: 16, stage: "ready", lines: [part(5900, "Battery cell"), labour(2000)], diagnosis: "Battery at 71% capacity, swells under load.", promisedIn: 0 },
    { dev: 6, daysAgo: 9, hour: 12, stage: "picked_up", lines: [part(8900, "Back glass"), labour(4500)], diagnosis: "Back glass shattered, frame is fine." },
    { dev: 7, daysAgo: 16, hour: 15, stage: "picked_up", lines: [part(2400, "Joy-Con stick module"), labour(3000)], diagnosis: "Worn stick module. Replaced both sides." },
    { dev: 8, daysAgo: 5, hour: 10, stage: "declined", lines: [part(24000, "Logic board repair"), labour(9000)], diagnosis: "Corrosion on the board. Repair is possible but costs more than the phone is worth." },
    { dev: 9, daysAgo: 1, hour: 15, stage: "approved", lines: [part(4500, "Speaker module"), labour(3500)], diagnosis: "Speaker mesh is clogged and the driver is torn.", promisedIn: 2 },
    { dev: 3, daysAgo: 4, hour: 17, stage: "cancelled" },
    // Fix-It Phone Lab as in the design: a quote opened but not approved, one approved by phone with the deposit paid, an
    // overdue repair, and a phone that has sat ready for six days with an open invoice and the day-3 reminder sent.
    { dev: 2, daysAgo: 1, hour: 9, minute: 5, stage: "quote_sent", lines: [part(12900, "Charging port assembly"), labour(8000), { description: "Diagnostic fee (credited)", quantity: 1, unitPriceCents: -3000, kind: "fee" as const, categoryId: null }], diagnosis: "The charging port is packed with debris and one pin is bent. Cleaning will not hold. Replace the port assembly. Your data is not affected.", promisedIn: 4, photos: 3, checks: ["Data-loss notice given", "Charger left with it"], assign: true, locale: "pa", viewed: true, depositPct: 25 },
    { dev: 9, daysAgo: 2, hour: 10, minute: 12, stage: "approved", lines: [part(3500, "Speaker module"), labour(4500)], diagnosis: "Speaker mesh is clogged and the driver is torn.", promisedIn: 0, photos: 2, assign: true, phone: true, depositPct: 25, checks: ["Water indicator: clear"] },
    { dev: 3, daysAgo: 4, hour: 11, minute: 20, stage: "in_progress", lines: [part(12000, "Display flex cable"), labour(7000)], diagnosis: "Flex cable is damaged. Replace it.", promisedIn: -1, assign: true },
    { dev: 5, daysAgo: 8, hour: 13, minute: 30, stage: "ready", lines: [part(12900, "Battery replacement"), labour(2500)], diagnosis: "Battery at 71% health. New cell fitted and tested.", readyDaysAgo: 6, ladder: 3, assign: true, shelf: "B3" },
  ];
  const ticketIds: { id: string; userId: string; at: Date; end: Date }[] = [];
  for (const [i, p] of plans.entries()) {
    const cust = customer(20 + i);
    const dev = DEVICES[p.dev]!;
    const at = toronto(p.daysAgo, p.hour, p.minute ?? R.int(0, 40));
    setClock(at);
    if (p.locale) await db.update(users).set({ locale: p.locale }).where(eq(users.id, cust.id));
    const photoUrls: string[] = [];
    for (let k = 0; k < (p.photos ?? 0); k++) photoUrls.push((await getStorage(ctx).put({ merchantId: repair.id, contentType: "image/png", body: solidPng(...([[188, 190, 196], [150, 154, 164], [216, 218, 222]][k % 3] as [number, number, number])) })).url);
    const created = await createTicket(ctx, repair.staff, {
      customer: { phone: cust.phone!, name: cust.name },
      locationId: repair.locationId,
      itemKind: "device",
      itemDetails: { make: dev.make, model: dev.model },
      issue: dev.issue,
      intakeNotes: i % 3 === 0 ? "Left a passcode on the sticky note. Backup done by customer." : null,
      photos: photoUrls,
      promisedAt: p.promisedIn === undefined ? null : new Date(realNow.getTime() + p.promisedIn * DAY).toISOString(),
      assignedStaffId: p.assign ? repair.staff.user.id : null,
      intakeChecklist: p.checks ?? [],
      termsAccepted: !!repair.row.intakeTerms,
      shelfLocation: p.shelf ?? null,
    });
    const tid = created.ticket.id;
    let t = at;
    const tick = (mins2: number) => {
      t = new Date(t.getTime() + mins2 * MIN);
      setClock(t);
    };
    const status = (s: "diagnosing" | "in_progress" | "waiting_parts" | "ready" | "picked_up" | "cancelled", note?: string) => setTicketStatus(ctx, repair.staff, tid, { status: s, note: note ?? null, notify: false, allowUnpaid: true });
    if (p.stage === "cancelled") {
      tick(90);
      await status("cancelled", "Customer picked the phone up and took it elsewhere.");
    } else if (p.stage === "diagnosing") {
      tick(45);
      await status("diagnosing", "Testing the battery and charge port");
    } else if (p.lines) {
      tick(60);
      const q = await createQuote(ctx, repair.staff, tid, { diagnosis: p.diagnosis ?? null, lineItems: p.lines, depositPercent: p.depositPct ?? 0, expiresInDays: 7, send: true });
      if (p.viewed) {
        tick(40);
        await markQuoteViewed(ctx, await getMerchantQuote(db, repair.id, q.id));
      }
      if (p.stage !== "quote_sent") {
        tick(120);
        const quote = await getMerchantQuote(db, repair.id, q.id);
        if (p.stage === "declined") await respondToQuote(ctx, quote, { action: "decline", reason: "Too expensive for an old phone", ip: "203.0.113.7", userAgent: "seed" });
        else {
          if (p.phone) await authorizeQuoteByPhone(ctx, repair.staff, quote.id, { name: cust.name ?? "Customer", phone: cust.phone, note: "Said yes on the phone, wants it by tomorrow" });
          else await respondToQuote(ctx, quote, { action: "approve", signatureName: cust.name ?? "Customer", ip: "203.0.113.7", userAgent: "seed" });
          if (p.depositPct) await db.update(quotes).set({ depositPaidAt: t }).where(eq(quotes.id, quote.id));
          if (p.stage !== "approved") {
            tick(180);
            await status("in_progress", "Parts are in, starting the repair");
          }
          if (p.stage === "waiting_parts") {
            tick(240);
            await status("waiting_parts", "Top case is on back-order, due Thursday");
          }
          if (p.stage === "ready" || p.stage === "picked_up") {
            tick(300);
            await status("ready", "All done and tested");
            tick(10);
            const inv = await createInvoice(ctx, repair.staff, tid, { fromQuote: true, extraLineItems: [], send: true });
            if (p.readyDaysAgo !== undefined) await db.update(serviceTickets).set({ readyAt: new Date(realNow.getTime() - p.readyDaysAgo * DAY), pickupReminderDay: p.ladder ?? 0 }).where(eq(serviceTickets.id, tid));
            if (p.stage === "picked_up") {
              tick(24 * 60);
              await markInvoicePaid(ctx, repair.staff, inv.id, { method: i % 2 ? "cash" : "card_terminal", note: null });
              tick(5);
              await status("picked_up");
            }
          }
        }
      }
    }
    if (i === 3) await addNote(ctx, repair.staff, tid, { note: "Customer asked for the old screen back", visibleToCustomer: false });
    ticketIds.push({ id: tid, userId: cust.id, at, end: t });
    if (p.slot !== undefined && dropoffSlots[p.slot]) await createBooking(ctx, cust.id, { slotId: dropoffSlots[p.slot]!.id, ticketId: tid, notes: null });
  }
  setClock(realNow);
  // Extra drop-off bookings for people who haven't opened a ticket yet.
  for (const [i, idx] of [12, 14, 21, 26, 30].entries()) if (dropoffSlots[idx]) await createBooking(ctx, customer(32 + i).id, { slotId: dropoffSlots[idx]!.id, notes: ["Cracked screen", "Slow charging", "Won't turn on", "Battery swelling", "Camera is blurry"][i]! });
  // Pickup-slot bookings that aren't tied to orders (customers who reserved a time to collect).
  for (const [shop, idxs] of [[cafe, [5, 6, 13, 27]], [bakery, [4, 11, 19]]] as const) {
    const slots = await listSlots(db, shop.id, { kind: "pickup", onlyAvailable: true });
    for (const [i, idx] of idxs.entries()) if (slots[idx]) await createBooking(ctx, customer(40 + i).id, { slotId: slots[idx]!.id, notes: null }).catch(() => undefined);
  }

  // Tickets, quotes, invoices and events carry database-clock stamps: lay them out on the ticket's own timeline.
  for (const tk of ticketIds) {
    await db.update(serviceTickets).set({ createdAt: tk.at, updatedAt: tk.end }).where(eq(serviceTickets.id, tk.id));
    const evs = await db.select({ id: ticketEvents.id }).from(ticketEvents).where(eq(ticketEvents.ticketId, tk.id)).orderBy(asc(ticketEvents.createdAt), asc(ticketEvents.id));
    const spread = (tk.end.getTime() - tk.at.getTime()) / Math.max(1, evs.length - 1);
    for (const [k, e] of evs.entries()) await db.update(ticketEvents).set({ createdAt: new Date(tk.at.getTime() + k * spread) }).where(eq(ticketEvents.id, e.id));
    await db.update(quotes).set({ createdAt: tk.at }).where(eq(quotes.ticketId, tk.id));
    await db.update(invoices).set({ createdAt: tk.end }).where(eq(invoices.ticketId, tk.id));
    await db.update(invoices).set({ paidAt: tk.end }).where(and(eq(invoices.ticketId, tk.id), sql`${invoices.paidAt} is not null`));
    await db.update(ledgerTransactions).set({ createdAt: tk.end }).where(and(eq(ledgerTransactions.merchantId, repair.id), gt(ledgerTransactions.createdAt, since), sql`${ledgerTransactions.memberId} in (select id from merchant_members where merchant_id = ${repair.id} and user_id = ${tk.userId})`));
  }

  // ---- Ads at the bakery: a draft, a live campaign with delivery, and one that ran last month ----
  const [hood] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, "roncesvalles")).limit(1);
  const adminId = (await db.select({ id: users.id }).from(users).where(eq(users.platformRole, "admin")).limit(1))[0]!.id;
  const [paczki] = await db.select({ id: promos.id }).from(promos).where(and(eq(promos.merchantId, bakery.id), eq(promos.title, "Pączki Saturday"))).limit(1);
  await db.insert(adCampaigns).values({
    merchantId: bakery.id, placement: "feed_top", neighbourhoodIds: [hood!.id], headline: "Hot cross buns are back", body: "Baked fresh from 7:30 every morning through Easter.",
    pricingModel: "daily", rateCents: 500, budgetCents: 3500, startsAt: day(10), endsAt: day(17), status: "draft", paymentStatus: "pending",
  });
  const mkAd = async (body: Parameters<typeof createAdCampaign>[2], startedDaysAgo: number) => {
    setClock(day(-startedDaysAgo));
    const ad = await createAdCampaign(ctx, bakery.row, body, bakery.staff.user.id);
    await reviewAd(ctx, ad.id, { approve: true, note: "Looks good" }, adminId);
    await markAdPaid(ctx, ad.id, "paid", adminId);
    setClock(realNow);
    return ad;
  };
  const live = await mkAd({ placement: "promo_boost", promoId: paczki!.id, pricingModel: "cpm", neighbourhoodIds: [hood!.id], startsAt: day(-5), endsAt: day(9), budgetCents: 6000 }, 5);
  const past = await mkAd({ placement: "feed_top", pricingModel: "daily", headline: "New: Saturday rye and caraway", body: "A dark rye you can toast for breakfast. Limited loaves.", neighbourhoodIds: [hood!.id], startsAt: day(-33), endsAt: day(-26) }, 33);
  await runAdsLifecycle(ctx);
  // Lay the campaigns out on their own timeline (newest first in the list).
  for (const a of await db.select({ id: adCampaigns.id, startsAt: adCampaigns.startsAt }).from(adCampaigns).where(eq(adCampaigns.merchantId, bakery.id))) {
    await db.update(adCampaigns).set({ createdAt: a.startsAt < realNow ? new Date(a.startsAt.getTime() - 2 * DAY) : new Date(realNow.getTime() - DAY) }).where(eq(adCampaigns.id, a.id));
  }
  const members = pool.slice(0, 40);
  const delivery = async (adId: string, startedAt: Date, days: number, perDay: number, ctr: number, visitsPerDay: number) => {
    let imps = 0, clicks = 0, visitsN = 0;
    const rows: (typeof adEvents.$inferInsert)[] = [];
    for (let d = 0; d < days; d++) {
      const base = new Date(startedAt.getTime() + d * DAY);
      const n = Math.max(3, Math.round(perDay * (0.7 + R.next() * 0.6)));
      for (let k = 0; k < n; k++) {
        const u = R.pick(members);
        const at = new Date(base.getTime() + R.int(7 * 60, 21 * 60) * MIN);
        if (at > realNow) continue;
        rows.push({ adCampaignId: adId, userId: u.id, kind: "impression", createdAt: at });
        imps++;
        if (R.next() < ctr) {
          rows.push({ adCampaignId: adId, userId: u.id, kind: "click", createdAt: new Date(at.getTime() + 20_000) });
          clicks++;
        }
      }
      for (let k = 0; k < visitsPerDay; k++) {
        if (R.next() < 0.6) {
          rows.push({ adCampaignId: adId, userId: R.pick(members).id, kind: "visit", createdAt: new Date(base.getTime() + R.int(9 * 60, 19 * 60) * MIN) });
          visitsN++;
        }
      }
    }
    if (rows.length) await db.insert(adEvents).values(rows);
    return { imps, clicks, visitsN };
  };
  const l = await delivery(live.id, day(-5), 5, 30, 0.045, 1);
  await db.update(adCampaigns).set({ impressions: l.imps, clicks: l.clicks, attributedVisits: l.visitsN, spentCents: cpmSpend(l.imps, live.rateCents, live.budgetCents) }).where(eq(adCampaigns.id, live.id));
  const p = await delivery(past.id, day(-33), 7, 24, 0.038, 2);
  await db.update(adCampaigns).set({ impressions: p.imps, clicks: p.clicks, attributedVisits: p.visitsN }).where(eq(adCampaigns.id, past.id));
  setClock(realNow);

  log(`Core modules: catalog, ${orderSeq} orders, slots + bookings, ${plans.length} service tickets, promos, discount cards, ads`);
  return { skipped: false };
}
