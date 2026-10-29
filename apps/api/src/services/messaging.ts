/**
 * Merchant messaging: campaigns (email free, SMS Plus, push), segments,
 * CASL-compliant recipient selection, automations (Plus), birthday bonuses
 * (free), inbound STOP handling and monthly SMS credit resets.
 *
 * CASL rules enforced here (never in the client):
 *  - promotional recipients = members with marketing_consent_at set AND muted = false
 *  - every message carries the merchant name and an opt-out
 */
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import {
  auditLogs,
  locations,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  messageDeliveries,
  messages,
  pushTokens,
  rewards,
  users,
  visits,
  type DbOrTx,
} from "@ll/db";
import { PLANS, isStopKeyword, messagingApi, normalizeReplyWord } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { hmacSha256, safeEqual } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { postTransaction } from "./ledger.js";
import { rhythmSegmentIds } from "./member-stats.js";
import { inQuietHours } from "./notifications.js";
import { addPassMessage, hasWalletPass, notifyPassUpdate } from "./wallet.js";
import { localDayStart } from "./staff.js";
import { writeAudit } from "./admin-audit.js";
import { iso } from "./merchant.js";
import { decodeCursor, encodeCursor } from "./merchant-customers.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";
import { assertBeautyClaims } from "./beauty-guard.js";
import { assertPharmacyText, isPharmacy } from "./pharmacy-guard.js";
import { checkPharmacyText, publicPlaceLine } from "@ll/shared";
import { recordPhoneOptOut } from "./opt-out.js";
import { attachInboundSms } from "./inbox.js";

type Merchant = typeof merchants.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type Channel = messagingApi.Channel;
type Segment = messagingApi.Segment;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Local YYYY-MM-DD in a timezone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

// ---- phase-solo: A: the text allowance lives in text-allowance.ts (a leaf module notifications.ts can import) ----
export { reserveTransactionalText, smsAllowance, smsOverage } from "./text-allowance.js";
import { smsAllowance } from "./text-allowance.js";
// ---- end phase-solo: A ----

export function unsubscribeToken(ctx: AppContext, memberId: string): string {
  return hmacSha256(ctx.config.jwtSecret, `unsub:${memberId}`).slice(0, 32);
}

/** RFC 8058 headers: mail apps show their own Unsubscribe button and POST `List-Unsubscribe=One-Click` to the link (no page, no GET). */
export function unsubscribeHeaders(ctx: AppContext, memberId: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubscribeUrl(ctx, memberId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export function unsubscribeUrl(ctx: AppContext, memberId: string): string {
  return `${ctx.config.publicApiUrl.replace(/\/$/, "")}/v1/public/messaging/unsubscribe?m=${memberId}&t=${unsubscribeToken(ctx, memberId)}`;
}

/**
 * The shop's street address (first active location), printed in every promotional text. A home studio or a travelling pro
 * gives its public line instead ("Bloor West area", "Toronto"): a promo goes to people who have not booked (phase-solo B, §2.3).
 */
export async function merchantAddress(db: DbOrTx, merchantId: string): Promise<string | null> {
  const [l] = await db
    .select({ address: locations.address, addressVisibility: locations.addressVisibility, areaLabel: locations.areaLabel, city: locations.city })
    .from(locations)
    .where(and(eq(locations.merchantId, merchantId), eq(locations.active, true)))
    .orderBy(locations.createdAt)
    .limit(1);
  return l ? publicPlaceLine(l) || null : null;
}

/** Footer required by CASL: identifies the sender and gives a working opt-out. */
export function withFooter(ctx: AppContext, channel: Channel, merchantName: string, body: string, memberId: string, address?: string | null): string {
  if (channel === "sms") return `${body}\n— ${messagingApi.smsFooterText(merchantName, address)}`;
  if (channel === "push") return `${body} (${merchantName} · mute this shop in the app to stop offers)`;
  return `${body}\n\n—\nSent by ${merchantName} via Local Loyalty because you opted in to offers from them.\nUnsubscribe: ${unsubscribeUrl(ctx, memberId)}`;
}

interface Personal {
  name: string | null;
  balance: number;
}
export function personalize(text: string, p: Personal, merchantName: string, terminology: string): string {
  const first = p.name?.trim().split(/\s+/)[0] ?? "";
  return text
    .replace(/\{\{\s*first_name\s*\}\}/g, first || "there")
    .replace(/\{\{\s*name\s*\}\}/g, p.name?.trim() || "there")
    .replace(/\{\{\s*balance\s*\}\}/g, String(p.balance))
    .replace(/\{\{\s*terminology\s*\}\}/g, terminology)
    .replace(/\{\{\s*merchant\s*\}\}/g, merchantName);
}

/** A pharmacy's message can only be about the front store (services/pharmacy-guard.ts). Checked on create, edit, send and every automation run. */
function assertPharmacyContent(merchant: Pick<Merchant, "vertical">, subject: string | null | undefined, body: string | null | undefined) {
  assertPharmacyText(merchant, subject, "The subject");
  assertBeautyClaims(merchant, subject, "The subject");
  assertPharmacyText(merchant, body, "The message");
  assertBeautyClaims(merchant, body, "The message");
}

function validateContent(channel: Channel, subject: string | null | undefined, body: string) {
  if (channel === "email" && !subject) throw badRequest("Email campaigns need a subject");
  if (channel === "sms" && body.length > messagingApi.SMS_MAX_BODY) throw badRequest(`SMS messages are limited to ${messagingApi.SMS_MAX_BODY} characters`);
  if (channel === "push" && body.length > messagingApi.PUSH_MAX_BODY) throw badRequest(`Push messages are limited to ${messagingApi.PUSH_MAX_BODY} characters`);
}

/** Feature gate per channel: email/push are free (marketing.email), SMS is Plus (marketing.sms). */
export async function requireChannel(db: DbOrTx, merchant: Merchant, channel: Channel) {
  await requireFeature(db, merchant, channel === "sms" ? "marketing.sms" : "marketing.email");
}

// ---------------------------------------------------------------------------
// Segments + CASL recipient filtering
// ---------------------------------------------------------------------------
async function minRewardCost(db: DbOrTx, merchantId: string): Promise<number | null> {
  const [row] = await db
    .select({ min: sql<number | null>`min(${rewards.pointsCost})::int` })
    .from(rewards)
    .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true)));
  return row?.min == null ? null : Number(row.min);
}

