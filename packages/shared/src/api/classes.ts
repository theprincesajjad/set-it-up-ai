/**
 * API contract for classes and memberships (Pro): a class schedule with capacity and a waitlist,
 * drop-ins, class packs and intro offers, recurring memberships with freezes and Ontario-compliant cancellation,
 * late-cancel fees and door check-in. Features `booking.classes` and `memberships.recurring`.
 * Routes: apps/api/src/routes/classes. Docs: docs/engineering/api/classes.md.
 *
 * Money is integer cents (CAD). Timestamps are ISO-8601 strings; dates ("2026-11-12") are the studio's local days.
 */
import { z } from "zod";
import { centsSchema, uuidSchema, phoneSchema } from "./common.js";

const isoDateTime = z.iso.datetime({ offset: true });

export const CLASS_PRODUCT_KINDS = ["drop_in", "pack", "membership"] as const;
export type ClassProductKind = (typeof CLASS_PRODUCT_KINDS)[number];

export const CLASS_BOOKING_STATUSES = ["held", "booked", "waitlisted", "attended", "cancelled", "late_cancelled", "no_show"] as const;
export type ClassBookingStatus = (typeof CLASS_BOOKING_STATUSES)[number];
/** Statuses that take a spot (a held booking is waiting for its drop-in payment). */
export const SPOT_STATUSES = ["held", "booked", "attended"] as const;

export const MEMBERSHIP_STATUSES = ["pending", "active", "frozen", "past_due", "cancelled", "expired"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PASS_STATUSES = ["pending", "active", "used_up", "expired", "refunded"] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

/** Ontario Consumer Protection Act, 2002, personal development services (verify with counsel): a 10-day cooling-off right. */
export const COOLING_OFF_DAYS = 10;
/** A fixed term, and a pack's validity, may not run longer than one year (same Act). */
export const MAX_TERM_MONTHS = 12;
export const MAX_PACK_VALID_DAYS = 365;
/** A fixed-term renewal notice goes out 30 to 90 days before the term ends. */
export const RENEWAL_NOTICE_MIN_DAYS = 30;
export const RENEWAL_NOTICE_MAX_DAYS = 90;
/** An unpaid drop-in booking holds its spot this long. */
export const DROP_IN_HOLD_MINUTES = 10;
export const DEFAULT_CLASS_CANCEL_WINDOW_HOURS = 12;

export const PAY_WITH = ["membership", "pass", "drop_in", "comp"] as const;
export type PayWith = (typeof PAY_WITH)[number];

// ---------------------------------------------------------------------------
// Settings, class types and sessions (merchant)
// ---------------------------------------------------------------------------
export const classSettingsBody = z.object({
  cancelWindowHours: z.number().int().min(0).max(72).optional(),
  lateFeeCents: centsSchema.max(10_000).optional(),
  waitlistCutoffMinutes: z.number().int().min(0).max(720).optional(),
  freezeMaxDays: z.number().int().min(7).max(90).optional(),
  freezesPerYear: z.number().int().min(0).max(6).optional(),
  renewalNoticeDays: z.number().int().min(RENEWAL_NOTICE_MIN_DAYS).max(RENEWAL_NOTICE_MAX_DAYS).optional(),
  termsNote: z.string().trim().max(1500).nullish(),
  awardOnCheckIn: z.boolean().optional(),
  /** Every N classes attended earns a reward (null turns it off). */
  milestoneClasses: z.number().int().min(2).max(500).nullish(),
  milestoneRewardName: z.string().trim().min(1).max(80).nullish(),
});
export type ClassSettingsBody = z.infer<typeof classSettingsBody>;
export interface ClassSettingsDto {
  cancelWindowHours: number;
  lateFeeCents: number;
  waitlistCutoffMinutes: number;
  freezeMaxDays: number;
  freezesPerYear: number;
  renewalNoticeDays: number;
  termsNote: string | null;
  awardOnCheckIn: boolean;
  milestoneClasses: number | null;
  milestoneRewardName: string | null;
}

const typeFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  durationMin: z.number().int().min(10).max(240).default(60),
  capacity: z.number().int().min(1).max(200).default(16),
  womenOnly: z.boolean().default(false),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(100000).default(0),
};
export const createClassTypeBody = z.object(typeFields);
export const updateClassTypeBody = z.object(typeFields).partial();
export interface ClassTypeDto {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  capacity: number;
  womenOnly: boolean;
  active: boolean;
  sort: number;
}
export interface ClassTypesResponse {
  items: ClassTypeDto[];
}

