/**
 * Grocer and halal butcher demo (docs/research/grocers.md), both in the Ridgeway Plaza corridor:
 *
 *   Annapurna Grocers & Spices   a South Asian grocer with a halal meat counter: this week's Diwali flyer, bulk staples with
 *                                restock reminders, butcher pre-orders for today, WhatsApp list orders. Plus plan.
 *   Al-Noor Halal Meats          a halal butcher: pre-orders by weight with deposits, one order waiting for the scale, the Eid
 *                                al-Adha plan (animals per day), a weekly flyer. Plus plan.
 *
 * Business names, phones (555 range) and emails (example.com) are fictional. Points move only through services/ledger.ts
 * (awardPurchase); orders, deals, pantry history and chats are inserted as consistent rows afterwards. Paid features are granted
 * the way pilot shops get them (admin overrides). Deterministic (seeded RNG, dates relative to today) and idempotent (a shop
 * that already exists is left alone). Run after the restaurant corridor: it joins that neighbourhood.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  GROCER_SEASONS,
  portionPriceCents,
  upcomingGrocerSeasons,
  weighedLineCents,
  type FeatureKey,
  type Vertical,
} from "@ll/shared";
import {
  catalogItems,
  featureOverrides,
  groceryDeals,
  merchantCategories,
  merchantStaff,
  merchants,
  neighbourhoods,
  orderItems,
  orders,
  pantryEntries,
  pantryItems,
  pantryReminders,
  subscriptions,
  users,
  whatsappMessages,
  whatsappSessions,
  type Db,
} from "@ll/db";
import type { AppContext } from "../context.js";
import { nextNumber } from "../services/counters.js";
import { awardPurchase, findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";
import { taxableBaseCents } from "../services/orders.js";
import { addDaysKey, localMidnightUtc } from "../services/preorderPlanning.js";
import { computeTax } from "../services/tax.js";
import { CORRIDOR_SLUG } from "./restaurants.js";

const DAY = 86_400_000;
const MIN = 60_000;
const TZ = "America/Toronto";

export const GROCER_SHOPS = [
  { slug: "annapurna-grocers-and-spices", name: "Annapurna Grocers & Spices" },
  { slug: "al-noor-halal-meats", name: "Al-Noor Halal Meats" },
] as const;

/** Demo staff logins: owner + <slug>@example.com, plus one counter person each (PIN 1234). */
export const GROCER_STAFF_LOGINS = [
  { email: "staff+annapurna-grocers-and-spices-counter@example.com", shop: "Annapurna Grocers & Spices", name: "Harjit Singh", locale: "pa" },
  { email: "staff+al-noor-halal-meats-counter@example.com", shop: "Al-Noor Halal Meats", name: "Bilal Raza", locale: "ur" },
] as const;

/** Paid features the demo grocers have the way pilot shops do (hidden for everyone else until an admin turns them on). */
const GROCER_FEATURES: FeatureKey[] = [
  "grocery.flyer",
  "grocery.counter_preorders",
  "grocery.pantry_reminders",
  "grocery.whatsapp_orders",
  "orders.order_ahead",
  "orders.pickup_status",
  "payments.in_app",
  "marketing.sms",
  "marketing.email",
  "promos.basic",
  "customers.csv_export",
  "reports.advanced",
];

const CONSENT = "Yes, text me offers and reminders from this shop. Reply STOP to opt out.";

const week = (open: string, close: string) =>
  Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [[open, close]]])) as Record<string, [string, string][]>;

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), chance: (p: number) => next() < p };
}

