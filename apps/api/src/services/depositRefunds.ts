/**
 * Refunding a paid catering or hall deposit when an event or booking is cancelled.
 * The merchant chooses ("full" | "none" | {amountCents}, default none); a hall also has a
 * refund policy applied automatically when the customer cancels. Only deposits paid in the
 * app (a PaymentIntent) can be returned through Stripe; one marked received by hand is
 * returned by the merchant directly. Refunds go through refundConnectPayment.
 */
import type { merchants } from "@ll/db";
import type { restaurantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict } from "../lib/errors.js";
import { money } from "./commerceShared.js";
import { refundConnectPayment, retrieveConnectPayment } from "./payments.js";

type Merchant = typeof merchants.$inferSelect;

export interface PaidDeposit {
  depositCents: number;
  depositPaidAt: Date | null;
  depositPaymentIntentId: string | null;
  depositRefundedAt: Date | null;
}

/**
 * Was the deposit actually paid through the app? A booking or event keeps its (unpaid) deposit PaymentIntent even when
 * staff then record the deposit as received by hand, so the intent itself has to say "succeeded".
 */
export async function paidInApp(ctx: AppContext, merchant: Merchant, d: PaidDeposit): Promise<boolean> {
  if (!d.depositPaidAt || !d.depositPaymentIntentId) return false;
  try {
    return (await retrieveConnectPayment(ctx, merchant, d.depositPaymentIntentId)).status === "succeeded";
  } catch (err) {
    throw new HttpError(502, "refund_error", "We couldn't check the deposit payment with Stripe. Please try again.", { cause: (err as Error).message });
  }
}

/** Cents to refund for the merchant's choice (0 = none). Throws 409 / 400 when the choice can't be honoured. */
export async function resolveDepositRefund(ctx: AppContext, merchant: Merchant, choice: restaurantApi.DepositRefundChoice | undefined, d: PaidDeposit): Promise<number> {
  if (!choice || choice === "none") return 0;
  if (!d.depositPaidAt) throw conflict("No deposit has been paid, so there is nothing to refund.");
  if (d.depositRefundedAt) throw conflict("This deposit was already refunded.");
  if (!(await paidInApp(ctx, merchant, d))) throw conflict("This deposit was recorded as received outside the app, so it can't be refunded here. Return it to the customer directly.");
  if (choice === "full") return d.depositCents;
  if (choice.amountCents > d.depositCents) throw badRequest(`A refund can't be more than the ${money(d.depositCents)} deposit.`);
  return choice.amountCents;
}

/** Refund `amountCents` of a deposit payment. A provider failure is a 502 so the caller doesn't cancel on a refund that didn't happen. */
export async function refundDeposit(ctx: AppContext, merchant: Merchant, d: { kind: "catering_deposit" | "hall_deposit"; id: string; paymentIntentId: string }, amountCents: number, reason: string): Promise<void> {
  try {
    await refundConnectPayment(ctx, merchant, { paymentIntentId: d.paymentIntentId, amountCents, idempotencyKey: `${d.kind}:${d.id}:refund`, reason });
  } catch (err) {
    throw new HttpError(502, "refund_error", "We couldn't send the refund. Nothing was cancelled. Please try again.", { cause: (err as Error).message });
  }
}

/** Customer-facing sentence about a refund (empty when none). */
export function refundSentence(cents: number): string {
  return cents > 0 ? ` ${money(cents)} of your deposit is being refunded to your original payment method. Allow 5 to 10 business days.` : "";
}
