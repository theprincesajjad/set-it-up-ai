/**
 * The inbox (docs/business/people-side.md gap 2): one thread per customer per shop, plus read-only Instagram threads.
 *
 *  - The shop writes from the inbox, the profile or the calendar sheet. The message is stored, shows in the customer's app and on
 *    their web pass (in_app), and is delivered by the channel ladder (services/notifications.ts deliverByLadder): app push, web push,
 *    email, then a text inside the plan's monthly texts.
 *  - A customer replies in the app or on the pass, or by answering the text: inbound texts attach to their most recent thread
 *    (services/messaging.ts handleInboundSms calls attachInboundSms after STOP/HELP handling).
 *  - Instagram: a connector (inbox-connectors/*) imports DMs; the shop reads them here, opens them on Instagram to reply, and can
 *    turn one into a booking. There is no sending path. Disconnect deletes the token and every Instagram thread.
 *
 * A reply to a customer's message is transactional (no CASL consent needed); promos never go through the inbox.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { appointments, conversationMessages, conversations, instagramConnections, merchantMembers, merchants, users } from "@ll/db";
import { inboxApi, instagramThreadUrl, smsSegments, translator, normalizeLocale, type ConnectorThread } from "@ll/shared";

const { INBOX_MAX_BODY } = inboxApi;
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { decrypt, encrypt, randomToken } from "../lib/crypto.js";
import { deliverByLadder } from "./notifications.js";
import { signOAuthState, verifyOAuthState } from "./integrations.js";
import { connectorFor, instagramMode } from "./inbox-connectors/index.js";
import { writeAudit } from "./admin-audit.js";

type Conversation = typeof conversations.$inferSelect;
type Message = typeof conversationMessages.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
async function lastMessages(ctx: AppContext, ids: string[]): Promise<Map<string, Message>> {
  if (!ids.length) return new Map();
  const rows = await ctx.db
    .selectDistinctOn([conversationMessages.conversationId])
    .from(conversationMessages)
    .where(inArray(conversationMessages.conversationId, ids))
    .orderBy(conversationMessages.conversationId, desc(conversationMessages.createdAt), desc(conversationMessages.id));
  return new Map(rows.map((r) => [r.conversationId, r]));
}

async function conversationDtos(ctx: AppContext, merchantId: string, rows: Conversation[]): Promise<inboxApi.ConversationDto[]> {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))];
  const [people, members, last] = await Promise.all([
    userIds.length ? ctx.db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    userIds.length ? ctx.db.select({ id: merchantMembers.id, userId: merchantMembers.userId }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), inArray(merchantMembers.userId, userIds))) : Promise.resolve([]),
    lastMessages(ctx, rows.map((r) => r.id)),
  ]);
  return rows.map((r): inboxApi.ConversationDto => {
    const p = people.find((x) => x.id === r.userId);
    const m = last.get(r.id);
    const ig = r.channel === "instagram";
    const name = p?.name?.trim() || r.displayName?.trim() || (r.handle ? `@${r.handle}` : p?.phone ? `Client ${p.phone.slice(-4)}` : "Client");
    return {
      id: r.id,
      channel: r.channel as inboxApi.InboxChannel,
      memberId: members.find((x) => x.userId === r.userId)?.id ?? null,
      userId: r.userId,
      displayName: name,
      handle: r.handle,
      lastMessage: m ? { body: m.body.slice(0, 200), direction: m.direction as "in" | "out", at: m.createdAt.toISOString() } : null,
      lastMessageAt: iso(r.lastMessageAt),
      unread: r.unread,
      readOnly: ig,
      externalUrl: ig ? instagramThreadUrl(r.handle) : null,
    };
  });
}

function messageDto(m: Message, names: Map<string, string>): inboxApi.ThreadMessageDto {
  return {
    id: m.id,
    direction: m.direction as "in" | "out",
    body: m.body,
    kind: m.kind as inboxApi.ThreadMessageDto["kind"],
    channel: (m.channel as inboxApi.DeliveryChannel | null) ?? null,
    sentByName: m.sentByUserId ? (names.get(m.sentByUserId) ?? null) : null,
    createdAt: m.createdAt.toISOString(),
  };
}

async function staffNames(ctx: AppContext, msgs: Message[]): Promise<Map<string, string>> {
  const ids = [...new Set(msgs.map((m) => m.sentByUserId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name?.trim() || "Staff"]));
}

async function loadConversation(ctx: AppContext, merchantId: string, id: string): Promise<Conversation> {
  if (!UUID.test(id)) throw notFound("Conversation");
  const [c] = await ctx.db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.merchantId, merchantId))).limit(1);
  if (!c) throw notFound("Conversation");
  return c;
}

// ---------------------------------------------------------------------------
// Threads (shop side)
// ---------------------------------------------------------------------------
/** The customer's thread at this shop, created on first use. */
export async function ensureConversation(ctx: AppContext, merchantId: string, userId: string, channel: inboxApi.InboxChannel = "in_app"): Promise<Conversation> {
  const [found] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.merchantId, merchantId), eq(conversations.userId, userId), sql`${conversations.channel} <> 'instagram'`))
    .limit(1);
  if (found) return found;
  const [row] = await ctx.db.insert(conversations).values({ merchantId, userId, channel, createdAt: ctx.now(), updatedAt: ctx.now() }).onConflictDoNothing().returning();
  if (row) return row;
  return ensureConversation(ctx, merchantId, userId, channel);
}

