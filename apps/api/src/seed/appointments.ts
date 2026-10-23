/**
 * Appointment demo data for two salons, so the calendar, the services page and the booking flow show real
 * things (docs/research/service-businesses.md, Figma frame 3 and M1/M2):
 *
 *   Bloom Hair Studio       Roncesvalles (the existing demo salon): three stylists, six services, a busy
 *                           day today and tomorrow, last week's finished visits with invoices and points.
 *   Rangrez Beauty Studio   Ridgeway Plaza (the existing corridor salon): threading, henna and bridal
 *                           makeup in Hindi, Urdu and Punjabi, walk-ins, and a bridal party on one group.
 *
 * Idempotent: a shop that already has services is left alone. Customers are fictional (+1416555 03xx).
 * Visits are laid out relative to "now" so the day view always has something booked, in the chair and done.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { FeatureKey } from "@ll/shared";
import { appointments, featureOverrides, locations, merchantCategories, merchantStaff, merchants, services, staffHours, staffServices, users, type AppointmentItemRow, type Db } from "@ll/db";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { checkout } from "../services/appointments-checkout.js";
import { localParts } from "../services/appointments.js";
import { addDays, zonedToUtc } from "../services/bookings.js";
import { findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";

const MIN = 60_000;
const SHOPS = ["bloom-hair-studio", "rangrez-beauty-studio"] as const;
const FEATURES: FeatureKey[] = ["booking.appointments", "payments.in_app"];

interface SvcSeed {
  key: string;
  name: string;
  cat: string;
  min: number;
  price: number;
  deposit?: number;
  buffer?: number;
  from?: boolean;
  rebookDays?: number;
  desc?: string;
  /** hi / ur / pa names */
  tr?: { hi?: string; ur?: string; pa?: string };
}
interface StaffSeed {
  key: string;
  name: string;
  phone: string;
  locale: "en" | "hi" | "ur" | "pa";
  /** Service keys this person does (empty = everything). */
  does?: string[];
  role?: "manager" | "staff";
}

const BLOOM_SERVICES: SvcSeed[] = [
  { key: "cut", name: "Cut and blow-dry", cat: "Hair", min: 45, price: 6500, rebookDays: 35, desc: "Wash, cut and blow-dry." },
  { key: "high", name: "Highlights, half head", cat: "Hair", min: 120, price: 14500, deposit: 4000, from: true, rebookDays: 56, desc: "Foils, toner extra." },
  { key: "toner", name: "Toner", cat: "Hair", min: 30, price: 3500, rebookDays: 56 },
  { key: "root", name: "Colour, root touch-up", cat: "Hair", min: 90, price: 9500, deposit: 3000, rebookDays: 42 },
  { key: "brow", name: "Threading, brows", cat: "Threading", min: 15, price: 1500, rebookDays: 21, tr: { hi: "थ्रेडिंग, भौंहें", ur: "تھریڈنگ، بھنویں", pa: "ਥ੍ਰੈਡਿੰਗ, ਭਰਵੱਟੇ" } },
  { key: "mani", name: "Gel manicure", cat: "Nails", min: 60, price: 5500, buffer: 10, rebookDays: 21 },
];
const BLOOM_STAFF: StaffSeed[] = [
  { key: "simran", name: "Simran Kaur", phone: "+14165550311", locale: "pa", role: "manager" },
  { key: "aisha", name: "Aisha Rahman", phone: "+14165550312", locale: "en", does: ["cut", "root", "high", "toner"] },
  { key: "priya", name: "Priya Raman", phone: "+14165550313", locale: "hi", does: ["cut", "brow", "mani"] },
];
const RANGREZ_SERVICES: SvcSeed[] = [
  { key: "brow", name: "Eyebrow threading", cat: "Threading", min: 15, price: 1200, rebookDays: 21, tr: { hi: "आइब्रो थ्रेडिंग", ur: "آئی برو تھریڈنگ", pa: "ਆਈਬ੍ਰੋ ਥ੍ਰੈਡਿੰਗ" } },
  { key: "face", name: "Full face threading", cat: "Threading", min: 30, price: 2500, rebookDays: 28 },
  { key: "henna", name: "Henna, both hands", cat: "Henna", min: 90, price: 7500, deposit: 2000, buffer: 15, tr: { hi: "मेहंदी, दोनों हाथ", ur: "مہندی، دونوں ہاتھ", pa: "ਮਹਿੰਦੀ, ਦੋਵੇਂ ਹੱਥ" } },
  { key: "bridalh", name: "Bridal henna, full", cat: "Bridal", min: 240, price: 25000, deposit: 10000, from: true, tr: { hi: "दुल्हन की मेहंदी", ur: "دلہن کی مہندی", pa: "ਲਾੜੀ ਦੀ ਮਹਿੰਦੀ" } },
  { key: "bridalm", name: "Bridal makeup and hair", cat: "Bridal", min: 180, price: 32000, deposit: 15000, from: true, buffer: 15, desc: "Trial included on request." },
  { key: "facial", name: "Hydrating facial", cat: "Skin", min: 60, price: 8500, buffer: 10, rebookDays: 35 },
];
const RANGREZ_STAFF: StaffSeed[] = [
  { key: "noor", name: "Noor Fatima", phone: "+14165550321", locale: "ur", role: "manager" },
  { key: "jas", name: "Jasleen Gill", phone: "+14165550322", locale: "pa", does: ["brow", "face", "facial", "henna"] },
  { key: "meena", name: "Meena Kapoor", phone: "+14165550323", locale: "hi", does: ["bridalh", "bridalm", "henna", "brow"] },
];

