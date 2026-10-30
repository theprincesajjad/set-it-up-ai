/**
 * Network wallet pass: ONE pass per customer (Apple + Google) showing their
 * member QR (LL:<memberCode>), rewards ready and per-shop balances.
 *
 * Pass updates are automatic: every ledger balance change (award, redeem,
 * adjust, reversal — counter, app, POS and API) reaches `notifyPassUpdate`
 * through the ledger's balance listeners (registered at the bottom of this
 * file). Other teams may still call `notifyPassUpdate(ctx, userId)` after
 * changing anything else shown on the pass (e.g. the customer's name); it
 * never throws and skips the push when the pass content didn't change.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { locations, loyaltyPrograms, merchantMembers, merchants, neighbourhoods, rewards, users, walletDeviceRegistrations, walletPasses } from "@ll/db";
import { normalizeLocale, t as translate, walletApi, type Locale } from "@ll/shared";
import type { AppContext } from "../context.js";
import { hmacSha256, randomToken, safeEqual } from "../lib/crypto.js";
import { HttpError, notFound } from "../lib/errors.js";
import { httpFor } from "./integrations-http.js";
import { registerBalanceListener, type BalanceListener } from "./ledger.js";
import { apnsFor } from "./wallet-apns.js";
import { appleSignerFromConfig, buildPkpass, missingAppleConfig, passTypeIdOf, type PassLocation } from "./wallet-apple.js";
import { addGoogleMessage, googleConfigured, googleSaveUrl, updateGoogleObject } from "./wallet-google.js";
import { markAppleAdded, markAppleRemovedIfUnregistered, shopPassBuffer } from "./wallet-shop.js";

export type WalletPass = typeof walletPasses.$inferSelect;
type Platform = "apple" | "google";

export async function walletSummary(ctx: AppContext, userId: string): Promise<walletApi.WalletSummary> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) throw notFound("User");
  const rows = await ctx.db
    .select({
      merchantId: merchants.id,
      name: merchants.name,
      slug: merchants.slug,
      balance: merchantMembers.balance,
      terminology: loyaltyPrograms.terminology,
      expiryMonths: loyaltyPrograms.expiryMonths,
      lastVisitAt: merchantMembers.lastVisitAt,
      joinedAt: merchantMembers.createdAt,
    })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .leftJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchants.id))
    .where(and(eq(merchantMembers.userId, userId), ne(merchants.status, "closed")))
    .orderBy(desc(merchantMembers.balance));
  const costs = rows.length
    ? await ctx.db
        .select({ merchantId: rewards.merchantId, cost: rewards.pointsCost })
        .from(rewards)
        .where(and(inArray(rewards.merchantId, rows.map((r) => r.merchantId)), eq(rewards.active, true)))
    : [];
  const ready = (merchantId: string, balance: number) => costs.filter((c) => c.merchantId === merchantId && c.cost <= balance).length;
  const shops = rows
    .map((r) => ({
      merchantId: r.merchantId,
      name: r.name,
      slug: r.slug,
      balance: r.balance,
      terminology: r.terminology ?? "points",
      expiryMonths: r.expiryMonths ?? null,
      rewardsReady: ready(r.merchantId, r.balance),
      lastVisitAt: r.lastVisitAt ? r.lastVisitAt.toISOString() : null,
      _recent: (r.lastVisitAt ?? r.joinedAt).getTime(),
    }))
    // Rewards ready first, then the most recent visit (the shop that just changed is on the front).
    .sort((a, b) => Number(b.rewardsReady > 0) - Number(a.rewardsReady > 0) || b._recent - a._recent || a.name.localeCompare(b.name))
    .map(({ _recent, ...x }) => x);
  return {
    memberCode: user.memberCode,
    qrValue: walletApi.memberQrValue(user.memberCode),
    name: user.name,
    locale: normalizeLocale(user.locale) ?? "en",
    shopCount: shops.length,
    totalPoints: shops.reduce((s, x) => s + Math.max(0, x.balance), 0),
    rewardsReady: shops.reduce((s, x) => s + x.rewardsReady, 0),
    shops,
  };
}

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371e3 * Math.asin(Math.sqrt(h));
};

/**
 * Up to 10 member-shop locations, nearest first, for lock-screen relevance
 * ("Show this at Pinecone to earn"). "Near" = the customer's home neighbourhood
 * centre, or else their most recently visited shop.
 */
