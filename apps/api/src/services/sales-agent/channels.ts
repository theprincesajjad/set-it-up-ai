/**
 * The two doors into the assistant, and the one way out.
 *
 *  - WhatsApp: the platform's own number (SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID / _NUMBER), separate from every merchant's.
 *    The existing webhook (services/whatsapp.ts) hands us inbound messages for that number. Replies go out as free-form text
 *    because they answer a message that just arrived (inside Meta's 24-hour customer-service window). A person's reply from the
 *    console is checked against the same window; outside it we do not send (a template would be needed, and a sales chat has none).
 *  - Web: POST /v1/public/sales-agent/messages from the marketing-site widget. The visitor holds a random session token; we keep
 *    only its hash.
 */
import { AGENT_TEXTS, detectAgentLanguage, isAgentLang, normalizePhone, type AgentLang, type salesAgentApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { randomToken } from "../../lib/crypto.js";
import { tooMany } from "../../lib/errors.js";
import { allow } from "../../lib/rate-limit.js";
import { getWhatsApp, type InboundWhatsAppMessage } from "../../providers/whatsapp.js";
import { isOptedOut } from "../opt-out.js";
import { agentEnabled, handleInbound, type Reply } from "./agent.js";
import { allMessages, findConversation, hashToken, type Conv, type Msg } from "./store.js";

export const WINDOW_MS = 24 * 60 * 60_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Is this inbound message addressed to the platform's assistant number (and not to a shop)? */
export function isPlatformMessage(ctx: AppContext, msg: Pick<InboundWhatsAppMessage, "phoneNumberId" | "displayPhoneNumber">): boolean {
  const c = ctx.config.salesAgent;
  if (!c.enabled) return false;
  if (c.whatsappPhoneNumberId && msg.phoneNumberId === c.whatsappPhoneNumberId) return true;
  return !!c.whatsappNumber && !!msg.displayPhoneNumber && digits(msg.displayPhoneNumber) === c.whatsappNumber;
}

const sendId = (ctx: AppContext, fallback: string) => ctx.config.salesAgent.whatsappPhoneNumberId ?? fallback;

export async function handleWhatsAppInbound(ctx: AppContext, msg: InboundWhatsAppMessage): Promise<void> {
  const phone = normalizePhone(msg.from) ?? msg.from;
  const res = await handleInbound(ctx, { channel: "whatsapp", contactKey: phone, phone, name: msg.name, text: msg.text, type: msg.type, providerMessageId: msg.id });
  const provider = getWhatsApp(ctx);
  for (const r of res.replies) {
    try {
      await provider.sendText({ phoneNumberId: sendId(ctx, msg.phoneNumberId), to: phone, body: r.text });
    } catch (err) {
      // Only the error class: the message may quote the chat. The reply is stored; the console shows it as sent by the assistant.
      if (ctx.config.env !== "test") console.error("[sales-agent] whatsapp send failed", (err as Error).name);
    }
  }
}

export type SendOutcome = { sent: true } | { sent: false; reason: "opted_out" | "outside_window" | "send_failed" };

/** A person's reply from the console to a WhatsApp chat. */
export async function sendWhatsAppText(ctx: AppContext, conv: Conv, text: string): Promise<SendOutcome> {
  if (!conv.phone) return { sent: false, reason: "send_failed" };
  if (await isOptedOut(ctx.db, conv.phone, "whatsapp")) return { sent: false, reason: "opted_out" };
  if (!conv.lastInboundAt || ctx.now().getTime() - conv.lastInboundAt.getTime() > WINDOW_MS) return { sent: false, reason: "outside_window" };
  try {
    await getWhatsApp(ctx).sendText({ phoneNumberId: sendId(ctx, `fake:${ctx.config.salesAgent.whatsappNumber ?? "platform"}`), to: conv.phone, body: text });
    return { sent: true };
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[sales-agent] whatsapp send failed", (err as Error).name);
    return { sent: false, reason: "send_failed" };
  }
}

// ---------------------------------------------------------------------------
// Web
// ---------------------------------------------------------------------------
export const toLine = (m: Pick<Msg, "id" | "role" | "body" | "createdAt">): salesAgentApi.ChatLine => ({ id: m.id, role: m.role as salesAgentApi.ChatLine["role"], text: m.body, at: m.createdAt.toISOString() });
export const toLineFromReply = (r: Reply): salesAgentApi.ChatLine => ({ id: r.id, role: r.role, text: r.text, at: r.at.toISOString() });

export function status(ctx: AppContext): salesAgentApi.SalesAgentStatus {
  const c = ctx.config.salesAgent;
  return { enabled: c.enabled, whatsappNumber: c.enabled && c.whatsappNumber ? c.whatsappNumber : null };
}

export async function handleWebMessage(ctx: AppContext, body: salesAgentApi.WebMessageBody, ip: string): Promise<salesAgentApi.WebChatResponse> {
  if (!agentEnabled(ctx)) throw tooMany("The assistant is not available right now.");
  if (!(await allow(ctx, `agent:ip:${ip}`, 60, HOUR))) throw tooMany("Too many messages from this device. Please try again later, or email us.");
  const existing = body.sessionToken ? await findConversation(ctx, "web", hashToken(body.sessionToken)) : null;
  let token = body.sessionToken ?? "";
  if (!existing) {
    if (!(await allow(ctx, `agent:ip-new:${ip}`, 10, HOUR))) throw tooMany("Too many new chats from this device. Please try again later, or email us.");
    token = `wc_${randomToken(24)}`;
  }
  const language: AgentLang | null = isAgentLang(body.language) ? body.language : null;
  const res = await handleInbound(ctx, { channel: "web", contactKey: hashToken(token), text: body.text, language: detectAgentLanguage(body.text) ?? language, page: body.page?.replace(/[?#].*$/, "") ?? null });
  return { sessionToken: token, language: (isAgentLang(res.conv.language) ? res.conv.language : "en") as AgentLang, status: res.conv.status as salesAgentApi.ConversationStatus, lines: res.replies.map(toLineFromReply) };
}

/** What the visitor has not seen yet: replies from the assistant or a person (system notes and blocked drafts are never sent). */
export async function pollWeb(ctx: AppContext, token: string, since: string | undefined): Promise<salesAgentApi.WebPollResponse> {
  const conv = await findConversation(ctx, "web", hashToken(token));
  if (!conv) return { status: "open", lines: [] };
  const after = since ? new Date(since).getTime() : 0;
  const rows = (await allMessages(ctx, conv.id)).filter((m) => (m.role === "assistant" || m.role === "human") && m.createdAt.getTime() > after);
  return { status: conv.status as salesAgentApi.ConversationStatus, lines: rows.map(toLine) };
}