const CLIENTS = [
  ["Neha Sharma", "+14165550331", "en"], ["Ritu Gill", "+14165550332", "pa"], ["Harleen Kaur", "+14165550333", "pa"], ["Simi Dhaliwal", "+14165550334", "pa"],
  ["Kiran Bajwa", "+14165550335", "pa"], ["Anita Joshi", "+14165550336", "hi"], ["Pooja Raman", "+14165550337", "hi"], ["Sunny Grewal", "+14165550338", "pa"],
  ["Tariq Anwar", "+14165550339", "ur"], ["Dev Patel", "+14165550340", "hi"], ["Zainab Ali", "+14165550341", "ur"], ["Mandeep Sidhu", "+14165550342", "pa"],
  ["Sadia Hussain", "+14165550343", "ur"], ["Aarti Mehta", "+14165550344", "hi"], ["Raj Malhotra", "+14165550345", "en"], ["Fiza Khan", "+14165550346", "ur"],
] as const;

export const APPT_STAFF_LOGINS = [...BLOOM_STAFF.map((s) => ({ shop: "Bloom Hair Studio", slug: "bloom-hair-studio", ...s })), ...RANGREZ_STAFF.map((s) => ({ shop: "Rangrez Beauty Studio", slug: "rangrez-beauty-studio", ...s }))].map((s) => ({
  email: `staff+${s.slug}-${s.key}@example.com`,
  shop: s.shop,
  name: s.name,
  locale: s.locale,
}));

type Row = typeof merchants.$inferSelect;

