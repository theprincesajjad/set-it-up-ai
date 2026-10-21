/**
 * Integration lifecycle: catalog, OAuth (signed state), credential storage
 * (AES-GCM at rest), settings (location/category mapping), sync.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { integrations, locations, merchantCategories, merchants, merchantStaff, outboundWebhooks, users, type Db } from "@ll/db";
import { CONNECTORS, getConnector, type ApiContext, type Connector, type Credentials, type ExternalRef } from "../connectors/index.js";
import type { AppContext } from "../context.js";
import { decrypt, encrypt, hmacSha256, randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import { httpFor } from "./integrations-http.js";

export type Integration = typeof integrations.$inferSelect;

// ---------------------------------------------------------------------------
// Credentials at rest
// ---------------------------------------------------------------------------
export function encryptCredentials(ctx: AppContext, creds: Credentials): string {
  return encrypt(JSON.stringify(creds), ctx.config.encryptionKey);
}

export function decryptCredentials(ctx: AppContext, enc: string | null): Credentials | null {
  if (!enc) return null;
  return JSON.parse(decrypt(enc, ctx.config.encryptionKey)) as Credentials;
}

// ---------------------------------------------------------------------------
// OAuth state: HMAC-signed, bound to merchant + user + provider, 15 min TTL,
// single use (nonce hash stored on the integration row).
// ---------------------------------------------------------------------------
const STATE_TTL_MS = 15 * 60 * 1000;
const stateKey = (ctx: AppContext) => `oauth-state:${ctx.config.jwtSecret}`;

export interface OAuthState {
  merchantId: string;
  userId: string;
  provider: string;
  nonce: string;
  exp: number;
}

export function signOAuthState(ctx: AppContext, s: Omit<OAuthState, "exp"> & { exp?: number }): string {
  const payload = Buffer.from(JSON.stringify({ m: s.merchantId, u: s.userId, p: s.provider, n: s.nonce, e: s.exp ?? ctx.now().getTime() + STATE_TTL_MS })).toString("base64url");
  return `${payload}.${hmacSha256(stateKey(ctx), payload, "base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

export function verifyOAuthState(ctx: AppContext, state: string | undefined, provider: string): OAuthState {
  const bad = (msg: string) => new HttpError(400, "invalid_state", msg);
  if (!state || !state.includes(".")) throw bad("Missing OAuth state");
  const [payload, sig] = state.split(".") as [string, string];
  const expected = hmacSha256(stateKey(ctx), payload, "base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (!safeEqual(expected, sig)) throw bad("OAuth state signature mismatch");
  let parsed: { m: string; u: string; p: string; n: string; e: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw bad("Malformed OAuth state");
  }
  if (parsed.p !== provider) throw bad("OAuth state is for a different provider");
  if (typeof parsed.e !== "number" || parsed.e < ctx.now().getTime()) throw bad("OAuth state expired; start the connection again");
  return { merchantId: parsed.m, userId: parsed.u, provider: parsed.p, nonce: parsed.n, exp: parsed.e };
}

export const redirectUriFor = (ctx: AppContext, provider: string) => `${ctx.config.publicApiUrl}/v1/integrations/${provider}/callback`;
export const webhookUrlFor = (ctx: AppContext, path: string) => `${ctx.config.publicApiUrl}${path}`;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export async function getIntegration(db: Db, merchantId: string, provider: string): Promise<Integration | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.merchantId, merchantId), eq(integrations.provider, provider as Integration["provider"])))
    .limit(1);
  return row ?? null;
}

export async function findConnectedByAccount(db: Db, provider: string, externalAccountId: string): Promise<Integration | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.provider, provider as Integration["provider"]), eq(integrations.externalAccountId, externalAccountId), eq(integrations.status, "connected")),
    )
    .limit(1);
  return row ?? null;
}

async function upsertIntegration(db: Db, merchantId: string, provider: string, patch: Partial<typeof integrations.$inferInsert>): Promise<Integration> {
  const existing = await getIntegration(db, merchantId, provider);
  if (existing) {
    const [u] = await db.update(integrations).set({ ...patch, updatedAt: new Date() }).where(eq(integrations.id, existing.id)).returning();
    return u!;
  }
  const [row] = await db
    .insert(integrations)
    .values({ merchantId, provider: provider as Integration["provider"], status: "pending", settings: {}, ...patch })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  return (await getIntegration(db, merchantId, provider))!;
}

/** Settings without internal keys (nonce, sync bookkeeping). */
export function publicSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(settings).filter(([k]) => !k.startsWith("_") && k !== "syncedHashes"));
}