export async function listInbox(ctx: AppContext, merchant: Merchant, q: inboxApi.ListInboxQuery): Promise<inboxApi.InboxResponse> {
  const where = [eq(conversations.merchantId, merchant.id), isNotNull(conversations.lastMessageAt)];
  if (q.channel !== "all") where.push(eq(conversations.channel, q.channel));
  if (q.unread === "true") where.push(gt(conversations.unread, 0));
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(
      sql`(${conversations.displayName} ilike ${like} or ${conversations.handle} ilike ${like} or exists (select 1 from users u where u.id = ${conversations.userId} and u.name ilike ${like}) or exists (select 1 from conversation_messages cm where cm.conversation_id = ${conversations.id} and cm.body ilike ${like}))`,
    );
  }
  const rows = await ctx.db.select().from(conversations).where(and(...where)).orderBy(desc(conversations.lastMessageAt)).limit(q.limit);
  const [tot] = await ctx.db.select({ n: sql<number>`coalesce(sum(${conversations.unread}), 0)::int` }).from(conversations).where(eq(conversations.merchantId, merchant.id));
  return { items: await conversationDtos(ctx, merchant.id, rows), unreadTotal: Number(tot?.n ?? 0), instagram: await instagramStatus(ctx, merchant.id) };
}

/** Open (or create) the thread with a customer of this shop, from the profile or the calendar. */
export async function startConversation(ctx: AppContext, merchant: Merchant, who: { memberId: string } | { userId: string }): Promise<inboxApi.ConversationDto> {
  const by = "memberId" in who ? eq(merchantMembers.id, who.memberId) : eq(merchantMembers.userId, who.userId);
  const [m] = await ctx.db.select({ userId: merchantMembers.userId }).from(merchantMembers).where(and(by, eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  const c = await ensureConversation(ctx, merchant.id, m.userId);
  return (await conversationDtos(ctx, merchant.id, [c]))[0]!;
}

/** Which rung the next message would use (a quick read: no sending). */
async function replyChannel(ctx: AppContext, merchantId: string, c: Conversation): Promise<inboxApi.DeliveryChannel | null> {
  if (!c.userId || c.channel === "instagram") return null;
  const { pushTokens, webPushSubscriptions } = await import("@ll/db");
  const [u] = await ctx.db.select({ email: users.email, phone: users.phone }).from(users).where(eq(users.id, c.userId)).limit(1);
  const [mem] = await ctx.db.select({ pref: merchantMembers.channelPref }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, c.userId))).limit(1);
  const [push] = await ctx.db.select({ id: pushTokens.id }).from(pushTokens).where(eq(pushTokens.userId, c.userId)).limit(1);
  const [web] = await ctx.db.select({ id: webPushSubscriptions.id }).from(webPushSubscriptions).where(eq(webPushSubscriptions.userId, c.userId)).limit(1);
  const { rungsFor } = await import("@ll/shared");
  for (const r of rungsFor((mem?.pref ?? "best") as inboxApi.ChannelPref)) {
    if (r === "push" && push) return "push";
    if (r === "web_push" && web) return "web_push";
    if (r === "email" && u?.email) return "email";
    if (r === "sms" && u?.phone) return "sms";
  }
  return "in_app";
}

