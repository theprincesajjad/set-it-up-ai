/**
 * The founder's review console (admin only): the conversation list and hand-off queue, the transcript with the tools the
 * assistant ran, taking over and replying as a person, thumbs on answers, and the quality numbers.
 */
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { salesAgentConversations, salesAgentMessages, users } from "@ll/db";
import { AGENT_TEXTS, isAgentLang, type AgentLang, type Page, type salesAgentApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { HttpError, badRequest, notFound } from "../../lib/errors.js";
import { writeAudit } from "../admin-audit.js";
import { sendWhatsAppText } from "./channels.js";
import { EVAL_CASES } from "./eval-cases.js";
import { llmFor } from "./agent.js";
import { addMessage, allMessages, getConversation, maskPhone, updateConversation, type Conv } from "./store.js";

type Summary = salesAgentApi.ConversationSummary;

const enc = (d: Date, id: string) => Buffer.from(`${d.toISOString()}|${id}`).toString("base64url");
function dec(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
    return at && id && !Number.isNaN(Date.parse(at)) ? { at: new Date(at), id } : null;
  } catch {
    return null;
  }
}

export async function list(ctx: AppContext, q: salesAgentApi.ListQuery): Promise<Page<Summary>> {
  const c = salesAgentConversations;
  const cur = dec(q.cursor);
  const where = and(
    q.view === "queue" ? eq(c.status, "handoff") : undefined,
    q.view === "rated_down" ? sql`exists (select 1 from ${salesAgentMessages} m where m.conversation_id = ${c.id} and m.feedback = 'down')` : undefined,
    cur ? or(lt(c.lastActivityAt, cur.at), and(eq(c.lastActivityAt, cur.at), lt(c.id, cur.id))) : undefined,
  );
  const rows = await ctx.db.select().from(c).where(where).orderBy(q.view === "queue" ? sql`${c.handoffAt} asc nulls last, ${c.id}` : desc(c.lastActivityAt), desc(c.id)).limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const ids = page.map((r) => r.id);
  const stats = ids.length
    ? await ctx.db
        .select({
          conversationId: salesAgentMessages.conversationId,
          n: sql<number>`count(*) filter (where ${salesAgentMessages.role} <> 'system')::int`,
          down: sql<number>`count(*) filter (where ${salesAgentMessages.feedback} = 'down')::int`,
        })
        .from(salesAgentMessages)
        .where(inArray(salesAgentMessages.conversationId, ids))
        .groupBy(salesAgentMessages.conversationId)
    : [];
  const lastRows = ids.length
    ? await ctx.db
        .select({ conversationId: salesAgentMessages.conversationId, body: salesAgentMessages.body, createdAt: salesAgentMessages.createdAt })
        .from(salesAgentMessages)
        .where(and(inArray(salesAgentMessages.conversationId, ids), sql`${salesAgentMessages.role} <> 'system'`, sql`${salesAgentMessages.createdAt} = (select max(m2.created_at) from ${salesAgentMessages} m2 where m2.conversation_id = ${salesAgentMessages.conversationId} and m2.role <> 'system')`))
    : [];
  const byStat = new Map(stats.map((s) => [s.conversationId, s]));
  const byLast = new Map(lastRows.map((s) => [s.conversationId, s]));
  const items = page.map((r) => summary(r, byStat.get(r.id)?.n ?? 0, byStat.get(r.id)?.down ?? 0, byLast.get(r.id)?.body ?? ""));
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > q.limit && last ? enc(last.lastActivityAt, last.id) : null };
}

function summary(r: Conv, messageCount: number, ratedDown: number, lastMessage: string): Summary {
  return {
    id: r.id,
    channel: r.channel as Summary["channel"],
    status: r.status as Summary["status"],
    language: r.language,
    contact: r.channel === "whatsapp" ? maskPhone(r.phone) : null,
    contactName: r.contactName,
    verified: !!r.verifiedAt,
    lastMessage: lastMessage.slice(0, 140),
    lastMessageAt: r.lastActivityAt.toISOString(),
    handoffReason: r.handoffReason,
    handoffAt: r.handoffAt?.toISOString() ?? null,
    messageCount,
    ratedDown,
    leadId: r.leadId,
  };
}

