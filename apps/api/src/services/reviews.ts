/**
 * Review requests (restaurant.reviews, Starter).
 *
 * After an order is picked up, a tiffin delivery is delivered or a catering
 * event is completed, we ask the customer for a rating (a job detects the
 * completion and calls `scheduleReviewRequest`; `sendDueReviewRequests` sends it
 * after a short delay). Channel by consent: WhatsApp (opted in) > SMS (CASL consent,
 * paid SMS) > email (CASL consent) > push (app installed).
 *
 * Public page by token: the customer rates 1-5 and may leave private feedback.
 * Google policy: we never gate or hide the Google review link on the rating. The
 * Google link is always returned; 4 and 5 stars simply lead with it
 * (`leadWithGoogle`), while 1-3 stars also notify the shop privately.
 *
 * review_requests.orderId holds the completed thing's id (order, tiffin delivery or
 * catering event). There is no FK, so one table serves all three.
 */
import { and, count, desc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { cateringEvents, merchantMembers, merchantStaff, merchants, orders, pushTokens, reviewRequests, tiffinDeliveries, tiffinSubscriptions, users } from "@ll/db";
import { BRAND, whatsappApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { randomToken } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor } from "./commerceShared.js";
import { isFeatureOn, requireFeature } from "./features.js";
import { smsAllowance, withFooter } from "./messaging.js";
import { canSendTransactional, getSession, sendWhatsAppNotification } from "./whatsapp.js";
import { writeAudit } from "./admin-audit.js";

type Merchant = typeof merchants.$inferSelect;
type Request = typeof reviewRequests.$inferSelect;
type Channel = (typeof whatsappApi.REVIEW_CHANNELS)[number];

/** Wait this long after completion before asking. */
export const SEND_DELAY_MS = 2 * 60 * 60_000;
/** Never ask the same customer at the same shop more than once in this window. */
export const REASK_WINDOW_MS = 14 * 24 * 60 * 60_000;
/** Requests not sent within this long are dropped (the moment has passed). */
export const EXPIRE_MS = 7 * 24 * 60 * 60_000;
const COMPLETION_LOOKBACK_MS = 3 * 24 * 60 * 60_000;

export const reviewUrl = (ctx: AppContext, token: string) => `${ctx.config.publicWebUrl.replace(/\/$/, "")}/r/${token}`;

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
/** Channels this customer has consented to, best first. */
export async function consentedChannels(ctx: AppContext, merchant: Merchant, userId: string): Promise<Channel[]> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) return [];
  const [member] = await ctx.db.select({ consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, userId))).limit(1);
  const casl = !!member?.consent && !member.muted;
  const out: Channel[] = [];
  if (user.phone && canSendTransactional(await getSession(ctx, merchant.id, user.phone)) && (await isFeatureOn(ctx.db, merchant, "restaurant.whatsapp_notifications"))) out.push("whatsapp");
  if (user.phone && casl && (await isFeatureOn(ctx.db, merchant, "marketing.sms"))) out.push("sms");
  if (user.email && casl) out.push("email");
  const [tok] = await ctx.db.select({ id: pushTokens.id }).from(pushTokens).where(eq(pushTokens.userId, userId)).limit(1);
  if (tok) out.push("push");
  return out;
}

/** Create a review request for a completed order/delivery/event. Null when not applicable (feature off, no Google link, no consented channel, asked recently). */
export async function scheduleReviewRequest(ctx: AppContext, a: { merchantId: string; userId: string; sourceId: string }): Promise<Request | null> {
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, a.merchantId)).limit(1);
  if (!merchant || !merchant.googleReviewUrl) return null;
  if (!(await isFeatureOn(ctx.db, merchant, "restaurant.reviews"))) return null;
  const now = ctx.now();
  const [dupe] = await ctx.db
    .select({ id: reviewRequests.id })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.merchantId, merchant.id), or(eq(reviewRequests.orderId, a.sourceId), and(eq(reviewRequests.userId, a.userId), gt(reviewRequests.createdAt, new Date(now.getTime() - REASK_WINDOW_MS))))))
    .limit(1);
  if (dupe) return null;
  const channels = await consentedChannels(ctx, merchant, a.userId);
  if (!channels.length) return null;
  const [row] = await ctx.db.insert(reviewRequests).values({ merchantId: merchant.id, userId: a.userId, orderId: a.sourceId, channel: channels[0]!, token: randomToken(16), createdAt: now }).returning();
  return row ?? null;
}