export async function getThread(ctx: AppContext, merchant: Merchant, id: string): Promise<inboxApi.ThreadResponse> {
  const c = await loadConversation(ctx, merchant.id, id);
  if (c.unread) await ctx.db.update(conversations).set({ unread: 0, updatedAt: ctx.now() }).where(eq(conversations.id, c.id));
  const msgs = await ctx.db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, c.id)).orderBy(conversationMessages.createdAt, conversationMessages.id).limit(500);
  const names = await staffNames(ctx, msgs);
  let nextVisit: inboxApi.ThreadResponse["nextVisit"] = null;
  if (c.userId) {
    const [a] = await ctx.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.merchantId, merchant.id), eq(appointments.userId, c.userId), eq(appointments.status, "booked"), gt(appointments.startsAt, ctx.now())))
      .orderBy(appointments.startsAt)
      .limit(1);
    if (a) nextVisit = { appointmentId: a.id, startsAt: a.startsAt.toISOString(), services: a.items.map((i) => i.name).join(", ") };
  }
  return { conversation: (await conversationDtos(ctx, merchant.id, [{ ...c, unread: 0 }]))[0]!, messages: msgs.map((m) => messageDto(m, names)), nextVisit, replyChannel: await replyChannel(ctx, merchant.id, c) };
}

/** The shop writes in a thread: store it, then deliver it by the ladder. Instagram threads are read-only. */
export async function sendShopMessage(ctx: AppContext, staff: StaffContext, id: string, body: inboxApi.SendInboxMessageBody): Promise<inboxApi.SendInboxMessageResponse> {
  const merchant = staff.merchant;
  const c = await loadConversation(ctx, merchant.id, id);
  if (c.channel === "instagram") throw new HttpError(409, "read_only", "Instagram messages are read-only here. Reply on Instagram.");
  if (!c.userId) throw conflict("This conversation has no customer to write to.");
  const text = body.body.trim().slice(0, INBOX_MAX_BODY);
  const now = ctx.now();
  const [u] = await ctx.db.select({ locale: users.locale }).from(users).where(eq(users.id, c.userId)).limit(1);
  const [mem] = await ctx.db.select({ locale: merchantMembers.locale }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, c.userId))).limit(1);
  const t = translator(normalizeLocale(mem?.locale ?? u?.locale) ?? "en");
  const textBody = `${merchant.name}: ${text} ${t("bk.msg.textStop")}`;
  const sent = await deliverByLadder(ctx, {
    userId: c.userId,
    merchantId: merchant.id,
    type: "shop_message",
    title: t("inbox.n.title", { shop: merchant.name }),
    body: text,
    textBody,
    textCredits: smsSegments(textBody),
    emailBody: `${text}\n\n${t("inbox.n.emailFooter", { link: `${ctx.config.publicWebUrl}/me/messages` })}`,
    // The app opens its inbox (/notifications), where the thread is; the web pass opens /me/messages/<id> (url below).
    data: { type: "shop_message", conversationId: c.id, screen: "inbox", url: null },
    url: `/me/messages/${c.id}`,
  });
  const channel: inboxApi.DeliveryChannel = sent.rung === "in_app" ? "in_app" : sent.rung === "web_push" ? "web_push" : (sent.rung as inboxApi.DeliveryChannel);
  const [m] = await ctx.db
    .insert(conversationMessages)
    .values({ conversationId: c.id, direction: "out", body: text, kind: "text", channel, sentByUserId: staff.user.id, providerMessageId: sent.notificationId, createdAt: now })
    .returning();
  await ctx.db.update(conversations).set({ lastMessageAt: now, updatedAt: now, ...(channel === "sms" ? { channel: "sms" } : {}) }).where(eq(conversations.id, c.id));
  return { message: messageDto(m!, await staffNames(ctx, [m!])), deliveredBy: [channel], textCapReached: sent.textCapReached };
}

