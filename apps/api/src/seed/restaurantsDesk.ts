/**
 * Demo data for the restaurant desk (desi2), added after the corridor is seeded: cuisines (so festivals are ranked for a
 * Hyderabadi shop and a Punjabi dhaba differently), pot caps by weekday and per hour with an Eid override, per-pot recipes and
 * cook times for the degh, a day of pre-orders with one pinned for "Start dum", an allergy ticket, a wait list, busy-mode history,
 * a WhatsApp thread with an order summary, two phone calls with an uncertain item, and festival sends.
 * Deterministic (relative dates) and called once from seedRestaurantCorridor, which itself skips when already seeded.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { busyModeEvents, catalogItems, festivalSends, locations, merchants, orderItems, orders, phoneCalls, preorderWaitlist, users, whatsappMessages, whatsappSessions, type Db } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { orderPayUrl } from "../services/channel-orders.js";
import { nextNumber } from "../services/counters.js";
import { addDaysKey, dateKeyIn, localMidnightUtc } from "../services/preorderPlanning.js";
import { computeTax } from "../services/tax.js";

const TZ = "America/Toronto";
const MIN = 60_000;
const HOUR = 3_600_000;

const CUISINES: Record<string, string[]> = {
  "nawab-biryani-house": ["hyderabadi"],
  "lahori-karahi-and-bbq": ["pakistani"],
  "shree-thali-and-tiffin": ["gujarati"],
  "sarson-dhaba": ["punjabi"],
  "meethi-mithai-and-chai": ["mithai"],
  "padma-bangladeshi-kitchen": ["bangladeshi"],
  "jaffna-kottu-house": ["sri_lankan"],
  "kabul-garden-grill": ["afghan"],
  "zeenat-catering": ["pakistani"],
};

/** Cook time (minutes from fire to ready) and the per-pot recipe, by dish name. Estimates, as the screens say. */
const DEGH: Record<string, Record<string, { cook: number; recipe: { riceKg?: number; meatKg?: number; meatKind?: string; extras?: { name: string; qty: number; unit: string }[] } }>> = {
  "nawab-biryani-house": {
    "Chicken Biryani Degh": { cook: 90, recipe: { riceKg: 2.2, meatKg: 3, meatKind: "chicken" } },
    "Goat Biryani Degh": { cook: 210, recipe: { riceKg: 2.2, meatKg: 3, meatKind: "goat" } },
    "Vegetable Biryani Degh": { cook: 60, recipe: { riceKg: 2.2, meatKg: 3, meatKind: "paneer" } },
  },
  "lahori-karahi-and-bbq": {
    "Chicken Karahi Degh (serves 20)": { cook: 120, recipe: { meatKg: 4, meatKind: "chicken", extras: [{ name: "tomatoes", qty: 3, unit: "kg" }] } },
    "Mutton Pulao Degh (serves 20)": { cook: 180, recipe: { riceKg: 3, meatKg: 4, meatKind: "goat" } },
    "Zarda Degh (serves 20)": { cook: 90, recipe: { riceKg: 3, extras: [{ name: "sugar", qty: 1.5, unit: "kg" }] } },
  },
};

