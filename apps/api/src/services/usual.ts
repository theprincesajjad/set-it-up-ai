/**
 * A guest's "usual": the pickup order they place most often at this shop (last ten orders, newest wins a tie),
 * with today's dish names, leaving out dishes that are off the menu or sold out. Used by phone orders and the WhatsApp guest panel.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { catalogItems, merchantMembers, orderItems, orders, users, type DbOrTx } from "@ll/db";
import type { restaurantApi } from "@ll/shared";

export async function usualFor(db: DbOrTx, merchantId: string, userId: string, now: Date = new Date()): Promise<restaurantApi.PhoneUsualDto | null> {
  const recent = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.merchantId, merchantId), eq(orders.userId, userId), eq(orders.kind, "pickup"), ne(orders.status, "cancelled"), ne(orders.status, "refunded")))
    .orderBy(desc(orders.createdAt))
    .limit(10);
  if (!recent.length) return null;
  const lines = await db.select({ orderId: orderItems.orderId, catalogItemId: orderItems.catalogItemId, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, recent.map((r) => r.id)));
  const sigs = recent.map((r) => {
    const mine = lines.filter((l) => l.orderId === r.id && l.catalogItemId).sort((a, b) => a.catalogItemId!.localeCompare(b.catalogItemId!));
    return { items: mine.map((l) => ({ catalogItemId: l.catalogItemId!, quantity: l.quantity })), key: mine.map((l) => `${l.catalogItemId}:${l.quantity}`).join("|") };
  }).filter((s) => s.key);
  if (!sigs.length) return null;
  const counts = new Map<string, number>();
  for (const s of sigs) counts.set(s.key, (counts.get(s.key) ?? 0) + 1);
  // recent is newest first, so the first signature to reach the top count is the newest of the tied ones.
  const top = Math.max(...counts.values());
  const best = sigs.find((s) => counts.get(s.key) === top)!;
  const menu = await db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, merchantId), inArray(catalogItems.id, best.items.map((i) => i.catalogItemId))));
  const byId = new Map(menu.map((m) => [m.id, m]));
  const items = best.items
    .map((i) => ({ i, m: byId.get(i.catalogItemId) }))
    .filter(({ m }) => !!m && m.available && m.orderable && !m.preorderOnly && !(m.soldOutUntil && m.soldOutUntil.getTime() > now.getTime()))
    .map(({ i, m }) => ({ catalogItemId: i.catalogItemId, name: m!.name, quantity: i.quantity }));
  if (!items.length) return null;
  return { items, text: items.map((i) => `${i.quantity} ${i.name}`).join(", "), orders: top };
}

/** The member behind a phone number at this shop (null when the number is not a customer). */
export async function memberByPhone(db: DbOrTx, merchantId: string, phone: string) {
  const [row] = await db
    .select({ memberId: merchantMembers.id, userId: users.id, name: users.name, visits: merchantMembers.visitCount })
    .from(users)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, users.id), eq(merchantMembers.merchantId, merchantId)))
    .where(eq(users.phone, phone))
    .limit(1);
  return row ?? null;
}