export const createSessionBody = z.object({
  classTypeId: uuidSchema,
  startsAt: isoDateTime,
  locationId: uuidSchema.optional(),
  instructorName: z.string().trim().max(120).nullish(),
  /** A team member with the Instructor role (or anyone on the team): they see this class on their own login. */
  instructorUserId: uuidSchema.nullish(),
  room: z.string().trim().max(60).nullish(),
  capacity: z.number().int().min(1).max(200).optional(),
  womenOnly: z.boolean().optional(),
  notes: z.string().trim().max(500).nullish(),
  /** Repeat weekly for this many weeks in total (1 = just this one). */
  repeatWeeks: z.number().int().min(1).max(26).default(1),
});
export const updateSessionBody = z.object({
  startsAt: isoDateTime.optional(),
  instructorName: z.string().trim().max(120).nullish(),
  instructorUserId: uuidSchema.nullish(),
  room: z.string().trim().max(60).nullish(),
  capacity: z.number().int().min(1).max(200).optional(),
  womenOnly: z.boolean().optional(),
  notes: z.string().trim().max(500).nullish(),
});
export const cancelSessionBody = z.object({ reason: z.string().trim().max(300).optional() });
export const listSessionsQuery = z.object({ from: isoDateTime.optional(), to: isoDateTime.optional(), locationId: uuidSchema.optional() });

export interface MySessionState {
  bookingId: string;
  status: ClassBookingStatus;
  /** 1-based place on the waitlist. */
  waitlistPosition: number | null;
  payWith: PayWith | null;
  /** Last moment to cancel for free (ISO). */
  freeCancelUntil: string;
  holdExpiresAt: string | null;
}
export interface ClassSessionDto {
  id: string;
  classTypeId: string | null;
  name: string;
  instructorName: string | null;
  /** Studio screens only. */
  instructorUserId?: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  waitlisted: number;
  womenOnly: boolean;
  status: "scheduled" | "cancelled";
  locationId: string;
  notes: string | null;
  /** Customer reads only. */
  mine?: MySessionState | null;
}
export interface SessionsResponse {
  items: ClassSessionDto[];
}
export interface CreateSessionsResponse {
  items: ClassSessionDto[];
}

// ---------------------------------------------------------------------------
// Products (merchant) and the public list
// ---------------------------------------------------------------------------
const productFields = {
  kind: z.enum(CLASS_PRODUCT_KINDS),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  priceCents: centsSchema.min(0),
  credits: z.number().int().min(1).max(200).nullish(),
  validDays: z.number().int().min(1).max(MAX_PACK_VALID_DAYS).nullish(),
  introOnly: z.boolean().default(false),
  termMonths: z.number().int().min(2).max(MAX_TERM_MONTHS).nullish(),
  classesPerMonth: z.number().int().min(1).max(60).nullish(),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(100000).default(0),
};
export const createProductBody = z.object(productFields).superRefine((b, ctx) => {
  if (b.kind === "pack" && (!b.credits || !b.validDays)) ctx.addIssue({ code: "custom", message: "A pack needs a number of classes and the days it stays valid", path: ["credits"] });
  if (b.kind !== "pack" && b.introOnly) ctx.addIssue({ code: "custom", message: "Only a pack can be an intro offer", path: ["introOnly"] });
  if (b.kind !== "membership" && (b.termMonths || b.classesPerMonth)) ctx.addIssue({ code: "custom", message: "Term and monthly classes are for memberships", path: ["termMonths"] });
});
export const updateProductBody = z.object(productFields).partial();
export interface ProductDto {
  id: string;
  kind: ClassProductKind;
  name: string;
  description: string | null;
  priceCents: number;
  credits: number | null;
  validDays: number | null;
  introOnly: boolean;
  termMonths: number | null;
  classesPerMonth: number | null;
  taxable: boolean;
  active: boolean;
  sort: number;
  /** Merchant lists: live memberships or packs sold in the last 30 days. */
  activeCount?: number;
  soldLast30?: number;
}
export interface ProductsResponse {
  items: ProductDto[];
}

export interface TaxCopyDto {
  applies: boolean;
  name: string;
}
export interface PublicClassesQuery {
  from?: string;
  to?: string;
}
export const publicClassesQuery = z.object({ from: isoDateTime.optional(), to: isoDateTime.optional() });
export interface PublicClassesResponse {
  shop: { id: string; name: string; slug: string; address: string | null; phone: string | null; timezone: string; brandColor: string | null; logoUrl: string | null };
  policy: { cancelWindowHours: number; lateFeeCents: number; waitlistCutoffMinutes: number; termsNote: string | null };
  sessions: ClassSessionDto[];
  products: ProductDto[];
  tax: TaxCopyDto;
  /** True when at least one class is a women-only class. */
  hasWomenOnly: boolean;
}