export async function bookingPrefill(ctx: AppContext, merchant: Merchant, id: string): Promise<inboxApi.BookingPrefill> {
  const c = await loadConversation(ctx, merchant.id, id);
  const [last] = await ctx.db
    .select()
    .from(conversationMessages)
    .where(and(eq(conversationMessages.conversationId, c.id), eq(conversationMessages.direction, "in")))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(1);
  const [u] = c.userId ? await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, c.userId)).limit(1) : [];
  const ig = c.channel === "instagram";
  const handle = c.handle ? `@${c.handle.replace(/^@/, "")}` : null;
  const note = last ? (ig && handle ? `${handle} on Instagram: ${last.body}` : last.body).slice(0, 1000) : null;
  return {
    conversationId: c.id,
    userId: c.userId,
    customerName: u?.name?.trim() || c.displayName || handle,
    handle,
    clientNote: note,
    threadPath: `/m/${merchant.id}/inbox?c=${c.id}`,
    externalUrl: ig ? instagramThreadUrl(c.handle) : null,
    source: ig ? "instagram" : "staff",
  };
}

/** After a booking made from a thread: a system line in the thread, so the conversation shows what came of it. */
export async function noteBookingInThread(ctx: AppContext, merchantId: string, conversationId: string, line: string): Promise<void> {
  const [c] = await ctx.db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.merchantId, merchantId))).limit(1);
  if (!c) return;
  await ctx.db.insert(conversationMessages).values({ conversationId, direction: "out", body: line, kind: "booking", channel: null, createdAt: ctx.now() });
}

// ---------------------------------------------------------------------------
// Customer side (the app and the web pass)
// ---------------------------------------------------------------------------
async function myThreadDtos(ctx: AppContext, userId: string, rows: Conversation[]): Promise<inboxApi.MyThreadDto[]> {
  if (!rows.length) return [];
  const ms = await ctx.db.select().from(merchants).where(inArray(merchants.id, [...new Set(rows.map((r) => r.merchantId))]));
  const last = await lastMessages(ctx, rows.map((r) => r.id));
  const unread = await ctx.db
    .select({ id: conversationMessages.conversationId, n: sql<number>`count(*)::int` })
    .from(conversationMessages)
    .where(and(inArray(conversationMessages.conversationId, rows.map((r) => r.id)), eq(conversationMessages.direction, "out"), isNull(conversationMessages.readAt), eq(conversationMessages.kind, "text")))
    .groupBy(conversationMessages.conversationId);
  return rows.map((r) => {
    const m = ms.find((x) => x.id === r.merchantId)!;
    const l = last.get(r.id);
    return {
      id: r.id,
      merchant: { id: m.id, name: m.name, slug: m.slug, logoUrl: m.logoUrl, brandColor: m.brandColor },
      lastMessage: l ? { body: l.body.slice(0, 200), direction: l.direction as "in" | "out", at: l.createdAt.toISOString() } : null,
      unread: Number(unread.find((u) => u.id === r.id)?.n ?? 0),
    };
  });
}

export async function listMyThreads(ctx: AppContext, userId: string): Promise<inboxApi.MyThreadsResponse> {
  const rows = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), sql`${conversations.channel} <> 'instagram'`, isNotNull(conversations.lastMessageAt)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);
  const items = await myThreadDtos(ctx, userId, rows);
  return { items, unreadTotal: items.reduce((n, x) => n + x.unread, 0) };
}

async function loadMine(ctx: AppContext, userId: string, id: string): Promise<Conversation> {
  if (!UUID.test(id)) throw notFound("Conversation");
  const [c] = await ctx.db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId), sql`${conversations.channel} <> 'instagram'`)).limit(1);
  if (!c) throw notFound("Conversation");
  return c;
}

