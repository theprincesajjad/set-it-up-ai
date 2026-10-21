/**
 * API contract for the "staff" area: counter operations under
 * /v1/merchants/:merchantId/counter/... (staff app "counter mode" and the
 * customer-facing kiosk tablet). Endpoint docs: docs/engineering/api/staff.md.
 *
 * Every write that can be retried takes an idempotencyKey (body field, or the
 * `Idempotency-Key` header). Generate one UUID per tap and reuse it on retry.
 */
import { z } from "zod";
import { centsSchema, phoneSchema, uuidSchema } from "./common.js";
import { consentSchema, type DiscountCardDto, type NextRewardDto, type VipLevelDto } from "./customer.js";

export const QR_PAYLOAD_PREFIX = "LL:";
export const UNDO_WINDOW_MINUTES = 15;
export const SYNC_MAX_EVENTS = 100;
/** Offline events older than this are rejected. */
export const SYNC_MAX_AGE_DAYS = 7;

export const idempotencyKeySchema = z.string().min(8).max(128);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
/**
 * GET .../counter/lookup?q=
 * q is auto-detected:
 *  - "LL:XXXXXXXX" (scanned QR) or an 8-char member code → exact member
 *  - 10/11 digit or +E.164 phone → exact member
 *  - exactly 4 digits → last-4 phone search (up to 10 matches)
 */
export const lookupQuery = z.object({ q: z.string().trim().min(4).max(40) });
export type LookupQuery = z.infer<typeof lookupQuery>;

export const purchaseLineSchema = z.object({
  amountCents: centsSchema,
  categoryId: uuidSchema.nullish(),
  itemId: uuidSchema.nullish(),
  quantity: z.number().int().min(1).max(1000).optional(),
});

/** Identify the customer by exactly one of phone, memberCode (or scanned QR payload) or memberId. */
const customerRef = {
  phone: phoneSchema.optional(),
  memberCode: z.string().trim().min(6).max(40).optional(),
  memberId: uuidSchema.optional(),
};
const oneCustomerRef = (b: { phone?: string; memberCode?: string; memberId?: string }) =>
  [b.phone, b.memberCode, b.memberId].filter(Boolean).length === 1;

const awardFields = z.object({
  ...customerRef,
  /** Purchase total; ignored when lines are given. Omit for visit/stamp programs. */
  amountCents: centsSchema.optional(),
  /** Itemised purchase so no-earn categories (prescriptions, alcohol...) are excluded. */
  lines: z.array(purchaseLineSchema).max(200).optional(),
  locationId: uuidSchema.optional(),
  /** Customer's name, used only when the phone is new to the network. */
  customerName: z.string().trim().min(1).max(120).optional(),
  /** Customer said yes to marketing at the counter (CASL express consent; staff read `text` aloud or showed it). */
  consent: consentSchema.optional(),
});

/** POST .../counter/award */
export const awardBody = awardFields
  .extend({ idempotencyKey: idempotencyKeySchema.optional() })
  .refine(oneCustomerRef, { message: "Provide exactly one of phone, memberCode or memberId" });
export type AwardBody = z.infer<typeof awardBody>;

/** POST .../counter/redeem */
export const redeemBody = z.object({
  memberId: uuidSchema,
  rewardId: uuidSchema,
  /** Eligible subtotal, to compute percent-off rewards. */
  subtotalCents: centsSchema.optional(),
  locationId: uuidSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});
export type RedeemBody = z.infer<typeof redeemBody>;

/** POST .../counter/redemptions/verify */
export const verifyRedemptionBody = z.object({ code: z.string().trim().min(4).max(12) });
export type VerifyRedemptionBody = z.infer<typeof verifyRedemptionBody>;

/** GET .../counter/today?locationId= */
export const todayQuery = z.object({ locationId: uuidSchema.optional() });

