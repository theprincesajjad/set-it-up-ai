// Contracts for the restaurant pack: restaurant. Owned by the restaurant build team.
import { z } from "zod";
import { splitItemRef, splitTenderSchema, type PreorderPlanLine, type PreorderRulesResponse, type PreorderShopping, type SplitTender } from "./restaurantDesk.js";
import { canonicalAllergen, type PriorityAllergen } from "./restaurant-web.js";
import type { ManualInstructions, ManualPaymentDto } from "./payments-manual.js";
export const _placeholder = z.never().optional();

// ===========================================================================
// Menu (restaurant.dietary_tags, restaurant.multilingual_menu, restaurant.degh_preorders,
// restaurant.dual_pricing): dietary tags, translations, degh pre-orders, cash price
// ===========================================================================
export const MENU_LANGS = ["en", "hi", "ur", "pa"] as const;
export type MenuLang = (typeof MENU_LANGS)[number];
export const TRANSLATION_LANGS = ["hi", "ur", "pa"] as const;

/** Halal claims are the shop's own: halalCertifier is shown as given, never verified or implied by us. */
export const dietaryTagsSchema = z
  .object({
    halal: z.boolean().optional(),
    zabihah: z.boolean().optional(),
    vegetarian: z.boolean().optional(),
    vegan: z.boolean().optional(),
    jain: z.boolean().optional(),
    glutenFree: z.boolean().optional(),
    spice: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
    allergens: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    halalCertifier: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => !v.halalCertifier || v.halal || v.zabihah, { message: "Name a halal certifier only on halal or zabihah items", path: ["halalCertifier"] });
export type DietaryTagsInput = z.input<typeof dietaryTagsSchema>;

export const translationsSchema = z
  .record(z.string(), z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(1000).optional() }))
  .refine((v) => Object.keys(v).every((k) => (TRANSLATION_LANGS as readonly string[]).includes(k)), { message: "Translations are supported for hi, ur and pa" });