export async function getMyThread(ctx: AppContext, userId: string, id: string): Promise<inboxApi.MyThreadResponse> {
  const c = await loadMine(ctx, userId, id);
  const msgs = await ctx.db.select().from(conversationMessages).where(and(eq(conversationMessages.conversationId, c.id), sql`${conversationMessages.kind} <> 'booking'`)).orderBy(conversationMessages.createdAt, conversationMessages.id).limit(500);
  await ctx.db.update(conversationMessages).set({ readAt: ctx.now() }).where(and(eq(conversationMessages.conversationId, c.id), eq(conversationMessages.direction, "out"), isNull(conversationMessages.readAt)));
  const names = await staffNames(ctx, msgs);
  const [thread] = await myThreadDtos(ctx, userId, [c]);
  return { thread: { ...thread!, unread: 0 }, messages: msgs.map((m) => messageDto(m, names)) };
}

async function addInbound(ctx: AppContext, c: Conversation, body: string, channel: inboxApi.DeliveryChannel): Promise<Message> {
  const now = ctx.now();
  const [m] = await ctx.db.insert(conversationMessages).values({ conversationId: c.id, direction: "in", body: body.slice(0, INBOX_MAX_BODY), kind: "text", channel, createdAt: now }).returning();
  await ctx.db.update(conversations).set({ lastMessageAt: now, unread: sql`${conversations.unread} + 1`, updatedAt: now }).where(eq(conversations.id, c.id));
  return m!;
}

export async function replyMine(ctx: AppContext, userId: string, id: string, body: inboxApi.SendInboxMessageBody): Promise<inboxApi.ThreadMessageDto> {
  const c = await loadMine(ctx, userId, id);
  return messageDto(await addInbound(ctx, c, body.body.trim(), "in_app"), new Map());
}

/**
 * An inbound text that is not STOP, START or HELP: it lands in the sender's thread with the shop that texted them last (or, failing
 * that, the shop where they have their next or latest appointment). Returns the thread, or null when nobody matches.
 */
export async function attachInboundSms(ctx: AppContext, fromPhone: string, body: string): Promise<string | null> {
  const text = body.trim();
  if (!text) return null;
  const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, fromPhone)).limit(1);
  if (!u) return null;
  // The thread the last text from a shop went out on.
  const [bySms] = await ctx.db
    .select({ c: conversations })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(and(eq(conversations.userId, u.id), eq(conversationMessages.direction, "out"), eq(conversationMessages.channel, "sms")))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(1);
  let c: Conversation | null = bySms?.c ?? null;
  if (!c) {
    // A reminder text (not a thread message): the shop of their nearest appointment.
    const { messageDeliveries } = await import("@ll/db");
    const [d] = await ctx.db
      .select({ merchantId: messageDeliveries.merchantId })
      .from(messageDeliveries)
      .where(and(eq(messageDeliveries.userId, u.id), eq(messageDeliveries.channel, "sms"), isNotNull(messageDeliveries.merchantId), eq(messageDeliveries.status, "sent")))
      .orderBy(desc(messageDeliveries.createdAt))
      .limit(1);
    if (d?.merchantId) c = await ensureConversation(ctx, d.merchantId, u.id, "sms");
  }
  if (!c) return null;
  await addInbound(ctx, c, text, "sms");
  if (c.channel !== "sms") await ctx.db.update(conversations).set({ channel: "sms" }).where(eq(conversations.id, c.id));
  return c.id;
}

// ---------------------------------------------------------------------------
// Instagram (read-only)
// ---------------------------------------------------------------------------
async function liveConnection(ctx: AppContext, merchantId: string) {
  const [row] = await ctx.db
    .select()
    .from(instagramConnections)
    .where(and(eq(instagramConnections.merchantId, merchantId), isNull(instagramConnections.disconnectedAt)))
    .orderBy(desc(instagramConnections.connectedAt))
    .limit(1);
  return row ?? null;
}

export async function instagramStatus(ctx: AppContext, merchantId: string): Promise<inboxApi.InstagramStatus> {
  const mode = instagramMode();
  const c = mode === "off" ? null : await liveConnection(ctx, merchantId);
  return { mode, connected: !!c, username: c?.username ?? null, connectedAt: iso(c?.connectedAt) };
}