export async function segmentCondition(db: DbOrTx, merchantId: string, segment: Segment, now: Date): Promise<SQL> {
  const base = eq(merchantMembers.merchantId, merchantId);
  switch (segment.kind) {
    case "all":
      return base;
    case "lapsed": {
      const since = new Date(now.getTime() - segment.days * 86400000);
      return and(base, or(lt(merchantMembers.lastVisitAt, since), and(isNull(merchantMembers.lastVisitAt), lt(merchantMembers.createdAt, since))))!;
    }
    case "regulars":
    case "slipping": {
      const [m] = await db.select({ tz: merchants.timezone }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
      const ids = await rhythmSegmentIds(db, merchantId, m?.tz ?? "America/Toronto", now, segment.kind);
      return ids.length ? and(base, inArray(merchantMembers.id, ids))! : and(base, sql`false`)!;
    }
    case "vip":
      return and(base, segment.vipLevelId ? eq(merchantMembers.vipLevelId, segment.vipLevelId) : isNotNull(merchantMembers.vipLevelId))!;
    case "reward_ready": {
      const min = await minRewardCost(db, merchantId);
      return min === null ? and(base, sql`false`)! : and(base, gte(merchantMembers.balance, min))!;
    }
    case "tag":
      return and(base, sql`${merchantMembers.tags} @> ${JSON.stringify([segment.tag.toLowerCase()])}::jsonb`)!;
    case "new":
      return and(base, gte(merchantMembers.createdAt, new Date(now.getTime() - segment.days * 86400000)))!;
  }
}

export interface Recipient {
  memberId: string;
  userId: string;
  name: string | null;
  balance: number;
  /** Addresses for this channel: one email/phone, or every push token. */
  to: string[];
}

/** CASL: consent given and not muted. Deleted users never receive anything. */
export const caslConsented = and(isNotNull(merchantMembers.marketingConsentAt), eq(merchantMembers.muted, false), isNull(users.deletedAt))!;

export async function resolveAudience(db: DbOrTx, merchantId: string, channel: Channel, where: SQL) {
  const rows = await db
    .select({
      memberId: merchantMembers.id,
      userId: merchantMembers.userId,
      consentAt: merchantMembers.marketingConsentAt,
      muted: merchantMembers.muted,
      balance: merchantMembers.balance,
      name: users.name,
      email: users.email,
      phone: users.phone,
      deletedAt: users.deletedAt,
    })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(where);
  const live = rows.filter((r) => !r.deletedAt);
  const consented = live.filter((r) => r.consentAt && !r.muted);
  let tokens = new Map<string, string[]>();
  if (channel === "push" && consented.length) {
    const t = await db
      .select({ userId: pushTokens.userId, token: pushTokens.token })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, consented.map((r) => r.userId)));
    tokens = t.reduce((m, r) => m.set(r.userId, [...(m.get(r.userId) ?? []), r.token]), new Map<string, string[]>());
  }
  // A number that replied STOP (to any shop's text) is off every SMS list, whatever the consent record says.
  const stopped = channel === "sms" ? await optedOutSet(db, consented.map((r) => r.phone), "sms") : new Set<string>();
  const recipients: Recipient[] = [];
  for (const r of consented) {
    const to = channel === "email" ? (r.email ? [r.email] : []) : channel === "sms" ? (r.phone && !isSuppressed(stopped, r.phone) ? [r.phone] : []) : (tokens.get(r.userId) ?? []);
    if (to.length) recipients.push({ memberId: r.memberId, userId: r.userId, name: r.name, balance: r.balance, to });
  }
  return {
    recipients,
    matched: live.length,
    excludedNoConsent: live.filter((r) => !r.consentAt).length,
    excludedMuted: live.filter((r) => r.consentAt && r.muted).length,
    excludedNoContact: consented.length - recipients.length,
  };
}

export async function previewAudience(ctx: AppContext, merchant: Merchant, channel: Channel, segment: Segment): Promise<messagingApi.AudiencePreview> {
  const a = await resolveAudience(ctx.db, merchant.id, channel, await segmentCondition(ctx.db, merchant.id, segment, ctx.now()));
  const remaining = channel === "sms" ? Math.max(0, smsAllowance(merchant) - merchant.smsCreditsUsed) : null;
  return {
    channel,
    matched: a.matched,
    recipients: a.recipients.length,
    excludedNoConsent: a.excludedNoConsent,
    excludedMuted: a.excludedMuted,
    excludedNoContact: a.excludedNoContact,
    smsCreditsNeeded: channel === "sms" ? a.recipients.length : 0,
    smsCreditsRemaining: remaining,
  };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
/** Atomically reserve SMS credits. Returns false if the monthly allowance would be exceeded. */
export async function reserveSmsCredits(db: DbOrTx, merchant: Merchant, n: number): Promise<boolean> {
  if (n === 0) return true;
  const allowance = smsAllowance(merchant);
  const r = await db
    .update(merchants)
    .set({ smsCreditsUsed: sql`${merchants.smsCreditsUsed} + ${n}` })
    .where(and(eq(merchants.id, merchant.id), sql`${merchants.smsCreditsUsed} + ${n} <= ${allowance}`))
    .returning({ used: merchants.smsCreditsUsed });
  return r.length > 0;
}

export const smsCreditsExhausted = (needed: number, remaining: number) =>
  new HttpError(402, "sms_credits_exhausted", `This send needs ${needed} SMS credits but only ${remaining} are left this month.`, { needed, remaining });

interface DeliverArgs {
  merchant: Merchant;
  terminology: string;
  channel: Channel;
  subject: string | null;
  body: string;
  messageId: string;
  recipients: Recipient[];
  /** Street address for the SMS footer (looked up once per send). */
  address?: string | null;
}

/** Send to recipients and log a delivery row per address. SMS credits must already be reserved. */
async function deliver(ctx: AppContext, a: DeliverArgs): Promise<number> {
  let sent = 0;
  for (const r of a.recipients) {
    const text = withFooter(ctx, a.channel, a.merchant.name, personalize(a.body, r, a.merchant.name, a.terminology), r.memberId, a.address);
    const subject = a.subject ? personalize(a.subject, r, a.merchant.name, a.terminology) : null;
    for (const to of r.to) {
      let status = "sent";
      let providerId: string | null = null;
      let error: string | null = null;
      try {
        if (a.channel === "email") providerId = (await ctx.providers.email.send({ to, subject: subject ?? a.merchant.name, text, headers: unsubscribeHeaders(ctx, r.memberId) })).id;
        else if (a.channel === "sms") {
          const r = await sendSms(ctx, to, text);
          if (!r) {
            status = "skipped";
            error = "opted_out";
          } else providerId = r.id;
        } else {
          const res = await ctx.providers.push.send([{ token: to, title: subject ?? a.merchant.name, body: text, data: { merchantId: a.merchant.id, messageId: a.messageId } }]);
          if (res.failed) status = "failed";
        }
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
      }
      if (status === "sent") sent++;
      await ctx.db.insert(messageDeliveries).values({
        messageId: a.messageId,
        userId: r.userId,
        merchantId: a.merchant.id,
        channel: a.channel,
        to,
        body: text,
        kind: "marketing",
        status,
        providerId,
        error,
        createdAt: ctx.now(),
      });
    }
  }
  return sent;
}

async function programTerminology(db: DbOrTx, merchantId: string): Promise<string> {
  const [p] = await db.select({ t: loyaltyPrograms.terminology }).from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  return p?.t ?? "points";
}

/** The next 08:00 in shop time (end of quiet hours), strictly after `at`. */
export function nextQuietEnd(at: Date, timeZone: string): Date {
  const dayStart = localDayStart(at, timeZone).start.getTime();
  const today8 = new Date(dayStart + 8 * 3600_000);
  if (today8 > at) return today8;
  // Midday tomorrow lands on tomorrow's date whatever the DST shift, so its local midnight is the day to count from.
  return new Date(localDayStart(new Date(dayStart + 36 * 3600_000), timeZone).start.getTime() + 8 * 3600_000);
}

/**
 * Send a campaign now. Claims the message (draft/scheduled → sending) so a
 * concurrent job run can't double-send, checks the feature and SMS credits,
 * then delivers. Throws for an interactive send; the job marks failures.
 */
export async function sendCampaign(ctx: AppContext, merchantId: string, messageId: string): Promise<MessageRow> {
  const [claimed] = await ctx.db
    .update(messages)
    .set({ status: "sending" })
    .where(and(eq(messages.id, messageId), eq(messages.merchantId, merchantId), isNull(messages.automation), inArray(messages.status, ["draft", "scheduled"])))
    .returning();
  if (!claimed) {
    const [m] = await ctx.db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.merchantId, merchantId), isNull(messages.automation))).limit(1);
    if (!m) throw notFound("Message");
    throw conflict(`This message is already ${m.status}`);
  }
  const revert = async (status: "draft" | "scheduled" | "failed") => {
    await ctx.db.update(messages).set({ status }).where(eq(messages.id, messageId));
  };
  try {
    const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
    if (!merchant) throw notFound("Merchant");
    if (merchant.status === "paused" || merchant.status === "closed") throw conflict("This shop is paused; messages can't be sent");
    // Last look, for a draft or a scheduled message written before these rules (or by a script): a pharmacy never sends dispensary text.
    assertPharmacyContent(merchant, claimed.subject, claimed.body);
    const channel = claimed.channel;
    await requireChannel(ctx.db, merchant, channel);
    // Promotional texts never go out in quiet hours (21:00 to 08:00 shop time): queue until 08:00.
    if (channel === "sms" && inQuietHours(ctx.now(), merchant.timezone)) {
      const [queued] = await ctx.db.update(messages).set({ status: "scheduled", scheduledAt: nextQuietEnd(ctx.now(), merchant.timezone) }).where(eq(messages.id, messageId)).returning();
      return queued!;
    }
    const segment = messagingApi.segmentSchema.parse(claimed.segment);
    const audience = await resolveAudience(ctx.db, merchantId, channel, await segmentCondition(ctx.db, merchantId, segment, ctx.now()));
    if (channel === "sms" && !(await reserveSmsCredits(ctx.db, merchant, audience.recipients.length))) {
      throw smsCreditsExhausted(audience.recipients.length, Math.max(0, smsAllowance(merchant) - merchant.smsCreditsUsed));
    }
    await deliver(ctx, {
      merchant,
      terminology: await programTerminology(ctx.db, merchantId),
      channel,
      subject: claimed.subject,
      body: claimed.body,
      messageId,
      recipients: audience.recipients,
      address: channel === "sms" ? await merchantAddress(ctx.db, merchantId) : null,
    });
    const [done] = await ctx.db
      .update(messages)
      .set({ status: "sent", sentAt: ctx.now(), recipientCount: audience.recipients.length })
      .where(eq(messages.id, messageId))
      .returning();
    return done!;
  } catch (err) {
    // Interactive sends of a draft go back to draft so the merchant can fix and retry.
    await revert(claimed.status === "draft" ? "draft" : "failed");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Campaign CRUD
// ---------------------------------------------------------------------------
export function serializeMessage(m: MessageRow): messagingApi.Message {
  return {
    id: m.id,
    channel: m.channel,
    subject: m.subject,
    body: m.body,
    segment: m.segment as Segment,
    status: m.status,
    scheduledAt: iso(m.scheduledAt),
    sentAt: iso(m.sentAt),
    recipientCount: m.recipientCount,
    createdAt: m.createdAt.toISOString(),
    cameIn7d: null,
    cameIn7dFinal: false,
  };
}

/**
 * Distinct recipients of each sent message who visited the shop within 7 days after it went out.
 * Result = "came in", never opens. `final` once 7 full days have passed.
 */
export async function cameIn7dFor(ctx: AppContext, merchantId: string, rows: MessageRow[]): Promise<Map<string, { n: number; final: boolean }>> {
  const sent = rows.filter((r) => r.sentAt && !r.automation);
  const out = new Map<string, { n: number; final: boolean }>();
  if (!sent.length) return out;
  const found = await ctx.db
    .select({ id: messageDeliveries.messageId, n: sql<number>`count(distinct ${messageDeliveries.userId})::int` })
    .from(messageDeliveries)
    .innerJoin(messages, eq(messages.id, messageDeliveries.messageId))
    .innerJoin(
      visits,
      and(eq(visits.userId, messageDeliveries.userId), eq(visits.merchantId, merchantId), gt(visits.createdAt, messages.sentAt), lte(visits.createdAt, sql`${messages.sentAt} + interval '7 days'`)),
    )
    .where(and(inArray(messageDeliveries.messageId, sent.map((r) => r.id)), inArray(messageDeliveries.status, ["sent", "delivered"])))
    .groupBy(messageDeliveries.messageId);
  const by = new Map(found.map((f) => [f.id, Number(f.n)]));
  for (const r of sent) out.set(r.id, { n: by.get(r.id) ?? 0, final: r.sentAt!.getTime() + 7 * 86400000 <= ctx.now().getTime() });
  return out;
}

async function getCampaign(db: DbOrTx, merchantId: string, id: string) {
  const [m] = await db.select().from(messages).where(and(eq(messages.id, id), eq(messages.merchantId, merchantId), isNull(messages.automation))).limit(1);
  if (!m) throw notFound("Message");
  return m;
}

export async function listCampaigns(ctx: AppContext, merchantId: string, q: { status?: messagingApi.MessageStatus; limit: number; cursor?: string }) {
  const offset = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.merchantId, merchantId), isNull(messages.automation), q.status ? eq(messages.status, q.status) : undefined))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(q.limit + 1)
    .offset(offset);
  const page = rows.slice(0, q.limit);
  const came = await cameIn7dFor(ctx, merchantId, page);
  const items = page.map((m) => ({ ...serializeMessage(m), cameIn7d: came.get(m.id)?.n ?? null, cameIn7dFinal: came.get(m.id)?.final ?? false }));
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

