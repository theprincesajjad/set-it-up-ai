/**
 * WhatsApp for restaurants (Cloud API, providers/whatsapp.ts).
 *
 *  - Notifications (restaurant.whatsapp_notifications, Starter): order confirmed / ready,
 *    tiffin delivery, catering quote, review request. Hooked into the transactional
 *    notification path through `notifyListeners` (commerceShared.ts), so the
 *    order/tiffin/catering code needs no WhatsApp knowledge.
 *  - Ordering (restaurant.whatsapp_ordering, Growth): inbound webhook -> whatsapp_sessions ->
 *    conversation state machine (whatsapp-conversation.ts) -> order through the order
 *    service with channel "whatsapp" -> pay link (/pay/order/<id>?t=<token>).
 *  - Marketing (restaurant.whatsapp_marketing, Growth): broadcast of an approved template to
 *    members with CASL consent AND a WhatsApp opt-in, not muted.
 *
 * Consent (same idea as SMS, but per channel):
 *  - whatsapp_sessions.marketingOptInAt = the customer opted in to WhatsApp from this shop
 *    (replied START, ticked a box, or the shop recorded it). STOP clears it and sets state "opted_out".
 *  - Order updates need: not opted out AND (opted in OR the customer has messaged the shop).
 *  - Broadcasts need: opted in AND merchant_members.marketingConsentAt AND not muted.
 *
 * Window rule: free-form text only within 24 hours of the customer's last inbound
 * message (lastInboundAt); otherwise an approved template. Template sends are
 * business-initiated and count against merchants.whatsappCreditsUsed; replies inside the
 * window do not. Allowance = RESTAURANT_PLANS[tier].whatsappPerMonth + whatsappCreditsExtra
 * (add-on packs); sends stop at the allowance.
 *
 * Message delivery rows: message_deliveries.channel has no "whatsapp" value yet, so sends are
 * counted in the credits and summarised in audit_logs; the fake provider records them in tests.
 */
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { auditLogs, catalogItems, integrations, merchantCategories, merchants, orderItems, orders, users, webhookEvents, whatsappMessages, whatsappSessions } from "@ll/db";
import { ADD_ONS, BRAND, RESTAURANT_PLANS, whatsappApi, type restaurantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { sha256 } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getWhatsApp, parseInboundWebhook, type InboundWhatsAppMessage } from "../providers/whatsapp.js";
import { writeAudit } from "./admin-audit.js";
import { findOrCreateUserByPhone, normalizePhone, orderPayUrl, placeChannelOrder, verifyOrderPayToken } from "./channel-orders.js";
import { notifyListeners, paymentsReady, type NotifyArgs } from "./commerceShared.js";
import { getIntegration } from "./integrations.js";
import { isFeatureOn, requireFeature } from "./features.js";
import { personalize, resolveAudience, segmentCondition } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { isOptedOut, recordPhoneOptOut, recordPhoneResubscribe } from "./opt-out.js";
import { retrieveConnectPayment } from "./payments.js";
import {
  converse,
  detectLanguage,
  orderPlacedText,
  strings,
  LANGS,
  type MenuView,
  type MenuViewItem,
  type WaLang,
} from "./whatsapp-conversation.js";

type Merchant = typeof merchants.$inferSelect;
type Session = typeof whatsappSessions.$inferSelect;

export const WINDOW_MS = 24 * 60 * 60_000;
const asLang = (l: string | null | undefined): WaLang => ((LANGS as readonly string[]).includes(l ?? "") ? (l as WaLang) : "en");

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------
export function planAllowance(m: Pick<Merchant, "restaurantTier">): number {
  return m.restaurantTier ? RESTAURANT_PLANS[m.restaurantTier].whatsappPerMonth : 0;
}

export function whatsappUsage(m: Pick<Merchant, "restaurantTier" | "whatsappCreditsUsed" | "whatsappCreditsExtra">): whatsappApi.WhatsappUsage {
  const plan = planAllowance(m);
  const allowance = plan + m.whatsappCreditsExtra;
  return { used: m.whatsappCreditsUsed, planAllowance: plan, extra: m.whatsappCreditsExtra, allowance, remaining: Math.max(0, allowance - m.whatsappCreditsUsed) };
}

/** Atomically reserve credits against the allowance (plan + extra packs). False when it would exceed it. */
export async function reserveCredits(ctx: AppContext, merchant: Pick<Merchant, "id" | "restaurantTier">, n: number): Promise<boolean> {
  if (n <= 0) return true;
  const plan = planAllowance(merchant);
  const r = await ctx.db
    .update(merchants)
    .set({ whatsappCreditsUsed: sql`${merchants.whatsappCreditsUsed} + ${n}` })
    .where(and(eq(merchants.id, merchant.id), sql`${merchants.whatsappCreditsUsed} + ${n} <= ${plan} + ${merchants.whatsappCreditsExtra}`))
    .returning({ used: merchants.whatsappCreditsUsed });
  return r.length > 0;
}

