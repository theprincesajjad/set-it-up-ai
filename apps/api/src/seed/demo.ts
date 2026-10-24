/**
 * Realistic Toronto demo: Roncesvalles Village pilot (+ Leslieville and the
 * Danforth), ~16 merchants from vertical templates, promos (live on 3 pilot shops via admin
 * overrides, since promos are Plus and hidden at launch under Pricing v2), a "visit 3 shops"
 * network perk, an admin, a rep, one owner per merchant, ~120 customers with
 * 90 days of visit history posted through the ledger, and sales leads.
 *
 * All points go through services/ledger.ts (awardPurchase / redeemReward);
 * afterwards only timestamps are back-dated so the history looks real.
 */
import bcrypt from "bcryptjs";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { FeatureKey } from "@ll/shared";
import {
  featureOverrides,
  leadActivities,
  leads,
  ledgerTransactions,
  loyaltyPrograms,
  merchantCategories,
  merchantMembers,
  merchantStaff,
  merchants,
  messages,
  neighbourhoods,
  networkPerkAwards,
  networkPerks,
  promos,
  redemptions,
  users,
  visits,
  type Db,
} from "@ll/db";
import { loadConfig, type Config } from "../config.js";
import type { AppContext } from "../context.js";
import { createProviders } from "../providers/index.js";
import { awardPurchase, generateMemberCode, redeemReward } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";
import { CORE_SHOP_FEATURES, seedCoreModules } from "./core.js";
import { BIA_DEMO, seedBiaDemo } from "./bia.js";
import { seedServiceOps } from "./serviceOps.js";
import { seedRepAdmin } from "./repAdmin.js";
import { backfillMilestones } from "../services/onboarding.js";
import { seedAppointmentSalons } from "./appointments.js";
import { RESTAURANT_SHOPS, seedRestaurantCorridor } from "./restaurants.js";
import { FIRST_NAMES, LAST_NAMES, LEADS, MERCHANTS, NEIGHBOURHOODS, type DemoMerchant } from "./data.js";

const DAY = 86400000;

export const DEMO_CREDENTIALS = {
  admin: { email: "admin@localloyalty.example", password: "localloyalty-admin" },
  rep: { email: "rep@localloyalty.example", password: "localloyalty-rep" },
  ownerPassword: "localloyalty-demo",
  ownerEmail: (slug: string) => `owner+${slug}@example.com`,
  staffPin: "1234",
  /** BIA console login for the Roncesvalles neighbourhood (manager of its campaigns). */
  bia: { email: BIA_DEMO.email(BIA_DEMO.hood), password: BIA_DEMO.password },
} as const;

export interface SeedOptions {
  /** Number of customers (default 120). Tests use fewer. */
  customers?: number;
  /** Days of visit history (default 90). */
  days?: number;
  config?: Config;
  /** RNG seed for reproducible data. */
  seed?: number;
  log?: (msg: string) => void;
}

export interface SeedResult {
  skipped: boolean;
  neighbourhoods: number;
  merchants: number;
  customers: number;
  visits: number;
  redemptions: number;
  leads: number;
  /** Ridgeway Plaza restaurant corridor (own neighbourhood; counts are not included above). */
  corridor?: { merchants: number; customers: number; visits: number; orders: number };
  credentials: { role: string; email: string; password: string; merchant?: string }[];
  /** Pricing v2: paid features are hidden at launch; these pilot shops get them via admin per-merchant overrides. */
  pilotOverrides: { slug: string; merchant: string; features: FeatureKey[] }[];
}

/**
 * Pricing v2: only loyalty + reporting are free. Promos, discount cards, VIP, birthday/referral bonuses,
 * email campaigns and CSV are Plus and hidden at launch, so the demo turns them on for a few pilot shops
 * with admin overrides (exactly how real pilots get them). Other shops' promos stay in the DB but hidden.
 */
export const DEMO_PILOT_FEATURES: FeatureKey[] = [
  "promos.basic",
  "promos.double_points",
  "discount_cards",
  "loyalty.vip_levels",
  "loyalty.birthday_bonus",
  "loyalty.referrals",
  "marketing.email",
  "customers.csv_export",
  "reports.advanced",
];
export const DEMO_PILOT_SHOPS = ["pinecone-coffee", "hearth-and-crumb", "village-apothecary"] as const;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
  };
}