export async function getCampaignDetail(ctx: AppContext, merchant: Merchant, id: string): Promise<messagingApi.MessageDetail> {
  const m = await getCampaign(ctx.db, merchant.id, id);
  const stats = await ctx.db
    .select({ status: messageDeliveries.status, n: sql<number>`count(*)::int` })
    .from(messageDeliveries)
    .where(eq(messageDeliveries.messageId, id))
    .groupBy(messageDeliveries.status);
  const by = Object.fromEntries(stats.map((s) => [s.status, Number(s.n)]));
  const terminology = await programTerminology(ctx.db, merchant.id);
  const sample = personalize(m.body, { name: "Alex Smith", balance: 120 }, merchant.name, terminology);
  const came = (await cameIn7dFor(ctx, merchant.id, [m])).get(m.id);
  return {
    ...serializeMessage(m),
    cameIn7d: came?.n ?? null,
    cameIn7dFinal: came?.final ?? false,
    stats: { queued: by.queued ?? 0, sent: by.sent ?? 0, delivered: by.delivered ?? 0, failed: by.failed ?? 0 },
    preview: withFooter(ctx, m.channel, merchant.name, sample, "00000000-0000-0000-0000-000000000000", m.channel === "sms" ? await merchantAddress(ctx.db, merchant.id) : null),
  };
}

// ---------------------------------------------------------------------------
// Send a test to myself
// ---------------------------------------------------------------------------
export const TEST_SENDS_PER_DAY = 10;

/**
 * Send the rendered message (personalization + CASL footer) to the requesting
 * staff user's own email / phone / push tokens only. Transactional: no audience,
 * no consent check, no delivery stats on the campaign. SMS uses exactly 1 credit.
 * Limited to TEST_SENDS_PER_DAY per user per shop (rolling 24 h, counted in audit_logs).
 */
/** Tests this user sent for this shop in the last 24 hours (every channel, counted in audit_logs). */
export async function testSendsUsedToday(ctx: AppContext, merchantId: string, actorUserId: string): Promise<number> {
  const [used] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(eq(auditLogs.merchantId, merchantId), eq(auditLogs.actorUserId, actorUserId), eq(auditLogs.action, "message.test_sent"), gte(auditLogs.createdAt, new Date(ctx.now().getTime() - 86_400_000))));
  return Number(used?.n ?? 0);
}

export async function sendTestToSelf(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string): Promise<messagingApi.TestSendResult> {
  const m = await getCampaign(ctx.db, merchant.id, id);
  return deliverTestToSelf(ctx, merchant, actorUserId, { channel: m.channel, subject: m.subject, body: m.body, entityId: m.id });
}

