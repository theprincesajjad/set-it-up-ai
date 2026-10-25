/**
 * Conversation storage for the sales assistant: find or open a conversation, add messages, hand off to a person.
 * Everything here is scoped to one conversation id; nothing reads another conversation's rows.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { salesAgentConversations, salesAgentMessages } from "@ll/db";
import { BRAND, type AgentLang, type salesAgentApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { sha256 } from "../../lib/crypto.js";
import { writeAudit } from "../admin-audit.js";

export type Conv = typeof salesAgentConversations.$inferSelect;
export type Msg = typeof salesAgentMessages.$inferSelect;
export type ToolLog = salesAgentApi.ToolCallLog;

export const hashToken = (token: string): string => sha256(token);

/** +16475551042 -> "+1 647 *** 1042". Anything that is not a plain number is hidden entirely. */
export function maskPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length < 10) return "***";
  return `+${d.slice(0, d.length - 10) || "1"} ${d.slice(-10, -7)} *** ${d.slice(-4)}`;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

/** For logs and tool-call records: phone numbers and emails become masks, long strings are cut. */
export function maskValue(v: unknown): unknown {
  if (typeof v === "string") return v.replace(EMAIL, (m) => `${m[0]}***@${m.split("@")[1]!.replace(/^./, "*")}`).replace(PHONE, (m) => maskPhone(m) ?? "***").slice(0, 200);
  if (Array.isArray(v)) return v.map(maskValue);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, maskValue(x)]));
  return v;
}

export async function getConversation(ctx: AppContext, id: string): Promise<Conv | null> {
  const [c] = await ctx.db.select().from(salesAgentConversations).where(eq(salesAgentConversations.id, id)).limit(1);
  return c ?? null;
}

export async function findConversation(ctx: AppContext, channel: "whatsapp" | "web", contactKey: string): Promise<Conv | null> {
  const [c] = await ctx.db.select().from(salesAgentConversations).where(and(eq(salesAgentConversations.channel, channel), eq(salesAgentConversations.contactKey, contactKey))).limit(1);
  return c ?? null;
}

export async function openConversation(ctx: AppContext, o: { channel: "whatsapp" | "web"; contactKey: string; phone?: string | null; name?: string | null; language: AgentLang; page?: string | null }): Promise<{ conv: Conv; created: boolean }> {
  const existing = await findConversation(ctx, o.channel, o.contactKey);
  if (existing) return { conv: existing, created: false };
  const now = ctx.now();
  const [row] = await ctx.db
    .insert(salesAgentConversations)
    .values({ channel: o.channel, contactKey: o.contactKey, phone: o.phone ?? null, contactName: o.name ?? null, language: o.language, page: o.page ?? null, lastActivityAt: now, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning();
  if (row) return { conv: row, created: true };
  return { conv: (await findConversation(ctx, o.channel, o.contactKey))!, created: false };
}

export async function updateConversation(ctx: AppContext, id: string, patch: Partial<typeof salesAgentConversations.$inferInsert>): Promise<Conv> {
  const [row] = await ctx.db.update(salesAgentConversations).set({ ...patch, updatedAt: ctx.now() }).where(eq(salesAgentConversations.id, id)).returning();
  return row!;
}

export async function addMessage(
  ctx: AppContext,
  conversationId: string,
  m: { role: Msg["role"]; body: string; toolCalls?: ToolLog[]; guard?: string | null; humanUserId?: string | null; model?: string | null; usage?: Record<string, number> | null; providerMessageId?: string | null; at?: Date },
): Promise<Msg> {
  // Messages of one conversation are strictly ordered: a message never gets the same timestamp as the one before it (a fast turn, or a frozen test clock).
  const [prev] = await ctx.db.select({ at: sql<Date | null>`max(${salesAgentMessages.createdAt})` }).from(salesAgentMessages).where(eq(salesAgentMessages.conversationId, conversationId));
  const last = prev?.at ? new Date(prev.at as unknown as string | Date).getTime() : 0;
  const at = new Date(Math.max((m.at ?? ctx.now()).getTime(), last + 1));
  const [row] = await ctx.db
    .insert(salesAgentMessages)
    .values({ conversationId, role: m.role, body: m.body, toolCalls: m.toolCalls ?? [], guard: m.guard ?? null, humanUserId: m.humanUserId ?? null, model: m.model ?? null, usage: m.usage ?? null, providerMessageId: m.providerMessageId ?? null, createdAt: at })
    .returning();
  await ctx.db.update(salesAgentConversations).set({ lastActivityAt: ctx.now(), updatedAt: ctx.now() }).where(eq(salesAgentConversations.id, conversationId));
  return row!;
}

/** The last `n` messages the model should see (oldest first). System rows (blocked drafts, hand-off notes) are for admins only. */
export async function history(ctx: AppContext, conversationId: string, n: number): Promise<Msg[]> {
  const rows = await ctx.db
    .select()
    .from(salesAgentMessages)
    .where(and(eq(salesAgentMessages.conversationId, conversationId), sql`${salesAgentMessages.role} <> 'system'`))
    .orderBy(desc(salesAgentMessages.createdAt), desc(salesAgentMessages.id))
    .limit(n);
  return rows.reverse();
}

export async function allMessages(ctx: AppContext, conversationId: string): Promise<Msg[]> {
  return ctx.db.select().from(salesAgentMessages).where(eq(salesAgentMessages.conversationId, conversationId)).orderBy(asc(salesAgentMessages.createdAt), asc(salesAgentMessages.id));
}

/** Tell the team. A mail outage must never lose the hand-off: the queue in the console is the record. */
export async function notifyTeam(ctx: AppContext, subject: string, text: string): Promise<void> {
  try {
    await ctx.providers.email.send({ to: ctx.config.salesAgent.adminEmail ?? BRAND.supportEmail, subject, text });
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[sales-agent] team email failed", (err as Error).name);
  }
}

export const consoleLink = (ctx: AppContext, id: string) => `${ctx.config.publicWebUrl}/admin/sales-agent?c=${id}`;

/** Put the conversation in the queue for a person. Idempotent: a conversation already waiting or taken over keeps its first reason. */
export async function escalate(ctx: AppContext, conv: Conv, reason: string): Promise<Conv> {
  if (conv.status === "handoff" || conv.status === "human") return conv;
  const now = ctx.now();
  const updated = await updateConversation(ctx, conv.id, { status: "handoff", handoffReason: reason.slice(0, 300), handoffAt: now });
  await addMessage(ctx, conv.id, { role: "system", body: `Handoff requested: ${reason.slice(0, 300)}` });
  await writeAudit(ctx.db, { actorUserId: null, action: "sales_agent.handoff", entity: "sales_agent_conversation", entityId: conv.id, data: { channel: conv.channel, reason: reason.slice(0, 120) } });
  await notifyTeam(ctx, `Sales assistant: a person is needed (${conv.channel})`, [`Reason: ${reason.slice(0, 300)}`, conv.phone ? `Contact: ${maskPhone(conv.phone)}` : "Contact: web visitor", `Open the chat: ${consoleLink(ctx, conv.id)}`].join("\n"));
  return updated;
}