/** Upsert imported threads and their messages (idempotent on the provider's ids). Returns how many threads got something new. */
export async function importThreads(ctx: AppContext, merchantId: string, threads: ConnectorThread[]): Promise<number> {
  let changed = 0;
  for (const t of threads) {
    if (!t.externalUserId) continue;
    const now = ctx.now();
    const [existing] = await ctx.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.merchantId, merchantId), eq(conversations.channel, "instagram"), eq(conversations.externalId, t.externalUserId)))
      .limit(1);
    const conv =
      existing ??
      (
        await ctx.db
          .insert(conversations)
          .values({ merchantId, channel: "instagram", externalId: t.externalUserId, instagramThreadId: t.threadId, handle: t.handle?.replace(/^@/, "") ?? null, displayName: t.displayName, createdAt: now, updatedAt: now })
          .returning()
      )[0]!;
    if (existing && (t.handle || t.displayName)) await ctx.db.update(conversations).set({ handle: t.handle?.replace(/^@/, "") ?? existing.handle, displayName: t.displayName ?? existing.displayName, updatedAt: now }).where(eq(conversations.id, conv.id));
    let added = 0;
    let newIn = 0;
    let latest = conv.lastMessageAt?.getTime() ?? 0;
    for (const m of t.messages) {
      const at = new Date(m.at);
      const [row] = await ctx.db
        .insert(conversationMessages)
        .values({ conversationId: conv.id, direction: m.direction, body: m.text.slice(0, 2000), kind: "text", channel: "instagram", externalMessageId: m.externalId, createdAt: at })
        .onConflictDoNothing()
        .returning({ id: conversationMessages.id });
      if (row) {
        added++;
        if (m.direction === "in") newIn++;
        latest = Math.max(latest, at.getTime());
      }
    }
    if (added) {
      changed++;
      await ctx.db
        .update(conversations)
        .set({ lastMessageAt: new Date(latest), unread: sql`${conversations.unread} + ${newIn}`, updatedAt: now })
        .where(eq(conversations.id, conv.id));
    }
  }
  return changed;
}

export async function connectInstagram(ctx: AppContext, staff: StaffContext): Promise<inboxApi.InstagramConnectResponse> {
  const merchant = staff.merchant;
  const connector = connectorFor("instagram");
  if (!connector) throw new HttpError(409, "instagram_off", "Instagram messages are coming soon.");
  const state = signOAuthState(ctx, { merchantId: merchant.id, userId: staff.user.id, provider: "instagram", nonce: randomToken(8) });
  const start = await connector.connect(ctx, merchant, { userId: staff.user.id, state });
  let imported = 0;
  if (start.account) imported = await saveConnection(ctx, merchant.id, staff.user.id, connector.mode, start.account);
  return { authorizeUrl: start.authorizeUrl, status: await instagramStatus(ctx, merchant.id), imported };
}

async function saveConnection(ctx: AppContext, merchantId: string, actorUserId: string, provider: string, account: { externalAccountId: string; username: string | null; token: string | null }): Promise<number> {
  const connector = connectorFor("instagram")!;
  await ctx.db.update(instagramConnections).set({ disconnectedAt: ctx.now(), tokenEncrypted: null }).where(and(eq(instagramConnections.merchantId, merchantId), isNull(instagramConnections.disconnectedAt)));
  await ctx.db.insert(instagramConnections).values({
    merchantId,
    igUserId: account.externalAccountId,
    username: account.username,
    tokenEncrypted: account.token ? encrypt(account.token, ctx.config.encryptionKey) : null,
    provider,
    connectedAt: ctx.now(),
  });
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "instagram.connected", entity: "merchant", entityId: merchantId, data: { username: account.username, provider } });
  const threads = await connector.importRecent(ctx, account).catch((err) => {
    if (ctx.config.env !== "test") console.error("[instagram] import failed", err);
    return [];
  });
  return importThreads(ctx, merchantId, threads);
}

