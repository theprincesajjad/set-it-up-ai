/**
 * Pharmacy demo (docs/research/pharmacies-wellness.md): Village Apothecary on Roncesvalles gets what a real pharmacy would set up.
 *
 *   - the pharmacist-owner confirmation (Schedule C), so the Pharmacy rules page shows "Confirmed"
 *   - the locked dispensary categories (also made by the vertical template; ensured here for older databases)
 *   - four appointment types (flu shot, vaccine appointment, medication review, pharmacist consultation): free to book, no deposit,
 *     filed under the locked "Pharmacy services" category, with one pharmacist on the shop's hours
 *   - a handful of booked and finished appointments for fictional people, and one draft front-store message
 *
 * Nothing here names a medication or a condition. Idempotent: a shop that already has appointment types is left alone.
 */
import { and, eq } from "drizzle-orm";
import { appointments, featureOverrides, locations, loyaltyPrograms, merchantStaff, merchants, messages, services, staffHours, users, type AppointmentItemRow, type Db } from "@ll/db";
import { PHARMACY_SERVICE_PRESETS } from "@ll/shared";
import bcrypt from "bcryptjs";
import type { AppContext } from "../context.js";
import { localParts } from "../services/appointments.js";
import { addDays, zonedToUtc } from "../services/bookings.js";
import { findOrCreateCustomerByPhone, generateMemberCode } from "../services/ledger.js";
import { ensureLockedCategories, pharmacyServiceFields } from "../services/pharmacy-guard.js";

const SLUG = "village-apothecary";
/** The pharmacist login the seed creates (printed by `pnpm seed`); the owner login is the shop's regular demo owner. */
export const PHARMACY_LOGINS = [{ email: `staff+${SLUG}-amira@example.com`, role: "manager", shop: "Village Apothecary (pharmacy)", name: "Amira Rahman" }] as const;
const MIN = 60_000;
const TYPES: { name: string; min: number; buffer: number }[] = [
  { name: PHARMACY_SERVICE_PRESETS[0], min: 15, buffer: 5 },
  { name: PHARMACY_SERVICE_PRESETS[1], min: 15, buffer: 5 },
  { name: PHARMACY_SERVICE_PRESETS[2], min: 30, buffer: 0 },
  { name: PHARMACY_SERVICE_PRESETS[3], min: 20, buffer: 0 },
];
const PEOPLE = [
  ["Priya Nair", "+14165550351"],
  ["Hamid Rezaei", "+14165550352"],
  ["Gurpreet Sandhu", "+14165550353"],
  ["Mary Kowalski", "+14165550354"],
  ["Tasneem Ali", "+14165550355"],
] as const;

