/**
 * Customer notifications: one place that decides whether, how and where a
 * customer hears about something.
 *
 *  - Types, kinds (transactional / marketing), Android channels and default
 *    channel prefs come from the shared catalogue (customerApi.NOTIFICATION_CATALOG).
 *  - Every notification we decide to send is stored in `notifications` (the
 *    in-app inbox), with a deep-link payload that also rides in the push `data`.
 *  - Channels, in order: Expo push to the app (if the customer has a device
 *    token and the pref is on) → the Wallet pass (no-app customers: the pass
 *    updates itself from the ledger listener in wallet.ts; "reward ready" also
 *    adds a Google Wallet message) → SMS, only when the shop has paid SMS
 *    (marketing.sms), the customer has no app push, no wallet pass covers it and
 *    the SMS pref is on → email for the few types that support it.
 *  - Rules: marketing (promo_nearby) needs CASL consent for that shop and not
 *    muted, the paid feature, honours quiet hours 21:00–08:00 in the shop's
 *    timezone, and at most one per customer per 24 h. points_earned collapses
 *    per shop per 10 minutes (one push; the inbox row accumulates).
 *  - Expo receipts are checked by a job; DeviceNotRegistered tokens are deleted.
 *
 * Ledger events (award / redeem) arrive through `balanceListeners` (registered
 * at the bottom). Commerce notifications (order / ticket / quote / booking) go
 * through commerceShared.notifyCustomer, which calls `prepareTransactional`.
 */
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { loyaltyPrograms, merchantMembers, merchants, messageDeliveries, notifications, pushTokens, rewards, userNotificationPrefs, users } from "@ll/db";
import { BRAND, customerApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import type { PushTicket } from "../providers/types.js";
import { enabledFeaturesFor } from "./features.js";
import { balanceListeners, type BalanceChange, type BalanceListener } from "./ledger.js";
import { balanceText } from "./wallet-apple.js";
import { addPassMessage, hasWalletPass } from "./wallet.js";

export type NotificationType = customerApi.NotificationType;
export type NotificationChannel = customerApi.NotificationChannel;
type Merchant = typeof merchants.$inferSelect;
type NotificationRow = typeof notifications.$inferSelect;

export const POINTS_COLLAPSE_MS = 10 * 60_000;
export const PROMO_DAILY_LIMIT_MS = 24 * 60 * 60_000;
export const QUIET_HOURS = { start: 21, end: 8 } as const;

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
export type PrefMatrix = Record<NotificationType, Record<NotificationChannel, boolean>>;

export async function loadPrefs(ctx: AppContext, userId: string): Promise<PrefMatrix> {
  const rows = await ctx.db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId));
  const m = {} as PrefMatrix;
  for (const info of customerApi.NOTIFICATION_CATALOG) {
    m[info.type] = { ...info.defaults };
    // A channel the type doesn't support is always off.
    for (const c of customerApi.NOTIFICATION_CHANNELS) if (!info.channels.includes(c)) m[info.type][c] = false;
  }
  for (const r of rows) {
    const info = customerApi.NOTIFICATION_CATALOG.find((x) => x.type === r.type);
    if (info && info.channels.includes(r.channel as NotificationChannel)) m[info.type][r.channel as NotificationChannel] = r.enabled;
  }
  return m;
}

export function prefsResponse(m: PrefMatrix): customerApi.NotificationPrefsResponse {
  return {
    items: customerApi.NOTIFICATION_CATALOG.map((info) => ({
      type: info.type,
      kind: info.kind,
      label: info.label,
      description: info.description,
      channels: Object.fromEntries(info.channels.map((c) => [c, m[info.type][c]])),
    })),
    quietHours: { start: "21:00", end: "08:00", appliesTo: "marketing" },
  };
}

export async function getNotificationPrefs(ctx: AppContext, userId: string) {
  return prefsResponse(await loadPrefs(ctx, userId));
}

