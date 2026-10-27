/**
 * Pet care demo (docs/research/pet-care.md), all in Ridgeway Plaza, Mississauga:
 *
 *   Pawsh Grooming      a groomer: curly and long-coated regulars on their own cadence (some due, some late), vaccine dates with
 *                       one expiring and one expired, handling notes, a sent report card, a text consent on every owner.
 *   Wag Wing Daycare    dog daycare: a day with five dogs in a room of 16, three expected, one blocked (expired bordetella), one
 *                       with no temperament check, packs (one with a day left).
 *   Tail & Kibble       a pet food store: Fromm, Open Farm and Orijen buy-12-get-1 cards and a raw freezer card (buy 10), a card at
 *                       9 of 12, one ready for the free bag, one expired, and run-out reminders.
 *
 * The demo customer (+16475551000) has a dog, Biscuit, in all three. Idempotent: a shop that already exists is left alone.
 * Customers are fictional (+1416555 05xx). Logins use the shared demo password.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import {
  daycarePacks, daycareStays, featureOverrides, foodCards, foodEvents, foodPrograms, foodSkus, locations, merchantStaff, merchants, neighbourhoods, petNudges, petSettings, petShop, petVaccines, petVisits, pets, services, staffHours, users,
  type Db,
} from "@ll/db";
import { SERVICE_STARTERS, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../context.js";
import { randomToken } from "../lib/crypto.js";
import { localDate } from "../services/messaging.js";
import { ensureMember, findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";

const DAY = 86_400_000;
const CONSENT = { text: "Yes, text me about my pet from this shop. Reply STOP to opt out.", source: "demo_seed" };

interface Def {
  slug: string;
  name: string;
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

const PAWSH: Def = {
  slug: "pawsh-grooming",
  name: "Pawsh Grooming",
  unit: "Ridgeway Plaza, Unit 14, 3250 Ridgecrest Blvd",
  phone: "+19055553014",
  lat: 43.5957,
  lng: -79.6458,
  description: "Dog and cat grooming in a calm salon. Book your next groom before you leave, or we will text you when your pup is due.",
  brand: "#1F5F4A",
  owner: { email: "owner+pawsh-grooming@example.com", name: "Kavita Rao" },
  features: ["booking.appointments", "service.rebooking", "payments.in_app", "pets.profiles", "pets.report_cards", "marketing.sms"],
};
const WAG: Def = {
  slug: "wag-wing-daycare",
  name: "Wag Wing Dog Daycare",
  unit: "Ridgeway Plaza, Unit 21, 3250 Ridgecrest Blvd",
  phone: "+19055553021",
  lat: 43.5961,
  lng: -79.6466,
  description: "Small-group dog daycare. Vaccines up to date and a short temperament check before the first day.",
  brand: "#2F6A9B",
  owner: { email: "owner+wag-wing-daycare@example.com", name: "Dan Whitfield" },
  features: ["pets.profiles", "pets.daycare", "pets.report_cards", "marketing.sms"],
};
const KIBBLE: Def = {
  slug: "tail-and-kibble",
  name: "Tail & Kibble",
  unit: "Ridgeway Plaza, Unit 6, 3250 Ridgecrest Blvd",
  phone: "+19055553006",
  lat: 43.5951,
  lng: -79.6459,
  description: "Independent pet food and supplies. Buy 12 bags of the same food, the next one is free.",
  brand: "#B5651D",
  owner: { email: "owner+tail-and-kibble@example.com", name: "Chris Nolan" },
  features: ["pets.profiles", "pets.food_cards", "marketing.sms"],
};

export const PET_LOGINS = [PAWSH, WAG, KIBBLE].map((d) => ({ email: d.owner.email, role: "owner", shop: d.name, name: d.owner.name }));

type Locale = "en" | "hi" | "ur" | "pa";
interface Owner { name: string; phone: string; locale: Locale }
const OWNERS: Owner[] = [
  { name: "Demo Customer", phone: "+16475551000", locale: "en" }, // an existing demo user keeps their own name,
  { name: "Jordan Lee", phone: "+14165550501", locale: "en" },
  { name: "Anita Shah", phone: "+14165550502", locale: "hi" },
  { name: "Dan Okafor", phone: "+14165550503", locale: "en" },
  { name: "Priya Nair", phone: "+14165550504", locale: "en" },
  { name: "Sam Brar", phone: "+14165550505", locale: "pa" },
  { name: "Ana Reyes", phone: "+14165550506", locale: "en" },
  { name: "Chris Wong", phone: "+14165550507", locale: "en" },
  { name: "Imran Qureshi", phone: "+14165550508", locale: "ur" },
];

interface PetDef { owner: number; name: string; species?: "dog" | "cat"; breed: string; size: "small" | "medium" | "large" | "giant"; coat: "short" | "double" | "curly" | "long_silky" | "wire" | "hairless" }
const PETS: PetDef[] = [
  { owner: 0, name: "Biscuit", breed: "Goldendoodle", size: "medium", coat: "curly" },
  { owner: 1, name: "Pepper", breed: "Shih Tzu", size: "small", coat: "long_silky" },
  { owner: 2, name: "Mochi", breed: "Poodle (mini)", size: "small", coat: "curly" },
  { owner: 3, name: "Rocky", breed: "Labrador retriever", size: "large", coat: "double" },
  { owner: 4, name: "Luna", breed: "Maltese", size: "small", coat: "long_silky" },
  { owner: 5, name: "Ziggy", breed: "Border collie mix", size: "medium", coat: "double" },
  { owner: 6, name: "Hazel", breed: "Labrador retriever", size: "large", coat: "double" },
  { owner: 7, name: "Duke", breed: "Siberian husky", size: "large", coat: "double" },
  { owner: 0, name: "Olive", species: "cat", breed: "Domestic longhair", size: "small", coat: "long_silky" },
  { owner: 8, name: "Simba", breed: "Cavapoo", size: "small", coat: "curly" },
];

async function createShop(db: Db, ctx: AppContext, def: Def, hash: string, hoodId: string, log: (m: string) => void): Promise<typeof merchants.$inferSelect> {
  const [have] = await db.select().from(merchants).where(eq(merchants.slug, def.slug)).limit(1);
  if (have) return have;
  const [owner] = await db.insert(users).values({ email: def.owner.email, name: def.owner.name, passwordHash: hash, memberCode: await generateMemberCode(db), locale: "en-CA", emailVerifiedAt: new Date() }).onConflictDoNothing().returning();
  const ownerId = owner?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, def.owner.email)).limit(1))[0]!.id;
  const created = await createMerchantWithTemplate(ctx, {
    body: { name: def.name, vertical: "pet", address: def.unit, city: "Mississauga", postalCode: "L5R 3K2", phone: def.phone, neighbourhoodId: hoodId, lat: def.lat, lng: def.lng, hours: week("09:00", "18:00", ["10:00", "16:00"]) } as never,
    ownerUserId: ownerId,
    repUserId: null,
    actorUserId: ownerId,
  });
  await db.update(merchants).set({ slug: def.slug, description: def.description, brandColor: def.brand, email: `hello+${def.slug}@example.com`, status: "active", stripeAccountId: `acct_demo_${def.slug}`, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true }).where(eq(merchants.id, created.merchant.id));
  await db.insert(featureOverrides).values(def.features.map((key) => ({ merchantId: created.merchant.id, key, enabled: true, reason: "Demo pet shop" }))).onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
  log(`Pets: created ${def.name}`);
  return (await db.select().from(merchants).where(eq(merchants.id, created.merchant.id)).limit(1))[0]!;
}

interface Ctx {
  db: Db;
  ctx: AppContext;
  now: Date;
  owners: { id: string; name: string }[];
  pets: Map<string, { id: string; userId: string }>;
}

async function joinMembers(c: Ctx, shop: typeof merchants.$inferSelect, ownerIdx: number[]): Promise<Map<number, string>> {
  const [loc] = await c.db.select().from(locations).where(and(eq(locations.merchantId, shop.id), eq(locations.active, true))).limit(1);
  const out = new Map<number, string>();
  for (const i of ownerIdx) {
    const { member } = await c.db.transaction((tx) => ensureMember(c.ctx, tx, { merchantId: shop.id, userId: c.owners[i]!.id, joinedVia: "phone", locationId: loc?.id ?? null, consent: CONSENT, source: "staff_app" }));
    out.set(i, member.id);
  }
  return out;
}

const ymd = (now: Date, plusDays: number) => new Date(now.getTime() + plusDays * DAY).toISOString().slice(0, 10);

async function vaccines(c: Ctx, name: string, spec: Partial<Record<"rabies" | "dhpp" | "bordetella", number>>): Promise<void> {
  const p = c.pets.get(name)!;
  for (const [kind, days] of Object.entries(spec)) {
    await c.db.insert(petVaccines).values({ petId: p.id, kind, expiresOn: ymd(c.now, days!), proofUrl: null }).onConflictDoNothing();
  }
}

async function seedGroomer(c: Ctx, shop: typeof merchants.$inferSelect, log: (m: string) => void): Promise<void> {
  const [done] = await c.db.select({ id: services.id }).from(services).where(eq(services.merchantId, shop.id)).limit(1);
  if (done) return;
  const [loc] = await c.db.select().from(locations).where(and(eq(locations.merchantId, shop.id), eq(locations.active, true))).limit(1);
  const ownerId = (await c.db.select({ id: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, shop.id), eq(merchantStaff.role, "owner"))).limit(1))[0]?.id;
  // The groomer's starter list: prices by dog size (a dog is shown only its own size at booking), no bridal line.
  await c.db.insert(services).values(SERVICE_STARTERS.pet!.map((x, i) => ({ merchantId: shop.id, kind: "appointment" as const, name: x.name, durationMin: x.durationMin, priceCents: x.priceCents, rebookAfterDays: x.rebookAfterDays ?? null, sort: i })));
  if (loc && ownerId) {
    const days = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).flatMap((d, weekday) => (loc.hours?.[d] ?? []).map(([a, b]) => ({ merchantId: shop.id, locationId: loc.id, userId: ownerId, weekday, startsLocal: a, endsLocal: b })));
    if (days.length) await c.db.insert(staffHours).values(days).onConflictDoNothing();
  }
  const members = await joinMembers(c, shop, [0, 1, 2, 3, 4, 8]);
  void members;
  // Cadence, handling notes and the last groom per pet (days ago). Today is the seed day, so some are due and some late.
  const spec: { pet: string; weeks: number | null; note?: string; last: number }[] = [
    { pet: "Biscuit", weeks: 6, note: "Nervous at the dryer. Clip nails last. Teddy cut, 1.5 inch body, short ears.", last: 42 },
    { pet: "Pepper", weeks: 4, note: "Sensitive on the back legs. Short topknot.", last: 35 },
    { pet: "Mochi", weeks: 5, last: 38 },
    { pet: "Rocky", weeks: 8, note: "De-shed and bath only. Loves the tub.", last: 70 },
    { pet: "Luna", weeks: 4, last: 24 },
    { pet: "Olive", weeks: null, note: "Cat. Lion cut only with a second person. Mats under the front legs.", last: 50 },
    { pet: "Simba", weeks: null, last: 10 },
  ];
  for (const s of spec) {
    const p = c.pets.get(s.pet)!;
    await c.db.insert(petShop).values({ merchantId: shop.id, petId: p.id, groomEveryWeeks: s.weeks, handlingNote: s.note ?? null, assessment: "none" }).onConflictDoNothing();
    const at = new Date(c.now.getTime() - s.last * DAY);
    await c.db.insert(petVisits).values({ merchantId: shop.id, petId: p.id, userId: p.userId, kind: "groom", at, createdBy: ownerId ?? null, createdAt: at });
  }
  // One recent visit has a report card that was sent (the page a text links to).
  const biscuit = c.pets.get("Biscuit")!;
  const sentAt = new Date(c.now.getTime() - 1 * 3_600_000);
  await c.db.insert(petVisits).values({ merchantId: shop.id, petId: biscuit.id, userId: biscuit.userId, kind: "groom", at: new Date(c.now.getTime() - 43 * DAY), mood: "happy", did: ["bath", "haircut", "nails", "ears"], note: "Great boy today. Matting behind the ears, so book the next one in 5 weeks.", token: randomToken(18), sentAt, expiresAt: new Date(sentAt.getTime() + 30 * DAY), createdBy: ownerId ?? null, createdAt: sentAt });
  await vaccines(c, "Biscuit", { rabies: 311, dhpp: 24, bordetella: -45 });
  await vaccines(c, "Pepper", { rabies: 200, dhpp: 150, bordetella: 80 });
  await vaccines(c, "Mochi", { rabies: 90, dhpp: 90 });
  await vaccines(c, "Rocky", { rabies: 400, dhpp: 320, bordetella: 250 });
  await vaccines(c, "Luna", { rabies: 150 });
  await vaccines(c, "Olive", { rabies: 280 });
  // A skipped nudge from the last cycle so the list shows only what is live.
  await c.db.insert(petNudges).values({ merchantId: shop.id, petId: c.pets.get("Simba")!.id, sinceVisitId: null, action: "skipped" });
  log(`Pets: ${shop.name}: ${spec.length} pets on a cadence, one report card sent`);
}

async function seedDaycare(c: Ctx, shop: typeof merchants.$inferSelect, log: (m: string) => void): Promise<void> {
  const [have] = await c.db.select({ id: petSettings.merchantId }).from(petSettings).where(eq(petSettings.merchantId, shop.id)).limit(1);
  if (have) return;
  await c.db.insert(petSettings).values({ merchantId: shop.id, capacity: 16, dogsPerStaff: 15, staffOn: 1, requiredVaccines: ["rabies", "dhpp", "bordetella"], requireAssessment: true, dropInCents: 4800, closesAt: "18:00", lateGraceMin: 15 });
  const members = await joinMembers(c, shop, [0, 1, 2, 3, 4, 5]);
  void members;
  const day = localDate(c.now, shop.timezone);
  const ownerId = (await c.db.select({ id: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, shop.id), eq(merchantStaff.role, "owner"))).limit(1))[0]?.id ?? null;
  const dogs: { pet: string; assess: "passed" | "none"; status: "in" | "expected"; pack?: number; vax: Partial<Record<"rabies" | "dhpp" | "bordetella", number>> }[] = [
    { pet: "Biscuit", assess: "passed", status: "in", pack: 7, vax: { rabies: 311, dhpp: 24, bordetella: 100 } },
    { pet: "Pepper", assess: "passed", status: "in", pack: 1, vax: { rabies: 200, dhpp: 150, bordetella: 80 } },
    { pet: "Rocky", assess: "passed", status: "expected", vax: { rabies: 400, dhpp: 320, bordetella: 250 } },
    { pet: "Mochi", assess: "passed", status: "expected", pack: 9, vax: { rabies: 90, dhpp: 90, bordetella: 90 } },
    { pet: "Ziggy", assess: "passed", status: "expected", pack: 3, vax: { rabies: 120, dhpp: 120, bordetella: -26 } },
    { pet: "Luna", assess: "none", status: "expected", vax: { rabies: 150, dhpp: 150, bordetella: 150 } },
  ];
  const packs = new Map<number, string>();
  for (const d of dogs) {
    const p = c.pets.get(d.pet)!;
    await c.db.insert(petShop).values({ merchantId: shop.id, petId: p.id, assessment: d.assess, assessedAt: d.assess === "passed" ? new Date(c.now.getTime() - 20 * DAY) : null, assessedBy: d.assess === "passed" ? ownerId : null }).onConflictDoNothing();
    await vaccines(c, d.pet, d.vax);
    let packId: string | null = null;
    if (d.pack !== undefined) {
      const total = 10;
      const [pk] = await c.db.insert(daycarePacks).values({ merchantId: shop.id, userId: p.userId, daysTotal: total, daysUsed: total - d.pack, paidCents: 42000, purchasedAt: new Date(c.now.getTime() - 40 * DAY), expiresAt: new Date(c.now.getTime() + 140 * DAY), soldBy: ownerId }).returning({ id: daycarePacks.id });
      packId = pk!.id;
      packs.set(dogs.indexOf(d), packId);
    }
    await c.db.insert(daycareStays).values({ merchantId: shop.id, petId: p.id, userId: p.userId, day, status: d.status, packId: d.status === "in" ? packId : null, payKind: packId ? "pack" : "drop_in", checkInAt: d.status === "in" ? new Date(c.now.getTime() - 3 * 3_600_000) : null }).onConflictDoNothing();
  }
  log(`Pets: ${shop.name}: ${dogs.length} dogs today, one blocked on an expired shot, one with no temperament check`);
}

async function seedStore(c: Ctx, shop: typeof merchants.$inferSelect, log: (m: string) => void): Promise<void> {
  const [have] = await c.db.select({ id: foodPrograms.id }).from(foodPrograms).where(eq(foodPrograms.merchantId, shop.id)).limit(1);
  if (have) return;
  const members = await joinMembers(c, shop, [0, 6, 7, 1, 2, 3]);
  void members;
  const progs: { brand: string; buy: number; months: number; skus: [string, number][] }[] = [
    { brand: "Fromm", buy: 12, months: 12, skus: [["Gold Adult 26 lb", 11_800], ["Four-Star Salmon 12 lb", 5_440]] },
    { brand: "Open Farm", buy: 12, months: 12, skus: [["Wild-Caught Salmon and Ancient Grains 22 lb", 9_980]] },
    { brand: "Orijen", buy: 12, months: 12, skus: [["Original 25 lb", 11_340]] },
    { brand: "Our raw freezer", buy: 10, months: 6, skus: [["Beef patties 1 lb", 454]] },
  ];
  const sku = new Map<string, { id: string; programId: string }>();
  for (const p of progs) {
    const [pr] = await c.db.insert(foodPrograms).values({ merchantId: shop.id, brand: p.brand, buyCount: p.buy, expiryMonths: p.months }).returning({ id: foodPrograms.id });
    for (const [name, g] of p.skus) {
      const [s] = await c.db.insert(foodSkus).values({ programId: pr!.id, merchantId: shop.id, name, bagGrams: g }).returning({ id: foodSkus.id });
      sku.set(`${p.brand}:${name}`, { id: s!.id, programId: pr!.id });
    }
  }
  const now = c.now;
  const card = async (owner: number, key: string, punches: number, bagDaysAgo: number, cycleDaysAgo: number, opts: { grams?: number; pet?: string; remind?: boolean; given?: number } = {}) => {
    const s = sku.get(key)!;
    const at = new Date(now.getTime() - bagDaysAgo * DAY);
    const [row] = await c.db
      .insert(foodCards)
      .values({ merchantId: shop.id, programId: s.programId, skuId: s.id, userId: c.owners[owner]!.id, petId: opts.pet ? c.pets.get(opts.pet)!.id : null, punches, given: opts.given ?? 0, cycleStartedAt: new Date(now.getTime() - cycleDaysAgo * DAY), lastBagAt: at, dailyGrams: opts.grams ?? null, remind: !!opts.remind, remindConsentAt: opts.remind ? at : null, remindConsentSource: opts.remind ? "counter" : null })
      .returning({ id: foodCards.id });
    await c.db.insert(foodEvents).values({ cardId: row!.id, merchantId: shop.id, kind: "bag", qty: punches, at });
  };
  // Biscuit's owner: 9 of 12 Fromm Gold, 360 g a day, last bag 26 days ago, so the bag runs out in about a week and the text is due in two days.
  await card(0, "Fromm:Gold Adult 26 lb", 9, 26, 250, { grams: 360, pet: "Biscuit", remind: true });
  await card(0, "Our raw freezer:Beef patties 1 lb", 4, 6, 40);
  await card(6, "Fromm:Gold Adult 26 lb", 12, 20, 300, { grams: 360, pet: "Hazel", remind: true }); // ready for the free bag, runs out in 12 days
  await card(7, "Orijen:Original 25 lb", 7, 31, 200, { grams: 350, pet: "Duke", remind: true });
  await card(1, "Open Farm:Wild-Caught Salmon and Ancient Grains 22 lb", 5, 500, 500); // older than 12 months: expired
  await card(2, "Fromm:Four-Star Salmon 12 lb", 3, 12, 60);
  log(`Pets: ${shop.name}: ${progs.length} brands, 6 cards (one ready for the free bag, one expired), 3 run-out reminders`);
}

/** Seed the three demo pet shops (each only once). Needs the Ridgeway Plaza corridor. */
export async function seedPets(db: Db, ctx: AppContext, opts: { ownerPassword: string; log?: (m: string) => void }): Promise<{ shops: number }> {
  const log = opts.log ?? (() => {});
  const [hood] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, "ridgeway-plaza")).limit(1);
  if (!hood) {
    log("Pets: skipped (the Ridgeway Plaza corridor is not seeded)");
    return { shops: 0 };
  }
  const hash = await bcrypt.hash(opts.ownerPassword, 10);
  const groomer = await createShop(db, ctx, PAWSH, hash, hood.id, log);
  const daycare = await createShop(db, ctx, WAG, hash, hood.id, log);
  const store = await createShop(db, ctx, KIBBLE, hash, hood.id, log);
  // Owners and pets (once).
  const owners: { id: string; name: string }[] = [];
  for (const o of OWNERS) {
    const { user } = await findOrCreateCustomerByPhone(db, o.phone, o.name);
    if (user.locale !== o.locale) await db.update(users).set({ locale: o.locale }).where(eq(users.id, user.id));
    owners.push({ id: user.id, name: o.name });
  }
  const petMap = new Map<string, { id: string; userId: string }>();
  for (const p of PETS) {
    const uid = owners[p.owner]!.id;
    const [have] = await db.select({ id: pets.id }).from(pets).where(and(eq(pets.userId, uid), eq(pets.name, p.name))).limit(1);
    const id = have?.id ?? (await db.insert(pets).values({ userId: uid, name: p.name, species: p.species ?? "dog", breed: p.breed, sizeBand: p.size, coat: p.coat }).returning({ id: pets.id }))[0]!.id;
    petMap.set(p.name, { id, userId: uid });
  }
  const c: Ctx = { db, ctx, now: new Date(), owners, pets: petMap };
  await seedGroomer(c, groomer, log);
  await seedDaycare(c, daycare, log);
  await seedStore(c, store, log);
  return { shops: 3 };
}