/** GET .../counter/activity?locationId=&limit= */
export const activityQuery = z.object({
  locationId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** POST .../counter/transactions/:transactionId/undo */
export const undoBody = z.object({ reason: z.string().trim().min(1).max(300).default("Undo at counter") });
export type UndoBody = z.infer<typeof undoBody>;

export const syncAwardEvent = awardFields.extend({
  type: z.literal("award"),
  idempotencyKey: idempotencyKeySchema,
  /** When the staff member tapped award on the device (ISO). */
  occurredAt: z.iso.datetime({ offset: true }),
});
export const syncRedeemEvent = z.object({
  type: z.literal("redeem"),
  idempotencyKey: idempotencyKeySchema,
  occurredAt: z.iso.datetime({ offset: true }),
  memberId: uuidSchema,
  rewardId: uuidSchema,
  subtotalCents: centsSchema.optional(),
  locationId: uuidSchema.optional(),
});
export const syncEvent = z.discriminatedUnion("type", [syncAwardEvent, syncRedeemEvent]);
export type SyncEvent = z.infer<typeof syncEvent>;

/** POST .../counter/sync */
export const syncBody = z.object({ events: z.array(syncEvent).min(1).max(SYNC_MAX_EVENTS) });
export type SyncBody = z.infer<typeof syncBody>;

/** POST .../counter/kiosk/check-in */
export const kioskCheckInBody = z.object({
  phone: phoneSchema,
  locationId: uuidSchema,
  consent: consentSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});
export type KioskCheckInBody = z.infer<typeof kioskCheckInBody>;

/** POST .../counter/members/merge (manager+) */
export const mergeMembersBody = z.object({
  /** Duplicate to fold in. Its balance moves to the target and it is marked merged. */
  sourceMemberId: uuidSchema,
  /** Member to keep. */
  targetMemberId: uuidSchema,
  reason: z.string().trim().min(3).max(300),
});
export type MergeMembersBody = z.infer<typeof mergeMembersBody>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
export interface AffordableRewardDto {
  id: string;
  name: string;
  pointsCost: number;
}

/** What staff see about a member. Phone is always masked. */
export interface MemberSummaryDto {
  memberId: string;
  name: string | null;
  /** "(416) ***-1234" */
  maskedPhone: string | null;
  memberCode: string;
  balance: number;
  terminology: string;
  visitCount: number;
  lastVisitAt: string | null;
  joinedAt: string;
  vip: VipLevelDto | null;
  rewardsAffordable: AffordableRewardDto[];
  nextReward: NextRewardDto | null;
  discountCards: DiscountCardDto[];
  /** Customer has a reward code issued from the app waiting to be verified. */
  openRedemptionCount: number;
  marketingConsent: boolean;
  /** Point expiry disclosure for the balance (rule 6). */
  expiryDisclosure: string;
}

/** GET .../counter/lookup */
export interface LookupResponse {
  /** How q was interpreted. */
  matchedBy: "member_code" | "phone" | "last4";
  items: MemberSummaryDto[];
  /** For phone lookups with no member: the normalized phone, so the UI can offer "award & join". */
  normalizedPhone: string | null;
}

/** POST .../counter/award */
export interface AwardResponse {
  member: MemberSummaryDto;
  memberCreated: boolean;
  duplicate: boolean;
  /** Null when nothing was earned (e.g. $0 purchase). */
  transactionId: string | null;
  pointsEarned: number;
  /** Network perk / campaign bonus points on top. */
  extraPoints: number;
  balance: number;
  breakdown: string[];
  eligibleCents: number;
  excludedCents: number;
  rewardsAvailable: AffordableRewardDto[];
  messages: string[];
  /** Whether an SMS receipt was queued (merchant setting on, member not muted). */
  receiptQueued: boolean;
}

/** POST .../counter/redeem and POST .../counter/redemptions/verify */
export interface CounterRedemptionResponse {
  redemption: {
    id: string;
    code: string;
    status: "issued" | "used" | "void";
    discountCents: number | null;
    reward: AffordableRewardDto & { rewardType: string; value: number };
    transactionId: string | null;
    createdAt: string;
    usedAt: string | null;
  };
  member: MemberSummaryDto;
  duplicate: boolean;
}

export interface CounterVisitDto {
  visitId: string;
  memberId: string;
  name: string | null;
  maskedPhone: string | null;
  locationId: string | null;
  points: number;
  amountCents: number | null;
  source: string;
  createdAt: string;
}

/** GET .../counter/today */
export interface TodayResponse {
  /** Merchant-local date, YYYY-MM-DD. */
  date: string;
  visitCount: number;
  newMembers: number;
  pointsIssued: number;
  redemptions: number;
  items: CounterVisitDto[];
}

export interface ActivityItemDto {
  transactionId: string;
  memberId: string;
  name: string | null;
  maskedPhone: string | null;
  type: string;
  source: string;
  points: number;
  amountCents: number | null;
  description: string | null;
  staffUserId: string | null;
  staffName: string | null;
  locationId: string | null;
  reversed: boolean;
  /** Whether the caller may undo it right now. */
  canUndo: boolean;
  createdAt: string;
}

/** GET .../counter/activity */
export interface ActivityResponse {
  items: ActivityItemDto[];
}

/** POST .../counter/transactions/:transactionId/undo */
export interface UndoResponse {
  reversalTransactionId: string;
  member: MemberSummaryDto;
}

export type SyncEventResult =
  | { idempotencyKey: string; type: "award"; status: "ok" | "duplicate"; result: AwardResponse }
  | { idempotencyKey: string; type: "redeem"; status: "ok" | "duplicate"; result: CounterRedemptionResponse }
  | { idempotencyKey: string; type: "award" | "redeem"; status: "error"; error: { code: string; message: string } };

/** POST .../counter/sync — results are in the same order as events. */
export interface SyncResponse {
  results: SyncEventResult[];
  /** Counts by status. Retry only events with retryable errors (code "internal"). */
  summary: { ok: number; duplicate: number; error: number };
}

/** POST .../counter/kiosk/check-in (customer-facing; no surname, no full phone) */
export interface KioskCheckInResponse {
  memberCreated: boolean;
  /** "visit" = points/stamp awarded; "enrolled" = joined/recognised only (per-dollar programs earn at the till). */
  outcome: "visit" | "enrolled";
  pointsEarned: number;
  balance: number;
  terminology: string;
  firstName: string | null;
  maskedPhone: string;
  nextReward: NextRewardDto | null;
  rewardsAvailable: AffordableRewardDto[];
  expiryDisclosure: string;
  /** Ready-to-show sentence, e.g. "Welcome back Sam! You have 7 stamps." */
  message: string;
}

/** POST .../counter/members/merge */
export interface MergeMembersResponse {
  target: MemberSummaryDto;
  movedPoints: number;
  movedVisits: number;
  transferTransactionIds: string[];
}
