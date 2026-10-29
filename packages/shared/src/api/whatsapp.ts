/**
 * Contracts for the restaurant pack messaging area: WhatsApp (notifications,
 * ordering, marketing), festival campaigns, review requests and phone ordering.
 *
 * Consent model (same idea as SMS, see docs/engineering/api/messaging.md):
 *  - Order updates and review requests on WhatsApp need a WhatsApp opt-in
 *    (customer replied START, ticked the box at checkout, or the merchant recorded it).
 *  - Marketing broadcasts need that opt-in AND the member's CASL marketing consent, not muted.
 *  - STOP on WhatsApp withdraws the WhatsApp opt-in for that shop.
 */
import { z } from "zod";
import { centsSchema, phoneSchema, uuidSchema } from "./common.js";
import { segmentSchema } from "./messaging.js";

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
export const WA_LANGUAGES = ["en", "hi", "ur", "pa"] as const;
export type WaLanguage = (typeof WA_LANGUAGES)[number];
export const waLanguageSchema = z.enum(WA_LANGUAGES);

/** Notification kinds with a pre-approved template. Param order is fixed (Meta numbered variables). */
export const WA_NOTIFICATION_KINDS = ["order_confirmed", "order_ready", "tiffin_delivery", "catering_quote", "review_request", "balance_reminder", "waitlist_open"] as const;
export type WaNotificationKind = (typeof WA_NOTIFICATION_KINDS)[number];

/** Template names the shop must get approved (names are ours; wording is theirs to submit in Meta Business Manager). */
export const WA_TEMPLATE_NAMES: Record<WaNotificationKind, { name: string; params: string[]; example: string }> = {
  order_confirmed: { name: "order_confirmed", params: ["merchant", "order_number", "total"], example: "{{1}}: we got your order #{{2}} ({{3}}). We will message you when it is ready." },
  order_ready: { name: "order_ready", params: ["merchant", "order_number"], example: "{{1}}: your order #{{2}} is ready for pickup." },
  tiffin_delivery: { name: "tiffin_delivery", params: ["merchant", "status"], example: "{{1}}: your tiffin is {{2}}." },
  catering_quote: { name: "catering_quote", params: ["merchant", "event", "link"], example: "{{1}}: your quote for {{2}} is ready. Review and approve it here: {{3}}" },
  review_request: { name: "review_request", params: ["merchant", "link"], example: "Thanks for choosing {{1}}. How was it? Tell us in one tap: {{2}}" },
  balance_reminder: { name: "balance_reminder", params: ["merchant", "order_number", "amount", "pickup"], example: "{{1}}: a reminder that {{3}} is left to pay for order #{{2}} at pickup ({{4}})." },
  waitlist_open: { name: "waitlist_open", params: ["merchant", "date"], example: "{{1}}: a pot opened up for {{2}}. Order now before it goes: reply YES and we will send the link." },
};

export const whatsappSettingsBody = z.object({
  /** Meta phone number id (not the number) of the shop's WhatsApp Business number. */
  phoneNumberId: z.string().trim().min(3).max(40),
  /** Display number in E.164, shown to customers. */
  displayNumber: phoneSchema.optional(),
  /** Template names already approved by Meta for broadcasts (marketing). */
  approvedTemplates: z.array(z.string().trim().regex(/^[a-z0-9_]{1,512}$/)).max(50).default([]),
});
export type WhatsappSettingsBody = z.input<typeof whatsappSettingsBody>;

export interface WhatsappSettings {
  connected: boolean;
  phoneNumberId: string | null;
  displayNumber: string | null;
  approvedTemplates: string[];
  usage: WhatsappUsage;
  /** Which of the add-on features this shop has. */
  features: { notifications: boolean; ordering: boolean; marketing: boolean };
  webhookUrl: string;
  /** Template names we send for order updates, for the shop to get approved. */
  requiredTemplates: { kind: WaNotificationKind; name: string; example: string }[];
}

export interface WhatsappUsage {
  used: number;
  /** Included in the restaurant tier per month. */
  planAllowance: number;
  /** Extra messages from add-on packs (not reset monthly; consumed after the plan allowance). */
  extra: number;
  allowance: number;
  remaining: number;
}

