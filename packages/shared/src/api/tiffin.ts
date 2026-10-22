/**
 * API contract for tiffin (meal subscriptions) in the restaurant pack. Routes:
 * apps/api/src/routes/tiffin (merchant, customer and public sides).
 *
 * Money is integer cents (CAD). Dates are local calendar days (YYYY-MM-DD,
 * America/Toronto). Timestamps are ISO-8601 strings. Merchant routes need the
 * restaurant.tiffin feature (Restaurant Growth).
 */
import { z } from "zod";
import { centsSchema, uuidSchema } from "./common.js";

const isoDate = z.iso.date();
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const TIFFIN_CADENCES = ["weekly", "monthly"] as const;
export type TiffinCadence = (typeof TIFFIN_CADENCES)[number];
export const TIFFIN_FULFILMENTS = ["delivery", "pickup"] as const;
export type TiffinFulfilment = (typeof TIFFIN_FULFILMENTS)[number];
export const TIFFIN_PAYMENT_METHODS = ["card", "pad"] as const;
export type TiffinPaymentMethod = (typeof TIFFIN_PAYMENT_METHODS)[number];
export const TIFFIN_SUB_STATUSES = ["pending", "active", "paused", "past_due", "cancelled"] as const;
export type TiffinSubStatus = (typeof TIFFIN_SUB_STATUSES)[number];
export const TIFFIN_DELIVERY_STATUSES = ["scheduled", "skipped", "out_for_delivery", "delivered", "picked_up", "missed"] as const;
export type TiffinDeliveryStatus = (typeof TIFFIN_DELIVERY_STATUSES)[number];
/** Hour (Toronto) a meal day starts for cutoff purposes: cutoffHours counts back from here. */
export const TIFFIN_MEAL_HOUR = 8;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
type Unwrapped<T> = T extends z.ZodDefault<infer I> ? I : T;
/** Like .partial(), but a field that was not sent stays undefined instead of getting its create-time default. */
function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<{ [K in keyof S]: z.ZodOptional<Unwrapped<S[K]>> }> {
  const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, ((v instanceof z.ZodDefault ? v.removeDefault() : v) as unknown as z.ZodType).optional()]));
  return z.object(shape) as never;
}

export const dietarySchema = z.object({
  halal: z.boolean().optional(),
  zabihah: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  vegan: z.boolean().optional(),
  jain: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  spice: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  halalCertifier: z.string().trim().max(120).optional(),
});
export type Dietary = z.infer<typeof dietarySchema>;

export const translationsSchema = z.record(z.string().min(2).max(10), z.object({ name: z.string().max(120).optional(), description: z.string().max(2000).optional() }));
export type TiffinTranslations = z.infer<typeof translationsSchema>;

export const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  dietary: dietarySchema.optional(),
  /** Optional hi / ur / pa words for the dish; the public page falls back to `name` and `description`. */
  translations: translationsSchema.optional(),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

// ---------------------------------------------------------------------------
// Plans (merchant)
// ---------------------------------------------------------------------------
export const createPlanBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  translations: translationsSchema.default({}),
  cadence: z.enum(TIFFIN_CADENCES).default("monthly"),
  /** 0=Sunday .. 6=Saturday. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  mealsPerDay: z.number().int().min(1).max(4).default(1),
  /** Price per period for one serving. */
  priceCents: centsSchema.min(50),
  /** Each extra serving (family plan) per period. */
  extraServingCents: centsSchema.default(0),
  maxServings: z.number().int().min(1).max(20).default(6),
  dietary: dietarySchema.default({}),
  deliveryFeeCents: centsSchema.default(0),
  pickupAllowed: z.boolean().default(true),
  deliveryAllowed: z.boolean().default(true),
  /** Skips and pauses close this many hours before the meal day starts (8:00 Toronto). */
  cutoffHours: z.number().int().min(0).max(168).default(24),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type CreatePlanBody = z.input<typeof createPlanBody>;
export const updatePlanBody = patchOf(createPlanBody);
export type UpdatePlanBody = z.input<typeof updatePlanBody>;