export async function updateNotificationPrefs(ctx: AppContext, userId: string, body: customerApi.UpdateNotificationPrefsBody) {
  for (const p of body.prefs) {
    const info = customerApi.notificationInfo(p.type);
    if (!info.channels.includes(p.channel)) throw badRequest(`${info.label} can't be sent by ${p.channel}`, { type: p.type, channel: p.channel, supported: info.channels });
  }
  for (const p of body.prefs) {
    await ctx.db
      .insert(userNotificationPrefs)
      .values({ userId, type: p.type, channel: p.channel, enabled: p.enabled, updatedAt: ctx.now() })
      .onConflictDoUpdate({ target: [userNotificationPrefs.userId, userNotificationPrefs.type, userNotificationPrefs.channel], set: { enabled: p.enabled, updatedAt: ctx.now() } });
  }
  return getNotificationPrefs(ctx, userId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Local hour (0-23) in a timezone. */
export function localHour(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", hourCycle: "h23" }).formatToParts(at).find((p) => p.type === "hour")?.value;
  return Number(h ?? 12);
}

export const inQuietHours = (at: Date, timeZone: string) => {
  const h = localHour(at, timeZone);
  return h >= QUIET_HOURS.start || h < QUIET_HOURS.end;
};

/** Deep-link payload for the app (features/customer/notifications.ts routes on `url`/`screen`). */
export function deepLink(type: NotificationType, merchant: Pick<Merchant, "id" | "slug"> | null, data: Record<string, unknown> = {}): customerApi.NotificationData {
  const out: customerApi.NotificationData = { ...data, type };
  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  if (merchant) Object.assign(out, { merchantId: merchant.id, slug: merchant.slug });
  if (type === "quote_sent" && str("url")) return { ...out, screen: "quote" };
  if (str("subscriptionId")) return { ...out, screen: "tiffin", url: `ll://tiffin/${str("subscriptionId")}` };
  if (str("orderId")) return { ...out, screen: "order", url: `ll://order/${str("orderId")}` };
  if (str("ticketId")) return { ...out, screen: "ticket", url: str("url") && type !== "ticket_updated" ? str("url") : `ll://ticket/${str("ticketId")}` };
  if (str("campaignId")) return { ...out, screen: "campaign", url: `ll://campaign/${str("campaignId")}` };
  if (merchant) return { ...out, screen: "shop", url: `ll://shop/${merchant.slug}` };
  return { ...out, screen: "inbox" };
}

const encodeCursor = (row: { createdAt: Date; id: string }) => Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const d = new Date(iso ?? "");
  if (!id || Number.isNaN(d.getTime())) throw badRequest("Invalid cursor");
  return { createdAt: d, id };
}

async function tokensFor(ctx: AppContext, userId: string) {
  return (await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId))).map((t) => t.token);
}

/** The customer muted this shop: no texts from it (push and the inbox still work). */
async function mutedShop(ctx: AppContext, userId: string, merchant: Merchant | null): Promise<boolean> {
  if (!merchant) return false;
  const [m] = await ctx.db
    .select({ muted: merchantMembers.muted })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, userId)))
    .limit(1);
  return !!m?.muted;
}