/** The shared test-send: renders `body` (personalization + CASL footer) and delivers it to the signed-in user's own address. */
export async function deliverTestToSelf(
  ctx: AppContext,
  merchant: Merchant,
  actorUserId: string,
  m: { channel: messagingApi.TestSendResult["channel"]; subject: string | null; body: string; entityId: string; entity?: string },
): Promise<messagingApi.TestSendResult> {
  await requireChannel(ctx.db, merchant, m.channel);
  const now = ctx.now();
  const usedToday = await testSendsUsedToday(ctx, merchant.id, actorUserId);
  if (usedToday >= TEST_SENDS_PER_DAY) throw tooMany(`You can send ${TEST_SENDS_PER_DAY} tests a day. Try again tomorrow.`);

  const [me] = await ctx.db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, actorUserId)).limit(1);
  const [membership] = await ctx.db
    .select({ id: merchantMembers.id, balance: merchantMembers.balance })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, actorUserId)))
    .limit(1);
  let to: string[] = [];
  if (m.channel === "email") to = me?.email ? [me.email] : [];
  else if (m.channel === "sms") to = me?.phone ? [me.phone] : [];
  else to = (await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, actorUserId))).map((t) => t.token);
  if (!to.length) {
    const what = m.channel === "email" ? "an email address" : m.channel === "sms" ? "a phone number" : "the app signed in on a phone";
    throw badRequest(`Your account needs ${what} to receive a ${m.channel === "push" ? "push" : m.channel === "sms" ? "text" : "email"} test`);
  }
  if (m.channel === "sms" && !(await reserveSmsCredits(ctx.db, merchant, 1))) throw smsCreditsExhausted(1, Math.max(0, smsAllowance(merchant) - merchant.smsCreditsUsed));

  const terminology = await programTerminology(ctx.db, merchant.id);
  const personal = { name: me?.name ?? null, balance: membership?.balance ?? 0 };
  const text = withFooter(ctx, m.channel, merchant.name, personalize(m.body, personal, merchant.name, terminology), membership?.id ?? "00000000-0000-0000-0000-000000000000", m.channel === "sms" ? await merchantAddress(ctx.db, merchant.id) : null);
  const subject = `[Test] ${m.subject ? personalize(m.subject, personal, merchant.name, terminology) : merchant.name}`;
  let sent = 0;
  for (const addr of to) {
    let status = "sent";
    let providerId: string | null = null;
    let error: string | null = null;
    try {
      if (m.channel === "email") providerId = (await ctx.providers.email.send({ to: addr, subject, text, headers: membership?.id ? unsubscribeHeaders(ctx, membership.id) : undefined })).id;
      else if (m.channel === "sms") providerId = (await sendSms(ctx, addr, `[Test] ${text}`))?.id ?? null;
      else if ((await ctx.providers.push.send([{ token: addr, title: subject, body: text, data: { merchantId: merchant.id, test: "1" } }])).failed) status = "failed";
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
    }
    if (status === "sent") sent++;
    // messageId stays null so tests never count in the campaign's delivery stats.
    await ctx.db.insert(messageDeliveries).values({ messageId: null, userId: actorUserId, merchantId: merchant.id, channel: m.channel, to: addr, body: text, kind: "transactional", status, providerId, error, createdAt: now });
  }
  // createdAt from ctx.now() so the rolling 24 h window uses the same clock as the check above.
  await ctx.db.insert(auditLogs).values({ actorUserId, merchantId: merchant.id, action: "message.test_sent", entity: m.entity ?? "message", entityId: m.entityId, data: { channel: m.channel, addresses: to.length, sent }, createdAt: now });
  return {
    channel: m.channel,
    sent,
    to: m.channel === "push" ? to.map(() => "this device") : to,
    smsCreditsUsed: m.channel === "sms" ? 1 : 0,
    testsRemainingToday: TEST_SENDS_PER_DAY - usedToday - 1,
  };
}

export async function createCampaign(ctx: AppContext, merchant: Merchant, actorUserId: string, body: messagingApi.CreateMessageBody) {
  validateContent(body.channel, body.subject, body.body);
  assertPharmacyContent(merchant, body.subject, body.body);
  await requireChannel(ctx.db, merchant, body.channel);
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && scheduledAt <= ctx.now() && !body.sendNow) throw badRequest("Pick a time in the future, or send now");
  const [m] = await ctx.db
    .insert(messages)
    .values({
      merchantId: merchant.id,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
      segment: body.segment,
      status: scheduledAt && !body.sendNow ? "scheduled" : "draft",
      scheduledAt: body.sendNow ? null : scheduledAt,
      createdAt: ctx.now(),
    })
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "message.created", entity: "message", entityId: m!.id, data: { channel: body.channel, segment: body.segment } });
  if (body.sendNow) return sendCampaign(ctx, merchant.id, m!.id);
  return m!;
}

export async function updateCampaign(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string, body: z.infer<typeof messagingApi.updateMessageBody>) {
  const cur = await getCampaign(ctx.db, merchant.id, id);
  if (cur.status !== "draft" && cur.status !== "scheduled") throw conflict(`A ${cur.status} message can't be edited`);
  const channel = body.channel ?? cur.channel;
  validateContent(channel, body.subject !== undefined ? body.subject : cur.subject, body.body ?? cur.body);
  assertPharmacyContent(merchant, body.subject !== undefined ? body.subject : cur.subject, body.body ?? cur.body);
  if (body.channel && body.channel !== cur.channel) await requireChannel(ctx.db, merchant, body.channel);
  const set: Partial<typeof messages.$inferInsert> = {};
  if (body.channel) set.channel = body.channel;
  if (body.subject !== undefined) set.subject = body.subject;
  if (body.body) set.body = body.body;
  if (body.segment) set.segment = body.segment;
  if (body.scheduledAt !== undefined) {
    const at = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (at && at <= ctx.now()) throw badRequest("Pick a time in the future, or send now");
    set.scheduledAt = at;
    set.status = at ? "scheduled" : "draft";
  }
  const [m] = await ctx.db.update(messages).set(set).where(eq(messages.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "message.updated", entity: "message", entityId: id });
  return m!;
}

export async function cancelCampaign(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const [m] = await ctx.db
    .update(messages)
    .set({ status: "cancelled" })
    .where(and(eq(messages.id, id), eq(messages.merchantId, merchantId), isNull(messages.automation), inArray(messages.status, ["draft", "scheduled"])))
    .returning();
  if (!m) {
    const cur = await getCampaign(ctx.db, merchantId, id);
    throw conflict(`A ${cur.status} message can't be cancelled`);
  }
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "message.cancelled", entity: "message", entityId: id });
  return m;
}

export async function deleteCampaign(ctx: AppContext, merchantId: string, actorUserId: string, id: string) {
  const cur = await getCampaign(ctx.db, merchantId, id);
  if (cur.status !== "draft" && cur.status !== "cancelled") throw conflict("Only drafts and cancelled messages can be deleted");
  await ctx.db.delete(messages).where(eq(messages.id, id));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "message.deleted", entity: "message", entityId: id });
}

