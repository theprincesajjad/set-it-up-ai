/**
 * The sales and support assistant: one brain behind two doors (the platform WhatsApp number and the website chat).
 * `handleInbound` takes one message from one person and returns what to send back; the channel code (channels.ts) does
 * the sending. Order of things, and why:
 *
 *   length cap -> open conversation -> store the message -> STOP / START (WhatsApp) -> disclosure on first contact ->
 *   a person already has the chat? stay quiet -> rate limits -> HUMAN keyword -> SMS code typed back? (checked here, the
 *   model never sees the code) -> no model? hand off -> the model loop with tools -> guardrails -> store and return.
 *
 * What is decided in code and never by the model: that the first message says it is an AI, STOP / START / HUMAN, who the
 * verified owner is, whether an action was confirmed, which figures may be quoted, and when the chat belongs to a person.
 */
import { and, eq } from "drizzle-orm";
import { merchantStaff, users } from "@ll/db";
import { AGENT_TEXTS, SALES_AGENT_LIMITS, detectAgentLanguage, isAgentLang, looksEnglish, isStartKeyword, isStopKeyword, normalizePhone, wantsHuman, type AgentLang } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { allow } from "../../lib/rate-limit.js";
import { isOptedOut, recordPhoneOptOut, recordPhoneResubscribe } from "../opt-out.js";
import { checkAgentVerification } from "../auth.js";
import { checkReply, retryInstruction } from "./guard.js";
import { LlmUnavailable, createLlmClient, type LlmClient, type LlmMessage } from "./llm.js";
import { SYSTEM_PROMPT, contextBlock, wrapUser } from "./prompt.js";
import { addMessage, escalate, history, openConversation, updateConversation, type Conv, type Msg, type ToolLog } from "./store.js";
import { TOOLS, isVerified, logInput, ownedShops, runTool } from "./tools.js";

const HOUR = 3_600_000;
const asLang = (v: string | null | undefined): AgentLang => (isAgentLang(v) ? v : "en");

export interface Inbound {
  channel: "whatsapp" | "web";
  contactKey: string;
  phone?: string | null;
  name?: string | null;
  text: string;
  /** WhatsApp message type; anything but text/button replies gets the "text only" reply. */
  type?: string;
  language?: AgentLang | null;
  page?: string | null;
  providerMessageId?: string | null;
}

export interface Reply {
  id: string;
  role: "assistant" | "system";
  text: string;
  at: Date;
}

export interface AgentResult {
  conv: Conv;
  replies: Reply[];
  /** The person has asked us to stop: send replies even though they are opted out (only the STOP confirmation). */
  stopConfirmation?: boolean;
}

const llmCache = new WeakMap<object, LlmClient | null>();
/** The model client for this app: ctx.providers.salesAgentLlm when set (tests inject a scripted one), else Anthropic when ANTHROPIC_API_KEY is set, else none. */
export function llmFor(ctx: AppContext): LlmClient | null {
  if (ctx.providers.salesAgentLlm !== undefined) return ctx.providers.salesAgentLlm;
  if (!llmCache.has(ctx.providers)) llmCache.set(ctx.providers, createLlmClient(ctx.config));
  return llmCache.get(ctx.providers) ?? null;
}

export const agentEnabled = (ctx: AppContext): boolean => ctx.config.salesAgent.enabled;

const codeOf = (text: string): string | null => {
  const t = text.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(t) ? t : null;
};