interface Cut {
  name: string;
  /** Price per kg in cents (weighed), or the price of one in cents (each). */
  price: number;
  kg?: number;
  taxable?: boolean;
  pre?: { lead: number; dep: number };
  desc?: string;
}
const BUTCHER_ITEMS: Cut[] = [
  { name: "Goat curry cut", price: 1399, kg: 1, taxable: false, pre: { lead: 12, dep: 3000 }, desc: "Bone-in, cut for curry. Halal, zabihah." },
  { name: "Goat leg", price: 1549, kg: 1, taxable: false, pre: { lead: 12, dep: 3000 } },
  { name: "Lamb leg", price: 1699, kg: 1, taxable: false, pre: { lead: 24, dep: 3000 } },
  { name: "Chicken legs", price: 999, kg: 1, taxable: false, pre: { lead: 6, dep: 0 } },
  { name: "Beef mince", price: 1199, kg: 1, taxable: false, pre: { lead: 6, dep: 0 } },
  { name: "Whole goat, qurbani", price: 2400, kg: 20, taxable: false, pre: { lead: 336, dep: 2500 }, desc: "Eid al-Adha. About 20 kg dressed. Cut for curry, in three bags, or whole." },
  { name: "Cow share, qurbani (one of seven)", price: 26000, taxable: false, pre: { lead: 336, dep: 2500 }, desc: "One seventh of a cow. Eid al-Adha." },
  { name: "Aqiqah goat", price: 2400, kg: 20, taxable: false, pre: { lead: 168, dep: 2500 } },
  { name: "Samosa tray (24)", price: 2400, taxable: true, pre: { lead: 24, dep: 0 }, desc: "Frozen, ready to fry." },
];
const STAPLES: { name: string; price: number; pantryDays?: number }[] = [
  { name: "Aashirvaad atta 20 lb", price: 2499, pantryDays: 42 },
  { name: "Basmati rice 20 lb", price: 2799, pantryDays: 56 },
  { name: "Toor dal 8 lb", price: 1799, pantryDays: 35 },
  { name: "Desi ghee 1.6 kg", price: 2499, pantryDays: 49 },
  { name: "Sona masoori rice 20 lb", price: 2399, pantryDays: 56 },
  { name: "Besan 4 lb", price: 799 },
  { name: "Diyas, pack of 12", price: 399 },
];

const PEOPLE: [string, string][] = [
  ["Priya Patel", "en"], ["Harpreet Singh", "pa"], ["Kavitha Selvam", "en"], ["Anil Kumar", "hi"], ["Rafiq Hossain", "en"], ["Zarmina Noori", "ur"],
  ["Jamal Sultani", "ur"], ["Hira Siddiqui", "ur"], ["Simran Kaur", "pa"], ["Gurdeep Sandhu", "pa"], ["Neha Desai", "hi"], ["Kunal Shah", "hi"],
  ["Sunita Sharma", "hi"], ["Rohan Kapoor", "en"], ["Mahesh Rajendran", "en"], ["Fatima Malik", "ur"], ["Usman Raza", "ur"], ["Hamza Butt", "ur"],
  ["Sana Qureshi", "ur"], ["Omar Farooqi", "en"], ["Mariam Sheikh", "ur"], ["Jasleen Gill", "pa"], ["Amandeep Dhillon", "pa"], ["Navjot Brar", "pa"],
  ["Riya Joshi", "hi"], ["Dhruv Trivedi", "hi"], ["Hetal Parikh", "hi"], ["Tanvir Rahman", "en"],
];

type Shop = { id: string; slug: string; name: string; locationId: string; ownerId: string; items: Map<string, { id: string; row: typeof catalogItems.$inferInsert }> };

