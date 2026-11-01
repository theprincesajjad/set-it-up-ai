/**
 * The platform's Claude key and AI settings (wave N, promo team). One resolver for every AI feature (promo writer, website
 * builder copy, sales agent):
 *   1. the key the founder saved at /admin/ai (ai_settings.encrypted_key, AES-256-GCM under APP_ENCRYPTION_KEY), else
 *   2. env ANTHROPIC_API_KEY (config.ai.envKey), else none.
 * The plaintext key never leaves this module except to build an SDK client: responses carry the masked form only, logs carry
 * nothing, and every change (set, rotate, delete, settings) writes an audit row.
 * Metering: every AI call lands in ai_usage (tokens and a cost in micro-dollars from config.ai.prices).
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { aiSettings, aiUsage, merchants, type DbOrTx } from "@ll/db";
import type { promosApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError, badRequest } from "../lib/errors.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { writeAudit } from "./admin-audit.js";

type SettingsRow = typeof aiSettings.$inferSelect;

const DEFAULTS: Omit<SettingsRow, "id"> = {
  encryptedKey: null,
  keyLast4: null,
  keySetAt: null,
  keySetBy: null,
  keyValidatedAt: null,
  model: null,
  monthlySpendCapCents: 5000,
  shopGenerationsPerMonth: 60,
  shopTokensPerMonth: 300000,
  freeGenerationsPerMonth: 3,
  updatedAt: null,
};

export async function getAiSettings(db: DbOrTx): Promise<SettingsRow> {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.id, "global")).limit(1);
  return row ?? { id: "global", ...DEFAULTS };
}

async function upsertSettings(db: DbOrTx, set: Partial<SettingsRow>, now: Date) {
  await db
    .insert(aiSettings)
    .values({ id: "global", ...DEFAULTS, ...set, updatedAt: now })
    .onConflictDoUpdate({ target: aiSettings.id, set: { ...set, updatedAt: now } });
}

/** The model the promo writer uses: the admin's pick when it is still a configured model, else config. */
export function effectiveModel(ctx: AppContext, s: Pick<SettingsRow, "model">): string {
  return s.model && ctx.config.ai.models.includes(s.model) ? s.model : ctx.config.ai.model;
}

// ---------------------------------------------------------------------------
// The resolver (cached briefly per app context; a change clears it)
// ---------------------------------------------------------------------------
export interface ResolvedKey {
  key: string;
  source: "admin" | "env";
}
const cache = new WeakMap<AppContext, { at: number; value: ResolvedKey | null }>();
const TTL_MS = 30_000;

export function clearAiKeyCache(ctx: AppContext) {
  cache.delete(ctx);
}

/** The key every AI feature uses, or null. A stored key that cannot be decrypted (master key changed) falls back to env. */
export async function resolveAnthropicKey(ctx: AppContext): Promise<ResolvedKey | null> {
  const hit = cache.get(ctx);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: ResolvedKey | null = null;
  try {
    const s = await getAiSettings(ctx.db);
    if (s.encryptedKey && ctx.config.ai.masterKeyHex) value = { key: decrypt(s.encryptedKey, ctx.config.ai.masterKeyHex), source: "admin" };
  } catch {
    value = null; // wrong master key or a malformed row: never throw from here, never log the payload
  }
  if (!value && ctx.config.ai.envKey) value = { key: ctx.config.ai.envKey, source: "env" };
  cache.set(ctx, { at: Date.now(), value });
  return value;
}

/** "sk-ant-…wxyz" style: the prefix family and the last four characters only. */
export function maskKey(last4: string | null | undefined): string | null {
  return last4 ? `sk-ant-…${last4}` : null;
}

// ---------------------------------------------------------------------------
// Validation: a cheap authenticated call (the Models API lookup costs no tokens)
// ---------------------------------------------------------------------------
async function defaultValidator(ctx: AppContext, apiKey: string): Promise<"ok" | "invalid" | "unreachable"> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 });
  try {
    await client.models.retrieve(ctx.config.ai.validateModel);
    return "ok";
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "invalid";
    if (err instanceof Anthropic.NotFoundError) return "ok"; // authenticated; the model name is a config matter
    return "unreachable";
  }
}