function credentialsList(): SeedResult["credentials"] {
  return [
    { role: "admin", email: DEMO_CREDENTIALS.admin.email, password: DEMO_CREDENTIALS.admin.password },
    { role: "rep", email: DEMO_CREDENTIALS.rep.email, password: DEMO_CREDENTIALS.rep.password },
    { role: "bia", email: DEMO_CREDENTIALS.bia.email, password: DEMO_CREDENTIALS.bia.password, merchant: "Roncesvalles Village BIA" },
    ...MERCHANTS.map((m) => ({ role: "owner", email: DEMO_CREDENTIALS.ownerEmail(m.slug), password: DEMO_CREDENTIALS.ownerPassword, merchant: m.name })),
    ...RESTAURANT_SHOPS.map((m) => ({ role: "owner", email: DEMO_CREDENTIALS.ownerEmail(m.slug), password: DEMO_CREDENTIALS.ownerPassword, merchant: `${m.name} (${m.tier ? `restaurant ${m.tier}` : "network shop"})` })),
  ];
}

function pilotList(): SeedResult["pilotOverrides"] {
  return DEMO_PILOT_SHOPS.map((slug) => ({ slug, merchant: MERCHANTS.find((m) => m.slug === slug)!.name, features: DEMO_PILOT_FEATURES }));
}