export async function refundCredits(ctx: AppContext, merchantId: string, n: number): Promise<void> {
  if (n <= 0) return;
  await ctx.db.update(merchants).set({ whatsappCreditsUsed: sql`greatest(${merchants.whatsappCreditsUsed} - ${n}, 0)` }).where(eq(merchants.id, merchantId));
}

/**
 * Monthly reset (idempotent per month, Toronto). The plan allowance renews; extra pack messages
 * do not: whatever was used beyond the plan allowance is taken out of whatsapp_credits_extra.
 */
export async function resetWhatsappCreditsIfNewMonth(ctx: AppContext): Promise<boolean> {
  const period = new Intl.DateTimeFormat("en-CA", { timeZone: BRAND.defaultTimezone, year: "numeric", month: "2-digit" }).format(ctx.now()).slice(0, 7);
  const [done] = await ctx.db.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.action, "whatsapp_credits.reset"), sql`${auditLogs.data}->>'period' = ${period}`)).limit(1);
  if (done) return false;
  const planCase = sql`case ${merchants.restaurantTier}
    when 'starter' then ${RESTAURANT_PLANS.starter.whatsappPerMonth}
    when 'growth' then ${RESTAURANT_PLANS.growth.whatsappPerMonth}
    when 'pro' then ${RESTAURANT_PLANS.pro.whatsappPerMonth}
    else 0 end`;
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(merchants)
      .set({
        whatsappCreditsExtra: sql`greatest(${merchants.whatsappCreditsExtra} - greatest(${merchants.whatsappCreditsUsed} - ${planCase}, 0), 0)`,
        whatsappCreditsUsed: 0,
      })
      .where(sql`${merchants.whatsappCreditsUsed} <> 0`);
    await writeAudit(tx, { actorUserId: null, action: "whatsapp_credits.reset", entity: "merchants", data: { period } });
  });
  return true;
}

// ---------------------------------------------------------------------------
// Connection (integrations row, provider "whatsapp")
// ---------------------------------------------------------------------------
export interface Sender {
  phoneNumberId: string;
  approvedTemplates: string[];
}

export async function senderFor(ctx: AppContext, merchant: Pick<Merchant, "id" | "whatsappNumber">): Promise<Sender | null> {
  const integ = await getIntegration(ctx.db, merchant.id, "whatsapp");
  if (integ?.status === "connected" && typeof integ.settings.phoneNumberId === "string") {
    const t = integ.settings.approvedTemplates;
    return { phoneNumberId: integ.settings.phoneNumberId, approvedTemplates: Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [] };
  }
  // Dev and tests run on the fake provider: a shop with a WhatsApp number set can send without a Meta connection.
  if (ctx.config.whatsapp.provider === "fake" && !ctx.providers.whatsapp?.name.startsWith("meta") && merchant.whatsappNumber) return { phoneNumberId: `fake:${merchant.whatsappNumber}`, approvedTemplates: [] };
  return null;
}

export const webhookUrl = (ctx: AppContext) => `${ctx.config.publicApiUrl.replace(/\/$/, "")}/v1/webhooks/whatsapp`;

export async function getSettings(ctx: AppContext, merchant: Merchant): Promise<whatsappApi.WhatsappSettings> {
  const integ = await getIntegration(ctx.db, merchant.id, "whatsapp");
  const fresh = (await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1))[0] ?? merchant;
  const [notifications, ordering, marketing] = await Promise.all(
    (["restaurant.whatsapp_notifications", "restaurant.whatsapp_ordering", "restaurant.whatsapp_marketing"] as const).map((k) => isFeatureOn(ctx.db, merchant, k)),
  );
  const s = (integ?.settings ?? {}) as Record<string, unknown>;
  return {
    connected: integ?.status === "connected",
    phoneNumberId: typeof s.phoneNumberId === "string" ? s.phoneNumberId : null,
    displayNumber: fresh.whatsappNumber ?? (typeof s.displayNumber === "string" ? s.displayNumber : null),
    approvedTemplates: Array.isArray(s.approvedTemplates) ? (s.approvedTemplates as string[]) : [],
    usage: whatsappUsage(fresh),
    features: { notifications: !!notifications, ordering: !!ordering, marketing: !!marketing },
    webhookUrl: webhookUrl(ctx),
    requiredTemplates: whatsappApi.WA_NOTIFICATION_KINDS.map((kind) => ({ kind, name: whatsappApi.WA_TEMPLATE_NAMES[kind].name, example: whatsappApi.WA_TEMPLATE_NAMES[kind].example })),
  };
}