export async function seedGrocers(db: Db, ctx: AppContext, opts: { ownerPassword: string; staffPin: string; log?: (m: string) => void }): Promise<boolean> {
  const log = opts.log ?? (() => {});
  const [existing] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, GROCER_SHOPS[0].slug)).limit(1);
  if (existing) return false;
  const [hood] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, CORRIDOR_SLUG)).limit(1);
  if (!hood) {
    log("Grocers: the Ridgeway Plaza corridor is not seeded yet, skipping.");
    return false;
  }
  const R = rng(20261026);
  const realNow = new Date();
  const clock = { now: realNow };
  const lctx: AppContext = { ...ctx, now: () => clock.now };
  const ago = (days: number, hourUtc = 16) => {
    const d = new Date(realNow.getTime() - days * DAY);
    d.setUTCHours(hourUtc, R.int(0, 59), 0, 0);
    return d;
  };
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(realNow);
  const ownerHash = await bcrypt.hash(opts.ownerPassword, 10);
  const pinHash = await bcrypt.hash(opts.staffPin, 8);
  const mkUser = async (v: Partial<typeof users.$inferInsert>) => {
    const [u] = await db.insert(users).values({ memberCode: await generateMemberCode(db), createdAt: ago(60), emailVerifiedAt: v.email ? ago(60) : null, ...v }).returning();
    return u!;
  };

  // ---- The two shops ----
  const shops: Shop[] = [];
  const defs = [
    { ...GROCER_SHOPS[0], owner: "Meena Kapoor", unit: 27, phone: "+19055550301", whatsapp: "+19055550201", color: "#C2410C", hours: week("08:00", "21:00"), joined: 55, description: "South Asian groceries, spices and a halal meat counter. Atta, rice, dal and ghee by the bag; fresh goat and chicken cut to order." },
    { ...GROCER_SHOPS[1], owner: "Imtiaz Ahmed", unit: 29, phone: "+19055550302", whatsapp: "+19055550202", color: "#14532D", hours: week("09:00", "20:00"), joined: 48, description: "Halal butcher. Goat, lamb, beef and chicken cut to order. Whole goat and cow shares for Eid al-Adha and aqiqah." },
  ];
  for (const [i, d] of defs.entries()) {
    const owner = await mkUser({ email: `owner+${d.slug}@example.com`, name: d.owner, passwordHash: ownerHash, locale: "en-CA" });
    const signedAt = ago(d.joined, 15);
    clock.now = signedAt;
    const { merchant, location } = await createMerchantWithTemplate(lctx, {
      body: { name: d.name, vertical: "grocery" satisfies Vertical, address: `Ridgeway Plaza, Unit ${d.unit}, 3250 Ridgecrest Blvd`, city: "Mississauga", postalCode: "L5R 3K2", phone: d.phone, neighbourhoodId: hood.id, lat: 43.5943 - i * 0.0002, lng: -79.6437 - i * 0.0004, hours: d.hours },
      ownerUserId: owner.id,
      repUserId: null,
      actorUserId: owner.id,
    });
    await db
      .update(merchants)
      .set({
        slug: d.slug,
        description: d.description,
        brandColor: d.color,
        email: `hello+${d.slug}@example.com`,
        status: "active",
        plan: "plus",
        languages: ["en", "hi", "ur", "pa"],
        whatsappNumber: d.whatsapp,
        createdAt: signedAt,
        stripeAccountId: `acct_demo_${d.slug}`,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        // Qurbani rules: a deposit the shop keeps once it starts sourcing, free cancellation until two weeks before.
        preorderCancelCutoffHours: 336,
        preorderPerHourCap: 6,
      })
      .where(eq(merchants.id, merchant.id));
    await db.insert(subscriptions).values({ merchantId: merchant.id, plan: "plus", status: "active", interval: "month", currentPeriodEnd: new Date(realNow.getTime() + 14 * DAY), createdAt: signedAt });
    await db.insert(featureOverrides).values(GROCER_FEATURES.map((key) => ({ merchantId: merchant.id, key, enabled: true, reason: "Demo grocer (pilot shop)", createdAt: signedAt })));
    shops.push({ id: merchant.id, slug: d.slug, name: d.name, locationId: location.id, ownerId: owner.id, items: new Map() });
    const staff = await mkUser({ email: GROCER_STAFF_LOGINS[i]!.email, name: GROCER_STAFF_LOGINS[i]!.name, passwordHash: ownerHash, locale: `${GROCER_STAFF_LOGINS[i]!.locale}-CA` });
    await db.insert(merchantStaff).values({ merchantId: merchant.id, userId: staff.id, role: "staff", pinHash, locale: GROCER_STAFF_LOGINS[i]!.locale, createdAt: signedAt });
  }
  const [annapurna, alnoor] = shops as [Shop, Shop];

  // ---- Catalog: butcher cuts (both shops), staples (Annapurna) ----
  const cats = async (s: Shop) => new Map((await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, s.id))).map((c) => [c.name, c.id]));
  for (const s of [annapurna, alnoor]) {
    const catId = await cats(s);
    const butcherCat = catId.get("Butcher counter") ?? catId.get("Groceries") ?? null;
    const groceryCat = catId.get("Groceries") ?? null;
    const rows: (typeof catalogItems.$inferInsert)[] = [];
    for (const [k, c] of BUTCHER_ITEMS.entries()) {
      if (s === annapurna && c.name.includes("qurbani")) continue; // the corner grocer sends qurbani to the butcher next door
      if (s === annapurna && c.name === "Aqiqah goat") continue;
      const weighed = c.kg != null;
      const nominal = weighed ? Math.round(c.kg! * 1000) : null;
      rows.push({
        id: randomUUID(),
        merchantId: s.id,
        categoryId: butcherCat,
        name: c.name,
        description: c.desc ?? null,
        priceCents: weighed ? portionPriceCents(c.price, "kg", nominal!) : c.price,
        orderable: true,
        sortOrder: k,
        preorderOnly: c.name.includes("qurbani") || c.name === "Aqiqah goat",
        leadTimeHours: c.pre?.lead ?? 0,
        depositBps: c.pre?.dep ?? 0,
        weightUnit: weighed ? "kg" : null,
        unitPriceCents: weighed ? c.price : null,
        nominalWeightG: nominal,
        taxable: c.taxable ?? true,
        dietary: { halal: true, zabihah: true },
        createdAt: ago(40),
      });
    }
    if (s === annapurna) {
      for (const [k, st] of STAPLES.entries()) {
        rows.push({ id: randomUUID(), merchantId: s.id, categoryId: groceryCat, name: st.name, priceCents: st.price, orderable: true, sortOrder: 20 + k, taxable: st.name.startsWith("Diyas") ? true : false, createdAt: ago(40) });
      }
    }
    await db.insert(catalogItems).values(rows);
    for (const r of rows) s.items.set(r.name!, { id: r.id!, row: r });
  }

  // ---- Members: 28 customers join through the ledger, with visits over the last 8 weeks ----
  const members: { userId: string; phone: string; name: string; locale: string; consent: boolean; annapurnaMemberId: string }[] = [];
  for (const [i, [name, lang]] of PEOPLE.entries()) {
    const phone = `+1905555${String(5000 + i).padStart(4, "0")}`;
    const { user } = await findOrCreateCustomerByPhone(db, phone, name);
    await db.update(users).set({ locale: `${lang}-CA` }).where(eq(users.id, user.id));
    const consent = i % 4 !== 3; // three in four agreed to texts
    let memberId = "";
    const visits = 3 + (i % 6);
    for (let v = 0; v < visits; v++) {
      clock.now = ago(Math.max(1, 56 - v * Math.floor(50 / visits) - (i % 5)), 16 + (v % 3));
      const total = R.int(3800, 16500);
      // Every fourth shop includes something that never earns (a lottery ticket, a bill payment): it is in the total, not in the points.
      const notCounted = v % 4 === 1 ? R.int(500, 2500) : 0;
      const [noEarn] = notCounted ? await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.merchantId, annapurna.id), eq(merchantCategories.earnEligible, false))).limit(1) : [];
      const r = await awardPurchase(lctx, {
        merchantId: annapurna.id,
        phone,
        customerName: name,
        ...(notCounted && noEarn ? { lines: [{ amountCents: total - notCounted }, { amountCents: notCounted, categoryId: noEarn.id }] } : { amountCents: total }),
        source: "staff_app",
        ignoreCooldown: true,
        joinedVia: "qr",
        ...(consent && v === 0 ? { consent: { text: CONSENT, source: "counter_staff" } } : {}),
      });
      memberId = r.member.id;
    }
    members.push({ userId: user.id, phone, name, locale: lang, consent, annapurnaMemberId: memberId });
    // Every third customer also shops the butcher.
    if (i % 3 === 0) {
      for (let v = 0; v < 2; v++) {
        clock.now = ago(10 + v * 17 + (i % 4), 17);
        await awardPurchase(lctx, { merchantId: alnoor.id, phone, customerName: name, amountCents: R.int(3500, 9500), source: "staff_app", ignoreCooldown: true, joinedVia: "qr", ...(consent && v === 0 ? { consent: { text: CONSENT, source: "counter_staff" } } : {}) });
      }
    }
  }
  clock.now = realNow;

  // ---- Weekly flyers ----
  const seasonId = upcomingGrocerSeasons(todayKey, 45).find((x) => GROCER_SEASONS.some((g) => g.id === x.id))?.id ?? null;
  const weekday = (new Date(`${todayKey}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const mon = addDaysKey(todayKey, -weekday);
  const d = (off: number) => addDaysKey(mon, off);
  const deal = (merchantId: string, over: Partial<typeof groceryDeals.$inferInsert>) => ({ merchantId, priceUnit: "each", memberOnly: false, active: true, startsOn: d(0), endsOn: d(6), sortOrder: 0, ...over }) as typeof groceryDeals.$inferInsert;
  await db.insert(groceryDeals).values([
    deal(annapurna.id, { title: "Desi ghee 1.6 kg", priceCents: 2199, wasPriceCents: 2499, packSizeG: 1600, seasonId, sortOrder: 1 }),
    deal(annapurna.id, { title: "Besan 4 lb", priceCents: 649, packSizeG: 1814, memberOnly: true, seasonId, sortOrder: 2 }),
    deal(annapurna.id, { title: "Diyas, pack of 12", priceCents: 299, limitPerCustomer: 3, seasonId, sortOrder: 3, endsOn: d(6) }),
    deal(annapurna.id, { title: "Basmati rice 20 lb", priceCents: 2799, packSizeG: 9072, endsOn: d(2), sortOrder: 4 }),
    deal(annapurna.id, { title: "Goat curry cut", priceCents: 1399, priceUnit: "kg", memberOnly: true, startsOn: d(4), sortOrder: 5, note: "From the halal counter" }),
    deal(annapurna.id, { title: "Okra, fresh", priceCents: 399, priceUnit: "lb", startsOn: d(3), endsOn: d(5), sortOrder: 6 }),
    deal(annapurna.id, { title: "Moong dal 4 lb", priceCents: 899, startsOn: d(-7), endsOn: d(-1), sortOrder: 7 }),
    deal(alnoor.id, { title: "Goat curry cut", priceCents: 1399, priceUnit: "kg", wasPriceCents: 1499, sortOrder: 1 }),
    deal(alnoor.id, { title: "Chicken legs", priceCents: 999, priceUnit: "kg", memberOnly: true, sortOrder: 2 }),
    deal(alnoor.id, { title: "Beef mince", priceCents: 1099, priceUnit: "kg", startsOn: d(4), sortOrder: 3 }),
  ]);

  // ---- Pantry: bulk staples and who asked for restock texts ----
  const pantry = new Map<string, string>();
  for (const st of STAPLES.filter((x) => x.pantryDays)) {
    const [row] = await db.insert(pantryItems).values({ merchantId: annapurna.id, name: st.name, defaultIntervalDays: st.pantryDays!, catalogItemId: annapurna.items.get(st.name)?.id ?? null, createdAt: ago(40) }).returning({ id: pantryItems.id });
    pantry.set(st.name, row!.id);
  }
  const staples = STAPLES.filter((x) => x.pantryDays);
  const sentEntries: string[] = [];
  for (const [i, m] of members.entries()) {
    if (i >= 18) break;
    const st = staples[i % staples.length]!;
    const interval = st.pantryDays! + (i % 3 === 0 ? -7 : i % 3 === 1 ? 0 : 7);
    // Three purchases at about the household's own gap; the last one lands so some are due this week, some soon, some already texted.
    const offsets = [4, 1, -2, 9, 12, -6, 3, 14, 7, 20, 2, 11, -4, 6, 16, 5, 10, 18]; // days until the household runs out
    const left = offsets[i]!;
    const last = new Date(realNow.getTime() - (interval - left) * DAY);
    const history = [new Date(last.getTime() - 2 * interval * DAY), new Date(last.getTime() - interval * DAY), last].map((x) => x.toISOString());
    const remind = m.consent && i % 5 !== 4;
    const alreadyTexted = remind && left <= -2;
    const [e] = await db
      .insert(pantryEntries)
      .values({
        merchantId: annapurna.id,
        pantryItemId: pantry.get(st.name)!,
        userId: m.userId,
        history,
        lastBoughtAt: last,
        intervalDays: interval,
        remind,
        remindConsentAt: remind ? new Date(last.getTime() - 2 * interval * DAY) : null,
        remindConsentSource: remind ? "counter" : null,
        remindConsentBy: remind ? annapurna.ownerId : null,
        lastRemindedAt: alreadyTexted ? new Date(last.getTime() + (interval - 5) * DAY) : null,
        createdAt: new Date(last.getTime() - 2 * interval * DAY),
      })
      .returning({ id: pantryEntries.id });
    if (alreadyTexted) sentEntries.push(e!.id);
  }
  // Last month: a few texts went out and some households came back within the week (history shows the later purchase).
  for (const [k, id] of sentEntries.entries()) await db.insert(pantryReminders).values({ merchantId: annapurna.id, entryId: id, sentAt: ago(6 + k * 3, 15) });

  // ---- Butcher orders: today's pre-orders at Al-Noor (and one at Annapurna), a waiting weigh-in, the Eid plan ----
  const placeOrder = async (s: Shop, who: (typeof members)[number], pickupAt: Date, lines: { name: string; qty: number; grams?: number }[], mode: "deposit" | "unpaid" | "paid", channel: "whatsapp" | "phone" | "web") => {
    const priced = lines.map((l) => {
      const it = s.items.get(l.name)!.row;
      const weighed = it.weightUnit && it.unitPriceCents ? l.grams != null : false;
      const line = it.unitPriceCents && it.weightUnit ? (l.grams != null ? weighedLineCents(it.unitPriceCents, "kg", l.grams) : it.priceCents! * l.qty) : it.priceCents! * l.qty;
      return { l, it, weighed, cents: line };
    });
    const subtotal = priced.reduce((x, p) => x + p.cents, 0);
    const tax = computeTax(taxableBaseCents(priced.map((p) => ({ lineTotalCents: p.cents, taxable: p.it.taxable ?? true })), 0), "ON");
    const total = subtotal + tax.taxCents;
    const dep = mode === "deposit" ? Math.round(total * 0.3) : 0;
    const number = await nextNumber(db, s.id, "order");
    const [o] = await db
      .insert(orders)
      .values({
        merchantId: s.id,
        locationId: s.locationId,
        userId: who.userId,
        number,
        status: "accepted",
        pickupAt,
        subtotalCents: subtotal,
        taxCents: tax.taxCents,
        totalCents: total,
        paymentMethod: mode === "unpaid" ? "at_pickup" : "in_app",
        paymentStatus: mode === "paid" ? "paid" : mode === "deposit" ? "authorized" : "unpaid",
        paidAt: mode === "paid" ? pickupAt : null,
        kind: "preorder",
        channel,
        depositCents: dep,
        depositPaidAt: mode === "deposit" ? new Date(realNow.getTime() - 2 * DAY) : null,
        weighedAt: priced.some((p) => p.weighed) ? new Date(realNow.getTime() - 30 * MIN) : null,
        createdAt: new Date(realNow.getTime() - 3 * DAY),
      })
      .returning({ id: orders.id });
    await db.insert(orderItems).values(
      priced.map((p) => ({
        orderId: o!.id,
        catalogItemId: s.items.get(p.l.name)!.id,
        name: p.l.name,
        quantity: p.l.qty,
        unitPriceCents: p.it.priceCents!,
        categoryId: p.it.categoryId ?? null,
        weightUnit: p.it.weightUnit ?? null,
        perUnitCents: p.it.unitPriceCents ?? null,
        actualWeightG: p.weighed ? p.l.grams! : null,
        weighedCents: p.weighed ? p.cents : null,
        taxable: p.it.taxable ?? true,
      })),
    );
    return o!.id;
  };
  const at = (hour: number, minute = 0) => new Date(localMidnightUtc(todayKey, TZ).getTime() + (hour * 60 + minute) * MIN);
  const by = (name: string) => members.find((m) => m.name === name)!;
  await placeOrder(alnoor, by("Hira Siddiqui"), at(10), [{ name: "Goat leg", qty: 3 }, { name: "Chicken legs", qty: 2 }], "deposit", "whatsapp");
  await placeOrder(alnoor, by("Rafiq Hossain"), at(11, 30), [{ name: "Goat curry cut", qty: 2, grams: 2140 }], "deposit", "phone");
  await placeOrder(alnoor, by("Zarmina Noori"), at(12), [{ name: "Lamb leg", qty: 2 }, { name: "Beef mince", qty: 1 }], "paid", "web");
  await placeOrder(alnoor, by("Jamal Sultani"), at(16, 30), [{ name: "Goat leg", qty: 2 }], "deposit", "phone");
  await placeOrder(alnoor, by("Hamza Butt"), new Date(at(11, 0).getTime() + DAY), [{ name: "Goat curry cut", qty: 4 }, { name: "Samosa tray (24)", qty: 1 }], "deposit", "whatsapp");
  await placeOrder(annapurna, by("Priya Patel"), at(17), [{ name: "Goat curry cut", qty: 2, grams: 2140 }], "unpaid", "whatsapp");
  await placeOrder(annapurna, by("Anil Kumar"), new Date(at(15).getTime() + DAY), [{ name: "Chicken legs", qty: 3 }], "unpaid", "phone");

  // Eid al-Adha plan (rules the restaurant pre-order engine already enforces): the next Eid, three pick-up days, two weeks' notice.
  const eid = upcomingGrocerSeasons(todayKey, 400).find((x) => x.id === "eid_al_adha");
  if (eid) {
    const day = (n: number, cap: number) => ({ from: addDaysKey(eid.start, n), to: addDaysKey(eid.start, n), cap, leadHours: 336, label: `Eid al-Adha day ${n + 1}` });
    await db.update(merchants).set({ preorderOverrides: [day(0, 24), day(1, 18), day(2, 10)] }).where(eq(merchants.id, alnoor.id));
    await db.update(merchants).set({ preorderOverrides: [day(0, 6), day(1, 4), day(2, 2)] }).where(eq(merchants.id, annapurna.id));
  }

  // ---- WhatsApp list orders in the inbox (the shop answers inside the 24 hour window) ----
  const chats: [Shop, string, string, number, string][] = [
    [alnoor, "Rafiq Hossain", "Salaam, 2 kg goat curry cut and 1 atta 20 lb for tomorrow 5pm please", 2, "en"],
    [alnoor, "Zarmina Noori", "Do you have lamb leg for Friday?", 60, "ur"],
    [alnoor, "Hamza Butt", "Qurbani booking for May? How many days before do I need to pay?", 26 * 60, "ur"],
    [annapurna, "Priya Patel", "Hi, 2 kg chicken legs and the 20 lb atta for Saturday morning", 14, "en"],
  ];
  for (const [s, name, text, minutesAgo, lang] of chats) {
    const m = by(name);
    const t = new Date(realNow.getTime() - minutesAgo * MIN);
    const [sess] = await db.insert(whatsappSessions).values({ merchantId: s.id, phone: m.phone, userId: m.userId, state: "browsing", language: lang, cart: [], lastInboundAt: t, marketingOptInAt: m.consent ? ago(30) : null, createdAt: t, updatedAt: t }).returning({ id: whatsappSessions.id });
    await db.insert(whatsappMessages).values({ merchantId: s.id, sessionId: sess!.id, direction: "in", kind: "text", body: text, sender: "guest", createdAt: t });
  }

  log(`Grocers: ${shops.length} shops in Ridgeway Plaza (${members.length} members, flyers, pantry reminders, butcher pre-orders, Eid plan)`);
  return true;
}
