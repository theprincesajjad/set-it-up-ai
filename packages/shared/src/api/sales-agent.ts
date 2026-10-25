/**
 * Contracts for the sales and support assistant: the public web chat (no login) and the admin console.
 * Docs: docs/engineering/api/sales-agent.md.
 */
import { z } from "zod";
import { SALES_AGENT_LIMITS } from "../sales-agent.js";

export const CHANNELS = ["whatsapp", "web"] as const;
export type Channel = (typeof CHANNELS)[number];
/** open: the assistant answers. handoff: waiting for a person. human: a person has taken over. closed: done. */
export const STATUSES = ["open", "handoff", "human", "closed"] as const;
export type ConversationStatus = (typeof STATUSES)[number];

// ---------------------------------------------------------------------------
// Public web chat
// ---------------------------------------------------------------------------
export const webMessageBody = z.object({
  /** Returned by the first call; keep it in the browser. Omit to start a conversation. */
  sessionToken: z.string().trim().min(20).max(200).optional(),
  text: z.string().trim().min(1).max(SALES_AGENT_LIMITS.maxMessageChars),
  /** The widget's language, a hint for the very first message. */
  language: z.enum(["en", "hi", "ur", "pa"]).optional(),
  /** Page the visitor is on (path only), for the team's context. */
  page: z.string().trim().max(200).optional(),
});
export type WebMessageBody = z.infer<typeof webMessageBody>;

export interface ChatLine {
  id: string;
  /** assistant | human | user | system */
  role: "assistant" | "human" | "user" | "system";
  text: string;
  at: string;
}

export interface WebChatResponse {
  sessionToken: string;
  language: "en" | "hi" | "ur" | "pa";
  status: ConversationStatus;
  /** New lines since the visitor's message: the disclosure on the first call, then the replies. */
  lines: ChatLine[];
}

export const webPollQuery = z.object({ since: z.string().datetime().optional() });

export interface WebPollResponse {
  status: ConversationStatus;
  lines: ChatLine[];
}

export interface SalesAgentStatus {
  /** The widget shows only when true. */
  enabled: boolean;
  /** wa.me digits when a number is configured (SALES_AGENT_WHATSAPP_NUMBER), else null: the button hides. */
  whatsappNumber: string | null;
}

// ---------------------------------------------------------------------------
// Admin console
// ---------------------------------------------------------------------------
export const listQuery = z.object({
  view: z.enum(["queue", "all", "rated_down"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export interface ConversationSummary {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  language: string;
  /** Masked (+1 647 *** 1042) for WhatsApp, null for web. */
  contact: string | null;
  contactName: string | null;
  verified: boolean;
  lastMessage: string;
  lastMessageAt: string;
  handoffReason: string | null;
  handoffAt: string | null;
  messageCount: number;
  ratedDown: number;
  leadId: string | null;
}

export interface ToolCallLog {
  name: string;
  /** Input with phone numbers and codes masked. */
  input: Record<string, unknown>;
  ok: boolean;
  /** Short result summary (never the full result). */
  summary: string;
  ms: number;
}

export interface TranscriptMessage {
  id: string;
  role: "assistant" | "human" | "user" | "system";
  text: string;
  at: string;
  toolCalls: ToolCallLog[];
  feedback: "up" | "down" | null;
  /** Guardrail that replaced or flagged this reply, if any. */
  guard: string | null;
  humanName: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: TranscriptMessage[];
  /** WhatsApp: the free-form window (24 h after the last inbound message) is open. */
  windowOpen: boolean;
  windowClosesAt: string | null;
  takenOverBy: string | null;
  /** at: the time they asked for, when it was clear enough to store; note: their words. */
  callRequest: { at: string | null; note: string | null } | null;
  page: string | null;
  createdAt: string;
}

export const replyBody = z.object({ text: z.string().trim().min(1).max(2000) });
export const feedbackBody = z.object({ rating: z.enum(["up", "down"]).nullable() });

export interface QualityMetrics {
  days: number;
  conversations: number;
  byChannel: Record<Channel, number>;
  handoffs: number;
  handledWithoutPerson: number;
  /** Percent of conversations never handed to a person. */
  handledPct: number;
  ratedUp: number;
  ratedDown: number;
  guardrailTrips: Record<string, number>;
  toolCalls: number;
  toolErrors: number;
  handoffReasons: { reason: string; n: number }[];
  languages: { language: string; n: number }[];
  topTools: { name: string; n: number }[];
  recentDown: { conversationId: string; messageId: string; text: string; at: string }[];
}

export interface EvalCaseView {
  id: string;
  lang: "en" | "hi" | "ur" | "pa";
  question: string;
  expect: string;
}

export interface QualityResponse {
  metrics: QualityMetrics;
  cases: EvalCaseView[];
  /** How to run the live eval; the result file is local to the machine that ran it. */
  evalCommand: string;
  modelConfigured: boolean;
  model: string;
}
