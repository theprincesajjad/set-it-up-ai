/**
 * Dog daycare (docs/research/pet-care.md 2.2, 2.3, 2.5): the day's count against capacity and dogs per staff, a check-in that
 * stops an expired or missing required vaccine, a missing temperament check, a full room and an empty pack, prepaid packs sold by
 * hand (a day is used at check-in), and the minutes late at check-out. Nothing here charges a card.
 */
import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { daycarePacks, daycareStays, merchantMembers, merchants, petShop, petVaccines, pets, users } from "@ll/db";
import { checkInBlocks, lateMinutes, ratio, type petApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { localDate } from "./messaging.js";
import { getPetSettings, logVisit, shopPet } from "./pets.js";

type Merchant = typeof merchants.$inferSelect;
type Stay = typeof daycareStays.$inferSelect;
const DAY_MS = 86_400_000;

function localMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return n("hour") * 60 + n("minute");
}

/** The pack a dog would use today: the one that expires first and still has a day. */
async function usablePack(ctx: AppContext, merchantId: string, userId: string) {
  const [p] = await ctx.db
    .select()
    .from(daycarePacks)
    .where(and(eq(daycarePacks.merchantId, merchantId), eq(daycarePacks.userId, userId), gt(daycarePacks.expiresAt, ctx.now()), sql`${daycarePacks.daysUsed} < ${daycarePacks.daysTotal}`))
    .orderBy(asc(daycarePacks.expiresAt))
    .limit(1);
  return p ?? null;
}

async function blocksFor(ctx: AppContext, merchant: Merchant, stay: Stay, inRoom: number, settings: petApi.PetSettingsDto) {
  const vax = await ctx.db.select().from(petVaccines).where(eq(petVaccines.petId, stay.petId));
  const [shop] = await ctx.db.select().from(petShop).where(and(eq(petShop.merchantId, merchant.id), eq(petShop.petId, stay.petId))).limit(1);
  const pack = await usablePack(ctx, merchant.id, stay.userId);
  const payKind = stay.payKind === "pack" || pack ? "pack" : "drop_in";
  // Drop-in is always allowed; a pack only needs a day left, and we fall back to drop-in when the owner has none.
  return {
    blocks: checkInBlocks({ day: stay.day, required: settings.requiredVaccines, vaccines: vax, requireAssessment: settings.requireAssessment, assessment: shop?.assessment ?? "none", inRoom, capacity: settings.capacity, payKind: "drop_in", packDaysLeft: pack ? pack.daysTotal - pack.daysUsed : 0 }),
    pack,
    payKind: payKind as "pack" | "drop_in",
  };
}

export async function dayBoard(ctx: AppContext, merchant: Merchant, day?: string): Promise<petApi.DaycareDayResponse> {
  const today = day ?? localDate(ctx.now(), merchant.timezone);
  const settings = await getPetSettings(ctx, merchant.id);
  const rows = await ctx.db
    .select({ s: daycareStays, pet: pets.name, owner: users.name })
    .from(daycareStays)
    .innerJoin(pets, eq(pets.id, daycareStays.petId))
    .innerJoin(users, eq(users.id, daycareStays.userId))
    .where(and(eq(daycareStays.merchantId, merchant.id), eq(daycareStays.day, today)))
    .orderBy(asc(daycareStays.createdAt));
  const inRoom = rows.filter((r) => r.s.status === "in").length;
  const items: petApi.DaycareStayDto[] = [];
  for (const r of rows) {
    let blocks: { code: string; message: string }[] = [];
    let packDaysLeft: number | null = null;
    let payKind = r.s.payKind as "pack" | "drop_in";
    if (r.s.status === "expected") {
      const b = await blocksFor(ctx, merchant, r.s, inRoom, settings);
      blocks = b.blocks;
      payKind = b.payKind;
      packDaysLeft = b.pack ? b.pack.daysTotal - b.pack.daysUsed : null;
    } else {
      if (r.s.packId) {
        const [p] = await ctx.db.select().from(daycarePacks).where(eq(daycarePacks.id, r.s.packId)).limit(1);
        packDaysLeft = p ? p.daysTotal - p.daysUsed : null;
      }
      // A dog already in the room whose shots lapsed since check-in is flagged too (the check only used to run at the door).
      if (r.s.status === "in") blocks = (await blocksFor(ctx, merchant, r.s, inRoom, settings)).blocks.filter((x) => x.code === "vaccine");
    }
    items.push({ id: r.s.id, petId: r.s.petId, petName: r.pet, ownerName: r.owner, status: r.s.status as petApi.DaycareStayDto["status"], payKind, packDaysLeft, checkInAt: r.s.checkInAt?.toISOString() ?? null, lateMinutes: r.s.lateMinutes, blocks });
  }
  const low = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(daycarePacks)
    .where(and(eq(daycarePacks.merchantId, merchant.id), gt(daycarePacks.expiresAt, ctx.now()), sql`${daycarePacks.daysTotal} - ${daycarePacks.daysUsed} between 1 and 1`));
  return { day: today, settings, inRoom, expected: rows.filter((r) => r.s.status === "expected").length, ratioNow: Math.round(ratio(inRoom, settings.staffOn) * 10) / 10, packsLow: low[0]?.n ?? 0, items };
}