async function seedShop(db: Db, ctx: AppContext, clock: { now: Date }, row: Row, def: { services: SvcSeed[]; staff: StaffSeed[]; fee: number; window: number }, opts: { ownerPassword: string; log: (m: string) => void }) {
  const [existing] = await db.select({ id: services.id }).from(services).where(eq(services.merchantId, row.id)).limit(1);
  if (existing) return false;
  const [loc] = await db.select().from(locations).where(and(eq(locations.merchantId, row.id), eq(locations.active, true))).limit(1);
  if (!loc) return false;
  const tz = row.timezone;
  const realNow = new Date();

  await db
    .insert(featureOverrides)
    .values(FEATURES.map((key) => ({ merchantId: row.id, key, enabled: true, reason: "Demo appointment salon" })))
    .onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
  await db
    .update(merchants)
    .set({ cancelWindowHours: def.window, noShowFeeCents: def.fee, stripeAccountId: row.stripeAccountId ?? `acct_demo_${row.slug}`, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true })
    .where(eq(merchants.id, row.id));

  // Price list.
  const catNames = [...new Set(def.services.map((s) => s.cat))];
  const existingCats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, row.id));
  const catId = new Map(existingCats.map((c) => [c.name, c.id]));
  for (const name of catNames) {
    if (catId.has(name)) continue;
    const [c] = await db.insert(merchantCategories).values({ merchantId: row.id, name }).returning({ id: merchantCategories.id });
    catId.set(name, c!.id);
  }
  const svcIds = new Map<string, string>();
  for (const [i, s] of def.services.entries()) {
    const translations: Record<string, { name: string }> = {};
    for (const [lang, name] of Object.entries(s.tr ?? {})) translations[lang] = { name };
    const [r] = await db
      .insert(services)
      .values({ merchantId: row.id, kind: "appointment", name: s.name, description: s.desc ?? null, durationMin: s.min, priceCents: s.price, priceFrom: !!s.from, depositCents: s.deposit ?? 0, bufferMin: s.buffer ?? 0, categoryId: catId.get(s.cat)!, rebookAfterDays: s.rebookDays ?? null, sort: i, translations })
      .returning({ id: services.id });
    svcIds.set(s.key, r!.id);
  }
  const svcOf = (key: string) => def.services.find((s) => s.key === key)!;
  const item = (key: string): AppointmentItemRow => ({ serviceId: svcIds.get(key)!, name: svcOf(key).name, durationMin: svcOf(key).min, priceCents: svcOf(key).price });
  const block = (keys: string[]) => keys.reduce((n, k) => n + svcOf(k).min + (svcOf(k).buffer ?? 0), 0);

  // Staff: logins with the shared demo password, weekly hours that follow the shop's hours, their services.
  const hash = await bcrypt.hash(opts.ownerPassword, 10);
  const staffIds = new Map<string, string>();
  for (const s of def.staff) {
    const email = `staff+${row.slug}-${s.key}@example.com`;
    const [u] = await db
      .insert(users)
      .values({ email, name: s.name, phone: s.phone, passwordHash: hash, memberCode: await generateMemberCode(db), locale: s.locale, emailVerifiedAt: realNow, phoneVerifiedAt: realNow })
      .onConflictDoNothing()
      .returning({ id: users.id });
    const userId = u?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]!.id;
    staffIds.set(s.key, userId);
    await db.insert(merchantStaff).values({ merchantId: row.id, userId, role: s.role ?? "staff", locale: s.locale }).onConflictDoNothing();
    const days = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).flatMap((d, weekday) => (loc.hours?.[d] ?? []).map(([a, b]) => ({ merchantId: row.id, locationId: loc.id, userId, weekday, startsLocal: a, endsLocal: b })));
    if (days.length) await db.insert(staffHours).values(days);
    const mine = (s.does ?? def.services.map((x) => x.key)).filter((k) => svcIds.has(k));
    if (s.does) await db.insert(staffServices).values(mine.map((k) => ({ merchantId: row.id, userId, serviceId: svcIds.get(k)! })));
  }

  // Clients.
  const clients: { id: string; name: string }[] = [];
  for (const [name, phone, locale] of CLIENTS) {
    const { user } = await findOrCreateCustomerByPhone(db, phone, name);
    if (user.locale !== locale) await db.update(users).set({ locale }).where(eq(users.id, user.id));
    clients.push({ id: user.id, name });
  }

  // Lay the day out per stylist, relative to now.
  const today = localParts(realNow, tz).date;
  const dayShifts = (date: string, userId: string) => {
    const wd = localParts(zonedToUtc(date, 12 * 60, tz), tz).weekday;
    return db.select().from(staffHours).where(and(eq(staffHours.userId, userId), eq(staffHours.merchantId, row.id), eq(staffHours.weekday, wd)));
  };
  const hm = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const staffKeys = def.staff.map((s) => s.key);
  const owner: StaffContext = { user: { id: staffIds.get(staffKeys[0]!)!, platformRole: "none" } as StaffContext["user"], merchant: { ...row, stripeAccountId: row.stripeAccountId ?? `acct_demo_${row.slug}` }, role: "owner", impersonated: false };
  let cc = 0;
  const pick = () => clients[cc++ % clients.length]!;
  let booked = 0;
  const plan: { date: string; staffKey: string; startMin: number; services: string[]; walkIn?: boolean; deposit?: boolean; requested?: boolean; note?: string; group?: string }[] = [];
  const stylistServices = (key: string) => (def.staff.find((s) => s.key === key)!.does ?? def.services.map((x) => x.key));
  for (const date of [addDays(today, -7), addDays(today, -4), addDays(today, -2), today, addDays(today, 1), addDays(today, 2)]) {
    for (const sk of staffKeys) {
      const shifts = await dayShifts(date, staffIds.get(sk)!);
      if (!shifts.length) continue;
      const first = Math.min(...shifts.map((s) => hm(s.startsLocal)));
      const last = Math.max(...shifts.map((s) => hm(s.endsLocal)));
      const can = stylistServices(sk).filter((k) => block([k]) <= 180);
      let t = first + (date === today ? 0 : 15);
      let n = 0;
      while (n < 5) {
        const keys = [can[(cc + n + sk.length) % can.length]!];
        if (keys[0] === "high" && can.includes("toner") && n % 2 === 0) keys.push("toner");
        const len = block(keys);
        if (t + len > last - 30) break;
        plan.push({ date, staffKey: sk, startMin: t, services: keys, deposit: keys.some((k) => (svcOf(k).deposit ?? 0) > 0), requested: n % 3 === 0 });
        t += len + [0, 15, 30, 45][(n + sk.length) % 4]!; // gaps: some back to back, some open for walk-ins
        n++;
      }
    }
  }
  if (def.staff.some((s) => s.key === "meena")) {
    // A bridal party on one group, Saturday of next week.
    const gid = randomUUID();
    let d = addDays(today, 7);
    for (let i = 0; i < 7 && localParts(zonedToUtc(d, 12 * 60, tz), tz).weekday !== 6; i++) d = addDays(d, 1);
    plan.push({ date: d, staffKey: "meena", startMin: 9 * 60 + 60, services: ["bridalm"], deposit: true, group: gid, note: "Bride. Trial done in September." });
    plan.push({ date: d, staffKey: "jas", startMin: 10 * 60, services: ["henna"], deposit: true, group: gid, note: "Bridesmaid" });
  }

  for (const p of plan) {
    const startsAt = zonedToUtc(p.date, p.startMin, tz);
    const endsAt = new Date(startsAt.getTime() + block(p.services) * MIN);
    const c = pick();
    const past = endsAt.getTime() < realNow.getTime() - 20 * MIN;
    const inProgress = startsAt.getTime() <= realNow.getTime() && endsAt.getTime() >= realNow.getTime();
    const soon = startsAt.getTime() > realNow.getTime() && startsAt.getTime() < realNow.getTime() + 25 * MIN;
    const items = p.services.map(item);
    const deposit = p.deposit ? Math.min(p.services.reduce((n, k) => n + (svcOf(k).deposit ?? 0), 0), items.reduce((n, i) => n + i.priceCents, 0)) : 0;
    // Earlier days are finished through checkout below (invoice, tip, points); earlier today is simply done.
    const status = past && p.date < today ? "in_service" : past ? "completed" : inProgress ? "in_service" : soon ? "arrived" : "booked";
    const [a] = await db
      .insert(appointments)
      .values({
        merchantId: row.id,
        locationId: loc.id,
        userId: c.id,
        staffId: staffIds.get(p.staffKey)!,
        requestedStaff: !!p.requested,
        source: p.group ? "online" : "staff",
        items,
        startsAt,
        endsAt,
        status,
        groupId: p.group ?? null,
        clientNote: p.note ?? null,
        depositCents: deposit,
        depositPaidAt: deposit > 0 ? new Date(realNow.getTime() - 3 * 86_400_000) : null,
        paymentMethodId: deposit > 0 ? "pm_fake_visa_4242" : null,
        noShowFeeCents: def.fee || null,
        arrivedAt: status === "arrived" || status === "in_service" || status === "completed" ? new Date(startsAt.getTime() - 5 * MIN) : null,
        startedAt: status === "in_service" || status === "completed" ? startsAt : null,
        completedAt: status === "completed" ? endsAt : null,
        createdAt: new Date(startsAt.getTime() - 4 * 86_400_000),
        updatedAt: new Date(startsAt.getTime() - 4 * 86_400_000),
      })
      .returning();
    booked++;
    // Earlier visits (not today) get a real invoice, tip and points through checkout, with the clock at the visit.
    if (past && p.date < today) {
      clock.now = endsAt;
      await checkout(ctx, owner, a!.id, { mode: "counter", counterMethod: booked % 3 === 0 ? "cash" : "card_terminal", tipCents: Math.round(items.reduce((n, i) => n + i.priceCents, 0) * 0.2), tipStaffId: staffIds.get(p.staffKey)!, rewardId: null, note: null }).catch(() => undefined);
      clock.now = realNow;
    }
  }

  // A walk-in in the chair, a no-show today if the day is long enough, a lunch block.
  const [first] = def.staff;
  const walkStart = new Date(Math.floor(realNow.getTime() / (15 * MIN)) * 15 * MIN);
  const shiftsToday = await dayShifts(today, staffIds.get(first!.key)!);
  const open = shiftsToday.some((s) => hm(s.startsLocal) * MIN + zonedToUtc(today, 0, tz).getTime() <= walkStart.getTime() && hm(s.endsLocal) * MIN + zonedToUtc(today, 0, tz).getTime() > walkStart.getTime() + 30 * MIN);
  if (open) {
    const mine = await db.select({ s: appointments.startsAt, e: appointments.endsAt }).from(appointments).where(and(eq(appointments.staffId, staffIds.get(first!.key)!), inArray(appointments.status, ["booked", "arrived", "in_service"])));
    const free = !mine.some((m) => m.s < new Date(walkStart.getTime() + 15 * MIN) && m.e > walkStart);
    if (free) {
      const k = stylistServices(first!.key).includes("brow") ? "brow" : def.services[0]!.key;
      await db.insert(appointments).values({ merchantId: row.id, locationId: loc.id, staffId: staffIds.get(first!.key)!, customerName: "Walk-in: Zane", source: "walk_in", items: [item(k)], startsAt: walkStart, endsAt: new Date(walkStart.getTime() + block([k]) * MIN), status: "arrived", arrivedAt: walkStart, createdAt: walkStart, updatedAt: walkStart });
    }
  }
  opts.log(`Appointments: ${row.name}: ${def.services.length} services, ${def.staff.length} staff, ${booked} visits`);
  return true;
}

/** Seed both demo salons (each only once). */
export async function seedAppointmentSalons(db: Db, ctx: AppContext, clock: { now: Date }, opts: { ownerPassword: string; log?: (m: string) => void }): Promise<{ salons: number }> {
  const log = opts.log ?? (() => {});
  const rows = await db.select().from(merchants).where(inArray(merchants.slug, [...SHOPS]));
  let salons = 0;
  const bloom = rows.find((m) => m.slug === "bloom-hair-studio");
  const rangrez = rows.find((m) => m.slug === "rangrez-beauty-studio");
  if (bloom && (await seedShop(db, ctx, clock, bloom, { services: BLOOM_SERVICES, staff: BLOOM_STAFF, fee: 2500, window: 24 }, { ownerPassword: opts.ownerPassword, log }))) salons++;
  if (rangrez && (await seedShop(db, ctx, clock, rangrez, { services: RANGREZ_SERVICES, staff: RANGREZ_STAFF, fee: 3000, window: 48 }, { ownerPassword: opts.ownerPassword, log }))) salons++;
  return { salons };
}