export async function saveSettings(ctx: AppContext, merchant: Merchant, actorUserId: string, body: whatsappApi.WhatsappSettingsBody): Promise<whatsappApi.WhatsappSettings> {
  const b = whatsappApi.whatsappSettingsBody.parse(body);
  const [clash] = await ctx.db
    .select({ merchantId: integrations.merchantId })
    .from(integrations)
    .where(and(eq(integrations.provider, "whatsapp"), eq(integrations.externalAccountId, b.phoneNumberId)))
    .limit(1);
  if (clash && clash.merchantId !== merchant.id) throw conflict("That WhatsApp number is already connected to another shop");
  const settings = { phoneNumberId: b.phoneNumberId, displayNumber: b.displayNumber ?? null, approvedTemplates: b.approvedTemplates };
  const existing = await getIntegration(ctx.db, merchant.id, "whatsapp");
  if (existing) {
    await ctx.db.update(integrations).set({ status: "connected", externalAccountId: b.phoneNumberId, settings: { ...existing.settings, ...settings }, lastError: null, updatedAt: ctx.now() }).where(eq(integrations.id, existing.id));
  } else {
    await ctx.db.insert(integrations).values({ merchantId: merchant.id, provider: "whatsapp", status: "connected", externalAccountId: b.phoneNumberId, settings });
  }
  if (b.displayNumber) await ctx.db.update(merchants).set({ whatsappNumber: normalizePhone(b.displayNumber), updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "whatsapp.connected", entity: "integration", data: { phoneNumberId: b.phoneNumberId } });
  return getSettings(ctx, merchant);
}

export async function disconnect(ctx: AppContext, merchant: Merchant, actorUserId: string): Promise<void> {
  const existing = await getIntegration(ctx.db, merchant.id, "whatsapp");
  if (existing) await ctx.db.update(integrations).set({ status: "disconnected", updatedAt: ctx.now() }).where(eq(integrations.id, existing.id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "whatsapp.disconnected", entity: "integration" });
}

// ---------------------------------------------------------------------------
// Sessions and consent
// ---------------------------------------------------------------------------
export async function getSession(ctx: AppContext, merchantId: string, phone: string): Promise<Session | null> {
  const [s] = await ctx.db.select().from(whatsappSessions).where(and(eq(whatsappSessions.merchantId, merchantId), eq(whatsappSessions.phone, normalizePhone(phone)))).limit(1);
  return s ?? null;
}

async function upsertSession(ctx: AppContext, merchantId: string, phone: string, patch: Partial<typeof whatsappSessions.$inferInsert> = {}): Promise<{ session: Session; created: boolean }> {
  const p = normalizePhone(phone);
  const existing = await getSession(ctx, merchantId, p);
  if (existing) {
    if (!Object.keys(patch).length) return { session: existing, created: false };
    const [u] = await ctx.db.update(whatsappSessions).set({ ...patch, updatedAt: ctx.now() }).where(eq(whatsappSessions.id, existing.id)).returning();
    return { session: u!, created: false };
  }
  const [row] = await ctx.db.insert(whatsappSessions).values({ merchantId, phone: p, ...patch, createdAt: ctx.now(), updatedAt: ctx.now() }).onConflictDoNothing().returning();
  if (row) return { session: row, created: true };
  return { session: (await getSession(ctx, merchantId, p))!, created: false };
}

export const windowOpen = (s: Pick<Session, "lastInboundAt"> | null, now: Date): boolean => !!s?.lastInboundAt && now.getTime() - s.lastInboundAt.getTime() < WINDOW_MS;
export const windowOpenUntil = (s: Pick<Session, "lastInboundAt">): Date | null => (s.lastInboundAt ? new Date(s.lastInboundAt.getTime() + WINDOW_MS) : null);

/** Order updates and review requests: not opted out, and opted in or the customer has messaged the shop. */
export const canSendTransactional = (s: Session | null): boolean => !!s && s.state !== "opted_out" && (!!s.marketingOptInAt || !!s.lastInboundAt);
/** Broadcasts: an explicit WhatsApp opt-in that has not been withdrawn (CASL consent is checked separately). */
export const canSendMarketing = (s: Session | null): boolean => !!s && s.state !== "opted_out" && !!s.marketingOptInAt;