export async function smsUsage(ctx: AppContext, merchant: Merchant): Promise<messagingApi.SmsUsage> {
  const allowance = smsAllowance(merchant);
  const today = localDate(ctx.now(), "America/Toronto");
  const [y, mo] = today.split("-").map(Number) as [number, number];
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  return { used: merchant.smsCreditsUsed, allowance, remaining: Math.max(0, allowance - merchant.smsCreditsUsed), resetsOn: next };
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------
const AUTOMATION_META: Record<messagingApi.AutomationKind, { label: string; description: string; subject: string; body: string; days: number | null }> = {
  win_back: {
    label: "Win-back",
    description: "Message members who haven't visited in a while (once per lapse).",
    subject: "We miss you at {{merchant}}",
    body: "Hi {{first_name}}, it's been a while! You have {{balance}} {{terminology}} waiting at {{merchant}}. Come say hi this week.",
    days: messagingApi.LAPSED_DEFAULT_DAYS,
  },
  reward_ready: {
    label: "Reward ready",
    description: "Tell members when they have enough to redeem a reward (once per visit).",
    subject: "Your reward is ready at {{merchant}}",
    body: "Good news {{first_name}}: you have {{balance}} {{terminology}} at {{merchant}} — enough for a reward. Redeem it on your next visit!",
    days: null,
  },
  birthday: {
    label: "Birthday",
    description: "Wish members a happy birthday (once a year). Birthday points themselves are free and automatic.",
    subject: "Happy birthday from {{merchant}}!",
    body: "Happy birthday {{first_name}}! Everyone at {{merchant}} hopes you have a great day.",
    days: null,
  },
  welcome: {
    label: "Welcome",
    description: "Welcome new members right after they join.",
    subject: "Welcome to {{merchant}} rewards",
    body: "Thanks for joining {{merchant}} rewards, {{first_name}}! You have {{balance}} {{terminology}} so far.",
    days: null,
  },
};

interface AutomationConfig {
  kind?: "automation";
  days?: number | null;
  enabledAt?: string | null;
}

async function automationRows(db: DbOrTx, merchantId: string) {
  return db.select().from(messages).where(and(eq(messages.merchantId, merchantId), isNotNull(messages.automation)));
}

export async function listAutomations(ctx: AppContext, merchant: Merchant): Promise<messagingApi.Automation[]> {
  const [rows, features] = await Promise.all([automationRows(ctx.db, merchant.id), getMerchantFeatures(ctx.db, merchant)]);
  const counts = rows.length
    ? await ctx.db
        .select({ id: messageDeliveries.messageId, n: sql<number>`count(*)::int` })
        .from(messageDeliveries)
        .where(and(inArray(messageDeliveries.messageId, rows.map((r) => r.id)), eq(messageDeliveries.status, "sent")))
        .groupBy(messageDeliveries.messageId)
    : [];
  const sent = new Map(counts.map((c) => [c.id, Number(c.n)]));
  // People messaged in the last 30 days by each automation, and who came in within 7 days of it.
  const since = new Date(ctx.now().getTime() - 30 * 86400000);
  const recent = rows.length
    ? await ctx.db
        .select({ id: messageDeliveries.messageId, userId: messageDeliveries.userId, at: messageDeliveries.createdAt })
        .from(messageDeliveries)
        .where(and(inArray(messageDeliveries.messageId, rows.map((r) => r.id)), inArray(messageDeliveries.status, ["sent", "delivered"]), gte(messageDeliveries.createdAt, since)))
    : [];
  const userIds = [...new Set(recent.map((r) => r.userId))];
  const theirVisits = userIds.length
    ? await ctx.db.select({ userId: visits.userId, at: visits.createdAt }).from(visits).where(and(eq(visits.merchantId, merchant.id), inArray(visits.userId, userIds), gte(visits.createdAt, since)))
    : [];
  const last30 = (id: string | undefined) => {
    const mine = recent.filter((r) => r.id === id);
    const people = new Set(mine.map((r) => r.userId));
    const came = new Set(mine.filter((r) => theirVisits.some((v) => v.userId === r.userId && v.at > r.at && v.at.getTime() <= r.at.getTime() + 7 * 86400000)).map((r) => r.userId));
    return { messaged: people.size, cameIn7d: came.size };
  };
  return messagingApi.AUTOMATION_KINDS.map((kind) => {
    const meta = AUTOMATION_META[kind];
    const row = rows.find((r) => r.automation === kind);
    const cfg = (row?.segment ?? {}) as AutomationConfig;
    return {
      kind,
      label: meta.label,
      description: meta.description,
      enabled: row?.status === "scheduled",
      configured: !!row,
      channel: row?.channel ?? "email",
      subject: row ? row.subject : meta.subject,
      body: row?.body ?? meta.body,
      days: kind === "win_back" ? (cfg.days ?? meta.days) : null,
      sentCount: row ? (sent.get(row.id) ?? 0) : 0,
      last30Days: last30(row?.id),
      available: features["marketing.automations"].enabled,
    };
  });
}

export async function upsertAutomation(ctx: AppContext, merchant: Merchant, actorUserId: string, kind: messagingApi.AutomationKind, body: messagingApi.UpsertAutomationBody) {
  if (body.enabled) {
    await requireFeature(ctx.db, merchant, "marketing.automations");
    await requireChannel(ctx.db, merchant, body.channel);
  }
  validateContent(body.channel, body.subject ?? (body.channel === "email" ? AUTOMATION_META[kind].subject : null), body.body);
  assertPharmacyContent(merchant, body.subject, body.body);
  const [existing] = await ctx.db.select().from(messages).where(and(eq(messages.merchantId, merchant.id), eq(messages.automation, kind))).limit(1);
  const prevCfg = (existing?.segment ?? {}) as AutomationConfig;
  const wasEnabled = existing?.status === "scheduled";
  const cfg: AutomationConfig = {
    kind: "automation",
    days: kind === "win_back" ? (body.days ?? prevCfg.days ?? AUTOMATION_META.win_back.days) : null,
    // Only members who join/qualify after enabling are messaged (no surprise blasts to the back catalogue).
    enabledAt: body.enabled ? (wasEnabled ? (prevCfg.enabledAt ?? ctx.now().toISOString()) : ctx.now().toISOString()) : (prevCfg.enabledAt ?? null),
  };
  const values = {
    channel: body.channel,
    subject: body.subject ?? (body.channel === "email" ? AUTOMATION_META[kind].subject : null),
    body: body.body,
    segment: cfg as unknown as Record<string, unknown>,
    status: body.enabled ? ("scheduled" as const) : ("draft" as const),
  };
  if (existing) await ctx.db.update(messages).set(values).where(eq(messages.id, existing.id));
  else await ctx.db.insert(messages).values({ merchantId: merchant.id, automation: kind, ...values, createdAt: ctx.now() });
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "automation.updated", entity: "automation", entityId: kind, data: { enabled: body.enabled, channel: body.channel } });
  return (await listAutomations(ctx, merchant)).find((a) => a.kind === kind)!;
}

/** Members an automation should message right now (before CASL filtering). */
async function automationCandidates(ctx: AppContext, merchant: Merchant, row: MessageRow): Promise<SQL | null> {
  const now = ctx.now();
  const cfg = (row.segment ?? {}) as AutomationConfig;
  const enabledAt = cfg.enabledAt ? new Date(cfg.enabledAt) : now;
  const base = eq(merchantMembers.merchantId, merchant.id);
  const notSentSince = (since: SQL | Date) =>
    sql`not exists (select 1 from message_deliveries d where d.message_id = ${row.id} and d.user_id = ${merchantMembers.userId} and d.created_at >= ${since instanceof Date ? sql`${since.toISOString()}::timestamptz` : since})`;
  switch (row.automation as messagingApi.AutomationKind) {
    case "win_back": {
      const since = new Date(now.getTime() - (cfg.days ?? messagingApi.LAPSED_DEFAULT_DAYS) * 86400000);
      return and(base, isNotNull(merchantMembers.lastVisitAt), lt(merchantMembers.lastVisitAt, since), notSentSince(sql`${merchantMembers.lastVisitAt}`))!;
    }
    case "reward_ready": {
      const min = await minRewardCost(ctx.db, merchant.id);
      if (min === null) return null;
      return and(base, gte(merchantMembers.balance, min), notSentSince(sql`coalesce(${merchantMembers.lastVisitAt}, ${merchantMembers.createdAt})`))!;
    }
    case "birthday": {
      const today = localDate(now, merchant.timezone);
      const mmdd = today.slice(5);
      const year = Number(today.slice(0, 4));
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const days = mmdd === "02-28" && !leap ? ["02-28", "02-29"] : [mmdd];
      return and(
        base,
        isNotNull(users.birthday),
        inArray(users.birthday, days),
        notSentSince(new Date(`${year}-01-01T00:00:00Z`)),
      )!;
    }
    case "welcome":
      return and(base, gte(merchantMembers.createdAt, enabledAt), gte(merchantMembers.createdAt, new Date(now.getTime() - 7 * 86400000)), notSentSince(new Date(0)))!;
    default:
      return null;
  }
}