export async function validateKey(ctx: AppContext, apiKey: string): Promise<"ok" | "invalid" | "unreachable"> {
  if (ctx.providers.aiKeyValidator) return ctx.providers.aiKeyValidator(apiKey);
  if (ctx.config.ai.fake) return /^sk-ant-[\w-]{16,}$/.test(apiKey) ? "ok" : "invalid";
  return defaultValidator(ctx, apiKey);
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------
export async function setAiKey(ctx: AppContext, actorUserId: string, apiKey: string, ip?: string | null): Promise<promosApi.AiAdminSettings> {
  const master = ctx.config.ai.masterKeyHex;
  if (!master) throw new HttpError(409, "no_master_key", "Set APP_ENCRYPTION_KEY on the server first. The key is never stored without encryption.");
  if (!/^sk-ant-[\w-]+$/.test(apiKey)) throw badRequest("That doesn't look like a Claude API key (it starts with sk-ant-).");
  const verdict = await validateKey(ctx, apiKey);
  if (verdict === "invalid") throw badRequest("Claude rejected this key. Check it in the Claude Console and paste it again.");
  if (verdict === "unreachable") throw new HttpError(503, "ai_unreachable", "We couldn't reach Claude to check the key. Try again in a minute.");
  const before = await getAiSettings(ctx.db);
  const now = ctx.now();
  await upsertSettings(ctx.db, { encryptedKey: encrypt(apiKey, master), keyLast4: apiKey.slice(-4), keySetAt: now, keySetBy: actorUserId, keyValidatedAt: now }, now);
  await ctx.db.insert(aiUsage).values({ merchantId: null, feature: "validate", model: ctx.config.ai.validateModel, outcome: "ok", createdAt: now });
  await writeAudit(ctx.db, { actorUserId, action: before.encryptedKey ? "ai.key_rotated" : "ai.key_set", entity: "ai_settings", entityId: "global", data: { masked: maskKey(apiKey.slice(-4)), previous: maskKey(before.keyLast4) }, ip });
  clearAiKeyCache(ctx);
  return adminAiSettings(ctx);
}

export async function deleteAiKey(ctx: AppContext, actorUserId: string, ip?: string | null): Promise<promosApi.AiAdminSettings> {
  const before = await getAiSettings(ctx.db);
  const now = ctx.now();
  await upsertSettings(ctx.db, { encryptedKey: null, keyLast4: null, keySetAt: null, keySetBy: null, keyValidatedAt: null }, now);
  await writeAudit(ctx.db, { actorUserId, action: "ai.key_deleted", entity: "ai_settings", entityId: "global", data: { masked: maskKey(before.keyLast4) }, ip });
  clearAiKeyCache(ctx);
  return adminAiSettings(ctx);
}

export async function updateAiSettings(ctx: AppContext, actorUserId: string, body: { model?: string; monthlySpendCapCents?: number; shopGenerationsPerMonth?: number; shopTokensPerMonth?: number; freeGenerationsPerMonth?: number }, ip?: string | null) {
  if (body.model && !ctx.config.ai.models.includes(body.model)) throw badRequest(`Pick one of the configured models: ${ctx.config.ai.models.join(", ")}`);
  await upsertSettings(ctx.db, body, ctx.now());
  await writeAudit(ctx.db, { actorUserId, action: "ai.settings_updated", entity: "ai_settings", entityId: "global", data: body, ip });
  return adminAiSettings(ctx);
}

// ---------------------------------------------------------------------------
// Metering
// ---------------------------------------------------------------------------
export function costMicros(ctx: AppContext, model: string, input: number, output: number): number {
  const p = ctx.config.ai.prices[model] ?? ctx.config.ai.prices[ctx.config.ai.model] ?? { inputPerM: 4, outputPerM: 20 };
  // $ per M tokens = micro-dollars per token.
  return Math.round(input * p.inputPerM + output * p.outputPerM);
}

export async function recordAiUsage(ctx: AppContext, row: { merchantId: string | null; feature: string; model: string; outcome: string; input: number; output: number; goal?: string | null }) {
  const [r] = await ctx.db
    .insert(aiUsage)
    .values({ merchantId: row.merchantId, feature: row.feature, model: row.model, outcome: row.outcome, inputTokens: row.input, outputTokens: row.output, costMicros: row.outcome === "fake" ? 0 : costMicros(ctx, row.model, row.input, row.output), goal: row.goal ?? null, createdAt: ctx.now() })
    .returning({ id: aiUsage.id });
  return r!.id;
}

/** First instant of the current calendar month (UTC). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthSpendMicros(ctx: AppContext): Promise<number> {
  const [r] = await ctx.db.select({ c: sql<number>`coalesce(sum(${aiUsage.costMicros}),0)::bigint` }).from(aiUsage).where(gte(aiUsage.createdAt, monthStart(ctx.now())));
  return Number(r?.c ?? 0);
}

export async function adminAiSettings(ctx: AppContext): Promise<promosApi.AiAdminSettings> {
  const s = await getAiSettings(ctx.db);
  const resolved = await resolveAnthropicKey(ctx);
  const since = monthStart(ctx.now());
  const [tot] = await ctx.db
    .select({ c: sql<number>`coalesce(sum(${aiUsage.costMicros}),0)::bigint`, n: sql<number>`count(*)::int`, i: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`, o: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int` })
    .from(aiUsage)
    .where(and(gte(aiUsage.createdAt, since), sql`${aiUsage.feature} <> 'validate'`));
  const top = await ctx.db
    .select({
      merchantId: aiUsage.merchantId,
      name: merchants.name,
      plan: merchants.plan,
      generations: sql<number>`count(*) filter (where ${aiUsage.feature} = 'promo')::int`,
      tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}),0)::int`,
      spend: sql<number>`coalesce(sum(${aiUsage.costMicros}),0)::bigint`,
    })
    .from(aiUsage)
    .innerJoin(merchants, eq(merchants.id, aiUsage.merchantId))
    .where(and(gte(aiUsage.createdAt, since), isNotNull(aiUsage.merchantId)))
    .groupBy(aiUsage.merchantId, merchants.name, merchants.plan)
    .orderBy(desc(sql`coalesce(sum(${aiUsage.costMicros}),0)`), desc(sql`count(*)`))
    .limit(10);
  return {
    key: { source: resolved?.source ?? "none", masked: s.encryptedKey ? maskKey(s.keyLast4) : resolved?.source === "env" ? "ANTHROPIC_API_KEY" : null, setAt: s.keySetAt?.toISOString() ?? null, validatedAt: s.keyValidatedAt?.toISOString() ?? null },
    canStore: !!ctx.config.ai.masterKeyHex,
    model: effectiveModel(ctx, s),
    models: ctx.config.ai.models,
    monthlySpendCapCents: s.monthlySpendCapCents,
    shopGenerationsPerMonth: s.shopGenerationsPerMonth,
    shopTokensPerMonth: s.shopTokensPerMonth,
    freeGenerationsPerMonth: s.freeGenerationsPerMonth,
    plans: ctx.config.ai.plans,
    month: { spendCents: Math.round(Number(tot?.c ?? 0) / 10_000), calls: Number(tot?.n ?? 0), inputTokens: Number(tot?.i ?? 0), outputTokens: Number(tot?.o ?? 0) },
    topShops: top.map((t) => ({ merchantId: t.merchantId!, name: t.name, plan: t.plan, generations: Number(t.generations), tokens: Number(t.tokens), spendCents: Math.round(Number(t.spend) / 10_000) })),
    fake: ctx.config.ai.fake,
  };
}
