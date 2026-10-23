/**
 * Demo data for the repair and rebooking screens (docs/research/service-businesses.md, Figma frames 1 to 6):
 *
 *   Fix-It Phone Lab        a price list for canned quote lines (the tickets, photos, phone approval, overdue and
 *                           uncollected examples live in seed/core.ts with the rest of its tickets).
 *   Bloom Hair Studio and   rebooking switched on, a few finished visits from three to six weeks ago so the due and late
 *   Rangrez Beauty Studio   lists have people in them, marketing consent for most of them, and a few nudges already sent.
 *
 * Idempotent: a shop that already has the data is left alone. Everyone here is fictional.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { FeatureKey } from "@ll/shared";
import { appointments, featureOverrides, merchantMembers, merchants, rebookingNudges, services, type Db } from "@ll/db";

const DAY = 86_400_000;
const REBOOKING: FeatureKey[] = ["service.rebooking", "service.invoices"];

const REPAIR_LIST: { name: string; description: string; priceCents: number }[] = [
  { name: "Diagnostic fee", description: "Credited if you go ahead with the repair.", priceCents: 3000 },
  { name: "iPhone screen, OEM-grade panel", description: "Most iPhones 11 to 15.", priceCents: 14900 },
  { name: "Battery replacement", description: "New cell, tested.", priceCents: 7900 },
  { name: "Charging port assembly", description: "Part only. Labour is a separate line.", priceCents: 12900 },
  { name: "Labour, port or screen", description: "Per repair.", priceCents: 8000 },
  { name: "Back glass", description: "iPhone 8 and newer.", priceCents: 8900 },
];

export async function seedServiceOps(db: Db, opts: { log?: (m: string) => void; now?: Date } = {}): Promise<void> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const shops = await db.select().from(merchants).where(inArray(merchants.slug, ["fix-it-phone-lab", "bloom-hair-studio", "rangrez-beauty-studio"]));
  const bySlug = new Map(shops.map((m) => [m.slug, m]));

  const repair = bySlug.get("fix-it-phone-lab");
  if (repair) {
    const [has] = await db.select({ n: sql<number>`count(*)::int` }).from(services).where(and(eq(services.merchantId, repair.id), eq(services.kind, "repair_line")));
    if (!has?.n) {
      await db.insert(services).values(REPAIR_LIST.map((s, i) => ({ merchantId: repair.id, kind: "repair_line", name: s.name, description: s.description, priceCents: s.priceCents, durationMin: 0, sort: i })));
      log(`Service ops: ${REPAIR_LIST.length} price-list lines at Fix-It Phone Lab`);
    }
  }

  for (const slug of ["bloom-hair-studio", "rangrez-beauty-studio"] as const) {
    const shop = bySlug.get(slug);
    if (!shop) continue;
    await db
      .insert(featureOverrides)
      .values(REBOOKING.map((key) => ({ merchantId: shop.id, key, enabled: true, reason: "Demo shop" })))
      .onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: true } });
    const [done] = await db.select({ n: sql<number>`count(*)::int` }).from(rebookingNudges).where(eq(rebookingNudges.merchantId, shop.id));
    if (done?.n) continue;
    const svc = await db.select().from(services).where(and(eq(services.merchantId, shop.id), eq(services.kind, "appointment"), eq(services.active, true), isNotNull(services.rebookAfterDays)));
    const people = await db.selectDistinct({ userId: appointments.userId }).from(appointments).where(and(eq(appointments.merchantId, shop.id), isNotNull(appointments.userId))).limit(9);
    if (!svc.length || !people.length) continue;
    const [loc] = await db.select({ id: appointments.locationId }).from(appointments).where(eq(appointments.merchantId, shop.id)).limit(1);
    // Finished visits three to six weeks ago, one service each, spread so some are late, some due this week.
    const rows: (typeof appointments.$inferInsert)[] = [];
    const ids = people.map((p) => p.userId!).filter(Boolean);
    ids.forEach((userId, i) => {
      const s = svc[i % svc.length]!;
      const ago = Math.max(10, s.rebookAfterDays! + 6 - ((i * 5) % 14));
      const start = new Date(now.getTime() - ago * DAY);
      rows.push({ merchantId: shop.id, locationId: loc!.id, userId, source: "staff", items: [{ serviceId: s.id, name: s.name, durationMin: s.durationMin, priceCents: s.priceCents }], startsAt: start, endsAt: new Date(start.getTime() + s.durationMin * 60_000), status: "completed", completedAt: new Date(start.getTime() + s.durationMin * 60_000), createdAt: start, updatedAt: start });
    });
    await db.insert(appointments).values(rows);
    // Most of them agreed to messages from the shop; two did not (shown as "No consent").
    const consenting = ids.slice(0, Math.max(1, ids.length - 2));
    if (consenting.length)
      await db.update(merchantMembers).set({ marketingConsentAt: new Date(now.getTime() - 60 * DAY), marketingConsentSource: "seed" }).where(and(eq(merchantMembers.merchantId, shop.id), inArray(merchantMembers.userId, consenting), sql`${merchantMembers.marketingConsentAt} is null`));
    // Three nudges already sent earlier this month (for the "sent, last 30 days" number).
    const earlier = ids.slice(-3);
    await db.insert(rebookingNudges).values(earlier.map((userId, i) => ({ merchantId: shop.id, userId, serviceId: svc[(i + 1) % svc.length]!.id, action: "sent", channel: i === 0 ? "push" : "sms", createdAt: new Date(now.getTime() - (4 + i * 6) * DAY) })));
    log(`Service ops: rebooking demo at ${shop.name} (${rows.length} finished visits, ${earlier.length} nudges sent)`);
  }
}
