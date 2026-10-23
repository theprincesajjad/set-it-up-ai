/**
 * Contracts for the restaurant customer web pages (desi1): shop-level halal certification, dish options,
 * the pre-order availability endpoint, the shop page summary and the private-feedback side of reviews.
 * Halal claims are the shop's own: we print only what the owner states and never badge a shop ourselves.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Canadian priority allergens: owners type free text ("Peanuts", "dairy", "nuts"); filters use these keys.
// ---------------------------------------------------------------------------
export const PRIORITY_ALLERGENS = ["milk", "egg", "peanut", "tree_nut", "sesame", "soy", "wheat", "fish", "shellfish", "mustard", "sulphites"] as const;
export type PriorityAllergen = (typeof PRIORITY_ALLERGENS)[number];

const ALLERGEN_ALIASES: Record<string, PriorityAllergen> = {
  milk: "milk", dairy: "milk", egg: "egg", eggs: "egg", peanut: "peanut", peanuts: "peanut",
  tree_nut: "tree_nut", tree_nuts: "tree_nut", nut: "tree_nut", nuts: "tree_nut", almond: "tree_nut", almonds: "tree_nut", cashew: "tree_nut", cashews: "tree_nut", pistachio: "tree_nut", pistachios: "tree_nut", walnut: "tree_nut", walnuts: "tree_nut",
  sesame: "sesame", soy: "soy", soya: "soy", wheat: "wheat", gluten: "wheat", fish: "fish", shellfish: "shellfish", shrimp: "shellfish", crustacean: "shellfish", crustaceans: "shellfish",
  mustard: "mustard", sulphite: "sulphites", sulphites: "sulphites", sulfite: "sulphites", sulfites: "sulphites",
};
/** Map a shop's free-text allergen ("Tree nuts", "dairy") to a priority allergen key; null when it is not one of the eleven. */
export function canonicalAllergen(raw: string): PriorityAllergen | null {
  return ALLERGEN_ALIASES[raw.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}
/** Priority allergens a dish contains, from its free-text tags. */
export function dishAllergens(allergens: readonly string[] | null | undefined): PriorityAllergen[] {
  return [...new Set((allergens ?? []).map(canonicalAllergen).filter((a): a is PriorityAllergen => !!a))];
}

// ---------------------------------------------------------------------------
// Halal certification (merchants.halal_certification)
// ---------------------------------------------------------------------------
export const HALAL_SCOPES = ["all_meat", "some_dishes"] as const;
export type HalalScope = (typeof HALAL_SCOPES)[number];
export const HALAL_SLAUGHTER = ["zabihah", "machine", "unspecified"] as const;
export type HalalSlaughter = (typeof HALAL_SLAUGHTER)[number];

/** PUT /v1/merchants/:merchantId/menu/halal-certification (owner only). The certifier is required: no certifier, no claim. */
export const halalCertificationBody = z
  .object({
    certifier: z.string().trim().min(1, "Name the certifier").max(120),
    certificateNo: z.string().trim().max(60).optional(),
    scope: z.enum(HALAL_SCOPES),
    slaughter: z.enum(HALAL_SLAUGHTER).default("unspecified"),
    validUntil: z.iso.date().optional(),
    fileUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  })
  .refine((v) => v.slaughter !== "zabihah" || v.certifier.length > 0, { message: "Name your certifier to state zabihah slaughter", path: ["certifier"] });
export type HalalCertificationBody = z.input<typeof halalCertificationBody>;

export interface HalalCertificationDto {
  certifier: string;
  certificateNo: string | null;
  scope: HalalScope;
  slaughter: HalalSlaughter;
  validUntil: string | null;
  fileUrl: string | null;
  /** validUntil is in the past (shop-local day). */
  expired: boolean;
  /** Whole days until validUntil (negative once expired); null without a date. */
  daysLeft: number | null;
}
export interface HalalCertificationResponse {
  halalCertification: HalalCertificationDto | null;
}

/** What customers see. After the certificate expires the certifier name and file are withheld until renewed. */
export interface PublicHalalCertification {
  scope: HalalScope;
  slaughter: HalalSlaughter;
  certifier: string | null;
  validUntil: string | null;
  fileUrl: string | null;
  expired: boolean;
}

// ---------------------------------------------------------------------------
// Dish options (catalog_items.options)
// ---------------------------------------------------------------------------
const optionId = z.string().trim().regex(/^[a-z0-9_-]{1,40}$/i, "Use letters, numbers, - or _");
export const itemOptionSchema = z.object({
  id: optionId,
  name: z.string().trim().min(1).max(80),
  /** Added to the dish price (or, in an "absolute" group, the dish price itself). */
  priceCents: z.number().int().min(0).max(1_000_000),
  serves: z.number().int().min(1).max(1000).optional(),
  note: z.string().trim().max(80).optional(),
  /** Preselected on the page. In a required single group the first option is the default when none is marked. */
  default: z.boolean().optional(),
});
export const itemOptionGroupSchema = z.object({
  id: optionId,
  name: z.string().trim().min(1).max(60),
  type: z.enum(["single", "multi"]),
  required: z.boolean().default(false),
  /** "absolute": the chosen option's price replaces the dish price (size). Only one single group per dish. */
  priceMode: z.enum(["delta", "absolute"]).default("delta"),
  options: z.array(itemOptionSchema).min(1).max(30),
});
export const itemOptionsSchema = z
  .object({ groups: z.array(itemOptionGroupSchema).max(8) })
  .refine((v) => new Set(v.groups.map((g) => g.id)).size === v.groups.length, { message: "Duplicate group id" })
  .refine((v) => v.groups.every((g) => new Set(g.options.map((o) => o.id)).size === g.options.length), { message: "Duplicate option id" })
  .refine((v) => v.groups.filter((g) => g.priceMode === "absolute").length <= 1, { message: "Only one group can set the price" })
  .refine((v) => v.groups.every((g) => g.priceMode !== "absolute" || (g.type === "single" && g.required)), { message: "A group that sets the price must be single choice and required" });
export type ItemOptionsInput = z.input<typeof itemOptionsSchema>;
export type ItemOptionsDto = z.output<typeof itemOptionsSchema>;

// ---------------------------------------------------------------------------
// Pre-order cancel rule: free until this many hours before pickup, then the deposit is kept
// ---------------------------------------------------------------------------
/** PUT /v1/merchants/:merchantId/preorders/cancel-rule. null = each dish's own notice period. */
export const cancelRuleBody = z.object({ cancelCutoffHours: z.number().int().min(0).max(24 * 30).nullable() });
export interface CancelRuleResponse {
  cancelCutoffHours: number | null;
}

// ---------------------------------------------------------------------------
// Shop page summary: GET /v1/public/shops/:slug/restaurant
// ---------------------------------------------------------------------------
export interface PublicRestaurantResponse {
  halalCertification: PublicHalalCertification | null;
  /** Next Saturday and Sunday (or today, if it is one) with pots left for the first degh. */
  weekend: { date: string; potsLeft: number | null; full: boolean }[];
  /** Most ordered dishes in the last 30 days (catalog item ids), pre-order items excluded. */
  popular: string[];
  acceptingOrders: boolean;
  quotedWaitMin: number | null;
  whatsappNumber: string | null;
  /** The shop's own pre-order items (degh, trays), in menu order. */
  preorderItems: { id: string; name: string; serves: number | null; priceCents: number; leadTimeHours: number; depositBps: number }[];
  /** Pre-orders cancel free until this many hours before pickup; null = each dish's own notice period. */
  cancelCutoffHours: number | null;
  features: { pickup: boolean; preorder: boolean };
}

// ---------------------------------------------------------------------------
// Reviews: private feedback, replies, handled
// ---------------------------------------------------------------------------
export const REVIEW_REPLY_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type ReviewReplyChannel = (typeof REVIEW_REPLY_CHANNELS)[number];

/** POST /v1/merchants/:merchantId/reviews/:reviewId/reply */
export const reviewReplyBody = z.object({
  channel: z.enum(REVIEW_REPLY_CHANNELS),
  body: z.string().trim().min(1).max(1000),
});
export type ReviewReplyBody = z.input<typeof reviewReplyBody>;
export interface ReviewReplyResponse {
  sent: boolean;
  channel: ReviewReplyChannel;
}

/** POST /v1/merchants/:merchantId/reviews/:reviewId/offer-chai: a one-use free chai code for this guest. */
export interface ReviewOfferResponse {
  redemptionId: string;
  code: string;
  expiresAt: string;
}