/** Find recently completed orders, tiffin deliveries and catering events and schedule requests (idempotent). */
export async function scheduleCompletedReviewRequests(ctx: AppContext): Promise<number> {
  const since = new Date(ctx.now().getTime() - COMPLETION_LOOKBACK_MS);
  const sinceDay = since.toISOString().slice(0, 10);
  const shops = await ctx.db.select({ id: merchants.id }).from(merchants).where(and(isNotNull(merchants.restaurantTier), isNotNull(merchants.googleReviewUrl)));
  let n = 0;
  for (const shop of shops) {
    const done = [
      ...(await ctx.db.select({ userId: orders.userId, id: orders.id }).from(orders).where(and(eq(orders.merchantId, shop.id), eq(orders.status, "picked_up"), gte(orders.pickedUpAt, since)))),
      ...(await ctx.db
        .select({ userId: tiffinSubscriptions.userId, id: tiffinDeliveries.id })
        .from(tiffinDeliveries)
        .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinDeliveries.subscriptionId))
        .where(and(eq(tiffinDeliveries.merchantId, shop.id), or(eq(tiffinDeliveries.status, "delivered"), eq(tiffinDeliveries.status, "picked_up")), gte(tiffinDeliveries.deliveredAt, since), gte(tiffinDeliveries.date, sinceDay)))),
      ...(await ctx.db.select({ userId: cateringEvents.userId, id: cateringEvents.id }).from(cateringEvents).where(and(eq(cateringEvents.merchantId, shop.id), eq(cateringEvents.status, "completed"), gte(cateringEvents.updatedAt, since)))),
    ];
    for (const d of done) if (await scheduleReviewRequest(ctx, { merchantId: shop.id, userId: d.userId, sourceId: d.id })) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
async function reserveSms(ctx: AppContext, merchant: Merchant): Promise<boolean> {
  const r = await ctx.db
    .update(merchants)
    .set({ smsCreditsUsed: sql`${merchants.smsCreditsUsed} + 1` })
    .where(and(eq(merchants.id, merchant.id), sql`${merchants.smsCreditsUsed} + 1 <= ${smsAllowance(merchant)}`))
    .returning({ id: merchants.id });
  return r.length > 0;
}

/** Try the request's channel first, then the remaining consented ones. Returns the channel that worked. */
async function deliver(ctx: AppContext, merchant: Merchant, req: Request): Promise<Channel | null> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, req.userId)).limit(1);
  if (!user) return null;
  const [member] = await ctx.db.select({ id: merchantMembers.id }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, user.id))).limit(1);
  const url = reviewUrl(ctx, req.token);
  const firstName = user.name?.split(" ")[0];
  const text = `${firstName ? `${firstName}, thanks` : "Thanks"} for choosing ${merchant.name}. How was it? Tell us in one tap: ${url}`;
  const order = await consentedChannels(ctx, merchant, user.id);
  const channels = [req.channel as Channel, ...order].filter((c, i, all) => all.indexOf(c) === i && order.includes(c));
  for (const channel of channels) {
    try {
      if (channel === "whatsapp") {
        const r = await sendWhatsAppNotification(ctx, { merchantId: merchant.id, userId: user.id, kind: "review_request", vars: { merchant: merchant.name, link: url } });
        if (r.sent) return channel;
      } else if (channel === "sms" && user.phone) {
        if (!(await reserveSms(ctx, merchant))) continue;
        await ctx.providers.sms.send(user.phone, member ? withFooter(ctx, "sms", merchant.name, text, member.id) : `${text}\n— ${merchant.name}. Reply STOP to opt out.`);
        return channel;
      } else if (channel === "email" && user.email) {
        const body = member ? withFooter(ctx, "email", merchant.name, text, member.id) : text;
        await ctx.providers.email.send({ to: user.email, subject: `How was ${merchant.name}?`, text: body });
        return channel;
      } else if (channel === "push") {
        const tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, user.id));
        if (!tokens.length) continue;
        await ctx.providers.push.send(tokens.map((t) => ({ token: t.token, title: `How was ${merchant.name}?`, body: "Tap to rate your order.", data: { type: "review_request", url, merchantId: merchant.id } })));
        return channel;
      }
    } catch {
      // try the next channel
    }
  }
  return null;
}

