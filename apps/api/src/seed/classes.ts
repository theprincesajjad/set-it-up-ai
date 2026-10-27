/**
 * Class-studio demo data (docs/research/fitness-studios.md, Figma frames 01 to 08):
 *
 *   Sakina Studio   a women-only studio in Ridgeway Plaza, Mississauga (new shop): bhangra cardio, mat pilates,
 *                   women-only strength, vinyasa and boxing fundamentals; a drop-in, a 10-class pack, an intro offer,
 *                   an unlimited membership and a 3-month fixed-term membership; about 40 students: members, one frozen,
 *                   one with a failed payment, one whose renewal notice is due; a full class with a waitlist tomorrow evening.
 *   Rise Yoga Studio (the existing Roncesvalles demo shop): vinyasa, yin and prenatal, a free first class, a pack and
 *                   an unlimited membership.
 *
 * Classes are laid out relative to "now" (Toronto time) so the schedule always has today and the next two weeks.
 * Customers are fictional (+1905555 06xx). Money rows are consistent with what the API would have written:
 * passes have the credits their bookings used, every membership has its paid first period (and the failed one
 * for the past-due member). Idempotent: a shop that already has class types is left alone.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { classBookings, classCharges, classMemberships, classPasses, classProducts, classSessions, classSettings, classTypes, featureOverrides, locations, loyaltyPrograms, merchantStaff, merchants, neighbourhoods, users, type Db } from "@ll/db";
import type { FeatureKey } from "@ll/shared";
import type { AppContext } from "../context.js";
import { addDays, zonedToUtc } from "../services/bookings.js";
import { localParts } from "../services/appointments.js";
import { createMerchantWithTemplate } from "../services/merchant.js";
import { ensureMember, findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";

const DAY = 86_400_000;
const TZ = "America/Toronto";
const FEATURES: FeatureKey[] = ["booking.classes", "memberships.recurring", "payments.in_app"];

interface TypeSeed { key: string; name: string; min: number; cap: number; women: boolean; description?: string }
interface Slot { type: string; dow: number; at: string; who: string; weeks?: number }

const SAKINA_TYPES: TypeSeed[] = [
  { key: "bhangra", name: "Bhangra Cardio", min: 60, cap: 16, women: true, description: "Dance cardio to dhol beats. All levels, no experience needed." },
  { key: "pilates", name: "Mat Pilates", min: 55, cap: 14, women: true, description: "Core strength and posture on the mat." },
  { key: "strength", name: "Women-only Strength", min: 60, cap: 14, women: true, description: "Dumbbells and bodyweight, coached." },
  { key: "vinyasa", name: "Vinyasa Flow", min: 60, cap: 16, women: true, description: "Breath-led flow, windows covered." },
  { key: "boxing", name: "Boxing Fundamentals", min: 60, cap: 12, women: true, description: "Footwork, jab-cross and bag rounds." },
];
const SAKINA_SLOTS: Slot[] = [
  { type: "vinyasa", dow: 1, at: "06:00", who: "Amira K." }, { type: "bhangra", dow: 1, at: "18:30", who: "Simran G." }, { type: "pilates", dow: 1, at: "20:00", who: "Hira M." },
  { type: "boxing", dow: 2, at: "07:00", who: "Coach Dee" }, { type: "vinyasa", dow: 2, at: "12:15", who: "Amira K." }, { type: "strength", dow: 2, at: "19:00", who: "Hira M." },
  { type: "pilates", dow: 3, at: "09:30", who: "Hira M." }, { type: "bhangra", dow: 3, at: "18:30", who: "Simran G." }, { type: "boxing", dow: 3, at: "20:00", who: "Coach Dee" },
  { type: "vinyasa", dow: 4, at: "06:00", who: "Amira K." }, { type: "strength", dow: 4, at: "19:00", who: "Hira M." }, { type: "pilates", dow: 4, at: "20:15", who: "Hira M." },
  { type: "bhangra", dow: 5, at: "18:00", who: "Simran G." }, { type: "boxing", dow: 6, at: "10:00", who: "Coach Dee" }, { type: "vinyasa", dow: 6, at: "11:15", who: "Amira K." },
  { type: "pilates", dow: 0, at: "10:00", who: "Hira M." },
];
const RISE_TYPES: TypeSeed[] = [
  { key: "vinyasa", name: "Vinyasa Flow", min: 60, cap: 18, women: false, description: "A steady flow for every level." },
  { key: "yin", name: "Yin Yoga", min: 75, cap: 14, women: false, description: "Long, quiet holds to unwind." },
  { key: "prenatal", name: "Prenatal Yoga", min: 60, cap: 10, women: false, description: "Gentle, for every trimester." },
];
const RISE_SLOTS: Slot[] = [
  { type: "vinyasa", dow: 1, at: "07:00", who: "Maya R." }, { type: "yin", dow: 1, at: "19:30", who: "Jonah B." }, { type: "vinyasa", dow: 3, at: "07:00", who: "Maya R." },
  { type: "prenatal", dow: 3, at: "18:00", who: "Lena P." }, { type: "vinyasa", dow: 5, at: "12:15", who: "Maya R." }, { type: "yin", dow: 6, at: "09:30", who: "Jonah B." }, { type: "vinyasa", dow: 0, at: "10:00", who: "Maya R." },
];

const STUDENTS: [string, string][] = [
  ["Priya Sandhu", "+19055550601"], ["Jasleen Gill", "+19055550602"], ["Fatima Rahman", "+19055550603"], ["Navneet Kaur", "+19055550604"], ["Sadia Malik", "+19055550605"],
  ["Harleen Dhillon", "+19055550606"], ["Rupinder Bains", "+19055550607"], ["Tahira Ali", "+19055550608"], ["Gurleen Sidhu", "+19055550609"], ["Amna Siddiqui", "+19055550610"],
  ["Manpreet Brar", "+19055550611"], ["Zainab Khan", "+19055550612"], ["Simranjeet Toor", "+19055550613"], ["Ayesha Chaudhry", "+19055550614"], ["Kiran Mann", "+19055550615"],
  ["Noor Hussain", "+19055550616"], ["Parminder Johal", "+19055550617"], ["Hina Qureshi", "+19055550618"], ["Baljit Gill", "+19055550619"], ["Sara Mirza", "+19055550620"],
];

async function ensureFeatures(db: Db, merchantId: string) {
  await db
    .insert(featureOverrides)
    .values(FEATURES.map((key) => ({ merchantId, key, enabled: true, reason: "Demo class studio" })))
    .onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
}

async function seedStudio(
  db: Db,
  ctx: AppContext,
  merchantId: string,
  def: { types: TypeSeed[]; slots: Slot[]; students: [string, string][]; products: "sakina" | "rise" },
  log: (m: string) => void,
): Promise<boolean> {
  const [already] = await db.select({ id: classTypes.id }).from(classTypes).where(eq(classTypes.merchantId, merchantId)).limit(1);
  if (already) return false;
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const [loc] = await db.select().from(locations).where(eq(locations.merchantId, merchantId)).limit(1);
  if (!m || !loc) return false;
  const now = new Date();
  const today = localParts(now, TZ).date;

  await db.insert(classSettings).values({ merchantId, cancelWindowHours: 12, lateFeeCents: 1000, waitlistCutoffMinutes: 120, freezeMaxDays: 30, freezesPerYear: 2, renewalNoticeDays: 60, termsNote: def.products === "sakina" ? "Women-only room: women instructors and members, windows covered, no photos or video. Please arrive 5 minutes early." : "Bring your own mat or rent one for $2." }).onConflictDoNothing();
  await db.update(merchants).set({ taxRegistered: true, taxNumber: "812345678RT0001", stripeAccountId: m.stripeAccountId ?? `acct_demo_${m.slug}`, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true }).where(eq(merchants.id, merchantId));
  await ensureFeatures(db, merchantId);
  await db.update(loyaltyPrograms).set({ earnType: "per_visit", pointsPerVisit: 10 }).where(eq(loyaltyPrograms.merchantId, merchantId));

  // Class types and the weekly pattern for the next two weeks (plus last week for history).
  const typeId = new Map<string, string>();
  for (const [i, t] of def.types.entries()) {
    const [r] = await db.insert(classTypes).values({ merchantId, name: t.name, description: t.description ?? null, durationMin: t.min, capacity: t.cap, womenOnly: t.women, sort: i }).returning({ id: classTypes.id });
    typeId.set(t.key, r!.id);
  }
  const sessions: { id: string; startsAt: Date; type: string; cap: number; slot: Slot }[] = [];
  for (let d = -7; d < 15; d++) {
    const date = addDays(today, d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const sl of def.slots.filter((x) => x.dow === dow)) {
      const t = def.types.find((x) => x.key === sl.type)!;
      const [h, mi] = sl.at.split(":").map(Number) as [number, number];
      const startsAt = zonedToUtc(date, h * 60 + mi, TZ);
      const [r] = await db.insert(classSessions).values({ merchantId, locationId: loc.id, classTypeId: typeId.get(sl.type)!, name: t.name, instructorName: sl.who, startsAt, endsAt: new Date(startsAt.getTime() + t.min * 60_000), capacity: t.cap, womenOnly: t.women, createdAt: new Date(startsAt.getTime() - 10 * DAY), updatedAt: now }).returning({ id: classSessions.id });
      sessions.push({ id: r!.id, startsAt, type: sl.type, cap: t.cap, slot: sl });
    }
  }

  // What the studio sells.
  const prod = async (v: Omit<typeof classProducts.$inferInsert, "merchantId">) => (await db.insert(classProducts).values({ merchantId, ...v }).returning())[0]!;
  const sak = def.products === "sakina";
  const dropIn = await prod({ kind: "drop_in", name: "Drop-in", priceCents: sak ? 2500 : 2800, sort: 0 });
  const pack = await prod({ kind: "pack", name: "10-class pack", priceCents: sak ? 18000 : 20000, credits: 10, validDays: 90, sort: 1 });
  const intro = await prod(sak ? { kind: "pack", name: "Intro: 3 classes", priceCents: 3900, credits: 3, validDays: 30, introOnly: true, sort: 2 } : { kind: "pack", name: "First class free", priceCents: 0, credits: 1, validDays: 30, introOnly: true, sort: 2 });
  const unlimited = await prod({ kind: "membership", name: "Unlimited monthly", priceCents: sak ? 12900 : 14000, sort: 3 });
  const term = await prod({ kind: "membership", name: sak ? "4 classes a month, 3-month term" : "8 classes a month, 3-month term", priceCents: sak ? 6900 : 11000, termMonths: 3, classesPerMonth: sak ? 4 : 8, sort: 4 });

  // Students: customers, members of the studio.
  const students: { id: string; name: string }[] = [];
  for (const [name, phone] of def.students) {
    const { user } = await findOrCreateCustomerByPhone(db, phone, name);
    await db.transaction((tx) => ensureMember(ctx, tx, { merchantId, userId: user.id, joinedVia: "phone", locationId: loc.id, consent: null, source: "staff_app" }));
    students.push({ id: user.id, name });
  }
  const stu = (i: number) => students[i % students.length]!;

  const charge = (userId: string, v: Partial<typeof classCharges.$inferInsert> & { kind: string; amountCents: number; paidAt: Date }) => db.insert(classCharges).values({ merchantId, userId, taxCents: Math.round((v.amountCents * 13) / 113), platformFeeCents: Math.round(((v.amountCents - Math.round((v.amountCents * 13) / 113)) * 1) / 100), status: "paid", paymentMethod: "card", ...v, createdAt: v.paidAt }).returning();
  const memberRow = async (i: number, p: typeof unlimited, daysAgo: number, over: Partial<typeof classMemberships.$inferInsert> = {}) => {
    const u = stu(i);
    const start = addDays(today, -daysAgo);
    const monthsIn = Math.floor(daysAgo / 30);
    const periodStart = addDays(start, monthsIn * 30);
    const periodEnd = addDays(periodStart, 29);
    const tax = Math.round((p.priceCents * 13) / 100);
    const [r] = await db
      .insert(classMemberships)
      .values({
        merchantId, userId: u.id, productId: p.id, name: p.name, status: "active", priceCents: p.priceCents, termMonths: p.termMonths, classesPerMonth: p.classesPerMonth,
        startDate: start, termEndsOn: p.termMonths ? addDays(start, p.termMonths * 30 - 1) : null, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, nextBillingDate: addDays(periodEnd, 1),
        stripeCustomerId: `cus_demo_${i}`, paymentMethodId: "pm_fake_visa_4242", paymentMethodBrand: "visa", paymentMethodLast4: "4242",
        agreementText: `MEMBERSHIP AGREEMENT\nStudio: ${m.name}\nServices: ${p.name}\nPrice: $${(p.priceCents / 100).toFixed(2)} + HST each month.\nTerm: ${p.termMonths ? `Fixed term of ${p.termMonths} months` : "Month to month"}.\nCancelling: full refund within 10 days; after that cancel any time in the app.`,
        agreementAcceptedAt: new Date(now.getTime() - daysAgo * DAY), coolingOffEndsOn: addDays(start, 10), createdAt: new Date(now.getTime() - daysAgo * DAY), updatedAt: now, ...over,
      })
      .returning();
    for (let k = 0; k <= monthsIn; k++) {
      const ps = addDays(start, k * 30);
      const last = k === monthsIn;
      const failed = over.status === "past_due" && last;
      await charge(u.id, { kind: "membership", membershipId: r!.id, periodStart: ps, periodEnd: addDays(ps, 29), amountCents: p.priceCents + tax, taxCents: tax, platformFeeCents: Math.round(p.priceCents / 100), paidAt: new Date(now.getTime() - (daysAgo - k * 30) * DAY), ...(failed ? { status: "failed", paidAt: undefined as never, attempts: 1, lastAttemptOn: today } : {}) }).catch(() => undefined);
    }
    return r!;
  };
  const members = [
    await memberRow(0, unlimited, 75), await memberRow(1, unlimited, 40), await memberRow(3, unlimited, 130), await memberRow(6, unlimited, 12), await memberRow(9, unlimited, 5),
    await memberRow(10, unlimited, 95), await memberRow(11, term, 20), await memberRow(13, term, 35), await memberRow(14, unlimited, 160),
    // One on a freeze, one with a failed renewal, one whose notice is due (term ends in ~55 days), one that is ending.
    await memberRow(12, unlimited, 60, { status: "frozen", frozenFrom: addDays(today, -3), frozenUntil: addDays(today, 11), freezesUsed: 1 }),
    await memberRow(15, unlimited, 33, { status: "past_due" }),
    await memberRow(7, term, 36, { renewalNoticeSentAt: null }),
    await memberRow(16, unlimited, 50, { cancelEffectiveOn: addDays(today, 6), cancelledBy: "member", cancelReason: "Moving" }),
  ];
  // Packs.
  const mkPass = async (i: number, p: typeof pack, used: number, daysAgo: number, introOffer = false) => {
    const u = stu(i);
    const [r] = await db.insert(classPasses).values({ merchantId, userId: u.id, productId: p.id, name: p.name, creditsTotal: p.credits ?? 1, creditsLeft: Math.max(0, (p.credits ?? 1) - used), expiresAt: new Date(now.getTime() + ((p.validDays ?? 90) - daysAgo) * DAY), introOffer, status: used >= (p.credits ?? 1) ? "used_up" : "active", createdAt: new Date(now.getTime() - daysAgo * DAY), updatedAt: now }).returning();
    await charge(u.id, { kind: "pack", passId: r!.id, amountCents: p.priceCents + Math.round((p.priceCents * 13) / 100), taxCents: Math.round((p.priceCents * 13) / 100), platformFeeCents: Math.round(p.priceCents / 100), paidAt: new Date(now.getTime() - daysAgo * DAY), ...(p.priceCents === 0 ? { paymentMethod: "comp", amountCents: 0, taxCents: 0 } : {}) });
    return r!;
  };
  const passes = [await mkPass(2, pack, 5, 20), await mkPass(4, pack, 2, 9), await mkPass(5, pack, 7, 41), await mkPass(8, intro, 1, 6, true), await mkPass(17, intro, 0, 2, true), await mkPass(18, pack, 3, 14), await mkPass(19, pack, 9, 60)];

  // Bookings. Past classes: attended (and a few late cancels / no-shows); upcoming: booked, one full class with a waitlist.
  const upcoming = sessions.filter((s) => s.startsAt > now).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = sessions.filter((s) => s.startsAt <= now);
  const memberUsers = members.filter((x) => x.status === "active" || x.status === "frozen");
  let n = 0;
  const book = async (s: (typeof sessions)[number], userId: string, status: "booked" | "attended" | "late_cancelled" | "no_show" | "waitlisted", pay: { membershipId?: string; passId?: string } | null) => {
    const at = new Date(s.startsAt.getTime() - 2 * DAY);
    await db.insert(classBookings).values({ merchantId, sessionId: s.id, userId, status, source: "customer", payWith: pay?.membershipId ? "membership" : pay?.passId ? "pass" : null, membershipId: pay?.membershipId ?? null, passId: pay?.passId ?? null, waitlistedAt: status === "waitlisted" ? new Date(at.getTime() + n * 1000) : null, checkedInAt: status === "attended" ? new Date(s.startsAt.getTime() - 5 * 60_000) : null, cancelledAt: status === "late_cancelled" ? new Date(s.startsAt.getTime() - 4 * 3_600_000) : null, createdAt: at, updatedAt: at });
    n++;
  };
  for (const [i, s] of past.entries()) {
    const k = 3 + (i % 5);
    for (let j = 0; j < k; j++) {
      const m = memberUsers[(i + j) % memberUsers.length]!;
      await book(s, m.userId, i % 7 === 3 && j === 0 ? "late_cancelled" : i % 9 === 4 && j === 1 ? "no_show" : "attended", { membershipId: m.id }).catch(() => undefined);
    }
  }
  for (const [i, s] of upcoming.entries()) {
    const fullOne = i === 1 || (def.products === "sakina" && s.slot.type === "bhangra" && i < 4);
    const k = fullOne ? s.cap : 3 + (i % 6);
    const seen = new Set<string>();
    for (let j = 0; j < k; j++) {
      const m = memberUsers[(i * 3 + j) % memberUsers.length]!;
      if (seen.has(m.userId)) {
        // Fill the rest of a full class with pack holders and guests so the count is honest.
        const p = passes[(j + i) % passes.length]!;
        if (seen.has(p.userId) || p.status !== "active") continue;
        seen.add(p.userId);
        await book(s, p.userId, "booked", { passId: p.id }).catch(() => undefined);
        continue;
      }
      seen.add(m.userId);
      await book(s, m.userId, "booked", { membershipId: m.id }).catch(() => undefined);
    }
    if (fullOne) {
      // Three people wait; they hold a pass, so they are booked automatically the moment someone cancels.
      let w = 0;
      for (const p of passes) {
        if (w >= 3 || seen.has(p.userId) || p.status !== "active") continue;
        seen.add(p.userId);
        await book(s, p.userId, "waitlisted", null).catch(() => undefined);
        w++;
      }
    }
  }
  log(`Classes: ${m.name}: ${def.types.length} class types, ${sessions.length} classes, ${members.length} memberships, ${passes.length} packs, ${students.length} students`);
  return true;
}

/** Seed the demo studios (see the file header). Safe to run again. */
export async function seedClassStudios(db: Db, ctx: AppContext, opts: { ownerPassword: string; log?: (m: string) => void }): Promise<{ studios: number }> {
  const log = opts.log ?? (() => {});
  let studios = 0;

  // Rise Yoga Studio: already in the demo shops.
  const [rise] = await db.select().from(merchants).where(eq(merchants.slug, "rise-yoga-studio")).limit(1);
  if (rise && (await seedStudio(db, ctx, rise.id, { types: RISE_TYPES, slots: RISE_SLOTS, students: STUDENTS, products: "rise" }, log))) studios++;

  // Sakina Studio: a women-only studio in Ridgeway Plaza (created here, so it needs the corridor's neighbourhood).
  let [sakina] = await db.select().from(merchants).where(eq(merchants.slug, "sakina-studio")).limit(1);
  if (!sakina) {
    const [hood] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, "ridgeway-plaza")).limit(1);
    if (!hood) {
      log("Classes: Sakina Studio skipped (the Ridgeway Plaza corridor is not seeded)");
      return { studios };
    }
    const hash = await bcrypt.hash(opts.ownerPassword, 10);
    const [owner] = await db.insert(users).values({ email: "owner+sakina-studio@example.com", name: "Sakina Raza", passwordHash: hash, memberCode: await generateMemberCode(db), locale: "en-CA", emailVerifiedAt: new Date() }).returning();
    const created = await createMerchantWithTemplate(ctx, {
      body: { name: "Sakina Studio", vertical: "fitness", address: "Ridgeway Plaza, Unit 16, 3250 Ridgecrest Blvd", city: "Mississauga", postalCode: "L5R 3K2", phone: "+19055553016", neighbourhoodId: hood.id, lat: 43.5951, lng: -79.6458, hours: { mon: [["06:00", "21:00"]], tue: [["06:00", "21:00"]], wed: [["06:00", "21:00"]], thu: [["06:00", "21:00"]], fri: [["06:00", "20:00"]], sat: [["09:00", "14:00"]], sun: [["09:00", "13:00"]] } },
      ownerUserId: owner!.id,
      repUserId: null,
      actorUserId: owner!.id,
    });
    await db.update(merchants).set({ slug: "sakina-studio", description: "A women-only studio: bhangra cardio, pilates, strength, yoga and boxing. Women instructors, covered windows, no photos or video.", brandColor: "#5B2A86", instagram: "sakinastudio.ca", email: "hello+sakina-studio@example.com", status: "active" }).where(eq(merchants.id, created.merchant.id));
    const [deskUser] = await db.insert(users).values({ email: "staff+sakina-studio-desk@example.com", name: "Hina Desk", passwordHash: hash, memberCode: await generateMemberCode(db), locale: "en-CA", emailVerifiedAt: new Date() }).returning();
    await db.insert(merchantStaff).values({ merchantId: created.merchant.id, userId: deskUser!.id, role: "staff" });
    [sakina] = await db.select().from(merchants).where(and(eq(merchants.id, created.merchant.id))).limit(1);
  }
  if (sakina && (await seedStudio(db, ctx, sakina.id, { types: SAKINA_TYPES, slots: SAKINA_SLOTS, students: STUDENTS, products: "sakina" }, log))) studios++;
  return { studios };
}