/**
 * "Free drink ready": update the member's Apple and Google Wallet pass (the balance already says
 * the reward is ready; a Google Wallet message adds a notification). Not marketing, so consent
 * is not needed. One delivery row per member records it so each visit is announced once.
 */
async function deliverRewardReadyToWallet(ctx: AppContext, merchant: Merchant, msg: MessageRow, where: SQL): Promise<number> {
  const rows = await ctx.db
    .select({ memberId: merchantMembers.id, userId: merchantMembers.userId, name: users.name, balance: merchantMembers.balance })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(where, isNull(users.deletedAt)));
  const terminology = await programTerminology(ctx.db, merchant.id);
  let sent = 0;
  for (const r of rows) {
    if (!(await hasWalletPass(ctx, r.userId))) continue;
    const text = personalize(msg.body, r, merchant.name, terminology);
    await addPassMessage(ctx, r.userId, { id: `reward-ready-${msg.id}-${r.memberId}-${ctx.now().getTime()}`, header: personalize(msg.subject ?? "Reward ready", r, merchant.name, terminology), body: text });
    await notifyPassUpdate(ctx, r.userId, { force: true });
    await ctx.db.insert(messageDeliveries).values({ messageId: msg.id, userId: r.userId, merchantId: merchant.id, channel: "push", to: "wallet pass", body: text, kind: "transactional", status: "sent", createdAt: ctx.now() });
    sent++;
  }
  if (sent) await ctx.db.update(messages).set({ recipientCount: sql`${messages.recipientCount} + ${sent}`, sentAt: ctx.now() }).where(eq(messages.id, msg.id));
  return sent;
}

/** One pass over every enabled automation. Returns messages sent. */
export async function runAutomations(ctx: AppContext): Promise<number> {
  const rows = await ctx.db
    .select({ msg: messages, merchant: merchants })
    .from(messages)
    .innerJoin(merchants, eq(merchants.id, messages.merchantId))
    .where(and(isNotNull(messages.automation), eq(messages.status, "scheduled"), inArray(merchants.status, ["onboarding", "active"])));
  let total = 0;
  for (const { msg, merchant } of rows) {
    if (isPharmacy(merchant) && (!checkPharmacyText(msg.body).ok || !checkPharmacyText(msg.subject).ok)) continue;
    const features = await getMerchantFeatures(ctx.db, merchant);
    if (!features["marketing.automations"].enabled) continue;
    if (!features[msg.channel === "sms" ? "marketing.sms" : "marketing.email"].enabled) continue;
    const where = await automationCandidates(ctx, merchant, msg);
    if (!where) continue;
    // Reward ready is a wallet pass update (lock screen), not a message: no consent or channel needed.
    if (msg.automation === "reward_ready" && msg.channel === "push") {
      total += await deliverRewardReadyToWallet(ctx, merchant, msg, where);
      continue;
    }
    if (msg.channel === "sms" && inQuietHours(ctx.now(), merchant.timezone)) continue;
    const audience = await resolveAudience(ctx.db, merchant.id, msg.channel, where);
    let recipients = audience.recipients;
    if (!recipients.length) continue;
    if (msg.channel === "sms") {
      const [fresh] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchant.id)).limit(1);
      const remaining = Math.max(0, smsAllowance(fresh!) - fresh!.smsCreditsUsed);
      recipients = recipients.slice(0, remaining);
      if (!recipients.length || !(await reserveSmsCredits(ctx.db, fresh!, recipients.length))) continue;
    }
    total += await deliver(ctx, {
      merchant,
      terminology: await programTerminology(ctx.db, merchant.id),
      channel: msg.channel,
      subject: msg.subject,
      body: msg.body,
      messageId: msg.id,
      recipients,
      address: msg.channel === "sms" ? await merchantAddress(ctx.db, merchant.id) : null,
    });
    await ctx.db
      .update(messages)
      .set({ recipientCount: sql`${messages.recipientCount} + ${recipients.length}`, sentAt: ctx.now() })
      .where(eq(messages.id, msg.id));
  }
  return total;
}

/** Send campaigns whose scheduled time has come. */
export async function sendScheduledCampaigns(ctx: AppContext): Promise<number> {
  const due = await ctx.db
    .select({ id: messages.id, merchantId: messages.merchantId })
    .from(messages)
    .where(and(isNull(messages.automation), eq(messages.status, "scheduled"), lte(messages.scheduledAt, ctx.now())));
  let sent = 0;
  for (const m of due) {
    try {
      await sendCampaign(ctx, m.merchantId, m.id);
      sent++;
    } catch (err) {
      if (!(err instanceof HttpError)) console.error("[messaging] scheduled send failed", m.id, err);
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Birthday bonus (FREE: loyalty.birthday_bonus) — points via the ledger
// ---------------------------------------------------------------------------
export async function awardBirthdayBonuses(ctx: AppContext): Promise<number> {
  const progs = await ctx.db
    .select({ merchant: merchants, bonus: loyaltyPrograms.birthdayBonus })
    .from(loyaltyPrograms)
    .innerJoin(merchants, eq(merchants.id, loyaltyPrograms.merchantId))
    .where(and(eq(loyaltyPrograms.active, true), sql`${loyaltyPrograms.birthdayBonus} > 0`, inArray(merchants.status, ["onboarding", "active"])));
  let awarded = 0;
  for (const { merchant, bonus } of progs) {
    const features = await getMerchantFeatures(ctx.db, merchant);
    if (!features["loyalty.birthday_bonus"].enabled) continue;
    const today = localDate(ctx.now(), merchant.timezone);
    const year = Number(today.slice(0, 4));
    const mmdd = today.slice(5);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = mmdd === "02-28" && !leap ? ["02-28", "02-29"] : [mmdd];
    const due = await ctx.db
      .select({ id: merchantMembers.id })
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .where(
        and(
          eq(merchantMembers.merchantId, merchant.id),
          isNull(users.deletedAt),
          inArray(users.birthday, days),
          or(isNull(merchantMembers.lastBirthdayBonusYear), sql`${merchantMembers.lastBirthdayBonusYear} <> ${year}`),
        ),
      );
    for (const m of due) {
      await ctx.db.transaction(async (tx) => {
        const r = await postTransaction(tx, {
          merchantId: merchant.id,
          memberId: m.id,
          type: "birthday_bonus",
          source: "system",
          points: bonus,
          description: "Happy birthday!",
          idempotencyKey: `birthday:${m.id}:${year}`,
        });
        await tx.update(merchantMembers).set({ lastBirthdayBonusYear: year }).where(eq(merchantMembers.id, m.id));
        if (!r.duplicate) awarded++;
      });
    }
  }
  return awarded;
}

// ---------------------------------------------------------------------------
// Monthly SMS credit reset (idempotent per month via the audit log)
// ---------------------------------------------------------------------------
export async function resetSmsCreditsIfNewMonth(ctx: AppContext): Promise<boolean> {
  const period = localDate(ctx.now(), "America/Toronto").slice(0, 7);
  const [done] = await ctx.db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "sms_credits.reset"), sql`${auditLogs.data}->>'period' = ${period}`))
    .limit(1);
  if (done) return false;
  await ctx.db.transaction(async (tx) => {
    await tx.update(merchants).set({ smsCreditsUsed: 0 }).where(sql`${merchants.smsCreditsUsed} <> 0`);
    await writeAudit(tx, { actorUserId: null, action: "sms_credits.reset", entity: "merchants", data: { period } });
  });
  return true;
}