/** OAuth callback (live connector): checks the signed state, stores the token, imports the latest threads. */
export async function completeInstagramOAuth(ctx: AppContext, code: string, state: string): Promise<{ merchantId: string; imported: number }> {
  const s = verifyOAuthState(ctx, state, "instagram");
  const connector = connectorFor("instagram");
  if (!connector) throw new HttpError(409, "instagram_off", "Instagram messages are coming soon.");
  const account = await connector.completeOAuth(ctx, code);
  return { merchantId: s.merchantId, imported: await saveConnection(ctx, s.merchantId, s.userId, connector.mode, account) };
}

/** Delete every Instagram thread and message for a shop. */
export async function purgeInstagram(ctx: AppContext, merchantId: string): Promise<number> {
  const rows = await ctx.db.delete(conversations).where(and(eq(conversations.merchantId, merchantId), eq(conversations.channel, "instagram"))).returning({ id: conversations.id });
  return rows.length;
}

export async function disconnectInstagram(ctx: AppContext, staff: StaffContext): Promise<inboxApi.InstagramStatus> {
  const merchantId = staff.merchant.id;
  const conn = await liveConnection(ctx, merchantId);
  const connector = connectorFor("instagram");
  if (conn && connector) {
    const token = conn.tokenEncrypted ? decrypt(conn.tokenEncrypted, ctx.config.encryptionKey) : null;
    await connector.disconnect(ctx, { externalAccountId: conn.igUserId, username: conn.username, token }).catch(() => undefined);
  }
  await ctx.db.update(instagramConnections).set({ disconnectedAt: ctx.now(), tokenEncrypted: null }).where(and(eq(instagramConnections.merchantId, merchantId), isNull(instagramConnections.disconnectedAt)));
  const purged = await purgeInstagram(ctx, merchantId);
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId, action: "instagram.disconnected", entity: "merchant", entityId: merchantId, data: { purged } });
  return instagramStatus(ctx, merchantId);
}

/** Messages webhook: verify, find the shop by its connected account, import. Unknown accounts are ignored (200, nothing stored). */
export async function instagramWebhook(ctx: AppContext, headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<{ imported: number }> {
  const connector = connectorFor("instagram");
  if (!connector) throw new HttpError(404, "not_found", "Not found");
  const r = await connector.handleWebhook(ctx, headers, rawBody);
  if (!r.externalAccountId) return { imported: 0 };
  const [conn] = await ctx.db.select().from(instagramConnections).where(and(eq(instagramConnections.igUserId, r.externalAccountId), isNull(instagramConnections.disconnectedAt))).limit(1);
  if (!conn) return { imported: 0 };
  return { imported: await importThreads(ctx, conn.merchantId, r.threads) };
}

/**
 * Meta's data-deletion callback: a person asked Instagram to delete what this app has about them. Deletes every thread with that
 * Instagram user, at every shop. `signed_request` is verified with the app secret (the stub accepts { user_id } in dev).
 */
export async function instagramDataDeletion(ctx: AppContext, signedRequest: string | undefined): Promise<{ url: string; confirmation_code: string }> {
  let igUserId: string | null = null;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (signedRequest && signedRequest.includes(".")) {
    const [sig, payload] = signedRequest.split(".") as [string, string];
    if (!secret) throw new HttpError(503, "instagram_not_configured", "Instagram isn't set up on this server yet.");
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const want = createHmac("sha256", secret).update(payload).digest();
    const got = Buffer.from(sig, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw badRequest("Bad signed request");
    igUserId = String((JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string | number }).user_id ?? "") || null;
  } else if (instagramMode() === "stub" && signedRequest) {
    igUserId = signedRequest;
  }
  if (!igUserId) throw badRequest("Missing signed request");
  const rows = await ctx.db.delete(conversations).where(and(eq(conversations.channel, "instagram"), eq(conversations.externalId, igUserId))).returning({ id: conversations.id });
  const code = randomToken(8);
  await writeAudit(ctx.db, { actorUserId: null, action: "instagram.data_deletion", entity: "instagram_user", data: { threads: rows.length, code } });
  return { url: `${ctx.config.publicWebUrl}/legal/privacy?deletion=${code}`, confirmation_code: code };
}
