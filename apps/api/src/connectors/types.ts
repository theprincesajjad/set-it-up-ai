/**
 * Connector framework. Every third-party integration (POS, e-commerce,
 * marketing) implements `Connector`. POS-style connectors normalize sales into
 * `PurchaseEvent`s; the shared pipeline in services/integrations-pipeline.ts
 * does everything else (idempotency, location/category mapping, member lookup,
 * awarding through the ledger, refunds, unmatched purchases).
 *
 * All HTTP goes through an injected `fetch` so tests use recorded fixtures.
 */
import type { Config } from "../config.js";
import type { AppContext } from "../context.js";

export type Fetch = typeof fetch;

export type ConnectorId = "square" | "clover" | "shopify" | "lightspeed" | "toast" | "google_business" | "mailchimp";
/** Integration providers that award points (map 1:1 to ledger tx_source values). */
export type PosProviderId = "square" | "clover" | "shopify" | "lightspeed" | "toast";
export type ConnectorCategory = "pos" | "ecommerce" | "marketing" | "messaging" | "automation";
export type ConnectorAuth = "oauth" | "credentials" | "link";

export interface PurchaseLineEvent {
  /** Pre-tax amount for the whole line (after discounts), in cents. */
  amountCents: number;
  externalCategoryId?: string | null;
  externalItemId?: string | null;
  quantity?: number;
  name?: string | null;
}

export interface PurchaseEvent {
  /** Provider's id for the sale/order (stable across payment/order events). */
  externalId: string;
  externalLocationId?: string | null;
  occurredAt: string;
  /** Pre-tax total in cents (used when there are no lines). */
  totalCents: number;
  lines: PurchaseLineEvent[];
  customer: { phone?: string | null; email?: string | null; name?: string | null; externalId?: string | null };
  /** Code printed on the receipt; lets a customer claim an unmatched purchase. */
  receiptCode?: string | null;
  refund?: {
    originalExternalId: string;
    /** Refunded amount (cents). */
    amountCents: number;
    /** Original sale total in the same basis as amountCents (e.g. tax-inclusive); defaults to the awarded amount. */
    originalTotalCents?: number | null;
    /** amountCents is the running total refunded so far (not just this refund). */
    cumulative?: boolean;
  };
}

export interface Credentials {
  accessToken: string;
  refreshToken?: string | null;
  /** ISO timestamp. */
  expiresAt?: string | null;
  scope?: string | null;
  /** Provider specifics: shop domain, domain prefix, api endpoint, restaurant guid... */
  extra?: Record<string, string>;
}

export interface ConnectResult {
  credentials: Credentials | null;
  externalAccountId: string;
  /** Merged into integration settings. */
  settings?: Record<string, unknown>;
}

export interface ExternalRef {
  id: string;
  name: string;
  detail?: string | null;
}

export interface SyncResult {
  externalLocations?: ExternalRef[];
  externalCategories?: ExternalRef[];
  stats?: Record<string, number>;
  settings?: Record<string, unknown>;
}

/** What a webhook notification is about, before fetching details. */
export interface InboundEvent {
  /** Unique per notification → webhook_events.external_id (dedupe). */
  eventId: string;
  type: string;
  /** External account (merchant id, shop domain, restaurant guid...) → integrations.external_account_id. */
  accountId: string | null;
  kind: "purchase" | "refund" | "ignore" | "disconnect";
  /** Present when the payload already contains everything. */
  purchases?: PurchaseEvent[];
  /** Otherwise, what to fetch. */
  ref?: { object: string; id: string } & Record<string, unknown>;
}

export interface ParsedWebhook {
  events: InboundEvent[];
  /** Short-circuit reply (e.g. Clover's verification handshake). */
  reply?: { status: number; body: unknown };
}

export interface ApiContext {
  config: Config;
  fetch: Fetch;
  credentials: Credentials;
  settings: Record<string, unknown>;
  externalAccountId: string | null;
  now: () => Date;
}

export interface Connector {
  id: ConnectorId;
  name: string;
  category: ConnectorCategory;
  description: string;
  auth: ConnectorAuth;
  /** True when the platform-level app credentials exist in config. */
  configured(config: Config): boolean;
  /** Body fields the connect call needs (e.g. Shopify shop domain). */
  connectFields?: { key: string; label: string; required: boolean }[];
  authUrl?(config: Config, p: { state: string; redirectUri: string; body: Record<string, unknown> }): string;
  exchangeCode?(config: Config, p: { code: string; redirectUri: string; query: Record<string, string> }, fetch: Fetch): Promise<ConnectResult>;
  /** Non-OAuth connect (client credentials, listing link). */
  connectDirect?(config: Config, body: Record<string, unknown>, fetch: Fetch): Promise<ConnectResult>;
  refresh?(config: Config, creds: Credentials, fetch: Fetch): Promise<Credentials>;
  revoke?(api: ApiContext): Promise<void>;
  /** Called once after a successful connect (register webhooks, first sync). */
  afterConnect?(api: ApiContext): Promise<void>;
  verifyWebhook?(config: Config, rawBody: string, headers: Record<string, string | string[] | undefined>, url: string): boolean;
  parseWebhook?(rawBody: string, body: unknown, headers: Record<string, string | string[] | undefined>): ParsedWebhook;
  /** Fetch details for an InboundEvent with a `ref`. Returns [] when there is nothing to award (not completed yet...). */
  resolve?(api: ApiContext, ev: InboundEvent): Promise<PurchaseEvent[]>;
  sync?(api: ApiContext, ctx: AppContext, merchantId: string): Promise<SyncResult>;
  /** Setup notes surfaced in the dashboard. */
  setup: { webhookPath?: string; events?: string[]; scopes?: string[]; envVars: string[] };
}
