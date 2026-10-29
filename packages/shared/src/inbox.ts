/**
 * The inbox: one thread per person per shop, whatever the channel (docs/business/people-side.md gap 2).
 *
 * Outgoing messages go to the person's best channel, in order: app push (with the in-app thread), web push, email, then a text
 * inside the plan's monthly text allowance. Inbound texts land in the thread. Instagram is read-only: a connector imports DMs into
 * the same tables, the owner can create a booking from one, and nothing is ever sent back to Instagram.
 */

export const INBOX_CHANNELS = ["in_app", "sms", "email", "whatsapp", "instagram"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

/** How one message actually went out (or came in). */
export const DELIVERY_CHANNELS = ["in_app", "push", "web_push", "email", "sms", "instagram"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** A customer's channel preference at one shop (merchant_members.channel_pref). "best" walks the ladder. */
export const CHANNEL_PREFS = ["best", "app", "email", "text"] as const;
export type ChannelPref = (typeof CHANNEL_PREFS)[number];

/**
 * The reminder and message ladder, cheapest first. Texts are the last rung and only inside the plan's text allowance; a promo never
 * uses a text (app push and email only).
 */
export const CHANNEL_LADDER = ["push", "web_push", "email", "sms"] as const;
export type LadderRung = (typeof CHANNEL_LADDER)[number];

/** Which rungs a preference allows, in ladder order. "app" still falls back to the in-app thread only (no email, no text). */
export function rungsFor(pref: ChannelPref, opts: { marketing?: boolean } = {}): LadderRung[] {
  const all: LadderRung[] =
    pref === "app" ? ["push", "web_push"] : pref === "email" ? ["email"] : pref === "text" ? ["sms", "push", "web_push", "email"] : [...CHANNEL_LADDER];
  return opts.marketing ? all.filter((r) => r !== "sms") : all;
}

/** GSM-7 basic set (one text segment is 160 of these; anything else makes the text UCS-2, 70 a segment). */
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;

/** How many text segments a body costs. */
export function smsSegments(body: string): number {
  if (!body) return 0;
  if (GSM7.test(body)) {
    const ext = (body.match(/[\^{}\\[~\]|€]/g) ?? []).length;
    const len = body.length + ext;
    return len <= 160 ? 1 : Math.ceil(len / 153);
  }
  const len = [...body].length;
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

// ---------------------------------------------------------------------------
// Connectors (Instagram today; the interface fits any read-only DM source)
// ---------------------------------------------------------------------------
export const INBOX_CONNECTORS = ["instagram"] as const;
export type InboxConnectorId = (typeof INBOX_CONNECTORS)[number];

/** What a connector may store: id, handle, display name, text, time. Nothing else (no profile photo, no follower data). */
export interface ConnectorMessage {
  /** The provider's message id (Instagram "mid"), for idempotent imports. */
  externalId: string;
  direction: "in" | "out";
  text: string;
  at: string;
}

export interface ConnectorThread {
  /** The provider's id for the other person (Instagram-scoped user id). */
  externalUserId: string;
  /** The provider's conversation id. */
  threadId: string;
  handle: string | null;
  displayName: string | null;
  messages: ConnectorMessage[];
}

export interface ConnectorAccount {
  externalAccountId: string;
  username: string | null;
}

/** How a connector reports a webhook delivery: zero or more threads with the new messages. */
export interface ConnectorWebhookResult {
  /** The connected account the delivery is for (the shop is found from it). */
  externalAccountId: string | null;
  threads: ConnectorThread[];
}

/** Recent messages imported per thread on connect (Meta allows the last 20). */
export const INSTAGRAM_IMPORT_PER_THREAD = 20;

/** A link to the conversation on Instagram (opens the DM in the app or on the web). */
export function instagramThreadUrl(handle: string | null | undefined): string | null {
  const h = handle?.replace(/^@/, "").trim();
  return h ? `https://ig.me/m/${encodeURIComponent(h)}` : null;
}