export async function seedPharmacyDemo(db: Db, _ctx: AppContext, opts: { ownerPassword: string; log?: (m: string) => void }): Promise<boolean> {
  const log = opts.log ?? (() => {});
  const [row] = await db.select().from(merchants).where(eq(merchants.slug, SLUG)).limit(1);
  if (!row) return false;
  // No welcome bonus at a pharmacy (a visit may be a prescription visit).
  await db.update(loyaltyPrograms).set({ welcomeBonus: 0 }).where(eq(loyaltyPrograms.merchantId, row.id));
  const [have] = await db.select({ id: services.id }).from(services).where(eq(services.merchantId, row.id)).limit(1);
  if (have) return false;
  const [loc] = await db.select().from(locations).where(and(eq(locations.merchantId, row.id), eq(locations.active, true))).limit(1);
  if (!loc) return false;
  const realNow = new Date();

  await db
    .insert(featureOverrides)
    .values({ merchantId: row.id, key: "booking.appointments", enabled: true, reason: "Demo pharmacy" })
    .onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
  await ensureLockedCategories(db, row.id);

  // Pharmacist-owner confirmation.
  const [owner] = await db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, row.id), eq(merchantStaff.role, "owner"))).limit(1);
  await db
    .update(merchants)
    .set({ pharmacyConfirmedAt: new Date(realNow.getTime() - 3 * 86_400_000), pharmacyConfirmedByName: "Amira Rahman, B.Sc.Phm", pharmacyOcpNumber: "1234567", pharmacyConfirmedByUserId: owner?.userId ?? null, cancelWindowHours: 4, noShowFeeCents: 0 })
    .where(eq(merchants.id, row.id));

  // Appointment types (the same forced fields the API applies).
  const svcIds: { id: string; name: string; min: number }[] = [];
  for (const [i, t] of TYPES.entries()) {
    const forced = await pharmacyServiceFields(db, row.id, { name: t.name });
    const [s] = await db.insert(services).values({ merchantId: row.id, kind: "appointment", name: t.name, description: null, durationMin: t.min, bufferMin: t.buffer, sort: i, ...forced }).returning({ id: services.id });
    svcIds.push({ id: s!.id, name: t.name, min: t.min });
  }

  // One pharmacist on the shop's hours.
  const hash = await bcrypt.hash(opts.ownerPassword, 10);
  const email = `staff+${SLUG}-amira@example.com`;
  const [u] = await db
    .insert(users)
    .values({ email, name: "Amira Rahman", phone: "+14165550350", passwordHash: hash, memberCode: await generateMemberCode(db), locale: "en", emailVerifiedAt: realNow, phoneVerifiedAt: realNow })
    .onConflictDoNothing()
    .returning({ id: users.id });
  const pharmacistId = u?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]!.id;
  await db.insert(merchantStaff).values({ merchantId: row.id, userId: pharmacistId, role: "manager", locale: "en" }).onConflictDoNothing();
  const days = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).flatMap((d, weekday) => (loc.hours?.[d] ?? []).map(([a, b]) => ({ merchantId: row.id, locationId: loc.id, userId: pharmacistId, weekday, startsLocal: a, endsLocal: b })));
  if (days.length) await db.insert(staffHours).values(days);

  // A few appointments around now: two coming up, two finished (the nightly job de-identifies finished ones after 30 days).
  const today = localParts(realNow, row.timezone).date;
  const slot = (date: string, hhmm: string) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)), row.timezone);
  const plan: { date: string; at: string; type: number; person: number; status: "booked" | "completed" }[] = [
    { date: addDays(today, 1), at: "10:00", type: 0, person: 0, status: "booked" },
    { date: addDays(today, 1), at: "10:30", type: 2, person: 1, status: "booked" },
    { date: addDays(today, 2), at: "14:15", type: 1, person: 2, status: "booked" },
    { date: addDays(today, -2), at: "11:00", type: 0, person: 3, status: "completed" },
    { date: addDays(today, -3), at: "15:30", type: 3, person: 4, status: "completed" },
  ];
  for (const p of plan) {
    const t = svcIds[p.type]!;
    const [who] = PEOPLE[p.person]!.slice(0, 2) as [string, string];
    const { user } = await findOrCreateCustomerByPhone(db, PEOPLE[p.person]![1], who);
    const startsAt = slot(p.date, p.at);
    const items: AppointmentItemRow[] = [{ serviceId: t.id, name: t.name, durationMin: t.min, priceCents: 0 }];
    await db.insert(appointments).values({
      merchantId: row.id,
      locationId: loc.id,
      userId: user.id,
      staffId: pharmacistId,
      source: "online",
      items,
      startsAt,
      endsAt: new Date(startsAt.getTime() + t.min * MIN),
      status: p.status,
      completedAt: p.status === "completed" ? new Date(startsAt.getTime() + t.min * MIN) : null,
      createdAt: new Date(startsAt.getTime() - 3 * 86_400_000),
      updatedAt: new Date(startsAt.getTime() - 3 * 86_400_000),
    });
  }

  // One draft message about the front store (the kind a pharmacy can send).
  await db.insert(messages).values({ merchantId: row.id, channel: "email", subject: "Flu season: double points on vitamins this week", body: "Vitamins, tissues and cold remedies earn double points until Sunday. Front-store items only.", segment: { kind: "all" }, status: "draft" });

  log(`Pharmacy: ${row.name}: ${svcIds.length} appointment types, 1 pharmacist, ${plan.length} appointments, owner confirmation recorded`);
  return true;
}