export async function recordOptIn(ctx: AppContext, merchant: Merchant, actorUserId: string | null, body: whatsappApi.OptInBody): Promise<whatsappApi.WhatsappConsent> {
  const b = whatsappApi.optInBody.parse(body);
  let phone = b.phone ? normalizePhone(b.phone) : null;
  let userId: string | null = b.userId ?? null;
  if (userId) {
    const [u] = await ctx.db.select({ phone: users.phone, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u || u.deletedAt) throw notFound("Customer");
    phone = phone ?? u.phone;
  } else if (phone) {
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    userId = u?.id ?? null;
  }
  if (!phone) throw badRequest("Give a phone number or a customer with a phone number");
  const now = ctx.now();
  const { session } = await upsertSession(ctx, merchant.id, phone, { marketingOptInAt: now, state: "browsing", userId, ...(b.language ? { language: b.language } : {}) });
  await writeAudit(ctx.db, { actorUserId: actorUserId ?? userId, merchantId: merchant.id, action: "whatsapp.opt_in", entity: "whatsapp_session", entityId: session.id, data: { source: b.source } });
  return { merchantId: merchant.id, phone, optedIn: true, optedInAt: now.toISOString() };
}

export async function recordOptOut(ctx: AppContext, merchant: Pick<Merchant, "id">, phone: string, source: string, actorUserId: string | null = null): Promise<whatsappApi.WhatsappConsent> {
  const p = normalizePhone(phone);
  const { session } = await upsertSession(ctx, merchant.id, p, { marketingOptInAt: null, state: "opted_out", cart: [] });
  // One STOP covers every shop: the number goes on the do-not-contact list (services/opt-out.ts).
  await recordPhoneOptOut(ctx, p, "whatsapp", source === "whatsapp_stop" ? "STOP" : null, "whatsapp_reply");
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "whatsapp.opt_out", entity: "whatsapp_session", entityId: session.id, data: { source } });
  return { merchantId: merchant.id, phone: p, optedIn: false, optedInAt: null };
}

/** Customer-facing consent switch for one shop (the signed-in customer's own phone). */
export async function setCustomerConsent(ctx: AppContext, userId: string, merchantId: string, body: { optIn: boolean; language?: WaLang }): Promise<whatsappApi.WhatsappConsent> {
  const [u] = await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.phone) throw badRequest("Add a phone number to your account first");
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant) throw notFound("Shop");
  if (!body.optIn) return recordOptOut(ctx, merchant, u.phone, "customer_app", userId);
  await recordPhoneResubscribe(ctx, u.phone, "whatsapp");
  return recordOptIn(ctx, merchant, userId, { phone: u.phone, userId, source: "form", language: body.language });
}

export async function getCustomerConsent(ctx: AppContext, userId: string, merchantId: string): Promise<whatsappApi.WhatsappConsent> {
  const [u] = await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  const s = u?.phone ? await getSession(ctx, merchantId, u.phone) : null;
  return { merchantId, phone: u?.phone ?? "", optedIn: canSendMarketing(s), optedInAt: s?.marketingOptInAt?.toISOString() ?? null };
}

export function sessionDto(s: Session, now: Date): whatsappApi.WhatsappSession {
  return {
    id: s.id,
    phone: s.phone,
    userId: s.userId,
    state: s.state,
    language: s.language,
    cartItems: s.cart.reduce((n, c) => n + c.quantity, 0),
    orderId: s.orderId,
    lastInboundAt: s.lastInboundAt?.toISOString() ?? null,
    windowOpenUntil: windowOpen(s, now) ? (windowOpenUntil(s)?.toISOString() ?? null) : null,
    optedIn: canSendMarketing(s),
  };
}

export async function listSessions(ctx: AppContext, merchantId: string, limit = 50): Promise<whatsappApi.WhatsappSession[]> {
  const rows = await ctx.db.select().from(whatsappSessions).where(eq(whatsappSessions.merchantId, merchantId)).orderBy(desc(whatsappSessions.updatedAt)).limit(limit);
  return rows.map((s) => sessionDto(s, ctx.now()));
}

