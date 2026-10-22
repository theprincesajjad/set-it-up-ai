// Contracts for the restaurant pack: restaurant. Owned by the restaurant build team.
import { z } from "zod";
export const _placeholder = z.never().optional();

// ===========================================================================
// Catering (restaurant.catering, Growth): inquiry → tasting → quote → deposit → invoice
// ===========================================================================
export const CATERING_EVENT_TYPES = ["wedding", "walima", "mehndi", "engagement", "birthday", "aqiqah", "corporate", "religious", "other"] as const;
export type CateringEventType = (typeof CATERING_EVENT_TYPES)[number];
export const CATERING_SERVICES = ["delivery", "pickup", "onsite", "banquet"] as const;
export type CateringService = (typeof CATERING_SERVICES)[number];
export const CATERING_STATUSES = ["inquiry", "tasting", "quoted", "confirmed", "completed", "cancelled"] as const;
export type CateringStatus = (typeof CATERING_STATUSES)[number];

const cateringDate = z.iso.date();
const cateringTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const cateringInquiryBody = z.object({
  eventType: z.enum(CATERING_EVENT_TYPES),
  eventDate: cateringDate,
  startTime: cateringTime.nullish(),
  headcount: z.number().int().min(1).max(5000),
  service: z.enum(CATERING_SERVICES).default("delivery"),
  venueName: z.string().trim().max(200).nullish(),
  venueAddress: z.string().trim().max(400).nullish(),
  dietaryNotes: z.string().trim().max(2000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});
export type CateringInquiryBody = z.input<typeof cateringInquiryBody>;

/** Signed-in customer inquiry: the shop comes from the body. */
export const cateringMyInquiryBody = cateringInquiryBody.extend({ merchantId: z.uuid() });

/** Public (no login) inquiry form on the shop's page. */
export const cateringPublicInquiryBody = cateringInquiryBody.extend({
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(7).max(20),
  email: z.email().max(200).nullish(),
});

/** One menu line. Per-head lines multiply by headcount; tray lines multiply by quantity. */
export const cateringMenuItemInput = z
  .object({
    catalogItemId: z.uuid().nullish(),
    /** Required when there is no catalogItemId. */
    name: z.string().trim().min(1).max(200).nullish(),
    pricing: z.enum(["per_head", "tray"]),
    /** per_head: price per guest. Defaults to catalog price / serves (or the price when serves is unset). */
    perHeadCents: z.number().int().min(0).max(1_000_000).nullish(),
    /** tray: number of trays/pots. Defaults to ceil(headcount / serves) when the catalog item has serves. */
    quantity: z.number().int().min(1).max(1000).nullish(),
    /** tray: price per tray. Defaults to the catalog price. */
    unitPriceCents: z.number().int().min(0).max(100_000_000).nullish(),
  })
  .refine((v) => v.catalogItemId || v.name, { message: "Pick a catalog item or give the line a name" });

export const cateringExtraLine = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(1000).default(1),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
});

export const cateringMenuBody = z.object({
  items: z.array(cateringMenuItemInput).max(100),
  /** Staffing, delivery, rentals... */
  extras: z.array(cateringExtraLine).max(30).default([]),
  /** Deposit in basis points of the total (default 3000 = 30%). */
  depositBps: z.number().int().min(0).max(10_000).optional(),
});
export type CateringMenuBody = z.input<typeof cateringMenuBody>;

export const updateCateringBody = z
  .object({
    eventType: z.enum(CATERING_EVENT_TYPES),
    eventDate: cateringDate,
    startTime: cateringTime.nullable(),
    headcount: z.number().int().min(1).max(5000),
    service: z.enum(CATERING_SERVICES),
    venueName: z.string().trim().max(200).nullable(),
    venueAddress: z.string().trim().max(400).nullable(),
    dietaryNotes: z.string().trim().max(2000).nullable(),
    notes: z.string().trim().max(4000).nullable(),
  })
  .partial();

export const cateringTastingBody = z.object({ tastingAt: z.iso.datetime({ offset: true }) });
export const cateringSendQuoteBody = z.object({ channels: z.array(z.enum(["sms", "email"])).min(1).default(["sms", "email"]) });
export const cateringApproveBody = z.object({ signatureName: z.string().trim().min(2).max(120) });
export const cateringMarkDepositBody = z.object({ method: z.enum(["cash", "etransfer", "cheque", "other"]).default("other"), note: z.string().max(300).nullish() });
export const cateringInvoiceBody = z.object({ send: z.boolean().default(true) });
export const cateringCancelBody = z.object({ reason: z.string().trim().max(1000).nullish() });

