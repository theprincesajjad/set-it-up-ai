/**
 * Common POS processing pipeline.
 *
 *   webhook → verify signature → parse → webhook_events (unique provider+eventId: idempotent)
 *     → resolve details (orders, customers, catalog) → PurchaseEvent
 *     → map location (locations.externalIds) + categories (merchant_categories.externalIds, so no-earn applies)
 *     → find member by phone (or email of an existing customer)
 *     → awardPurchase(source=<provider>, idempotencyKey "<provider>:<externalId>", ignoreCooldown)
 *   refunds → reverseTransaction (full) or a proportional reversal via postTransaction (partial)
 *   no customer → webhook_events.status = "unmatched" (claimable by receipt code or staff-attached phone)
 *
 * Points only change through services/ledger.ts.
 */
import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { catalogItems, ledgerTransactions, merchantMembers, merchants, users, webhookEvents } from "@ll/db";
import { normalizePhone, type PurchaseLine } from "@ll/shared";
import { getConnector, isPosProvider, type InboundEvent, type PosProviderId, type PurchaseEvent } from "../connectors/index.js";
import type { AppContext } from "../context.js";
import { randomCode } from "../lib/crypto.js";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import { getMerchantFeatures } from "./features.js";
import { apiContextFor, categoryMap, findConnectedByAccount, getIntegration, locationForExternal, markDisconnected, type Integration } from "./integrations.js";
import { awardPurchase, postTransaction, reverseTransaction, type AwardResult } from "./ledger.js";
import { notifyPassUpdate } from "./wallet.js";
import { emitMerchantEvent } from "./webhooks-out.js";

type TxSource = (typeof ledgerTransactions.$inferInsert)["source"];
export type WebhookEventRow = typeof webhookEvents.$inferSelect;

export const MAX_EVENT_ATTEMPTS = 6;
const RETRY_SECONDS = [60, 300, 1800, 7200, 21600];
/** Unmatched purchases can be claimed for this long. */
export const CLAIM_WINDOW_DAYS = 30;
/** A customer can self-claim at most this many receipts per shop per day. */
export const CUSTOMER_CLAIMS_PER_DAY = 3;

export interface StoredPurchase extends PurchaseEvent {
  /** Lines after category/item mapping (what awardPurchase receives). */
  mappedLines?: PurchaseLine[];
  refundedCents?: number;
}

export interface OutcomeRow {
  status: "processed" | "unmatched" | "duplicate" | "ignored" | "refunded";
  purchaseRef?: string | null;
  purchase?: StoredPurchase | null;
  claimCode?: string | null;
  locationId?: string | null;
  memberId?: string | null;
  transactionId?: string | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Inbound webhook entry point
// ---------------------------------------------------------------------------
export interface WebhookResult {
  status: number;
  body: unknown;
}

export async function handleProviderWebhook(
  ctx: AppContext,
  provider: string,
  req: { rawBody: string; body: unknown; headers: Record<string, string | string[] | undefined>; url: string },
): Promise<WebhookResult> {
  const connector = getConnector(provider);
  if (!connector?.verifyWebhook || !connector.parseWebhook) return { status: 404, body: { error: { code: "not_found", message: "Unknown webhook provider" } } };
  if (!connector.verifyWebhook(ctx.config, req.rawBody, req.headers, req.url)) {
    return { status: 401, body: { error: { code: "invalid_signature", message: "Webhook signature verification failed" } } };
  }
  const parsed = connector.parseWebhook(req.rawBody, req.body, req.headers);
  if (parsed.reply) return parsed.reply;
  const results: { eventId: string; status: string }[] = [];
  for (const ev of parsed.events) {
    const integ = ev.accountId ? await findConnectedByAccount(ctx.db, provider, ev.accountId) : null;
    const [row] = await ctx.db
      .insert(webhookEvents)
      .values({ provider, externalId: ev.eventId, type: ev.type, merchantId: integ?.merchantId ?? null, payload: { event: ev } as Record<string, unknown> })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      results.push({ eventId: ev.eventId, status: "duplicate" });
      continue;
    }
    if (!integ) {
      await finish(ctx, row, { status: "ignored", error: `No connected ${provider} integration for account ${ev.accountId ?? "(none)"}` });
      results.push({ eventId: ev.eventId, status: "ignored" });
      continue;
    }
    const r = await processStoredEvent(ctx, row, integ, ev);
    results.push({ eventId: ev.eventId, status: r });
  }
  // Always 200 once stored: retries are ours (jobs/connectors.ts), not the provider's.
  return { status: 200, body: { received: results.length, results } };
}