export async function detail(ctx: AppContext, id: string): Promise<salesAgentApi.ConversationDetail> {
  const conv = await getConversation(ctx, id);
  if (!conv) throw notFound("Conversation");
  const msgs = await allMessages(ctx, id);
  const humanIds = [...new Set(msgs.map((m) => m.humanUserId).filter((x): x is string => !!x))];
  const names = humanIds.length ? new Map((await ctx.db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, humanIds))).map((u) => [u.id, u.name ?? u.email ?? "Team"])) : new Map<string, string>();
  const takenBy = conv.takenOverBy ? ((await ctx.db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, conv.takenOverBy)).limit(1))[0] ?? null) : null;
  const windowEnd = conv.lastInboundAt ? new Date(conv.lastInboundAt.getTime() + 24 * 3_600_000) : null;
  return {
    ...summary(conv, msgs.filter((m) => m.role !== "system").length, msgs.filter((m) => m.feedback === "down").length, [...msgs].reverse().find((m) => m.role !== "system")?.body ?? ""),
    messages: msgs.map((m) => ({ id: m.id, role: m.role as "assistant" | "human" | "user" | "system", text: m.body, at: m.createdAt.toISOString(), toolCalls: m.toolCalls ?? [], feedback: (m.feedback as "up" | "down" | null) ?? null, guard: m.guard, humanName: m.humanUserId ? (names.get(m.humanUserId) ?? "Team") : null })),
    windowOpen: conv.channel === "whatsapp" ? !!windowEnd && windowEnd.getTime() > ctx.now().getTime() : true,
    windowClosesAt: conv.channel === "whatsapp" ? (windowEnd?.toISOString() ?? null) : null,
    takenOverBy: takenBy ? (takenBy.name ?? takenBy.email ?? "Team") : null,
    callRequest: conv.callRequestNote ? { at: conv.callRequestAt?.toISOString() ?? null, note: conv.callRequestNote } : null,
    page: conv.page,
    createdAt: conv.createdAt.toISOString(),
  };
}

const lang = (c: Conv): AgentLang => (isAgentLang(c.language) ? c.language : "en");

export async function takeOver(ctx: AppContext, adminId: string, id: string): Promise<salesAgentApi.ConversationDetail> {
  const conv = await getConversation(ctx, id);
  if (!conv) throw notFound("Conversation");
  if (conv.status === "human" && conv.takenOverBy === adminId) return detail(ctx, id);
  const first = conv.status !== "human";
  await updateConversation(ctx, id, { status: "human", takenOverBy: adminId, takenOverAt: ctx.now(), pendingAction: null });
  await addMessage(ctx, id, { role: "system", body: "A person took over. The assistant is paused.", humanUserId: adminId });
  await writeAudit(ctx.db, { actorUserId: adminId, action: "sales_agent.takeover", entity: "sales_agent_conversation", entityId: id });
  if (first) await deliverHuman(ctx, (await getConversation(ctx, id))!, adminId, AGENT_TEXTS[lang(conv)].humanJoined, true);
  return detail(ctx, id);
}

export async function release(ctx: AppContext, adminId: string, id: string): Promise<salesAgentApi.ConversationDetail> {
  const conv = await getConversation(ctx, id);
  if (!conv) throw notFound("Conversation");
  await updateConversation(ctx, id, { status: "open", takenOverBy: null, takenOverAt: null, handoffReason: null, handoffAt: null });
  await addMessage(ctx, id, { role: "system", body: "Handed back to the assistant.", humanUserId: adminId });
  await writeAudit(ctx.db, { actorUserId: adminId, action: "sales_agent.release", entity: "sales_agent_conversation", entityId: id });
  return detail(ctx, id);
}

export async function close(ctx: AppContext, adminId: string, id: string): Promise<salesAgentApi.ConversationDetail> {
  if (!(await getConversation(ctx, id))) throw notFound("Conversation");
  await updateConversation(ctx, id, { status: "closed" });
  await addMessage(ctx, id, { role: "system", body: "Closed.", humanUserId: adminId });
  await writeAudit(ctx.db, { actorUserId: adminId, action: "sales_agent.close", entity: "sales_agent_conversation", entityId: id });
  return detail(ctx, id);
}

/** Store a person's message and, on WhatsApp, send it. A message that cannot be sent is not stored as sent. */
async function deliverHuman(ctx: AppContext, conv: Conv, adminId: string, text: string, quiet = false): Promise<void> {
  if (conv.channel === "whatsapp") {
    const out = await sendWhatsAppText(ctx, conv, text);
    if (!out.sent) {
      if (quiet) return;
      const why = out.reason === "opted_out" ? "This number replied STOP, so we cannot message it." : out.reason === "outside_window" ? "More than 24 hours have passed since their last message, so WhatsApp only allows an approved template. Wait for them to write, or call them." : "WhatsApp did not accept the message. Try again.";
      throw new HttpError(409, out.reason, why);
    }
  }
  await addMessage(ctx, conv.id, { role: "human", body: text, humanUserId: adminId });
}

