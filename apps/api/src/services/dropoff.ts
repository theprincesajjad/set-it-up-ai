/**
 * Rolling drop-off slots: the shop's opening hours (Locations) decide when customers can bring an item in, slot length and
 * per-slot capacity are two settings on the merchant, and a daily job keeps the next N days open. The old "Make slots" form is
 * gone; a day the shop is closed is a blocked date, not a deleted slot, so the job does not reopen it.
 */
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { bookingSlots, bookings, locations, merchants } from "@ll/db";
import type { commerceApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest } from "../lib/errors.js";
import { addDays, dayKey, toMinutes, zonedToUtc } from "./bookings.js";
import { getMerchantFeatures } from "./features.js";
import { localDate } from "./messaging.js";

type Merchant = typeof merchants.$inferSelect;
const MAX_SLOTS = 3000;

export function dropoffSettings(m: Merchant): commerceApi.DropoffSettingsDto {
  return { slotMinutes: m.dropoffSlotMinutes, capacity: m.dropoffCapacity, daysAhead: m.dropoffDaysAhead, blockedDates: [...m.dropoffBlockedDates].sort() };
}

/** Open the next `daysAhead` days of drop-off slots from each location's hours. Existing slots are left alone. */
export async function rollingDropoffSlots(ctx: AppContext, merchant: Merchant): Promise<number> {
  const now = ctx.now();
  const today = localDate(now, merchant.timezone);
  const locs = await ctx.db.select().from(locations).where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true)));
  const blocked = new Set(merchant.dropoffBlockedDates);
  const rows: (typeof bookingSlots.$inferInsert)[] = [];
  for (const loc of locs) {
    const hours = loc.hours ?? {};
    if (!Object.values(hours).some((w) => w?.length)) continue;
    for (let i = 0; i < merchant.dropoffDaysAhead; i++) {
      const date = addDays(today, i);
      if (blocked.has(date)) continue;
      for (const [open, close] of hours[dayKey(date)] ?? []) {
        const start = toMinutes(open);
        let end = toMinutes(close);
        if (end <= start) end += 24 * 60;
        for (let m = start; m + merchant.dropoffSlotMinutes <= end; m += merchant.dropoffSlotMinutes) {
          const startsAt = zonedToUtc(date, m, merchant.timezone);
          if (startsAt <= now) continue;
          rows.push({ merchantId: merchant.id, locationId: loc.id, kind: "dropoff", startsAt, endsAt: zonedToUtc(date, m + merchant.dropoffSlotMinutes, merchant.timezone), capacity: merchant.dropoffCapacity });
          if (rows.length > MAX_SLOTS) throw badRequest("Too many slots; use a longer slot length or fewer days ahead");
        }
      }
    }
  }
  if (!rows.length) return 0;
  const created = await ctx.db.insert(bookingSlots).values(rows).onConflictDoNothing().returning({ id: bookingSlots.id });
  return created.length;
}

/** Slots with no active bookings in a window, removed; returns how many were removed and how many carry bookings (left in place). */
async function clearUnbooked(ctx: AppContext, merchantId: string, from: Date, to?: Date) {
  const conds = [eq(bookingSlots.merchantId, merchantId), eq(bookingSlots.kind, "dropoff"), gt(bookingSlots.startsAt, from)];
  if (to) conds.push(lt(bookingSlots.startsAt, to));
  const slots = await ctx.db.select({ id: bookingSlots.id }).from(bookingSlots).where(and(...conds));
  if (!slots.length) return { removed: 0, withBookings: 0 };
  const ids = slots.map((s) => s.id);
  const busy = await ctx.db.select({ slotId: bookings.slotId }).from(bookings).where(and(inArray(bookings.slotId, ids), eq(bookings.status, "booked")));
  const busyIds = new Set(busy.map((b) => b.slotId));
  const free = ids.filter((i) => !busyIds.has(i));
  if (free.length) await ctx.db.delete(bookingSlots).where(inArray(bookingSlots.id, free));
  return { removed: free.length, withBookings: busyIds.size };
}

export async function updateDropoffSettings(ctx: AppContext, merchant: Merchant, body: Partial<Pick<commerceApi.DropoffSettingsDto, "slotMinutes" | "capacity" | "daysAhead">>) {
  const patch: Partial<typeof merchants.$inferInsert> = { updatedAt: ctx.now() };
  if (body.slotMinutes !== undefined) patch.dropoffSlotMinutes = body.slotMinutes;
  if (body.capacity !== undefined) patch.dropoffCapacity = body.capacity;
  if (body.daysAhead !== undefined) patch.dropoffDaysAhead = body.daysAhead;
  const [row] = await ctx.db.update(merchants).set(patch).where(eq(merchants.id, merchant.id)).returning();
  // A new slot length or capacity applies to every day that has no bookings yet; booked slots keep their shape.
  if (body.slotMinutes !== undefined || body.capacity !== undefined) await clearUnbooked(ctx, merchant.id, ctx.now());
  await rollingDropoffSlots(ctx, row!);
  return dropoffSettings(row!);
}

export async function blockDropoffDay(ctx: AppContext, merchant: Merchant, date: string) {
  const [fresh] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1);
  const blocked = [...new Set([...(fresh!.dropoffBlockedDates ?? []), date])];
  await ctx.db.update(merchants).set({ dropoffBlockedDates: blocked, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  const from = zonedToUtc(date, 0, merchant.timezone);
  const r = await clearUnbooked(ctx, merchant.id, new Date(from.getTime() - 1), zonedToUtc(addDays(date, 1), 0, merchant.timezone));
  return { ...r, settings: dropoffSettings({ ...fresh!, dropoffBlockedDates: blocked }) };
}

export async function unblockDropoffDay(ctx: AppContext, merchant: Merchant, date: string) {
  const [fresh] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1);
  const blocked = (fresh!.dropoffBlockedDates ?? []).filter((d) => d !== date);
  const [row] = await ctx.db.update(merchants).set({ dropoffBlockedDates: blocked, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id)).returning();
  await rollingDropoffSlots(ctx, row!);
  return dropoffSettings(row!);
}

/** Job, daily: keep the rolling window open for every shop that has drop-off scheduling. */
export async function runRollingDropoffSlots(ctx: AppContext): Promise<number> {
  const shops = await ctx.db.select().from(merchants).where(inArray(merchants.status, ["onboarding", "active"]));
  let n = 0;
  for (const m of shops) {
    if (!(await getMerchantFeatures(ctx.db, m))["booking.dropoff_scheduling"].enabled) continue;
    // Only shops that have opened drop-offs at least once (they have a slot, or a booking) are kept rolling.
    const [has] = await ctx.db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(bookingSlots).where(and(eq(bookingSlots.merchantId, m.id), eq(bookingSlots.kind, "dropoff"), gte(bookingSlots.startsAt, new Date(ctx.now().getTime() - 30 * 86_400_000))));
    if (!has?.n) continue;
    n += await rollingDropoffSlots(ctx, m);
  }
  return n;
}