const queryFlag = z
  .enum(["1", "true", "0", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

/** GET /v1/public/shops/:slug/menu?lang=hi&halal=1&veg=1&maxSpice=2 */
export const publicMenuQuery = z.object({
  lang: z.enum(MENU_LANGS).optional(),
  halal: queryFlag,
  veg: queryFlag,
  maxSpice: z.coerce.number().int().min(0).max(3).optional(),
  /** "peanut,tree_nut": hide dishes that contain any of these priority allergens (the shop's own tags; shared kitchen, so no promise of zero traces). */
  without: z
    .string()
    .max(200)
    .optional()
    .transform((v) => [...new Set((v ?? "").split(",").map((x) => canonicalAllergen(x)).filter((x): x is PriorityAllergen => !!x))]),
});
export type PublicMenuQuery = z.infer<typeof publicMenuQuery>;

/** PUT /v1/merchants/:merchantId/menu/languages (must include en) */
export const menuLanguagesBody = z.object({ languages: z.array(z.enum(MENU_LANGS)).min(1).max(4) }).refine((v) => v.languages.includes("en"), { message: "English stays on", path: ["languages"] });
export interface MenuLanguagesResponse {
  languages: MenuLang[];
}

/** PUT /v1/merchants/:merchantId/dual-pricing: percent off the card price for cash, in basis points. */
export const dualPricingBody = z.object({ cashDiscountBps: z.number().int().min(0).max(1000) });
export interface DualPricingResponse {
  cashDiscountBps: number;
  enabled: boolean;
}

/** PUT /v1/merchants/:merchantId/preorders/settings: max pots (pre-order-only units) per pickup day; null = no cap. */
export const preorderSettingsBody = z.object({ preorderDailyCap: z.number().int().min(1).max(1000).nullable() });
export interface PreorderSettingsResponse {
  preorderDailyCap: number | null;
}

export const tenderSchema = z.enum(["cash", "card"]);
export type Tender = z.infer<typeof tenderSchema>;

/** GET /v1/merchants/:merchantId/preorders?from=YYYY-MM-DD&to=YYYY-MM-DD (shop-local days; default today + 14 days) */
export const preordersQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
export interface PreorderPrepLine {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  /** Total servings (quantity x serves) when the item has serves. */
  serves: number | null;
}
export interface PreorderOrderDto {
  orderId: string;
  number: number;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupAt: string;
  notes: string | null;
  channel: string;
  allergyNote: string | null;
  totalCents: number;
  depositCents: number;
  depositPaid: boolean;
  balanceDueCents: number;
  items: { name: string; quantity: number; modifiers: { name: string; option: string }[] }[];
}
export interface PreorderDayDto {
  /** Shop-local date, YYYY-MM-DD. */
  date: string;
  pots: number;
  cap: number | null;
  remaining: number | null;
  prep: PreorderPrepLine[];
  /** Per dish: pots, fire time, estimated rice and meat (desi2). */
  plan: PreorderPlanLine[];
  /** Estimated shopping list for the day (sum of per-pot recipes x pots); null when no dish on the day has a recipe. */
  shopping: PreorderShopping | null;
  /** Guests waiting for this day. */
  waitlist: number;
  orders: PreorderOrderDto[];
}
export interface PreordersResponse {
  days: PreorderDayDto[];
  /** Pot cap for every date in the range (weekday cap, Eid override or the daily cap), null = no cap. */
  caps: { date: string; cap: number | null; note: string | null }[];
  rules: PreorderRulesResponse;
}

// ===========================================================================
// Kitchen (restaurant.kds): tickets by station, item status, bump, recall; counter orders
// ===========================================================================
export const KITCHEN_ITEM_STATUSES = ["queued", "cooking", "ready"] as const;
export type KitchenItemStatus = (typeof KITCHEN_ITEM_STATUSES)[number];

/** GET /v1/merchants/:merchantId/kitchen/tickets. station defaults to the caller's own; station=all shows every station. */
export const kitchenTicketsQuery = z.object({
  station: z.string().trim().min(1).max(40).optional(),
  /** Ticket language override (default: the caller's staff locale). */
  lang: z.enum(MENU_LANGS).optional(),
});
export const kitchenItemStatusBody = z.object({ status: z.enum(["cooking", "ready"]) });

export interface KitchenItemDto {
  id: string;
  catalogItemId: string | null;
  /** In the viewer's language (English fallback). */
  name: string;
  nameEn: string;
  quantity: number;
  modifiers: { name: string; option: string }[];
  notes: string | null;
  station: string | null;
  status: KitchenItemStatus;
}
export interface KitchenTicketDto {
  orderId: string;
  number: number;
  kind: string;
  channel: string;
  orderStatus: string;
  pickupAt: string | null;
  notes: string | null;
  /** Null until the ticket is fired (a pinned pre-order waiting for "Start dum"). */
  firedAt: string | null;
  bumpedAt: string | null;
  ageSeconds: number;
  items: KitchenItemDto[];
  customerName: string | null;
  /** Guest allergy: shown as a full-width band. */
  allergyNote: string | null;
  /** Pre-orders: when to start (pickup minus the longest cook time) and how long the dish takes. */
  fireAt: string | null;
  cookMinutes: number;
  /** A pre-order inside its pin window that has not been fired yet. */
  pinned: boolean;
}
export interface KitchenTicketsResponse {
  station: string | null;
  lang: MenuLang;
  /** Stations that have items on open tickets. */
  stations: string[];
  /** Dishes currently sold out (the "Sold out (n)" button). */
  soldOutCount: number;
  items: KitchenTicketDto[];
}

/** POST /v1/merchants/:merchantId/orders/counter: staff rings up a walk-in or dine-in order. */
export const counterOrderBody = z.object({
  locationId: z.uuid().optional(),
  items: z
    .array(
      z.object({
        catalogItemId: z.uuid(),
        quantity: z.number().int().min(1).max(50),
        modifiers: z.array(z.object({ name: z.string().min(1), option: z.string().min(1) })).max(20).default([]),
      }),
    )
    .min(1)
    .max(50),
  /** Paid now by cash or card at the counter. Leave out to open a tab (pay at pickup, or split it). */
  tender: tenderSchema.optional(),
  tipCents: z.number().int().min(0).max(100_000).default(0),
  /** Credit points to an existing customer by phone. */
  customerPhone: z.string().min(7).max(20).optional(),
  notes: z.string().max(500).nullish(),
  /** Where the order came from: the counter (default) or a phone call taken by hand. */
  channel: z.enum(["counter", "phone"]).default("counter"),
  /** Caller or guest name for the ticket ("Phone order · Imran"). */
  customerName: z.string().trim().max(80).nullish(),
  /** Guest allergy: a red band on the kitchen ticket. */
  allergyNote: z.string().trim().max(200).nullish(),
  /** "preorder" books pots for a pickup day (needs pickupAt); the default is a pickup order for now. */
  kind: z.enum(["pickup", "preorder"]).default("pickup"),
  pickupAt: z.iso.datetime({ offset: true }).nullish(),
  /** Pre-order deposit was taken by hand (cash or card at the counter). */
  depositCollected: z.boolean().default(false),
});
export type CounterOrderBody = z.input<typeof counterOrderBody>;

// ===========================================================================
// Splits (restaurant.split_bills): even or by item, one pay link per guest
// ===========================================================================
export const createSplitsBody = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("even"),
    ways: z.number().int().min(2).max(30),
    labels: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    /** How each guest pays, in order (default: pay link). */
    tenders: z.array(splitTenderSchema).max(30).optional(),
  }),
  z.object({
    mode: z.literal("items"),
    /** Every unit on the bill must be given to at least one guest; a unit given to several is shared equally. */
    splits: z
      .array(z.object({ label: z.string().trim().min(1).max(60).optional(), itemIds: z.array(splitItemRef).min(1).max(100), tender: splitTenderSchema.optional() }))
      .min(2)
      .max(30),
  }),
]);
export type CreateSplitsBody = z.input<typeof createSplitsBody>;
export const paySplitBody = z.object({ tipCents: z.number().int().min(0).max(100_000).default(0) });
export type PaySplitBody = z.input<typeof paySplitBody>;
/** POST /merchants/:merchantId/orders/:orderId/splits/:splitId/mark-paid-cash: a guest settled their share in cash at the table. */
export const markSplitCashBody = z.object({ tipCents: z.number().int().min(0).max(100_000).default(0) });
export type MarkSplitCashBody = z.input<typeof markSplitCashBody>;

