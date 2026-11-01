/**
 * Deal notifications (wave N, promo team): the announcement when a promo starts (door crashers: when they are published, so
 * people can plan) and the "starts in 1 hour" reminder for door crashers.
 *
 * Rules, every message:
 *  - CASL: only members with express consent for THIS shop who have not muted it. The sender (the shop) is named, and every
 *    message carries a way out: the email footer + List-Unsubscribe link, the push line "mute this shop in the app" plus the
 *    unsubscribe link in the payload.
 *  - Never SMS. The ladder is app push → web push → email (when the promo allows email). Nobody reachable → the Deals inbox only.
 *  - Frequency cap: at most PROMO_CAPS.perShopPerWeek marketing messages per shop per person in a rolling 7 days (deals and
 *    campaign sends together). Over the cap → recorded as skipped (cap), shown in the results.
 *  - Quiet hours 21:00–08:00 shop time: nothing goes out; the promos.notify job sends it after 08:00.
 *  - Paused or ended promos never notify. Each person gets each kind (announce, reminder) at most once per promo.
 *  - Wallet: people with a pass get a Google Wallet message and an Apple pass refresh whose changeMessage shows the deal.
 */
import { and, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { merchantMembers, merchants, messageDeliveries, promoDeliveries, promos, pushTokens, users, webPushSubscriptions } from "@ll/db";
import { promosApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { enabledFeaturesFor, promoFeature } from "./features.js";
import { unsubscribeHeaders, unsubscribeUrl, withFooter } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { segmentWhere } from "./promo-rules.js";
import { addPassMessage, hasWalletPass, notifyPassUpdate } from "./wallet.js";
import { sendWebPush } from "./web-push.js";

type PromoRow = typeof promos.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
const WEEK_MS = 7 * 86_400_000;

export interface FanOutResult {
  status: "sent" | "held_quiet_hours" | "not_running" | "feature_off" | "already_done";
  sent: number;
  skipped: number;
  inboxOnly: number;
}

/** Marketing messages this person got from this shop in the last 7 days (deals + campaign sends). */
export async function marketingCount(ctx: AppContext, merchantId: string, userId: string): Promise<number> {
  const since = new Date(ctx.now().getTime() - WEEK_MS);
  const [a] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoDeliveries)
    .where(and(eq(promoDeliveries.merchantId, merchantId), eq(promoDeliveries.userId, userId), eq(promoDeliveries.status, "sent"), ne(promoDeliveries.channel, "inbox"), gte(promoDeliveries.createdAt, since)));
  const [b] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(messageDeliveries)
    .where(and(eq(messageDeliveries.merchantId, merchantId), eq(messageDeliveries.userId, userId), eq(messageDeliveries.kind, "marketing"), inArray(messageDeliveries.status, ["sent", "delivered"]), gte(messageDeliveries.createdAt, since)));
  return Number(a?.n ?? 0) + Number(b?.n ?? 0);
}

function whenLine(p: PromoRow, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" });
  return fmt.format(p.startsAt);
}

/** The text of one message. The shop is the sender and is named first. */
function messageFor(p: PromoRow, m: Merchant, kind: "announce" | "reminder"): { title: string; body: string } {
  const tz = m.timezone || "America/Toronto";
  if (kind === "reminder") return { title: `${m.name}: starts in 1 hour`, body: `${p.title}${p.quantityCap ? ` · ${Math.max(0, p.quantityCap - p.claimedCount)} spots left` : ""}. Starts ${whenLine(p, tz)}.` };
  return { title: m.name, body: p.notifyText?.trim() || (p.body ? `${p.title}. ${p.body}` : p.title) };
}

/**
 * Announce (or remind) one promo to its audience. Idempotent per person; safe to call again (the job does).
 * Returns what happened; never throws for one person's failed delivery.
 */
export async function announcePromo(ctx: AppContext, promoId: string, kind: "announce" | "reminder" = "announce"): Promise<FanOutResult> {
  const out: FanOutResult = { status: "sent", sent: 0, skipped: 0, inboxOnly: 0 };
  const [p] = await ctx.db.select().from(promos).where(eq(promos.id, promoId)).limit(1);
  if (!p) return { ...out, status: "not_running" };
  const now = ctx.now();
  if (p.pausedAt || (p.status !== "live" && p.status !== "scheduled") || (p.endsAt && p.endsAt <= now)) return { ...out, status: "not_running" };
  if (kind === "announce" && p.announcedAt) return { ...out, status: "already_done" };
  if (kind === "reminder" && p.remindedAt) return { ...out, status: "already_done" };
  // Announce when it starts; a door crasher is announced as soon as it's published (people plan for it).
  if (kind === "announce" && p.startsAt > now && p.promoType !== "door_crasher") return { ...out, status: "not_running" };
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, p.merchantId)).limit(1);
  if (!m) return { ...out, status: "not_running" };
  const tz = m.timezone || "America/Toronto";
  if (!(await enabledFeaturesFor(ctx.db, [m], [promoFeature(p.kind)])).get(m.id)?.has(promoFeature(p.kind))) return { ...out, status: "feature_off" };
  if (inQuietHours(now, tz)) return { ...out, status: "held_quiet_hours" };

  const channels = new Set(p.channels ?? ["inbox", "push"]);
  const audience = await ctx.db
    .select({ memberId: merchantMembers.id, userId: merchantMembers.userId, email: users.email, name: users.name })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(segmentWhere(p.segment, m.id, now, tz), sql`${merchantMembers.marketingConsentAt} is not null`, eq(merchantMembers.muted, false), isNull(users.deletedAt)));
  const done = new Set(
    (await ctx.db.select({ memberId: promoDeliveries.memberId }).from(promoDeliveries).where(and(eq(promoDeliveries.promoId, p.id), eq(promoDeliveries.kind, kind)))).map((d) => d.memberId),
  );
  const people = audience.filter((a) => !done.has(a.memberId));
  const ids = people.map((x) => x.userId);
  const [tokens, webs] = ids.length
    ? await Promise.all([
        ctx.db.select({ userId: pushTokens.userId, token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, ids)),
        ctx.db.select({ userId: webPushSubscriptions.userId }).from(webPushSubscriptions).where(inArray(webPushSubscriptions.userId, ids)),
      ])
    : [[], []];
  const tokenMap = tokens.reduce((acc, r) => acc.set(r.userId, [...(acc.get(r.userId) ?? []), r.token]), new Map<string, string[]>());
  const webSet = new Set(webs.map((w) => w.userId));
  const msg = messageFor(p, m, kind);
  const dealUrl = `/me?deal=${p.id}`;

  for (const r of people) {
    const record = (channel: string, status: "sent" | "failed" | "skipped", skipReason: string | null = null) =>
      ctx.db.insert(promoDeliveries).values({ promoId: p.id, merchantId: m.id, memberId: r.memberId, userId: r.userId, kind, channel, status, skipReason, createdAt: now }).onConflictDoNothing();
    if ((await marketingCount(ctx, m.id, r.userId)) >= promosApi.PROMO_CAPS.perShopPerWeek) {
      await record("inbox", "skipped", "cap");
      out.skipped++;
      continue;
    }
    const unsub = unsubscribeUrl(ctx, r.memberId);
    let channel: "push" | "web_push" | "email" | "inbox" = "inbox";
    let ok = true;
    try {
      const push = tokenMap.get(r.userId);
      if (channels.has("push") && push?.length) {
        channel = "push";
        const res = await ctx.providers.push.send(push.map((token) => ({ token, title: msg.title, body: withFooter(ctx, "push", m.name, msg.body, r.memberId), data: { type: "promo_deal", promoId: p.id, merchantId: m.id, slug: m.slug, url: dealUrl, unsubscribeUrl: unsub }, channelId: "offers" })));
        ok = res.ok > 0;
      } else if (channels.has("push") && webSet.has(r.userId)) {
        channel = "web_push";
        ok = (await sendWebPush(ctx, r.userId, { title: msg.title, body: withFooter(ctx, "push", m.name, msg.body, r.memberId), url: dealUrl, tag: `deal_${p.id}_${kind}` })) > 0;
      } else if (channels.has("email") && r.email) {
        channel = "email";
        const text = withFooter(ctx, "email", m.name, `${msg.body}\n\nSee it: ${ctx.config.publicWebUrl.replace(/\/$/, "")}${dealUrl}`, r.memberId);
        await ctx.providers.email.send({ to: r.email, subject: kind === "reminder" ? msg.title : `${m.name}: ${p.title}`, text, headers: unsubscribeHeaders(ctx, r.memberId) });
      }
    } catch {
      ok = false;
    }
    await record(channel, ok ? "sent" : "failed");
    if (channel === "inbox") out.inboxOnly++;
    else if (ok) out.sent++;
    // The wallet pass shows the deal too (Google: a message; Apple: the pass refreshes and its changeMessage names the deal).
    if (kind === "announce" && (await hasWalletPass(ctx, r.userId))) {
      await addPassMessage(ctx, r.userId, { id: `deal_${p.id}`, header: m.name, body: p.title });
      await notifyPassUpdate(ctx, r.userId);
    }
  }
  await ctx.db.update(promos).set(kind === "announce" ? { announcedAt: now } : { remindedAt: now }).where(eq(promos.id, p.id));
  return out;
}

