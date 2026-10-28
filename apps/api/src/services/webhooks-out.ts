/**
 * Outbound merchant webhooks (custom URLs, Zapier, Make).
 *
 * Other teams call `emitMerchantEvent(ctx, merchantId, "order.ready", {...})`.
 * It never throws and never blocks: it queues one delivery per subscribed
 * webhook; jobs/connectors.ts delivers them with retries + backoff.
 *
 * Each POST carries `X-LL-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`.
 */
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { outboundWebhookDeliveries, outboundWebhooks } from "@ll/db";
import { integrationsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { decrypt, encrypt, hmacSha256, randomToken, safeEqual } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { enabledFeaturesByMerchantId } from "./features.js";
import { httpFor, type Fetch } from "./integrations-http.js";

export const OUTBOUND_EVENTS = integrationsApi.OUTBOUND_EVENTS;
export type OutboundEvent = integrationsApi.OutboundEvent;

export const MAX_ATTEMPTS = 8;
/** Delay before attempt n+1 (seconds): 30s, 2m, 10m, 30m, 2h, 6h, 12h. */
export const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600, 43200];
const TIMEOUT_MS = 10_000;
const MAX_WEBHOOKS_PER_MERCHANT = 25;

type Webhook = typeof outboundWebhooks.$inferSelect;

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------
export function signWebhookBody(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

/** Reference verifier (what receivers should do); tolerance in seconds. */
export function verifyWebhookSignature(secret: string, header: string | undefined, body: string, nowSeconds: number, toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  return safeEqual(hmacSha256(secret, `${t}.${body}`), parts.v1);
}

const secretOf = (ctx: AppContext, w: Webhook) => (w.secret.startsWith("enc:") ? decrypt(w.secret.slice(4), ctx.config.encryptionKey) : w.secret);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Block SSRF to internal hosts; https required outside dev/test. */
export function validateWebhookUrl(ctx: AppContext, raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest("Webhook URL is not a valid URL");
  }
  const prod = ctx.config.env === "production";
  if (u.protocol !== "https:" && (prod || u.protocol !== "http:")) throw badRequest("Webhook URL must use https");
  if (u.username || u.password) throw badRequest("Webhook URL must not contain credentials");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (prod) {
    const internal =
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      host.endsWith(".local") ||
      (isIP(host) === 4 && PRIVATE_V4.some((r) => r.test(host))) ||
      (isIP(host) === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")));
    if (internal) throw badRequest("Webhook URL must be a public address");
  }
  return u.toString();
}

function validateEvents(events: string[]): OutboundEvent[] {
  const bad = events.filter((e) => e !== "*" && !(OUTBOUND_EVENTS as readonly string[]).includes(e));
  if (bad.length) throw badRequest(`We don't recognise these events: ${bad.join(", ")}.`, { allowed: OUTBOUND_EVENTS });
  if (!events.length) throw badRequest("Choose at least one event");
  return events as OutboundEvent[];
}

export function webhookView(w: Webhook) {
  return { id: w.id, url: w.url, events: w.events, active: w.active, description: w.description, createdVia: w.createdVia, createdAt: w.createdAt.toISOString() };
}

export async function createWebhook(
  ctx: AppContext,
  merchantId: string,
  input: { url: string; events: string[]; description?: string | null; createdVia?: string },
) {
  const url = validateWebhookUrl(ctx, input.url);
  const events = validateEvents(input.events);
  const [{ n }] = (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(outboundWebhooks).where(eq(outboundWebhooks.merchantId, merchantId))) as [{ n: number }];
  if (Number(n) >= MAX_WEBHOOKS_PER_MERCHANT) throw badRequest(`Up to ${MAX_WEBHOOKS_PER_MERCHANT} webhooks per business`);
  const secret = `whsec_${randomToken(24)}`;
  const [w] = await ctx.db
    .insert(outboundWebhooks)
    .values({ merchantId, url, events, secret: `enc:${encrypt(secret, ctx.config.encryptionKey)}`, description: input.description ?? null, createdVia: input.createdVia ?? "dashboard" })
    .returning();
  return { ...webhookView(w!), secret };
}

export async function listWebhooks(ctx: AppContext, merchantId: string) {
  const rows = await ctx.db.select().from(outboundWebhooks).where(eq(outboundWebhooks.merchantId, merchantId)).orderBy(desc(outboundWebhooks.createdAt));
  return rows.map(webhookView);
}

async function loadWebhook(ctx: AppContext, merchantId: string, id: string) {
  const [w] = await ctx.db.select().from(outboundWebhooks).where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.merchantId, merchantId))).limit(1);
  if (!w) throw notFound("Webhook");
  return w;
}