// ---------------------------------------------------------------------------
// Chat log (the inbox reads these)
// ---------------------------------------------------------------------------
export async function recordChatMessage(
  ctx: AppContext,
  merchantId: string,
  session: Pick<Session, "id"> | null,
  m: { direction: "in" | "out"; kind: "text" | "template" | "order_summary"; body: string; sender?: string | null; sentByUserId?: string | null; providerMessageId?: string | null },
): Promise<void> {
  if (!session) return;
  try {
    await ctx.db.insert(whatsappMessages).values({ merchantId, sessionId: session.id, direction: m.direction, kind: m.kind, body: m.body, sender: m.sender ?? null, sentByUserId: m.sentByUserId ?? null, providerMessageId: m.providerMessageId ?? null, createdAt: ctx.now() });
  } catch (err) {
    // The log must never break a send.
    if (ctx.config.env !== "test") console.error("[whatsapp chat log]", err);
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
export interface Outgoing {
  /** Who is speaking, for the inbox: the ordering assistant, a person at the shop, or an automatic notification (default). */
  sender?: "assistant" | "staff" | "system";
  /** Free-form text, used inside the 24 hour window. */
  text?: string;
  /** The answer to the guest's own STOP or START: always sent, it is the confirmation they are waiting for. */
  confirmation?: boolean;
  /** Approved template, used outside the window (counts a credit). */
  template?: { name: string; params: string[] };
  language?: string;
}

export interface SendOutcome {
  sent: boolean;
  via?: "text" | "template";
  id?: string;
  reason?: "no_sender" | "outside_window" | "no_credits" | "send_failed" | "opted_out";
  error?: string;
}

/** Send to one phone, choosing free-form or template by the 24 hour window. Never throws. */
export async function sendWhatsApp(ctx: AppContext, merchant: Merchant, phone: string, msg: Outgoing, sessionHint?: Session | null): Promise<SendOutcome> {
  try {
    const sender = await senderFor(ctx, merchant);
    if (!sender) return { sent: false, reason: "no_sender" };
    const to = normalizePhone(phone);
    const session = sessionHint ?? (await getSession(ctx, merchant.id, to));
    // STOP is honoured per number across every shop (comm_opt_outs), and per shop on the chat itself.
    if (!msg.confirmation && (session?.state === "opted_out" || (await isOptedOut(ctx.db, to, "whatsapp")))) return { sent: false, reason: "opted_out" };
    const provider = getWhatsApp(ctx);
    if (msg.text && windowOpen(session, ctx.now())) {
      const r = await provider.sendText({ phoneNumberId: sender.phoneNumberId, to, body: msg.text });
      await recordChatMessage(ctx, merchant.id, session, { direction: "out", kind: "text", body: msg.text, sender: msg.sender ?? "system", providerMessageId: r.id });
      return { sent: true, via: "text", id: r.id };
    }
    if (!msg.template) return { sent: false, reason: "outside_window" };
    if (!(await reserveCredits(ctx, merchant, 1))) return { sent: false, reason: "no_credits" };
    try {
      const r = await provider.sendTemplate({ phoneNumberId: sender.phoneNumberId, to, template: msg.template.name, language: msg.language ?? session?.language ?? "en", params: msg.template.params });
      await recordChatMessage(ctx, merchant.id, session, { direction: "out", kind: "template", body: msg.text ?? `${msg.template.name}: ${msg.template.params.join(", ")}`, sender: msg.sender ?? "system", providerMessageId: r.id });
      return { sent: true, via: "template", id: r.id };
    } catch (err) {
      await refundCredits(ctx, merchant.id, 1);
      return { sent: false, reason: "send_failed", error: (err as Error).message };
    }
  } catch (err) {
    return { sent: false, reason: "send_failed", error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Notifications (order confirmed / ready, tiffin delivery, catering quote, review request)
// ---------------------------------------------------------------------------
export type NotificationKind = whatsappApi.WaNotificationKind;

export function renderTemplateText(kind: NotificationKind, params: string[]): string {
  return whatsappApi.WA_TEMPLATE_NAMES[kind].example.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

export interface WhatsappNotification {
  merchantId: string;
  userId: string;
  kind: NotificationKind;
  /** Values by template variable name (see WA_TEMPLATE_NAMES[kind].params). */
  vars: Record<string, string>;
}

export interface NotificationOutcome extends SendOutcome {
  skipped?: "feature_off" | "no_phone" | "no_consent" | "merchant_missing";
}

export async function sendWhatsAppNotification(ctx: AppContext, n: WhatsappNotification): Promise<NotificationOutcome> {
  try {
    const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, n.merchantId)).limit(1);
    if (!merchant) return { sent: false, skipped: "merchant_missing" };
    if (!(await isFeatureOn(ctx.db, merchant, "restaurant.whatsapp_notifications"))) return { sent: false, skipped: "feature_off" };
    const [user] = await ctx.db.select({ phone: users.phone, deletedAt: users.deletedAt, locale: users.locale }).from(users).where(eq(users.id, n.userId)).limit(1);
    if (!user?.phone || user.deletedAt) return { sent: false, skipped: "no_phone" };
    const session = await getSession(ctx, merchant.id, user.phone);
    if (!canSendTransactional(session)) return { sent: false, skipped: "no_consent" };
    const def = whatsappApi.WA_TEMPLATE_NAMES[n.kind];
    const params = def.params.map((p) => n.vars[p] ?? "");
    const language = asLang(session?.language ?? user.locale?.slice(0, 2));
    return await sendWhatsApp(ctx, merchant, user.phone, { text: renderTemplateText(n.kind, params), template: { name: def.name, params }, language }, session);
  } catch (err) {
    return { sent: false, reason: "send_failed", error: (err as Error).message };
  }
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Map a transactional notification (commerceShared.notifyCustomer) to a WhatsApp notification, if it is one of ours. */
export async function notificationFor(ctx: AppContext, a: NotifyArgs): Promise<WhatsappNotification | null> {
  const data = a.data ?? {};
  const type = data.type;
  const [m] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, a.merchantId)).limit(1);
  const merchant = m?.name ?? "";
  const base = { merchantId: a.merchantId, userId: a.userId };
  if (type === "order_status" && typeof data.orderId === "string" && (data.status === "accepted" || data.status === "ready")) {
    const [o] = await ctx.db.select({ number: orders.number, totalCents: orders.totalCents }).from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (!o) return null;
    return data.status === "ready"
      ? { ...base, kind: "order_ready", vars: { merchant, order_number: String(o.number) } }
      : { ...base, kind: "order_confirmed", vars: { merchant, order_number: String(o.number), total: money(o.totalCents) } };
  }
  if (type === "tiffin_delivery" || type === "tiffin_status") {
    const status = String(data.status ?? "").replace(/_/g, " ") || "on its way";
    return { ...base, kind: "tiffin_delivery", vars: { merchant, status: status === "out for delivery" ? "out for delivery" : status } };
  }
  if ((type === "quote_sent" || type === "catering_quote") && typeof data.cateringEventId === "string") {
    return { ...base, kind: "catering_quote", vars: { merchant, event: String(data.eventName ?? "your event"), link: String(data.url ?? "") } };
  }
  return null;
}

notifyListeners.push(async (ctx, args) => {
  const n = await notificationFor(ctx, args);
  if (n) await sendWhatsAppNotification(ctx, n);
});

// ---------------------------------------------------------------------------
// Ordering: menu view, inbound webhook, checkout
// ---------------------------------------------------------------------------
/** Orderable menu for chat: numbered, grouped by category. Pre-order-only items (pots) are not offered in chat. */
export async function buildMenu(ctx: AppContext, merchant: Merchant): Promise<MenuView> {
  const rows = await ctx.db
    .select({ item: catalogItems, category: merchantCategories.name })
    .from(catalogItems)
    .leftJoin(merchantCategories, eq(merchantCategories.id, catalogItems.categoryId))
    .where(and(eq(catalogItems.merchantId, merchant.id), eq(catalogItems.available, true), eq(catalogItems.orderable, true), eq(catalogItems.preorderOnly, false), or(isNull(catalogItems.soldOutUntil), lte(catalogItems.soldOutUntil, ctx.now()))));
  const sorted = rows.sort((a, b) => (a.category ?? "~").localeCompare(b.category ?? "~") || a.item.sortOrder - b.item.sortOrder || a.item.name.localeCompare(b.item.name));
  const items: MenuViewItem[] = sorted.map((r, i) => ({
    id: r.item.id,
    name: r.item.name,
    translations: r.item.translations,
    number: i + 1,
    priceCents: r.item.priceCents,
    category: r.category ?? "Menu",
  }));
  return { merchantName: merchant.name, items, cardPayments: await paymentsReady(ctx.db, merchant) };
}

async function merchantForInbound(ctx: AppContext, msg: InboundWhatsAppMessage): Promise<Merchant | null> {
  const [integ] = await ctx.db
    .select({ merchantId: integrations.merchantId })
    .from(integrations)
    .where(and(eq(integrations.provider, "whatsapp"), eq(integrations.externalAccountId, msg.phoneNumberId), eq(integrations.status, "connected")))
    .limit(1);
  let merchantId = integ?.merchantId;
  if (!merchantId && msg.displayPhoneNumber) {
    const [m] = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.whatsappNumber, normalizePhone(msg.displayPhoneNumber))).limit(1);
    merchantId = m?.id;
  }
  if (!merchantId) return null;
  return (await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1))[0] ?? null;
}