/** Send requests whose delay has passed. Returns how many went out. */
export async function sendDueReviewRequests(ctx: AppContext, opts: { immediateFor?: string } = {}): Promise<number> {
  const now = ctx.now();
  const rows = await ctx.db
    .select()
    .from(reviewRequests)
    .where(
      opts.immediateFor
        ? eq(reviewRequests.id, opts.immediateFor)
        : and(isNull(reviewRequests.sentAt), lte(reviewRequests.createdAt, new Date(now.getTime() - SEND_DELAY_MS)), gt(reviewRequests.createdAt, new Date(now.getTime() - EXPIRE_MS))),
    )
    .limit(200);
  let sent = 0;
  for (const req of rows) {
    if (req.sentAt) continue;
    const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, req.merchantId)).limit(1);
    if (!merchant || !merchant.googleReviewUrl || !(await isFeatureOn(ctx.db, merchant, "restaurant.reviews"))) continue;
    const channel = await deliver(ctx, merchant, req);
    if (!channel) continue;
    await ctx.db.update(reviewRequests).set({ sentAt: now, channel }).where(eq(reviewRequests.id, req.id));
    sent++;
  }
  return sent;
}

/** Merchant asks for a review for one order right now. */
export async function requestForOrder(ctx: AppContext, merchant: Merchant, orderId: string): Promise<whatsappApi.ReviewDto> {
  await requireFeature(ctx.db, merchant, "restaurant.reviews");
  if (!merchant.googleReviewUrl) throw badRequest("Add your Google review link first");
  const [o] = await ctx.db.select({ userId: orders.userId, id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.merchantId, merchant.id))).limit(1);
  if (!o) throw notFound("Order");
  const req = await scheduleReviewRequest(ctx, { merchantId: merchant.id, userId: o.userId, sourceId: o.id });
  if (!req) throw badRequest("We can't ask this customer: they have no consented channel, or were asked recently.");
  await sendDueReviewRequests(ctx, { immediateFor: req.id });
  const [fresh] = await ctx.db.select().from(reviewRequests).where(eq(reviewRequests.id, req.id)).limit(1);
  return dto(fresh!, null);
}

// ---------------------------------------------------------------------------
// Public page
// ---------------------------------------------------------------------------
async function byToken(ctx: AppContext, token: string): Promise<{ req: Request; merchant: Merchant }> {
  const [req] = await ctx.db.select().from(reviewRequests).where(eq(reviewRequests.token, token)).limit(1);
  if (!req) throw notFound("Review request");
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, req.merchantId)).limit(1);
  if (!merchant) throw notFound("Review request");
  return { req, merchant };
}

export async function getPublicReview(ctx: AppContext, token: string): Promise<whatsappApi.PublicReviewView> {
  const { req, merchant } = await byToken(ctx, token);
  if (!req.clickedAt) await ctx.db.update(reviewRequests).set({ clickedAt: ctx.now() }).where(eq(reviewRequests.id, req.id));
  return { merchant: { name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl }, googleReviewUrl: merchant.googleReviewUrl, alreadyResponded: req.rating != null, rating: req.rating };
}

export async function submitReview(ctx: AppContext, token: string, input: whatsappApi.ReviewSubmitBody): Promise<whatsappApi.ReviewSubmitResponse> {
  const body = whatsappApi.reviewSubmitBody.parse(input);
  const { req, merchant } = await byToken(ctx, token);
  const respond = (rating: number): whatsappApi.ReviewSubmitResponse => ({
    rating,
    leadWithGoogle: rating >= 4,
    googleReviewUrl: merchant.googleReviewUrl,
    message:
      rating >= 4
        ? `Thank you. If you have a minute, a Google review helps ${merchant.name} a lot.`
        : `Thank you for telling us. ${merchant.name} will read this and may reach out. You are also welcome to leave a public Google review.`,
  });
  // One rating per request; a repeat submit (double tap, refresh) returns the stored answer.
  if (req.rating != null) return respond(req.rating);
  const [claimed] = await ctx.db
    .update(reviewRequests)
    .set({ rating: body.rating, feedback: body.feedback?.trim() || null, clickedAt: req.clickedAt ?? ctx.now() })
    .where(and(eq(reviewRequests.id, req.id), isNull(reviewRequests.rating)))
    .returning({ id: reviewRequests.id });
  if (!claimed) return respond((await byToken(ctx, token)).req.rating ?? body.rating);
  if (body.rating <= 3) await notifyLowRating(ctx, merchant, req, body.rating, body.feedback?.trim() ?? null);
  return respond(body.rating);
}

