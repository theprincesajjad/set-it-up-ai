/**
 * Payments recorded by hand (Interac e-transfer, cash, cheque) and the shop settings around them.
 *
 * - `merchants.paymentSettings` says how the shop gets paid (e-transfer email and words, grace days,
 *   start-on-trust). A kitchen with e-transfer or cash on can take subscribers without Stripe.
 * - `manual_payments` is an append-only ledger (one row per receipt, mistakes are voided, never edited).
 *   Tiffin charges, catering deposits/balances and hall instalments all write to it.
 * - Reference codes (JM-1023) come from one per-shop counter, so they are unique across tiffin,
 *   catering and banquet. Payments recorded by hand carry no platform fee.
 * - Merchant tax status (GST/HST) and food-safety dates live here too: small merchant settings.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { manualPayments, merchants, users, type DbOrTx } from "@ll/db";
import { isValidGstHstNumber, paymentsManualApi, salesTaxBps } from "@ll/shared";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { badRequest, conflict } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { money } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { localDate } from "./messaging.js";
import { merchantProvince } from "./tax.js";

type Merchant = typeof merchants.$inferSelect;
type Ledger = typeof manualPayments.$inferSelect;
export type ManualMethod = paymentsManualApi.ManualMethod;
export type SubjectType = paymentsManualApi.ManualSubjectType;

// ---------------------------------------------------------------------------
// How the shop gets paid
// ---------------------------------------------------------------------------
export const stripeReady = (m: Pick<Merchant, "stripeAccountId" | "stripeChargesEnabled">) => !!m.stripeAccountId && m.stripeChargesEnabled;

export function settingsOf(m: Pick<Merchant, "paymentSettings" | "stripeAccountId" | "stripeChargesEnabled">): paymentsManualApi.PaymentSettingsDto {
  const s = (m.paymentSettings ?? {}) as Partial<paymentsManualApi.PaymentSettingsDto>;
  return {
    etransferEnabled: !!s.etransferEnabled && !!s.etransferEmail,
    etransferEmail: s.etransferEmail ?? null,
    instructions: s.instructions ?? null,
    cashEnabled: !!s.cashEnabled,
    graceDays: typeof s.graceDays === "number" ? s.graceDays : paymentsManualApi.DEFAULT_GRACE_DAYS,
    startOnTrust: !!s.startOnTrust,
    cardEnabled: s.cardEnabled !== false,
    padEnabled: s.padEnabled !== false,
    stripeReady: stripeReady(m),
  };
}

export async function putPaymentSettings(ctx: AppContext, staff: StaffContext, body: ReturnType<typeof paymentsManualApi.paymentSettingsBody.parse>): Promise<paymentsManualApi.PaymentSettingsDto> {
  if (body.etransferEnabled && !body.etransferEmail) throw badRequest("Add the email address people send e-transfers to");
  const next = { ...body, etransferEmail: body.etransferEmail ?? null, instructions: body.instructions ?? null };
  const [m] = await ctx.db.update(merchants).set({ paymentSettings: next, updatedAt: ctx.now() }).where(eq(merchants.id, staff.merchant.id)).returning();
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: staff.merchant.id, action: "payment_settings.update", entity: "merchant", entityId: staff.merchant.id, data: { etransfer: next.etransferEnabled, cash: next.cashEnabled } });
  return settingsOf(m!);
}

/** The e-transfer details a customer sees, or null when the shop doesn't take them. */
export function etransferOffer(m: Pick<Merchant, "paymentSettings" | "stripeAccountId" | "stripeChargesEnabled">): { email: string; instructions: string } | null {
  const s = settingsOf(m);
  return s.etransferEnabled && s.etransferEmail ? { email: s.etransferEmail, instructions: s.instructions || paymentsManualApi.COPY_INSTRUCTIONS_DEFAULT } : null;
}

export function acceptedMethods(m: Pick<Merchant, "paymentSettings" | "stripeAccountId" | "stripeChargesEnabled">, padPlatform: boolean): paymentsManualApi.AcceptedMethods {
  const s = settingsOf(m);
  const stripe = stripeReady(m);
  return { card: stripe && s.cardEnabled, pad: stripe && s.padEnabled && padPlatform, etransfer: s.etransferEnabled, cash: s.cashEnabled };
}