/** Decrypted API context; refreshes expiring OAuth tokens (and persists them). */
export async function apiContextFor(ctx: AppContext, integ: Integration): Promise<ApiContext> {
  const connector = getConnector(integ.provider);
  let creds = decryptCredentials(ctx, integ.credentialsEnc) ?? { accessToken: "" };
  if (connector?.refresh && creds.expiresAt && new Date(creds.expiresAt).getTime() - ctx.now().getTime() < 5 * 60 * 1000) {
    creds = await connector.refresh(ctx.config, creds, httpFor(ctx));
    await ctx.db.update(integrations).set({ credentialsEnc: encryptCredentials(ctx, creds), updatedAt: ctx.now() }).where(eq(integrations.id, integ.id));
  }
  return { config: ctx.config, fetch: httpFor(ctx), credentials: creds, settings: integ.settings, externalAccountId: integ.externalAccountId, now: ctx.now };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export interface CatalogEntry {
  provider: string;
  name: string;
  category: string;
  description: string;
  auth: "oauth" | "credentials" | "link" | "api_key" | "webhook" | "managed";
  available: boolean;
  status: "not_connected" | "pending" | "connected" | "error" | "disconnected";
  free: true;
  connectFields: { key: string; label: string; required: boolean }[];
  externalAccountId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  settings: Record<string, unknown>;
  webhookUrl: string | null;
  setup: { events?: string[]; scopes?: string[]; envVars: string[] };
}

export function connectorEntry(ctx: AppContext, c: Connector, row: Integration | null): CatalogEntry {
  return {
    provider: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    auth: c.auth,
    available: c.configured(ctx.config),
    status: row ? row.status : "not_connected",
    free: true,
    connectFields: c.connectFields ?? [],
    externalAccountId: row?.externalAccountId ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    settings: row ? publicSettings(row.settings) : {},
    webhookUrl: c.setup.webhookPath ? webhookUrlFor(ctx, c.setup.webhookPath) : null,
    setup: { events: c.setup.events, scopes: c.setup.scopes, envVars: c.setup.envVars },
  };
}

export async function integrationCatalog(ctx: AppContext, merchantId: string): Promise<CatalogEntry[]> {
  const rows = await ctx.db.select().from(integrations).where(eq(integrations.merchantId, merchantId));
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const hooks = await ctx.db.select({ createdVia: outboundWebhooks.createdVia, active: outboundWebhooks.active }).from(outboundWebhooks).where(eq(outboundWebhooks.merchantId, merchantId));
  const [m] = await ctx.db.select({ apiKeyHash: merchants.apiKeyHash }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const hookStatus = (via: string[]) => (hooks.some((h) => h.active && via.includes(h.createdVia)) ? "connected" : "not_connected");
  const extra = (provider: string, name: string, category: string, description: string, auth: CatalogEntry["auth"], status: CatalogEntry["status"], available = true): CatalogEntry => ({
    provider,
    name,
    category,
    description,
    auth,
    available,
    status,
    free: true,
    connectFields: [],
    externalAccountId: null,
    lastSyncAt: null,
    lastError: null,
    settings: {},
    webhookUrl: null,
    setup: { envVars: [] },
  });
  return [
    ...Object.values(CONNECTORS).map((c) => connectorEntry(ctx, c, byProvider.get(c.id) ?? null)),
    extra("zapier", "Zapier", "automation", "Trigger 6,000+ apps when members join, earn or redeem. Uses your API key.", "api_key", hookStatus(["zapier"])),
    extra("make", "Make", "automation", "Build Make scenarios from loyalty events. Uses your API key.", "api_key", hookStatus(["make"])),
    extra("webhooks", "Webhooks", "automation", "Send signed JSON to your own URL on every loyalty event.", "webhook", hookStatus(["dashboard", "api"])),
    extra("api", "REST API", "automation", "Award and redeem from any custom POS with your merchant API key.", "api_key", m?.apiKeyHash ? "connected" : "not_connected"),
    extra(
      "twilio",
      "SMS (Twilio)",
      "messaging",
      "Text members receipts, reward alerts and campaigns. Managed by us; STOP/HELP handled automatically.",
      "managed",
      ctx.config.sms.provider === "twilio" ? "connected" : "not_connected",
      ctx.config.sms.provider === "twilio",
    ),
  ];
}

// ---------------------------------------------------------------------------
// Connect / callback / disconnect
// ---------------------------------------------------------------------------
function requireConnector(provider: string): Connector {
  const c = getConnector(provider);
  if (!c) throw notFound("Integration");
  return c;
}

function notConfigured(c: Connector) {
  return new HttpError(503, "not_configured", `${c.name} isn't set up on this server yet (missing ${c.setup.envVars.join(", ")})`, { envVars: c.setup.envVars });
}

export async function startConnect(ctx: AppContext, merchantId: string, userId: string, provider: string, body: Record<string, unknown>) {
  const c = requireConnector(provider);
  if (!c.configured(ctx.config)) throw notConfigured(c);
  if (c.auth === "oauth") {
    const nonce = randomToken(16);
    const existing = await getIntegration(ctx.db, merchantId, provider);
    await upsertIntegration(ctx.db, merchantId, provider, { settings: { ...(existing?.settings ?? {}), _oauthNonce: sha256(nonce) } });
    const state = signOAuthState(ctx, { merchantId, userId, provider, nonce });
    try {
      return { authUrl: c.authUrl!(ctx.config, { state, redirectUri: redirectUriFor(ctx, provider), body }), integration: null };
    } catch (err) {
      throw badRequest((err as Error).message);
    }
  }
  let result;
  try {
    result = await c.connectDirect!(ctx.config, body, httpFor(ctx));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest((err as Error).message);
  }
  const row = await saveConnection(ctx, merchantId, c, result);
  return { authUrl: null, integration: connectorEntry(ctx, c, row) };
}

async function saveConnection(ctx: AppContext, merchantId: string, c: Connector, result: Awaited<ReturnType<NonNullable<Connector["connectDirect"]>>>) {
  const other = await findConnectedByAccount(ctx.db, c.id, result.externalAccountId);
  if (other && other.merchantId !== merchantId && c.category !== "marketing") {
    throw new HttpError(409, "already_linked", `This ${c.name} account is already connected to another business`);
  }
  const existing = await getIntegration(ctx.db, merchantId, c.id);
  const { _oauthNonce: _n, ...prevSettings } = existing?.settings ?? {};
  let row = await upsertIntegration(ctx.db, merchantId, c.id, {
    status: "connected",
    externalAccountId: result.externalAccountId,
    credentialsEnc: result.credentials ? encryptCredentials(ctx, result.credentials) : null,
    settings: { autoAward: true, autoEnroll: true, ...prevSettings, ...(result.settings ?? {}), connectedAt: ctx.now().toISOString() },
    lastError: null,
  });
  if (c.afterConnect || c.sync) {
    try {
      const api = await apiContextFor(ctx, row);
      if (c.afterConnect) await c.afterConnect(api);
      if (c.sync && c.id !== "mailchimp") row = (await runSync(ctx, row)).row;
    } catch (err) {
      [row] = (await ctx.db.update(integrations).set({ lastError: `Setup: ${(err as Error).message}` }).where(eq(integrations.id, row.id)).returning()) as [Integration];
    }
  }
  return row;
}

export async function completeOAuth(ctx: AppContext, provider: string, query: Record<string, string>) {
  const c = requireConnector(provider);
  const state = verifyOAuthState(ctx, query.state, provider);
  // The user who started the flow must still be a manager/owner of the merchant.
  const [staff] = await ctx.db
    .select({ role: merchantStaff.role })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, state.merchantId), eq(merchantStaff.userId, state.userId)))
    .limit(1);
  const [m] = await ctx.db.select({ repUserId: merchants.repUserId }).from(merchants).where(eq(merchants.id, state.merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const allowed = (staff && staff.role !== "staff") || m.repUserId === state.userId || (await isAdmin(ctx, state.userId));
  if (!allowed) throw new HttpError(403, "forbidden", "You no longer have access to connect integrations for this business");
  const existing = await getIntegration(ctx.db, state.merchantId, provider);
  const nonceHash = existing?.settings?._oauthNonce;
  if (typeof nonceHash !== "string" || !safeEqual(nonceHash, sha256(state.nonce))) throw new HttpError(400, "invalid_state", "This connection link was already used or replaced");
  if (query.error) throw new HttpError(400, "oauth_denied", query.error_description ?? query.error);
  if (!query.code) throw badRequest("Missing authorization code");
  let result;
  try {
    result = await c.exchangeCode!(ctx.config, { code: query.code, redirectUri: redirectUriFor(ctx, provider), query }, httpFor(ctx));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "oauth_exchange_failed", `${c.name} rejected the connection: ${(err as Error).message}`);
  }
  const row = await saveConnection(ctx, state.merchantId, c, result);
  return { merchantId: state.merchantId, integration: row };
}

