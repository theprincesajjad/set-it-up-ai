/**
 * API contract for the "messaging" area (/v1/merchants/:merchantId/messages,
 * /automations): zod request schemas and response types.
 * Endpoint docs: docs/engineering/api/messaging.md.
 *
 * CASL: promotional messages only reach members with marketing consent who
 * haven't muted the shop. The server appends the merchant name and an opt-out
 * to every message; don't add your own footer.
 */
import { z } from "zod";
import { uuidSchema } from "./common.js";

export const CHANNELS = ["email", "sms", "push"] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof channelSchema>;

/** Quiet hours for promotional texts, shop time: nothing goes out from 21:00 until 08:00 (see QUIET_HOURS in the API). */
export const QUIET_HOURS_LABEL = "8 am to 9 pm";

/**
 * What the server adds to every promotional text (CASL: who is sending, where, and how to stop). The dashboard shows
 * this exact line under the message box and counts it towards the length. Server prefixes it with "— ".
 */
export function smsFooterText(merchantName: string, address?: string | null): string {
  return `${merchantName}${address ? `, ${address}` : ""}. Reply STOP to unsubscribe.`;
}

/** SMS body limit before the server adds "— <Shop>. Reply STOP to opt out." */
export const SMS_MAX_BODY = 320;
export const EMAIL_MAX_BODY = 10_000;
export const PUSH_MAX_BODY = 180;
/** Placeholders replaced per recipient. */
export const MESSAGE_VARIABLES = ["{{first_name}}", "{{name}}", "{{balance}}", "{{terminology}}", "{{merchant}}"] as const;
/** Inbound SMS keywords that withdraw consent everywhere (incl. French for Canada). */
export { STOP_KEYWORDS } from "../opt-out.js";

/** "Lapsed" default for the Messages audience chips and the win-back automation. */
export const LAPSED_DEFAULT_DAYS = 21;

export const segmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  /** No visit in the last N days (incl. members who never visited and joined more than N days ago). Cafés default to 21. */
  z.object({ kind: z.literal("lapsed"), days: z.number().int().min(1).max(3650).default(LAPSED_DEFAULT_DAYS) }),
  /** Café regulars: 3+ visits in the last 30 days (reportsApi.isRegular). */
  z.object({ kind: z.literal("regulars") }),
  /** Regulars who are overdue against their own rhythm (reportsApi.isSlipping). */
  z.object({ kind: z.literal("slipping") }),
  /** Any VIP level, or one level. */
  z.object({ kind: z.literal("vip"), vipLevelId: uuidSchema.optional() }),
  /** Balance covers at least one active reward. */
  z.object({ kind: z.literal("reward_ready") }),
  z.object({ kind: z.literal("tag"), tag: z.string().trim().min(1).max(40) }),
  /** Joined in the last N days. */
  z.object({ kind: z.literal("new"), days: z.number().int().min(1).max(365).default(14) }),
]);
export type Segment = z.infer<typeof segmentSchema>;

const messageFields = {
  channel: channelSchema,
  /** Required for email; used as the push title (defaults to the shop name). */
  subject: z.string().trim().min(1).max(150).nullable(),
  body: z.string().trim().min(1).max(EMAIL_MAX_BODY),
  segment: segmentSchema,
  /** Future time to send; omit to keep as draft (or use sendNow). */
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
};
export const createMessageBody = z.object({
  ...messageFields,
  subject: messageFields.subject.optional(),
  segment: messageFields.segment.default({ kind: "all" }),
  scheduledAt: messageFields.scheduledAt.optional(),
  sendNow: z.boolean().default(false),
});
export type CreateMessageBody = z.infer<typeof createMessageBody>;
/** Only draft/scheduled messages can be edited. Setting scheduledAt schedules it; null returns it to draft. */
export const updateMessageBody = z.object(messageFields).partial();
export const audienceBody = z.object({ channel: channelSchema, segment: segmentSchema.default({ kind: "all" }) });
export const listMessagesQuery = z.object({
  status: z.enum(["draft", "scheduled", "sending", "sent", "failed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export interface AudiencePreview {
  channel: Channel;
  /** Members matching the segment. */
  matched: number;
  /** Will actually receive it (consented, not muted, reachable on this channel). */
  recipients: number;
  excludedNoConsent: number;
  excludedMuted: number;
  /** No email / phone / app on file for this channel. */
  excludedNoContact: number;
  /** SMS only: credits this send would use, and what's left this month. */
  smsCreditsNeeded: number;
  smsCreditsRemaining: number | null;
}

export type MessageStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";
export interface Message {
  id: string;
  channel: Channel;
  subject: string | null;
  body: string;
  segment: Segment;
  status: MessageStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  createdAt: string;
  /**
   * Distinct recipients who visited the shop within 7 days after `sentAt`. Null until sent.
   * Still counting while `cameIn7dFinal` is false (fewer than 7 days since the send).
   */
  cameIn7d: number | null;
  cameIn7dFinal: boolean;
}
export interface MessageDetail extends Message {
  stats: { queued: number; sent: number; delivered: number; failed: number };
  /** Exactly what recipients get, footer included (first recipient's personalization). */
  preview: string;
}

/** POST /v1/merchants/:id/messages/:messageId/test — sent to the requesting staff user only. */
export interface TestSendResult {
  channel: Channel;
  /** Addresses that accepted the send. */
  sent: number;
  /** Where it went: your email / phone; push shows "this device" per signed-in device. */
  to: string[];
  /** 1 for an SMS test, else 0. */
  smsCreditsUsed: number;
  testsRemainingToday: number;
}

export interface SmsUsage {
  used: number;
  allowance: number;
  remaining: number;
  /** Resets on the 1st of each month (America/Toronto). */
  resetsOn: string;
}

// ---------------------------------------------------------------------------
// Automations (Plus: marketing.automations)
// ---------------------------------------------------------------------------
export const AUTOMATION_KINDS = ["win_back", "reward_ready", "birthday", "welcome"] as const;
export const automationKindSchema = z.enum(AUTOMATION_KINDS);
export type AutomationKind = z.infer<typeof automationKindSchema>;

export const upsertAutomationBody = z.object({
  enabled: z.boolean(),
  channel: channelSchema.default("email"),
  subject: z.string().trim().min(1).max(150).nullable().optional(),
  body: z.string().trim().min(1).max(EMAIL_MAX_BODY),
  /** win_back: days since last visit (default 30). Ignored for other kinds. */
  days: z.number().int().min(7).max(365).optional(),
});
export type UpsertAutomationBody = z.infer<typeof upsertAutomationBody>;

export interface Automation {
  kind: AutomationKind;
  label: string;
  description: string;
  enabled: boolean;
  /** Not configured yet: the server suggests copy. */
  configured: boolean;
  channel: Channel;
  subject: string | null;
  body: string;
  days: number | null;
  /** Total messages sent by this automation. */
  sentCount: number;
  /** People messaged in the last 30 days, and how many of them came in within 7 days of it. */
  last30Days: { messaged: number; cameIn7d: number };
  /** Feature gate state: false → show upsell (marketing.automations is Plus). */
  available: boolean;
}

// ---------------------------------------------------------------------------
// Public unsubscribe (link in every promotional email)
// ---------------------------------------------------------------------------
export const unsubscribeBody = z.object({ m: uuidSchema, t: z.string().min(10).max(200) });
export interface UnsubscribeResponse {
  ok: true;
  merchantName: string;
}