async function finish(ctx: AppContext, row: WebhookEventRow, o: OutcomeRow & { failed?: boolean }) {
  const now = ctx.now();
  const attempts = row.attempts + 1;
  await ctx.db
    .update(webhookEvents)
    .set({
      status: o.failed ? (attempts >= MAX_EVENT_ATTEMPTS ? "failed" : "retry") : o.status,
      attempts,
      error: o.error ?? null,
      processedAt: o.failed ? null : now,
      nextAttemptAt: o.failed && attempts < MAX_EVENT_ATTEMPTS ? new Date(now.getTime() + RETRY_SECONDS[Math.min(attempts - 1, RETRY_SECONDS.length - 1)]! * 1000) : null,
      ...(o.purchaseRef !== undefined ? { purchaseRef: o.purchaseRef } : {}),
      ...(o.purchase !== undefined ? { purchase: o.purchase as unknown as Record<string, unknown> } : {}),
      ...(o.claimCode !== undefined ? { claimCode: o.claimCode } : {}),
      ...(o.locationId !== undefined ? { locationId: o.locationId } : {}),
      ...(o.memberId !== undefined ? { memberId: o.memberId } : {}),
      ...(o.transactionId !== undefined ? { transactionId: o.transactionId } : {}),
    })
    .where(eq(webhookEvents.id, row.id));
}