async function isAdmin(ctx: AppContext, userId: string) {
  const [u] = await ctx.db.select({ role: users.platformRole }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.role === "admin";
}

export async function disconnect(ctx: AppContext, merchantId: string, provider: string) {
  const c = requireConnector(provider);
  const row = await getIntegration(ctx.db, merchantId, provider);
  if (!row) throw notFound("Integration");
  if (c.revoke && row.credentialsEnc) {
    try {
      await c.revoke(await apiContextFor(ctx, row));
    } catch {
      /* best effort: we drop our credentials regardless */
    }
  }
  const { _oauthNonce: _n, ...settings } = row.settings;
  const [u] = await ctx.db
    .update(integrations)
    .set({ status: "disconnected", credentialsEnc: null, settings, updatedAt: ctx.now() })
    .where(eq(integrations.id, row.id))
    .returning();
  return connectorEntry(ctx, c, u!);
}

/** Provider-initiated disconnect (app uninstalled / authorization revoked). */
export async function markDisconnected(ctx: AppContext, integ: Integration, reason: string) {
  await ctx.db.update(integrations).set({ status: "disconnected", credentialsEnc: null, lastError: reason, updatedAt: ctx.now() }).where(eq(integrations.id, integ.id));
}

// ---------------------------------------------------------------------------
// Mapping: locations.externalIds[provider] = externalLocationId;
// merchant_categories.externalIds["<provider>:<externalCategoryId>"] = externalCategoryId
// (several external categories can map to one category, e.g. all Rx categories → Prescriptions).
// ---------------------------------------------------------------------------
export async function locationForExternal(db: Db, merchantId: string, provider: string, externalLocationId: string | null | undefined): Promise<string | null> {
  if (!externalLocationId) return null;
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.merchantId, merchantId), sql`${locations.externalIds} ->> ${provider} = ${externalLocationId}`))
    .limit(1);
  return row?.id ?? null;
}