export interface WebhookResult {
  processed: number;
  duplicates: number;
  ignored: number;
}

/** Entry point for POST /v1/webhooks/whatsapp (already signature-checked). Idempotent per message id. */
export async function handleWebhook(ctx: AppContext, body: unknown): Promise<WebhookResult> {
  const res: WebhookResult = { processed: 0, duplicates: 0, ignored: 0 };
  for (const msg of parseInboundWebhook(body)) {
    const [evt] = await ctx.db
      .insert(webhookEvents)
      .values({ provider: "whatsapp", externalId: msg.id, type: `message.${msg.type}`, payload: { phoneNumberId: msg.phoneNumberId, type: msg.type }, status: "received" })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (!evt) {
      res.duplicates++;
      continue;
    }
    try {
      const merchant = await merchantForInbound(ctx, msg);
      if (!merchant) {
        await ctx.db.update(webhookEvents).set({ status: "unmatched", processedAt: ctx.now() }).where(eq(webhookEvents.id, evt.id));
        res.ignored++;
        continue;
      }
      await processInbound(ctx, merchant, msg);
      await ctx.db.update(webhookEvents).set({ status: "processed", merchantId: merchant.id, processedAt: ctx.now() }).where(eq(webhookEvents.id, evt.id));
      res.processed++;
    } catch (err) {
      await ctx.db.update(webhookEvents).set({ status: "failed", error: (err as Error).message.slice(0, 1000), attempts: 1 }).where(eq(webhookEvents.id, evt.id));
    }
  }
  return res;
}

async function reply(ctx: AppContext, merchant: Merchant, session: Session, texts: string[]): Promise<void> {
  for (const text of texts.filter(Boolean)) await sendWhatsApp(ctx, merchant, session.phone, { text, sender: "assistant", confirmation: true }, session);
}

