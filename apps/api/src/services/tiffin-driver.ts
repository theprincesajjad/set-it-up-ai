/**
 * Driver link: a tokenised page (/d/<token>) for one route on one day, no login.
 * The token only reads that route's stops for that date and can only mark them delivered or missed.
 * Expires 23:59 Toronto the same day (410 after). Logic for the merchant buttons that share the
 * same rules (mark all out, late notice, send links) lives here too.
 */
import { and, eq, gt } from "drizzle-orm";
import { merchants, tiffinDriverLinks, tiffinRoutes, tiffinSubscriptions, tiffinDeliveries, type DbOrTx } from "@ll/db";
import type { tiffinApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { allow } from "../lib/rate-limit.js";
import { HttpError, badRequest, notFound, tooMany } from "../lib/errors.js";
import { notifyCustomer } from "./commerceShared.js";
import { inQuietHours } from "./notifications.js";
import { addDays, localInstant, manifest, setDeliveryStatus, todayOf } from "./tiffin.js";
import { normalizePhone } from "./channel-orders.js";
import { sendWhatsApp } from "./whatsapp.js";
import { sendSms } from "./opt-out.js";

type Link = typeof tiffinDriverLinks.$inferSelect;
const LATE_GAP_MS = 15 * 60_000;

/** 120 requests a minute per token: plenty for a driver tapping through a route, hard for a scraper. */
async function rateLimit(ctx: AppContext, key: string) {
  if (!(await allow(ctx, `driver:${key}`, 120, 60_000))) throw tooMany("Too many requests. Wait a moment.");
}

const expiryFor = (date: string) => new Date(localInstant(addDays(date, 1), 0).getTime() - 1000);
const linkUrl = (ctx: AppContext, token: string) => `${ctx.config.publicWebUrl}/d/${token}`;

async function loadRoute(db: DbOrTx, merchantId: string, routeId: string) {
  const [r] = await db.select().from(tiffinRoutes).where(and(eq(tiffinRoutes.id, routeId), eq(tiffinRoutes.merchantId, merchantId))).limit(1);
  if (!r) throw notFound("Route");
  return r;
}

/** One live link per route and day: asking again returns the same URL. */
export async function createDriverLink(ctx: AppContext, staff: StaffContext, routeId: string, body: z.output<typeof tiffinApi.createDriverLinkBody>): Promise<tiffinApi.DriverLinkResponse> {
  await loadRoute(ctx.db, staff.merchant.id, routeId);
  const today = todayOf(ctx);
  const date = body.date ?? today;
  if (date < today) throw badRequest("Pick today or a later day");
  const [live] = await ctx.db
    .select()
    .from(tiffinDriverLinks)
    .where(and(eq(tiffinDriverLinks.routeId, routeId), eq(tiffinDriverLinks.date, date), gt(tiffinDriverLinks.expiresAt, ctx.now())))
    .limit(1);
  if (live) return { url: linkUrl(ctx, live.token), token: live.token, expiresAt: live.expiresAt.toISOString() };
  const [l] = await ctx.db
    .insert(tiffinDriverLinks)
    .values({ merchantId: staff.merchant.id, routeId, date, token: randomToken(24), expiresAt: expiryFor(date), createdBy: staff.user.id, createdAt: ctx.now() })
    .returning();
  return { url: linkUrl(ctx, l!.token), token: l!.token, expiresAt: l!.expiresAt.toISOString() };
}

export async function sendDriverLinks(ctx: AppContext, staff: StaffContext, body: z.output<typeof tiffinApi.sendDriverLinksBody>): Promise<tiffinApi.SendDriverLinksResponse> {
  const out: tiffinApi.SendDriverLinksResponse = { sent: [], skipped: [] };
  const quiet = inQuietHours(ctx.now(), staff.merchant.timezone || "America/Toronto");
  for (const routeId of body.routeIds) {
    const route = await loadRoute(ctx.db, staff.merchant.id, routeId);
    if (!route.driverPhone) {
      out.skipped.push({ routeId, reason: "no_phone" });
      continue;
    }
    if (quiet) {
      out.skipped.push({ routeId, reason: "quiet_hours" });
      continue;
    }
    const link = await createDriverLink(ctx, staff, routeId, { date: body.date });
    const text = `${staff.merchant.name}: your ${route.name} run for ${body.date ?? todayOf(ctx)}. Open your stops: ${link.url}`;
    const phone = normalizePhone(route.driverPhone);
    let channel: "sms" | "whatsapp" = "sms";
    if (body.channel === "whatsapp") {
      const r = await sendWhatsApp(ctx, staff.merchant, phone, { text });
      if (r.sent) channel = "whatsapp";
    }
    if (channel === "sms" && !(await sendSms(ctx, phone, text))) {
      out.skipped.push({ routeId, reason: "opted_out" });
      continue;
    }
    out.sent.push({ routeId, to: phone, channel });
  }
  return out;
}

async function linkByToken(ctx: AppContext, token: string): Promise<Link> {
  if (!token || token.length < 16) throw notFound("Driver link");
  await rateLimit(ctx, token);
  const [l] = await ctx.db.select().from(tiffinDriverLinks).where(eq(tiffinDriverLinks.token, token)).limit(1);
  if (!l) throw notFound("Driver link");
  if (l.expiresAt <= ctx.now()) throw new HttpError(410, "link_expired", "This driver link has expired. Ask the kitchen for a new one.");
  return l;
}

async function runFor(ctx: AppContext, l: Link): Promise<tiffinApi.DriverRunResponse> {
  const [merchant] = await ctx.db.select({ name: merchants.name, phone: merchants.phone }).from(merchants).where(eq(merchants.id, l.merchantId)).limit(1);
  const route = await loadRoute(ctx.db, l.merchantId, l.routeId);
  const m = await manifest(ctx, l.merchantId, l.date, l.routeId);
  const stops = (m.routes.find((r) => r.route?.id === l.routeId)?.stops ?? []).map(
    (s): tiffinApi.DriverStop => ({
      deliveryId: s.deliveryId,
      order: s.stopOrder,
      customerName: s.customerName,
      phone: s.customerPhone,
      address: s.address,
      postalCode: s.postalCode,
      addressNotes: s.addressNotes,
      dietaryNotes: s.dietaryNotes,
      servings: s.servings,
      planName: s.planName,
      status: s.status,
    }),
  );
  const done = stops.filter((s) => s.status === "delivered" || s.status === "picked_up" || s.status === "missed").length;
  const nextLate = l.lastLateAt ? new Date(l.lastLateAt.getTime() + LATE_GAP_MS) : null;
  return {
    shop: { name: merchant?.name ?? "", phone: merchant?.phone ?? null },
    route: { name: route.name, driverName: route.driverName },
    date: l.date,
    stops,
    progress: { done, total: stops.length },
    lateAvailableAt: nextLate && nextLate > ctx.now() ? nextLate.toISOString() : null,
  };
}

/** Public: the route's stops. Marks the link opened. */
export async function driverRun(ctx: AppContext, token: string): Promise<tiffinApi.DriverRunResponse> {
  const l = await linkByToken(ctx, token);
  await ctx.db.update(tiffinDriverLinks).set({ lastOpenedAt: ctx.now() }).where(eq(tiffinDriverLinks.id, l.id));
  return runFor(ctx, l);
}

export async function driverStop(ctx: AppContext, token: string, deliveryId: string, body: z.output<typeof tiffinApi.driverStopBody>): Promise<tiffinApi.DriverRunResponse> {
  const l = await linkByToken(ctx, token);
  const [d] = await ctx.db
    .select({ id: tiffinDeliveries.id, date: tiffinDeliveries.date, routeId: tiffinDeliveries.routeId, subRoute: tiffinSubscriptions.routeId, status: tiffinDeliveries.status })
    .from(tiffinDeliveries)
    .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinDeliveries.subscriptionId))
    .where(and(eq(tiffinDeliveries.id, deliveryId), eq(tiffinDeliveries.merchantId, l.merchantId)))
    .limit(1);
  // Scheduled meals follow the subscription's current route (as the manifest does); the rest keep the route they went out on.
  const onRoute = d && d.date === l.date && (d.status === "scheduled" ? d.subRoute : d.routeId) === l.routeId;
  if (!onRoute) throw notFound("Stop");
  await setDeliveryStatus(ctx, l.merchantId, { ids: [deliveryId], status: body.status, note: body.note });
  return runFor(ctx, l);
}

