/**
 * API contract for the "commerce" area (Plus): catalog, order-ahead, pickup
 * and drop-off slots, bookings. Routes: apps/api/src/routes/commerce and the
 * public menu/slots in routes/public. Endpoint docs:
 * docs/engineering/api/commerce.md and docs/engineering/api/public.md.
 *
 * Money is integer cents (CAD). Timestamps are ISO-8601 strings.
 */
import { z } from "zod";
import { centsSchema, uuidSchema } from "./common.js";
import { dietaryTagsSchema, tenderSchema, translationsSchema, type DietaryTagsInput } from "./restaurant.js";

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export const modifierOptionSchema = z.object({ name: z.string().trim().min(1).max(60), priceCents: z.number().int().min(0).max(100_000) });
export const modifierGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  options: z.array(modifierOptionSchema).min(1).max(30),
});

export const createCatalogItemBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullish(),
  priceCents: centsSchema,
  categoryId: uuidSchema.nullish(),
  imageUrl: z.url().nullish(),
  modifiers: z.array(modifierGroupSchema).max(20).default([]),
  available: z.boolean().default(true),
  orderable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  /** Restaurant pack: dietary tags (restaurant.dietary_tags) and hi/ur/pa translations (restaurant.multilingual_menu). */
  dietary: dietaryTagsSchema.optional(),
  translations: translationsSchema.optional(),
  /** Restaurant pack: degh pre-orders (restaurant.degh_preorders). */
  preorderOnly: z.boolean().optional(),
  leadTimeHours: z.number().int().min(0).max(24 * 30).optional(),
  serves: z.number().int().min(1).max(5000).nullish(),
  depositBps: z.number().int().min(0).max(10_000).optional(),
  /** Kitchen station (restaurant.kds), e.g. "tandoor". */
  station: z.string().trim().min(1).max(40).nullish(),
});
export type CreateCatalogItemBody = z.input<typeof createCatalogItemBody>;

export const updateCatalogItemBody = createCatalogItemBody.partial();
export type UpdateCatalogItemBody = z.input<typeof updateCatalogItemBody>;

export const createCategoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  /** false = no-earn category (prescriptions, alcohol, tobacco, lottery, gift cards). */
  earnEligible: z.boolean().default(true),
  discountEligible: z.boolean().default(true),
});
export type CreateCategoryBody = z.input<typeof createCategoryBody>;
export const updateCategoryBody = createCategoryBody.partial();
export type UpdateCategoryBody = z.input<typeof updateCategoryBody>;

export interface ModifierGroupDto {
  name: string;
  options: { name: string; priceCents: number }[];
}

export interface CatalogCategoryDto {
  id: string;
  name: string;
  earnEligible: boolean;
  discountEligible: boolean;
}

export interface CatalogItemDto {
  id: string;
  merchantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  modifiers: ModifierGroupDto[];
  available: boolean;
  orderable: boolean;
  sortOrder: number;
  createdAt: string;
  /** Restaurant-pack shops only (the keys are absent for other shops). */
  dietary?: DietaryTagsInput;
  translations?: Record<string, { name?: string; description?: string }>;
  preorderOnly?: boolean;
  leadTimeHours?: number;
  serves?: number | null;
  depositBps?: number;
  station?: string | null;
  /** Public menu: card price is priceCents; set when the shop shows a cash price (restaurant.dual_pricing). */
  cashPriceCents?: number;
}

/** GET /v1/merchants/:merchantId/catalog */
export interface CatalogResponse {
  categories: CatalogCategoryDto[];
  items: CatalogItemDto[];
}

export interface TaxInfoDto {
  province: string;
  /** e.g. "HST 13%" */
  label: string;
  /** Total rate in parts per million (130000 = 13%). */
  ratePpm: number;
}