// ---------------------------------------------------------------------------
// Customer: bookings, passes, memberships
// ---------------------------------------------------------------------------
export const bookClassBody = z.object({
  sessionId: uuidSchema,
  /** auto = membership, then the pass that expires first; drop_in = pay for this class. */
  use: z.enum(["auto", "drop_in"]).default("auto"),
  /** Join the waitlist when the class is full (default). */
  waitlist: z.boolean().default(true),
});
export const purchaseBody = z.object({ productId: uuidSchema });
export const joinMembershipBody = z.object({
  productId: uuidSchema,
  /** The member read the agreement shown on screen. Required. */
  acceptAgreement: z.literal(true),
  /** The agreement text the member saw; the server rejects it when the offer changed since. */
  agreementHash: z.string().min(8).max(128),
  startDate: z.iso.date().optional(),
});
export const freezeBody = z.object({ days: z.number().int().min(7).max(90), startDate: z.iso.date().optional() });
export const cancelMembershipBody = z.object({ reason: z.string().trim().max(300).optional() });

export interface PaymentRefDto {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
}
export interface MyBookingDto {
  id: string;
  status: ClassBookingStatus;
  payWith: PayWith | null;
  waitlistPosition: number | null;
  holdExpiresAt: string | null;
  freeCancelUntil: string;
  lateFeeCents: number;
  session: ClassSessionDto;
  merchant: { id: string; name: string; slug: string; address: string | null; timezone: string };
}
export interface BookClassResponse {
  booking: MyBookingDto;
  /** A drop-in payment to confirm in the browser (card), when the class was not covered by a pass. */
  payment: PaymentRefDto | null;
  /** What happened: booked with a credit, held for payment, or placed on the waitlist. */
  outcome: "booked" | "needs_payment" | "waitlisted";
  /** Waitlisted with nothing to use: the waitlist skips people without a pass, so the person must buy one first. */
  waitlistNeedsPass?: boolean;
}
export interface CancelBookingResponse {
  booking: MyBookingDto;
  /** The credit went back (cancelled in time). */
  creditReturned: boolean;
  /** Cancelled inside the window: the credit is used. */
  late: boolean;
  feeChargedCents: number;
}

export interface MyPassDto {
  id: string;
  name: string;
  creditsTotal: number;
  creditsLeft: number;
  expiresAt: string;
  introOffer: boolean;
  status: PassStatus;
  merchant: { id: string; name: string; slug: string };
}
export interface AgreementDto {
  text: string;
  /** Hash of the text and price; sent back on sign-up. */
  hash: string;
  studio: string;
  totalPerPeriodCents: number;
  taxPerPeriodCents: number;
}
export interface MyMembershipDto {
  id: string;
  name: string;
  status: MembershipStatus;
  priceCents: number;
  /** Tax per period, cents (0 when the studio is not registered). */
  taxCents: number;
  totalCents: number;
  termMonths: number | null;
  classesPerMonth: number | null;
  /** Classes used in this billing period (when limited). */
  usedThisPeriod: number;
  startDate: string;
  termEndsOn: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  frozenFrom: string | null;
  frozenUntil: string | null;
  cancelEffectiveOn: string | null;
  coolingOffEndsOn: string | null;
  /** Inside the 10-day window: cancelling refunds everything. */
  inCoolingOff: boolean;
  card: { brand: string | null; last4: string | null } | null;
  agreementText: string;
  renewalNoticeSentAt: string | null;
  declineRenewal: boolean;
  /** Set when a charge failed and is waiting for the member. */
  amountDueCents: number | null;
  canFreeze: boolean;
  merchant: { id: string; name: string; slug: string };
}
export interface MyClassesResponse {
  passes: MyPassDto[];
  memberships: MyMembershipDto[];
  bookings: MyBookingDto[];
  /** Intro offers a person can still buy at each studio they have not bought from. */
  introEligible: boolean;
}
export interface PurchaseResponse {
  pass: MyPassDto | null;
  payment: PaymentRefDto | null;
}
export interface JoinMembershipResponse {
  membership: MyMembershipDto;
  payment: PaymentRefDto | null;
}
export interface MembershipChangeResponse {
  membership: MyMembershipDto;
  /** Cooling-off cancellation: what went back to the card. */
  refundedCents?: number;
}
export interface MembershipSetupResponse {
  setupIntentId: string;
  clientSecret: string;
}