async function lateNotice(ctx: AppContext, merchantId: string, name: string, routeId: string | undefined, date: string, minutes: number): Promise<number> {
  const m = await manifest(ctx, merchantId, date, routeId);
  const stops = m.routes.flatMap((r) => r.stops).filter((s) => s.status === "scheduled" || s.status === "out_for_delivery");
  let n = 0;
  for (const s of stops) {
    const [sub] = await ctx.db.select({ userId: tiffinSubscriptions.userId }).from(tiffinSubscriptions).where(eq(tiffinSubscriptions.id, s.subscriptionId)).limit(1);
    if (!sub) continue;
    await notifyCustomer(ctx, { userId: sub.userId, merchantId, title: "Your tiffin is running late", body: `${name}: your delivery is running about ${minutes} minutes late. Thanks for waiting.`, data: { type: "tiffin_delivery", status: "late", subscriptionId: s.subscriptionId, deliveryId: s.deliveryId, date, event: "running_late" } });
    n++;
  }
  return n;
}

/** Driver: "running late" to the stops still to come, at most once every 15 minutes. */
export async function driverLate(ctx: AppContext, token: string, body: z.output<typeof tiffinApi.driverLateBody>): Promise<tiffinApi.DriverLateResponse> {
  const l = await linkByToken(ctx, token);
  const now = ctx.now();
  if (l.lastLateAt && now.getTime() - l.lastLateAt.getTime() < LATE_GAP_MS) throw tooMany("You already sent a late notice a moment ago. Try again in a few minutes.");
  const [merchant] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, l.merchantId)).limit(1);
  await ctx.db.update(tiffinDriverLinks).set({ lastLateAt: now }).where(eq(tiffinDriverLinks.id, l.id));
  const notified = await lateNotice(ctx, l.merchantId, merchant?.name ?? "Your kitchen", l.routeId, l.date, body.minutes);
  return { notified, nextAvailableAt: new Date(now.getTime() + LATE_GAP_MS).toISOString() };
}