export const listCateringQuery = z.object({
  status: z.enum(CATERING_STATUSES).optional(),
  from: cateringDate.optional(),
  to: cateringDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export const cateringCalendarQuery = z.object({ from: cateringDate, to: cateringDate });

export interface CateringLineDto {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}
export interface CateringEventDto {
  id: string;
  merchantId: string;
  userId: string;
  number: number;
  customer: { name: string | null; phone: string | null; email: string | null } | null;
  eventType: CateringEventType;
  eventDate: string;
  startTime: string | null;
  headcount: number;
  venueName: string | null;
  venueAddress: string | null;
  service: CateringService;
  status: CateringStatus;
  menu: { catalogItemId: string | null; name: string; perHeadCents: number | null; quantity: number | null; unitPriceCents: number | null }[];
  perHeadCents: number;
  lineItems: CateringLineDto[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositBps: number;
  depositCents: number;
  balanceCents: number;
  dietaryNotes: string | null;
  notes: string | null;
  tastingAt: string | null;
  quoteSentAt: string | null;
  approvedAt: string | null;
  signatureName: string | null;
  /** Staff view only. */
  signatureIp?: string | null;
  signatureUserAgent?: string | null;
  depositPaidAt: string | null;
  invoiceId: string | null;
  hallBookingId: string | null;
  /** Public approval link; null until the quote is sent. */
  approvalUrl: string | null;
  createdAt: string;
}
export interface CateringDepositPaymentDto {
  paymentIntentId: string;
  clientSecret: string | null;
  amountCents: number;
}
export interface PublicCateringResponse {
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null };
  event: CateringEventDto;
  canApprove: boolean;
  depositDue: boolean;
}
export interface ApproveCateringResponse {
  event: CateringEventDto;
  deposit: CateringDepositPaymentDto | null;
}
export interface CateringCalendarResponse {
  items: CateringEventDto[];
  /** Confirmed events and guests per day, for capacity planning. */
  days: { date: string; events: number; headcount: number }[];
}
export interface CateringInvoiceDto {
  id: string;
  number: number;
  cateringEventId: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositAppliedCents: number;
  amountDueCents: number;
  payUrl: string | null;
}

// ===========================================================================
// Banquet (restaurant.banquet, Pro): halls, availability, holds, confirmation
// ===========================================================================
export const BOOKING_STATUSES = ["hold", "confirmed", "cancelled", "completed"] as const;
export type HallBookingStatus = (typeof BOOKING_STATUSES)[number];

export const hallPackage = z.object({
  name: z.string().trim().min(1).max(120),
  perHeadCents: z.number().int().min(0).max(1_000_000),
  includes: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
});
export const createHallBody = z.object({
  name: z.string().trim().min(1).max(120),
  capacity: z.number().int().min(1).max(5000),
  description: z.string().trim().max(2000).nullish(),
  baseCents: z.number().int().min(0).max(100_000_000).default(0),
  packages: z.array(hallPackage).max(20).default([]),
  depositBps: z.number().int().min(0).max(10_000).default(2500),
  active: z.boolean().default(true),
});
export const updateHallBody = createHallBody.partial();

export const hallAvailabilityQuery = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  hallId: z.uuid().optional(),
});
export const createHoldBody = z.object({
  hallId: z.uuid(),
  eventType: z.enum(CATERING_EVENT_TYPES).default("other"),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  headcount: z.number().int().min(1).max(5000),
  packageName: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  cateringEventId: z.uuid().nullish(),
  /** Staff only: book on behalf of a customer (phone) instead of the signed-in user. */
  customer: z.object({ phone: z.string().min(7).max(20), name: z.string().trim().max(120).nullish() }).nullish(),
});
export type CreateHoldBody = z.input<typeof createHoldBody>;
export const listHallBookingsQuery = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  hallId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export const linkCateringBody = z.object({ cateringEventId: z.uuid() });
export const confirmHallBookingBody = z.object({
  /** Mark the deposit as received outside the app (cash / e-transfer). */
  markDepositPaid: z.boolean().default(false),
});

export interface HallDto {
  id: string;
  merchantId: string;
  name: string;
  capacity: number;
  description: string | null;
  baseCents: number;
  packages: { name: string; perHeadCents: number; includes: string[] }[];
  depositBps: number;
  active: boolean;
  createdAt: string;
}
export interface HallBookingDto {
  id: string;
  hallId: string;
  hallName: string | null;
  merchantId: string;
  userId: string;
  eventType: CateringEventType;
  startsAt: string;
  endsAt: string;
  headcount: number;
  packageName: string | null;
  status: HallBookingStatus;
  holdExpiresAt: string | null;
  totalCents: number;
  depositCents: number;
  depositPaidAt: string | null;
  cateringEventId: string | null;
  notes: string | null;
  createdAt: string;
}
export interface HallAvailabilityResponse {
  halls: { hall: HallDto; busy: { bookingId: string; status: HallBookingStatus; startsAt: string; endsAt: string }[] }[];
}
export interface HoldResponse {
  booking: HallBookingDto;
  deposit: CateringDepositPaymentDto | null;
}