// ---------------------------------------------------------------------------
// Opt-outs
// ---------------------------------------------------------------------------
export interface InboundSmsResult {
  action: "opted_out" | "help" | "none";
  merchantsAffected: number;
  /** Suggested reply text (null = don't reply). */
  reply: string | null;
}

/**
 * Inbound SMS from the Twilio webhook (wired by the integrations team).
 * STOP-type keywords withdraw marketing consent and mute the sender at every
 * merchant (we send SMS from shared numbers, so STOP applies network-wide).
 */
export async function handleInboundSms(ctx: AppContext, fromPhone: string, body: string): Promise<InboundSmsResult> {
  const word = normalizeReplyWord(body);
  if (word === "HELP" || word === "INFO" || word === "AIDE") {
    return { action: "help", merchantsAffected: 0, reply: "Local Loyalty: shop rewards messages. Reply STOP to opt out of all shops. Help: hello@localloyalty.example" };
  }
  if (!isStopKeyword(body)) {
    // phase-solo D: anything else (not START, which integrations-sms handles) is a reply: it lands in the sender's inbox thread.
    if (!/^(START|UNSTOP|YES|SUBSCRIBE)$/.test(word)) await attachInboundSms(ctx, fromPhone, body).catch(() => null);
    return { action: "none", merchantsAffected: 0, reply: null };
  }
  // The number goes on the do-not-contact list first, whoever it belongs to (a shopper, a shop owner, a wait-list guest).
  await recordPhoneOptOut(ctx, fromPhone, "sms", word, "sms_reply");
  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, fromPhone)).limit(1);
  if (!user) return { action: "opted_out", merchantsAffected: 0, reply: "You're unsubscribed from Local Loyalty shop messages. No more texts will be sent." };
  const rows = await ctx.db
    .update(merchantMembers)
    .set({ muted: true, marketingConsentAt: null, marketingConsentSource: `withdrawn:sms_stop:${ctx.now().toISOString()}` })
    .where(eq(merchantMembers.userId, user.id))
    .returning({ id: merchantMembers.id, merchantId: merchantMembers.merchantId });
  await writeAudit(ctx.db, { actorUserId: user.id, action: "consent.withdrawn_sms_stop", entity: "user", entityId: user.id, data: { merchants: rows.map((r) => r.merchantId), keyword: word } });
  return { action: "opted_out", merchantsAffected: rows.length, reply: "You're unsubscribed from Local Loyalty shop messages. No more texts will be sent." };
}

/** Checks an unsubscribe link and names the shop, without changing anything (the page a GET opens asks before it acts). */
export async function previewUnsubscribe(ctx: AppContext, memberId: string, token: string): Promise<{ merchantName: string }> {
  if (!safeEqual(token, unsubscribeToken(ctx, memberId))) throw badRequest("This unsubscribe link is invalid");
  const [row] = await ctx.db
    .select({ name: merchants.name })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .where(eq(merchantMembers.id, memberId))
    .limit(1);
  if (!row) throw notFound("Subscription");
  return { merchantName: row.name };
}

/** Email unsubscribe link: withdraws consent for that one merchant. Only ever called from a POST. */
export async function unsubscribeByToken(ctx: AppContext, memberId: string, token: string): Promise<messagingApi.UnsubscribeResponse> {
  if (!safeEqual(token, unsubscribeToken(ctx, memberId))) throw badRequest("This unsubscribe link is invalid");
  const [m] = await ctx.db
    .update(merchantMembers)
    .set({ marketingConsentAt: null, marketingConsentSource: `withdrawn:unsubscribe_link:${ctx.now().toISOString()}` })
    .where(eq(merchantMembers.id, memberId))
    .returning({ merchantId: merchantMembers.merchantId, userId: merchantMembers.userId });
  if (!m) throw notFound("Subscription");
  const [merchant] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, m.merchantId)).limit(1);
  await writeAudit(ctx.db, { actorUserId: m.userId, merchantId: m.merchantId, action: "consent.withdrawn_unsubscribe", entity: "member", entityId: memberId });
  return { ok: true, merchantName: merchant?.name ?? "this shop" };
}


// ---------------------------------------------------------------------------
// ---- phase-solo: D ---- Promos to regulars: seasonal templates per trade, the allowance, app push and email only
// ---------------------------------------------------------------------------
/** Bookings by promo recipients within this many days after the send count as "booked from this". */
export const PROMO_RESULT_DAYS = 14;
const PROMO_AUTOMATION = (key: string | null | undefined) => `promo:${key ?? "custom"}`;

function promoAllowanceDto(a: { limit: number; used: number; remaining: number; period: "month" | "year" | null; periodStart: string }): messagingApi.PromoAllowanceDto {
  return { limit: a.limit, used: a.used, remaining: a.remaining, period: a.period, periodStart: a.periodStart };
}

/**
 * Regulars for a promo: the shop's rhythm regulars (3+ visits in 30 days) and, for an appointment shop, anyone with two or more
 * completed appointments in the last year. Then CASL: consent, not muted, not deleted. Each person gets it once, by the first of
 * app push, web push or email they have. Never a text.
 */
export async function promoAudience(ctx: AppContext, merchant: Merchant, segment: "regulars" | "all") {
  const { appointments, webPushSubscriptions } = await import("@ll/db");
  let where = eq(merchantMembers.merchantId, merchant.id) as SQL;
  if (segment === "regulars") {
    const rhythm = await segmentCondition(ctx.db, merchant.id, { kind: "regulars" }, ctx.now());
    const yearAgo = new Date(ctx.now().getTime() - 365 * 86_400_000);
    const booked = await ctx.db
      .select({ userId: appointments.userId })
      .from(appointments)
      .where(and(eq(appointments.merchantId, merchant.id), eq(appointments.status, "completed"), gte(appointments.startsAt, yearAgo), isNotNull(appointments.userId)))
      .groupBy(appointments.userId)
      .having(sql`count(*) >= 2`);
    const ids = booked.map((b) => b.userId!).filter(Boolean);
    where = ids.length ? (or(rhythm, and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.userId, ids)))! as SQL) : rhythm;
  }
  const rows = await ctx.db
    .select({ memberId: merchantMembers.id, userId: merchantMembers.userId, name: users.name, email: users.email, balance: merchantMembers.balance })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(where, caslConsented));
  const userIds = rows.map((r) => r.userId);
  const [tokens, webs] = userIds.length
    ? await Promise.all([
        ctx.db.select({ userId: pushTokens.userId, token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, userIds)),
        ctx.db.select({ userId: webPushSubscriptions.userId }).from(webPushSubscriptions).where(inArray(webPushSubscriptions.userId, userIds)),
      ])
    : [[], []];
  const tokenMap = tokens.reduce((m, r) => m.set(r.userId, [...(m.get(r.userId) ?? []), r.token]), new Map<string, string[]>());
  const webSet = new Set(webs.map((w) => w.userId));
  type PromoRecipient = (typeof rows)[number] & { via: "push" | "web_push" | "email"; to: string[] };
  const recipients: PromoRecipient[] = [];
  for (const r of rows) {
    const push = tokenMap.get(r.userId);
    if (push?.length) recipients.push({ ...r, via: "push", to: push });
    else if (webSet.has(r.userId)) recipients.push({ ...r, via: "web_push", to: [] });
    else if (r.email) recipients.push({ ...r, via: "email", to: [r.email] });
  }
  return { recipients, byPush: recipients.filter((r) => r.via !== "email").length, byEmail: recipients.filter((r) => r.via === "email").length };
}