export async function updateWebhook(ctx: AppContext, merchantId: string, id: string, patch: { url?: string; events?: string[]; active?: boolean; description?: string | null }) {
  await loadWebhook(ctx, merchantId, id);
  const set: Partial<typeof outboundWebhooks.$inferInsert> = {};
  if (patch.url !== undefined) set.url = validateWebhookUrl(ctx, patch.url);
  if (patch.events !== undefined) set.events = validateEvents(patch.events);
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.description !== undefined) set.description = patch.description;
  const [w] = await ctx.db.update(outboundWebhooks).set(set).where(eq(outboundWebhooks.id, id)).returning();
  return webhookView(w!);
}

export async function deleteWebhook(ctx: AppContext, merchantId: string, id: string) {
  await loadWebhook(ctx, merchantId, id);
  await ctx.db.delete(outboundWebhooks).where(eq(outboundWebhooks.id, id));
}

export async function listDeliveries(ctx: AppContext, merchantId: string, webhookId: string, limit = 50) {
  await loadWebhook(ctx, merchantId, webhookId);
  const rows = await ctx.db
    .select()
    .from(outboundWebhookDeliveries)
    .where(eq(outboundWebhookDeliveries.webhookId, webhookId))
    .orderBy(desc(outboundWebhookDeliveries.createdAt))
    .limit(limit);
  return rows.map((d) => ({
    id: d.id,
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    lastStatusCode: d.lastStatusCode,
    lastError: d.lastError,
    nextAttemptAt: d.status === "pending" ? d.nextAttemptAt.toISOString() : null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------
export function eventEnvelope(ctx: AppContext, merchantId: string, event: string, data: unknown) {
  return { id: `evt_${randomUUID().replace(/-/g, "")}`, type: event, createdAt: ctx.now().toISOString(), merchantId, data };
}

async function enqueue(ctx: AppContext, merchantId: string, event: string, data: unknown, onlyWebhookId?: string): Promise<number> {
  // Outbound webhooks are paid (Plus: integrations.webhooks). Subscriptions are kept but receive nothing while it's off.
  if (!(await enabledFeaturesByMerchantId(ctx.db, [merchantId], ["integrations.webhooks"])).get(merchantId)?.has("integrations.webhooks")) return 0;
  const hooks = await ctx.db
    .select()
    .from(outboundWebhooks)
    .where(and(eq(outboundWebhooks.merchantId, merchantId), eq(outboundWebhooks.active, true), onlyWebhookId ? eq(outboundWebhooks.id, onlyWebhookId) : undefined));
  const targets = onlyWebhookId ? hooks : hooks.filter((h) => h.events.includes(event) || h.events.includes("*"));
  if (!targets.length) return 0;
  const envelope = eventEnvelope(ctx, merchantId, event, data);
  await ctx.db.insert(outboundWebhookDeliveries).values(
    targets.map((h) => ({ webhookId: h.id, merchantId, event, payload: envelope as Record<string, unknown>, nextAttemptAt: ctx.now() })),
  );
  return targets.length;
}

/**
 * Fire-and-forget: queue `event` for every webhook the merchant subscribed.
 * Safe to call without awaiting (errors are logged, never thrown). Outside
 * tests, delivery is attempted right away; failures retry from the job.
 */
export function emitMerchantEvent(ctx: AppContext, merchantId: string, event: OutboundEvent | (string & {}), data: Record<string, unknown>): Promise<void> {
  const p: Promise<void> = enqueue(ctx, merchantId, event, data)
    .then((n) => {
      if (n > 0 && ctx.config.env !== "test") setImmediate(() => void deliverDueWebhooks(ctx).catch((err) => console.error("[webhooks-out]", err)));
    })
    .catch((err) => {
      console.error(`[webhooks-out] failed to queue ${event} for ${merchantId}`, err);
    })
    .finally(() => emitsInFlight.delete(p));
  emitsInFlight.add(p);
  return p;
}

const emitsInFlight = new Set<Promise<void>>();

/** Resolves when every event queued by a fire-and-forget emitMerchantEvent has been written. Tests call it before delivering. */
export async function flushMerchantEvents(): Promise<void> {
  while (emitsInFlight.size) await Promise.all([...emitsInFlight]);
}

/** Queue + deliver a `ping` to one webhook now (dashboard "Send test"). */
export async function sendTestWebhook(ctx: AppContext, merchantId: string, webhookId: string, fetchImpl: Fetch = httpFor(ctx)) {
  await loadWebhook(ctx, merchantId, webhookId);
  await enqueue(ctx, merchantId, "ping", { message: "Test event from your loyalty dashboard" }, webhookId);
  const [d] = await ctx.db
    .select()
    .from(outboundWebhookDeliveries)
    .where(and(eq(outboundWebhookDeliveries.webhookId, webhookId), eq(outboundWebhookDeliveries.event, "ping"), eq(outboundWebhookDeliveries.status, "pending")))
    .orderBy(desc(outboundWebhookDeliveries.createdAt))
    .limit(1);
  if (!d) return null;
  return deliverOne(ctx, d.id, fetchImpl);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
export async function deliverOne(ctx: AppContext, deliveryId: string, fetchImpl: Fetch = httpFor(ctx)) {
  const now = ctx.now();
  // Claim the delivery (lease) so two workers never send it at the same time.
  const [d] = await ctx.db
    .update(outboundWebhookDeliveries)
    .set({ attempts: sql`${outboundWebhookDeliveries.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + 60_000) })
    .where(and(eq(outboundWebhookDeliveries.id, deliveryId), eq(outboundWebhookDeliveries.status, "pending"), lte(outboundWebhookDeliveries.nextAttemptAt, now)))
    .returning();
  if (!d) return null;
  const [w] = await ctx.db.select().from(outboundWebhooks).where(eq(outboundWebhooks.id, d.webhookId)).limit(1);
  if (!w || !w.active) {
    await ctx.db.update(outboundWebhookDeliveries).set({ status: "failed", lastError: "Webhook disabled" }).where(eq(outboundWebhookDeliveries.id, d.id));
    return { status: "failed" as const, statusCode: null };
  }
  const body = JSON.stringify(d.payload);
  const ts = Math.floor(now.getTime() / 1000);
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetchImpl(w.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "LocalLoyalty-Webhooks/1.0",
        "x-ll-event": d.event,
        "x-ll-delivery": d.id,
        "x-ll-signature": signWebhookBody(secretOf(ctx, w), ts, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    statusCode = res.status;
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
  } catch (err) {
    error = (err as Error).message || "Network error";
  }
  if (!error) {
    await ctx.db.update(outboundWebhookDeliveries).set({ status: "delivered", deliveredAt: now, lastStatusCode: statusCode, lastError: null }).where(eq(outboundWebhookDeliveries.id, d.id));
    return { status: "delivered" as const, statusCode };
  }
  // 410 Gone = the subscriber (e.g. Zapier) removed the hook: stop sending to it.
  if (statusCode === 410) {
    await ctx.db.update(outboundWebhooks).set({ active: false }).where(eq(outboundWebhooks.id, w.id));
    await ctx.db.update(outboundWebhookDeliveries).set({ status: "failed", lastStatusCode: 410, lastError: "Subscriber returned 410 Gone; webhook disabled" }).where(eq(outboundWebhookDeliveries.id, d.id));
    return { status: "failed" as const, statusCode };
  }
  const final = d.attempts >= MAX_ATTEMPTS;
  const delay = BACKOFF_SECONDS[Math.min(d.attempts - 1, BACKOFF_SECONDS.length - 1)]!;
  await ctx.db
    .update(outboundWebhookDeliveries)
    .set({ status: final ? "failed" : "pending", lastStatusCode: statusCode, lastError: error.slice(0, 500), nextAttemptAt: new Date(now.getTime() + delay * 1000) })
    .where(eq(outboundWebhookDeliveries.id, d.id));
  return { status: final ? ("failed" as const) : ("retrying" as const), statusCode };
}

/** One pass of the delivery queue (job). */
export async function deliverDueWebhooks(ctx: AppContext, fetchImpl: Fetch = httpFor(ctx), limit = 100) {
  const due = await ctx.db
    .select({ id: outboundWebhookDeliveries.id })
    .from(outboundWebhookDeliveries)
    .where(and(eq(outboundWebhookDeliveries.status, "pending"), lte(outboundWebhookDeliveries.nextAttemptAt, ctx.now())))
    .orderBy(asc(outboundWebhookDeliveries.nextAttemptAt))
    .limit(limit);
  let delivered = 0;
  let failed = 0;
  for (const { id } of due) {
    const r = await deliverOne(ctx, id, fetchImpl);
    if (r?.status === "delivered") delivered++;
    else if (r) failed++;
  }
  return { attempted: due.length, delivered, failed };
}

/** Delete delivered/failed rows older than `days` (job). */
export async function pruneDeliveries(ctx: AppContext, days = 30) {
  const cutoff = new Date(ctx.now().getTime() - days * 86400_000);
  await ctx.db.delete(outboundWebhookDeliveries).where(and(inArray(outboundWebhookDeliveries.status, ["delivered", "failed"]), lte(outboundWebhookDeliveries.createdAt, cutoff)));
}