async function paidSms(ctx: AppContext, merchant: Merchant | null): Promise<boolean> {
  if (!merchant) return false;
  return !!(await enabledFeaturesFor(ctx.db, [merchant], ["marketing.sms"])).get(merchant.id)?.has("marketing.sms");
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
export interface SendArgs {
  userId: string;
  merchantId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  /** SMS text; defaults to "<title>: <body>" (+ opt-out for marketing). */
  smsBody?: string;
  /** Extra deep-link fields (orderId, ticketId, url, ...). */
  data?: Record<string, unknown>;
  /** Google Wallet pass message (reward_ready). */
  passMessage?: boolean;
}

export type SkipReason = "user_missing" | "no_consent" | "muted" | "feature_off" | "quiet_hours" | "daily_limit" | "collapsed";

export interface SendResult {
  notificationId: string | null;
  skipped?: SkipReason;
  channels: string[];
  push: number;
}

/**
 * Decide, store (inbox) and deliver one notification. Never throws: a failed
 * notification must not undo whatever triggered it.
 */
export async function sendNotification(ctx: AppContext, args: SendArgs): Promise<SendResult> {
  const res: SendResult = { notificationId: null, channels: [], push: 0 };
  try {
    const now = ctx.now();
    const info = customerApi.notificationInfo(args.type);
    const [user] = await ctx.db.select().from(users).where(eq(users.id, args.userId)).limit(1);
    if (!user || user.deletedAt) return { ...res, skipped: "user_missing" };
    const merchant = args.merchantId ? ((await ctx.db.select().from(merchants).where(eq(merchants.id, args.merchantId)).limit(1))[0] ?? null) : null;

    // ---- Marketing rules (CASL, paid, quiet hours, daily cap) ----
    if (info.kind === "marketing") {
      if (!merchant) return { ...res, skipped: "no_consent" };
      const [member] = await ctx.db
        .select({ consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted })
        .from(merchantMembers)
        .where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, user.id)))
        .limit(1);
      if (!member?.consent) return { ...res, skipped: "no_consent" };
      if (member.muted) return { ...res, skipped: "muted" };
      if (args.type === "promo_nearby" && !(await enabledFeaturesFor(ctx.db, [merchant], ["promos.push_nearby"])).get(merchant.id)?.has("promos.push_nearby"))
        return { ...res, skipped: "feature_off" };
      if (inQuietHours(now, merchant.timezone || BRAND.defaultTimezone)) return { ...res, skipped: "quiet_hours" };
      const [recent] = await ctx.db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.type, args.type), gt(notifications.createdAt, new Date(now.getTime() - PROMO_DAILY_LIMIT_MS))))
        .limit(1);
      if (recent) return { ...res, skipped: "daily_limit" };
    }

    const data = deepLink(args.type, merchant, args.data);

    // ---- points_earned: one push per shop per 10 minutes; the inbox row accumulates ----
    if (args.type === "points_earned" && merchant) {
      const [prev] = await ctx.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, user.id),
            eq(notifications.merchantId, merchant.id),
            eq(notifications.type, "points_earned"),
            gt(notifications.createdAt, new Date(now.getTime() - POINTS_COLLAPSE_MS)),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(1);
      if (prev) {
        const delta = Number(prev.data.delta ?? 0) + Number(args.data?.delta ?? 0);
        const title = collapsedPointsTitle(delta, String(args.data?.terminology ?? "points"), merchant.name) ?? args.title;
        await ctx.db
          .update(notifications)
          .set({ title, body: args.body, data: { ...prev.data, ...data, delta, notificationId: prev.id }, readAt: null, updatedAt: now })
          .where(eq(notifications.id, prev.id));
        return { notificationId: prev.id, skipped: "collapsed", channels: [], push: 0 };
      }
    }

    const prefs = await loadPrefs(ctx, user.id);
    const [row] = await ctx.db
      .insert(notifications)
      .values({ userId: user.id, merchantId: merchant?.id ?? null, type: args.type, title: args.title, body: args.body, data, createdAt: now, updatedAt: now })
      .returning();
    const id = row!.id;
    const payload = { ...data, notificationId: id };
    res.notificationId = id;
    let tickets: { id: string; token: string }[] | null = null;
    const log = (channel: "sms" | "email" | "push", to: string, body: string, status: string, providerId?: string | null, error?: string | null) =>
      ctx.db.insert(messageDeliveries).values({ userId: user.id, merchantId: merchant?.id ?? null, channel, to, body, kind: info.kind, status, providerId: providerId ?? null, error: error ?? null });

    // ---- Push (the app) ----
    if (prefs[args.type].push) {
      const tokens = await tokensFor(ctx, user.id);
      if (tokens.length) {
        try {
          const r = await ctx.providers.push.send(tokens.map((token) => ({ token, title: args.title, body: args.body, data: payload, channelId: info.androidChannel, priority: info.androidChannel === "orders" ? "high" : "default" })));
          res.push = r.ok;
          tickets = (r.tickets ?? []).filter((t): t is PushTicket & { id: string } => t.status === "ok" && !!t.id).map((t) => ({ id: t.id, token: t.token }));
          if (r.ok) res.channels.push("push");
        } catch (err) {
          if (ctx.config.env !== "test") console.error("[notifications] push failed", err);
        }
      }
    }

    // ---- Wallet pass (no-app customers see pass updates; Google gets a message) ----
    const points = info.androidChannel === "points";
    const wallet = points && (await hasWalletPass(ctx, user.id));
    if (wallet) {
      res.channels.push("wallet");
      if (args.passMessage) await addPassMessage(ctx, user.id, { id: `${args.type}_${id}`, header: args.title, body: args.body });
    }

    // ---- SMS fallback: paid SMS shops only, no app push, not covered by a wallet pass, shop not muted ----
    if (!res.push && !wallet && prefs[args.type].sms && user.phone && (await paidSms(ctx, merchant)) && !(await mutedShop(ctx, user.id, merchant))) {
      const body = args.smsBody ?? `${args.title}: ${args.body}${info.kind === "marketing" ? " Reply STOP to opt out." : ""}`;
      try {
        const r = await ctx.providers.sms.send(user.phone, body);
        res.channels.push("sms");
        await log("sms", user.phone, body, "sent", r.id);
      } catch (err) {
        await log("sms", user.phone, body, "failed", null, (err as Error).message);
      }
    }

    // ---- Email (types that support it) when nothing else reached them ----
    if (!res.push && prefs[args.type].email && user.email && !res.channels.includes("sms")) {
      const text = `${args.body}\n\n${merchant ? `${merchant.name} · ` : ""}${BRAND.name}\nManage notifications in the app or reply to ${BRAND.supportEmail}.`;
      try {
        const r = await ctx.providers.email.send({ to: user.email, subject: args.title, text });
        res.channels.push("email");
        await log("email", user.email, text, "sent", r.id);
      } catch (err) {
        await log("email", user.email, text, "failed", null, (err as Error).message);
      }
    }

    await ctx.db.update(notifications).set({ data: payload, channels: res.channels, pushTickets: tickets?.length ? tickets : null }).where(eq(notifications.id, id));
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[notifications] send failed", err);
  }
  return res;
}

