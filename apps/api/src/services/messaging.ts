/**
 * Merchant messaging: campaigns (email free, SMS Plus, push), segments,
 * CASL-compliant recipient selection, automations (Plus), birthday bonuses
 * (free), inbound STOP handling and monthly SMS credit resets.
 *
 * CASL rules enforced here (never in the client):
 *  - promotional recipients = members with marketing_consent_at set AND muted = false
 *  - every message carries the merchant name and an opt-out
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import {
  auditLogs,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  messageDeliveries,
  messages,
  pushTokens,
  rewards,
  users,
  type DbOrTx,
} from "@ll/db";
import { FEATURES, PLANS, messagingApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { hmacSha256, safeEqual } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { postTransaction } from "./ledger.js";
import { writeAudit } from "./admin-audit.js";
import { iso } from "./merchant.js";
import { decodeCursor, encodeCursor } from "./merchant-customers.js";

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

/** Monthly SMS allowance: the plan's, but never below the feature's minimum plan (pilot overrides). */
export function smsAllowance(m: Pick<Merchant, "plan">): number {
  return Math.max(PLANS[m.plan].smsPerMonth, PLANS[FEATURES["marketing.sms"].minPlan].smsPerMonth);
}

export function unsubscribeToken(ctx: AppContext, memberId: string): string {
  return hmacSha256(ctx.config.jwtSecret, `unsub:${memberId}`).slice(0, 32);
}

export function unsubscribeUrl(ctx: AppContext, memberId: string): string {
  return `${ctx.config.publicApiUrl.replace(/\/$/, "")}/v1/public/messaging/unsubscribe?m=${memberId}&t=${unsubscribeToken(ctx, memberId)}`;
}

/** Footer required by CASL: identifies the sender and gives a working opt-out. */
export function withFooter(ctx: AppContext, channel: Channel, merchantName: string, body: string, memberId: string): string {
  if (channel === "sms") return `${body}\n— ${merchantName}. Reply STOP to opt out.`;
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
  const recipients: Recipient[] = [];
  for (const r of consented) {
    const to = channel === "email" ? (r.email ? [r.email] : []) : channel === "sms" ? (r.phone ? [r.phone] : []) : (tokens.get(r.userId) ?? []);
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
async function reserveSmsCredits(db: DbOrTx, merchant: Merchant, n: number): Promise<boolean> {
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
}

/** Send to recipients and log a delivery row per address. SMS credits must already be reserved. */
async function deliver(ctx: AppContext, a: DeliverArgs): Promise<number> {
  let sent = 0;
  for (const r of a.recipients) {
    const text = withFooter(ctx, a.channel, a.merchant.name, personalize(a.body, r, a.merchant.name, a.terminology), r.memberId);
    const subject = a.subject ? personalize(a.subject, r, a.merchant.name, a.terminology) : null;
    for (const to of r.to) {
      let status = "sent";
      let providerId: string | null = null;
      let error: string | null = null;
      try {
        if (a.channel === "email") providerId = (await ctx.providers.email.send({ to, subject: subject ?? a.merchant.name, text })).id;
        else if (a.channel === "sms") providerId = (await ctx.providers.sms.send(to, text)).id;
        else {
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
      });
    }
  }
  return sent;
}

async function programTerminology(db: DbOrTx, merchantId: string): Promise<string> {
  const [p] = await db.select({ t: loyaltyPrograms.terminology }).from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  return p?.t ?? "points";
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
    const channel = claimed.channel;
    await requireChannel(ctx.db, merchant, channel);
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
  };
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
  return { items: rows.slice(0, q.limit).map(serializeMessage), nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
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
  return {
    ...serializeMessage(m),
    stats: { queued: by.queued ?? 0, sent: by.sent ?? 0, delivered: by.delivered ?? 0, failed: by.failed ?? 0 },
    preview: withFooter(ctx, m.channel, merchant.name, sample, "00000000-0000-0000-0000-000000000000"),
  };
}

export async function createCampaign(ctx: AppContext, merchant: Merchant, actorUserId: string, body: messagingApi.CreateMessageBody) {
  validateContent(body.channel, body.subject, body.body);
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
    days: 30,
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
  else await ctx.db.insert(messages).values({ merchantId: merchant.id, automation: kind, ...values });
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
      const since = new Date(now.getTime() - (cfg.days ?? 30) * 86400000);
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
        inArray(sql`to_char(${users.birthday}, 'MM-DD')`, days),
        notSentSince(new Date(`${year}-01-01T00:00:00Z`)),
      )!;
    }
    case "welcome":
      return and(base, gte(merchantMembers.createdAt, enabledAt), gte(merchantMembers.createdAt, new Date(now.getTime() - 7 * 86400000)), notSentSince(new Date(0)))!;
    default:
      return null;
  }
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
    const features = await getMerchantFeatures(ctx.db, merchant);
    if (!features["marketing.automations"].enabled) continue;
    if (!features[msg.channel === "sms" ? "marketing.sms" : "marketing.email"].enabled) continue;
    const where = await automationCandidates(ctx, merchant, msg);
    if (!where) continue;
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
          inArray(sql`to_char(${users.birthday}, 'MM-DD')`, days),
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
  const word = body
    .trim()
    .toUpperCase()
    .normalize("NFC")
    .replace(/[^A-ZÀ-Ü-]/g, "");
  const isStop = (messagingApi.STOP_KEYWORDS as readonly string[]).includes(word);
  if (word === "HELP" || word === "INFO" || word === "AIDE") {
    return { action: "help", merchantsAffected: 0, reply: "Local Loyalty: shop rewards messages. Reply STOP to opt out of all shops. Help: hello@localloyalty.example" };
  }
  if (!isStop) return { action: "none", merchantsAffected: 0, reply: null };
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

/** Email unsubscribe link: withdraws consent for that one merchant. */
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