export function manualInstructions(m: Pick<Merchant, "paymentSettings" | "stripeAccountId" | "stripeChargesEnabled">, amountCents: number, referenceCode: string | null): paymentsManualApi.ManualInstructions | null {
  const offer = etransferOffer(m);
  if (!offer || !referenceCode) return null;
  return { email: offer.email, amountCents, referenceCode, instructions: offer.instructions };
}

// ---------------------------------------------------------------------------
// Reference codes
// ---------------------------------------------------------------------------
const initialsOf = (name: string | null | undefined) => {
  const parts = (name ?? "").normalize("NFKD").replace(/[^A-Za-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const out = parts.length >= 2 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "").slice(0, 2);
  return (out || "LL").toUpperCase();
};

/** `JM-1023`: customer initials plus a per-shop sequence (starts at 1001), unique across tiffin, catering and banquet. */
export async function newReferenceCode(db: DbOrTx, merchantId: string, userId: string): Promise<string> {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const n = await nextNumber(db, merchantId, "reference");
  return `${initialsOf(u?.name)}-${1000 + n}`;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------
export function assertNotFuture(receivedOn: string, today: string) {
  if (receivedOn > today) throw badRequest("The date received can't be in the future", { receivedOn });
}

export const todayFor = (ctx: AppContext, m: Pick<Merchant, "timezone">) => localDate(ctx.now(), m.timezone || "America/Toronto");

export async function ledgerDtos(db: DbOrTx, subjectType: SubjectType | SubjectType[], subjectId: string | string[]): Promise<paymentsManualApi.ManualPaymentDto[]> {
  const types = Array.isArray(subjectType) ? subjectType : [subjectType];
  const ids = Array.isArray(subjectId) ? subjectId : [subjectId];
  if (!ids.length) return [];
  const rows = await db
    .select({ p: manualPayments, by: users.name })
    .from(manualPayments)
    .leftJoin(users, eq(users.id, manualPayments.recordedBy))
    .where(and(inArray(manualPayments.subjectType, types), inArray(manualPayments.subjectId, ids)))
    .orderBy(asc(manualPayments.createdAt));
  return rows.map(({ p, by }) => ledgerDto(p, by));
}

export const ledgerDto = (p: Ledger, by: string | null = null): paymentsManualApi.ManualPaymentDto => ({
  id: p.id,
  subjectType: p.subjectType as SubjectType,
  subjectId: p.subjectId,
  instalmentIndex: p.instalmentIndex,
  method: p.method as ManualMethod,
  amountCents: p.amountCents,
  receivedOn: p.receivedOn,
  bankReference: p.bankReference,
  note: p.note,
  recordedByName: by,
  createdAt: p.createdAt.toISOString(),
  voidedAt: p.voidedAt?.toISOString() ?? null,
  voidReason: p.voidReason,
});

export async function liveLedger(db: DbOrTx, subjectType: SubjectType, subjectId: string): Promise<Ledger[]> {
  return db.select().from(manualPayments).where(and(eq(manualPayments.subjectType, subjectType), eq(manualPayments.subjectId, subjectId), isNull(manualPayments.voidedAt))).orderBy(asc(manualPayments.createdAt));
}

export async function addLedger(ctx: AppContext, staff: StaffContext, db: DbOrTx, row: { subjectType: SubjectType; subjectId: string; instalmentIndex?: number | null; body: ReturnType<typeof paymentsManualApi.recordPaymentBody.parse> }): Promise<Ledger> {
  const [p] = await db
    .insert(manualPayments)
    .values({
      merchantId: staff.merchant.id,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      instalmentIndex: row.instalmentIndex ?? null,
      method: row.body.method,
      amountCents: row.body.amountCents,
      receivedOn: row.body.receivedOn,
      bankReference: row.body.bankReference ?? null,
      note: row.body.note ?? null,
      recordedBy: staff.user.id,
      createdAt: ctx.now(),
    })
    .returning();
  await writeAudit(db, { actorUserId: staff.user.id, merchantId: staff.merchant.id, action: "payment.record", entity: row.subjectType, entityId: row.subjectId, data: { paymentId: p!.id, method: row.body.method, amountCents: row.body.amountCents, receivedOn: row.body.receivedOn } });
  return p!;
}

/** Void one live row (the most recent when `paymentId` is omitted). Returns the voided row. */
export async function voidLedger(ctx: AppContext, staff: StaffContext, subjectType: SubjectType, subjectId: string, reason: string, paymentId?: string): Promise<Ledger> {
  const live = await liveLedger(ctx.db, subjectType, subjectId);
  const target = paymentId ? live.find((l) => l.id === paymentId) : live[live.length - 1];
  if (!target) throw conflict("There is no recorded payment to void");
  const [v] = await ctx.db.update(manualPayments).set({ voidedAt: ctx.now(), voidReason: reason, voidedBy: staff.user.id }).where(and(eq(manualPayments.id, target.id), isNull(manualPayments.voidedAt))).returning();
  if (!v) throw conflict("That payment was just voided");
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: staff.merchant.id, action: "payment.void", entity: subjectType, entityId: subjectId, data: { paymentId: v.id, reason, amountCents: v.amountCents } });
  return v;
}