/** After a pause or end: refresh the wallet passes of this shop's opted-in members so the deal disappears from them. */
export async function refreshDealPasses(ctx: AppContext, merchantId: string) {
  const rows = await ctx.db
    .select({ userId: merchantMembers.userId })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), sql`${merchantMembers.marketingConsentAt} is not null`))
    .limit(500);
  for (const r of rows) if (await hasWalletPass(ctx, r.userId)) await notifyPassUpdate(ctx, r.userId);
}

/**
 * The promos.notify job (every 5 minutes): announcements held for quiet hours or due now, and door-crasher reminders whose start
 * is within the next hour.
 */
export async function runPromoNotifications(ctx: AppContext): Promise<{ announced: number; reminded: number }> {
  const now = ctx.now();
  const lead = new Date(now.getTime() + promosApi.PROMO_CAPS.reminderLeadMinutes * 60_000);
  const due = await ctx.db
    .select({ id: promos.id })
    .from(promos)
    .where(
      and(
        isNull(promos.announcedAt),
        isNull(promos.pausedAt),
        or(and(eq(promos.status, "live"), lte(promos.startsAt, now)), and(eq(promos.promoType, "door_crasher"), inArray(promos.status, ["live", "scheduled"]))),
        or(isNull(promos.endsAt), sql`${promos.endsAt} > ${now.toISOString()}::timestamptz`),
      ),
    )
    .limit(200);
  let announced = 0;
  for (const d of due) if ((await announcePromo(ctx, d.id, "announce")).status === "sent") announced++;
  const soon = await ctx.db
    .select({ id: promos.id })
    .from(promos)
    .where(and(eq(promos.promoType, "door_crasher"), isNull(promos.remindedAt), isNull(promos.pausedAt), notInArray(promos.status, ["draft", "ended", "archived"]), sql`${promos.startsAt} > ${now.toISOString()}::timestamptz`, lte(promos.startsAt, lead)))
    .limit(200);
  let reminded = 0;
  for (const s of soon) if ((await announcePromo(ctx, s.id, "reminder")).status === "sent") reminded++;
  return { announced, reminded };
}
