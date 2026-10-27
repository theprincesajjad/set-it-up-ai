/**
 * Pharmacy vertical (docs/research/pharmacies-wellness.md): the locked dispensary categories, the pharmacist-owner
 * confirmation (Schedule C), the order-ready text and the retention rule. The guards live in pharmacy-guard.ts.
 */
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { merchantCategories, merchants, messageDeliveries, notifications, type DbOrTx } from "@ll/db";
import {
  PHARMACY_RULES,
  PHARMACY_VERTICAL,
  RETENTION,
  normalizeLocale,
  normalizePhone,
  daysAgo,
  t,
  type pharmacyApi,
} from "@ll/shared";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { notifyCustomer } from "./commerceShared.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { ensureLockedCategories, isPharmacy } from "./pharmacy-guard.js";

export * from "./pharmacy-guard.js";

type Merchant = typeof merchants.$inferSelect;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POS sales
// ---------------------------------------------------------------------------
/**
 * The lines of a POS sale a pharmacy may keep: only lines in a front-store category that earns. Everything else (prescriptions,
 * pharmacy services, anything with no mapped category) is dropped before the sale is stored or awarded.
 */
export async function frontStoreLinesOnly<L extends { amountCents: number; categoryId?: string | null }>(db: DbOrTx, merchantId: string, lines: L[]): Promise<L[]> {
  if (!lines.some((l) => l.categoryId)) return [];
  const cats = await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.merchantId, merchantId), eq(merchantCategories.earnEligible, true), eq(merchantCategories.dispensary, false)));
  const ok = new Set(cats.map((c) => c.id));
  return lines.filter((l) => l.categoryId && ok.has(l.categoryId));
}

// ---------------------------------------------------------------------------
// Rules page and the pharmacist-owner confirmation (Schedule C)
// ---------------------------------------------------------------------------
export async function rulesFor(ctx: AppContext, m: Merchant): Promise<pharmacyApi.PharmacyRulesResponse> {
  const pharmacy = isPharmacy(m);
  const cats = pharmacy ? await ctx.db.select().from(merchantCategories).where(and(eq(merchantCategories.merchantId, m.id), eq(merchantCategories.dispensary, true))) : [];
  return {
    pharmacy,
    rules: pharmacy ? PHARMACY_RULES.map((r) => ({ id: r.id, text: r.text })) : [],
    lockedCategories: cats.map((c) => ({ id: c.id, name: c.name, earnEligible: c.earnEligible, discountEligible: c.discountEligible })),
    confirmation: m.pharmacyConfirmedAt && m.pharmacyConfirmedByName ? { confirmedAt: m.pharmacyConfirmedAt.toISOString(), confirmedByName: m.pharmacyConfirmedByName } : null,
    retention: { appointmentDays: RETENTION.pharmacyAppointmentDays, messageDays: RETENTION.pharmacyMessageDays },
  };
}

export async function confirmPharmacy(ctx: AppContext, staff: StaffContext, body: pharmacyApi.ConfirmBody): Promise<pharmacyApi.PharmacyRulesResponse> {
  const m = staff.merchant;
  if (!isPharmacy(m)) throw badRequest("This shop is not a pharmacy");
  if (staff.role !== "owner" && !staff.impersonated) throw forbidden("Only the owner can confirm the pharmacy rules");
  await ensureLockedCategories(ctx.db, m.id);
  const now = ctx.now();
  const [row] = await ctx.db.update(merchants).set({ pharmacyConfirmedAt: now, pharmacyConfirmedByName: body.name, pharmacyConfirmedByUserId: staff.user.id, updatedAt: now }).where(eq(merchants.id, m.id)).returning();
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: m.id, action: "pharmacy.confirmed", entity: "merchant", entityId: m.id, data: { name: body.name } });
  return rulesFor(ctx, row!);
}

// ---------------------------------------------------------------------------
// Order-ready text (the only message a pharmacy sends about a pickup)
// ---------------------------------------------------------------------------
/** "(416) 555 ••42": enough for staff to see they typed the right number; never stored. */
const maskedTo = (e164: string) => {
  const d = e164.replace(/\D/g, "").slice(-10);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)} ••${d.slice(-2)}`;
};

/**
 * Tell a customer their order is ready. Fixed text in the customer's language: no medication, no name, no price, no offer, no
 * free text from staff. Sent as a transactional notice because the customer asked for it at the counter; their phone is saved
 * only as the account the notice went to. The delivery log and the inbox copy are deleted after RETENTION.pharmacyMessageDays.
 */
export async function sendPickupReady(ctx: AppContext, staff: StaffContext, body: pharmacyApi.PickupReadyBody): Promise<pharmacyApi.PickupReadyResponse> {
  const m = staff.merchant;
  if (!isPharmacy(m)) throw badRequest("Pickup-ready texts are for pharmacies");
  const phone = normalizePhone(body.phone);
  if (!phone) throw badRequest("Enter a valid phone number", [{ path: "phone", message: "Invalid phone number" }]);
  const { user } = await findOrCreateCustomerByPhone(ctx.db, phone, null);
  const locale = normalizeLocale(user.locale) ?? "en";
  const text = t(locale, "rx.pickup.ready", { shop: m.name });
  const stop = t(locale, "bk.msg.stop");
  const out = await notifyCustomer(ctx, {
    userId: user.id,
    merchantId: m.id,
    title: t(locale, "rx.pickup.title", { shop: m.name }),
    body: text,
    smsBody: `${text} ${stop}`,
    data: { type: "order_status", pharmacyPickup: true },
  });
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: m.id, action: "pharmacy.pickup_ready", entity: "merchant", entityId: m.id, data: { to: maskedTo(phone), customerAsked: true } });
  return { sent: out.sms || out.push > 0, to: maskedTo(phone) };
}

// ---------------------------------------------------------------------------
// Retention (jobs/retention.ts via services/retention.ts)
// ---------------------------------------------------------------------------
/** Delivery logs and inbox copies of a pharmacy's transactional texts (order ready, appointment reminders) after the period. */
export async function purgePharmacyMessages(ctx: AppContext): Promise<number> {
  const cutoff = daysAgo(ctx.now(), RETENTION.pharmacyMessageDays);
  const pharmacies = ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.vertical, PHARMACY_VERTICAL));
  const deliveries = await ctx.db
    .delete(messageDeliveries)
    .where(and(eq(messageDeliveries.kind, "transactional"), isNotNull(messageDeliveries.merchantId), inArray(messageDeliveries.merchantId, pharmacies), lt(messageDeliveries.createdAt, cutoff)))
    .returning({ id: messageDeliveries.id });
  const inbox = await ctx.db
    .delete(notifications)
    .where(and(inArray(notifications.type, ["order_ready", "ticket_updated", "booking_reminder"]), isNotNull(notifications.merchantId), inArray(notifications.merchantId, pharmacies), lt(notifications.createdAt, cutoff)))
    .returning({ id: notifications.id });
  return deliveries.length + inbox.length;
}
