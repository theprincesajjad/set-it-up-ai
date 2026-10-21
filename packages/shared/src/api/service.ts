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

export const createTicketBody = z.object({
  customer: z.object({ phone: phoneSchema, name: z.string().trim().max(120).nullish() }),
  locationId: uuidSchema.nullish(),
  itemKind: z.enum(ITEM_KINDS).default("device"),
  itemDetails: itemDetailsSchema.default({}),
  issue: z.string().trim().min(1).max(2000),
  intakeNotes: z.string().max(4000).nullish(),
  /** Already-uploaded photo URLs. */
  photos: z.array(z.url()).max(20).default([]),
  promisedAt: isoDateTime.nullish(),
  assignedStaffId: uuidSchema.nullish(),
});
export type CreateTicketBody = z.input<typeof createTicketBody>;

export const updateTicketBody = z.object({
  locationId: uuidSchema.nullish(),
  itemKind: z.enum(ITEM_KINDS).optional(),
  itemDetails: itemDetailsSchema.optional(),
  issue: z.string().trim().min(1).max(2000).optional(),
  intakeNotes: z.string().max(4000).nullish(),
  photos: z.array(z.url()).max(20).optional(),
  promisedAt: isoDateTime.nullish(),
  assignedStaffId: uuidSchema.nullish(),
});
export type UpdateTicketBody = z.input<typeof updateTicketBody>;

export const listTicketsQuery = z.object({
  /** Comma-separated statuses. Default: every open status (not picked_up/cancelled). */
  status: z.string().optional(),
  /** Search ticket number, customer phone/name, issue, item details. */
  q: z.string().max(100).optional(),
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
export const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(1000),
  unitPriceCents: centsSchema,
  kind: z.enum(["labour", "part", "fee", "other"]).default("other"),
  /** Merchant category; no-earn categories don't earn points on payment. */
  categoryId: uuidSchema.nullish(),
});
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
  /** Extra work/parts on top of the quote, or all lines when fromQuote=false. */
  extraLineItems: z.array(lineItemSchema).max(100).default([]),
  /** Open it and send the pay link to the customer (default true). */
  send: z.boolean().default(true),
});
export type CreateInvoiceBody = z.input<typeof createInvoiceBody>;

export const listInvoicesQuery = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const markInvoicePaidBody = z.object({ method: z.enum(["cash", "card_terminal", "other"]).default("card_terminal"), note: z.string().max(300).nullish() });

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
  customer?: { name: string | null; phone: string | null };
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
}

/** GET /v1/merchants/:merchantId/tickets/:ticketId and GET /v1/me/tickets/:ticketId */
export interface TicketDetailResponse {
  ticket: TicketDto;
  /** Customers only see visibleToCustomer events. */
  events: TicketEventDto[];
  /** Customers don't see drafts. */
  quotes: QuoteDto[];
  invoices: InvoiceDto[];
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
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null };
  ticket: { number: number; itemKind: ItemKind; itemDetails: Record<string, string>; issue: string; status: TicketStatus };
  quote: QuoteDto;
  expired: boolean;
  canRespond: boolean;
  depositDue: boolean;
}

/** GET /v1/public/invoices/:token */
export interface PublicInvoiceResponse {
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null };
  ticket: { number: number; itemKind: ItemKind; itemDetails: Record<string, string> } | null;
  invoice: InvoiceDto;
  canPay: boolean;
}

/** POST /v1/public/invoices/:token/pay and POST /v1/me/invoices/:invoiceId/pay */
export interface PayInvoiceResponse {
  invoice: InvoiceDto;
  payment: { paymentIntentId: string; clientSecret: string; amountCents: number } | null;
}