export async function categoryMap(db: Db, merchantId: string, provider: string): Promise<Map<string, string>> {
  const cats = await db.select({ id: merchantCategories.id, externalIds: merchantCategories.externalIds }).from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const out = new Map<string, string>();
  for (const c of cats) {
    for (const [k, v] of Object.entries(c.externalIds ?? {})) {
      if (k === provider || k.startsWith(`${provider}:`)) out.set(String(v), c.id);
    }
  }
  return out;
}

export async function setLocationMap(db: Db, merchantId: string, provider: string, map: Record<string, string | null>) {
  const locs = await db.select().from(locations).where(eq(locations.merchantId, merchantId));
  const valid = new Set(locs.map((l) => l.id));
  for (const [ext, locId] of Object.entries(map)) if (locId && !valid.has(locId)) throw badRequest(`Unknown location ${locId}`);
  for (const loc of locs) {
    const ids = { ...(loc.externalIds ?? {}) };
    const current = ids[provider];
    let changed = false;
    for (const [ext, locId] of Object.entries(map)) {
      if (current === ext && locId !== loc.id) {
        delete ids[provider];
        changed = true;
      }
      if (locId === loc.id && ids[provider] !== ext) {
        ids[provider] = ext;
        changed = true;
      }
    }
    if (changed) await db.update(locations).set({ externalIds: ids }).where(eq(locations.id, loc.id));
  }
}