/** One inbound customer message for a shop: update the window, run the conversation, send replies, act. */
export async function processInbound(ctx: AppContext, merchant: Merchant, msg: InboundWhatsAppMessage): Promise<void> {
  const now = ctx.now();
  const user = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, msg.from)).limit(1);
  const { session: existing, created } = await upsertSession(ctx, merchant.id, msg.from, { lastInboundAt: now, ...(user[0] ? { userId: user[0].id } : {}) });
  let session = existing;
  const orderingOn = await isFeatureOn(ctx.db, merchant, "restaurant.whatsapp_ordering");
  const shopLangs = merchant.languages?.length ? merchant.languages : ["en"];
  let lang = asLang(session.language);
  if (created) {
    const guess = detectLanguage(msg.text);
    lang = guess && shopLangs.includes(guess) ? guess : asLang(shopLangs[0]);
    session = (await ctx.db.update(whatsappSessions).set({ language: lang }).where(eq(whatsappSessions.id, session.id)).returning())[0]!;
  }
  await recordChatMessage(ctx, merchant.id, session, { direction: "in", kind: "text", body: msg.text || "(attachment)", sender: "guest", providerMessageId: msg.id });
  if (!msg.text) {
    if (!session.takenOverAt) await reply(ctx, merchant, session, [strings(lang).unknown]);
    return;
  }

  const menu: MenuView = orderingOn ? await buildMenu(ctx, merchant) : { merchantName: merchant.name, items: [], cardPayments: false };
  const orderNumber = session.orderId ? ((await ctx.db.select({ n: orders.number }).from(orders).where(eq(orders.id, session.orderId)).limit(1))[0]?.n ?? null) : null;
  const out = converse({ state: session.state, language: lang, cart: session.cart, text: msg.text, menu, orderNumber });

  // Shops without WhatsApp ordering only honour STOP / START.
  if (!orderingOn && !out.action) return;
  // A person has taken the chat over: the assistant stays quiet (STOP / START still work).
  if (session.takenOverAt && out.action?.type !== "opt_out" && out.action?.type !== "opt_in") return;

  let replies = out.replies;
  if (created && replies.length === 1 && replies[0] === strings(lang).unknown) replies = [strings(out.language).greeting(merchant.name)];
  session = (
    await ctx.db
      .update(whatsappSessions)
      .set({ state: out.state, language: out.language, cart: out.cart, updatedAt: now, ...(out.allergyNote ? { allergyNote: out.allergyNote } : {}) })
      .where(eq(whatsappSessions.id, session.id))
      .returning()
  )[0]!;

  if (out.action?.type === "opt_out") await recordOptOut(ctx, merchant, msg.from, "whatsapp_stop");
  else if (out.action?.type === "opt_in") {
    await recordPhoneResubscribe(ctx, msg.from, "whatsapp");
    await recordOptIn(ctx, merchant, null, { phone: msg.from, source: "whatsapp_reply" });
  }
  await reply(ctx, merchant, session, replies);
  if (out.action?.type === "checkout") await checkout(ctx, merchant, session, msg.name);
}

async function checkout(ctx: AppContext, merchant: Merchant, session: Session, name: string | null): Promise<void> {
  const lang = asLang(session.language);
  try {
    const key = `wa:${session.id}:${sha256(`${session.orderId ?? "first"}:${JSON.stringify(session.cart)}`).slice(0, 24)}`;
    const res = await placeChannelOrder(ctx, merchant, { phone: session.phone, name, channel: "whatsapp", lines: session.cart, paymentMethod: "in_app", allergyNote: session.allergyNote, idempotencyKey: key });
    const awaiting = !!res.payment && res.order.paymentStatus !== "paid";
    const payUrl = awaiting ? orderPayUrl(ctx, res.order.id) : null;
    await ctx.db.update(whatsappSessions).set({ orderId: res.order.id, userId: res.userId, cart: [], allergyNote: null, state: awaiting ? "awaiting_payment" : "done", updatedAt: ctx.now() }).where(eq(whatsappSessions.id, session.id));
    // The summary card in the inbox: what the assistant built and the pay link.
    const summary: restaurantApi.OrderSummaryBody = {
      orderNumber: res.order.number,
      lines: res.order.items.map((i) => ({ quantity: i.quantity, name: i.name, totalCents: i.lineTotalCents })),
      subtotalCents: res.order.subtotalCents,
      taxCents: res.order.taxCents,
      totalCents: res.order.totalCents,
      depositCents: res.order.depositCents,
      payUrl,
    };
    await recordChatMessage(ctx, merchant.id, session, { direction: "out", kind: "order_summary", body: JSON.stringify(summary), sender: "assistant" });
    await reply(ctx, merchant, session, [orderPlacedText(lang, { number: res.order.number, totalCents: res.order.totalCents, payUrl, shop: merchant.name })]);
  } catch (err) {
    await ctx.db.update(whatsappSessions).set({ state: "cart", updatedAt: ctx.now() }).where(eq(whatsappSessions.id, session.id));
    const msg = err instanceof HttpError ? err.message : "We could not place that order. Please try again in a minute.";
    await reply(ctx, merchant, session, [msg]);
  }
}