/** Dashboard: "Send late notice" for one route (or the whole day). */
export async function merchantLateNotice(ctx: AppContext, staff: StaffContext, body: z.output<typeof tiffinApi.lateNoticeBody>): Promise<{ notified: number }> {
  if (body.routeId) await loadRoute(ctx.db, staff.merchant.id, body.routeId);
  return { notified: await lateNotice(ctx, staff.merchant.id, staff.merchant.name, body.routeId, body.date ?? todayOf(ctx), body.minutes) };
}

/** Dashboard: "Mark all out": every scheduled delivery (not pickups) on a route or the day goes out for delivery. */
export async function markAllOut(ctx: AppContext, staff: StaffContext, body: z.output<typeof tiffinApi.markAllOutBody>): Promise<tiffinApi.MarkAllOutResponse> {
  if (body.routeId) await loadRoute(ctx.db, staff.merchant.id, body.routeId);
  const m = await manifest(ctx, staff.merchant.id, body.date ?? todayOf(ctx), body.routeId);
  const ids = m.routes.flatMap((r) => r.stops).filter((s) => s.status === "scheduled").map((s) => s.deliveryId);
  if (!ids.length) return { updated: 0 };
  const r = await setDeliveryStatus(ctx, staff.merchant.id, { ids, status: "out_for_delivery" });
  return { updated: r.updated };
}