async function promoResult(ctx: AppContext, m: MessageRow): Promise<messagingApi.PromoResult> {
  const { appointments } = await import("@ll/db");
  const sentAt = m.sentAt ?? m.createdAt;
  const deliveries = await ctx.db.select({ userId: messageDeliveries.userId, channel: messageDeliveries.channel }).from(messageDeliveries).where(and(eq(messageDeliveries.messageId, m.id), eq(messageDeliveries.status, "sent")));
  const people = [...new Set(deliveries.map((d) => d.userId))];
  const [booked] = people.length
    ? await ctx.db
        .select({ n: sql<number>`count(distinct ${appointments.userId})::int` })
        .from(appointments)
        .where(and(eq(appointments.merchantId, m.merchantId), inArray(appointments.userId, people), gte(appointments.createdAt, sentAt), lte(appointments.createdAt, new Date(sentAt.getTime() + PROMO_RESULT_DAYS * 86_400_000)), sql`${appointments.status} <> 'cancelled'`))
    : [{ n: 0 }];
  const byUser = new Map(deliveries.map((d) => [d.userId, d.channel]));
  return {
    messageId: m.id,
    templateKey: m.automation?.startsWith("promo:") && m.automation !== "promo:custom" ? m.automation.slice(6) : null,
    title: m.subject ?? "",
    sentAt: sentAt.toISOString(),
    recipients: people.length,
    byPush: [...byUser.values()].filter((c) => c === "push").length,
    byEmail: [...byUser.values()].filter((c) => c === "email").length,
    booked: Number(booked?.n ?? 0),
  };
}

export async function lastPromoResult(ctx: AppContext, merchantId: string): Promise<messagingApi.PromoResult | null> {
  const [m] = await ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.merchantId, merchantId), sql`${messages.automation} like 'promo:%'`, eq(messages.status, "sent")))
    .orderBy(desc(messages.sentAt))
    .limit(1);
  return m ? promoResult(ctx, m) : null;
}

/** GET /merchants/:id/promo-templates: the trade's seasonal templates (in season first), the allowance, the audience. */
export async function listPromoTemplates(ctx: AppContext, merchant: Merchant, locale: import("@ll/shared").Locale = "en"): Promise<messagingApi.PromoTemplatesResponse> {
  const { promoAllowanceFor } = await import("./billing.js");
  const { seasonalPromoTemplates, translator, promoTradeFor } = await import("@ll/shared");
  const { promoTemplates } = await import("@ll/db");
  const today = localDate(ctx.now(), merchant.timezone || "America/Toronto");
  const t = translator(locale);
  const fill = (s: string) => s.replaceAll("{shop}", merchant.name);
  const builtIn = seasonalPromoTemplates(merchant.vertical, today).map((x) => ({ key: x.key, season: x.season, title: fill(t(x.titleKey as never)), body: fill(t(x.bodyKey as never)), start: x.start, end: x.end, inSeason: x.inSeason, daysAway: x.daysAway }));
  // Templates an admin added (promo_templates), when their key is not a built-in one.
  const extra = await ctx.db.select().from(promoTemplates).where(and(eq(promoTemplates.trade, promoTradeFor(merchant.vertical)), eq(promoTemplates.active, true)));
  const { promoWindow } = await import("@ll/shared");
  const added = extra
    .filter((e) => !builtIn.some((b) => b.key === e.key))
    .flatMap((e) => {
      const w = promoWindow({ window: e.window }, today);
      if (!w) return [];
      const inSeason = w.start <= today && today <= w.end;
      return [{ key: e.key, season: e.season, title: fill(e.title), body: fill(e.body), start: w.start, end: w.end, inSeason, daysAway: inSeason ? 0 : Math.round((Date.parse(w.start) - Date.parse(today)) / 86_400_000) }];
    });
  const items = [...builtIn, ...added].sort((a, b) => Number(b.inSeason) - Number(a.inSeason) || a.daysAway - b.daysAway);
  const allowance = await promoAllowanceFor(ctx, merchant);
  const audience = await promoAudience(ctx, merchant, "regulars");
  return {
    items,
    allowance: promoAllowanceDto(allowance),
    audience: { regulars: audience.recipients.length, byPush: audience.byPush, byEmail: audience.byEmail },
    offer: allowance.limit === 0 ? { plan: "plus", name: PLANS.plus.name, priceCents: PLANS.plus.priceCents } : null,
    last: await lastPromoResult(ctx, merchant.id),
  };
}

/**
 * POST /merchants/:id/promo-sends: count one promo against the allowance (Free: 402 with the plan offer), then send it to the
 * regulars by app push, web push or email, with the CASL footer. If nobody can receive it the promo is given back.
 */
export async function sendPromo(ctx: AppContext, merchant: Merchant, actorUserId: string, body: messagingApi.SendPromoBody): Promise<messagingApi.SendPromoResponse> {
  const { consumePromo, refundPromo } = await import("./billing.js");
  const { sendWebPush } = await import("./web-push.js");
  assertPharmacyContent(merchant, body.title, body.body);
  assertBeautyClaims(merchant, `${body.title} ${body.body}`, "This promo");
  const audience = await promoAudience(ctx, merchant, body.segment);
  if (!audience.recipients.length) throw new HttpError(409, "no_recipients", "None of your regulars can get a promo yet. Customers opt in when they join.");
  const allowance = await consumePromo(ctx, merchant);
  const now = ctx.now();
  const [msg] = await ctx.db
    .insert(messages)
    .values({ merchantId: merchant.id, channel: "push", subject: body.title, body: body.body, segment: { kind: body.segment }, automation: PROMO_AUTOMATION(body.templateKey), status: "sending", createdAt: now })
    .returning();
  const terminology = await programTerminology(ctx.db, merchant.id);
  let sent = 0;
  for (const r of audience.recipients) {
    const text = personalize(body.body, r, merchant.name, terminology);
    let status = "sent";
    let providerId: string | null = null;
    let error: string | null = null;
    const channel: Channel = r.via === "email" ? "email" : "push";
    const to = r.via === "web_push" ? "web_push" : r.to[0]!;
    try {
      if (r.via === "push") {
        const res = await ctx.providers.push.send(r.to.map((token) => ({ token, title: body.title, body: withFooter(ctx, "push", merchant.name, text, r.memberId), data: { type: "promo", merchantId: merchant.id, messageId: msg!.id, slug: merchant.slug }, channelId: "offers" })));
        if (!res.ok) status = "failed";
      } else if (r.via === "web_push") {
        const n = await sendWebPush(ctx, r.userId, { title: body.title, body: withFooter(ctx, "push", merchant.name, text, r.memberId), url: `/shops/${merchant.slug}`, tag: `promo_${msg!.id}` });
        if (!n) status = "failed";
      } else {
        providerId = (await ctx.providers.email.send({ to, subject: body.title, text: withFooter(ctx, "email", merchant.name, text, r.memberId), headers: unsubscribeHeaders(ctx, r.memberId) })).id;
      }
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
    }
    if (status === "sent") sent++;
    await ctx.db.insert(messageDeliveries).values({ messageId: msg!.id, userId: r.userId, merchantId: merchant.id, channel, to, body: text, kind: "marketing", status, providerId, error, createdAt: now });
  }
  if (!sent) {
    await refundPromo(ctx, merchant.id);
    await ctx.db.update(messages).set({ status: "failed" }).where(eq(messages.id, msg!.id));
    throw new HttpError(502, "send_failed", "The promo couldn't be delivered. It wasn't counted. Try again.");
  }
  const [done] = await ctx.db.update(messages).set({ status: "sent", sentAt: now, recipientCount: sent }).where(eq(messages.id, msg!.id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "promo.sent", entity: "message", entityId: msg!.id, data: { templateKey: body.templateKey ?? null, recipients: sent } });
  return { result: await promoResult(ctx, done!), allowance: promoAllowanceDto(allowance) };
}
// ---- end phase-solo: D ----
