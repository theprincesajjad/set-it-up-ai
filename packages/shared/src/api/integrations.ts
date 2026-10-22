// API contract for the "integrations" area: zod request schemas and response types.
// Owned by the integrations team (routes/integrations). Docs: docs/engineering/api/integrations.md
import { z } from "zod";

export const PROVIDERS = ["square", "clover", "shopify", "lightspeed", "toast", "google_business", "mailchimp"] as const;
export type Provider = (typeof PROVIDERS)[number];
/** Catalog-only entries (no OAuth row): automation + platform-managed messaging. */
export type CatalogProvider = Provider | "zapier" | "make" | "webhooks" | "api" | "twilio";
export type IntegrationCategory = "pos" | "ecommerce" | "marketing" | "messaging" | "automation";
export type IntegrationStatus = "not_connected" | "pending" | "connected" | "error" | "disconnected";

/** Events merchants can subscribe outbound webhooks / Zapier / Make to. */
export const OUTBOUND_EVENTS = [
  "member.joined",
  "member.updated",
  "points.earned",
  "points.reversed",
  "reward.redeemed",
  "purchase.unmatched",
  "order.created",
  "order.ready",
  "order.completed",
  "booking.created",
  "ticket.updated",
  "quote.approved",
  "invoice.paid",
] as const;
export type OutboundEvent = (typeof OUTBOUND_EVENTS)[number];

// ---------------------------------------------------------------------------
// Merchant-facing (dashboard)
// ---------------------------------------------------------------------------
export interface IntegrationSummary {
  provider: CatalogProvider;
  name: string;
  category: IntegrationCategory;
  description: string;
  auth: "oauth" | "credentials" | "link" | "api_key" | "webhook" | "managed";
  /** False when the server lacks the platform app credentials for this provider. */
  available: boolean;
  status: IntegrationStatus;
  /** False when the integration needs a paid feature (Pricing v2: POS auto-award, Mailchimp, webhooks/API are Plus). */
  free: boolean;
  /** Paid feature key this integration needs (e.g. "integrations.pos_auto_award"), or null when free. */
  feature: string | null;
  /** The feature isn't enabled for this merchant: connecting is refused (402) and existing connections are paused. */
  locked: boolean;
  /** Human-readable reason when an existing connection is paused because its feature is off; null otherwise. */
  pausedReason: string | null;
  /** Extra fields the connect call needs (e.g. Shopify shop domain, Toast restaurant GUID). */
  connectFields: { key: string; label: string; required: boolean }[];
  externalAccountId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Provider settings: autoAward, autoEnroll, externalLocations, externalCategories, audiences... */
  settings: Record<string, unknown>;
  webhookUrl: string | null;
  setup: { events?: string[]; scopes?: string[]; envVars: string[] };
}

export interface IntegrationMapping {
  /** externalLocationId -> our location id */
  locationMap: Record<string, string>;
  /** externalCategoryId -> our merchant category id (no-earn categories apply to mapped POS categories) */
  categoryMap: Record<string, string>;
}

export interface IntegrationDetail extends IntegrationSummary {
  mapping: IntegrationMapping;
}

/** GET /v1/merchants/:merchantId/integrations */
export interface IntegrationListResponse {
  items: IntegrationSummary[];
}

/** POST /v1/merchants/:merchantId/integrations/:provider/connect */
export const connectBody = z
  .object({
    shop: z.string().max(255).optional(),
    restaurantGuid: z.string().max(64).optional(),
    placeId: z.string().max(300).optional(),
    listingUrl: z.url().max(2000).optional(),
  })
  .default({});
export type ConnectBody = z.infer<typeof connectBody>;
/** OAuth providers return authUrl (redirect the browser there); others connect immediately. */
export interface ConnectResponse {
  authUrl: string | null;
  integration: IntegrationSummary | null;
}

/** PATCH /v1/merchants/:merchantId/integrations/:provider */
export const updateSettingsBody = z.object({
  autoAward: z.boolean().optional(),
  /** Create a membership for POS customers with a phone number who aren't members yet (default true). */
  autoEnroll: z.boolean().optional(),
  locationMap: z.record(z.string().min(1).max(200), z.uuid().nullable()).optional(),
  categoryMap: z.record(z.string().min(1).max(200), z.uuid().nullable()).optional(),
  audienceId: z.string().max(100).nullable().optional(),
  placeId: z.string().max(300).nullable().optional(),
  listingUrl: z.url().max(2000).nullable().optional(),
});
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;

/** POST /v1/merchants/:merchantId/integrations/:provider/sync */
export interface SyncResponse {
  integration: IntegrationSummary;
  mapping: IntegrationMapping;
  stats: Record<string, number>;
}

/** GET /v1/merchants/:merchantId/integrations/google_business/links */
export interface GoogleBusinessLinks {
  joinUrl: string;
  reviewUrl: string | null;
  listingUrl: string | null;
  suggestedPost: string;
}

