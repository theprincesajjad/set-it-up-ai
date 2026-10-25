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
import { dietaryTagsSchema, recipeSchema, tenderSchema, translationsSchema, type DietaryTagsInput } from "./restaurant.js";
import { itemOptionsSchema, type ItemOptionsDto, type PublicHalalCertification } from "./restaurant-web.js";

const isoDateTime = z.iso.datetime({ offset: true });
type restaurantRecipe = z.infer<typeof recipeSchema>;
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
  /** Degh: minutes from fire to ready, and the per-pot recipe behind "what to cook and buy" (estimates). */
  cookMinutes: z.number().int().min(0).max(24 * 60).optional(),
  recipe: recipeSchema.nullish(),
  /** 86: sold out until this time (null = back on). Hidden from menus and refused at checkout. */
  soldOutUntil: isoDateTime.nullish(),
  /** Size, spice and add-on groups (web ordering). Needs restaurant.degh_preorders or restaurant.dietary_tags. */
  options: itemOptionsSchema.nullish(),
});
export type CreateCatalogItemBody = z.input<typeof createCatalogItemBody>;

export const updateCatalogItemBody = createCatalogItemBody.partial();
export type UpdateCatalogItemBody = z.input<typeof updateCatalogItemBody>;

export const createCategoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  /** false = no-earn category (prescriptions, alcohol, tobacco, lottery, gift cards). */
  earnEligible: z.boolean().default(true),
  discountEligible: z.boolean().default(true),
  translations: translationsSchema.optional(),
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
  /** Restaurant menus: the tab name in hi / ur / pa. Public menu: dropped, `name` is already in the requested language. */
  translations?: Record<string, { name?: string }>;
  /** Public menu in hi / ur / pa: the shop's own (English) tab name. */
  nameEn?: string;
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
  cookMinutes?: number;
  recipe?: restaurantRecipe | null;
  soldOutUntil?: string | null;
  /** Restaurant-pack shops only: option groups; absent when the dish has none. */
  options?: ItemOptionsDto | null;
  /** Public menu in hi / ur / pa: the shop's own (English) name, shown beneath the translated one. */
  nameEn?: string;
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
  /** Restaurant-pack shops with a halal certificate on file; items carry `dietary.halalCertifier` only when it differs. */
  halalCertification?: PublicHalalCertification | null;
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
  /** Restaurant pack: ids from the dish's `options` groups (size, spice, add-ons). Prices come from the server. */
  optionIds: z.array(z.string().min(1).max(40)).max(30).optional(),
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
  /** Restaurants: "Any allergy?" (optional). Shown as a red band on the kitchen ticket. */
  allergyNote: z.string().trim().max(200).nullish(),
  /** pickup (default) or preorder: degh pots with lead time and deposit (restaurant.degh_preorders). */
  kind: z.enum(["pickup", "preorder"]).default("pickup"),
  /** Where the order came from. The web ordering pages send "web". */
  channel: z.enum(["app", "web"]).optional(),
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
  /** Restaurants: guest allergy (kitchen ticket band). */
  allergyNote?: string | null;
  /** Restaurants, staff order list: how a split bill stands (who pays how), empty when not split. */
  splits?: { label: string; tender: "link" | "card" | "cash"; status: "open" | "paid" }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  /** Platform fee on this order (0% on paid plans, 1.5% on Free; see FEES in plans.ts); 0 when paid at pickup. */
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
  /** Single-order reads only: shop slug and address for the confirmation page. */
  merchantSlug?: string;
  shopAddress?: string | null;
  /** Pre-orders: the customer can cancel for a refund until this instant (null: no deposit rule). */
  cancelFreeUntil?: string | null;
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

/** Rolling drop-off slots: how long a slot is, how many drop-offs fit in one, how many days stay open. */
export const updateDropoffSettingsBody = z.object({
  slotMinutes: z.number().int().min(10).max(120).optional(),
  capacity: z.number().int().min(1).max(20).optional(),
  daysAhead: z.number().int().min(1).max(30).optional(),
});
export const blockDropoffDayBody = z.object({ date: isoDate });
export interface DropoffSettingsDto {
  slotMinutes: number;
  capacity: number;
  daysAhead: number;
  /** Local dates (YYYY-MM-DD) closed for drop-offs. */
  blockedDates: string[];
}

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
  customerPhone?: string | null;
  orderNumber?: number | null;
  ticketNumber?: number | null;
}
