/**
 * WhatsApp inbox (restaurant.whatsapp_notifications): the list of chats with a preview, one chat's messages, a reply from
 * a person (free-form, only inside the 24 hour window), taking a chat over from the ordering assistant (and handing it
 * back), and the guest panel (visits, usual, points, notes, consent, language).
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { merchantMembers, merchants, users, whatsappMessages, whatsappSessions } from "@ll/db";
import type { restaurantApi, whatsappApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, notFound } from "../lib/errors.js";
import { canSendMarketing, sendWhatsApp, sessionDto, windowOpen, windowOpenUntil } from "./whatsapp.js";
import { usualFor } from "./usual.js";

type Merchant = typeof merchants.$inferSelect;
type Session = typeof whatsappSessions.$inferSelect;

async function loadSession(ctx: AppContext, merchantId: string, id: string): Promise<Session> {
  const [s] = await ctx.db.select().from(whatsappSessions).where(and(eq(whatsappSessions.id, id), eq(whatsappSessions.merchantId, merchantId))).limit(1);
  if (!s) throw notFound("Chat");
  return s;
}

function previewOf(m: { kind: string; body: string }): string {
  if (m.kind === "order_summary") {
    try {
      const b = JSON.parse(m.body) as restaurantApi.OrderSummaryBody;
      return b.payUrl ? `Pay link sent for order #${b.orderNumber}` : `Order #${b.orderNumber} placed`;
    } catch {
      return "Order summary";
    }
  }
  return m.body.replace(/\s+/g, " ").slice(0, 80);
}

export async function listInbox(ctx: AppContext, merchantId: string, limit = 50): Promise<whatsappApi.WhatsappSession[]> {
  const rows = await ctx.db.select().from(whatsappSessions).where(eq(whatsappSessions.merchantId, merchantId)).orderBy(desc(whatsappSessions.updatedAt)).limit(limit);
  if (!rows.length) return [];
  const since = new Date(ctx.now().getTime() - 60 * 86_400_000);
  const msgs = await ctx.db.select().from(whatsappMessages).where(and(eq(whatsappMessages.merchantId, merchantId), inArray(whatsappMessages.sessionId, rows.map((r) => r.id)), gte(whatsappMessages.createdAt, since))).orderBy(desc(whatsappMessages.createdAt)).limit(3000);
  const last = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) if (!last.has(m.sessionId)) last.set(m.sessionId, m);
  const userIds = rows.map((r) => r.userId).filter((x): x is string => !!x);
  const names = new Map<string, string | null>();
  if (userIds.length) for (const u of await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))) names.set(u.id, u.name);
  const out = rows.map((s) => {
    const lm = last.get(s.id);
    return { ...sessionDto(s, ctx.now()), name: s.userId ? (names.get(s.userId) ?? null) : null, preview: lm ? previewOf(lm) : null, lastMessageAt: lm?.createdAt.toISOString() ?? null, takenOver: !!s.takenOverAt };
  });
  return out.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || 0);
}

export async function messagesFor(ctx: AppContext, merchant: Merchant, sessionId: string): Promise<restaurantApi.ChatMessagesResponse> {
  const s = await loadSession(ctx, merchant.id, sessionId);
  const rows = await ctx.db.select().from(whatsappMessages).where(eq(whatsappMessages.sessionId, s.id)).orderBy(desc(whatsappMessages.createdAt)).limit(200);
  return {
    sessionId: s.id,
    phone: s.phone,
    language: s.language,
    takenOver: !!s.takenOverAt,
    windowOpenUntil: windowOpen(s, ctx.now()) ? (windowOpenUntil(s)?.toISOString() ?? null) : null,
    items: rows.reverse().map((m) => ({
      id: m.id,
      direction: m.direction === "in" ? "in" : "out",
      kind: m.kind === "template" || m.kind === "order_summary" ? m.kind : "text",
      body: m.body,
      sender: m.direction === "in" ? "guest" : m.sender === "staff" ? "staff" : m.sender === "assistant" ? "assistant" : "system",
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** A person at the shop replies. Free-form text works for 24 hours after the guest's last message; after that a template is needed. */
export async function sendFromStaff(ctx: AppContext, staff: StaffContext, sessionId: string, text: string): Promise<restaurantApi.ChatMessageDto> {
  const s = await loadSession(ctx, staff.merchant.id, sessionId);
  if (s.state === "opted_out") throw new HttpError(409, "opted_out", "This guest asked us to stop messaging them on WhatsApp.");
  if (!windowOpen(s, ctx.now())) throw new HttpError(409, "window_closed", "Free-form replies are only allowed for 24 hours after the guest's last message. Send an approved template instead.");
  const r = await sendWhatsApp(ctx, staff.merchant, s.phone, { text, sender: "staff" }, s);
  if (!r.sent) throw new HttpError(409, r.reason === "no_sender" ? "no_sender" : "send_failed", r.reason === "no_sender" ? "Connect your WhatsApp number in Setup first." : "WhatsApp didn't accept that message. Try again.");
  // sendWhatsApp logged it without the author; stamp who wrote it.
  const [row] = await ctx.db.select().from(whatsappMessages).where(and(eq(whatsappMessages.sessionId, s.id), eq(whatsappMessages.direction, "out"))).orderBy(desc(whatsappMessages.createdAt)).limit(1);
  if (row) await ctx.db.update(whatsappMessages).set({ sentByUserId: staff.user.id }).where(eq(whatsappMessages.id, row.id));
  return { id: row?.id ?? "", direction: "out", kind: "text", body: text, sender: "staff", createdAt: (row?.createdAt ?? ctx.now()).toISOString() };
}

