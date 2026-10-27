/**
 * API contract for the "service" area (Pro): service tickets, quotes with
 * e-signature approval, deposits and invoices. Routes:
 * apps/api/src/routes/service (+ public quote/invoice pages in routes/public).
 * Endpoint docs: docs/engineering/api/service.md and docs/engineering/api/public.md.
 */
import { z } from "zod";
import { centsSchema, phoneSchema, uuidSchema } from "./common.js";

const isoDateTime = z.iso.datetime({ offset: true });

export const TICKET_STATUSES = ["intake", "diagnosing", "quote_sent", "approved", "declined", "in_progress", "waiting_parts", "ready", "picked_up", "cancelled"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const QUOTE_STATUSES = ["draft", "sent", "approved", "declined", "expired", "superseded"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const INVOICE_STATUSES = ["draft", "open", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const ITEM_KINDS = ["device", "vehicle", "garment", "other"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Statuses staff can set directly (quote statuses come from the quote flow). */
export const MANUAL_TICKET_STATUSES = ["diagnosing", "in_progress", "waiting_parts", "ready", "picked_up", "cancelled"] as const;

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
/** make, model, serial, imei, vin, plate, mileage, colour, size, ... */
export const itemDetailsSchema = z.record(z.string().min(1).max(40), z.string().max(200));

/** An uploaded photo: an absolute URL, or the API's own relative upload path (stored form, resolved to absolute when read). */
const uploadRef = z.union([z.url(), z.string().regex(/^\/v1\/public\/uploads\/[\w./-]+$/)]);

export const createTicketBody = z.object({
  customer: z.object({ phone: phoneSchema, name: z.string().trim().max(120).nullish() }),
  locationId: uuidSchema.nullish(),
  itemKind: z.enum(ITEM_KINDS).default("device"),
  itemDetails: itemDetailsSchema.default({}),
  issue: z.string().trim().min(1).max(2000),
  intakeNotes: z.string().max(4000).nullish(),
  /** Already-uploaded photo URLs. */
  photos: z.array(uploadRef).max(20).default([]),
  promisedAt: isoDateTime.nullish(),
  assignedStaffId: uuidSchema.nullish(),
  /** Condition chips ticked at intake. */
  intakeChecklist: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  /** The customer accepted the shop's drop-off terms. Required when the shop has terms (merchants.intakeTerms). */
  termsAccepted: z.boolean().default(false),
  shelfLocation: z.string().trim().max(40).nullish(),
  /** More than one item on a ticket (alterations, dry cleaning). Stored in itemDetails.items. */
  items: z.array(z.object({ description: z.string().trim().min(1).max(200), tag: z.string().trim().max(40).nullish() })).max(30).optional(),
  /** Check-in from a drop-off booking: links the booking to the new ticket. */
  bookingId: uuidSchema.nullish(),
});
export type CreateTicketBody = z.input<typeof createTicketBody>;

export const updateTicketBody = z.object({
  locationId: uuidSchema.nullish(),
  itemKind: z.enum(ITEM_KINDS).optional(),
  itemDetails: itemDetailsSchema.optional(),
  issue: z.string().trim().min(1).max(2000).optional(),
  intakeNotes: z.string().max(4000).nullish(),
  photos: z.array(uploadRef).max(20).optional(),
  promisedAt: isoDateTime.nullish(),
  assignedStaffId: uuidSchema.nullish(),
  intakeChecklist: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  shelfLocation: z.string().trim().max(40).nullish(),
});
export type UpdateTicketBody = z.input<typeof updateTicketBody>;

export const listTicketsQuery = z.object({
  /** Comma-separated statuses. Default: every open status (not picked_up/cancelled). */
  status: z.string().optional(),
  /** Search ticket number, customer phone/name, issue, item details. */
  q: z.string().max(100).optional(),
  /** Only tickets assigned to this staff member. */
  assignedTo: uuidSchema.optional(),
  dueState: z.enum(["today", "overdue"]).optional(),
  hasPhotos: z.enum(["true"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const ticketStatusBody = z.object({
  status: z.enum(MANUAL_TICKET_STATUSES),
  note: z.string().max(2000).nullish(),
  /** Send push + SMS for customer-facing statuses (in_progress, waiting_parts, ready). Default true. */
  notify: z.boolean().default(true),
  /** picked_up with an unpaid open invoice is refused unless true. */
  allowUnpaid: z.boolean().default(false),
});
export type TicketStatusBody = z.input<typeof ticketStatusBody>;

export const ticketEventBody = z.object({
  note: z.string().trim().min(1).max(2000),
  visibleToCustomer: z.boolean().default(false),
});
export type TicketEventBody = z.input<typeof ticketEventBody>;

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
export const lineItemSchema = z
  .object({
    description: z.string().trim().min(1).max(300),
    quantity: z.number().int().min(1).max(1000),
    /** A negative price is only allowed on a fee line (a credit such as the diagnostic fee). */
    unitPriceCents: z.number().int().min(-100_000_000).max(100_000_000),
    kind: z.enum(["labour", "part", "fee", "other"]).default("other"),
    /** Merchant category; no-earn categories don't earn points on payment. */
    categoryId: uuidSchema.nullish(),
    /** Price-list entry this line came from (services table), used by rebooking. */
    serviceId: uuidSchema.nullish(),
    /** A vehicle part is new, used or reconditioned; the estimate says which. */
    condition: z.enum(["new", "used", "reconditioned"]).nullish(),
  })
  .refine((l) => l.unitPriceCents >= 0 || l.kind === "fee", { message: "Only a fee line can be a credit", path: ["unitPriceCents"] });
export type LineItemInput = z.input<typeof lineItemSchema>;

export const createQuoteBody = z
  .object({
    diagnosis: z.string().max(4000).nullish(),
    lineItems: z.array(lineItemSchema).min(1).max(100),
    /** Deposit as % of the quote total (service.deposits). Mutually exclusive with depositCents. */
    depositPercent: z.number().int().min(0).max(100).optional(),
    depositCents: centsSchema.optional(),
    /** Days the customer has to respond once sent. */
    expiresInDays: z.number().int().min(1).max(90).default(7),
    /** Send immediately (same as POST .../quotes/:id/send). */
    send: z.boolean().default(false),
  })
  .refine((b) => b.depositPercent === undefined || b.depositCents === undefined, { message: "Use depositPercent or depositCents, not both" });
export type CreateQuoteBody = z.input<typeof createQuoteBody>;

/** Preview totals for a quote under construction: the server's tax, deposit and the price cap the customer will see. */
export const previewQuoteBody = z.object({
  lineItems: z.array(lineItemSchema).max(100).default([]),
  depositPercent: z.number().int().min(0).max(100).optional(),
  depositCents: centsSchema.optional(),
});

/** Record a phone approval: name, phone and time are kept with the quote. */
export const authorizeQuoteByPhoneBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export const approveQuoteBody = z.object({
  /** Typed full name = e-signature. */
  signatureName: z.string().trim().min(2).max(120),
});
export const declineQuoteBody = z.object({ reason: z.string().max(1000).nullish() });

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export const createInvoiceBody = z.object({
  /** Start from the ticket's approved quote (default true). */
  fromQuote: z.boolean().default(true),
  /** Use this approved quote (a revision the customer approved) instead of the latest approved one. */
  quoteId: uuidSchema.optional(),
  /** Extra work/parts on top of the quote, or all lines when fromQuote=false. */
  extraLineItems: z.array(lineItemSchema).max(100).default([]),
  /** Open it and send the pay link to the customer (default true). */
  send: z.boolean().default(true),
});
export type CreateInvoiceBody = z.input<typeof createInvoiceBody>;

export const listInvoicesQuery = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  /** open invoices past 7 days. */
  filter: z.enum(["overdue"]).optional(),
  /** Customer name, phone, invoice or ticket number. */
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const markInvoicePaidBody = z.object({ method: z.enum(["cash", "card_terminal", "etransfer", "cheque", "other"]).default("card_terminal"), note: z.string().max(300).nullish() });

/** Pay link: the tip is added on top of the balance. 0 to 100% of the pre-tax subtotal; never taxed, never earns points. */
export const payInvoiceBody = z.object({ tipCents: centsSchema.default(0) });

export interface UploadResponse {
  url: string;
  contentType: string;
  bytes: number;
}

/** Mark that the shop sent the notice required before selling an unclaimed item (its own decision and paperwork). */
export const lienNoticeBody = z.object({ note: z.string().max(500).nullish() });

/** Shop-level repair settings: drop-off terms the customer accepts, the warranty days shown on the status page, and tips. */
export const serviceSettingsBody = z.object({
  intakeTerms: z.string().trim().max(4000).nullish(),
  warrantyDays: z.number().int().min(0).max(3650).nullish(),
  /** null = by vertical (on for salon, barber, spa; off for repair). */
  tipsEnabled: z.boolean().nullish(),
  tipPresets: z.array(z.number().int().min(1).max(100)).min(1).max(4).optional(),
});
export interface ServiceSettingsDto {
  intakeTerms: string | null;
  warrantyDays: number | null;
  tipsEnabled: boolean | null;
  /** What `tipsEnabled: null` means for this shop's kind of business. */
  tipsDefault: boolean;
  tipPresets: number[];
}

// Rebooking (service.rebooking)
export const REBOOK_STATES = ["due", "late", "snoozed"] as const;
export const rebookingQuery = z.object({ state: z.enum(REBOOK_STATES).default("due") });
export const rebookingActionBody = z.object({ snoozeDays: z.number().int().min(1).max(180).default(14) });
export const rebookingSettingsBody = z.object({ auto: z.boolean() });
export const rebookRuleBody = z.object({ rebookAfterDays: z.number().int().min(1).max(730).nullable() });

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------
export interface LineItemDto {
  description: string;
  quantity: number;
  unitPriceCents: number;
  kind: "labour" | "part" | "fee" | "other";
  categoryId: string | null;
  totalCents: number;
  condition?: "new" | "used" | "reconditioned" | null;
}

export interface TicketEventDto {
  id: string;
  status: TicketStatus | null;
  note: string | null;
  visibleToCustomer: boolean;
  actorUserId: string | null;
  createdAt: string;
}

export interface TicketDto {
  id: string;
  merchantId: string;
  merchantName: string;
  locationId: string | null;
  userId: string;
  number: number;
  itemKind: ItemKind;
  itemDetails: Record<string, string>;
  issue: string;
  /** Staff only (null for customers). */
  intakeNotes: string | null;
  photos: string[];
  status: TicketStatus;
  assignedStaffId: string | null;
  promisedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { name: string | null; phone: string | null; language?: string | null };
  intakeChecklist: string[];
  termsAcceptedAt: string | null;
  shelfLocation: string | null;
  /** Set when the ticket became ready; drives "ready N days". */
  readyAt: string | null;
  /** Staff only: latest live quote and invoice, for the board. */
  quote?: { status: QuoteStatus; totalCents: number; sentAt: string | null; firstViewedAt: string | null; expiresAt: string | null } | null;
  invoice?: { status: InvoiceStatus; amountDueCents: number; totalCents: number } | null;
  dueState?: "overdue" | "today" | null;
  assignedStaff?: { id: string; initials: string; name: string | null } | null;
  /** Staff only: public status page (/t/<token>). */
  statusUrl?: string | null;
  /** Staff only: ready 60+ days and uncollected. Shown, never acted on. */
  lienEligible?: boolean;
  lienNoticeSentAt?: string | null;
  depositPaidCents?: number;
}

export interface TicketSummaryResponse {
  needsYou: number;
  waitingOnCustomer: number;
  dueToday: number;
  overdue: number;
  readyUncollected: number;
  oldestReadyDays: number;
  openQuoteValueCents: number;
  openQuoteCount: number;
  lienEligible: number;
}

/** What the shop sees about how a quote was approved. */
export interface QuoteAuthorizationDto {
  method: "link" | "phone" | "counter";
  name: string;
  phone?: string | null;
  note?: string | null;
  at: string;
  staffId?: string | null;
}

export interface QuotePreviewResponse {
  subtotalCents: number;
  taxCents: number;
  taxLabel: string;
  taxLines: { label: string; cents: number }[];
  totalCents: number;
  depositCents: number;
  /** Highest final price the customer is told they will pay (total plus 10%). */
  maxAuthorizedCents: number;
}

export interface QuoteDto {
  id: string;
  ticketId: string;
  merchantId: string;
  lineItems: LineItemDto[];
  diagnosis: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  status: QuoteStatus;
  /** Public approval link (sent quotes only). */
  approvalUrl: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  signatureName: string | null;
  /** Staff only: e-signature log. */
  signatureIp?: string | null;
  signatureUserAgent?: string | null;
  declineReason: string | null;
  depositPaidAt: string | null;
  createdAt: string;
  /** First time the customer opened the link. */
  firstViewedAt: string | null;
  authorizedBy: QuoteAuthorizationDto | null;
  /** Total plus 10%, rounded down: the most the shop may invoice without a new approval. */
  maxAuthorizedCents: number;
}

export interface InvoiceDto {
  id: string;
  merchantId: string;
  userId: string;
  ticketId: string | null;
  number: number;
  lineItems: LineItemDto[];
  subtotalCents: number;
  taxCents: number;
  depositAppliedCents: number;
  totalCents: number;
  amountDueCents: number;
  platformFeeCents: number;
  status: InvoiceStatus;
  /** Public pay link (open invoices). */
  payUrl: string | null;
  paidAt: string | null;
  pointsEarned: number;
  createdAt: string;
  tipCents: number;
}

/** Invoice list row (dashboard). */
export interface InvoiceRowDto extends InvoiceDto {
  customerName: string | null;
  customerPhone: string | null;
  ticketNumber: number | null;
  itemLabel: string | null;
  /** Plain-words last activity, built by the server from ticket events. */
  lastActivity: string | null;
  lastActivityAt: string | null;
  overdue: boolean;
}

/** GET /v1/merchants/:merchantId/invoices/summary */
export interface InvoiceSummaryResponse {
  openCents: number;
  openCount: number;
  openReadyTickets: number;
  overdueCents: number;
  overdueCount: number;
  oldestOverdueDays: number;
  paidThisMonthCents: number;
  paidThisMonthCount: number;
  depositsHeldCents: number;
  depositsHeldQuotes: number;
  avgDaysToPay: number | null;
}

/** GET /v1/merchants/:merchantId/invoices (rows) */
export interface InvoiceListResponse {
  items: InvoiceRowDto[];
  nextCursor: string | null;
}

/** GET /v1/merchants/:merchantId/tickets/:ticketId and GET /v1/me/tickets/:ticketId */
export interface TicketDetailResponse {
  ticket: TicketDto;
  /** Customers only see visibleToCustomer events. */
  events: TicketEventDto[];
  /** Customers don't see drafts. */
  quotes: QuoteDto[];
  invoices: InvoiceDto[];
  /** Staff only: who this customer is to the shop. */
  customerSummary?: { pastTickets: number; lastTicketAt: string | null; balance: number | null; visits: number };
}

export interface DepositPaymentDto {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
}

/** POST .../approve */
export interface ApproveQuoteResponse {
  quote: QuoteDto;
  ticketStatus: TicketStatus;
  /** Present when the quote requires a deposit and in-app payments are set up. */
  deposit: DepositPaymentDto | null;
}

/** GET /v1/public/quotes/:token */
export interface PublicQuoteResponse {
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null; vertical: string };
  ticket: { number: number; itemKind: ItemKind; itemDetails: Record<string, string>; issue: string; status: TicketStatus };
  /** Set for a bridal or other event quote (itemDetails.eventType): wedding facts shown above the lines. */
  event: { type: string; date: string | null; start: string | null; where: string | null; trial: string | null; balanceDueOn: string | null } | null;
  /** Date the shop promised the work, if any. */
  promisedAt: string | null;
  /** "HST 13%", or null when the shop charges no tax. */
  taxLabel: string | null;
  /** The shop's own drop-off terms, shown above the signature. */
  terms: string | null;
  quote: QuoteDto;
  expired: boolean;
  canRespond: boolean;
  depositDue: boolean;
}

/** GET /v1/public/invoices/:token */
export interface PublicInvoiceResponse {
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null; vertical: string };
  ticket: { number: number; itemKind: ItemKind; itemDetails: Record<string, string> } | null;
  invoice: InvoiceDto;
  canPay: boolean;
  /** Tip picker settings. Presets are percents of `baseCents` (the pre-tax subtotal). */
  tip: { enabled: boolean; presets: number[]; baseCents: number; staff: { id: string; name: string } | null };
  /** Points this payment will earn: lines only, never tax or tips. */
  pointsPreview: number;
  /** "HST 13%", or null when the shop charges no tax. */
  taxLabel: string | null;
  /** The estimate the customer approved for this ticket and how the invoice compares: the Ontario invoice must show it. Null when there was none. */
  estimate: InvoiceEstimateDto | null;
  /** Vehicle facts printed on the invoice (odometer in and out, replaced parts, warranty). Null unless the ticket is a vehicle. */
  vehicle: InvoiceVehicleDto | null;
}

export interface InvoiceEstimateDto {
  totalCents: number;
  /** When the customer approved it and how: link, phone or counter. */
  approvedAt: string | null;
  approvedBy: string | null;
  method: "link" | "phone" | "counter" | null;
  /** Percent the invoice is over the estimate, one decimal; negative when under. */
  percentOver: number;
  maxAuthorizedCents: number;
}
export interface InvoiceVehicleDto {
  label: string;
  odometerIn: string | null;
  odometerOut: string | null;
  partsReturn: "offered" | "declined" | "not_applicable" | null;
  warrantyDays: number;
  warrantyKm: number;
  warrantyExempt: string;
  /** Dates: the estimate was given, work authorised, invoice made. */
  estimateGivenAt: string | null;
}

/** GET /v1/public/tickets/:token: status page, no sign-in. */
export interface PublicTicketStatusResponse {
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null; vertical: string; address: string | null; mapUrl: string | null };
  ticket: { number: number; itemKind: ItemKind; itemLabel: string; issue: string; status: TicketStatus; promisedAt: string | null; readyAt: string | null; updatedAt: string };
  events: { status: TicketStatus | null; note: string | null; createdAt: string }[];
  /** Open invoice the customer can pay now. */
  invoice: { number: number; amountDueCents: number; depositAppliedCents: number; payUrl: string | null; status: InvoiceStatus } | null;
  quote: { status: QuoteStatus; totalCents: number; approvalUrl: string | null } | null;
  warrantyDays: number | null;
}

// ---------------------------------------------------------------------------
// Rebooking and uncollected items
// ---------------------------------------------------------------------------
export interface RebookingRowDto {
  userId: string;
  serviceId: string;
  customerName: string | null;
  customerPhone: string | null;
  serviceName: string;
  lastVisitAt: string;
  rebookAfterDays: number;
  dueOn: string;
  daysLate: number;
  channel: "sms" | "push";
  language: string;
  state: "due" | "late" | "snoozed";
  /** False when the customer has not agreed to messages from the shop (or has no phone or app). */
  canSend: boolean;
}

export interface RebookingResponse {
  items: RebookingRowDto[];
  counts: { due: number; late: number; snoozed: number };
  settings: { auto: boolean };
  stats: { dueThisWeek: number; sentLast30: number; sentSms: number; sentPush: number; bookedWithin7Days: number; nudgedCount: number; optedOut: number };
}

export interface RebookRuleDto {
  serviceId: string;
  name: string;
  rebookAfterDays: number | null;
}

export interface PickupReminderRow {
  ticketId: string;
  number: number;
  customerName: string | null;
  itemLabel: string;
  readyDays: number;
  lastStep: number;
  lienEligible: boolean;
  lienNoticeSentAt: string | null;
}

export interface UncollectedResponse {
  items: PickupReminderRow[];
  ladder: { day: number; action: string }[];
}

/** POST /v1/public/invoices/:token/pay and POST /v1/me/invoices/:invoiceId/pay */
export interface PayInvoiceResponse {
  invoice: InvoiceDto;
  payment: { paymentIntentId: string; clientSecret: string; amountCents: number } | null;
}