export async function setCategoryMap(db: Db, merchantId: string, provider: string, map: Record<string, string | null>) {
  const cats = await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const valid = new Set(cats.map((c) => c.id));
  for (const catId of Object.values(map)) if (catId && !valid.has(catId)) throw badRequest(`Unknown category ${catId}`);
  for (const cat of cats) {
    const ids = { ...(cat.externalIds ?? {}) };
    let changed = false;
    for (const [ext, catId] of Object.entries(map)) {
      const key = `${provider}:${ext}`;
      if (catId === cat.id && ids[key] !== ext) {
        ids[key] = ext;
        changed = true;
      } else if (catId !== cat.id && (key in ids || ids[provider] === ext)) {
        delete ids[key];
        if (ids[provider] === ext) delete ids[provider];
        changed = true;
      }
    }
    if (changed) await db.update(merchantCategories).set({ externalIds: ids }).where(eq(merchantCategories.id, cat.id));
  }
}

/** Current mapping, for the settings screen. */
export async function currentMapping(db: Db, merchantId: string, provider: string) {
  const locs = await db.select({ id: locations.id, externalIds: locations.externalIds }).from(locations).where(eq(locations.merchantId, merchantId));
  const locationMap: Record<string, string> = {};
  for (const l of locs) if (l.externalIds?.[provider]) locationMap[l.externalIds[provider]!] = l.id;
  const categoryMapObj = Object.fromEntries(await categoryMap(db, merchantId, provider));
  return { locationMap, categoryMap: categoryMapObj };
}

export interface SettingsPatch {
  autoAward?: boolean;
  autoEnroll?: boolean;
  locationMap?: Record<string, string | null>;
  categoryMap?: Record<string, string | null>;
  audienceId?: string | null;
  placeId?: string | null;
  listingUrl?: string | null;
}

export async function updateSettings(ctx: AppContext, merchantId: string, provider: string, patch: SettingsPatch) {
  const c = requireConnector(provider);
  const row = await getIntegration(ctx.db, merchantId, provider);
  if (!row) throw notFound("Integration");
  if (patch.locationMap) await setLocationMap(ctx.db, merchantId, provider, patch.locationMap);
  if (patch.categoryMap) await setCategoryMap(ctx.db, merchantId, provider, patch.categoryMap);
  const next = { ...row.settings };
  for (const k of ["autoAward", "autoEnroll", "audienceId", "placeId", "listingUrl"] as const) if (patch[k] !== undefined) next[k] = patch[k];
  const [u] = await ctx.db.update(integrations).set({ settings: next, updatedAt: ctx.now() }).where(eq(integrations.id, row.id)).returning();
  return { ...connectorEntry(ctx, c, u!), mapping: await currentMapping(ctx.db, merchantId, provider) };
}