export async function takeOver(ctx: AppContext, staff: StaffContext, sessionId: string): Promise<restaurantApi.ChatMessagesResponse> {
  const s = await loadSession(ctx, staff.merchant.id, sessionId);
  await ctx.db.update(whatsappSessions).set({ takenOverAt: ctx.now(), takenOverBy: staff.user.id, updatedAt: ctx.now() }).where(eq(whatsappSessions.id, s.id));
  return messagesFor(ctx, staff.merchant, s.id);
}

export async function release(ctx: AppContext, staff: StaffContext, sessionId: string): Promise<restaurantApi.ChatMessagesResponse> {
  const s = await loadSession(ctx, staff.merchant.id, sessionId);
  await ctx.db.update(whatsappSessions).set({ takenOverAt: null, takenOverBy: null, updatedAt: ctx.now() }).where(eq(whatsappSessions.id, s.id));
  return messagesFor(ctx, staff.merchant, s.id);
}

export async function guestPanel(ctx: AppContext, merchant: Merchant, sessionId: string): Promise<restaurantApi.ChatGuestPanel> {
  const s = await loadSession(ctx, merchant.id, sessionId);
  let user: { id: string; name: string | null } | null = null;
  if (s.userId) user = (await ctx.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, s.userId)).limit(1))[0] ?? null;
  else user = (await ctx.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.phone, s.phone)).limit(1))[0] ?? null;
  const member = user ? (await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, user.id))).limit(1))[0] ?? null : null;
  const usual = user ? await usualFor(ctx.db, merchant.id, user.id, ctx.now()) : null;
  return {
    name: user?.name ?? null,
    phone: s.phone,
    memberId: member?.id ?? null,
    visits: member?.visitCount ?? 0,
    lastVisitAt: member?.lastVisitAt?.toISOString() ?? null,
    usual: usual?.items ?? [],
    points: member ? member.balance : null,
    notes: member?.notes ?? null,
    consent: { optedIn: canSendMarketing(s), optedInAt: s.marketingOptInAt?.toISOString() ?? null },
    language: s.language,
  };
}