export const optInBody = z.object({
  phone: phoneSchema.optional(),
  userId: uuidSchema.optional(),
  /** Where consent was collected, for the audit trail. */
  source: z.enum(["checkout", "in_store", "form", "whatsapp_reply", "import"]).default("form"),
  language: waLanguageSchema.optional(),
});
export type OptInBody = z.input<typeof optInBody>;

export const customerConsentBody = z.object({ optIn: z.boolean(), language: waLanguageSchema.optional() });

export interface WhatsappConsent {
  merchantId: string;
  phone: string;
  optedIn: boolean;
  optedInAt: string | null;
}

export const broadcastBody = z.object({
  /** Must be one of the shop's approvedTemplates. */
  templateName: z.string().trim().min(1).max(512),
  language: waLanguageSchema.default("en"),
  /** Template body variables in order. `{{first_name}}` and `{{merchant}}` are filled per recipient. */
  params: z.array(z.string().max(200)).max(10).default([]),
  segment: segmentSchema.default({ kind: "all" }),
  /** Preview only: count recipients and credits, send nothing. */
  dryRun: z.boolean().default(false),
});
export type BroadcastBody = z.input<typeof broadcastBody>;

export interface BroadcastResult {
  dryRun: boolean;
  matched: number;
  recipients: number;
  excludedNoConsent: number;
  excludedNoWhatsappOptIn: number;
  excludedMuted: number;
  creditsNeeded: number;
  creditsRemaining: number;
  sent: number;
  failed: number;
}

export interface WhatsappSession {
  id: string;
  phone: string;
  userId: string | null;
  state: string;
  language: string;
  cartItems: number;
  orderId: string | null;
  lastInboundAt: string | null;
  /** Free-form replies are allowed until this time. */
  windowOpenUntil: string | null;
  optedIn: boolean;
  /** Inbox row: the guest's name when we know them, the last message, and what they are waiting on. */
  name?: string | null;
  preview?: string | null;
  lastMessageAt?: string | null;
  takenOver?: boolean;
}

/** Customer-facing pay page data for a WhatsApp order (public, token protected). */
export interface WhatsappPayView {
  merchant: { name: string; slug: string; logoUrl: string | null };
  order: { id: string; number: number; totalCents: number; status: string; paymentStatus: string; items: { name: string; quantity: number; lineTotalCents: number }[] };
  payment: { paymentIntentId: string; clientSecret: string | null; amountCents: number } | null;
}

// ---------------------------------------------------------------------------
// Festival campaigns
// ---------------------------------------------------------------------------
export const festivalsQuery = z.object({
  /** How far ahead to look. Default 90 days. */
  days: z.coerce.number().int().min(1).max(400).default(90),
});

export const festivalDraftBody = z.object({
  templateId: z.string().min(1).max(60),
  /** Year of the occurrence; defaults to the next one. */
  year: z.number().int().min(2026).max(2028).optional(),
  channel: z.enum(["email", "sms", "push", "whatsapp"]),
  segment: segmentSchema.default({ kind: "all" }),
  /** Optional override of the template text before the draft is saved. */
  subject: z.string().trim().min(1).max(150).optional(),
  body: z.string().trim().min(1).max(10_000).optional(),
  /** Schedule instead of leaving it as a draft (email/sms/push only). */
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
});
export type FestivalDraftBody = z.input<typeof festivalDraftBody>;

export interface FestivalDraftResult {
  festivalId: string;
  year: number;
  channel: "email" | "sms" | "push" | "whatsapp";
  /** The saved campaign (email/sms/push). Null for WhatsApp, which is sent as a broadcast. */
  messageId: string | null;
  subject: string | null;
  body: string;
  /** WhatsApp: the template name and a broadcast body you can POST to /whatsapp/broadcasts once approved. */
  whatsapp: { templateName: string; freeFormText: string; approved: boolean } | null;
  approximate: boolean;
  dateNote: string;
}

// ---------------------------------------------------------------------------
// Review requests
// ---------------------------------------------------------------------------
export const REVIEW_CHANNELS = ["whatsapp", "sms", "email", "push"] as const;

export const reviewSubmitBody = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(2000).optional(),
});
export type ReviewSubmitBody = z.input<typeof reviewSubmitBody>;

export const reviewSettingsBody = z.object({
  googleReviewUrl: z.url({ protocol: /^https?$/ }).max(500).nullable(),
});