export async function expectStay(ctx: AppContext, staff: StaffContext, body: z.output<typeof petApi.stayBody>): Promise<{ id: string }> {
  const merchant = staff.merchant;
  const { pet } = await shopPet(ctx, merchant, body.petId);
  const day = body.day ?? localDate(ctx.now(), merchant.timezone);
  const pack = await usablePack(ctx, merchant.id, pet.userId);
  const [row] = await ctx.db
    .insert(daycareStays)
    .values({ merchantId: merchant.id, petId: pet.id, userId: pet.userId, day, payKind: pack ? "pack" : "drop_in" })
    .onConflictDoNothing({ target: [daycareStays.merchantId, daycareStays.petId, daycareStays.day] })
    .returning({ id: daycareStays.id });
  if (row) return row;
  const [cur] = await ctx.db.select({ id: daycareStays.id }).from(daycareStays).where(and(eq(daycareStays.merchantId, merchant.id), eq(daycareStays.petId, pet.id), eq(daycareStays.day, day))).limit(1);
  return cur!;
}

async function stayFor(ctx: AppContext, merchant: Merchant, id: string): Promise<Stay> {
  const [s] = await ctx.db.select().from(daycareStays).where(and(eq(daycareStays.id, id), eq(daycareStays.merchantId, merchant.id))).limit(1);
  if (!s) throw notFound("Stay");
  return s;
}