// ---------------------------------------------------------------------------
// Staff: roster, check-in, members
// ---------------------------------------------------------------------------
export interface RosterRowDto {
  bookingId: string;
  memberId: string | null;
  userId: string;
  name: string | null;
  maskedPhone: string | null;
  status: ClassBookingStatus;
  payWith: PayWith | null;
  /** Human line: "Unlimited", "8-pack, 5 left", "Intro, 2 left", "Drop-in". */
  payLabel: string;
  waitlistPosition: number | null;
  checkedInAt: string | null;
  creditReturned: boolean;
}
export interface RosterResponse {
  session: ClassSessionDto;
  policy: { cancelWindowHours: number; lateFeeCents: number; freeCancelUntil: string };
  rows: RosterRowDto[];
}
export const staffBookBody = z
  .object({
    phone: phoneSchema.optional(),
    memberCode: z.string().trim().min(6).max(40).optional(),
    memberId: uuidSchema.optional(),
    customerName: z.string().trim().min(1).max(120).optional(),
    /** comp = no pass used (a guest or a make-good). Default: use the member's membership or pass. */
    comp: z.boolean().default(false),
    /** Add above the capacity. */
    overCapacity: z.boolean().default(false),
  })
  .refine((b) => [b.phone, b.memberCode, b.memberId].filter(Boolean).length === 1, { message: "Provide exactly one of phone, memberCode or memberId" });
export const checkInBody = z
  .object({
    phone: phoneSchema.optional(),
    memberCode: z.string().trim().min(6).max(40).optional(),
    memberId: uuidSchema.optional(),
    /** Which class. Default: the class at this studio that is open now or next. */
    sessionId: uuidSchema.optional(),
    /** Not booked: add them to the class using their pass or membership. */
    addIfNotBooked: z.boolean().default(true),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .refine((b) => [b.phone, b.memberCode, b.memberId].filter(Boolean).length === 1, { message: "Provide exactly one of phone, memberCode or memberId" });
export type CheckInBody = z.infer<typeof checkInBody>;
export const checkInRowBody = z.object({ idempotencyKey: z.string().min(8).max(128).optional() });
export const markBookingBody = z.object({
  /** no_show = absent; excused = a late cancel or no-show the studio forgives (credit back, no fee). */
  status: z.enum(["no_show", "excused"]),
});
export const moveWaitlistBody = z.object({ position: z.number().int().min(1).max(200) });
export const staffCancelBookingBody = z.object({ free: z.boolean().optional() });
export const bookInBody = z.object({ comp: z.boolean().optional(), overCapacity: z.boolean().optional() });

export type CheckInOutcome = "checked_in" | "already_checked_in" | "added_and_checked_in" | "not_booked" | "class_full" | "no_pass" | "past_due" | "no_class";
export interface CheckInResponse {
  outcome: CheckInOutcome;
  /** What the desk shows and says. */
  message: string;
  session: ClassSessionDto | null;
  member: { memberId: string; name: string | null; maskedPhone: string | null; memberCode: string | null } | null;
  pass: { label: string; creditsLeft: number | null; renewsOn: string | null } | null;
  pointsEarned: number;
  balance: number | null;
  visitsThisMonth: number | null;
  amountDueCents: number | null;
  arrived: number;
  booked: number;
}
export interface CheckInArrival {
  bookingId: string;
  name: string | null;
  payLabel: string;
  at: string;
}
export interface DoorResponse {
  session: ClassSessionDto | null;
  arrivals: CheckInArrival[];
}

export const listMembersQuery = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["all", "active", "frozen", "past_due", "cancelled", "renewal_due", "pending"]).default("all"),
});
export interface StudioMemberDto {
  membershipId: string;
  userId: string;
  name: string | null;
  maskedPhone: string | null;
  offer: string;
  status: MembershipStatus;
  priceCents: number;
  nextBillingDate: string | null;
  termEndsOn: string | null;
  cancelEffectiveOn: string | null;
  frozenUntil: string | null;
  issue: string | null;
  card: { brand: string | null; last4: string | null } | null;
}
export interface StudioMembersResponse {
  items: StudioMemberDto[];
}
export interface StudioSummaryResponse {
  activeMembers: number;
  frozenMembers: number;
  pastDue: number;
  /** Monthly recurring revenue before tax, cents (active and past-due memberships). */
  mrrCents: number;
  cancelledLast30: number;
  packSalesCents: number;
  bookedThisWeek: number;
  capacityThisWeek: number;
  waitlistedNow: number;
  lateCancelsThisWeek: number;
  renewalsDue: number;
}
export const studioCancelBody = z.object({
  effective: z.enum(["now", "period_end"]).default("period_end"),
  /** Refund the latest paid period (a studio decision for moving, injury or illness). */
  refundLast: z.boolean().default(false),
  reason: z.string().trim().max(300).optional(),
});
export const studioFreezeBody = z.object({ days: z.number().int().min(7).max(90), startDate: z.iso.date().optional() });
export const recordSaleBody = z.object({
  productId: uuidSchema,
  phone: phoneSchema.optional(),
  memberCode: z.string().trim().min(6).max(40).optional(),
  memberId: uuidSchema.optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  /** Paid at the desk by hand: no platform fee. */
  method: z.enum(["cash", "etransfer", "card_reader"]).default("cash"),
}).refine((b) => [b.phone, b.memberCode, b.memberId].filter(Boolean).length === 1, { message: "Provide exactly one of phone, memberCode or memberId" });