// Unmatched POS purchases ----------------------------------------------------
export interface UnmatchedPurchase {
  id: string;
  provider: Provider;
  status: "unmatched" | "claimed" | "refunded";
  purchaseRef: string | null;
  receiptCode: string | null;
  totalCents: number;
  occurredAt: string;
  locationId: string | null;
  customerName: string | null;
  memberId: string | null;
  claimedAt: string | null;
  createdAt: string;
}

/** GET /v1/merchants/:merchantId/integrations/unmatched?status=unmatched|claimed|all */
export const unmatchedQuery = z.object({
  status: z.enum(["unmatched", "claimed", "refunded", "all"]).default("unmatched"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

/** POST /v1/merchants/:merchantId/integrations/unmatched/:eventId/attach */
export const attachPhoneBody = z.object({ phone: z.string().min(7).max(20), name: z.string().max(120).optional() });
export interface ClaimResponse {
  purchase: UnmatchedPurchase;
  memberId: string;
  pointsAwarded: number;
  balance: number;
}

/** POST /v1/me/purchases/claim (customer enters the receipt code) */
export const claimReceiptBody = z.object({ merchantId: z.uuid(), code: z.string().min(3).max(40) });

// Outbound webhooks ------------------------------------------------------------
export const createWebhookBody = z.object({
  url: z.url().max(2000),
  events: z.array(z.union([z.enum(OUTBOUND_EVENTS), z.literal("*")])).min(1).max(OUTBOUND_EVENTS.length + 1),
  description: z.string().max(200).nullable().optional(),
});
export const updateWebhookBody = createWebhookBody.partial().extend({ active: z.boolean().optional() });

export interface OutboundWebhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdVia: string;
  createdAt: string;
}
/** Returned once on create; store it to verify X-LL-Signature. */
export interface CreatedWebhook extends OutboundWebhook {
  secret: string;
}
export interface WebhookDelivery {
  id: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}
/** Body of every outbound webhook POST. */
export interface WebhookEnvelope<T = Record<string, unknown>> {
  id: string;
  type: OutboundEvent | "ping";
  createdAt: string;
  merchantId: string;
  data: T;
}

// ---------------------------------------------------------------------------
// Merchant REST API (X-LL-Api-Key) — custom POS, Zapier, Make
// ---------------------------------------------------------------------------
export const apiLine = z.object({
  amountCents: z.number().int().min(0).max(100_000_000),
  /** Our merchant category id, or the POS category id you mapped (externalCategoryId + provider "api"). */
  categoryId: z.uuid().optional(),
  externalCategoryId: z.string().max(200).optional(),
  quantity: z.number().int().min(1).max(10_000).optional(),
});

export const apiAwardBody = z
  .object({
    phone: z.string().min(7).max(20).optional(),
    memberCode: z.string().min(4).max(20).optional(),
    amountCents: z.number().int().min(0).max(100_000_000).optional(),
    lines: z.array(apiLine).max(500).optional(),
    locationId: z.uuid().optional(),
    customerName: z.string().max(120).optional(),
    /** Your sale id; also used as the idempotency key when idempotencyKey is absent. */
    externalId: z.string().min(1).max(200).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .refine((b) => b.phone || b.memberCode, { message: "Provide phone or memberCode" })
  .refine((b) => b.amountCents !== undefined || (b.lines && b.lines.length > 0), { message: "Provide amountCents or lines" });

export interface ApiAwardResponse {
  memberId: string;
  memberCreated: boolean;
  pointsAwarded: number;
  balance: number;
  duplicate: boolean;
  transactionId: string | null;
  rewardsAvailable: { id: string; name: string; pointsCost: number }[];
}

export const apiRedeemBody = z
  .object({
    phone: z.string().min(7).max(20).optional(),
    memberCode: z.string().min(4).max(20).optional(),
    rewardId: z.uuid(),
    subtotalCents: z.number().int().min(0).optional(),
    locationId: z.uuid().optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .refine((b) => b.phone || b.memberCode, { message: "Provide phone or memberCode" });

export interface ApiRedeemResponse {
  redemptionId: string;
  code: string;
  discountCents: number | null;
  balance: number;
  duplicate: boolean;
}

/** POST /v1/api/refund — reverse points for a sale you awarded with externalId. */
export const apiRefundBody = z.object({
  externalId: z.string().min(1).max(200),
  refundId: z.string().min(1).max(200),
  /** Omit for a full refund. */
  amountCents: z.number().int().min(1).max(100_000_000).optional(),
});
export interface ApiRefundResponse {
  status: "reversed" | "duplicate" | "not_found";
  pointsReversed: number;
  balance: number | null;
}

/** GET /v1/api/members/:phone */
export interface ApiMemberResponse {
  memberId: string;
  name: string | null;
  balance: number;
  lifetimePoints: number;
  visitCount: number;
  memberCode: string;
  marketingConsent: boolean;
  rewardsAvailable: { id: string; name: string; pointsCost: number }[];
}

/** POST /v1/api/hooks (Zapier/Make REST-hook subscribe) */
export const apiSubscribeBody = z.object({
  url: z.url().max(2000),
  event: z.union([z.enum(OUTBOUND_EVENTS), z.literal("*")]),
  source: z.enum(["zapier", "make", "api"]).default("api"),
});