export interface SplitDto {
  id: string;
  orderId: string;
  label: string;
  amountCents: number;
  tipCents: number;
  itemIds: string[];
  /** link (pay link), card (counter terminal) or cash. */
  tender: SplitTender;
  status: "open" | "paid";
  paidAt: string | null;
  /** How a paid share was settled (card = pay link, cash = marked by staff). Null while open. */
  paidWith?: "card" | "cash" | null;
  /** Share this link with the guest. */
  payUrl: string;
  payToken: string;
}
export interface OrderSplitsResponse {
  orderId: string;
  orderNumber: number;
  totalCents: number;
  paidCents: number;
  orderPaid: boolean;
  items: SplitDto[];
}
/** GET /v1/public/splits/:token */
export interface PublicSplitResponse {
  merchant: { name: string; slug: string; logoUrl: string | null };
  orderNumber: number;
  label: string;
  amountCents: number;
  tipCents: number;
  status: "open" | "paid";
  paidAt: string | null;
  /** How this guest pays: the link, or card / cash at the table. */
  tender: SplitTender;
  canPay: boolean;
  lines: { name: string; quantity: number }[];
}
/** POST /v1/public/splits/:token/pay */
export interface PaySplitResponse {
  split: PublicSplitResponse;
  payment: { paymentIntentId: string; clientSecret: string; amountCents: number };
}


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
  /** Mandatory service charge in bps of the subtotal (taxed like food); omit to keep the current one. */
  serviceChargeBps: z.number().int().min(0).max(3000).optional(),
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
export const cateringApproveBody = z.object({
  signatureName: z.string().trim().min(2).max(120),
  /** How the customer will pay the deposit: "etransfer" skips the card payment and returns e-transfer instructions. */
  payWith: z.enum(["card", "etransfer"]).default("card"),
});
export const cateringMarkDepositBody = z.object({
  method: z.enum(["cash", "etransfer", "cheque", "other"]).default("other"),
  note: z.string().max(300).nullish(),
  /** Default: the deposit amount on the quote. */
  amountCents: z.number().int().min(1).max(100_000_000).optional(),
  /** Default: today. Can't be in the future. */
  receivedOn: z.iso.date().optional(),
  bankReference: z.string().trim().max(60).nullish(),
  sendReceipt: z.boolean().default(true),
});
/** Mandatory service charge on a quote, in basis points of the subtotal (taxed like food); 0 = none. */
export const cateringServiceChargeBody = z.object({ serviceChargeBps: z.number().int().min(0).max(3000) });
export const cateringInvoiceBody = z.object({ send: z.boolean().default(true) });
/** Merchant's choice for a paid deposit when cancelling: all of it, none (default), or part. Only deposits paid in the app can be refunded. */
export const depositRefundChoice = z.union([z.enum(["full", "none"]), z.object({ amountCents: z.number().int().min(1).max(100_000_000) })]);
export type DepositRefundChoice = z.infer<typeof depositRefundChoice>;
export const cateringCancelBody = z.object({ reason: z.string().trim().max(1000).nullish(), refund: depositRefundChoice.default("none") });

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
export interface CateringReminderInfo {
  kind: "deposit" | "balance" | null;
  amountCents: number;
  lastRemindedAt: string | null;
}
/** How the catering terms read before a customer signs: the share of the deposit given back by how far ahead they cancel. */
export const DEFAULT_CATERING_REFUND_POLICY: { tiers: { minDaysBefore: number; refundBps: number }[] } = { tiers: [{ minDaysBefore: 14, refundBps: 10_000 }, { minDaysBefore: 7, refundBps: 5_000 }] };