export async function checkIn(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof petApi.checkInBody>): Promise<{ ok: true; payKind: "pack" | "drop_in"; packDaysLeft: number | null }> {
  const merchant = staff.merchant;
  const stay = await stayFor(ctx, merchant, id);
  if (stay.status === "in") throw conflict("Already checked in.");
  if (stay.status !== "expected") throw conflict("This stay is not expected today.");
  const settings = await getPetSettings(ctx, merchant.id);
  const [{ n } = { n: 0 }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(daycareStays).where(and(eq(daycareStays.merchantId, merchant.id), eq(daycareStays.day, stay.day), eq(daycareStays.status, "in")));
  const b = await blocksFor(ctx, merchant, stay, n, settings);
  const hard = b.blocks.filter((x) => x.code !== "capacity");
  const full = b.blocks.find((x) => x.code === "capacity");
  // A manager may take one more dog with a reason; the vaccine and assessment rules have no override.
  const canOverride = !!body.overrideCapacity && (staff.role === "owner" || staff.role === "manager");
  const stop = full && !canOverride ? [...hard, full] : hard;
  if (stop.length) throw new HttpError(409, "blocked", stop.map((x) => x.message).join(" "), { blocks: stop });
  const now = ctx.now();
  let packId: string | null = null;
  let packDaysLeft: number | null = null;
  if (b.pack) {
    // Atomic: the day is only taken if one is left.
    const [p] = await ctx.db
      .update(daycarePacks)
      .set({ daysUsed: sql`${daycarePacks.daysUsed} + 1` })
      .where(and(eq(daycarePacks.id, b.pack.id), sql`${daycarePacks.daysUsed} < ${daycarePacks.daysTotal}`))
      .returning();
    if (p) {
      packId = p.id;
      packDaysLeft = p.daysTotal - p.daysUsed;
    }
  }
  await ctx.db
    .update(daycareStays)
    .set({ status: "in", checkInAt: now, packId, payKind: packId ? "pack" : "drop_in", overrideReason: full && canOverride ? body.overrideCapacity : null })
    .where(eq(daycareStays.id, stay.id));
  return { ok: true, payKind: packId ? "pack" : "drop_in", packDaysLeft };
}

export async function checkOut(ctx: AppContext, staff: StaffContext, id: string): Promise<{ ok: true; lateMinutes: number }> {
  const merchant = staff.merchant;
  const stay = await stayFor(ctx, merchant, id);
  if (stay.status !== "in") throw conflict("This dog is not checked in.");
  const now = ctx.now();
  const settings = await getPetSettings(ctx, merchant.id);
  const late = localDate(now, merchant.timezone) === stay.day ? lateMinutes(settings.closesAt, settings.lateGraceMin, localMinutes(now, merchant.timezone)) : 0;
  await ctx.db.update(daycareStays).set({ status: "out", checkOutAt: now, lateMinutes: late }).where(eq(daycareStays.id, stay.id));
  const { pet } = await shopPet(ctx, merchant, stay.petId);
  await logVisit(ctx, merchant, pet, { kind: "daycare", createdBy: staff.user.id });
  return { ok: true, lateMinutes: late };
}

/** no_show and cancelled keep the row (so a pack day taken at check-in is never taken for them). */
export async function closeStay(ctx: AppContext, staff: StaffContext, id: string, status: "no_show" | "cancelled"): Promise<{ ok: true }> {
  const stay = await stayFor(ctx, staff.merchant, id);
  if (stay.status !== "expected") throw conflict("Only an expected stay can be closed this way.");
  await ctx.db.update(daycareStays).set({ status }).where(eq(daycareStays.id, id));
  return { ok: true };
}

export async function sellPack(ctx: AppContext, staff: StaffContext, body: z.output<typeof petApi.packBody>): Promise<petApi.DaycarePackDto> {
  const merchant = staff.merchant;
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  const settings = await getPetSettings(ctx, merchant.id);
  const validDays = body.validDays ?? settings.packs.find((p) => p.days === body.days)?.validDays ?? 180;
  if (body.days < 2) throw badRequest("A pack is at least 2 days.");
  const now = ctx.now();
  const [row] = await ctx.db
    .insert(daycarePacks)
    .values({ merchantId: merchant.id, userId: m.userId, daysTotal: body.days, paidCents: body.priceCents, purchasedAt: now, expiresAt: new Date(now.getTime() + validDays * DAY_MS), soldBy: staff.user.id })
    .returning();
  const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, m.userId)).limit(1);
  return { id: row!.id, ownerName: u?.name ?? null, daysLeft: row!.daysTotal, daysTotal: row!.daysTotal, expiresAt: row!.expiresAt.toISOString() };
}

export async function listPacks(ctx: AppContext, merchant: Merchant): Promise<petApi.DaycarePackDto[]> {
  const rows = await ctx.db
    .select({ p: daycarePacks, owner: users.name })
    .from(daycarePacks)
    .innerJoin(users, eq(users.id, daycarePacks.userId))
    .where(and(eq(daycarePacks.merchantId, merchant.id), gte(daycarePacks.expiresAt, new Date(ctx.now().getTime() - 30 * DAY_MS))))
    .orderBy(asc(daycarePacks.expiresAt))
    .limit(100);
  return rows.map((r) => ({ id: r.p.id, ownerName: r.owner, daysLeft: r.p.daysTotal - r.p.daysUsed, daysTotal: r.p.daysTotal, expiresAt: r.p.expiresAt.toISOString() }));
}
