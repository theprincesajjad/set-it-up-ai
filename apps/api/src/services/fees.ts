/**
 * Platform and customer fees on in-app payments (docs/business/pricing.md).
 *
 * One pure function every payment path calls so the numbers never drift:
 *  - order:   0% for shops on a paid plan or any restaurant tier ("commission-free"),
 *             1.5% (FEES.orderBpsFree) for Free shops. Optional $0.49 customer service fee.
 *  - deposit / invoice: 1% (FEES.depositInvoiceBps), every plan.
 *  - tiffin:  1% (FEES.tiffinBps), every plan.
 *  - manual:  0%. Payments a shop records by hand (e-transfer, cash, cheque) never carry a platform fee.
 *  - appointment_checkout: checkout taken through the appointment calendar (counter or in person),
 *             0% (FEES.appointmentCheckoutBps), every plan. Online deposits at booking use "deposit" (1%).
 *  - class:   1% (FEES.classBps): online class bookings, packs, intro offers, membership billing and late-cancel / no-show
 *             fees on a saved card. Hand-recorded desk payments use "manual" (0%).
 * Card processing (Stripe) is passed through at cost on top and is not computed here.
 * Money is integer cents; fees round to the nearest cent.
 */
import { FEES, effectivePlan, type PlanId, type RestaurantTier } from "@ll/shared";

export const FEE_KINDS = ["order", "deposit", "invoice", "tiffin", "appointment_checkout", "class", "manual"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

export interface FeeInput {
  kind: FeeKind;
  /** Amount the platform fee is a share of (the merchant's sale, before any customer fee), in cents. */
  amountCents: number;
  /** merchants.plan */
  plan: PlanId;
  /** merchants.restaurantTier */
  restaurantTier?: RestaurantTier | null;
  /**
   * Add the optional customer service fee (FEES.customerServiceFeeCents). Only applies to
   * orders, and never to a zero-amount order. Default false.
   */
  customerServiceFee?: boolean;
}

export interface FeeResult {
  kind: FeeKind;
  /** Basis points of amountCents kept by the platform (the application fee). */
  platformFeeBps: number;
  /** Platform fee kept by us, taken out of the merchant's payout (application_fee_amount, before customer fee). */
  platformFeeCents: number;
  /** Extra amount shown to and paid by the customer. Store it as orders.customerFeeCents. */
  customerFeeCents: number;
  /** What the customer is charged: amountCents + customerFeeCents. */
  totalChargeCents: number;
  /** What Stripe's application_fee_amount should be: platform fee plus the customer fee we collect. */
  applicationFeeCents: number;
  /** Amount the merchant nets before card processing: amountCents - platformFeeCents. */
  merchantNetCents: number;
}

const bpsFee = (amountCents: number, bps: number) => Math.round((Math.max(0, amountCents) * bps) / 10000);

/** Basis points the platform takes for a payment kind on this plan/tier. */
export function platformFeeBpsFor(kind: FeeKind, plan: PlanId, restaurantTier?: RestaurantTier | null): number {
  if (kind === "manual") return 0;
  if (kind === "order") return effectivePlan(plan, restaurantTier) === "free" ? FEES.orderBpsFree : FEES.orderBpsPaid;
  if (kind === "appointment_checkout") return FEES.appointmentCheckoutBps;
  if (kind === "class") return FEES.classBps;
  return kind === "tiffin" ? FEES.tiffinBps : FEES.depositInvoiceBps;
}

/** Compute the platform fee and customer fee for one payment. */
export function computeFees(input: FeeInput): FeeResult {
  const amount = Math.max(0, Math.round(input.amountCents));
  const bps = platformFeeBpsFor(input.kind, input.plan, input.restaurantTier);
  const platformFeeCents = bpsFee(amount, bps);
  const customerFeeCents = input.kind === "order" && input.customerServiceFee && amount > 0 ? FEES.customerServiceFeeCents : 0;
  return {
    kind: input.kind,
    platformFeeBps: bps,
    platformFeeCents,
    customerFeeCents,
    totalChargeCents: amount + customerFeeCents,
    applicationFeeCents: platformFeeCents + customerFeeCents,
    merchantNetCents: amount - platformFeeCents,
  };
}

/** Platform fee in cents for one payment, from a merchant row (plan + restaurant tier). */
export function platformFeeFor(kind: FeeKind, amountCents: number, merchant: { plan: PlanId; restaurantTier?: RestaurantTier | null }): number {
  return computeFees({ kind, amountCents, plan: merchant.plan, restaurantTier: merchant.restaurantTier }).platformFeeCents;
}