// ---------------------------------------------------------------------------
// Sync (locations, categories; Mailchimp members)
// ---------------------------------------------------------------------------
const norm = (s: string) => s.trim().toLowerCase();

async function autoMap(ctx: AppContext, merchantId: string, provider: string, extLocs: ExternalRef[] = [], extCats: ExternalRef[] = []) {
  const { locationMap, categoryMap: catMap } = await currentMapping(ctx.db, merchantId, provider);
  const locs = await ctx.db.select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.merchantId, merchantId), eq(locations.active, true)));
  const newLoc: Record<string, string> = {};
  for (const ext of extLocs) {
    if (locationMap[ext.id]) continue;
    const byName = locs.find((l) => norm(l.name) === norm(ext.name));
    if (byName) newLoc[ext.id] = byName.id;
  }
  if (!Object.keys(locationMap).length && extLocs.length === 1 && locs.length === 1 && !Object.keys(newLoc).length) newLoc[extLocs[0]!.id] = locs[0]!.id;
  if (Object.keys(newLoc).length) await setLocationMap(ctx.db, merchantId, provider, newLoc);
  const cats = await ctx.db.select({ id: merchantCategories.id, name: merchantCategories.name }).from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const newCat: Record<string, string> = {};
  for (const ext of extCats) {
    if (catMap[ext.id]) continue;
    const byName = cats.find((cat) => norm(cat.name) === norm(ext.name));
    if (byName) newCat[ext.id] = byName.id;
  }
  if (Object.keys(newCat).length) await setCategoryMap(ctx.db, merchantId, provider, newCat);
}

export async function runSync(ctx: AppContext, row: Integration) {
  const c = requireConnector(row.provider);
  if (!c.sync) throw badRequest(`${c.name} has nothing to sync`);
  if (row.status !== "connected") throw new HttpError(409, "not_connected", `${c.name} is not connected`);
  try {
    const api = await apiContextFor(ctx, row);
    const r = await c.sync(api, ctx, row.merchantId);
    await autoMap(ctx, row.merchantId, row.provider, r.externalLocations, r.externalCategories);
    const settings = {
      ...row.settings,
      ...(r.settings ?? {}),
      ...(r.externalLocations ? { externalLocations: r.externalLocations } : {}),
      ...(r.externalCategories ? { externalCategories: r.externalCategories } : {}),
      ...(r.stats ? { lastSyncStats: r.stats } : {}),
    };
    const [u] = await ctx.db.update(integrations).set({ settings, lastSyncAt: ctx.now(), lastError: null, updatedAt: ctx.now() }).where(eq(integrations.id, row.id)).returning();
    return { row: u!, stats: r.stats ?? {} };
  } catch (err) {
    await ctx.db.update(integrations).set({ lastError: `Sync: ${(err as Error).message}`, updatedAt: ctx.now() }).where(eq(integrations.id, row.id));
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "sync_failed", `${c.name} sync failed: ${(err as Error).message}`);
  }
}

export async function syncIntegration(ctx: AppContext, merchantId: string, provider: string) {
  const row = await getIntegration(ctx.db, merchantId, provider);
  if (!row) throw notFound("Integration");
  const { row: u, stats } = await runSync(ctx, row);
  return { integration: connectorEntry(ctx, requireConnector(provider), u), mapping: await currentMapping(ctx.db, merchantId, provider), stats };
}

export async function connectedIntegrations(db: Db, providers?: string[]) {
  return db
    .select()
    .from(integrations)
    .where(and(eq(integrations.status, "connected"), providers ? inArray(integrations.provider, providers as Integration["provider"][]) : undefined));
}
