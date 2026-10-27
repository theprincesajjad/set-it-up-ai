/**
 * Barbershop, threading bar and beauty supply demo (docs/research/barbers-beauty.md), all in Ridgeway Plaza, Mississauga:
 *
 *   Crown & Fade Barbershop   five chairs: an owner who rents out chairs, three chair renters (own clients only) and one commission
 *                             barber. A walk-in line that is open with people waiting, one in the chair, a week of paid visits with
 *                             tips (for Payouts), "my barber" for the demo customer and two kids on her card.
 *   Arch & Thread Brow Bar    a mall threading kiosk: threaders on commission, a short line.
 *   Glow Beauty Supply        beauty supply: points on product categories, a stylist pro card and a message check.
 *
 * Idempotent: a shop that already exists is left alone. Customers are fictional (+1416555 04xx). Logins use the shared demo password.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import {
  appointments, familyMembers, featureOverrides, locations, merchantStaff, merchants, merchantCategories, messages, neighbourhoods, preferredStaff, queueEntries, services, staffHours, staffPay, users, walkinQueues,
  type AppointmentItemRow, type Db,
} from "@ll/db";
import type { FeatureKey } from "@ll/shared";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { checkout } from "../services/appointments-checkout.js";
import { localParts } from "../services/appointments.js";
import { addDays, zonedToUtc } from "../services/bookings.js";
import { findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";

const MIN = 60_000;
const FEATURES: FeatureKey[] = ["booking.appointments", "booking.walkin_queue", "staff.payouts", "payments.in_app", "service.rebooking"];
const BEAUTY_FEATURES: FeatureKey[] = ["marketing.email", "marketing.sms", "discount_cards"];

interface Svc { key: string; name: string; min: number; price: number; rebook?: number }
interface Person { key: string; name: string; phone: string; locale: "en" | "hi" | "ur" | "pa"; role: "owner" | "manager" | "staff"; pay: { model: "employee" | "commission" | "chair_rent"; bps?: number; rent?: number; own?: boolean; walkIns?: boolean } }
interface Def {
  slug: string;
  name: string;
  vertical: "barber" | "salon" | "beauty_supply";
  unit: string;
  postal: string;
  phone: string;
  lat: number;
  lng: number;
  description: string;
  brand: string;
  instagram: string;
  hours: Record<string, [string, string][]>;
  owner: { email: string; name: string };
  services: Svc[];
  team: Person[];
  clients: [string, string, "en" | "hi" | "ur" | "pa"][];
}

const week = (open: string, close: string, sun: [string, string] | null) => ({ mon: [[open, close]], tue: [[open, close]], wed: [[open, close]], thu: [[open, close]], fri: [[open, close]], sat: [[open, close]], sun: sun ? [sun] : [] }) as Record<string, [string, string][]>;

const CROWN: Def = {
  slug: "crown-and-fade",
  name: "Crown & Fade Barbershop",
  vertical: "barber",
  unit: "Ridgeway Plaza, Unit 9, 3250 Ridgecrest Blvd",
  postal: "L5R 3K2",
  phone: "+19055553009",
  lat: 43.5953,
  lng: -79.6461,
  description: "Fades, line-ups, beard work and kids' cuts. Walk in and join the line from your phone, or book your barber.",
  brand: "#1F1F1F",
  instagram: "crownandfade.mississauga",
  hours: week("09:00", "20:00", ["10:00", "17:00"]),
  owner: { email: "owner+crown-and-fade@example.com", name: "Omar Haddad" },
  services: [
    { key: "cut", name: "Cut", min: 25, price: 3000, rebook: 28 },
    { key: "kids", name: "Kids' cut", min: 20, price: 2200, rebook: 35 },
    { key: "beard", name: "Beard trim", min: 15, price: 1500, rebook: 21 },
    { key: "combo", name: "Cut and beard", min: 40, price: 4200, rebook: 28 },
    { key: "line", name: "Line-up", min: 15, price: 1500, rebook: 14 },
  ],
  team: [
    { key: "omar", name: "Omar Haddad", phone: "+14165550401", locale: "en", role: "owner", pay: { model: "employee", walkIns: false } },
    { key: "marcus", name: "Marcus Bailey", phone: "+14165550402", locale: "en", role: "staff", pay: { model: "chair_rent", rent: 18000, own: true } },
    { key: "ayo", name: "Ayo Adeyemi", phone: "+14165550403", locale: "en", role: "staff", pay: { model: "chair_rent", rent: 18000, own: true } },
    { key: "kareem", name: "Kareem Saleh", phone: "+14165550404", locale: "ur", role: "staff", pay: { model: "chair_rent", rent: 18000, own: true } },
    { key: "dev", name: "Dev Chauhan", phone: "+14165550405", locale: "hi", role: "staff", pay: { model: "commission", bps: 4000 } },
  ],
  clients: [["Omar Q.", "+14165550410", "en"], ["Tyrell", "+14165550411", "en"], ["Harpreet", "+14165550412", "pa"], ["Joon", "+14165550413", "en"], ["Sam", "+14165550414", "en"], ["Imran", "+14165550415", "ur"], ["Devon", "+14165550416", "en"], ["Gurjit", "+14165550417", "pa"], ["Hassan", "+14165550418", "ur"], ["Andre", "+14165550419", "en"], ["Raj", "+14165550420", "hi"], ["Kwame", "+14165550421", "en"]],
};

const ARCH: Def = {
  slug: "arch-and-thread",
  name: "Arch & Thread Brow Bar",
  vertical: "salon",
  unit: "Ridgeway Plaza, Kiosk 3, 3250 Ridgecrest Blvd",
  postal: "L5R 3K2",
  phone: "+19055553003",
  lat: 43.5949,
  lng: -79.6455,
  description: "Eyebrow and face threading in 15 minutes. No appointment: join the line.",
  brand: "#8B2F5A",
  instagram: "archandthread",
  hours: week("10:00", "21:00", ["11:00", "18:00"]),
  owner: { email: "owner+arch-and-thread@example.com", name: "Anjali Verma" },
  services: [
    { key: "brow", name: "Eyebrow threading", min: 15, price: 1200, rebook: 21 },
    { key: "lip", name: "Upper lip", min: 10, price: 600, rebook: 21 },
    { key: "face", name: "Full face threading", min: 30, price: 2800, rebook: 28 },
    { key: "tint", name: "Brow tint", min: 15, price: 1500, rebook: 35 },
  ],
  team: [
    { key: "anjali", name: "Anjali Verma", phone: "+14165550431", locale: "hi", role: "owner", pay: { model: "employee" } },
    { key: "rubina", name: "Rubina Shaikh", phone: "+14165550432", locale: "ur", role: "staff", pay: { model: "commission", bps: 5000 } },
    { key: "tehmina", name: "Tehmina Raza", phone: "+14165550433", locale: "pa", role: "staff", pay: { model: "commission", bps: 5000 } },
  ],
  clients: [["Neha", "+14165550440", "en"], ["Ritu", "+14165550441", "pa"], ["Sana", "+14165550442", "ur"], ["Pooja", "+14165550443", "hi"], ["Mina", "+14165550444", "en"], ["Fiza", "+14165550445", "ur"]],
};

const GLOW: Def = {
  slug: "glow-beauty-supply",
  name: "Glow Beauty Supply",
  vertical: "beauty_supply",
  unit: "Ridgeway Plaza, Unit 12, 3250 Ridgecrest Blvd",
  postal: "L5R 3K2",
  phone: "+19055553012",
  lat: 43.5955,
  lng: -79.6463,
  description: "Hair care, colour, tools, wigs and extensions for stylists and everyone else. Stylists: ask for the pro card.",
  brand: "#B0488A",
  instagram: "glowbeautysupply.ca",
  hours: week("10:00", "20:00", ["11:00", "17:00"]),
  owner: { email: "owner+glow-beauty-supply@example.com", name: "Mehwish Anwar" },
  services: [],
  team: [],
  clients: [],
};

export const BARBER_LOGINS = [
  ...[CROWN, ARCH, GLOW].map((d) => ({ email: d.owner.email, role: "owner", shop: d.name, name: d.owner.name })),
  ...[CROWN, ARCH].flatMap((d) => d.team.filter((p) => p.role !== "owner").map((p) => ({ email: `staff+${p.key}-${d.slug}@example.com`, role: "staff", shop: d.name, name: p.name }))),
] as const;
const loginEmail = (slug: string, key: string) => `staff+${key}-${slug}@example.com`;

async function createShop(db: Db, ctx: AppContext, def: Def, hash: string, hoodId: string, log: (m: string) => void): Promise<typeof merchants.$inferSelect> {
  const [have] = await db.select().from(merchants).where(eq(merchants.slug, def.slug)).limit(1);
  if (have) return have;
  const [owner] = await db.insert(users).values({ email: def.owner.email, name: def.owner.name, passwordHash: hash, memberCode: await generateMemberCode(db), locale: "en-CA", emailVerifiedAt: new Date() }).onConflictDoNothing().returning();
  const ownerId = owner?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, def.owner.email)).limit(1))[0]!.id;
  const created = await createMerchantWithTemplate(ctx, {
    body: { name: def.name, vertical: def.vertical, address: def.unit, city: "Mississauga", postalCode: def.postal, phone: def.phone, neighbourhoodId: hoodId, lat: def.lat, lng: def.lng, hours: def.hours } as never,
    ownerUserId: ownerId,
    repUserId: null,
    actorUserId: ownerId,
  });
  await db.update(merchants).set({ slug: def.slug, description: def.description, brandColor: def.brand, instagram: def.instagram, email: `hello+${def.slug}@example.com`, status: "active", stripeAccountId: `acct_demo_${def.slug}`, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true }).where(eq(merchants.id, created.merchant.id));
  log(`Barbers: created ${def.name}`);
  return (await db.select().from(merchants).where(eq(merchants.id, created.merchant.id)).limit(1))[0]!;
}

async function seedLineShop(db: Db, ctx: AppContext, clock: { now: Date }, row: typeof merchants.$inferSelect, def: Def, hash: string, history: boolean, log: (m: string) => void): Promise<void> {
  const [done] = await db.select({ id: services.id }).from(services).where(eq(services.merchantId, row.id)).limit(1);
  if (done) return;
  const [loc] = await db.select().from(locations).where(and(eq(locations.merchantId, row.id), eq(locations.active, true))).limit(1);
  if (!loc) return;
  const tz = row.timezone;
  const realNow = new Date();
  await db.insert(featureOverrides).values(FEATURES.map((key) => ({ merchantId: row.id, key, enabled: true, reason: "Demo barbershop and threading bar" }))).onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });

  const [cat] = await db.insert(merchantCategories).values({ merchantId: row.id, name: "Services" }).returning({ id: merchantCategories.id });
  const svcId = new Map<string, string>();
  for (const [i, s] of def.services.entries()) {
    const [r] = await db.insert(services).values({ merchantId: row.id, kind: "appointment", name: s.name, durationMin: s.min, priceCents: s.price, categoryId: cat!.id, rebookAfterDays: s.rebook ?? null, sort: i }).returning({ id: services.id });
    svcId.set(s.key, r!.id);
  }
  const item = (key: string): AppointmentItemRow => {
    const s = def.services.find((x) => x.key === key)!;
    return { serviceId: svcId.get(key)!, name: s.name, durationMin: s.min, priceCents: s.price };
  };

  // Team: owner login exists; the others get logins, hours that follow the shop's, and how they are paid.
  const ids = new Map<string, string>();
  for (const p of def.team) {
    let userId: string;
    if (p.role === "owner") userId = (await db.select({ id: users.id }).from(users).where(eq(users.email, def.owner.email)).limit(1))[0]!.id;
    else {
      const email = loginEmail(def.slug, p.key);
      const [u] = await db.insert(users).values({ email, name: p.name, phone: p.phone, passwordHash: hash, memberCode: await generateMemberCode(db), locale: p.locale, emailVerifiedAt: realNow, phoneVerifiedAt: realNow }).onConflictDoNothing().returning({ id: users.id });
      userId = u?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]!.id;
      await db.insert(merchantStaff).values({ merchantId: row.id, userId, role: p.role, locale: p.locale }).onConflictDoNothing();
    }
    ids.set(p.key, userId);
    await db.update(users).set({ name: p.name }).where(eq(users.id, userId));
    const days = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).flatMap((d, weekday) => (loc.hours?.[d] ?? []).map(([a, b]) => ({ merchantId: row.id, locationId: loc.id, userId, weekday, startsLocal: a, endsLocal: b })));
    if (days.length) await db.insert(staffHours).values(days);
    await db.insert(staffPay).values({ merchantId: row.id, userId, model: p.pay.model, shopShareBps: p.pay.bps ?? 0, rentCentsWeek: p.pay.rent ?? 0, ownClientsOnly: p.pay.own ?? false, takesWalkIns: p.pay.walkIns ?? true }).onConflictDoNothing();
  }
  await db.insert(walkinQueues).values({ merchantId: row.id, open: true, minutesPerCut: 25, textNext: true, maxWaiting: 30, callHoldMinutes: 5 }).onConflictDoNothing();

  const clients: { id: string; name: string }[] = [];
  for (const [name, phone, locale] of def.clients) {
    const { user } = await findOrCreateCustomerByPhone(db, phone, name);
    if (user.locale !== locale) await db.update(users).set({ locale }).where(eq(users.id, user.id));
    clients.push({ id: user.id, name });
  }

  const workers = def.team.filter((p) => (p.pay.walkIns ?? true) && p.role !== "owner" || def.slug === "arch-and-thread");
  const owner: StaffContext = { user: { id: ids.get(def.team[0]!.key)!, platformRole: "none" } as StaffContext["user"], merchant: row, role: "owner", impersonated: false };
  // A week of paid visits with tips (the Payouts page). Each barber has 2 to 3 a day on each of the last six days.
  if (history) {
    const today = localParts(realNow, tz).date;
    let n = 0;
    for (let d = 6; d >= 1; d--) {
      const date = addDays(today, -d);
      for (const [wi, w] of workers.entries()) {
        for (let k = 0; k < 4 + ((d + wi) % 3); k++) {
          const key = def.services[(n + k + wi) % def.services.length]!.key;
          const it = item(key);
          const startsAt = zonedToUtc(date, 9 * 60 + 15 + k * 85 + wi * 5, tz);
          const endsAt = new Date(startsAt.getTime() + it.durationMin * MIN);
          const c = clients[n % clients.length]!;
          n++;
          const [a] = await db.insert(appointments).values({ merchantId: row.id, locationId: loc.id, userId: c.id, staffId: ids.get(w.key)!, requestedStaff: n % 2 === 0, source: "walk_in", items: [it], startsAt, endsAt, status: "in_service", arrivedAt: startsAt, startedAt: startsAt, createdAt: startsAt, updatedAt: startsAt }).returning();
          clock.now = endsAt;
          await checkout(ctx, owner, a!.id, { mode: "counter", counterMethod: n % 3 === 0 ? "cash" : "card_terminal", tipCents: Math.round(it.priceCents * (n % 4 === 0 ? 0.1 : 0.2)), tipStaffId: ids.get(w.key)!, rewardId: null, note: null }).catch((e) => log(`Barbers: checkout skipped (${(e as Error).message})`));
          clock.now = realNow;
        }
      }
    }
  }

  // The line: people waiting (some asked for a barber), one in the chair now.
  const line: { name: string; client: number; svc: string; barber?: string; mins: number }[] = def.slug === "crown-and-fade"
    ? [
        { name: "Omar Q.", client: 0, svc: "combo", barber: "marcus", mins: 38 },
        { name: "Tyrell", client: 1, svc: "cut", barber: "marcus", mins: 27 },
        { name: "Harpreet", client: 2, svc: "cut", mins: 19 },
        { name: "Joon", client: 3, svc: "cut", barber: "dev", mins: 12 },
        { name: "Sam", client: 4, svc: "beard", mins: 4 },
      ]
    : [{ name: "Neha", client: 0, svc: "brow", mins: 14 }, { name: "Ritu", client: 1, svc: "face", mins: 9 }, { name: "Sana", client: 2, svc: "brow", mins: 3 }];
  for (const l of line) {
    const s = def.services.find((x) => x.key === l.svc)!;
    const at = new Date(realNow.getTime() - l.mins * MIN);
    await db.insert(queueEntries).values({ merchantId: row.id, locationId: loc.id, userId: clients[l.client]!.id, name: l.name, serviceId: svcId.get(l.svc)!, serviceName: s.name, durationMin: s.min, requestedStaffId: l.barber ? ids.get(l.barber)! : null, status: "waiting", source: l.client % 2 ? "tablet" : "join", token: randomToken(18), positionAt: at, joinedAt: at, textConsent: true });
  }
  if (def.slug === "crown-and-fade") {
    const it = item("cut");
    const startsAt = new Date(realNow.getTime() - 12 * MIN);
    const [a] = await db.insert(appointments).values({ merchantId: row.id, locationId: loc.id, userId: clients[6]!.id, customerName: "Devon", staffId: ids.get("marcus")!, source: "walk_in", items: [it], startsAt, endsAt: new Date(startsAt.getTime() + it.durationMin * MIN), status: "in_service", arrivedAt: startsAt, startedAt: startsAt }).returning();
    await db.insert(queueEntries).values({ merchantId: row.id, locationId: loc.id, userId: clients[6]!.id, name: "Devon", serviceId: svcId.get("cut")!, serviceName: it.name, durationMin: it.durationMin, status: "in_service", source: "join", token: randomToken(18), positionAt: startsAt, joinedAt: new Date(startsAt.getTime() - 20 * MIN), startedAt: startsAt, calledAt: startsAt, calledStaffId: ids.get("marcus")!, appointmentId: a!.id, textConsent: false });
    // The demo customer (+16475551000) has Marcus as "my barber" and two kids on her card.
    const { user: demo } = await findOrCreateCustomerByPhone(db, "+16475551000", "Demo Customer");
    await db.insert(preferredStaff).values({ userId: demo.id, merchantId: row.id, staffId: ids.get("marcus")!, source: "chosen" }).onConflictDoNothing();
    const have = await db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.userId, demo.id)).limit(1);
    if (!have.length) await db.insert(familyMembers).values([{ userId: demo.id, firstName: "Aiden", consentAt: realNow }, { userId: demo.id, firstName: "Zayn", consentAt: realNow }]);
  }
  log(`Barbers: ${row.name}: ${def.services.length} services, ${def.team.length} team, ${line.length} waiting`);
}

async function seedBeautySupply(db: Db, row: typeof merchants.$inferSelect, log: (m: string) => void): Promise<void> {
  await db.insert(featureOverrides).values(BEAUTY_FEATURES.map((key) => ({ merchantId: row.id, key, enabled: true, reason: "Demo beauty supply store" }))).onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
  const [have] = await db.select({ id: messages.id }).from(messages).where(eq(messages.merchantId, row.id)).limit(1);
  if (!have) await db.insert(messages).values({ merchantId: row.id, channel: "email", subject: "Colour restock: 15% off this weekend", body: "New shades of permanent hair colour are in. Stylist pro card holders get 15% off hair colour until Sunday.", segment: { kind: "all" }, status: "draft" });
  log(`Barbers: ${row.name}: points on product categories, stylist pro card, one draft message`);
}

/** Seed the three demo shops (each only once). Needs the Ridgeway Plaza corridor. */
export async function seedBarbersBeauty(db: Db, ctx: AppContext, clock: { now: Date }, opts: { ownerPassword: string; log?: (m: string) => void }): Promise<{ shops: number }> {
  const log = opts.log ?? (() => {});
  const [hood] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, "ridgeway-plaza")).limit(1);
  if (!hood) {
    log("Barbers: skipped (the Ridgeway Plaza corridor is not seeded)");
    return { shops: 0 };
  }
  const hash = await bcrypt.hash(opts.ownerPassword, 10);
  const crown = await createShop(db, ctx, CROWN, hash, hood.id, log);
  const arch = await createShop(db, ctx, ARCH, hash, hood.id, log);
  const glow = await createShop(db, ctx, GLOW, hash, hood.id, log);
  await seedLineShop(db, ctx, clock, crown, CROWN, hash, true, log);
  await seedLineShop(db, ctx, clock, arch, ARCH, hash, true, log);
  await seedBeautySupply(db, glow, log);
  return { shops: 3 };
}