export interface CateringEventDto {
  id: string;
  merchantId: string;
  /** Customer-facing (/me/...) responses only: the kitchen this belongs to, so rows don't need a wallet lookup. */
  merchantName?: string | null;
  merchantSlug?: string | null;
  merchantLogoUrl?: string | null;
  merchantBrandColor?: string | null;
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
  /** How the deposit came in (etransfer, cash, cheque, other, card) and the date the money arrived. */
  depositMethod: string | null;
  depositReceivedOn: string | null;
  /** Code for the e-transfer message (set once the quote is sent). */
  referenceCode: string | null;
  /** Mandatory service charge (bps of the subtotal) and its amount; taxed. */
  serviceChargeBps: number;
  serviceChargeCents: number;
  /** First time the customer opened the quote link; null = not opened yet. */
  quoteOpenedAt: string | null;
  /** Staff view: other confirmed events or hall bookings on the same date (a non-blocking note, never a block). */
  dateClashes?: number;
  /** Hand-recorded payments, newest last (staff view only). */
  payments?: ManualPaymentDto[];
  /** Staff view: what a reminder would chase (deposit before the event is confirmed, balance after) and when the last one went out. */
  reminder?: CateringReminderInfo;
  /** GST/HST status shown on the quote: registered (with number), small supplier, or not set. */
  tax?: { registered: boolean | null; number: string | null; label: string };
  /** Deposit returned on cancel (0 = none) and when. */
  depositRefundCents: number;
  depositRefundedAt: string | null;
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
/** GET /public/payments/:paymentIntentId?cs=<clientSecret>: what a PaymentIntent from the app is paying for. */
export type PaymentIntentKind = "tiffin" | "hall_deposit" | "catering_deposit" | "order";
export type PaymentIntentViewStatus = "requires_payment" | "processing" | "succeeded" | "canceled";
export interface PaymentIntentView {
  merchant: { name: string; slug: string; logoUrl: string | null; brandColor: string | null };
  description: string;
  amountCents: number;
  currency: string;
  kind: PaymentIntentKind;
  status: PaymentIntentViewStatus;
}
export interface PublicCateringResponse {
  merchant: { name: string; slug: string; logoUrl: string | null; phone: string | null };
  event: CateringEventDto;
  canApprove: boolean;
  depositDue: boolean;
  /** E-transfer instructions when the shop takes them and a deposit is due; null otherwise. */
  manual: ManualInstructions | null;
  /** How this shop can be paid right now (card needs its Stripe account; e-transfer needs the shop's settings). */
  pay: { card: boolean; etransfer: boolean };
  /** The linked hall's own refund policy (only when this event is booked into a hall), shown before signing; null otherwise. */
  cancellationTiers: { minDaysBefore: number; refundBps: number }[] | null;
}
export interface ApproveCateringResponse {
  event: CateringEventDto;
  deposit: CateringDepositPaymentDto | null;
  /** E-transfer instructions for the deposit (when chosen and the shop takes them). */
  manual: ManualInstructions | null;
}
/** Money tiles and the 8-week strip on the catering pipeline. */
export interface CateringSummary {
  /** Total of quotes sent and not yet approved or declined. */
  openQuotesCents: number;
  /** Deposits on approved quotes still to collect. */
  depositsToCollectCents: number;
  /** Balances (after deposit and recorded payments) on events in the next 14 days. */
  balancesDue14dCents: number;
  bookedNext8wEvents: number;
  bookedNext8wCents: number;
  /** Eight Monday-less weeks from today: events confirmed vs quoted or in tasting. */
  weeks: { start: string; confirmed: number; pending: number }[];
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

/** Customer-cancel refund tiers on a paid hall deposit: the first tier (largest minDaysBefore first) the event is at least that far away wins; none after. */
export const hallRefundPolicy = z.object({
  tiers: z
    .array(z.object({ minDaysBefore: z.number().int().min(0).max(730), refundBps: z.number().int().min(0).max(10_000) }))
    .max(5)
    .refine((t) => new Set(t.map((x) => x.minDaysBefore)).size === t.length, "Each tier needs a different number of days"),
});
export type HallRefundPolicy = z.infer<typeof hallRefundPolicy>;
export const DEFAULT_HALL_REFUND_POLICY: HallRefundPolicy = { tiers: [{ minDaysBefore: 30, refundBps: 10_000 }, { minDaysBefore: 14, refundBps: 5_000 }] };
/** Share of the deposit (basis points) a customer gets back cancelling `now` for an event starting at `startsAt`. */
export function hallRefundBps(policy: HallRefundPolicy, startsAt: Date | string, now: Date = new Date()): number {
  const days = (new Date(startsAt).getTime() - now.getTime()) / 86_400_000;
  const tier = [...policy.tiers].sort((a, b) => b.minDaysBefore - a.minDaysBefore).find((t) => days >= t.minDaysBefore);
  return tier?.refundBps ?? 0;
}

export const hallPackage = z.object({
  name: z.string().trim().min(1).max(120),
  perHeadCents: z.number().int().min(0).max(1_000_000),
  includes: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
});
/** Staged payment template: bps of the total due `dueOffsetDays` before the event (0 = when the date is held). Must sum to 10000. */
export const hallScheduleStep = z.object({ label: z.string().trim().min(1).max(60), bps: z.number().int().min(1).max(10_000), dueOffsetDays: z.number().int().min(0).max(730) });
export const DEFAULT_HALL_SCHEDULE = [
  { label: "Deposit to hold the date", bps: 2500, dueOffsetDays: 0 },
  { label: "Second payment", bps: 5000, dueOffsetDays: 14 },
  { label: "Final payment", bps: 2500, dueOffsetDays: 7 },
] as const;
export interface HallScheduleRow {
  label: string;
  amountCents: number;
  dueOn: string;
  paidAt: string | null;
}
/** Splits a total across schedule steps with the last step taking the rounding, so the rows sum to the total to the cent. */
export function buildHallSchedule(totalCents: number, steps: readonly { label: string; bps: number; dueOffsetDays: number }[], eventDate: string, today: string): HallScheduleRow[] {
  const sum = steps.reduce((s, x) => s + x.bps, 0);
  const rows: HallScheduleRow[] = [];
  let allocated = 0;
  steps.forEach((st, i) => {
    const last = i === steps.length - 1;
    const amountCents = last ? totalCents - allocated : Math.round((totalCents * st.bps) / (sum || 10_000));
    allocated += amountCents;
    const due = new Date(`${eventDate}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() - st.dueOffsetDays);
    const dueOn = st.dueOffsetDays === 0 ? today : due.toISOString().slice(0, 10) < today ? today : due.toISOString().slice(0, 10);
    rows.push({ label: st.label, amountCents, dueOn, paidAt: null });
  });
  return rows;
}
export const createHallBody = z.object({
  name: z.string().trim().min(1).max(120),
  capacity: z.number().int().min(1).max(5000),
  description: z.string().trim().max(2000).nullish(),
  baseCents: z.number().int().min(0).max(100_000_000).default(0),
  packages: z.array(hallPackage).max(20).default([]),
  depositBps: z.number().int().min(0).max(10_000).default(2500),
  refundPolicy: hallRefundPolicy.default(DEFAULT_HALL_REFUND_POLICY),
  paymentSchedule: z.array(hallScheduleStep).min(1).max(8).nullish(),
  autoConfirmOnFirstPayment: z.boolean().default(false),
  active: z.boolean().default(true),
});
/** Explicit optional fields (not createHallBody.partial()): a partial of defaulted fields would reset them on every PATCH. */
export const updateHallBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  capacity: z.number().int().min(1).max(5000).optional(),
  description: z.string().trim().max(2000).nullish(),
  baseCents: z.number().int().min(0).max(100_000_000).optional(),
  packages: z.array(hallPackage).max(20).optional(),
  depositBps: z.number().int().min(0).max(10_000).optional(),
  refundPolicy: hallRefundPolicy.optional(),
  paymentSchedule: z.array(hallScheduleStep).min(1).max(8).nullish(),
  autoConfirmOnFirstPayment: z.boolean().optional(),
  active: z.boolean().optional(),
});

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
  refundPolicy: HallRefundPolicy;
  paymentSchedule: { label: string; bps: number; dueOffsetDays: number }[];
  autoConfirmOnFirstPayment: boolean;
  active: boolean;
  createdAt: string;
}
export interface HallBookingDto {
  id: string;
  hallId: string;
  hallName: string | null;
  merchantId: string;
  /** Customer-facing (/me/...) responses only: the kitchen this belongs to, so rows don't need a wallet lookup. */
  merchantName?: string | null;
  merchantSlug?: string | null;
  merchantLogoUrl?: string | null;
  merchantBrandColor?: string | null;
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
  /** Deposit returned on cancel (0 = none) and when. */
  depositRefundCents: number;
  depositRefundedAt: string | null;
  /** The hall's refund policy, so a customer sees what cancelling would return. */
  refundPolicy: HallRefundPolicy | null;
  cateringEventId: string | null;
  notes: string | null;
  /** Code for the e-transfer message. */
  referenceCode: string | null;
  /** Staged payments; sums to totalCents. Empty for bookings made before schedules existed. */
  schedule: HallScheduleRow[];
  /** Hand-recorded payments (staff view only). */
  payments?: ManualPaymentDto[];
  /** E-transfer instructions for the next unpaid instalment (when the shop takes e-transfer). */
  manual?: ManualInstructions | null;
  createdAt: string;
}
/** POST .../banquet/bookings/:id/cancel (staff). Customers send no body: the hall's policy applies. */
export const cancelHallBookingBody = z.object({ refund: depositRefundChoice.default("none") });
export interface HallAvailabilityResponse {
  halls: { hall: HallDto; busy: { bookingId: string; status: HallBookingStatus; startsAt: string; endsAt: string; label?: string; holdExpiresAt?: string | null }[] }[];
}
export interface HoldResponse {
  booking: HallBookingDto;
  deposit: CateringDepositPaymentDto | null;
}

export const linkHallBookingBody = z.object({ hallBookingId: z.uuid() });

export * from "./restaurantDesk.js";