function collapsedPointsTitle(delta: number, terminology: string, shop: string): string | null {
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return `+${balanceText(delta, terminology)} at ${shop}`;
}

// ---------------------------------------------------------------------------
// Commerce (transactional) notifications through commerceShared.notifyCustomer
// ---------------------------------------------------------------------------
/** Map the commerce payload `data.type` to a notification type. */
export function commerceType(dataType: unknown): NotificationType | null {
  switch (dataType) {
    case "order_status":
      return "order_ready";
    case "ticket_status":
    case "invoice_sent":
    case "invoice_paid":
    case "deposit_paid":
      return "ticket_updated";
    case "quote_sent":
      return "quote_sent";
    case "booking_reminder":
      return "booking_reminder";
    default:
      return null;
  }
}

export interface PreparedTransactional {
  /** Send push? (customer pref) */
  push: boolean;
  /** Send SMS? (customer pref) */
  sms: boolean;
  /** Push data with deep link + notificationId. */
  data: Record<string, unknown>;
  channelId: string;
  /** Record what was sent (inbox row channels + receipt tickets). */
  finish(out: { push: number; sms: boolean; tickets?: PushTicket[] }): Promise<void>;
}

/**
 * Store the inbox row and resolve prefs for a commerce notification. The
 * caller (notifyCustomer) keeps its own delivery logic. Never throws.
 */