// ---------------------------------------------------------------------------
// Public pay page for a WhatsApp order
// ---------------------------------------------------------------------------
export async function getPayView(ctx: AppContext, orderId: string, token: string | undefined): Promise<whatsappApi.WhatsappPayView> {
  if (!verifyOrderPayToken(ctx, orderId, token)) throw notFound("Order");
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) throw notFound("Order");
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, o.merchantId)).limit(1);
  const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
  let payment: whatsappApi.WhatsappPayView["payment"] = null;
  if (o.paymentMethod === "in_app" && o.stripePaymentIntentId && o.paymentStatus !== "paid" && o.paymentStatus !== "refunded" && o.status !== "cancelled") {
    const pi = await retrieveConnectPayment(ctx, m!, o.stripePaymentIntentId);
    payment = { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
  }
  return {
    merchant: { name: m?.name ?? "", slug: m?.slug ?? "", logoUrl: m?.logoUrl ?? null },
    order: { id: o.id, number: o.number, totalCents: o.totalCents, status: o.status, paymentStatus: o.paymentStatus, items: items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.unitPriceCents * i.quantity })) },
    payment,
  };
}

// ---------------------------------------------------------------------------
// Marketing broadcast
// ---------------------------------------------------------------------------
export const whatsappCreditsExhausted = (needed: number, remaining: number) =>
  new HttpError(402, "whatsapp_credits_exhausted", `This send needs ${needed} WhatsApp messages but only ${remaining} are left. Add a ${ADD_ONS.whatsapp_1000.name} pack to send more.`, { needed, remaining });

export async function broadcast(ctx: AppContext, merchant: Merchant, actorUserId: string, input: whatsappApi.BroadcastBody): Promise<whatsappApi.BroadcastResult> {
  const body = whatsappApi.broadcastBody.parse(input);
  await requireFeature(ctx.db, merchant, "restaurant.whatsapp_marketing");
  const sender = await senderFor(ctx, merchant);
  if (!sender) throw new HttpError(409, "whatsapp_not_connected", "Connect your WhatsApp Business number first");
  if (!sender.approvedTemplates.includes(body.templateName)) throw badRequest(`"${body.templateName}" isn't one of your approved templates. Add it in WhatsApp settings once Meta approves it.`);
  const now = ctx.now();
  if (!body.dryRun && inQuietHours(now, merchant.timezone || BRAND.defaultTimezone)) throw conflict("Marketing messages go out between 8:00 and 21:00 local time. Try again then.");

  const audience = await resolveAudience(ctx.db, merchant.id, "sms", await segmentCondition(ctx.db, merchant.id, { ...body.segment }, now));
  const phones = audience.recipients.flatMap((r) => r.to.map((p) => normalizePhone(p)));
  const sessions = phones.length ? await ctx.db.select().from(whatsappSessions).where(and(eq(whatsappSessions.merchantId, merchant.id), inArray(whatsappSessions.phone, phones))) : [];
  const optedIn = new Set(sessions.filter(canSendMarketing).map((s) => s.phone));
  const recipients = audience.recipients.filter((r) => optedIn.has(normalizePhone(r.to[0]!)));
  const fresh = (await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1))[0] ?? merchant;
  const usage = whatsappUsage(fresh);
  const result: whatsappApi.BroadcastResult = {
    dryRun: body.dryRun,
    matched: audience.matched,
    recipients: recipients.length,
    excludedNoConsent: audience.excludedNoConsent,
    excludedMuted: audience.excludedMuted,
    excludedNoWhatsappOptIn: audience.excludedNoContact + (audience.recipients.length - recipients.length),
    creditsNeeded: recipients.length,
    creditsRemaining: usage.remaining,
    sent: 0,
    failed: 0,
  };
  if (body.dryRun || !recipients.length) return result;
  if (!(await reserveCredits(ctx, fresh, recipients.length))) throw whatsappCreditsExhausted(recipients.length, usage.remaining);

  const provider = getWhatsApp(ctx);
  for (const r of recipients) {
    const to = normalizePhone(r.to[0]!);
    const params = body.params.map((p) => personalize(p, r, merchant.name, "points"));
    try {
      await provider.sendTemplate({ phoneNumberId: sender.phoneNumberId, to, template: body.templateName, language: asLang(sessions.find((s) => s.phone === to)?.language ?? body.language), params });
      result.sent++;
    } catch {
      result.failed++;
    }
  }
  await refundCredits(ctx, merchant.id, result.failed);
  result.creditsRemaining = Math.max(0, usage.remaining - result.sent);
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "whatsapp.broadcast", entity: "merchant", entityId: merchant.id, data: { template: body.templateName, segment: body.segment, sent: result.sent, failed: result.failed } });
  return result;
}