export async function seedDemo(db: Db, opts: SeedOptions = {}): Promise<SeedResult> {
  const log = opts.log ?? (() => {});
  const [existing] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, "roncesvalles")).limit(1);
  if (existing) {
    log("Demo data already present (neighbourhood 'roncesvalles' exists) — skipping.");
    // Older dev databases get the core-module data (no-op when present) and the Ridgeway Plaza restaurant corridor added.
    const skipConfig = { ...(opts.config ?? loadConfig({ NODE_ENV: "development" })) };
    const skipClock = { now: new Date() };
    await seedCoreModules(db, { db, config: skipConfig, providers: createProviders({ ...skipConfig, env: "test" }), now: () => skipClock.now }, skipClock, { seed: opts.seed, log });
    await seedRestaurantCorridor(db, { config: opts.config, ownerPassword: DEMO_CREDENTIALS.ownerPassword, staffPin: DEMO_CREDENTIALS.staffPin, log });
    await seedAppointmentSalons(db, { db, config: skipConfig, providers: createProviders({ ...skipConfig, env: "test" }), now: () => skipClock.now }, skipClock, { ownerPassword: DEMO_CREDENTIALS.ownerPassword, log });
    await seedServiceOps(db, { log });
    await seedBiaDemo(db, { log });
    return { skipped: true, neighbourhoods: 0, merchants: 0, customers: 0, visits: 0, redemptions: 0, leads: 0, credentials: credentialsList(), pilotOverrides: pilotList() };
  }

  const R = rng(opts.seed ?? 20261021);
  const config = { ...(opts.config ?? loadConfig({ NODE_ENV: "development" })) };
  const clock = { now: new Date() };
  const ctx: AppContext = { db, config, providers: createProviders({ ...config, env: "test" }), now: () => clock.now };
  const realStart = new Date();
  const days = opts.days ?? 90;
  const historyStart = new Date(realStart.getTime() - days * DAY);

  // ---- Neighbourhoods ----
  const hoodIds: Record<string, string> = {};
  for (const n of NEIGHBOURHOODS) {
    const [row] = await db.insert(neighbourhoods).values({ ...n, city: "Toronto", province: "ON" }).returning({ id: neighbourhoods.id });
    hoodIds[n.slug] = row!.id;
  }
  log(`Neighbourhoods: ${NEIGHBOURHOODS.map((n) => n.name).join(", ")}`);

  // ---- Platform users ----
  const [adminHash, repHash, ownerHash] = await Promise.all([
    bcrypt.hash(DEMO_CREDENTIALS.admin.password, 10),
    bcrypt.hash(DEMO_CREDENTIALS.rep.password, 10),
    bcrypt.hash(DEMO_CREDENTIALS.ownerPassword, 10),
  ]);
  const mkUser = async (v: Partial<typeof users.$inferInsert>) => {
    const [u] = await db
      .insert(users)
      .values({ memberCode: await generateMemberCode(db), createdAt: historyStart, emailVerifiedAt: v.email ? historyStart : null, ...v })
      .returning();
    return u!;
  };
  await mkUser({ email: DEMO_CREDENTIALS.admin.email, name: "Network Admin", passwordHash: adminHash, platformRole: "admin" });
  const rep = await mkUser({ email: DEMO_CREDENTIALS.rep.email, name: "Riley Onboarding Rep", passwordHash: repHash, platformRole: "rep", phone: "+14165550001" });

  // ---- Merchants (from vertical templates) ----
  const created: { data: DemoMerchant; id: string; locationId: string; createdAt: Date }[] = [];
  for (const [i, m] of MERCHANTS.entries()) {
    const owner = await mkUser({ email: DEMO_CREDENTIALS.ownerEmail(m.slug), name: `${R.pick(FIRST_NAMES)} ${R.pick(LAST_NAMES)}`, passwordHash: ownerHash });
    // Pilot shops joined 60–110 days ago; the next strips more recently.
    const signedAt = m.neighbourhood === "roncesvalles" ? new Date(historyStart.getTime() - (20 - i) * DAY) : new Date(realStart.getTime() - R.int(3, 12) * DAY);
    clock.now = signedAt;
    const { merchant, location } = await createMerchantWithTemplate(ctx, {
      body: { name: m.name, vertical: m.vertical, address: m.address, postalCode: m.postalCode, phone: `+1416555${String(3000 + i).padStart(4, "0")}`, neighbourhoodId: hoodIds[m.neighbourhood], lat: m.lat, lng: m.lng, hours: m.hours },
      ownerUserId: owner.id,
      repUserId: m.viaRep ? rep.id : null,
      actorUserId: m.viaRep ? rep.id : owner.id,
    });
    await db
      .update(merchants)
      .set({
        slug: m.slug,
        description: m.description,
        brandColor: m.brandColor,
        instagram: m.instagram,
        email: `hello+${m.slug}@example.com`,
        website: `https://${m.slug}.example.com`,
        // No remote placeholder images (they fail offline); apps render coloured initials from brandColor.
        logoUrl: null,
        coverUrl: null,
        createdAt: signedAt,
      })
      .where(eq(merchants.id, merchant.id));
    if (m.vertical === "repair_auto" || m.vertical === "salon") {
      await db.update(loyaltyPrograms).set({ birthdayBonus: 50 }).where(eq(loyaltyPrograms.merchantId, merchant.id));
    }
    created.push({ data: m, id: merchant.id, locationId: location.id, createdAt: signedAt });
  }
  // A counter staff member with a PIN at the café.
  const cafe = created.find((c) => c.data.slug === "pinecone-coffee")!;
  const barista = await mkUser({ email: "staff+pinecone-coffee@example.com", name: "Sam Barista", passwordHash: ownerHash });
  await db.insert(merchantStaff).values({ merchantId: cafe.id, userId: barista.id, role: "staff", pinHash: await bcrypt.hash(DEMO_CREDENTIALS.staffPin, 8) });
  log(`Merchants: ${created.length}`);

  // ---- Network perk + promos ----
  await db.insert(networkPerks).values({
    neighbourhoodId: hoodIds.roncesvalles!,
    name: "Roncy Explorer",
    description: "Visit 3 different shops on Roncesvalles within 30 days and get 50 bonus points, on us.",
    threshold: 3,
    windowDays: 30,
    bonusPoints: 50,
    createdAt: historyStart,
  });
  const byslug = (s: string) => created.find((c) => c.data.slug === s)!.id;
  const nowReal = realStart;
  // Pilot overrides first, so the seeded history earns with their promo boosts.
  await db.insert(featureOverrides).values(
    DEMO_PILOT_SHOPS.flatMap((slug) => DEMO_PILOT_FEATURES.map((key) => ({ merchantId: byslug(slug), key, enabled: true, reason: "Demo pilot shop (Pricing v2)", createdAt: historyStart }))),
  );
  log(`Pilot overrides (Plus features hidden at launch): ${DEMO_PILOT_SHOPS.join(", ")} get ${DEMO_PILOT_FEATURES.join(", ")}`);
  await db.insert(promos).values([
    { merchantId: byslug("pinecone-coffee"), title: "Two-stamp Tuesdays", body: "Every Tuesday, every drink earns double stamps.", kind: "multiplier", multiplierPct: 200, daysOfWeek: [2], startsAt: new Date(historyStart.getTime() + 10 * DAY), status: "live", audience: "network", viewCount: 412, claimCount: 0 },
    { merchantId: byslug("pinecone-coffee"), title: "Double stamps on slow afternoons", body: "Weekdays 2 to 4 pm, every drink earns double stamps.", kind: "multiplier", multiplierPct: 200, daysOfWeek: [1, 2, 3, 4, 5], startTime: "14:00", endTime: "16:00", startsAt: new Date(historyStart.getTime() + 30 * DAY), status: "live", audience: "network", viewCount: 0, claimCount: 0 },
    { merchantId: byslug("hearth-and-crumb"), title: "Pączki Saturday", body: "Fresh pączki every Saturday until they're gone.", kind: "offer", daysOfWeek: [6], startTime: "08:00", endTime: "12:00", startsAt: new Date(historyStart.getTime() + 5 * DAY), status: "live", audience: "network", viewCount: 260, claimCount: 41 },
    { merchantId: byslug("dog-eared-books"), title: "Weekend reader bonus", body: "50 bonus points on any purchase this weekend.", kind: "bonus_points", bonusPoints: 50, startsAt: new Date(nowReal.getTime() - 20 * DAY), endsAt: new Date(nowReal.getTime() - 18 * DAY), status: "ended", audience: "members", viewCount: 95, claimCount: 12 },
    { merchantId: byslug("village-apothecary"), title: "Seniors Day: 10% off front store", body: "First Tuesday of the month. Not valid on prescriptions or pharmacy services.", kind: "discount", percentOff: 10, daysOfWeek: [2], startsAt: new Date(historyStart.getTime() + 15 * DAY), status: "live", audience: "network", viewCount: 150, claimCount: 33 },
    { merchantId: byslug("nonnas-table"), title: "Pasta-making night", body: "Thursday 7pm, $45 including dinner. Members get a free tiramisu.", kind: "event", startsAt: new Date(nowReal.getTime() + 9 * DAY), endsAt: new Date(nowReal.getTime() + 9 * DAY + 3 * 3600_000), status: "scheduled", audience: "network", viewCount: 30, claimCount: 0 },
    { merchantId: byslug("village-green-grocer"), title: "Ontario apple week", body: "Triple points on Ontario apples.", kind: "multiplier", multiplierPct: 300, startsAt: new Date(nowReal.getTime() + 3 * DAY), endsAt: new Date(nowReal.getTime() + 10 * DAY), status: "draft", audience: "network" },
  ]);

  // ---- Customers + visit history ----
  const nCustomers = opts.customers ?? 120;
  const pilot = created.filter((c) => c.data.neighbourhood === "roncesvalles");
  const totalWeight = pilot.reduce((s, c) => s + c.data.weight, 0);
  const pickShop = () => {
    let r = R.next() * totalWeight;
    for (const c of pilot) if ((r -= c.data.weight) <= 0) return c;
    return pilot[0]!;
  };
  const pharmacyCats = new Map<string, { front: string; rx: string }>();
  for (const c of created.filter((x) => x.data.vertical === "pharmacy")) {
    const cats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, c.id));
    pharmacyCats.set(c.id, { front: cats.find((x) => x.name === "Front store")!.id, rx: cats.find((x) => x.name === "Prescriptions")!.id });
  }

  interface Event {
    at: Date;
    phone: string;
    name: string;
    consent: boolean;
    shop: (typeof created)[number];
  }
  const events: Event[] = [];
  const customerMeta: { phone: string; name: string; email: string | null; birthday: string | null }[] = [];
  for (let i = 0; i < nCustomers; i++) {
    const first = R.pick(FIRST_NAMES);
    const last = R.pick(LAST_NAMES);
    const name = `${first} ${last}`;
    const phone = `+1647555${String(1000 + i).padStart(4, "0")}`;
    const consent = R.chance(0.65);
    customerMeta.push({
      phone,
      name,
      email: R.chance(0.7) ? `${first}.${last}.${i}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@example.com" : null,
      birthday: R.chance(0.5) ? `${String(R.int(1, 12)).padStart(2, "0")}-${String(R.int(1, 28)).padStart(2, "0")}` : null,
    });
    // Regulars visit more shops more often; a long tail visits once.
    const shopsCount = R.chance(0.35) ? R.int(3, 5) : R.int(1, 2);
    const shops = new Set<(typeof created)[number]>();
    for (let k = 0; k < shopsCount * 3 && shops.size < shopsCount; k++) shops.add(pickShop());
    const joinedDay = R.int(0, days - 3);
    for (const shop of shops) {
      const freq = shop.data.weight >= 6 ? R.int(2, 10) : R.int(1, 3);
      const usedDays = new Set<number>();
      for (let v = 0; v < freq; v++) {
        const day = Math.min(days - 1, joinedDay + R.int(0, days - joinedDay - 1));
        if (usedDays.has(day)) continue;
        usedDays.add(day);
        const at = new Date(historyStart.getTime() + day * DAY + R.int(8 * 60, 19 * 60) * 60000 + 4 * 3600_000); // 8:00–19:00 Toronto ≈ UTC+4/5
        if (at > nowReal || at < shop.createdAt) continue;
        events.push({ at, phone, name, consent, shop });
      }
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  let visitCount = 0;
  let redemptionCount = 0;
  const seenUsers = new Set<string>();
  const backdate = async (memberId: string, userId: string, at: Date) => {
    const since = realStart;
    await db.update(visits).set({ createdAt: at }).where(and(eq(visits.memberId, memberId), gt(visits.createdAt, since)));
    await db.update(ledgerTransactions).set({ createdAt: at }).where(and(eq(ledgerTransactions.memberId, memberId), gt(ledgerTransactions.createdAt, since)));
    await db.update(redemptions).set({ createdAt: at }).where(and(eq(redemptions.memberId, memberId), gt(redemptions.createdAt, since)));
    await db.update(merchantMembers).set({ createdAt: at }).where(and(eq(merchantMembers.id, memberId), gt(merchantMembers.createdAt, since)));
    await db.update(networkPerkAwards).set({ createdAt: at }).where(and(eq(networkPerkAwards.userId, userId), gt(networkPerkAwards.createdAt, since)));
    if (!seenUsers.has(userId)) {
      seenUsers.add(userId);
      await db.update(users).set({ createdAt: at }).where(and(eq(users.id, userId), gt(users.createdAt, since)));
    }
  };
  for (const e of events) {
    clock.now = e.at;
    const [lo, hi] = e.shop.data.ticket;
    const amount = Math.round(R.int(lo, hi) / 5) * 5;
    const cats = pharmacyCats.get(e.shop.id);
    const lines = cats ? [{ amountCents: amount, categoryId: cats.front }, ...(R.chance(0.4) ? [{ amountCents: R.int(1000, 9000), categoryId: cats.rx }] : [])] : undefined;
    try {
      const r = await awardPurchase(ctx, {
        merchantId: e.shop.id,
        phone: e.phone,
        customerName: e.name,
        amountCents: lines ? undefined : amount,
        lines,
        source: R.chance(0.15) ? "square" : "staff_app",
        locationId: e.shop.locationId,
        joinedVia: R.chance(0.6) ? "qr" : "phone",
        consent: e.consent ? { text: `Yes, send me offers from ${e.shop.data.name}. Unsubscribe anytime.`, source: "counter" } : null,
        ignoreCooldown: true,
      });
      visitCount++;
      if (r.rewardsAvailable.length && R.chance(0.4)) {
        clock.now = new Date(e.at.getTime() + 60000);
        await redeemReward(ctx, { merchantId: e.shop.id, memberId: r.member.id, rewardId: r.rewardsAvailable[0]!.id, source: "staff_app", locationId: e.shop.locationId });
        redemptionCount++;
      }
      await backdate(r.member.id, r.member.userId, e.at);
    } catch (err) {
      log(`  skipped a visit: ${(err as Error).message}`);
    }
  }
  // Profile details for customers (emails, birthdays).
  for (const c of customerMeta) {
    await db.update(users).set({ email: c.email, birthday: c.birthday, postalCode: "M6R" }).where(eq(users.phone, c.phone));
  }
  // A few members tagged and annotated, one muted shop.
  const someMembers = await db.select({ id: merchantMembers.id }).from(merchantMembers).where(eq(merchantMembers.merchantId, cafe.id)).limit(5);
  if (someMembers.length) {
    await db.update(merchantMembers).set({ tags: ["regular"], notes: "Oat flat white, extra hot" }).where(inArray(merchantMembers.id, someMembers.slice(0, 3).map((m) => m.id)));
    await db.update(merchantMembers).set({ muted: true }).where(eq(merchantMembers.id, someMembers[someMembers.length - 1]!.id));
  }
  log(`Customers: ${nCustomers}, visits: ${visitCount}, redemptions: ${redemptionCount}`);

  // Pilot shops are live on the network (activation is tracked separately via activatedAt).
  await db.update(merchants).set({ status: "active" }).where(inArray(merchants.id, pilot.map((p) => p.id)));

  // ---- A sent and a draft campaign ----
  const [reach] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.merchantId, cafe.id), sql`${merchantMembers.marketingConsentAt} is not null`, eq(merchantMembers.muted, false), sql`${users.email} is not null`));
  await db.insert(messages).values([
    { merchantId: cafe.id, channel: "email", subject: "Two-stamp Tuesdays are here", body: "Every Tuesday, every drink earns double stamps. See you soon!", segment: { kind: "all" }, status: "sent", sentAt: new Date(nowReal.getTime() - 14 * DAY), recipientCount: Number(reach?.n ?? 0), createdAt: new Date(nowReal.getTime() - 14 * DAY) },
    { merchantId: byslug("hearth-and-crumb"), channel: "email", subject: "We miss you!", body: "Hi {{first_name}}, your {{balance}} stamps are waiting.", segment: { kind: "lapsed", days: 30 }, status: "draft" },
  ]);

  // ---- Leads ----
  for (const l of LEADS) {
    const [lead] = await db
      .insert(leads)
      .values({
        businessName: l.businessName,
        vertical: l.vertical,
        address: l.address,
        contactName: l.contactName,
        neighbourhoodId: hoodIds[l.neighbourhood] ?? null,
        stage: l.stage,
        currentLoyalty: l.currentLoyalty,
        notes: l.notes || null,
        assignedRepId: rep.id,
        nextActionAt: l.nextActionInDays === null ? null : new Date(nowReal.getTime() + l.nextActionInDays * DAY),
        createdAt: new Date(nowReal.getTime() - 14 * DAY),
      })
      .returning({ id: leads.id });
    for (const a of l.activities) {
      await db.insert(leadActivities).values({ leadId: lead!.id, repUserId: rep.id, kind: a.kind, outcome: a.outcome, notes: a.notes || null, createdAt: new Date(nowReal.getTime() - a.daysAgo * DAY) });
    }
  }
  // Leads that became merchants.
  for (const c of created.filter((x) => x.data.viaRep)) {
    const [m] = await db.select({ activatedAt: merchants.activatedAt }).from(merchants).where(eq(merchants.id, c.id));
    await db.insert(leads).values({
      businessName: c.data.name,
      vertical: c.data.vertical,
      address: c.data.address,
      neighbourhoodId: hoodIds[c.data.neighbourhood] ?? null,
      stage: m?.activatedAt ? "activated" : "signed",
      assignedRepId: rep.id,
      merchantId: c.id,
      createdAt: new Date(c.createdAt.getTime() - 7 * DAY),
    });
  }
  const [{ n: leadCount } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads);
  log(`Leads: ${leadCount}`);

  // ---- Core modules on the pilot shops: catalog, orders, slots, tickets, promos, cards, ads ----
  clock.now = nowReal;
  await seedCoreModules(db, ctx, clock, { seed: opts.seed, log });
  clock.now = new Date();

  // ---- Ridgeway Plaza restaurant corridor (restaurant pack demo) ----
  const corridor = await seedRestaurantCorridor(db, { config, ownerPassword: DEMO_CREDENTIALS.ownerPassword, staffPin: DEMO_CREDENTIALS.staffPin, log });

  // ---- Appointment salons: Bloom Hair Studio (Roncesvalles) and Rangrez Beauty Studio (Ridgeway Plaza) ----
  clock.now = new Date();
  await seedAppointmentSalons(db, ctx, clock, { ownerPassword: DEMO_CREDENTIALS.ownerPassword, log });
  await seedServiceOps(db, { log });
  await seedBiaDemo(db, { log });
  await seedRepAdmin(db, { repId: rep.id, log });
  const [{ n: allLeads } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(leads);
  await backfillMilestones(db);
  clock.now = new Date();

  return {
    skipped: false,
    neighbourhoods: NEIGHBOURHOODS.length,
    merchants: created.length,
    customers: nCustomers,
    visits: visitCount,
    redemptions: redemptionCount,
    leads: Number(allLeads),
    corridor: { merchants: corridor.merchants, customers: corridor.customers, visits: corridor.visits, orders: corridor.orders },
    credentials: credentialsList(),
    pilotOverrides: pilotList(),
  };
}