export async function prepareTransactional(
  ctx: AppContext,
  args: { userId: string; merchantId: string; title: string; body: string; data?: Record<string, unknown> },
): Promise<PreparedTransactional> {
  const type = commerceType(args.data?.type) ?? "ticket_updated";
  const info = customerApi.notificationInfo(type);
  const fallback: PreparedTransactional = { push: true, sms: true, data: args.data ?? {}, channelId: info.androidChannel, finish: async () => {} };
  try {
    const now = ctx.now();
    const [merchant] = await ctx.db.select({ id: merchants.id, slug: merchants.slug }).from(merchants).where(eq(merchants.id, args.merchantId)).limit(1);
    // Keep the caller's `type` (order_status, ...) in the push payload; the inbox row has the notification type.
    const data = { ...deepLink(type, merchant ?? null, args.data), ...(args.data?.type ? { type: args.data.type, notificationType: type } : {}) };
    const prefs = await loadPrefs(ctx, args.userId);
    const [row] = await ctx.db
      .insert(notifications)
      .values({ userId: args.userId, merchantId: merchant?.id ?? null, type, title: args.title, body: args.body, data, createdAt: now, updatedAt: now })
      .returning();
    const payload = { ...data, notificationId: row!.id };
    return {
      push: prefs[type].push,
      sms: prefs[type].sms,
      data: payload,
      channelId: info.androidChannel,
      async finish(out) {
        const channels = [...(out.push ? ["push"] : []), ...(out.sms ? ["sms"] : [])];
        const tickets = (out.tickets ?? []).filter((t) => t.status === "ok" && t.id).map((t) => ({ id: t.id!, token: t.token }));
        await ctx.db
          .update(notifications)
          .set({ data: payload, channels, pushTickets: tickets.length ? tickets : null })
          .where(eq(notifications.id, row!.id))
          .catch(() => undefined);
      },
    };
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[notifications] prepare failed", err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
async function unreadCount(ctx: AppContext, userId: string): Promise<number> {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(r?.n ?? 0);
}

function notificationDto(n: NotificationRow, m: Pick<Merchant, "id" | "name" | "slug" | "logoUrl" | "brandColor"> | null): customerApi.NotificationDto {
  return {
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    merchant: m ? { id: m.id, name: m.name, slug: m.slug, logoUrl: m.logoUrl ?? null, brandColor: m.brandColor ?? null } : null,
    data: { ...n.data, notificationId: n.id },
    read: !!n.readAt,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(ctx: AppContext, userId: string, q: customerApi.NotificationsQuery): Promise<customerApi.NotificationsResponse> {
  const c = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select({ n: notifications, m: { id: merchants.id, name: merchants.name, slug: merchants.slug, logoUrl: merchants.logoUrl, brandColor: merchants.brandColor } })
    .from(notifications)
    .leftJoin(merchants, eq(merchants.id, notifications.merchantId))
    .where(
      and(
        eq(notifications.userId, userId),
        q.unread ? isNull(notifications.readAt) : undefined,
        c ? or(lt(notifications.createdAt, c.createdAt), and(eq(notifications.createdAt, c.createdAt), lt(notifications.id, c.id))) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((r) => notificationDto(r.n, r.m?.id ? r.m : null)),
    nextCursor: rows.length > q.limit ? encodeCursor(page.at(-1)!.n) : null,
    unreadCount: await unreadCount(ctx, userId),
  };
}

export async function markRead(ctx: AppContext, userId: string, id: string): Promise<customerApi.NotificationsReadResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Notification");
  const [n] = await ctx.db.select({ id: notifications.id, readAt: notifications.readAt }).from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId))).limit(1);
  if (!n) throw notFound("Notification");
  if (!n.readAt) await ctx.db.update(notifications).set({ readAt: ctx.now() }).where(eq(notifications.id, id));
  return { unreadCount: await unreadCount(ctx, userId) };
}

export async function markAllRead(ctx: AppContext, userId: string): Promise<customerApi.NotificationsReadResponse> {
  await ctx.db.update(notifications).set({ readAt: ctx.now() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { unreadCount: 0 };
}

// ---------------------------------------------------------------------------
// Expo receipts → remove DeviceNotRegistered tokens
// ---------------------------------------------------------------------------
/** Receipts are ready ~15 min after sending and kept by Expo for 24 h. */
export const RECEIPT_DELAY_MS = 15 * 60_000;

export async function checkPushReceipts(ctx: AppContext, opts: { limit?: number } = {}): Promise<{ checked: number; removedTokens: string[] }> {
  const out = { checked: 0, removedTokens: [] as string[] };
  const provider = ctx.providers.push;
  if (!provider.receipts) return out;
  const now = ctx.now().getTime();
  const rows = await ctx.db
    .select({ id: notifications.id, tickets: notifications.pushTickets })
    .from(notifications)
    .where(
      and(
        isNotNull(notifications.pushTickets),
        isNull(notifications.receiptsCheckedAt),
        lte(notifications.createdAt, new Date(now - RECEIPT_DELAY_MS)),
        gte(notifications.createdAt, new Date(now - 24 * 60 * 60_000)),
      ),
    )
    .limit(opts.limit ?? 300);
  if (!rows.length) return out;
  const tickets = rows.flatMap((r) => r.tickets ?? []);
  const receipts = await provider.receipts(tickets.map((t) => t.id));
  const dead = [...new Set(tickets.filter((t) => receipts[t.id]?.status === "error" && receipts[t.id]?.error === "DeviceNotRegistered").map((t) => t.token))];
  if (dead.length) await ctx.db.delete(pushTokens).where(inArray(pushTokens.token, dead));
  await ctx.db.update(notifications).set({ receiptsCheckedAt: ctx.now() }).where(inArray(notifications.id, rows.map((r) => r.id)));
  out.checked = tickets.length;
  out.removedTokens = dead;
  return out;
}

// ---------------------------------------------------------------------------
// reward_expiring (only shops that enabled expiry) — daily job
// ---------------------------------------------------------------------------
export const EXPIRY_WARNING_DAYS = 30;

const addMonths = (d: Date, months: number) => {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
};

export async function sendExpiryWarnings(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  // Expiry is >= 12 months: anyone who visited in the last 11 months can't be in the warning window.
  const rows = await ctx.db
    .select({
      userId: merchantMembers.userId,
      merchantId: merchantMembers.merchantId,
      merchantName: merchants.name,
      timezone: merchants.timezone,
      balance: merchantMembers.balance,
      lastVisitAt: merchantMembers.lastVisitAt,
      expiryMonths: loyaltyPrograms.expiryMonths,
      terminology: loyaltyPrograms.terminology,
    })
    .from(merchantMembers)
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchantMembers.merchantId))
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .where(
      and(
        isNotNull(loyaltyPrograms.expiryMonths),
        gt(merchantMembers.balance, 0),
        isNotNull(merchantMembers.lastVisitAt),
        lt(merchantMembers.lastVisitAt, addMonths(now, -11)),
        or(eq(merchants.status, "active"), eq(merchants.status, "onboarding")),
      ),
    )
    .limit(2000);
  let sent = 0;
  for (const r of rows) {
    const expiresAt = addMonths(r.lastVisitAt!, r.expiryMonths!);
    const warnFrom = new Date(expiresAt.getTime() - EXPIRY_WARNING_DAYS * 86_400_000);
    if (now < warnFrom || now >= expiresAt) continue;
    // Not urgent: the hourly job sends it in the daytime.
    if (inQuietHours(now, r.timezone || BRAND.defaultTimezone)) continue;
    const [already] = await ctx.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, r.userId), eq(notifications.merchantId, r.merchantId), eq(notifications.type, "reward_expiring"), gt(notifications.createdAt, r.lastVisitAt!)))
      .limit(1);
    if (already) continue;
    const days = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));
    const res = await sendNotification(ctx, {
      userId: r.userId,
      merchantId: r.merchantId,
      type: "reward_expiring",
      title: `${r.merchantName}: ${r.terminology} expiring`,
      body: `Your ${balanceText(r.balance, r.terminology)} expire in ${days} ${days === 1 ? "day" : "days"} unless you visit. Any visit keeps them.`,
      data: { expiresAt: expiresAt.toISOString() },
      passMessage: true,
    });
    if (res.notificationId) sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Ledger events → points_earned / reward_ready / redeem_confirmed / passport_progress