export async function passLocations(ctx: AppContext, userId: string, max = 10, locale: Locale = "en"): Promise<PassLocation[]> {
  const rows = await ctx.db
    .select({ name: merchants.name, lat: locations.lat, lng: locations.lng, lastVisitAt: merchantMembers.lastVisitAt })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .innerJoin(locations, eq(locations.merchantId, merchants.id))
    .where(and(eq(merchantMembers.userId, userId), ne(merchants.status, "closed"), eq(locations.active, true), eq(locations.addressVisibility, "exact"), isNotNull(locations.lat), isNotNull(locations.lng)))
    // Home studios and travelling pros (address_visibility area or city) are never on the pass: their pin is private (phase-solo B).
    .orderBy(desc(merchantMembers.lastVisitAt), asc(locations.createdAt))
    .limit(200);
  if (!rows.length) return [];
  const [home] = await ctx.db
    .select({ lat: neighbourhoods.centerLat, lng: neighbourhoods.centerLng })
    .from(users)
    .innerJoin(neighbourhoods, eq(neighbourhoods.id, users.homeNeighbourhoodId))
    .where(eq(users.id, userId))
    .limit(1);
  const origin = home?.lat != null && home.lng != null ? { lat: home.lat, lng: home.lng } : { lat: rows[0]!.lat!, lng: rows[0]!.lng! };
  return rows
    .map((r) => ({ r, d: haversine(origin, { lat: r.lat!, lng: r.lng! }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ r }) => ({ latitude: Number(r.lat!.toFixed(6)), longitude: Number(r.lng!.toFixed(6)), relevantText: translate(locale, "sh.pass.nearby", { shop: r.name }) }));
}

export async function getOrCreatePass(ctx: AppContext, userId: string, platform: Platform): Promise<WalletPass> {
  const network = and(eq(walletPasses.userId, userId), eq(walletPasses.platform, platform), isNull(walletPasses.merchantId));
  const [existing] = await ctx.db.select().from(walletPasses).where(network).limit(1);
  if (existing) return existing;
  const [created] = await ctx.db
    .insert(walletPasses)
    .values({ userId, platform, serialNumber: `${platform === "apple" ? "A" : "G"}${randomToken(15)}`, authToken: randomToken(24), lastUpdatedAt: ctx.now() })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await ctx.db.select().from(walletPasses).where(network).limit(1);
  return again!;
}

export function walletNotConfigured(platform: Platform, missing: string[]) {
  return new HttpError(
    503,
    "wallet_not_configured",
    platform === "apple"
      ? `Apple Wallet passes aren't available on this server yet (missing ${missing.join(", ")}). Use the in-app or web member card meanwhile.`
      : `Google Wallet isn't available on this server yet (missing ${missing.join(", ")}).`,
    { missing },
  );
}

export async function applePassBuffer(ctx: AppContext, pass: WalletPass): Promise<Buffer> {
  // A shop card (merchant_id set) is built by wallet-shop.ts; the network pass below.
  if (pass.merchantId) return shopPassBuffer(ctx, pass);
  const signer = appleSignerFromConfig(ctx.config);
  if (!signer) throw walletNotConfigured("apple", missingAppleConfig(ctx.config));
  const summary = await walletSummary(ctx, pass.userId);
  const locs = await passLocations(ctx, pass.userId, 10, summary.locale ?? "en");
  return buildPkpass(ctx.config, signer, { serialNumber: pass.serialNumber, authToken: pass.authToken, summary, locations: locs });
}

export function missingGoogleConfig(ctx: AppContext): string[] {
  if (googleConfigured(ctx.config)) return [];
  const missing = [!ctx.config.google.walletIssuerId && "GOOGLE_WALLET_ISSUER_ID", !ctx.config.google.walletServiceAccountJson && "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"].filter(Boolean) as string[];
  return missing.length ? missing : ["valid GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"];
}

export async function googleSaveLink(ctx: AppContext, userId: string): Promise<string> {
  if (!googleConfigured(ctx.config)) throw walletNotConfigured("google", missingGoogleConfig(ctx));
  await getOrCreatePass(ctx, userId, "google");
  const summary = await walletSummary(ctx, userId);
  const locs = await passLocations(ctx, userId, 10, summary.locale ?? "en");
  return googleSaveUrl(ctx.config, userId, { summary, locations: locs }, ctx.now());
}

// ---------------------------------------------------------------------------
// Signed download links (Safari needs a plain GET for "Add to Apple Wallet")
// ---------------------------------------------------------------------------
const LINK_TTL_MS = 10 * 60 * 1000;
const linkKey = (ctx: AppContext) => `wallet-link:${ctx.config.jwtSecret}`;

export function signDownloadToken(ctx: AppContext, userId: string): { token: string; expiresAt: Date } {
  const exp = ctx.now().getTime() + LINK_TTL_MS;
  const body = `${userId}.${exp}`;
  return { token: `${body}.${hmacSha256(linkKey(ctx), body)}`, expiresAt: new Date(exp) };
}

export function verifyDownloadToken(ctx: AppContext, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  if (!safeEqual(hmacSha256(linkKey(ctx), `${userId}.${exp}`), sig)) return null;
  if (Number(exp) < ctx.now().getTime()) return null;
  return userId;
}

// ---------------------------------------------------------------------------
// PassKit web service
// ---------------------------------------------------------------------------
export async function authenticatePass(ctx: AppContext, passTypeId: string, serialNumber: string, authorization: string | undefined): Promise<WalletPass> {
  const expected = passTypeIdOf(ctx.config);
  if (expected && passTypeId !== expected) throw new HttpError(404, "not_found", "Unknown pass type");
  const token = authorization?.startsWith("ApplePass ") ? authorization.slice(10).trim() : null;
  const [pass] = await ctx.db.select().from(walletPasses).where(and(eq(walletPasses.serialNumber, serialNumber), eq(walletPasses.platform, "apple"))).limit(1);
  if (!pass || !token || !safeEqual(pass.authToken, token)) throw new HttpError(401, "unauthorized", "Invalid pass authentication token");
  return pass;
}

/** Returns true when a new registration was created (201) vs. already registered (200). */
export async function registerDevice(ctx: AppContext, pass: WalletPass, deviceLibraryId: string, pushToken: string): Promise<boolean> {
  const [existing] = await ctx.db
    .select()
    .from(walletDeviceRegistrations)
    .where(and(eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId), eq(walletDeviceRegistrations.passId, pass.id)))
    .limit(1);
  if (existing) {
    if (existing.pushToken !== pushToken) await ctx.db.update(walletDeviceRegistrations).set({ pushToken }).where(eq(walletDeviceRegistrations.id, existing.id));
    return false;
  }
  const [row] = await ctx.db.insert(walletDeviceRegistrations).values({ deviceLibraryId, pushToken, passId: pass.id }).onConflictDoNothing().returning();
  // The pass is in a wallet now (again, if it was removed before).
  await markAppleAdded(ctx, pass.id);
  return !!row;
}

