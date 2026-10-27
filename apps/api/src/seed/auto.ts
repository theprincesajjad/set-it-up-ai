/**
 * Auto care demo (docs/research/auto-care.md), both in Ridgeway Plaza, Mississauga:
 *
 *   Splash Auto Wash       a car wash with unlimited plans (Quick, Shine, Family) on the membership engine, a 10-wash punch card, one
 *                          plan frozen and one with a failed card, plates on four cars and a month of wash check-ins (one member
 *                          who has stopped coming).
 *   Wheelhouse Tire & Auto  a garage and tire shop: cars under the customers with odometer readings and a service log (some due, some
 *                          overdue, a ride-hail car on severe intervals), a tire hotel with racks and tread, swap bookings (one day
 *                          full), and four vehicle tickets: an estimate sent, one approved by link and in progress, one ready with an
 *                          invoice 3.6% over its estimate, one just checked in.
 *
 * The demo customer (+16475551000) has a Civic in both. Idempotent: a shop that already exists is left alone. Customers are fictional
 * (+1416555 06xx). Logins use the shared demo password.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import {
  autoSettings, classCharges, classMemberships, classPasses, classProducts, featureOverrides, invoices, locations, merchantStaff, merchants, neighbourhoods, quotes, serviceTickets, ticketEvents, tireSets, tireSwaps, users, vehicleReadings, vehicleServices, vehicles, washVisits,
  type Db, type LineItem,
} from "@ll/db";
import { normalizePlate, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../context.js";
import { randomToken } from "../lib/crypto.js";
import { nextNumber } from "../services/counters.js";
import { addDays } from "../services/bookings.js";
import { localDate } from "../services/messaging.js";
import { ensureMember, findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";

const DAY = 86_400_000;
const TZ = "America/Toronto";
const CONSENT = { text: "Yes, text me about my car from this shop. Reply STOP to opt out.", source: "demo_seed" };

interface Def {
  slug: string;
  name: string;
  vertical: "car_wash" | "repair_auto";
  unit: string;
  phone: string;
  lat: number;
  lng: number;
  description: string;
  brand: string;
  owner: { email: string; name: string };
  features: FeatureKey[];
}
const week = (open: string, close: string, sun: [string, string] | null) => ({ mon: [[open, close]], tue: [[open, close]], wed: [[open, close]], thu: [[open, close]], fri: [[open, close]], sat: [[open, close]], sun: sun ? [sun] : [] }) as Record<string, [string, string][]>;

const SPLASH: Def = {
  slug: "splash-auto-wash",
  name: "Splash Auto Wash",
  vertical: "car_wash",
  unit: "Ridgeway Plaza, Unit 9, 3250 Ridgecrest Blvd",
  phone: "+19055553009",
  lat: 43.5955,
  lng: -79.6462,
  description: "Tunnel wash with unlimited monthly plans and a punch card. Drive in, we read your plate or scan your phone.",
  brand: "#0E7490",
  owner: { email: "owner+splash-auto-wash@example.com", name: "Harpreet Sidhu" },
  features: ["auto.vehicles", "auto.wash", "booking.classes", "memberships.recurring", "payments.in_app", "marketing.sms"],
};
const WHEELHOUSE: Def = {
  slug: "wheelhouse-tire-and-auto",
  name: "Wheelhouse Tire & Auto",
  vertical: "repair_auto",
  unit: "Ridgeway Plaza, Unit 11, 3250 Ridgecrest Blvd",
  phone: "+19055553011",
  lat: 43.5953,
  lng: -79.6464,
  description: "Independent garage and tire shop. Written estimates, honest prices, tire storage and seasonal swaps.",
  brand: "#9A3412",
  owner: { email: "owner+wheelhouse-tire-and-auto@example.com", name: "Mike Dimitriou" },
  features: ["auto.vehicles", "auto.tires", "service.tickets", "service.quote_approval", "service.deposits", "service.invoices", "payments.in_app", "marketing.sms"],
};
export const AUTO_LOGINS = [SPLASH, WHEELHOUSE].map((d) => ({ email: d.owner.email, role: "owner", shop: d.name, name: d.owner.name }));

interface Owner { name: string; phone: string; locale: "en" | "hi" | "ur" | "pa"; consent: boolean }
const OWNERS: Owner[] = [
  { name: "Demo Customer", phone: "+16475551000", locale: "en", consent: true },
  { name: "Maya Chen", phone: "+14165550601", locale: "en", consent: true },
  { name: "Dev Patel", phone: "+14165550602", locale: "en", consent: true },
  { name: "Aisha Rahman", phone: "+14165550603", locale: "ur", consent: true },
  { name: "Tom Brown", phone: "+14165550604", locale: "en", consent: false },
  { name: "Lina Gomez", phone: "+14165550605", locale: "en", consent: true },
  { name: "Gurpreet Gill", phone: "+14165550606", locale: "pa", consent: true },
  { name: "Sara Haddad", phone: "+14165550607", locale: "en", consent: true },
];
interface CarDef { owner: number; year: number; make: string; model: string; plate: string | null; use?: "personal" | "rideshare" }
const CARS: CarDef[] = [
  { owner: 0, year: 2019, make: "Honda", model: "Civic", plate: "BXTR 481" },
  { owner: 1, year: 2018, make: "Mazda", model: "Mazda3", plate: "CKLM 220" },
  { owner: 2, year: 2016, make: "Toyota", model: "Camry", plate: "CGTP 927", use: "rideshare" },
  { owner: 3, year: 2021, make: "Kia", model: "Sportage", plate: "BYZK 305" },
  { owner: 4, year: 2012, make: "Ford", model: "Escape", plate: null },
  { owner: 5, year: 2017, make: "Hyundai", model: "Elantra", plate: null },
  { owner: 6, year: 2020, make: "Toyota", model: "RAV4", plate: "CMNP 118", use: "rideshare" },
  { owner: 7, year: 2015, make: "Honda", model: "CR-V", plate: null },
];

async function createShop(db: Db, ctx: AppContext, def: Def, hash: string, hoodId: string, log: (m: string) => void): Promise<typeof merchants.$inferSelect> {
  const [have] = await db.select().from(merchants).where(eq(merchants.slug, def.slug)).limit(1);
  if (have) return have;
  const [owner] = await db.insert(users).values({ email: def.owner.email, name: def.owner.name, passwordHash: hash, memberCode: await generateMemberCode(db), locale: "en-CA", emailVerifiedAt: new Date() }).onConflictDoNothing().returning();
  const ownerId = owner?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, def.owner.email)).limit(1))[0]!.id;
  const created = await createMerchantWithTemplate(ctx, {
    body: { name: def.name, vertical: def.vertical, address: def.unit, city: "Mississauga", postalCode: "L5R 3K2", phone: def.phone, neighbourhoodId: hoodId, lat: def.lat, lng: def.lng, hours: week("08:00", "19:00", ["09:00", "17:00"]) } as never,
    ownerUserId: ownerId,
    repUserId: null,
    actorUserId: ownerId,
  });
  await db.update(merchants).set({ slug: def.slug, description: def.description, brandColor: def.brand, email: `hello+${def.slug}@example.com`, status: "active", stripeAccountId: `acct_demo_${def.slug}`, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true }).where(eq(merchants.id, created.merchant.id));
  await db.insert(featureOverrides).values(def.features.map((key) => ({ merchantId: created.merchant.id, key, enabled: true, reason: "Demo auto care shop" }))).onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
  log(`Auto: created ${def.name}`);
  return (await db.select().from(merchants).where(eq(merchants.id, created.merchant.id)).limit(1))[0]!;
}

interface Ctx {
  db: Db;
  ctx: AppContext;
  now: Date;
  today: string;
  owners: { id: string; name: string }[];
  cars: { id: string; userId: string }[];
}

async function joinAll(c: Ctx, shop: typeof merchants.$inferSelect): Promise<void> {
  const [loc] = await c.db.select().from(locations).where(and(eq(locations.merchantId, shop.id), eq(locations.active, true))).limit(1);
  for (let i = 0; i < c.owners.length; i++) {
    await c.db.transaction((tx) => ensureMember(c.ctx, tx, { merchantId: shop.id, userId: c.owners[i]!.id, joinedVia: "phone", locationId: loc?.id ?? null, consent: OWNERS[i]!.consent ? CONSENT : null, source: "staff_app" }));
  }
}

const ago = (c: Ctx, days: number) => addDays(c.today, -days);

// ---------------------------------------------------------------- the wash
async function seedWash(c: Ctx, shop: typeof merchants.$inferSelect, log: (m: string) => void): Promise<void> {
  const [done] = await c.db.select({ id: classProducts.id }).from(classProducts).where(eq(classProducts.merchantId, shop.id)).limit(1);
  if (done) return;
  await joinAll(c, shop);
  await c.db.insert(autoSettings).values({ merchantId: shop.id, washMaxPerDay: 1 }).onConflictDoNothing();
  const prod = async (v: Omit<typeof classProducts.$inferInsert, "merchantId">) => (await c.db.insert(classProducts).values({ merchantId: shop.id, ...v }).returning())[0]!;
  const quick = await prod({ kind: "membership", name: "Quick Wash", description: "Unlimited exterior washes, one a day.", priceCents: 1950, sort: 0 });
  const shine = await prod({ kind: "membership", name: "Shine", description: "Unlimited washes with wax and wheel shine, one a day.", priceCents: 2999, sort: 1 });
  const family = await prod({ kind: "membership", name: "Family, 2 cars", description: "Unlimited Shine washes for two cars.", priceCents: 4499, sort: 2 });
  const punch = await prod({ kind: "pack", name: "10-wash punch card", description: "Buy 9, the 10th is free. Good for a year.", priceCents: 17550, credits: 10, validDays: 365, sort: 3 });
  const tax = (cents: number) => Math.round(cents * 0.13);
  const memberRow = async (owner: number, p: typeof quick, daysAgo: number, over: Partial<typeof classMemberships.$inferInsert> = {}) => {
    const userId = c.owners[owner]!.id;
    const start = ago(c, daysAgo);
    const months = Math.floor(daysAgo / 30);
    const periodStart = addDays(start, months * 30);
    const periodEnd = addDays(periodStart, 29);
    const [r] = await c.db
      .insert(classMemberships)
      .values({
        merchantId: shop.id, userId, productId: p.id, name: p.name, status: "active", priceCents: p.priceCents, taxable: true, startDate: start,
        currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, nextBillingDate: addDays(periodEnd, 1),
        stripeCustomerId: `cus_demo_wash_${owner}`, paymentMethodId: "pm_fake_visa_4242", paymentMethodBrand: "visa", paymentMethodLast4: "4242",
        agreementText: `MEMBERSHIP AGREEMENT\nBusiness: ${shop.name}\nPlan: ${p.name}\nPrice: $${(p.priceCents / 100).toFixed(2)} + HST each month.\nWhat you get: unlimited washes, one a day.\nCancelling: full refund within 10 days; after that cancel any time in the app and the month you paid stays usable.`,
        agreementAcceptedAt: new Date(c.now.getTime() - daysAgo * DAY), coolingOffEndsOn: addDays(start, 10), createdAt: new Date(c.now.getTime() - daysAgo * DAY), updatedAt: c.now, ...over,
      })
      .returning();
    const failed = over.status === "past_due";
    await c.db.insert(classCharges).values({ merchantId: shop.id, userId, kind: "membership", membershipId: r!.id, periodStart, periodEnd, amountCents: p.priceCents + tax(p.priceCents), taxCents: tax(p.priceCents), platformFeeCents: Math.round(p.priceCents / 100), status: failed ? "failed" : "paid", paymentMethod: "card", paidAt: failed ? null : new Date(c.now.getTime() - (daysAgo - months * 30) * DAY), attempts: failed ? 1 : 0, lastAttemptOn: failed ? c.today : null, createdAt: new Date(c.now.getTime() - (daysAgo - months * 30) * DAY) }).onConflictDoNothing();
    return r!;
  };
  const demo = await memberRow(0, shine, 40);
  const maya = await memberRow(1, quick, 75);
  const dev = await memberRow(2, shine, 130);
  const aisha = await memberRow(3, family, 20);
  await memberRow(4, quick, 33, { status: "past_due" });
  await memberRow(5, shine, 60, { status: "frozen", frozenFrom: ago(c, 3), frozenUntil: addDays(c.today, 11), freezesUsed: 1 });
  const gurpreet = await memberRow(6, quick, 12);
  // A punch card with 6 of 10 left.
  const [pass] = await c.db.insert(classPasses).values({ merchantId: shop.id, userId: c.owners[7]!.id, productId: punch.id, name: punch.name, creditsTotal: 10, creditsLeft: 6, expiresAt: new Date(c.now.getTime() + 300 * DAY), status: "active", createdAt: new Date(c.now.getTime() - 60 * DAY) }).returning();
  // Wash check-ins over the last 30 days: Dev comes all the time, the demo customer weekly, Maya has nearly stopped.
  const visit = async (owner: number, daysAgo: number, kind: "member" | "punch", membershipId: string | null, source: string) => {
    const userId = c.owners[owner]!.id;
    const car = c.cars.find((x) => x.userId === userId);
    await c.db.insert(washVisits).values({ merchantId: shop.id, userId, vehicleId: car?.id ?? null, kind, membershipId, passId: kind === "punch" ? pass!.id : null, source, day: ago(c, daysAgo), at: new Date(c.now.getTime() - daysAgo * DAY - 3 * 3_600_000) });
  };
  for (const d of [1, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27]) await visit(2, d, "member", dev.id, d % 2 ? "plate" : "qr");
  for (const d of [2, 9, 16, 23, 28, 5]) await visit(0, d, "member", demo.id, "plate");
  for (const d of [3, 11, 19, 26, 15]) await visit(3, d, "member", aisha.id, "phone");
  for (const d of [6, 21]) await visit(1, d, "member", maya.id, "plate");
  await visit(6, 4, "member", gurpreet.id, "qr");
  for (const d of [60, 45, 30, 14]) await visit(7, d, "punch", null, "phone");
  log(`Auto: ${shop.name}: 4 products, 7 plans (one frozen, one failed card), a punch card, ${14 + 6 + 5 + 2 + 1 + 4} check-ins`);
}

// ---------------------------------------------------------------- the garage
const HST = 0.13;
async function seedGarage(c: Ctx, shop: typeof merchants.$inferSelect, log: (m: string) => void): Promise<void> {
  const [have] = await c.db.select({ id: autoSettings.merchantId }).from(autoSettings).where(eq(autoSettings.merchantId, shop.id)).limit(1);
  if (have) return;
  await joinAll(c, shop);
  // One bay, four hours, an hour a swap: four swaps a day, so a demo day fills.
  await c.db.insert(autoSettings).values({ merchantId: shop.id, bays: 1, hoursPerDay: 4, minutesPerSwap: 60, autoReminders: false });
  const ownerId = (await c.db.select({ id: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, shop.id), eq(merchantStaff.role, "owner"))).limit(1))[0]?.id ?? null;
  const [loc] = await c.db.select().from(locations).where(and(eq(locations.merchantId, shop.id), eq(locations.active, true))).limit(1);

  // Odometer readings and service logs (days ago, km).
  const reading = (car: number, daysAgo: number, km: number, source = "staff") => c.db.insert(vehicleReadings).values({ vehicleId: c.cars[car]!.id, merchantId: shop.id, km, day: ago(c, daysAgo), source });
  const done = (car: number, key: string, daysAgo: number, km: number | null) => c.db.insert(vehicleServices).values({ vehicleId: c.cars[car]!.id, merchantId: shop.id, serviceKey: key, doneOn: ago(c, daysAgo), km });
  // Demo Civic: ~43 km a day, oil 80 days ago.
  await reading(0, 80, 78200); await reading(0, 2, 81600); await done(0, "oil", 80, 78200); await done(0, "rotation", 80, 78200);
  // Maya's Mazda: oil about six months ago, so the months date is days away.
  await reading(1, 170, 61000); await reading(1, 20, 66800); await done(1, "oil", 170, 61000); await done(1, "brakes", 120, 63000);
  // Dev's ride-hail Camry: 170 km a day on severe intervals, the km date has passed.
  await reading(2, 40, 120000); await reading(2, 1, 126800); await done(2, "oil", 40, 120000); await done(2, "brakes", 200, 108000);
  // Aisha's Sportage: brake inspection a year and a bit ago.
  await reading(3, 90, 30100); await reading(3, 5, 33900); await done(3, "oil", 30, 33000); await done(3, "brakes", 400, 12000);
  // Tom: oil overdue by months, no consent to text.
  await reading(4, 230, 140000); await reading(4, 60, 143200); await done(4, "oil", 220, 140500);
  await reading(5, 60, 82000); await reading(5, 8, 83400); await done(5, "oil", 60, 82000);
  await reading(6, 25, 88000); await reading(6, 2, 92000); await done(6, "oil", 20, 88800);
  await reading(7, 10, 150500, "owner");
  const tm = (n: number) => Math.round(n * 10);
  // Tire hotel.
  const set = (owner: number, rack: string, season: string, label: string, tread: number, daysAgo: number, status = "stored") =>
    c.db.insert(tireSets).values({ merchantId: shop.id, userId: c.owners[owner]!.id, vehicleId: c.cars[owner]!.id, rack, season, label, treadTenthsMm: tm(tread), storedOn: ago(c, daysAgo), status, pickedUpOn: status === "picked_up" ? ago(c, 5) : null });
  await set(0, "B-14", "summer", "Michelin Primacy 215/55R16", 6.5, 200);
  await set(1, "A-03", "winter", "Bridgestone Blizzak 205/55R16", 3.0, 330);
  await set(3, "C-22", "summer", "Continental 225/60R17", 5.0, 190);
  await set(4, "B-07", "winter", "Toyo Observe 225/65R17", 2.4, 560);
  await set(2, "E-01", "all_weather", "Michelin CrossClimate 215/55R17", 5.5, 120);
  await set(6, "D-11", "winter", "Nokian Hakkapeliitta 225/65R17", 7.0, 150);
  await set(7, "C-05", "summer", "Goodyear Assurance 235/65R17", 4.1, 220);
  await set(5, "A-09", "winter", "Michelin X-Ice 205/55R16", 6.0, 380, "picked_up");
  // Swap bookings: tomorrow is full (4 of 4), the day after has 3, a few days on has 1.
  const swap = (owner: number, plusDays: number) => c.db.insert(tireSwaps).values({ merchantId: shop.id, userId: c.owners[owner]!.id, vehicleId: c.cars[owner]!.id, day: addDays(c.today, plusDays), source: "customer" });
  for (const o of [1, 2, 3, 6]) await swap(o, 1);
  for (const o of [4, 5, 7]) await swap(o, 2);
  await swap(1, 5);

  // Tickets with written estimates.
  const line = (description: string, kind: LineItem["kind"], unitPriceCents: number, quantity = 1, condition: LineItem["condition"] = null): LineItem => ({ description, quantity, unitPriceCents, kind, categoryId: null, ...(condition ? { condition } : {}) });
  const totals = (lines: LineItem[]) => {
    const subtotalCents = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    const taxCents = Math.round(subtotalCents * HST);
    return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
  };
  const ticket = async (owner: number, status: typeof serviceTickets.$inferInsert.status, issue: string, mileage: string, daysAgo: number, promisedPlusHours: number | null, checklist: string[] = []) => {
    const car = CARS[owner]!;
    const number = await nextNumber(c.db, shop.id, "ticket");
    const at = new Date(c.now.getTime() - daysAgo * DAY);
    const [t] = await c.db
      .insert(serviceTickets)
      .values({ merchantId: shop.id, locationId: loc?.id ?? null, userId: c.owners[owner]!.id, number, itemKind: "vehicle", itemDetails: { year: String(car.year), make: car.make, model: car.model, ...(car.plate ? { plate: car.plate } : {}), mileage, vehicleId: c.cars[owner]!.id }, issue, status, promisedAt: promisedPlusHours == null ? null : new Date(c.now.getTime() + promisedPlusHours * 3_600_000), intakeChecklist: checklist, statusToken: randomToken(18), assignedStaffId: ownerId, createdAt: at, updatedAt: at, ...(status === "ready" ? { readyAt: new Date(c.now.getTime() - 2 * 3_600_000) } : {}) })
      .returning();
    await c.db.insert(ticketEvents).values({ ticketId: t!.id, status: "intake", note: "Checked in", visibleToCustomer: true, actorUserId: ownerId, createdAt: at });
    return t!;
  };
  const quote = async (t: typeof serviceTickets.$inferSelect, lines: LineItem[], status: "sent" | "approved", how: "link" | "phone" | null, who: string, sentHoursAgo: number, phone: string | null = null) => {
    const sentAt = new Date(c.now.getTime() - sentHoursAgo * 3_600_000);
    const tot = totals(lines);
    const [q] = await c.db
      .insert(quotes)
      .values({
        ticketId: t.id, merchantId: shop.id, lineItems: lines, diagnosis: null, ...tot, depositCents: 0, status, approvalToken: randomToken(24), sentAt, expiresAt: new Date(sentAt.getTime() + 3 * DAY), createdAt: sentAt,
        ...(status === "approved" ? { respondedAt: new Date(sentAt.getTime() + 40 * 60_000), signatureName: how === "link" ? who : null, authorizedBy: { method: how!, name: who, ...(how === "phone" ? { phone } : {}), at: new Date(sentAt.getTime() + 40 * 60_000).toISOString() } } : {}),
      })
      .returning();
    await c.db.insert(ticketEvents).values({ ticketId: t.id, status: status === "sent" ? "quote_sent" : "approved", note: `Estimate ${status === "sent" ? "sent" : "approved"}: $${(tot.totalCents / 100).toFixed(2)}`, visibleToCustomer: true, actorUserId: ownerId, createdAt: sentAt });
    return q!;
  };
  // 1. The demo customer's Civic: an estimate sent, waiting for the customer (open /q/<token> to approve it).
  const t1 = await ticket(0, "quote_sent", "Oil change and cabin filter", "81,640", 0, 6, ["Warning lights on", "Valuables removed"]);
  await quote(t1, [line("Oil and filter, 0W-20 synthetic", "part", 7400, 1, "new"), line("Cabin air filter", "part", 3200, 1, "new"), line("Labour, oil service", "labour", 6500), line("Shop supplies and disposal", "fee", 800)], "sent", null, "", 1);
  await c.db.update(serviceTickets).set({ status: "quote_sent" }).where(eq(serviceTickets.id, t1.id));
  // 2. Maya's Mazda: approved by link, in progress.
  const t2 = await ticket(1, "in_progress", "Oil change", "66,820", 0, 4);
  await quote(t2, [line("Oil and filter, 0W-20 synthetic", "part", 7400, 1, "new"), line("Labour, oil service", "labour", 6500)], "approved", "link", "Maya Chen", 3);
  // 3. Aisha's Sportage: brakes approved by phone, ready, invoice open and 3.6% over the estimate.
  const t3 = await ticket(3, "ready", "Front brakes squeal", "33,910", 1, -2, ["Existing dents or scratches", "Fuel level noted"]);
  await c.db.update(serviceTickets).set({ itemDetails: { ...t3.itemDetails, mileageOut: "33,918", partsReturn: "offered" } }).where(eq(serviceTickets.id, t3.id));
  const q3 = await quote(t3, [line("Front pads and rotors", "part", 38000, 1, "new"), line("Labour, front brakes", "labour", 8500, 2)], "approved", "phone", "Aisha Rahman", 26, OWNERS[3]!.phone);
  const invLines = [line("Front pads and rotors", "part", 38000, 1, "new"), line("Labour, front brakes", "labour", 8500, 2), line("Shop supplies", "fee", 2000)];
  const it = totals(invLines);
  await c.db.insert(invoices).values({ merchantId: shop.id, userId: c.owners[3]!.id, ticketId: t3.id, number: await nextNumber(c.db, shop.id, "invoice"), lineItems: invLines, ...it, depositAppliedCents: 0, amountDueCents: it.totalCents, status: "open", payToken: randomToken(24), createdAt: new Date(c.now.getTime() - 2 * 3_600_000) });
  void q3;
  // 4. Tom's Escape: just checked in, no estimate yet.
  await ticket(4, "intake", "Check engine light on", "143,420", 0, 24, ["Warning lights on", "Spare key left"]);
  log(`Auto: ${shop.name}: 8 cars with readings, ${8} tire sets, 8 swaps (tomorrow full), 4 vehicle tickets`);
}

/** Seed the two demo auto care shops (each only once). Needs the Ridgeway Plaza corridor. */
export async function seedAuto(db: Db, ctx: AppContext, opts: { ownerPassword: string; log?: (m: string) => void }): Promise<{ shops: number }> {
  const log = opts.log ?? (() => {});
  const [hood] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, "ridgeway-plaza")).limit(1);
  if (!hood) {
    log("Auto: skipped (the Ridgeway Plaza corridor is not seeded)");
    return { shops: 0 };
  }
  const hash = await bcrypt.hash(opts.ownerPassword, 10);
  const splash = await createShop(db, ctx, SPLASH, hash, hood.id, log);
  const garage = await createShop(db, ctx, WHEELHOUSE, hash, hood.id, log);
  const owners: { id: string; name: string }[] = [];
  for (const o of OWNERS) {
    const { user } = await findOrCreateCustomerByPhone(db, o.phone, o.name);
    if (user.locale !== o.locale) await db.update(users).set({ locale: o.locale }).where(eq(users.id, user.id));
    owners.push({ id: user.id, name: o.name });
  }
  const cars: { id: string; userId: string }[] = [];
  for (const car of CARS) {
    const uid = owners[car.owner]!.id;
    const [have] = await db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.userId, uid), eq(vehicles.make, car.make), eq(vehicles.model, car.model))).limit(1);
    const id = have?.id ?? (await db.insert(vehicles).values({ userId: uid, year: car.year, make: car.make, model: car.model, use: car.use ?? "personal", plate: car.plate, plateNorm: normalizePlate(car.plate) }).returning({ id: vehicles.id }))[0]!.id;
    cars.push({ id, userId: uid });
  }
  const now = new Date();
  const c: Ctx = { db, ctx, now, today: localDate(now, TZ), owners, cars };
  await seedWash(c, splash, log);
  await seedGarage(c, garage, log);
  return { shops: 2 };
}