/** Process (or re-process) one stored event. Returns the final status. */
export async function processStoredEvent(ctx: AppContext, row: WebhookEventRow, integ: Integration, ev: InboundEvent): Promise<string> {
  const connector = getConnector(integ.provider)!;
  try {
    if (ev.kind === "ignore") {
      await finish(ctx, row, { status: "ignored" });
      return "ignored";
    }
    if (ev.kind === "disconnect") {
      await markDisconnected(ctx, integ, `Disconnected from ${connector.name} (${ev.type})`);
      await finish(ctx, row, { status: "processed" });
      return "processed";
    }
    if (!isPosProvider(integ.provider)) {
      await finish(ctx, row, { status: "ignored" });
      return "ignored";
    }
    const api = await apiContextFor(ctx, integ);
    const purchases = connector.resolve ? await connector.resolve(api, ev) : (ev.purchases ?? []);
    if (!purchases.length) {
      await finish(ctx, row, { status: "ignored", error: "Nothing to award (sale not completed)" });
      return "ignored";
    }
    let outcome: OutcomeRow = { status: "ignored" };
    for (const p of purchases) {
      const o = p.refund ? await applyPosRefund(ctx, integ, p) : await applyPosPurchase(ctx, integ, p, row.id);
      // The sale outcome (unmatched/processed) is what the row shows; refunds add to it.
      if (!p.refund || outcome.status === "ignored") outcome = o;
    }
    await finish(ctx, row, outcome);
    return outcome.status;
  } catch (err) {
    // Business-rule rejections (paused shop, no program) won't succeed on retry.
    if (err instanceof HttpError && err.statusCode < 500 && err.statusCode !== 429) {
      await finish(ctx, row, { status: "ignored", error: err.message });
      return "ignored";
    }
    await finish(ctx, row, { status: "ignored", failed: true, error: (err as Error).message?.slice(0, 500) ?? "error" });
    return "retry";
  }
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
async function mapLines(ctx: AppContext, merchantId: string, provider: string, p: PurchaseEvent): Promise<PurchaseLine[]> {
  if (!p.lines.length) return [{ amountCents: Math.max(0, p.totalCents) }];
  const cats = await categoryMap(ctx.db, merchantId, provider);
  const extItemIds = [...new Set(p.lines.map((l) => l.externalItemId).filter(Boolean))] as string[];
  const items = new Map<string, string>();
  if (extItemIds.length) {
    const rows = await ctx.db
      .select({ id: catalogItems.id, ext: sql<string>`${catalogItems.externalIds} ->> ${provider}` })
      .from(catalogItems)
      .where(and(eq(catalogItems.merchantId, merchantId), inArray(sql<string>`${catalogItems.externalIds} ->> ${provider}`, extItemIds)));
    for (const r of rows) if (r.ext) items.set(r.ext, r.id);
  }
  return p.lines.map((l) => ({
    amountCents: Math.max(0, Math.round(l.amountCents)),
    categoryId: l.externalCategoryId ? (cats.get(l.externalCategoryId) ?? null) : null,
    itemId: l.externalItemId ? (items.get(l.externalItemId) ?? null) : null,
    quantity: l.quantity ?? 1,
  }));
}

async function identify(ctx: AppContext, merchantId: string, p: PurchaseEvent, autoEnroll: boolean): Promise<{ phone?: string; userId?: string } | null> {
  const phone = p.customer.phone ? normalizePhone(p.customer.phone) : null;
  let userId: string | undefined;
  if (phone) {
    if (autoEnroll) return { phone };
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    userId = u?.id;
  } else if (p.customer.email) {
    // Email only matches an existing customer (we never create accounts from an email alone).
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${p.customer.email.trim().toLowerCase()}`).limit(1);
    userId = u?.id;
  }
  if (!userId) return null;
  if (!autoEnroll) {
    const [m] = await ctx.db.select({ id: merchantMembers.id }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId))).limit(1);
    if (!m) return null;
  }
  return { userId };
}

async function afterAward(ctx: AppContext, merchantId: string, provider: string, r: AwardResult, externalId: string) {
  if (r.duplicate) return;
  if (r.memberCreated) void emitMerchantEvent(ctx, merchantId, "member.joined", { memberId: r.member.id, joinedVia: "pos", source: provider });
  if (r.transaction) {
    void emitMerchantEvent(ctx, merchantId, "points.earned", {
      memberId: r.member.id,
      transactionId: r.transaction.id,
      points: r.transaction.points,
      balance: r.member.balance,
      amountCents: r.transaction.amountCents,
      source: provider,
      externalId,
    });
  }
  await notifyPassUpdate(ctx, r.member.userId);
}

export async function applyPosPurchase(ctx: AppContext, integ: Integration, p: PurchaseEvent, eventRowId: string): Promise<OutcomeRow> {
  const provider = integ.provider as PosProviderId;
  const merchantId = integ.merchantId;
  const settings = integ.settings;
  if (settings.autoAward === false) return { status: "ignored", purchaseRef: p.externalId, error: "Auto-award is turned off" };
  const features = await getMerchantFeatures(ctx.db, (await merchantRow(ctx, merchantId))!);
  if (!features["integrations.pos_auto_award"].enabled) return { status: "ignored", purchaseRef: p.externalId, error: "POS auto-award is not enabled" };

  const idempotencyKey = `${provider}:${p.externalId}`;
  const locationId = await locationForExternal(ctx.db, merchantId, provider, p.externalLocationId);
  const lines = await mapLines(ctx, merchantId, provider, p);
  const stored: StoredPurchase = { ...p, mappedLines: lines };

  const [already] = await ctx.db
    .select({ id: ledgerTransactions.id, memberId: ledgerTransactions.memberId })
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.merchantId, merchantId), eq(ledgerTransactions.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (already) return { status: "duplicate", purchaseRef: p.externalId, memberId: already.memberId, transactionId: already.id, locationId };

  const who = await identify(ctx, merchantId, p, settings.autoEnroll !== false);
  if (!who) {
    // Another event (payment vs order notification) may already hold this sale.
    const [held] = await ctx.db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.merchantId, merchantId),
          eq(webhookEvents.provider, provider),
          eq(webhookEvents.purchaseRef, p.externalId),
          inArray(webhookEvents.status, ["unmatched", "claimed", "refunded", "processed"]),
          sql`${webhookEvents.id} <> ${eventRowId}`,
        ),
      )
      .limit(1);
    if (held) return { status: "duplicate", purchaseRef: p.externalId, locationId };
    const claimCode = (p.receiptCode ? p.receiptCode.replace(/\s+/g, "").toUpperCase() : randomCode(6)).slice(0, 40);
    void emitMerchantEvent(ctx, merchantId, "purchase.unmatched", { eventId: eventRowId, provider, externalId: p.externalId, totalCents: p.totalCents, receiptCode: claimCode, locationId });
    return { status: "unmatched", purchaseRef: p.externalId, purchase: stored, claimCode, locationId };
  }

  const r = await awardPurchase(ctx, {
    merchantId,
    phone: who.phone,
    userId: who.userId,
    customerName: p.customer.name ?? null,
    lines,
    source: provider as TxSource,
    locationId,
    idempotencyKey,
    externalRef: p.externalId,
    ignoreCooldown: true,
    joinedVia: "pos",
  });
  await afterAward(ctx, merchantId, provider, r, p.externalId);
  return { status: r.duplicate ? "duplicate" : "processed", purchaseRef: p.externalId, purchase: stored, memberId: r.member.id, transactionId: r.transaction?.id ?? null, locationId };
}

async function merchantRow(ctx: AppContext, merchantId: string) {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return m ?? null;
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
export interface RefundArgs {
  merchantId: string;
  source: TxSource;
  /** Idempotency key the sale was awarded with ("<provider>:<externalId>"). */
  originalKey: string;
  /** Unique per refund ("<provider>:refund:<refundId>"). */
  refundKey: string;
  /** null = full refund. */
  amountCents: number | null;
  originalTotalCents?: number | null;
  cumulative?: boolean;
  reason: string;
}

export interface RefundResult {
  status: "reversed" | "duplicate" | "not_found";
  points: number;
  memberId: string | null;
  balance: number | null;
  transactionId: string | null;
}

/**
 * Reverse points for a refunded sale. Full refunds use reverseTransaction;
 * partial refunds post a proportional reversal (rounded so the sum of partial
 * reversals never exceeds what was earned).
 */
export async function applyRefund(ctx: AppContext, a: RefundArgs): Promise<RefundResult> {
  const [orig] = await ctx.db
    .select()
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.merchantId, a.merchantId), eq(ledgerTransactions.idempotencyKey, a.originalKey)))
    .limit(1);
  if (!orig) return { status: "not_found", points: 0, memberId: null, balance: null, transactionId: null };
  const dupResult = async (): Promise<RefundResult> => {
    const [m] = await ctx.db.select({ balance: merchantMembers.balance }).from(merchantMembers).where(eq(merchantMembers.id, orig.memberId)).limit(1);
    return { status: "duplicate", points: 0, memberId: orig.memberId, balance: m?.balance ?? null, transactionId: null };
  };
  if (orig.reversedAt) return dupResult();
  const [dup] = await ctx.db
    .select({ id: ledgerTransactions.id })
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.merchantId, a.merchantId), eq(ledgerTransactions.idempotencyKey, a.refundKey)))
    .limit(1);
  if (dup) return dupResult();

  const prior = await ctx.db
    .select({ points: ledgerTransactions.points, amountCents: ledgerTransactions.amountCents })
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.merchantId, a.merchantId), eq(ledgerTransactions.reversesTransactionId, orig.id)));
  const alreadyPts = prior.reduce((s, t) => s - t.points, 0);
  const alreadyCents = prior.reduce((s, t) => s + (t.amountCents ?? 0), 0);
  const basis = a.originalTotalCents && a.originalTotalCents > 0 ? a.originalTotalCents : (orig.amountCents ?? 0);
  const full = a.amountCents === null || basis <= 0;
  const thisCents = full ? Math.max(0, basis - alreadyCents) : a.cumulative ? a.amountCents! - alreadyCents : a.amountCents!;
  if (!full && thisCents <= 0) return dupResult();
  const totalCents = alreadyCents + thisCents;
  const coversAll = full || totalCents >= basis;
  const remaining = orig.points - alreadyPts;
  if (remaining <= 0) return dupResult();

  if (coversAll && alreadyPts === 0) {
    try {
      const r = await reverseTransaction(ctx, { merchantId: a.merchantId, transactionId: orig.id, reason: a.reason, source: a.source });
      void emitMerchantEvent(ctx, a.merchantId, "points.reversed", { memberId: r.member.id, transactionId: r.transaction.id, points: r.transaction.points, balance: r.member.balance, reason: a.reason });
      await notifyPassUpdate(ctx, r.member.userId);
      return { status: "reversed", points: -r.transaction.points, memberId: r.member.id, balance: r.member.balance, transactionId: r.transaction.id };
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 409) return dupResult();
      throw err;
    }
  }
  const target = coversAll ? orig.points : Math.min(orig.points, Math.round((orig.points * totalCents) / basis));
  const pts = Math.min(remaining, target - alreadyPts);
  if (pts <= 0) return { status: "reversed", points: 0, memberId: orig.memberId, balance: null, transactionId: null };
  const r = await ctx.db.transaction((tx) =>
    postTransaction(tx, {
      merchantId: a.merchantId,
      memberId: orig.memberId,
      type: "reversal",
      source: a.source,
      points: -pts,
      amountCents: thisCents,
      description: `${coversAll ? "Refund" : "Partial refund"}: ${a.reason}`,
      reversesTransactionId: orig.id,
      idempotencyKey: a.refundKey,
      counterAccount: "merchant_issued",
      allowNegative: true,
      locationId: orig.locationId,
    }),
  );
  if (!r.duplicate) {
    void emitMerchantEvent(ctx, a.merchantId, "points.reversed", { memberId: r.member.id, transactionId: r.transaction.id, points: -pts, balance: r.member.balance, reason: a.reason });
    await notifyPassUpdate(ctx, r.member.userId);
  }
  return { status: r.duplicate ? "duplicate" : "reversed", points: r.duplicate ? 0 : pts, memberId: r.member.id, balance: r.member.balance, transactionId: r.transaction.id };
}

async function applyPosRefund(ctx: AppContext, integ: Integration, p: PurchaseEvent): Promise<OutcomeRow> {
  const provider = integ.provider;
  const refund = p.refund!;
  const r = await applyRefund(ctx, {
    merchantId: integ.merchantId,
    source: provider as TxSource,
    originalKey: `${provider}:${refund.originalExternalId}`,
    refundKey: `${provider}:refund:${p.externalId}`,
    amountCents: refund.amountCents,
    originalTotalCents: refund.originalTotalCents,
    cumulative: refund.cumulative,
    reason: `${getConnector(provider)?.name ?? provider} refund`,
  });
  if (r.status !== "not_found") return { status: r.status === "duplicate" ? "duplicate" : "processed", purchaseRef: refund.originalExternalId, memberId: r.memberId, transactionId: r.transactionId };
  // Sale was never awarded: if it's waiting to be claimed, shrink or retire it.
  const [held] = await ctx.db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.merchantId, integ.merchantId), eq(webhookEvents.provider, provider), eq(webhookEvents.purchaseRef, refund.originalExternalId), eq(webhookEvents.status, "unmatched")))
    .limit(1);
  if (held?.purchase) {
    const sp = held.purchase as unknown as StoredPurchase;
    const prev = sp.refundedCents ?? 0;
    const refunded = refund.cumulative ? refund.amountCents : prev + refund.amountCents;
    const basis = refund.originalTotalCents ?? sp.totalCents;
    if (basis <= 0 || refunded >= basis) {
      await ctx.db.update(webhookEvents).set({ status: "refunded" }).where(eq(webhookEvents.id, held.id));
    } else {
      const keep = (basis - refunded) / basis;
      const scale = (n: number) => Math.floor(n * keep);
      const next: StoredPurchase = { ...sp, refundedCents: refunded, totalCents: scale(sp.totalCents), mappedLines: sp.mappedLines?.map((l) => ({ ...l, amountCents: scale(l.amountCents) })) };
      await ctx.db.update(webhookEvents).set({ purchase: next as unknown as Record<string, unknown> }).where(eq(webhookEvents.id, held.id));
    }
    return { status: "processed", purchaseRef: refund.originalExternalId };
  }
  return { status: "ignored", purchaseRef: refund.originalExternalId, error: "Refund for a sale that earned no points" };
}

// ---------------------------------------------------------------------------
// Unmatched purchases
// ---------------------------------------------------------------------------
export function unmatchedView(row: WebhookEventRow) {
  const p = (row.purchase ?? {}) as unknown as StoredPurchase;
  return {
    id: row.id,
    provider: row.provider,
    status: row.status as "unmatched" | "claimed" | "refunded",
    purchaseRef: row.purchaseRef,
    receiptCode: row.claimCode,
    totalCents: p.totalCents ?? 0,
    occurredAt: p.occurredAt ?? row.createdAt.toISOString(),
    locationId: row.locationId,
    customerName: p.customer?.name ?? null,
    memberId: row.memberId,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUnmatched(ctx: AppContext, merchantId: string, q: { status: "unmatched" | "claimed" | "refunded" | "all"; limit: number; cursor?: string }) {
  const statuses = q.status === "all" ? ["unmatched", "claimed", "refunded"] : [q.status];
  const rows = await ctx.db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.merchantId, merchantId), inArray(webhookEvents.status, statuses), q.cursor ? lt(webhookEvents.createdAt, new Date(q.cursor)) : undefined))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: page.map(unmatchedView), nextCursor: rows.length > q.limit ? page[page.length - 1]!.createdAt.toISOString() : null };
}

/**
 * Award an unmatched purchase to a customer. Staff attach a phone; customers
 * claim with the receipt code (the claim is atomic: one winner).
 */
export async function claimUnmatched(
  ctx: AppContext,
  args: { merchantId: string; eventId?: string; code?: string; phone?: string; userId?: string; name?: string | null; via: "staff" | "customer"; staffUserId?: string | null },
) {
  const since = new Date(ctx.now().getTime() - CLAIM_WINDOW_DAYS * 86400_000);
  let row: WebhookEventRow | undefined;
  if (args.eventId) {
    [row] = await ctx.db.select().from(webhookEvents).where(and(eq(webhookEvents.id, args.eventId), eq(webhookEvents.merchantId, args.merchantId))).limit(1);
  } else if (args.code) {
    const code = args.code.replace(/\s+/g, "").replace(/^#/, "").toUpperCase();
    [row] = await ctx.db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.merchantId, args.merchantId), eq(webhookEvents.claimCode, code), inArray(webhookEvents.status, ["unmatched", "claimed"])))
      .orderBy(desc(webhookEvents.createdAt))
      .limit(1);
  }
  if (!row) throw notFound("Purchase");
  if (row.status === "claimed") throw new HttpError(409, "already_claimed", "Points for this purchase were already claimed");
  if (row.status !== "unmatched") throw new HttpError(409, "not_claimable", "This purchase can't be claimed");
  if (row.createdAt < since) throw new HttpError(410, "claim_expired", `Purchases can be claimed within ${CLAIM_WINDOW_DAYS} days`);

  let phone = args.phone ? normalizePhone(args.phone) : null;
  if (args.phone && !phone) throw badRequest("Enter a valid phone number");
  if (args.via === "customer") {
    if (!args.userId) throw badRequest("Sign in to claim");
    const dayAgo = new Date(ctx.now().getTime() - 86400_000);
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .innerJoin(merchantMembers, eq(merchantMembers.id, webhookEvents.memberId))
      .where(and(eq(webhookEvents.merchantId, args.merchantId), eq(merchantMembers.userId, args.userId), gte(webhookEvents.claimedAt, dayAgo)))) as [{ n: number }];
    if (Number(n) >= CUSTOMER_CLAIMS_PER_DAY) throw new HttpError(429, "rate_limited", "You've claimed the maximum receipts for today. Ask staff for help.");
  }
  if (!phone && !args.userId) throw badRequest("Provide a phone number");

  const [claimed] = await ctx.db
    .update(webhookEvents)
    .set({ status: "claimed", claimedAt: ctx.now() })
    .where(and(eq(webhookEvents.id, row.id), eq(webhookEvents.status, "unmatched")))
    .returning();
  if (!claimed) throw new HttpError(409, "already_claimed", "Points for this purchase were already claimed");
  const p = (row.purchase ?? {}) as unknown as StoredPurchase;
  try {
    const r = await awardPurchase(ctx, {
      merchantId: args.merchantId,
      phone: args.userId ? undefined : phone!,
      userId: args.userId,
      customerName: args.name ?? p.customer?.name ?? null,
      lines: p.mappedLines?.length ? p.mappedLines : [{ amountCents: p.totalCents ?? 0 }],
      source: (isPosProvider(row.provider) ? row.provider : "api") as TxSource,
      locationId: row.locationId,
      staffUserId: args.staffUserId ?? null,
      idempotencyKey: `${row.provider}:${row.purchaseRef ?? row.externalId}`,
      externalRef: row.purchaseRef,
      ignoreCooldown: true,
      joinedVia: "pos",
    });
    const [u] = await ctx.db.update(webhookEvents).set({ memberId: r.member.id, transactionId: r.transaction?.id ?? null }).where(eq(webhookEvents.id, row.id)).returning();
    await afterAward(ctx, args.merchantId, row.provider, r, row.purchaseRef ?? row.externalId);
    return { purchase: unmatchedView(u!), memberId: r.member.id, pointsAwarded: r.duplicate ? 0 : (r.transaction?.points ?? 0), balance: r.member.balance };
  } catch (err) {
    await ctx.db.update(webhookEvents).set({ status: "unmatched", claimedAt: null }).where(eq(webhookEvents.id, row.id));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Retries (job)
// ---------------------------------------------------------------------------
export async function retryFailedEvents(ctx: AppContext, limit = 50) {
  const due = await ctx.db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.status, "retry"), or(lte(webhookEvents.nextAttemptAt, ctx.now()), sql`${webhookEvents.nextAttemptAt} is null`)))
    .limit(limit);
  let ok = 0;
  for (const row of due) {
    const ev = (row.payload as { event?: InboundEvent }).event;
    if (!ev || !row.merchantId) {
      await finish(ctx, row, { status: "ignored", error: "Unreplayable event" });
      continue;
    }
    const integ = await getIntegration(ctx.db, row.merchantId, row.provider);
    if (!integ || integ.status !== "connected") {
      await finish(ctx, row, { status: "ignored", error: "Integration no longer connected" });
      continue;
    }
    const s = await processStoredEvent(ctx, row, integ, ev);
    if (s !== "retry") ok++;
  }
  return { attempted: due.length, ok };
}
