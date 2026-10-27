/**
 * API contract for grocers and halal butchers (docs/research/grocers.md, docs/engineering/api/grocery.md):
 * the weekly flyer, butcher counter weigh-in and Eid al-Adha plan, and pantry (restock) reminders.
 * Routes: apps/api/src/routes/grocery. Money is integer cents (CAD), weights are grams, dates are YYYY-MM-DD in the shop's zone.
 */
import { z } from "zod";
import { centsSchema, uuidSchema } from "./common.js";
import type { GrocerSeason } from "../grocery.js";

const isoDate = z.iso.date();

// ---------------------------------------------------------------------------
// Weekly flyer (grocery.flyer)
// ---------------------------------------------------------------------------
export const PRICE_UNITS = ["each", "kg", "lb"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const dealBody = z
  .object({
    title: z.string().trim().min(1).max(80),
    priceCents: centsSchema.min(1),
    /** each: the price is for the pack; kg / lb: the price is per kg or lb. */
    priceUnit: z.enum(PRICE_UNITS).default("each"),
    /** Pack size in grams (a 1.6 kg ghee tin is 1600), so the flyer can show a price per 100 g. */
    packSizeG: z.number().int().min(1).max(100_000).nullish(),
    wasPriceCents: centsSchema.min(1).nullish(),
    /** Members only: the price needs the loyalty pass (the web pass or the app). */
    memberOnly: z.boolean().default(false),
    limitPerCustomer: z.number().int().min(1).max(99).nullish(),
    /** A season from the grocer calendar (diwali, eid_al_adha, lunar_new_year ...). */
    seasonId: z.string().trim().min(1).max(40).nullish(),
    startsOn: isoDate,
    endsOn: isoDate,
    note: z.string().trim().max(160).nullish(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    active: z.boolean().default(true),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: "The deal ends before it starts", path: ["endsOn"] })
  .refine((v) => !v.wasPriceCents || v.wasPriceCents > v.priceCents, { message: "The old price should be higher than the deal price", path: ["wasPriceCents"] });
export type DealBody = z.input<typeof dealBody>;

export const updateDealBody = z
  .object({
    title: z.string().trim().min(1).max(80),
    priceCents: centsSchema.min(1),
    priceUnit: z.enum(PRICE_UNITS),
    packSizeG: z.number().int().min(1).max(100_000).nullable(),
    wasPriceCents: centsSchema.min(1).nullable(),
    memberOnly: z.boolean(),
    limitPerCustomer: z.number().int().min(1).max(99).nullable(),
    seasonId: z.string().trim().min(1).max(40).nullable(),
    startsOn: isoDate,
    endsOn: isoDate,
    note: z.string().trim().max(160).nullable(),
    sortOrder: z.number().int().min(0).max(1000),
    active: z.boolean(),
  })
  .partial();
export type UpdateDealBody = z.input<typeof updateDealBody>;

export interface DealDto {
  id: string;
  title: string;
  priceCents: number;
  priceUnit: PriceUnit;
  packSizeG: number | null;
  wasPriceCents: number | null;
  /** Price per 100 g in cents (float), when it can be worked out. */
  per100gCents: number | null;
  memberOnly: boolean;
  limitPerCustomer: number | null;
  seasonId: string | null;
  startsOn: string;
  endsOn: string;
  note: string | null;
  sortOrder: number;
  active: boolean;
  /** live: running today; upcoming; ended. */
  state: "live" | "upcoming" | "ended";
}

/** GET /v1/merchants/:merchantId/grocery/deals */
export interface DealsResponse {
  today: string;
  deals: DealDto[];
  /** Seasons in the next 120 days with the stock-up flyer date and deal ideas. */
  seasons: GrocerSeason[];
  /** The flyer as plain text for a WhatsApp group or status. */
  whatsappText: string;
  /** Members who agreed to texts (the audience of "Text members"). */
  textable: number;
}

/** POST /v1/merchants/:merchantId/grocery/flyer/text: drafts a text to members who agreed; sending is a second step in Messages. */
export interface FlyerDraftResponse {
  messageId: string;
  audience: number;
}

/** GET /v1/public/shops/:slug/flyer */
export interface PublicFlyerResponse {
  shop: { name: string; slug: string };
  today: string;
  /** Season of the live deals, when they share one ("Diwali stock-up"). */
  seasonName: string | null;
  validFrom: string | null;
  validTo: string | null;
  deals: Omit<DealDto, "active" | "state" | "sortOrder">[];
}

// ---------------------------------------------------------------------------
// Butcher counter (grocery.counter_preorders)
// ---------------------------------------------------------------------------
export const weighBody = z.object({
  lines: z
    .array(
      z.object({
        orderItemId: uuidSchema,
        /** What the legal-for-trade scale read, in grams. */
        actualWeightG: z.number().int().min(1).max(300_000),
      }),
    )
    .min(1)
    .max(50),
  /** How the shop returns an excess deposit that was not paid by card (e-transfer or cash). Card deposits are refunded to the card. */
  refundMethod: z.enum(["etransfer", "cash"]).default("etransfer"),
});
export type WeighBody = z.input<typeof weighBody>;

export interface WeighResponse {
  orderId: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  /** What the customer still owes at the till. */
  balanceDueCents: number;
  lines: { orderItemId: string; name: string; actualWeightG: number; lineTotalCents: number; estimatedCents: number }[];
  /**
   * Set when the weighed total came in under what the customer had already paid: the excess goes back. `card` was refunded to the
   * customer's card through Stripe; `manual` was recorded as a refund the shop makes by hand (e-transfer or cash).
   */
  refund: { cents: number; mode: "card" | "manual"; method: "card" | "etransfer" | "cash" } | null;
}

export const eidPlanBody = z.object({
  /** Gregorian year of Eid al-Adha. */
  year: z.number().int().min(2026).max(2030),
  /** Animals (or shares) per pick-up day, Eid day first. One to five days. */
  days: z.array(z.object({ cap: z.number().int().min(0).max(500) })).min(1).max(5),
  /** Notice needed on those days, in hours (default two weeks). */
  leadHours: z.number().int().min(0).max(24 * 60).default(24 * 14),
});
export type EidPlanBody = z.input<typeof eidPlanBody>;

export const eidMovedBody = z.object({ year: z.number().int().min(2026).max(2030), start: isoDate.nullable() });

export const eidPlanQuery = z.object({ year: z.coerce.number().int().min(2026).max(2030).optional() });

export interface EidPlanDay {
  date: string;
  label: string;
  cap: number | null;
  booked: number;
  waiting: number;
}

/** GET/PUT /v1/merchants/:merchantId/grocery/butcher/eid */
export interface EidPlanResponse {
  year: number;
  /** First day of Eid al-Adha after the owner's moon-sighting move, and what the calendar says. */
  start: string;
  calendarStart: string;
  moved: boolean;
  /** Bookings should open on this date (eight weeks before). */
  bookingsOpen: string;
  /** Notice the saved plan asks for, in hours (null before the plan is saved). */
  leadHours: number | null;
  days: EidPlanDay[];
  /** Whole animals and shares on the price list. */
  items: { id: string; name: string; priceCents: number; depositBps: number; weightUnit: "kg" | "lb" | null }[];
}

// ---------------------------------------------------------------------------
// Pantry reminders (grocery.pantry_reminders)
// ---------------------------------------------------------------------------
export const pantryItemBody = z.object({
  name: z.string().trim().min(1).max(80),
  /** How many days one purchase usually lasts a household (20 lb of atta: about 42). */
  defaultIntervalDays: z.number().int().min(7).max(180),
  catalogItemId: uuidSchema.nullish(),
  active: z.boolean().default(true),
});
export type PantryItemBody = z.input<typeof pantryItemBody>;
export const updatePantryItemBody = pantryItemBody.partial();

export interface PantryItemDto {
  id: string;
  name: string;
  defaultIntervalDays: number;
  catalogItemId: string | null;
  active: boolean;
  /** Members who bought it and asked for reminders. */
  watching: number;
  /** Of those, due for a text in the next 7 days. */
  dueSoon: number;
}

export interface PantryDueDto {
  entryId: string;
  memberId: string | null;
  name: string | null;
  itemId: string;
  itemName: string;
  intervalDays: number;
  dueOn: string;
  remindOn: string;
  /** true when the text is due now (and the person can be texted). */
  readyToText: boolean;
}

/** GET /v1/merchants/:merchantId/grocery/pantry */
export interface PantryOverviewResponse {
  items: PantryItemDto[];
  /** Entries due within the next 7 days, soonest first. */
  due: PantryDueDto[];
  /** Members who asked for at least one reminder. */
  members: number;
  last30: { sent: number; boughtWithin7Days: number };
  /** Cashier script, so the consent we record matches what was asked. */
  askText: string;
}

/** POST /v1/merchants/:merchantId/grocery/counter/pantry: the cashier taps "bought 20 lb atta". */
export const pantryLogBody = z.object({
  memberId: uuidSchema,
  pantryItemId: uuidSchema,
  /** The customer said yes to "a text when it is about to run out" (needs their marketing consent too). */
  remind: z.boolean().optional(),
});
export type PantryLogBody = z.input<typeof pantryLogBody>;

export interface PantryLogResponse {
  entryId: string;
  itemName: string;
  intervalDays: number;
  purchases: number;
  remind: boolean;
  /** Reminders cannot be turned on without the member's marketing consent. */
  needsMarketingConsent: boolean;
  nextTextOn: string | null;
}

/** POST /v1/merchants/:merchantId/grocery/pantry/send */
export const pantrySendBody = z.object({ entryIds: z.array(uuidSchema).max(200).optional() });
export interface PantrySendResponse {
  sent: number;
  skipped: number;
}

/**
 * GET /v1/public/shops/:slug/pantry/:itemId: the one staple a restock text links to (frame 12). No login, no household data:
 * the item's name and which catalog item to reserve. The page reads the price and tax from the public menu.
 */
export interface PublicPantryItemResponse {
  shop: { name: string; slug: string };
  item: { id: string; name: string; catalogItemId: string | null; defaultIntervalDays: number };
}

/** GET /v1/me/pantry: what the signed-in customer has asked shops to remind them about. */
export interface MyPantryResponse {
  items: { entryId: string; itemId: string; shop: { id: string; name: string; slug: string }; itemName: string; remind: boolean; intervalDays: number; nextTextOn: string | null }[];
}
export const myPantryBody = z.object({ remind: z.boolean() });

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
/** GET /v1/merchants/:merchantId/grocery/home */
export interface GroceryHomeResponse {
  today: string;
  butcher: { id: string; at: string | null; customer: string | null; summary: string; status: "deposit_paid" | "paid" | "weigh" | "unpaid" }[];
  pantry: { members: number; dueSoon: PantryDueDto[] };
  flyer: { live: number; upcoming: number; ends: string | null };
  season: GrocerSeason | null;
}