export async function unregisterDevice(ctx: AppContext, pass: WalletPass, deviceLibraryId: string) {
  await ctx.db.delete(walletDeviceRegistrations).where(and(eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId), eq(walletDeviceRegistrations.passId, pass.id)));
  // Deleting the pass from Wallet unregisters it: with no device left it is removed (no more pushes).
  await markAppleRemovedIfUnregistered(ctx, pass.id);
}

/** Serial numbers registered on a device and updated since the tag (epoch ms). */
export async function serialsUpdatedSince(ctx: AppContext, deviceLibraryId: string, passTypeId: string, since: string | undefined) {
  const expected = passTypeIdOf(ctx.config);
  if (expected && passTypeId !== expected) return null;
  const sinceMs = since && /^\d+$/.test(since) ? Number(since) : null;
  const rows = await ctx.db
    .select({ serial: walletPasses.serialNumber, updated: walletPasses.lastUpdatedAt })
    .from(walletDeviceRegistrations)
    .innerJoin(walletPasses, eq(walletPasses.id, walletDeviceRegistrations.passId))
    .where(and(eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId), sinceMs !== null ? gt(walletPasses.lastUpdatedAt, new Date(sinceMs)) : undefined));
  if (!rows.length) return null;
  const last = Math.max(...rows.map((r) => r.updated.getTime()));
  return { serialNumbers: rows.map((r) => r.serial), lastUpdated: String(last) };
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
/** Last pushed pass content per user (per process): unchanged content → no push. */
const lastContent = new WeakMap<AppContext, Map<string, string>>();

export interface PassUpdateResult {
  changed: boolean;
  apple: { devices: number; sent: number; invalid: number };
  google: "updated" | "missing" | "skipped" | "failed";
}

/**
 * Mark the customer's passes updated and push to their devices (Apple via
 * APNs → device re-fetches the pass and shows the changeMessage; Google via
 * object PATCH). Skipped when the pass content is unchanged since the last
 * push. Fire-and-forget: never throws.
 */