// ---------------------------------------------------------------------------
export async function onBalanceChange(ctx: AppContext, change: BalanceChange): Promise<void> {
  if (change.kind !== "award" && change.kind !== "redeem") return; // adjustments/reversals: the pass updates, no message
  const [m] = await ctx.db
    .select({ name: merchants.name, terminology: loyaltyPrograms.terminology })
    .from(merchants)
    .leftJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchants.id))
    .where(eq(merchants.id, change.merchantId))
    .limit(1);
  if (!m) return;
  const term = m.terminology ?? "points";

  if (change.kind === "redeem") {
    // In-app redemptions show the code on screen; confirm the ones staff applied.
    if (change.source === "customer_app") return;
    await sendNotification(ctx, {
      userId: change.userId,
      merchantId: change.merchantId,
      type: "redeem_confirmed",
      title: `${m.name}: ${change.reward?.name ?? "reward"} redeemed`,
      body: `Enjoy. You have ${balanceText(change.balance, term)} left.`,
      data: { delta: change.delta, balance: change.balance, rewardId: change.reward?.id },
    });
    return;
  }

  if (change.delta > 0) {
    const crossed = await ctx.db
      .select({ id: rewards.id, name: rewards.name, cost: rewards.pointsCost })
      .from(rewards)
      .where(and(eq(rewards.merchantId, change.merchantId), eq(rewards.active, true), gt(rewards.pointsCost, change.previousBalance), lte(rewards.pointsCost, change.balance)))
      .orderBy(desc(rewards.pointsCost));
    if (crossed.length) {
      const best = crossed[0]!;
      await sendNotification(ctx, {
        userId: change.userId,
        merchantId: change.merchantId,
        type: "reward_ready",
        title: `Reward ready at ${m.name}`,
        body: `You have ${balanceText(change.balance, term)}: enough for ${best.name}. Show your card at the counter to redeem.`,
        data: { rewardId: best.id, balance: change.balance, delta: change.delta },
        passMessage: true,
      });
    } else {
      const [next] = await ctx.db
        .select({ name: rewards.name, cost: rewards.pointsCost })
        .from(rewards)
        .where(and(eq(rewards.merchantId, change.merchantId), eq(rewards.active, true), gt(rewards.pointsCost, change.balance)))
        .orderBy(rewards.pointsCost)
        .limit(1);
      await sendNotification(ctx, {
        userId: change.userId,
        merchantId: change.merchantId,
        type: "points_earned",
        title: `+${balanceText(change.delta, term)} at ${m.name}`,
        body: `You now have ${balanceText(change.balance, term)}.${next ? ` ${balanceText(next.cost - change.balance, term)} to ${next.name}.` : ""}`,
        data: { delta: change.delta, balance: change.balance, terminology: term },
      });
    }
  }

  if (change.messages?.length) {
    await sendNotification(ctx, {
      userId: change.userId,
      merchantId: change.merchantId,
      type: "passport_progress",
      title: "Neighbourhood passport",
      body: change.messages.join(" "),
      data: {},
    });
  }
}

const notificationsBalanceListener: BalanceListener = onBalanceChange;
if (!balanceListeners.includes(notificationsBalanceListener)) balanceListeners.push(notificationsBalanceListener);
