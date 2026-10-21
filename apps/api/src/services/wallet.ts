/**
 * Network wallet pass: ONE pass per customer (Apple + Google) showing their
 * member QR (LL:<memberCode>) and a balance summary across shops.
 *
 * Other teams: call `notifyPassUpdate(ctx, userId)` after a balance changes.
 * It never throws and is safe to fire-and-forget.
 */
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { loyaltyPrograms, merchantMembers, merchants, users, walletDeviceRegistrations, walletPasses } from "@ll/db";
import { walletApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { hmacSha256, randomToken, safeEqual } from "../lib/crypto.js";
import { HttpError, notFound } from "../lib/errors.js";
import { httpFor } from "./integrations-http.js";
import { apnsFor } from "./wallet-apns.js";
import { appleSignerFromConfig, buildPkpass, missingAppleConfig } from "./wallet-apple.js";
import { googleConfigured, googleSaveUrl, updateGoogleObject } from "./wallet-google.js";

export type WalletPass = typeof walletPasses.$inferSelect;
type Platform = "apple" | "google";

export async function walletSummary(ctx: AppContext, userId: string): Promise<walletApi.WalletSummary> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt) throw notFound("User");
  const rows = await ctx.db
    .select({
      merchantId: merchants.id,
      name: merchants.name,
      balance: merchantMembers.balance,
      terminology: loyaltyPrograms.terminology,
      expiryMonths: loyaltyPrograms.expiryMonths,
      lastVisitAt: merchantMembers.lastVisitAt,
    })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .leftJoin(loyaltyPrograms, eq(loyaltyPrograms.merchantId, merchants.id))
    .where(and(eq(merchantMembers.userId, userId), ne(merchants.status, "closed")))
    .orderBy(desc(merchantMembers.balance));
  const shops = rows.map((r) => ({ merchantId: r.merchantId, name: r.name, balance: r.balance, terminology: r.terminology ?? "points", expiryMonths: r.expiryMonths ?? null }));
  return {
    memberCode: user.memberCode,
    qrValue: walletApi.memberQrValue(user.memberCode),
    name: user.name,
    shopCount: shops.length,
    totalPoints: shops.reduce((s, x) => s + Math.max(0, x.balance), 0),
    shops,
  };
}

export async function getOrCreatePass(ctx: AppContext, userId: string, platform: Platform): Promise<WalletPass> {
  const [existing] = await ctx.db.select().from(walletPasses).where(and(eq(walletPasses.userId, userId), eq(walletPasses.platform, platform))).limit(1);
  if (existing) return existing;
  const [created] = await ctx.db
    .insert(walletPasses)
    .values({ userId, platform, serialNumber: `${platform === "apple" ? "A" : "G"}${randomToken(15)}`, authToken: randomToken(24), lastUpdatedAt: ctx.now() })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await ctx.db.select().from(walletPasses).where(and(eq(walletPasses.userId, userId), eq(walletPasses.platform, platform))).limit(1);
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
  const signer = appleSignerFromConfig(ctx.config);
  if (!signer) throw walletNotConfigured("apple", missingAppleConfig(ctx.config));
  const summary = await walletSummary(ctx, pass.userId);
  return buildPkpass(ctx.config, signer, { serialNumber: pass.serialNumber, authToken: pass.authToken, summary });
}

export async function googleSaveLink(ctx: AppContext, userId: string): Promise<string> {
  if (!googleConfigured(ctx.config)) {
    const missing = [!ctx.config.google.walletIssuerId && "GOOGLE_WALLET_ISSUER_ID", !ctx.config.google.walletServiceAccountJson && "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"].filter(Boolean) as string[];
    throw walletNotConfigured("google", missing.length ? missing : ["valid GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"]);
  }
  await getOrCreatePass(ctx, userId, "google");
  return googleSaveUrl(ctx.config, userId, await walletSummary(ctx, userId), ctx.now());
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
  if (ctx.config.apple.passTypeId && passTypeId !== ctx.config.apple.passTypeId) throw new HttpError(404, "not_found", "Unknown pass type");
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
  return !!row;
}

export async function unregisterDevice(ctx: AppContext, pass: WalletPass, deviceLibraryId: string) {
  await ctx.db.delete(walletDeviceRegistrations).where(and(eq(walletDeviceRegistrations.deviceLibraryId, deviceLibraryId), eq(walletDeviceRegistrations.passId, pass.id)));
}

/** Serial numbers registered on a device and updated since the tag (epoch ms). */
export async function serialsUpdatedSince(ctx: AppContext, deviceLibraryId: string, passTypeId: string, since: string | undefined) {
  if (ctx.config.apple.passTypeId && passTypeId !== ctx.config.apple.passTypeId) return null;
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
/**
 * Mark the customer's passes updated and push to their devices (Apple via
 * APNs, Google via object PATCH). Fire-and-forget: never throws.
 */
export async function notifyPassUpdate(ctx: AppContext, userId: string): Promise<void> {
  try {
    const passes = await ctx.db.update(walletPasses).set({ lastUpdatedAt: ctx.now() }).where(eq(walletPasses.userId, userId)).returning();
    if (!passes.length) return;
    const apple = passes.filter((p) => p.platform === "apple");
    if (apple.length) {
      const regs = await ctx.db
        .select()
        .from(walletDeviceRegistrations)
        .where(inArray(walletDeviceRegistrations.passId, apple.map((p) => p.id)));
      if (regs.length) {
        const topic = ctx.config.apple.passTypeId ?? "pass.local.loyalty";
        const r = await apnsFor(ctx).push([...new Set(regs.map((x) => x.pushToken))], topic);
        if (r.invalid.length) await ctx.db.delete(walletDeviceRegistrations).where(inArray(walletDeviceRegistrations.pushToken, r.invalid));
      }
    }
    if (passes.some((p) => p.platform === "google") && googleConfigured(ctx.config)) {
      await updateGoogleObject(ctx.config, userId, await walletSummary(ctx, userId), httpFor(ctx), ctx.now());
    }
  } catch (err) {
    console.error(`[wallet] pass update failed for ${userId}`, err);
  }
}

/** Convenience for callers that have a member id. */
export async function notifyPassUpdateForMember(ctx: AppContext, memberId: string): Promise<void> {
  const [m] = await ctx.db.select({ userId: merchantMembers.userId }).from(merchantMembers).where(eq(merchantMembers.id, memberId)).limit(1);
  if (m) await notifyPassUpdate(ctx, m.userId);
}
