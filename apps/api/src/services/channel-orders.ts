/**
 * Orders that start outside the app (WhatsApp chat, a phone call): find or
 * create the customer by phone, place the order through the normal order
 * service (server-side pricing, taxes, payments) and tag the channel.
 */
import { and, asc, eq } from "drizzle-orm";
import { locations, merchants, orders, users } from "@ll/db";
import type { commerceApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { hmacSha256, safeEqual } from "../lib/crypto.js";
import { badRequest } from "../lib/errors.js";
import { paymentsReady } from "./commerceShared.js";
import { generateMemberCode } from "./ledger.js";
import { placeOrder } from "./orders.js";

type Merchant = typeof merchants.$inferSelect;

/** E.164 with a leading +. Ten digits are assumed to be North American. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  return `+${d}`;
}

export async function findOrCreateUserByPhone(ctx: AppContext, rawPhone: string, name?: string | null) {
  const phone = normalizePhone(rawPhone);
  const [existing] = await ctx.db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) return existing.deletedAt ? null : existing;
  const [u] = await ctx.db
    .insert(users)
    .values({ phone, name: name ?? null, memberCode: await generateMemberCode(ctx.db) })
    .onConflictDoNothing()
    .returning();
  return u ?? (await ctx.db.select().from(users).where(eq(users.phone, phone)).limit(1))[0] ?? null;
}

export interface ChannelOrderArgs {
  phone: string;
  name?: string | null;
  channel: "whatsapp" | "phone";
  lines: { catalogItemId: string; quantity: number }[];
  /** Card link when the shop can take payments; otherwise (or when "at_pickup") pay at the counter. */
  paymentMethod: "in_app" | "at_pickup";
  locationId?: string;
  pickupAt?: Date | null;
  notes?: string | null;
  /** Guest allergy (kitchen ticket band). */
  allergyNote?: string | null;
  tipCents?: number;
  idempotencyKey: string;
}

export async function placeChannelOrder(ctx: AppContext, merchant: Merchant, a: ChannelOrderArgs): Promise<commerceApi.PlaceOrderResponse & { userId: string }> {
  const user = await findOrCreateUserByPhone(ctx, a.phone, a.name);
  if (!user) throw badRequest("This phone number can't place orders");
  let locationId = a.locationId;
  if (!locationId) {
    const [loc] = await ctx.db.select({ id: locations.id }).from(locations).where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true))).orderBy(asc(locations.createdAt)).limit(1);
    if (!loc) throw badRequest("This shop has no active location");
    locationId = loc.id;
  }
  const paymentMethod = a.paymentMethod === "in_app" && (await paymentsReady(ctx.db, merchant)) ? "in_app" : "at_pickup";
  const res = await placeOrder(ctx, user.id, {
    merchantId: merchant.id,
    locationId,
    items: a.lines.map((l) => ({ catalogItemId: l.catalogItemId, quantity: l.quantity, modifiers: [] })),
    pickupAt: a.pickupAt ? a.pickupAt.toISOString() : null,
    notes: a.notes ?? null,
    allergyNote: a.allergyNote ?? null,
    tipCents: a.tipCents ?? 0,
    kind: "pickup",
    paymentMethod,
    idempotencyKey: a.idempotencyKey,
  });
  await ctx.db.update(orders).set({ channel: a.channel }).where(eq(orders.id, res.order.id));
  return { ...res, userId: user.id };
}

// ---------------------------------------------------------------------------
// Pay links (token-protected so the link works without a login)
// ---------------------------------------------------------------------------
export const orderPayToken = (ctx: AppContext, orderId: string) => hmacSha256(ctx.config.jwtSecret, `orderpay:${orderId}`).slice(0, 32);
export const verifyOrderPayToken = (ctx: AppContext, orderId: string, token: string | undefined) => !!token && safeEqual(token, orderPayToken(ctx, orderId));
export const orderPayUrl = (ctx: AppContext, orderId: string) => `${ctx.config.publicWebUrl.replace(/\/$/, "")}/pay/order/${orderId}?t=${orderPayToken(ctx, orderId)}`;
