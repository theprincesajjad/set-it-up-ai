/**
 * Inbox connectors: read-only sources of direct messages that land in the shop's inbox (services/inbox.ts). Instagram is the first.
 *
 * Every connector stores only what the inbox needs (the person's provider id, handle, display name, message text and time) and has
 * no sending path: replies happen on the provider's own app. `disconnect` removes the token and `purge` deletes every thread and
 * message the connector brought in.
 *
 * Switch: INSTAGRAM_DM_ENABLED = "stub" (seeded sample threads, dev and tests), "live" (Meta OAuth and webhooks, after App Review and
 * Business Verification) or unset/anything else (off: the Settings card reads "coming").
 */
import type { ConnectorAccount, ConnectorThread, ConnectorWebhookResult, InboxConnectorId, inboxApi } from "@ll/shared";
import type { merchants } from "@ll/db";
import type { AppContext } from "../../context.js";
import { instagramConnector } from "./instagram.js";
import { instagramStubConnector } from "./instagram-stub.js";

export type Merchant = typeof merchants.$inferSelect;

export interface ConnectStart {
  /** Where to send the owner to grant access (OAuth). Null when the connector connects at once (the stub). */
  authorizeUrl: string | null;
  /** Connected right away (stub): the account. */
  account: (ConnectorAccount & { token: string | null }) | null;
}

export interface InboxConnector {
  id: InboxConnectorId;
  mode: Exclude<inboxApi.InstagramMode, "off">;
  /** Start connecting a shop: an authorize URL, or (stub) the account straight away. */
  connect(ctx: AppContext, merchant: Merchant, opts: { userId: string; state: string }): Promise<ConnectStart>;
  /** Finish OAuth: trade the code for a long-lived token and the account. */
  completeOAuth(ctx: AppContext, code: string): Promise<ConnectorAccount & { token: string }>;
  /** The latest threads, up to INSTAGRAM_IMPORT_PER_THREAD messages each. */
  importRecent(ctx: AppContext, account: ConnectorAccount & { token: string | null }): Promise<ConnectorThread[]>;
  /** Verify and parse a webhook delivery. Throws on a bad signature. */
  handleWebhook(ctx: AppContext, headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<ConnectorWebhookResult>;
  /** Revoke on the provider side where it can (best effort). */
  disconnect(ctx: AppContext, account: ConnectorAccount & { token: string | null }): Promise<void>;
}

export function instagramMode(): inboxApi.InstagramMode {
  const v = (process.env.INSTAGRAM_DM_ENABLED ?? "").trim().toLowerCase();
  if (v === "stub") return "stub";
  if (v === "live" || v === "true" || v === "1") return "live";
  return "off";
}

/** The connector in use, or null when the Instagram inbox is off. */
export function connectorFor(id: InboxConnectorId): InboxConnector | null {
  if (id !== "instagram") return null;
  const mode = instagramMode();
  return mode === "stub" ? instagramStubConnector : mode === "live" ? instagramConnector : null;
}