export const listReviewsQuery = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  /** Private feedback to read first: answers rated this or lower (use 3). */
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  /** "0" = not handled yet, "1" = handled. */
  handled: z.enum(["0", "1"]).optional(),
  /** responded | pending */
  status: z.enum(["responded", "pending"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const manualReviewRequestBody = z.object({ orderId: uuidSchema });

/** What the public review page needs. */
export interface PublicReviewView {
  merchant: { name: string; slug: string; logoUrl: string | null };
  /** Always present when the shop has one, whatever the rating (Google policy: never gate it). */
  googleReviewUrl: string | null;
  alreadyResponded: boolean;
  rating: number | null;
  // ---- phase-pro: p4 ----
  /** Where the ask came from: an order (restaurant words) or a visit (appointment words). Older servers omit it. */
  kind?: "order" | "appointment";
  // ---- end phase-pro: p4 ----
}

export interface ReviewSubmitResponse {
  rating: number;
  /** Deprecated: always true. Every rating gets the same two options at the same weight (Google's policy). Removed after one release. */
  leadWithGoogle: boolean;
  googleReviewUrl: string | null;
  message: string;
}

export interface ReviewDto {
  id: string;
  orderId: string | null;
  customer: { id: string; name: string | null };
  channel: string;
  rating: number | null;
  feedback: string | null;
  sentAt: string | null;
  /** True once the customer rated it. */
  responded: boolean;
  clickedAt: string | null;
  createdAt: string;
  /** The guest tapped the Google review button on the page. */
  googleOpenedAt?: string | null;
  /** Owner follow-up on private feedback. */
  handledAt?: string | null;
  reply?: { channel: string; body: string; at: string } | null;
  /** Order context (null when the ask came from a tiffin delivery or catering event). */
  orderNumber?: number | null;
  orderChannel?: string | null;
  /** hi | ur | pa | en, from the guest's own language setting. */
  customerLanguage?: string | null;
  customerPhone?: string | null;
}

export interface ReviewStats {
  requested: number;
  sent: number;
  responded: number;
  /** responded / sent, 0..1 */
  responseRate: number;
  averageRating: number | null;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  /** Opened the review page. */
  opened: number;
  /** Tapped the Google review button. */
  googleOpened?: number;
  /** Answers of 3 stars or fewer the owner has not handled yet, and how many at each rating. */
  privateToRead?: number;
  privateToReadByRating?: Record<"1" | "2" | "3", number>;
  googleReviewUrl: string | null;
}

// ---------------------------------------------------------------------------
// Phone ordering
// ---------------------------------------------------------------------------
export const phoneDraftItem = z.object({
  catalogItemId: uuidSchema.optional(),
  name: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(50),
  /** The assistant is not sure of this match: staff check it before confirming. */
  uncertain: z.boolean().optional(),
});

export const listCallsQuery = z.object({
  status: z.enum(["received", "drafted", "confirmed", "failed", "discarded"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const confirmCallBody = z.object({
  /** Edit the draft before confirming. Items must resolve to catalog items. */
  items: z.array(phoneDraftItem.extend({ catalogItemId: uuidSchema })).min(1).max(50).optional(),
  locationId: uuidSchema.optional(),
  pickupAt: z.iso.datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["in_app", "at_pickup"]).default("at_pickup"),
  tipCents: centsSchema.max(100_000).default(0),
});
export type ConfirmCallBody = z.input<typeof confirmCallBody>;

export interface PhoneCallDto {
  id: string;
  fromPhone: string;
  language: string | null;
  transcript: string | null;
  draftOrder: { items: { catalogItemId?: string; name: string; quantity: number; uncertain?: boolean }[]; pickupAt?: string; notes?: string } | null;
  /** Items the parser heard but could not match to the menu. */
  unmatched: string[];
  /** A heard phrase that fits several dishes ("biryani"): the spoken quantity is kept so a pick keeps it. */
  ambiguous: { phrase: string; quantity: number; options: { catalogItemId: string; name: string }[] }[];
  orderId: string | null;
  /** Order number once confirmed. */
  orderNumber?: number | null;
  status: string;
  createdAt: string;
  /** Matched member name, else null. The caller's number is `fromPhone`. */
  callerName?: string | null;
  member?: { id: string; name: string | null; visits: number } | null;
  /** The member's usual order as one line, e.g. "2 Nihari, 4 Plain Naan". */
  usualText?: string | null;
  /** What we understood, in English, built from the draft (not a machine translation of the audio). */
  understood?: string | null;
}