export async function reply(ctx: AppContext, adminId: string, id: string, text: string): Promise<salesAgentApi.ConversationDetail> {
  const conv = await getConversation(ctx, id);
  if (!conv) throw notFound("Conversation");
  if (conv.status !== "human") {
    // Replying is taking over: the assistant must not answer on top of a person.
    await updateConversation(ctx, id, { status: "human", takenOverBy: adminId, takenOverAt: ctx.now(), pendingAction: null });
    await addMessage(ctx, id, { role: "system", body: "A person took over by replying. The assistant is paused.", humanUserId: adminId });
  }
  await deliverHuman(ctx, (await getConversation(ctx, id))!, adminId, text);
  await writeAudit(ctx.db, { actorUserId: adminId, action: "sales_agent.reply", entity: "sales_agent_conversation", entityId: id, data: { channel: conv.channel } });
  return detail(ctx, id);
}

export async function rate(ctx: AppContext, adminId: string, messageId: string, rating: "up" | "down" | null): Promise<void> {
  const [m] = await ctx.db.select({ id: salesAgentMessages.id, role: salesAgentMessages.role }).from(salesAgentMessages).where(eq(salesAgentMessages.id, messageId)).limit(1);
  if (!m) throw notFound("Message");
  if (m.role !== "assistant") throw badRequest("Only the assistant's answers can be rated.");
  await ctx.db.update(salesAgentMessages).set({ feedback: rating }).where(eq(salesAgentMessages.id, messageId));
  await writeAudit(ctx.db, { actorUserId: adminId, action: "sales_agent.rate", entity: "sales_agent_message", entityId: messageId, data: { rating } });
}

export async function quality(ctx: AppContext, days = 30): Promise<salesAgentApi.QualityResponse> {
  const since = new Date(ctx.now().getTime() - days * 86_400_000);
  const convs = await ctx.db.select().from(salesAgentConversations).where(sql`${salesAgentConversations.createdAt} >= ${since}`);
  const msgs = await ctx.db
    .select({ id: salesAgentMessages.id, conversationId: salesAgentMessages.conversationId, role: salesAgentMessages.role, body: salesAgentMessages.body, toolCalls: salesAgentMessages.toolCalls, feedback: salesAgentMessages.feedback, guard: salesAgentMessages.guard, createdAt: salesAgentMessages.createdAt })
    .from(salesAgentMessages)
    .where(sql`${salesAgentMessages.createdAt} >= ${since}`);
  const count = <T,>(items: T[], key: (t: T) => string | null) => {
    const m = new Map<string, number>();
    for (const i of items) {
      const k = key(i);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const handoffs = convs.filter((c) => c.handoffAt).length;
  const tools = msgs.flatMap((m) => m.toolCalls ?? []);
  const model = ctx.config.salesAgent.model;
  return {
    metrics: {
      days,
      conversations: convs.length,
      byChannel: { whatsapp: convs.filter((c) => c.channel === "whatsapp").length, web: convs.filter((c) => c.channel === "web").length },
      handoffs,
      handledWithoutPerson: convs.length - handoffs,
      handledPct: convs.length ? Math.round(((convs.length - handoffs) / convs.length) * 100) : 0,
      ratedUp: msgs.filter((m) => m.feedback === "up").length,
      ratedDown: msgs.filter((m) => m.feedback === "down").length,
      guardrailTrips: Object.fromEntries(count(msgs, (m) => m.guard)),
      toolCalls: tools.length,
      toolErrors: tools.filter((t) => !t.ok).length,
      handoffReasons: count(convs, (c) => (c.handoffReason ? c.handoffReason.replace(/^Guardrail: .*/, "Guardrail").replace(/^assistant_unavailable.*/, "Assistant unavailable").slice(0, 80) : null)).slice(0, 8).map(([reason, n]) => ({ reason, n })),
      languages: count(convs, (c) => c.language).map(([language, n]) => ({ language, n })),
      topTools: count(tools, (t) => t.name).slice(0, 8).map(([name, n]) => ({ name, n })),
      recentDown: msgs
        .filter((m) => m.feedback === "down")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map((m) => ({ conversationId: m.conversationId, messageId: m.id, text: m.body.slice(0, 200), at: m.createdAt.toISOString() })),
    },
    cases: EVAL_CASES.map((c) => ({ id: c.id, lang: c.lang, question: c.question, expect: c.expectText })),
    evalCommand: "pnpm --filter @ll/api eval:sales-agent",
    modelConfigured: !!llmFor(ctx),
    model,
  };
}