async function notifyLowRating(ctx: AppContext, merchant: Merchant, req: Request, rating: number, feedback: string | null): Promise<void> {
  try {
    const [cust] = await ctx.db.select({ name: users.name, phone: users.phone, email: users.email }).from(users).where(eq(users.id, req.userId)).limit(1);
    const staff = await ctx.db
      .select({ email: users.email, role: merchantStaff.role })
      .from(merchantStaff)
      .innerJoin(users, eq(users.id, merchantStaff.userId))
      .where(and(eq(merchantStaff.merchantId, merchant.id), or(eq(merchantStaff.role, "owner"), eq(merchantStaff.role, "manager"))));
    const to = [...new Set([merchant.email, ...staff.map((s) => s.email)].filter((e): e is string => !!e))];
    const text = `${cust?.name ?? "A customer"} rated ${merchant.name} ${rating} out of 5.\n\n${feedback ? `They wrote: "${feedback}"\n\n` : ""}Reach out: ${cust?.phone ?? cust?.email ?? "no contact on file"}.\nThis stayed private; they were also offered the public Google review link.\n\n${BRAND.name}`;
    for (const addr of to) await ctx.providers.email.send({ to: addr, subject: `${rating}-star feedback at ${merchant.name}`, text }).catch(() => undefined);
    await writeAudit(ctx.db, { actorUserId: null, merchantId: merchant.id, action: "review.low_rating", entity: "review_request", entityId: req.id, data: { rating } });
  } catch {
    // never fail the customer's submit because a notification failed
  }
}

// ---------------------------------------------------------------------------
// Merchant list and stats
// ---------------------------------------------------------------------------
function dto(r: Request, customer: { id: string; name: string | null } | null): whatsappApi.ReviewDto {
  return {
    id: r.id,
    orderId: r.orderId,
    customer: customer ?? { id: r.userId, name: null },
    channel: r.channel,
    rating: r.rating,
    feedback: r.feedback,
    sentAt: r.sentAt?.toISOString() ?? null,
    responded: r.rating != null,
    clickedAt: r.clickedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listReviews(ctx: AppContext, merchant: Merchant, q: { rating?: number; status?: "responded" | "pending"; limit: number; cursor?: string }) {
  await requireFeature(ctx.db, merchant, "restaurant.reviews");
  const c = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select({ r: reviewRequests, name: users.name })
    .from(reviewRequests)
    .innerJoin(users, eq(users.id, reviewRequests.userId))
    .where(
      and(
        eq(reviewRequests.merchantId, merchant.id),
        q.rating ? eq(reviewRequests.rating, q.rating) : undefined,
        q.status === "responded" ? isNotNull(reviewRequests.rating) : q.status === "pending" ? isNull(reviewRequests.rating) : undefined,
        c ? or(lt(reviewRequests.createdAt, c.createdAt), and(eq(reviewRequests.createdAt, c.createdAt), lt(reviewRequests.id, c.id))) : undefined,
      ),
    )
    .orderBy(desc(reviewRequests.createdAt), desc(reviewRequests.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map((x) => dto(x.r, { id: x.r.userId, name: x.name })), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.r) : null };
}

export async function reviewStats(ctx: AppContext, merchant: Merchant): Promise<whatsappApi.ReviewStats> {
  await requireFeature(ctx.db, merchant, "restaurant.reviews");
  const rows = await ctx.db
    .select({ rating: reviewRequests.rating, sent: sql<number>`count(${reviewRequests.sentAt})::int`, opened: sql<number>`count(${reviewRequests.clickedAt})::int`, n: count() })
    .from(reviewRequests)
    .where(eq(reviewRequests.merchantId, merchant.id))
    .groupBy(reviewRequests.rating);
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let requested = 0, sent = 0, opened = 0, responded = 0, sum = 0;
  for (const r of rows) {
    requested += r.n;
    sent += r.sent;
    opened += r.opened;
    if (r.rating != null) {
      responded += r.n;
      sum += r.rating * r.n;
      distribution[String(r.rating) as keyof typeof distribution] += r.n;
    }
  }
  return {
    requested,
    sent,
    responded,
    responseRate: sent ? Number(Math.min(1, responded / sent).toFixed(4)) : 0,
    averageRating: responded ? Number((sum / responded).toFixed(2)) : null,
    distribution,
    opened,
    googleReviewUrl: merchant.googleReviewUrl,
  };
}

export async function saveReviewSettings(ctx: AppContext, merchant: Merchant, actorUserId: string, body: { googleReviewUrl: string | null }) {
  await requireFeature(ctx.db, merchant, "restaurant.reviews");
  await ctx.db.update(merchants).set({ googleReviewUrl: body.googleReviewUrl, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "reviews.settings", entity: "merchant", entityId: merchant.id, data: { googleReviewUrl: body.googleReviewUrl } });
  return { googleReviewUrl: body.googleReviewUrl };
}