/** GET /v1/public/shops/:slug/menu */
export interface PublicMenuResponse {
  merchant: { id: string; slug: string; name: string; logoUrl: string | null; brandColor: string | null; timezone: string };
  locations: { id: string; name: string; address: string; hours: Record<string, [string, string][]> | null }[];
  categories: (CatalogCategoryDto & { items: CatalogItemDto[] })[];
  /** Items with no category. */
  uncategorized: CatalogItemDto[];
  tax: TaxInfoDto;
  payInApp: boolean;
  pickupSlots: boolean;
  /** Restaurant-pack shops only. */
  lang?: "en" | "hi" | "ur" | "pa";
  languages?: ("en" | "hi" | "ur" | "pa")[];
  /** Present when the shop shows both prices. */
  dualPricing?: { cashDiscountBps: number };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const ORDER_STATUSES = ["pending", "accepted", "preparing", "ready", "picked_up", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_STATUSES = ["unpaid", "requires_action", "authorized", "paid", "refunded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const orderItemInput = z.object({
  catalogItemId: uuidSchema,
  quantity: z.number().int().min(1).max(50),
  /** One option per modifier group, by name: [{ name: "Size", option: "Large" }]. Prices come from the server. */
  modifiers: z.array(z.object({ name: z.string().min(1), option: z.string().min(1) })).max(20).default([]),
});

export const placeOrderBody = z.object({
  merchantId: uuidSchema,
  locationId: uuidSchema,
  items: z.array(orderItemInput).min(1).max(50),
  /** Requested pickup time; defaults to ASAP. Ignored when slotId is given. */
  pickupAt: isoDateTime.nullish(),
  /** Book a pickup slot (booking.pickup_slots). */
  slotId: uuidSchema.nullish(),
  tipCents: centsSchema.max(100_000).default(0),
  /** Redeem one of the customer's rewards at this merchant against the order. */
  redeemRewardId: uuidSchema.nullish(),
  notes: z.string().max(500).nullish(),
  /** pickup (default) or preorder: degh pots with lead time and deposit (restaurant.degh_preorders). */
  kind: z.enum(["pickup", "preorder"]).default("pickup"),
  /** in_app = card via Stripe (payments.in_app); at_pickup = pay at the counter. */
  paymentMethod: z.enum(["in_app", "at_pickup"]).default("in_app"),
  /** Required. Retries with the same key return the same order. */
  idempotencyKey: z.string().min(8).max(100),
});
export type PlaceOrderBody = z.input<typeof placeOrderBody>;

export const listOrdersQuery = z.object({
  /** Comma-separated statuses. Default: pending,accepted,preparing,ready (the live queue). */
  status: z.string().optional(),
  locationId: uuidSchema.optional(),
  /** Include in-app orders whose payment hasn't completed yet. Default false. */
  includeUnpaid: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const updateOrderStatusBody = z.object({
  status: z.enum(["accepted", "preparing", "ready", "picked_up", "cancelled"]),
  /** Required when cancelling. Shown to the customer. */
  reason: z.string().max(300).nullish(),
  /** Picking up an unpaid order: how it was paid. Cash gets the cash price when the shop uses dual pricing. */
  tender: tenderSchema.optional(),
});
export type UpdateOrderStatusBody = z.input<typeof updateOrderStatusBody>;

export const refundOrderBody = z.object({ reason: z.string().trim().min(1).max(300) });
export const cancelMyOrderBody = z.object({ reason: z.string().max(300).nullish() });

export interface OrderItemDto {
  id: string;
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  modifiers: { name: string; option: string; priceCents: number }[];
  categoryId: string | null;
  lineTotalCents: number;
}

export interface OrderDto {
  id: string;
  merchantId: string;
  merchantName: string;
  locationId: string | null;
  userId: string;
  /** Human-friendly per-merchant number ("#12"). */
  number: number;
  status: OrderStatus;
  pickupAt: string | null;
  notes: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  /** 0.75% of total for in-app payments; 0 when paid at pickup. */
  platformFeeCents: number;
  paymentMethod: "in_app" | "at_pickup";
  paymentStatus: PaymentStatus;
  redemptionId: string | null;
  pointsEarned: number;
  readyAt: string | null;
  pickedUpAt: string | null;
  paidAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  items: OrderItemDto[];
  customer?: { name: string | null; phone: string | null };
  /** Restaurant pack. */
  kind: "pickup" | "preorder" | "tiffin" | "catering" | "banquet" | string;
  channel: string;
  /** Pre-orders: deposit charged online; the balance is due at pickup. */
  depositCents: number;
  depositPaidAt: string | null;
  balanceDueCents: number;
  /** Service fee paid by the customer (commission-free shops). */
  customerFeeCents: number;
  cashDiscountCents: number;
  firedAt: string | null;
  bumpedAt: string | null;
}

/** POST /v1/me/orders */
export interface PlaceOrderResponse {
  order: OrderDto;
  /** Stripe PaymentIntent client secret (in_app orders with a balance). */
  payment: { paymentIntentId: string; clientSecret: string; amountCents: number } | null;
  duplicate: boolean;
}

// ---------------------------------------------------------------------------
// Slots & bookings
// ---------------------------------------------------------------------------
export const SLOT_KINDS = ["pickup", "dropoff", "appointment"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export const generateSlotsBody = z.object({
  locationId: uuidSchema,
  kind: z.enum(SLOT_KINDS).default("pickup"),
  /** First local date (merchant timezone), YYYY-MM-DD. */
  startDate: isoDate,
  days: z.number().int().min(1).max(31).default(7),
  slotMinutes: z.number().int().min(5).max(240).default(15),
  capacity: z.number().int().min(1).max(100).default(4),
});
export type GenerateSlotsBody = z.input<typeof generateSlotsBody>;

export const listSlotsQuery = z.object({
  kind: z.enum(SLOT_KINDS).optional(),
  locationId: uuidSchema.optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const createBookingBody = z.object({
  slotId: uuidSchema,
  orderId: uuidSchema.nullish(),
  ticketId: uuidSchema.nullish(),
  notes: z.string().max(500).nullish(),
});
export type CreateBookingBody = z.input<typeof createBookingBody>;

export const updateBookingBody = z.object({ status: z.enum(["completed", "no_show", "cancelled"]) });

export interface SlotDto {
  id: string;
  merchantId: string;
  locationId: string | null;
  kind: SlotKind;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  remaining: number;
}

export interface BookingDto {
  id: string;
  slotId: string;
  merchantId: string;
  merchantName: string;
  userId: string;
  orderId: string | null;
  ticketId: string | null;
  status: "booked" | "cancelled" | "completed" | "no_show";
  kind: SlotKind;
  startsAt: string;
  endsAt: string;
  locationId: string | null;
  notes: string | null;
  reminderSentAt: string | null;
  createdAt: string;
  /** Merchant views only: who booked, and the order or ticket it is for. */
  customerName?: string | null;
  orderNumber?: number | null;
  ticketNumber?: number | null;
}