export async function seedRestaurantDesk(ctx: AppContext, log: (m: string) => void = () => {}): Promise<void> {
  const db: Db = ctx.db;
  const now = ctx.now();
  const today = dateKeyIn(now, TZ);
  const at = (dateKey: string, hour: number, minute = 0) => new Date(localMidnightUtc(dateKey, TZ).getTime() + (hour * 60 + minute) * MIN);

  const shops = await db.select().from(merchants).where(inArray(merchants.slug, Object.keys(CUISINES)));
  const bySlug = new Map(shops.map((s) => [s.slug, s]));
  const nawab = bySlug.get("nawab-biryani-house");
  const lahori = bySlug.get("lahori-karahi-and-bbq");
  if (!nawab || !lahori) return;

  // ---- cuisines, caps, Eid override ----
  for (const s of shops) await db.update(merchants).set({ cuisines: CUISINES[s.slug] ?? [] }).where(eq(merchants.id, s.id));
  await db
    .update(merchants)
    .set({
      preorderDailyCap: 12,
      preorderCapByWeekday: { fri: 20, sat: 20, sun: 25 },
      preorderPerHourCap: 3,
      preorderOverrides: [{ from: "2027-03-08", to: "2027-03-10", cap: 40, leadHours: 72, label: "Eid al-Fitr" }],
    })
    .where(eq(merchants.id, nawab.id));
  await db
    .update(merchants)
    .set({ preorderCapByWeekday: { fri: 16, sat: 16, sun: 16 }, preorderPerHourCap: 3, preorderOverrides: [{ from: "2027-03-08", to: "2027-03-10", cap: 30, leadHours: 72, label: "Eid al-Fitr" }] })
    .where(eq(merchants.id, lahori.id));

  // ---- recipes and cook times ----
  for (const [slug, dishes] of Object.entries(DEGH)) {
    const shop = bySlug.get(slug);
    if (!shop) continue;
    for (const [name, v] of Object.entries(dishes)) {
      await db.update(catalogItems).set({ cookMinutes: v.cook, recipe: v.recipe }).where(and(eq(catalogItems.merchantId, shop.id), eq(catalogItems.name, name)));
    }
  }

  // ---- people ----
  const phones = Array.from({ length: 12 }, (_, i) => `+1905555${String(3000 + i).padStart(4, "0")}`);
  const people = await db.select({ id: users.id, phone: users.phone, name: users.name }).from(users).where(inArray(users.phone, phones));
  const person = (i: number) => people.find((p) => p.phone === phones[i])!;
  const items = await db.select().from(catalogItems).where(eq(catalogItems.merchantId, nawab.id));
  const dish = (name: string) => items.find((i) => i.name === name)!;
  const chicken = dish("Chicken Biryani Degh");
  const goat = dish("Goat Biryani Degh");
  const veg = dish("Vegetable Biryani Degh");

  // ---- tomorrow's pre-orders and one pinned for "Start dum" today ----
  interface Pre { who: number; lines: [typeof chicken, number][]; day: string; hour: number; minute?: number; channel: "web" | "whatsapp" | "phone"; paid: boolean; allergy?: string }
  const tomorrow = addDaysKey(today, 1);
  const pinnedPickup = new Date(Math.ceil((now.getTime() + 3 * HOUR) / (15 * MIN)) * 15 * MIN);
  const plan: (Pre & { pickup?: Date })[] = [
    { who: 5, lines: [[goat, 1]], day: tomorrow, hour: 11, channel: "web", paid: false },
    { who: 4, lines: [[chicken, 2]], day: tomorrow, hour: 12, minute: 30, channel: "whatsapp", paid: true },
    { who: 0, lines: [[veg, 1]], day: tomorrow, hour: 13, channel: "phone", paid: false },
    { who: 7, lines: [[chicken, 1]], day: tomorrow, hour: 15, minute: 30, channel: "web", paid: false },
    { who: 8, lines: [[goat, 2], [chicken, 1]], day: tomorrow, hour: 17, channel: "web", paid: false, allergy: "peanuts" },
    { who: 9, lines: [[chicken, 4], [goat, 2]], day: today, hour: 0, channel: "web", paid: false, pickup: pinnedPickup },
  ];
  const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.merchantId, nawab.id)).limit(1);
  const locationId = loc?.id ?? null;
  let hiraOrder: { id: string; number: number } | null = null;
  for (const p of plan) {
    const pickupAt = p.pickup ?? at(p.day, p.hour, p.minute ?? 0);
    const subtotal = p.lines.reduce((s, [i, q]) => s + i.priceCents * q, 0);
    const tax = computeTax(subtotal, "ON").taxCents;
    const total = subtotal + tax;
    const deposit = Math.round(total * 0.3);
    const number = await nextNumber(db, nawab.id, "order");
    const id = randomUUID();
    const created = new Date(now.getTime() - (p.who + 2) * HOUR);
    await db.insert(orders).values({
      id,
      merchantId: nawab.id,
      locationId,
      userId: person(p.who).id,
      number,
      status: "accepted",
      kind: "preorder",
      channel: p.channel,
      pickupAt,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      depositCents: deposit,
      depositPaidAt: p.channel === "phone" ? null : created,
      paymentMethod: p.channel === "phone" ? "at_pickup" : "in_app",
      paymentStatus: p.channel === "phone" ? "unpaid" : "authorized",
      allergyNote: p.allergy ?? null,
      notes: null,
      createdAt: created,
      updatedAt: created,
    });
    await db.insert(orderItems).values(p.lines.map(([i, q]) => ({ orderId: id, catalogItemId: i.id, name: i.name, quantity: q, unitPriceCents: i.priceCents, station: i.station, kitchenStatus: "queued" })));
    if (p.who === 4) hiraOrder = { id, number };
    if (p.paid) await db.update(orders).set({ paymentStatus: "paid", paidAt: created, depositPaidAt: created }).where(eq(orders.id, id));
  }

  // ---- an allergy on the open WhatsApp ticket ----
  const [wa] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.merchantId, nawab.id), eq(orders.channel, "whatsapp"), eq(orders.status, "preparing"), isNull(orders.bumpedAt)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (wa) {
    await db.update(orders).set({ allergyNote: "tree nuts, table 9" }).where(eq(orders.id, wa.id));
    await db.update(orderItems).set({ notes: "no cashew cream" }).where(and(eq(orderItems.orderId, wa.id), eq(orderItems.name, "Butter Chicken")));
  }

  // ---- wait list: two guests for the next Sunday ----
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sunday = addDaysKey(today, dow === 0 ? 7 : 7 - dow);
  await db.insert(preorderWaitlist).values([
    { merchantId: nawab.id, itemId: chicken.id, date: sunday, userId: person(10).id, phone: person(10).phone!, name: person(10).name, consentText: restaurantApi.WAITLIST_CONSENT_TEXT, createdAt: new Date(now.getTime() - 5 * HOUR) },
    { merchantId: nawab.id, itemId: goat.id, date: sunday, userId: person(11).id, phone: person(11).phone!, name: person(11).name, consentText: restaurantApi.WAITLIST_CONSENT_TEXT, createdAt: new Date(now.getTime() - 3 * HOUR) },
  ]);

  // ---- busy-mode history (off now) ----
  const evening = (daysAgo: number, hour: number, add: number, hours: number) => {
    const startedAt = at(addDaysKey(today, -daysAgo), hour);
    const until = new Date(startedAt.getTime() + hours * HOUR);
    return { merchantId: nawab.id, addMinutes: add, startedAt, until, endedAt: until };
  };
  await db.insert(busyModeEvents).values([evening(6, 18, 15, 2), evening(5, 19, 20, 3), evening(13, 18, 10, 2)]);

  // ---- WhatsApp: a thread with a pay-link summary, and a line in every other chat ----
  const sessions = await db.select().from(whatsappSessions).where(eq(whatsappSessions.merchantId, nawab.id)).orderBy(desc(whatsappSessions.updatedAt));
  const hira = person(4);
  let hiraSession = sessions.find((s) => s.phone === hira.phone);
  if (!hiraSession) {
    [hiraSession] = await db
      .insert(whatsappSessions)
      .values({ merchantId: nawab.id, phone: hira.phone!, userId: hira.id, state: "awaiting_payment", language: "ur", cart: [], orderId: hiraOrder?.id ?? null, lastInboundAt: new Date(now.getTime() - 4 * MIN), marketingOptInAt: new Date(now.getTime() - 21 * 86_400_000), createdAt: new Date(now.getTime() - 30 * MIN), updatedAt: new Date(now.getTime() - 4 * MIN) })
      .returning();
  } else {
    await db.update(whatsappSessions).set({ state: "awaiting_payment", language: "ur", orderId: hiraOrder?.id ?? hiraSession.orderId, lastInboundAt: new Date(now.getTime() - 4 * MIN), updatedAt: new Date(now.getTime() - 4 * MIN) }).where(eq(whatsappSessions.id, hiraSession.id));
  }
  const t = (m: number) => new Date(now.getTime() - m * MIN);
  const payUrl = hiraOrder ? orderPayUrl(ctx, hiraOrder.id) : null;
  const summary: restaurantApi.OrderSummaryBody = { orderNumber: hiraOrder?.number ?? 0, lines: [{ quantity: 2, name: "Chicken Biryani Degh", totalCents: chicken.priceCents * 2 }], subtotalCents: chicken.priceCents * 2, taxCents: computeTax(chicken.priceCents * 2, "ON").taxCents, totalCents: chicken.priceCents * 2 + computeTax(chicken.priceCents * 2, "ON").taxCents, depositCents: Math.round((chicken.priceCents * 2 + computeTax(chicken.priceCents * 2, "ON").taxCents) * 0.3), payUrl };
  const row = (direction: "in" | "out", kind: "text" | "order_summary", body: string, minutesAgo: number, sender: string | null) => ({ merchantId: nawab.id, sessionId: hiraSession!.id, direction, kind, body, sender, createdAt: t(minutesAgo) });
  await db.insert(whatsappMessages).values([
    row("in", "text", "assalam o alaikum, kal dopahar do chicken biryani degh chahiye, 2 baje pickup", 26, "guest"),
    row("out", "text", "Walaikum assalam Hira. 2 × Chicken Biryani Degh, tomorrow, pickup 12:30 pm. Deposit 30%.", 25, "assistant"),
    row("out", "order_summary", JSON.stringify(summary), 25, "assistant"),
    row("out", "text", "Pay link sent. It expires in 30 minutes; I will hold the pots until then.", 24, "assistant"),
    row("in", "text", "theek hai, abhi karti hun", 4, "guest"),
  ]);
  const hello = ["Hi, are you open on Eid day?", "nihari 2, naan 6, Friday 7pm", "Thank you ji, confirmed", "Do you have haleem today?"];
  let k = 0;
  for (const s of sessions) {
    if (hiraSession && s.id === hiraSession.id) continue;
    await db.insert(whatsappMessages).values({ merchantId: nawab.id, sessionId: s.id, direction: "in", kind: "text", body: hello[k++ % hello.length]!, sender: "guest", createdAt: s.lastInboundAt ?? t(60 + k * 20) });
  }

  // ---- phone calls with something to check: a heard "biryani" (which one?) and a doubtful match ----
  const nihari = dish("Nihari");
  const chickenDum = dish("Hyderabadi Chicken Dum Biryani");
  const goatDum = dish("Hyderabadi Goat Dum Biryani");
  const haleem = dish("Haleem");
  await db.insert(phoneCalls).values([
    {
      merchantId: nawab.id,
      fromPhone: "+14165550177",
      language: "ur",
      transcript: "نہاری دو پلیٹ اور بریانی دو، آٹھ بجے لے لوں گا۔ بریانی چکن والی یا مٹن والی؟",
      draftOrder: { items: [{ catalogItemId: nihari.id, name: nihari.name, quantity: 2 }], pickupAt: new Date(now.getTime() + 90 * MIN).toISOString(), ambiguous: [{ phrase: "biryani", quantity: 2, options: [{ catalogItemId: chickenDum.id, name: chickenDum.name }, { catalogItemId: goatDum.id, name: goatDum.name }] }], unmatched: [] } as never,
      orderId: null,
      status: "drafted",
      providerCallId: "call_demo_0008",
      createdAt: t(18),
    },
    {
      merchantId: nawab.id,
      fromPhone: "+14165550178",
      language: "ur",
      transcript: "ہلیم ایک اور نہاری ایک، ساڑھے سات بجے۔",
      draftOrder: { items: [{ catalogItemId: haleem.id, name: haleem.name, quantity: 1, uncertain: true }, { catalogItemId: nihari.id, name: nihari.name, quantity: 1 }], pickupAt: new Date(now.getTime() + 60 * MIN).toISOString(), unmatched: [], ambiguous: [] } as never,
      orderId: null,
      status: "drafted",
      providerCallId: "call_demo_0009",
      createdAt: t(35),
    },
  ]);

  // ---- festival sends: Diwali for the Hyderabadi house shows a scheduled and a draft ----
  const year = Number(today.slice(0, 4));
  await db.insert(festivalSends).values([
    { merchantId: nawab.id, festivalId: "diwali", year, templateId: "diwali_mithai_preorder", channel: "sms", status: "scheduled", scheduledAt: at(`${year}-10-29`, 10), createdAt: t(120) },
    { merchantId: nawab.id, festivalId: "diwali", year, templateId: "diwali_greeting", channel: "email", status: "draft", scheduledAt: null, createdAt: t(100) },
  ]);
  log("Restaurant desk: cuisines, caps, recipes, tomorrow's pre-orders, wait list, busy history, WhatsApp thread, phone calls");
}