export interface PlanDto {
  id: string;
  name: string;
  description: string | null;
  translations: TiffinTranslations;
  cadence: TiffinCadence;
  daysOfWeek: number[];
  mealsPerDay: number;
  priceCents: number;
  extraServingCents: number;
  maxServings: number;
  dietary: Dietary;
  deliveryFeeCents: number;
  pickupAllowed: boolean;
  deliveryAllowed: boolean;
  cutoffHours: number;
  active: boolean;
  sortOrder: number;
  /** Subscribers who are not cancelled (merchant lists only). */
  subscriberCount?: number;
}
export interface PlansResponse {
  items: PlanDto[];
}
export interface DeletePlanResponse {
  /** true = removed; false = kept (has subscribers) and switched off for new sign-ups. */
  deleted: boolean;
  archived: boolean;
}

// ---------------------------------------------------------------------------
// Menus (merchant)
// ---------------------------------------------------------------------------
export const menuEntry = z.object({
  /** null = the menu for every plan that has no menu of its own that day. */
  planId: uuidSchema.nullable().default(null),
  date: isoDate,
  items: z.array(menuItemSchema).max(30),
  notes: z.string().trim().max(500).nullish(),
});
/** PUT: upserts one entry per (plan, date); a day's week is just up to 31 entries. */
export const putMenusBody = z.object({ menus: z.array(menuEntry).min(1).max(31) });
export type PutMenusBody = z.input<typeof putMenusBody>;
export const listMenusQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), planId: uuidSchema.optional() });

export interface MenuDto {
  id: string;
  planId: string | null;
  date: string;
  items: MenuItem[];
  notes: string | null;
}
export interface MenusResponse {
  items: MenuDto[];
}

// ---------------------------------------------------------------------------
// Routes (merchant)
// ---------------------------------------------------------------------------
const areaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,6}$/, "Use postal code prefixes like L4T");
export const createRouteBody = z.object({
  name: z.string().trim().min(1).max(80),
  driverName: z.string().trim().max(80).nullish(),
  driverPhone: z.string().trim().max(30).nullish(),
  /** Postal-code prefixes this route covers, e.g. ["L4T", "L4W"]. */
  areas: z.array(areaSchema).max(100).default([]),
  sortOrder: z.number().int().default(0),
});
export type CreateRouteBody = z.input<typeof createRouteBody>;
export const updateRouteBody = patchOf(createRouteBody);
export type UpdateRouteBody = z.input<typeof updateRouteBody>;
/** Set the stop order: subscription ids in drive order (stopOrder = index + 1). */
export const reorderStopsBody = z.object({ subscriptionIds: z.array(uuidSchema).min(1).max(500) });
export const assignRoutesBody = z.object({ onlyUnassigned: z.boolean().default(true) });

export interface RouteDto {
  id: string;
  name: string;
  driverName: string | null;
  driverPhone: string | null;
  areas: string[];
  sortOrder: number;
  /** Active subscribers on this route. */
  stops: number;
}
export interface RoutesResponse {
  items: RouteDto[];
}

