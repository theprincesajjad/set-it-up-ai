/**
 * Payments recorded by hand (Interac e-transfer, cash, cheque) for tiffin charges, catering
 * deposits and balances, and hall instalments, plus the shop settings that go with them:
 * how the shop gets paid, GST/HST status, and food safety dates.
 *
 * Money is integer cents. Recorded payments carry no platform fee.
 */
import { z } from "zod";
import { centsSchema } from "./common.js";

export const MANUAL_METHODS = ["etransfer", "cash", "cheque", "other"] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];
export const MANUAL_SUBJECT_TYPES = ["tiffin_charge", "catering_deposit", "catering_balance", "hall_instalment", "order_refund"] as const;
/** `order_refund` is money the shop hands back by hand (a butcher weigh-in below the deposit): the row's amount is what went out, not what came in. */
export type ManualSubjectType = (typeof MANUAL_SUBJECT_TYPES)[number];
export const MAX_GRACE_DAYS = 14;
export const DEFAULT_GRACE_DAYS = 3;

/** Body for every "record payment" route. `receivedOn` can't be in the future (checked against the shop's today). */
export const recordPaymentBody = z.object({
  method: z.enum(MANUAL_METHODS),
  amountCents: centsSchema.min(1),
  receivedOn: z.iso.date(),
  bankReference: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(300).nullish(),
  sendReceipt: z.boolean().default(true),
  /** Hall bookings only: which instalment of the schedule this pays (0-based). */
  instalmentIndex: z.number().int().min(0).max(11).optional(),
});
export type RecordPaymentBody = z.input<typeof recordPaymentBody>;
export const voidPaymentBody = z.object({ reason: z.string().trim().min(1).max(300), paymentId: z.uuid().optional() });

export interface ManualPaymentDto {
  id: string;
  subjectType: ManualSubjectType;
  subjectId: string;
  instalmentIndex: number | null;
  method: ManualMethod;
  amountCents: number;
  receivedOn: string;
  bankReference: string | null;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

/** What a customer sees when a payment is due by e-transfer. */
export interface ManualInstructions {
  email: string;
  amountCents: number;
  referenceCode: string;
  instructions: string;
}

export const paymentSettingsBody = z.object({
  etransferEnabled: z.boolean().default(false),
  etransferEmail: z.string().trim().toLowerCase().email().max(200).nullish(),
  instructions: z.string().trim().max(500).nullish(),
  cashEnabled: z.boolean().default(false),
  graceDays: z.number().int().min(0).max(MAX_GRACE_DAYS).default(DEFAULT_GRACE_DAYS),
  /** A new hand-paid subscriber starts getting meals before the first payment is recorded. */
  startOnTrust: z.boolean().default(false),
  /** Card / bank debit can be switched off (only shown while the shop has Stripe set up). */
  cardEnabled: z.boolean().default(true),
  padEnabled: z.boolean().default(true),
});
export type PaymentSettingsBody = z.input<typeof paymentSettingsBody>;
export interface PaymentSettingsDto {
  etransferEnabled: boolean;
  etransferEmail: string | null;
  instructions: string | null;
  cashEnabled: boolean;
  graceDays: number;
  startOnTrust: boolean;
  cardEnabled: boolean;
  padEnabled: boolean;
  /** Read-only: the shop can take card payments through Stripe. */
  stripeReady: boolean;
}

/** GET /merchants/:m/tiffin/awaiting */
export interface AwaitingCharge {
  chargeId: string;
  subscriptionId: string;
  customerName: string | null;
  planName: string;
  referenceCode: string | null;
  amountCents: number;
  remainingCents: number;
  periodStart: string;
  since: string;
  ageDays: number;
}
export interface AwaitingResponse {
  items: AwaitingCharge[];
  totalCents: number;
}

export const taxSettingsBody = z.object({
  taxRegistered: z.boolean(),
  taxNumber: z.string().trim().max(30).nullish(),
  taxSmallSupplierNote: z.boolean().default(false),
});
export type TaxSettingsBody = z.input<typeof taxSettingsBody>;
export interface TaxSettingsDto {
  /** null = not asked yet. */
  taxRegistered: boolean | null;
  taxNumber: string | null;
  taxSmallSupplierNote: boolean;
  province: string;
  /** Basis points charged on sales right now (0 when not registered). */
  rateBps: number;
}

export const foodSafetyBody = z.object({
  foodHandlerExpiry: z.iso.date().nullish(),
  healthUnit: z.string().trim().max(60).nullish(),
  healthUnitNotifiedOn: z.iso.date().nullish(),
  foodHandlerBadge: z.boolean().default(false),
});
export type FoodSafetyBody = z.input<typeof foodSafetyBody>;
export interface FoodSafetyDto {
  foodHandlerExpiry: string | null;
  healthUnit: string | null;
  healthUnitNotifiedOn: string | null;
  foodHandlerBadge: boolean;
  /** Whole days until the certificate expires (negative = expired); null when no date is set. */
  daysToExpiry: number | null;
}

/** The merchant fields the customer app needs: methods the shop accepts. */
export interface AcceptedMethods {
  card: boolean;
  pad: boolean;
  etransfer: boolean;
  cash: boolean;
}

export const COPY_INSTRUCTIONS_DEFAULT = "Send an Interac e-transfer and put the reference code in the message.";
