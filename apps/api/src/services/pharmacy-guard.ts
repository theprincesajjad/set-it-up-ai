/**
 * Pharmacy guards with no dependency on the ledger (so the ledger and the other services can import them). The rules, their words and
 * their reasons are in @ll/shared (pharmacy.ts); this file enforces them on the server. pharmacy.ts holds the actions (rules page,
 * confirmation, order-ready text, retention).
 *
 * The guards are small functions called from the places a prescription-linked reward or message could come from
 * (ledger award, redeem, manual adjustment, rewards, promos, discount cards, messages, automations, appointments, tags and
 * notes, network perks). apps/api/test/pharmacy.test.ts walks every one of them.
 */
import { and, eq, inArray } from "drizzle-orm";
import { merchantCategories, type merchants, type DbOrTx } from "@ll/db";
import { PHARMACY_LOCKED_CATEGORIES, PHARMACY_VERTICAL, checkPharmacyText, isDispensaryCategoryName, pharmacyTextMessage } from "@ll/shared";
import { HttpError } from "../lib/errors.js";

type Merchant = typeof merchants.$inferSelect;

export const isPharmacy = (m: Pick<Merchant, "vertical"> | null | undefined): boolean => m?.vertical === PHARMACY_VERTICAL;

/** A category id that is never real: a sale line with no category at a pharmacy lands here and earns nothing. */
export const UNCLASSIFIED_CATEGORY = "00000000-0000-0000-0000-00000000fa11";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
export const pharmacyTextError = (message: string, term?: string) => new HttpError(422, "pharmacy_text", message, term ? { term } : undefined);

/**
 * Refuse reward, promo, card, message or label text that ties the shop to the dispensary. No-op for every other vertical.
 * `what` names the field in the message ("The message", "The reward name").
 */
export function assertPharmacyText(m: Pick<Merchant, "vertical">, text: string | null | undefined, what: string, opts: { mode?: "offer" | "label"; allowServiceWords?: boolean } = {}): void {
  if (!isPharmacy(m) || !text) return;
  const c = checkPharmacyText(text, opts);
  if (!c.ok) throw pharmacyTextError(pharmacyTextMessage(c, what), c.term);
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------
export const pharmacyVisitEarnError = () =>
  new HttpError(422, "pharmacy_visit_earn", "A pharmacy can only give points on the dollars spent in the front store. Points or stamps for a visit are off, because a visit may include a prescription.");
export const frontStoreRequired = () =>
  new HttpError(422, "front_store_confirmation_required", "Confirm the total has no prescriptions or pharmacy services. Pharmacies can only award points on front-store sales.");
export const nothingFrontStore = () => new HttpError(422, "pharmacy_no_front_store", "There is nothing from the front store in this sale, so there is nothing to record. Prescriptions and pharmacy services never earn.");

/**
 * What a pharmacy sale may count. Returns the lines to price and the category ids that never earn.
 *  - the program must be per-dollar (no visit or stamp earn);
 *  - an amount with no itemised lines needs the cashier's front-store confirmation;
 *  - itemised lines with no category earn nothing unless the cashier confirmed the whole sale is front store.
 */
export function pharmacyAwardPlan<L extends { amountCents: number; categoryId?: string | null }>(
  program: { earnType: string },
  args: { lines?: L[]; frontStoreOnly?: boolean },
  lines: L[],
): { lines: L[]; extraNoEarn: string[] } {
  if (program.earnType !== "per_dollar") throw pharmacyVisitEarnError();
  const attested = args.frontStoreOnly === true;
  if (!args.lines?.length && !attested) throw frontStoreRequired();
  if (attested) return { lines, extraNoEarn: [] };
  return { lines: lines.map((l) => (l.categoryId ? l : { ...l, categoryId: UNCLASSIFIED_CATEGORY })), extraNoEarn: [UNCLASSIFIED_CATEGORY] };
}

/** Redeeming (staff or a customer's code) at a pharmacy needs the same cashier confirmation: the reward goes on front-store items. */
export function assertPharmacyRedeem(m: Pick<Merchant, "vertical">, frontStoreOnly: boolean | undefined): void {
  if (isPharmacy(m) && frontStoreOnly !== true) {
    throw new HttpError(422, "front_store_confirmation_required", "Confirm the reward is applied to front-store items only. A reward can never be used on a prescription or a pharmacy service.");
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
/** Make sure the locked dispensary categories exist and are locked (new shops, and an old pharmacy that lost one). */
export async function ensureLockedCategories(db: DbOrTx, merchantId: string): Promise<void> {
  const rows = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const byName = new Map(rows.map((c) => [c.name.toLowerCase(), c]));
  for (const name of PHARMACY_LOCKED_CATEGORIES) {
    const hit = byName.get(name.toLowerCase());
    if (!hit) await db.insert(merchantCategories).values({ merchantId, name, earnEligible: false, discountEligible: false, dispensary: true });
  }
  // Any category whose name marks the dispensary is locked, whatever it was before.
  const toLock = rows.filter((c) => !c.dispensary && isDispensaryCategoryName(c.name)).map((c) => c.id);
  const lockedNames = new Set<string>(PHARMACY_LOCKED_CATEGORIES.map((n) => n.toLowerCase()));
  const named = rows.filter((c) => lockedNames.has(c.name.toLowerCase()) && !c.dispensary).map((c) => c.id);
  const ids = [...new Set([...toLock, ...named])];
  if (ids.length) await db.update(merchantCategories).set({ dispensary: true, earnEligible: false, discountEligible: false }).where(inArray(merchantCategories.id, ids));
}


/**
 * Appointment types at a pharmacy (flu shot, vaccine, medication review, consultation): free to book, no deposit, no points, no rebooking
 * reminder, filed under the locked "Pharmacy services" category, and named without a health condition. Returns the fields to force.
 */
export async function pharmacyServiceFields(db: DbOrTx, merchantId: string, f: { name?: string; description?: string | null }) {
  const shop = { vertical: PHARMACY_VERTICAL };
  assertPharmacyText(shop, f.name, "The appointment type", { mode: "label", allowServiceWords: true });
  assertPharmacyText(shop, f.description, "The description", { mode: "label", allowServiceWords: true });
  await ensureLockedCategories(db, merchantId);
  const [cat] = await db
    .select({ id: merchantCategories.id })
    .from(merchantCategories)
    .where(and(eq(merchantCategories.merchantId, merchantId), eq(merchantCategories.name, "Pharmacy services")))
    .limit(1);
  return { priceCents: 0, priceFrom: false, depositCents: 0, rebookAfterDays: null as number | null, taxable: false, categoryId: cat?.id ?? null };
}

export const pharmacyNoNotes = () => new HttpError(422, "pharmacy_no_notes", "Pharmacy appointments don't take notes or a reason for the visit. Keep health information in your pharmacy system.");
export const pharmacyNoCheckout = () => new HttpError(409, "pharmacy_no_checkout", "Pharmacy appointments aren't billed here, and they never earn points or discounts. Mark the appointment completed instead.");

/** Throw if a pharmacy appointment is being given a note or a client note. */
export function assertNoPharmacyNotes(m: Pick<Merchant, "vertical">, ...notes: (string | null | undefined)[]): void {
  if (isPharmacy(m) && notes.some((n) => (n ?? "").trim())) throw pharmacyNoNotes();
}