// ---------------------------------------------------------------------------
// Subscribers (merchant)
// ---------------------------------------------------------------------------
export const listSubscribersQuery = z.object({
  status: z.string().optional(), // comma list
  planId: uuidSchema.optional(),
  routeId: uuidSchema.optional(),
  unrouted: z.enum(["true", "false"]).optional(),
  fulfilment: z.enum(TIFFIN_FULFILMENTS).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type ListSubscribersQuery = z.input<typeof listSubscribersQuery>;

export const updateSubscriberBody = z.object({
  routeId: uuidSchema.nullable().optional(),
  stopOrder: z.number().int().min(1).nullable().optional(),
  addressNotes: z.string().trim().max(500).nullable().optional(),
});
export const pauseBody = z.object({
  /** Meals resume on this date (first day delivered again). */
  until: isoDate,
  /** First paused day; defaults to the earliest day still before cutoff. */
  from: isoDate.optional(),
});
export type PauseBody = z.input<typeof pauseBody>;
export const cancelBody = z.object({ reason: z.string().trim().max(300).optional() });
export const skipBody = z.object({ dates: z.array(isoDate).min(1).max(31), reason: z.string().trim().max(200).optional() });
export type SkipBody = z.input<typeof skipBody>;

export interface ChargeDto {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  creditCents: number;
  platformFeeCents: number;
  status: "pending" | "paid" | "failed" | "refunded";
  paidAt: string | null;
  createdAt: string;
}

export interface SubscriptionDto {
  id: string;
  status: TiffinSubStatus;
  plan: { id: string; name: string; cadence: TiffinCadence; daysOfWeek: number[]; cutoffHours: number };
  servings: number;
  fulfilment: TiffinFulfilment;
  address: string | null;
  addressNotes: string | null;
  postalCode: string | null;
  dietaryNotes: string | null;
  routeId: string | null;
  routeName: string | null;
  stopOrder: number | null;
  startDate: string;
  pausedUntil: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  priceCents: number;
  paymentMethod: TiffinPaymentMethod;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

/** Merchant view of a subscriber. */
export interface SubscriberDto extends SubscriptionDto {
  customer: { id: string; name: string | null; phone: string | null; email: string | null };
}
/** GET /tiffin/subscribers/:subId/charges: one subscriber's billing periods, newest first (max 24). */
export interface SubscriberChargesResponse {
  items: ChargeDto[];
}
export interface SubscribersResponse {
  items: SubscriberDto[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Kitchen count, manifest, delivery status, revenue (merchant)
// ---------------------------------------------------------------------------
export const kitchenQuery = z.object({ date: isoDate.optional() });
export const manifestQuery = z.object({ date: isoDate.optional(), routeId: uuidSchema.optional() });
export const revenueQuery = z.object({ month: isoMonth.optional() });
export const setDeliveryStatusBody = z.object({
  ids: z.array(uuidSchema).min(1).max(300),
  status: z.enum(["out_for_delivery", "delivered", "picked_up", "missed"]),
  note: z.string().trim().max(300).optional(),
});
export type SetDeliveryStatusBody = z.input<typeof setDeliveryStatusBody>;

export interface KitchenPlanRow {
  planId: string;
  planName: string;
  /** Servings to cook (after skips and pauses). */
  servings: number;
  subscribers: number;
  deliveryServings: number;
  pickupServings: number;
  /** Servings dropped today by skips and pauses (so the kitchen sees the saving). */
  skippedServings: number;
  menu: MenuItem[];
  menuNotes: string | null;
  dietaryNotes: { subscriptionId: string; customer: string | null; servings: number; note: string }[];
}
export interface KitchenResponse {
  date: string;
  plans: KitchenPlanRow[];
  totals: { servings: number; subscribers: number; deliveryServings: number; pickupServings: number; skippedServings: number };
}

export interface ManifestStop {
  deliveryId: string;
  subscriptionId: string;
  stopOrder: number | null;
  status: TiffinDeliveryStatus;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  postalCode: string | null;
  addressNotes: string | null;
  dietaryNotes: string | null;
  servings: number;
  planName: string;
  note: string | null;
  deliveredAt: string | null;
}
export interface ManifestRoute {
  route: Pick<RouteDto, "id" | "name" | "driverName" | "driverPhone"> | null;
  stops: ManifestStop[];
}
export interface ManifestResponse {
  date: string;
  /** Routes in sort order; deliveries with no route come last as route = null. */
  routes: ManifestRoute[];
  /** Pickup orders (no route). */
  pickups: ManifestStop[];
}
export interface SetDeliveryStatusResponse {
  updated: number;
  /** Ids that were left alone (skipped, already final, or wrong fulfilment). */
  ignored: string[];
}

export interface RevenueResponse {
  month: string;
  /** Monthly recurring revenue from active and past-due subscriptions (weekly plans x 52/12). */
  mrrCents: number;
  activeSubscribers: number;
  pausedSubscribers: number;
  pastDueSubscribers: number;
  newThisMonth: number;
  churnedThisMonth: number;
  /** Cancelled this month / active at the start of the month, 0..1. */
  churnRate: number;
  /** Skipped meal-days / (skipped + scheduled meal-days) this month, 0..1. */
  skipRate: number;
  collectedCents: number;
  creditsCents: number;
  platformFeeCents: number;
  byPlan: { planId: string; planName: string; activeSubscribers: number; mrrCents: number }[];
}

// ---------------------------------------------------------------------------
// Customer + public
// ---------------------------------------------------------------------------
export const publicPlansQuery = z.object({ lang: z.string().min(2).max(10).optional(), menuDays: z.coerce.number().int().min(0).max(14).default(7) });

export interface PublicPlanDto extends PlanDto {
  /** Next menu days (the plan's own menu, else the shop-wide one). */
  upcomingMenu: { date: string; items: MenuItem[]; notes: string | null }[];
}
export interface PublicPlansResponse {
  shop: { id: string; name: string; slug: string; logoUrl: string | null; phone: string | null };
  plans: PublicPlanDto[];
  /** Pre-authorized debit is on for this platform. */
  padEnabled: boolean;
}

export const subscribeBody = z
  .object({
    planId: uuidSchema,
    servings: z.number().int().min(1).max(20).default(1),
    fulfilment: z.enum(TIFFIN_FULFILMENTS).default("delivery"),
    address: z.string().trim().min(3).max(300).optional(),
    addressNotes: z.string().trim().max(500).optional(),
    postalCode: z.string().trim().min(3).max(10).optional(),
    dietaryNotes: z.string().trim().max(500).optional(),
    startDate: isoDate,
    paymentMethod: z.enum(TIFFIN_PAYMENT_METHODS).default("card"),
  })
  .refine((b) => b.fulfilment === "pickup" || (!!b.address && !!b.postalCode), { message: "Delivery needs an address and postal code", path: ["address"] });
export type SubscribeBody = z.input<typeof subscribeBody>;

export const updateMySubscriptionBody = z.object({
  address: z.string().trim().min(3).max(300).optional(),
  addressNotes: z.string().trim().max(500).nullable().optional(),
  postalCode: z.string().trim().min(3).max(10).optional(),
  dietaryNotes: z.string().trim().max(500).nullable().optional(),
});
export type UpdateMySubscriptionBody = z.input<typeof updateMySubscriptionBody>;

export const upcomingQuery = z.object({ days: z.coerce.number().int().min(1).max(31).default(14), subscriptionId: uuidSchema.optional() });
export const mySubscriptionsQuery = z.object({ status: z.string().optional() });

export interface PaymentIntentRef {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
  /** Stripe payment method types the client should offer (["card"] or ["acss_debit"]). */
  methods: string[];
}

export interface SubscribeResponse {
  subscription: SubscriptionDto;
  charge: ChargeDto;
  /** null when nothing is due (a free first period). */
  payment: PaymentIntentRef | null;
}

export interface MySubscriptionDto extends SubscriptionDto {
  merchant: { id: string; name: string; slug: string; logoUrl: string | null };
  nextDelivery: { date: string; status: TiffinDeliveryStatus } | null;
  latestCharge: ChargeDto | null;
  /** Skip days still in the future. */
  skips: string[];
}
export interface MySubscriptionsResponse {
  items: MySubscriptionDto[];
}
export interface MySubscriptionDetailResponse {
  subscription: MySubscriptionDto;
  charges: ChargeDto[];
  upcoming: UpcomingDelivery[];
}

export interface UpcomingDelivery {
  subscriptionId: string;
  planName: string;
  merchant: { id: string; name: string; slug: string };
  date: string;
  /** A delivery status, or paused (pause range) / on_hold (awaiting payment or past due). */
  status: TiffinDeliveryStatus | "paused" | "on_hold";
  servings: number;
  fulfilment: TiffinFulfilment;
  /** Last moment to skip this day (ISO), and whether that has passed. */
  cutoffAt: string;
  canSkip: boolean;
  menu: MenuItem[];
}
export interface UpcomingResponse {
  items: UpcomingDelivery[];
}

export interface SkipResponse {
  subscription: MySubscriptionDto;
  /** Dates added. */
  skipped: string[];
  /** Estimated credit on the next bill for these dates, cents. */
  creditCents: number;
}
export interface PauseResponse {
  subscription: MySubscriptionDto;
  /** First paused day, after cutoff rules. */
  pausedFrom: string;
  resumesOn: string;
  skipped: string[];
}
export interface RetryPaymentResponse {
  charge: ChargeDto;
  payment: PaymentIntentRef | null;
}
