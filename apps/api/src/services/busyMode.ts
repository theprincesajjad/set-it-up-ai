/**
 * Busy mode: the kitchen adds minutes to every quoted wait for a few hours. The quote is what guests see ("ready in about
 * 35 minutes") and the pickup time given to an ASAP order. Free of orders.ts imports so orders.ts can use it.
 */
import { desc, eq } from "drizzle-orm";
import { busyModeEvents, merchants } from "@ll/db";
import { restaurantApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";

type Merchant = typeof merchants.$inferSelect;
type BusyFields = Pick<Merchant, "busyAddMinutes" | "busyUntil">;

export const busyActive = (m: BusyFields, now: Date): boolean => m.busyAddMinutes > 0 && !!m.busyUntil && m.busyUntil.getTime() > now.getTime();

/** Minutes added to a quote right now (0 when busy mode is off or has run out). */
export const busyAddMinutes = (m: BusyFields, now: Date): number => (busyActive(m, now) ? m.busyAddMinutes : 0);

/** The wait we quote: the usual 20 minutes plus whatever busy mode adds. */
export const quotedWaitMinutes = (m: BusyFields, now: Date): number => restaurantApi.BASE_QUOTED_WAIT_MIN + busyAddMinutes(m, now);

export async function busyState(ctx: AppContext, m: BusyFields & Pick<Merchant, "id">): Promise<restaurantApi.BusyState> {
  const now = ctx.now();
  const rows = await ctx.db.select().from(busyModeEvents).where(eq(busyModeEvents.merchantId, m.id)).orderBy(desc(busyModeEvents.startedAt)).limit(5);
  return {
    on: busyActive(m, now),
    addMinutes: busyAddMinutes(m, now),
    until: busyActive(m, now) ? m.busyUntil!.toISOString() : null,
    quotedWaitMin: quotedWaitMinutes(m, now),
    recent: rows.map((r) => ({ id: r.id, addMinutes: r.addMinutes, startedAt: r.startedAt.toISOString(), until: r.until?.toISOString() ?? null, endedAt: r.endedAt?.toISOString() ?? null })),
  };
}

/** Turn busy mode on (add 10 to 30 minutes for a few hours) or off (0). Every change is kept in busy_mode_events. */
export async function setBusy(ctx: AppContext, staff: StaffContext, body: z.infer<typeof restaurantApi.busyBody>): Promise<restaurantApi.BusyState> {
  const now = ctx.now();
  const m = staff.merchant;
  // Close the period that was running.
  if (busyActive(m, now) || m.busyAddMinutes > 0) {
    const [open] = await ctx.db.select().from(busyModeEvents).where(eq(busyModeEvents.merchantId, m.id)).orderBy(desc(busyModeEvents.startedAt)).limit(1);
    if (open && !open.endedAt) await ctx.db.update(busyModeEvents).set({ endedAt: now }).where(eq(busyModeEvents.id, open.id));
  }
  const until = body.addMinutes > 0 ? new Date(now.getTime() + (body.hours ?? 2) * 3_600_000) : null;
  const [row] = await ctx.db.update(merchants).set({ busyAddMinutes: body.addMinutes, busyUntil: until, updatedAt: now }).where(eq(merchants.id, m.id)).returning();
  if (body.addMinutes > 0) await ctx.db.insert(busyModeEvents).values({ merchantId: m.id, addMinutes: body.addMinutes, startedAt: now, until, byUserId: staff.user.id });
  return busyState(ctx, row!);
}