export const methodLabel = (m: string) => (m === "etransfer" ? "e-transfer" : m === "cheque" ? "cheque" : m);
export const receiptLine = (amountCents: number, method: string, receivedOn: string) => `${money(amountCents)} by ${methodLabel(method)} on ${receivedOn}`;

// ---------------------------------------------------------------------------
// Tax status and food safety
// ---------------------------------------------------------------------------
export async function taxSettings(ctx: AppContext, m: Merchant): Promise<paymentsManualApi.TaxSettingsDto> {
  const province = await merchantProvince(ctx.db, m);
  return { taxRegistered: m.taxRegistered, taxNumber: m.taxNumber, taxSmallSupplierNote: m.taxSmallSupplierNote, province, rateBps: salesTaxBps({ province, taxRegistered: m.taxRegistered }) };
}

export async function putTaxSettings(ctx: AppContext, staff: StaffContext, body: ReturnType<typeof paymentsManualApi.taxSettingsBody.parse>): Promise<paymentsManualApi.TaxSettingsDto> {
  const number = body.taxNumber?.trim().toUpperCase().replace(/\s+/g, "") || null;
  if (body.taxRegistered && number && !isValidGstHstNumber(number)) throw badRequest("A GST/HST number is 9 digits followed by RT0001", { field: "taxNumber" });
  const [m] = await ctx.db
    .update(merchants)
    .set({ taxRegistered: body.taxRegistered, taxNumber: body.taxRegistered ? number : null, taxSmallSupplierNote: body.taxRegistered ? false : body.taxSmallSupplierNote, updatedAt: ctx.now() })
    .where(eq(merchants.id, staff.merchant.id))
    .returning();
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: staff.merchant.id, action: "tax_settings.update", entity: "merchant", entityId: staff.merchant.id, data: { registered: body.taxRegistered } });
  return taxSettings(ctx, m!);
}

const DAY = 86_400_000;
export function foodSafetyDto(m: Pick<Merchant, "foodHandlerExpiry" | "healthUnit" | "healthUnitNotifiedOn" | "foodHandlerBadge">, today: string): paymentsManualApi.FoodSafetyDto {
  const days = m.foodHandlerExpiry ? Math.round((Date.parse(`${m.foodHandlerExpiry}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY) : null;
  return { foodHandlerExpiry: m.foodHandlerExpiry, healthUnit: m.healthUnit, healthUnitNotifiedOn: m.healthUnitNotifiedOn, foodHandlerBadge: m.foodHandlerBadge, daysToExpiry: days };
}

export async function putFoodSafety(ctx: AppContext, staff: StaffContext, body: ReturnType<typeof paymentsManualApi.foodSafetyBody.parse>): Promise<paymentsManualApi.FoodSafetyDto> {
  const [m] = await ctx.db
    .update(merchants)
    .set({ foodHandlerExpiry: body.foodHandlerExpiry ?? null, healthUnit: body.healthUnit || null, healthUnitNotifiedOn: body.healthUnitNotifiedOn ?? null, foodHandlerBadge: body.foodHandlerBadge && !!body.foodHandlerExpiry, updatedAt: ctx.now() })
    .where(eq(merchants.id, staff.merchant.id))
    .returning();
  return foodSafetyDto(m!, todayFor(ctx, m!));
}