export async function notifyPassUpdate(ctx: AppContext, userId: string, opts: { force?: boolean } = {}): Promise<PassUpdateResult | undefined> {
  try {
    const existing = await ctx.db.select({ id: walletPasses.id, platform: walletPasses.platform }).from(walletPasses).where(and(eq(walletPasses.userId, userId), isNull(walletPasses.merchantId)));
    if (!existing.length) return undefined;
    const summary = await walletSummary(ctx, userId);
    const locs = await passLocations(ctx, userId, 10, summary.locale ?? "en");
    const hash = createHash("sha1").update(JSON.stringify({ summary, locs })).digest("hex");
    let seen = lastContent.get(ctx);
    if (!seen) lastContent.set(ctx, (seen = new Map()));
    const out: PassUpdateResult = { changed: false, apple: { devices: 0, sent: 0, invalid: 0 }, google: "skipped" };
    if (!opts.force && seen.get(userId) === hash) return out;
    seen.set(userId, hash);
    out.changed = true;
    const passes = await ctx.db.update(walletPasses).set({ lastUpdatedAt: ctx.now() }).where(and(eq(walletPasses.userId, userId), isNull(walletPasses.merchantId))).returning();
    const apple = passes.filter((p) => p.platform === "apple");
    if (apple.length) {
      const regs = await ctx.db
        .select()
        .from(walletDeviceRegistrations)
        .where(inArray(walletDeviceRegistrations.passId, apple.map((p) => p.id)));
      out.apple.devices = regs.length;
      if (regs.length) {
        const topic = passTypeIdOf(ctx.config) ?? "pass.local.loyalty";
        const r = await apnsFor(ctx).push([...new Set(regs.map((x) => x.pushToken))], topic);
        out.apple.sent = r.sent;
        out.apple.invalid = r.invalid.length;
        if (r.invalid.length) await ctx.db.delete(walletDeviceRegistrations).where(inArray(walletDeviceRegistrations.pushToken, r.invalid));
      }
    }
    if (passes.some((p) => p.platform === "google") && googleConfigured(ctx.config)) {
      try {
        out.google = await updateGoogleObject(ctx.config, userId, { summary, locations: locs }, httpFor(ctx), ctx.now());
      } catch (err) {
        out.google = "failed";
        if (ctx.config.env !== "test") console.error(`[wallet] Google object update failed for ${userId}`, err);
      }
    }
    return out;
  } catch (err) {
    if (ctx.config.env !== "test") console.error(`[wallet] pass update failed for ${userId}`, err);
    return undefined;
  }
}

/**
 * Show a message on the customer's Google Wallet pass (with a notification).
 * Apple has no message API: Apple customers see the pass's changeMessage when
 * the balance updates. Never throws.
 */
export async function addPassMessage(ctx: AppContext, userId: string, msg: { id: string; header: string; body: string }): Promise<"added" | "missing" | "skipped" | "failed"> {
  try {
    if (!googleConfigured(ctx.config)) return "skipped";
    const [g] = await ctx.db.select({ id: walletPasses.id }).from(walletPasses).where(and(eq(walletPasses.userId, userId), eq(walletPasses.platform, "google"), isNull(walletPasses.merchantId))).limit(1);
    if (!g) return "skipped";
    return await addGoogleMessage(ctx.config, userId, { ...msg, id: msg.id.replace(/[^\w.-]/g, "_").slice(0, 60) }, httpFor(ctx), ctx.now());
  } catch (err) {
    if (ctx.config.env !== "test") console.error(`[wallet] Google message failed for ${userId}`, err);
    return "failed";
  }
}

/** Convenience for callers that have a member id. */
export async function notifyPassUpdateForMember(ctx: AppContext, memberId: string): Promise<void> {
  const [m] = await ctx.db.select({ userId: merchantMembers.userId }).from(merchantMembers).where(eq(merchantMembers.id, memberId)).limit(1);
  if (m) await notifyPassUpdate(ctx, m.userId);
}

/** Customers with at least one wallet pass (Apple or Google). */
export async function hasWalletPass(ctx: AppContext, userId: string): Promise<boolean> {
  const [p] = await ctx.db.select({ id: walletPasses.id }).from(walletPasses).where(eq(walletPasses.userId, userId)).limit(1);
  return !!p;
}

// Every ledger balance change updates the pass.
const walletBalanceListener: BalanceListener = async (ctx, change) => {
  await notifyPassUpdate(ctx, change.userId);
};
registerBalanceListener("wallet_pass", walletBalanceListener);