function toModelMessages(rows: Msg[], lastUserText: string, ctxBlock: string): LlmMessage[] {
  const out: LlmMessage[] = [];
  const push = (role: "user" | "assistant", text: string) => {
    const prev = out[out.length - 1];
    if (prev && prev.role === role && typeof prev.content === "string") prev.content += `\n\n${text}`;
    else out.push({ role, content: text });
  };
  rows.forEach((m, i) => {
    const isLast = i === rows.length - 1 && m.role === "user";
    if (m.role === "user") push("user", isLast ? `${ctxBlock}\n${wrapUser(lastUserText)}` : wrapUser(m.body));
    else if (m.role === "human") push("assistant", `[A person from the team wrote:] ${m.body}`);
    else if (m.role === "assistant") push("assistant", m.body);
  });
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

async function sayAndStore(ctx: AppContext, conv: Conv, text: string, guard?: string): Promise<Reply> {
  const m = await addMessage(ctx, conv.id, { role: "assistant", body: text, guard: guard ?? null });
  return { id: m.id, role: "assistant", text, at: m.createdAt };
}

export async function handleInbound(ctx: AppContext, inb: Inbound): Promise<AgentResult> {
  const lang0 = inb.language ?? detectAgentLanguage(inb.text) ?? "en";
  const phone = inb.phone ? normalizePhone(inb.phone) : null;
  const { conv: opened, created } = await openConversation(ctx, { channel: inb.channel, contactKey: inb.contactKey, phone, name: inb.name, language: lang0, page: inb.page });
  let conv = opened;
  const now = ctx.now();
  // Latin script cannot tell English from romanised Hindi, so the chat keeps its language; the one exception is a French chat
  // (a Quebec visitor, or the French widget) whose person, after the French disclosure, writes plainly in English.
  const detected = detectAgentLanguage(inb.text) ?? (conv.language === "fr" && conv.disclosedAt && looksEnglish(inb.text) ? "en" : null);
  const lang = detected ?? asLang(conv.language);
  const patch: Parameters<typeof updateConversation>[2] = { lastInboundAt: now, lastActivityAt: now };
  if (detected && detected !== conv.language) patch.language = detected;
  if (conv.status === "closed") patch.status = "open";
  conv = await updateConversation(ctx, conv.id, patch);
  const T = AGENT_TEXTS[lang];
  const replies: Reply[] = [];

  const isText = !inb.type || inb.type === "text" || inb.type === "button" || inb.type === "interactive";
  const text = inb.text.trim();
  const stored = codeOf(text) && conv.otpPhone ? "[verification code entered]" : text || "(attachment)";
  // ---- Disclosure: the first thing every person reads says it is an AI. Fixed text, in their language, stored before their message.
  const optedOut = inb.channel === "whatsapp" && !!phone && !isStopKeyword(text) && (await isOptedOut(ctx.db, phone, "whatsapp"));
  if (!conv.disclosedAt && !optedOut && !(inb.channel === "whatsapp" && isStopKeyword(text))) {
    conv = await updateConversation(ctx, conv.id, { disclosedAt: now });
    replies.push(await sayAndStore(ctx, conv, T.disclosure({ whatsapp: inb.channel === "whatsapp" })));
  }
  await addMessage(ctx, conv.id, { role: "user", body: stored.slice(0, SALES_AGENT_LIMITS.maxMessageChars + 200), providerMessageId: inb.providerMessageId ?? null });

  // ---- STOP / START (WhatsApp). One list of words for every channel (packages/shared/src/opt-out.ts); the list is per phone number.
  if (inb.channel === "whatsapp" && phone) {
    if (isStopKeyword(text)) {
      await recordPhoneOptOut(ctx, phone, "whatsapp", text.toUpperCase().slice(0, 20), "whatsapp_reply");
      replies.push(await sayAndStore(ctx, conv, T.stopped));
      return { conv, replies, stopConfirmation: true };
    }
    if (await isOptedOut(ctx.db, phone, "whatsapp")) {
      if (isStartKeyword(text)) {
        await recordPhoneResubscribe(ctx, phone, "whatsapp");
        replies.push(await sayAndStore(ctx, conv, T.started));
        return { conv, replies };
      }
      // Opted out: nothing goes back until they send START.
      return { conv, replies };
    }
  }

  // ---- Not text, or too long: no model call.
  if (!isText || !text) {
    replies.push(await sayAndStore(ctx, conv, T.unsupported));
    return { conv, replies };
  }
  if (text.length > SALES_AGENT_LIMITS.maxMessageChars) {
    replies.push(await sayAndStore(ctx, conv, T.tooLong));
    return { conv, replies };
  }

  // ---- A person has the chat (or it is waiting for one): the assistant stays quiet.
  if (conv.status === "handoff" || conv.status === "human") return { conv, replies };

  // ---- Rate limits: the conversation, the contact, and the whole assistant per day (a cost ceiling).
  const day = now.toISOString().slice(0, 10);
  const within =
    (await allow(ctx, `agent:conv:${conv.id}`, SALES_AGENT_LIMITS.perConversationPerHour, HOUR)) &&
    (await allow(ctx, `agent:contact:${inb.contactKey}`, SALES_AGENT_LIMITS.perContactPerHour, HOUR)) &&
    (await allow(ctx, `agent:day:${day}`, SALES_AGENT_LIMITS.perDay, 24 * HOUR));
  if (!within) {
    const last = (await history(ctx, conv.id, 2)).filter((m) => m.role === "assistant").pop();
    if (last?.body !== T.rateLimited) replies.push(await sayAndStore(ctx, conv, T.rateLimited));
    return { conv, replies };
  }

  conv = await updateConversation(ctx, conv.id, { turn: conv.turn + 1 });

  // ---- HUMAN: code, not the model.
  if (wantsHuman(text)) {
    conv = await escalate(ctx, conv, "The person asked for a human.");
    replies.push(await sayAndStore(ctx, conv, T.handoff));
    return { conv, replies };
  }

  // ---- The SMS code, typed back. Checked here; the model is told only the outcome.
  let modelText = text;
  const code = codeOf(text);
  if (code && conv.otpPhone) {
    const res = await checkAgentVerification(ctx, conv.otpPhone, code);
    if (res.ok) {
      const [owner] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .innerJoin(merchantStaff, eq(merchantStaff.userId, users.id))
        .where(and(eq(users.phone, conv.otpPhone), eq(merchantStaff.role, "owner")))
        .limit(1);
      conv = await updateConversation(ctx, conv.id, owner ? { verifiedPhone: conv.otpPhone, verifiedUserId: owner.id, verifiedAt: now, otpPhone: null } : { otpPhone: null });
      modelText = owner ? "[server: the person typed the SMS code and the phone check succeeded]" : "[server: the code could not be verified]";
    } else {
      if (res.reason !== "wrong") conv = await updateConversation(ctx, conv.id, { otpPhone: null });
      modelText = `[server: the code was not accepted (${res.reason}${res.attemptsLeft !== undefined ? `, ${res.attemptsLeft} tries left` : ""}). Offer to send a new code if they want.]`;
    }
  }

  // ---- No model (no key, or it is down): the chat still works as an inbox.
  const llm = llmFor(ctx);
  if (!llm) {
    conv = await escalate(ctx, conv, "assistant_unavailable: no model configured");
    replies.push(await sayAndStore(ctx, conv, T.offline));
    return { conv, replies };
  }

  const out = await runModel(ctx, llm, conv, lang, inb, modelText);
  replies.push(...out.replies);
  return { conv: out.conv, replies };
}

async function runModel(ctx: AppContext, llm: LlmClient, conv0: Conv, lang: AgentLang, inb: Inbound, modelText: string): Promise<{ conv: Conv; replies: Reply[] }> {
  let conv = conv0;
  const T = AGENT_TEXTS[lang];
  const shops = await ownedShops(ctx, conv);
  const ctxBlock = contextBlock({
    channel: inb.channel,
    language: lang,
    verified: isVerified(conv, ctx.now()) ? { shops: shops.map((s) => ({ number: s.number, name: s.name, status: s.status, plan: s.plan, restaurantTier: s.restaurantTier })) } : null,
    pendingConfirmation: !!conv.pendingAction,
    otpPending: !!conv.otpPhone,
    leadCreated: !!conv.leadId,
    callRequested: !!conv.callRequestNote,
    today: ctx.now().toISOString().slice(0, 10),
    contactProvided: !!conv.phone || !!conv.leadId,
  });
  const rows = await history(ctx, conv.id, SALES_AGENT_LIMITS.historyMessages);
  const messages = toModelMessages(rows, modelText, ctxBlock);

  const toolLogs: ToolLog[] = [];
  let toolText = "";
  let retried = false;
  let finalText: string | null = null;
  let guard: string | null = null;
  let blocked: string | null = null;
  let model: string | null = null;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  try {
    for (let round = 0; round < SALES_AGENT_LIMITS.maxToolRounds; round++) {
      const res = await llm.complete({ system: SYSTEM_PROMPT, tools: TOOLS, messages, maxTokens: 2048 });
      model = res.model;
      usage.input += res.usage.input;
      usage.output += res.usage.output;
      usage.cacheRead += res.usage.cacheRead;
      usage.cacheWrite += res.usage.cacheWrite;

      if (res.stopReason === "refusal") {
        guard = "refusal";
        finalText = T.guardrail;
        conv = await escalate(ctx, conv, "The model declined to answer (safety refusal).");
        break;
      }
      const uses = res.content.filter((b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use");
      if (res.stopReason === "tool_use" && uses.length) {
        messages.push({ role: "assistant", content: res.content });
        const results = [];
        for (const u of uses) {
          const t0 = Date.now();
          const run = await runTool(ctx, conv, lang, u.name, u.input);
          conv = run.conv;
          const content = JSON.stringify(run.data);
          toolText += `\n${content}`;
          toolLogs.push({ name: u.name, input: logInput(u.input), ok: run.ok, summary: run.summary.slice(0, 160), ms: Date.now() - t0 });
          results.push({ type: "tool_result" as const, tool_use_id: u.id, content, ...(run.ok ? {} : { is_error: true }) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const draft = res.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const issues = draft ? checkReply(draft, { userText: modelText, toolText }) : [];
      if (issues.length && !retried) {
        retried = true;
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: retryInstruction(issues) });
        continue;
      }
      if (issues.length) {
        guard = issues[0]!.code;
        blocked = `${issues.map((i) => i.detail).join(" | ")}\nDraft: ${draft}`;
        finalText = T.guardrail;
        conv = await escalate(ctx, conv, `Guardrail: ${issues.map((i) => i.code).join(", ")}`);
      } else finalText = draft || null;
      break;
    }
  } catch (err) {
    if (err instanceof LlmUnavailable) {
      conv = await escalate(ctx, conv, `assistant_unavailable: ${err.message}`);
      const m = await addMessage(ctx, conv.id, { role: "assistant", body: T.offline, toolCalls: toolLogs });
      return { conv, replies: [{ id: m.id, role: "assistant", text: T.offline, at: m.createdAt }] };
    }
    throw err;
  }

  if (!finalText) {
    // Empty answer or the tool loop ran out of rounds: a person finishes this one.
    if (conv.status === "open") conv = await escalate(ctx, conv, "The assistant could not finish an answer.");
    finalText = T.handoff;
  }
  if (blocked) await addMessage(ctx, conv.id, { role: "system", body: `Blocked draft: ${blocked}`.slice(0, 4000) });
  const m = await addMessage(ctx, conv.id, { role: "assistant", body: finalText, toolCalls: toolLogs, guard, model, usage });
  return { conv, replies: [{ id: m.id, role: "assistant", text: finalText, at: m.createdAt }] };
}
