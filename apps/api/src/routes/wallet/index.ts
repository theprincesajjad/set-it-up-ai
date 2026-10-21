/**
 * Wallet passes: GET /v1/me/wallet{,/apple,/apple/link,/google} for customers,
 * and the Apple PassKit web service at /v1/wallet/apple/v1/... (Apple calls it
 * with `Authorization: ApplePass <authenticationToken>`).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import { requireUser } from "../../lib/auth.js";
import { HttpError } from "../../lib/errors.js";
import { appleSignerFromConfig, missingAppleConfig, PASS_COLORS } from "../../services/wallet-apple.js";
import { googleConfigured } from "../../services/wallet-google.js";
import { iconPng, logoPng } from "../../services/wallet-png.js";
import {
  applePassBuffer,
  authenticatePass,
  getOrCreatePass,
  googleSaveLink,
  registerDevice,
  serialsUpdatedSince,
  signDownloadToken,
  unregisterDevice,
  verifyDownloadToken,
  walletSummary,
} from "../../services/wallet.js";

const PKPASS = "application/vnd.apple.pkpass";

async function sendPass(ctx: AppContext, reply: FastifyReply, userId: string) {
  const pass = await getOrCreatePass(ctx, userId, "apple");
  const buf = await applePassBuffer(ctx, pass);
  return reply
    .header("content-type", PKPASS)
    .header("content-disposition", 'attachment; filename="member-card.pkpass"')
    .header("last-modified", pass.lastUpdatedAt.toUTCString())
    .header("cache-control", "no-store")
    .send(buf);
}

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------
  app.get("/me/wallet", async (req) => {
    const u = requireUser(req);
    const summary = await walletSummary(ctx, u.id);
    const appleMissing = missingAppleConfig(ctx.config);
    let saveUrl: string | null = null;
    let googleReason: string | null = null;
    if (googleConfigured(ctx.config)) {
      try {
        saveUrl = await googleSaveLink(ctx, u.id);
      } catch (err) {
        googleReason = (err as Error).message;
      }
    } else googleReason = "Google Wallet is not configured on this server";
    let downloadUrl: string | null = null;
    if (!appleMissing.length) downloadUrl = `${ctx.config.publicApiUrl}/v1/wallet/apple/download?token=${encodeURIComponent(signDownloadToken(ctx, u.id).token)}`;
    return {
      summary,
      apple: { available: !appleMissing.length, downloadUrl, reason: appleMissing.length ? `Apple Wallet is not configured (missing ${appleMissing.join(", ")})` : null },
      google: { available: !!saveUrl, saveUrl, reason: saveUrl ? null : googleReason },
    };
  });

  app.get("/me/wallet/apple", async (req, reply) => {
    const u = requireUser(req);
    return sendPass(ctx, reply, u.id);
  });

  app.get("/me/wallet/apple/link", async (req) => {
    const u = requireUser(req);
    if (!appleSignerFromConfig(ctx.config)) {
      const missing = missingAppleConfig(ctx.config);
      throw new HttpError(503, "wallet_not_configured", `Apple Wallet passes aren't available on this server yet (missing ${missing.join(", ")}).`, { missing });
    }
    const { token, expiresAt } = signDownloadToken(ctx, u.id);
    return { url: `${ctx.config.publicApiUrl}/v1/wallet/apple/download?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() };
  });

  app.get("/me/wallet/google", async (req) => {
    const u = requireUser(req);
    return { saveUrl: await googleSaveLink(ctx, u.id) };
  });

  // Short-lived signed link: Safari opens it directly and offers "Add to Apple Wallet".
  app.get("/wallet/apple/download", async (req, reply) => {
    const userId = verifyDownloadToken(ctx, String((req.query as { token?: string }).token ?? ""));
    if (!userId) throw new HttpError(401, "link_expired", "This wallet link expired. Open your card again to get a new one.");
    return sendPass(ctx, reply, userId);
  });

  // Public pass artwork (Google Wallet object logo).
  app.get("/wallet/assets/logo.png", async (_req, reply) => reply.header("content-type", "image/png").header("cache-control", "public, max-age=86400").send(iconPng(660, PASS_COLORS.background)));
  app.get("/wallet/assets/strip.png", async (_req, reply) => reply.header("content-type", "image/png").header("cache-control", "public, max-age=86400").send(logoPng(320, 100)));

  // -------------------------------------------------------------------------
  // Apple PassKit web service (https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes)
  // -------------------------------------------------------------------------
  const base = "/wallet/apple/v1";
  type RegParams = { deviceLibraryIdentifier: string; passTypeIdentifier: string; serialNumber: string };

  app.post(`${base}/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber`, async (req, reply) => {
    const p = req.params as RegParams;
    const pass = await authenticatePass(ctx, p.passTypeIdentifier, p.serialNumber, req.headers.authorization);
    const pushToken = (req.body as { pushToken?: unknown } | undefined)?.pushToken;
    if (typeof pushToken !== "string" || !pushToken || pushToken.length > 200) throw new HttpError(400, "bad_request", "pushToken is required");
    const created = await registerDevice(ctx, pass, p.deviceLibraryIdentifier.slice(0, 200), pushToken);
    return reply.status(created ? 201 : 200).send();
  });

  app.delete(`${base}/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber`, async (req, reply) => {
    const p = req.params as RegParams;
    const pass = await authenticatePass(ctx, p.passTypeIdentifier, p.serialNumber, req.headers.authorization);
    await unregisterDevice(ctx, pass, p.deviceLibraryIdentifier);
    return reply.status(200).send();
  });

  app.get(`${base}/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier`, async (req, reply) => {
    const p = req.params as Omit<RegParams, "serialNumber">;
    const r = await serialsUpdatedSince(ctx, p.deviceLibraryIdentifier, p.passTypeIdentifier, (req.query as { passesUpdatedSince?: string }).passesUpdatedSince);
    if (!r) return reply.status(204).send();
    return r;
  });

  app.get(`${base}/passes/:passTypeIdentifier/:serialNumber`, async (req, reply) => {
    const p = req.params as Omit<RegParams, "deviceLibraryIdentifier">;
    const pass = await authenticatePass(ctx, p.passTypeIdentifier, p.serialNumber, req.headers.authorization);
    const ims = req.headers["if-modified-since"];
    if (ims) {
      const since = new Date(ims).getTime();
      if (!Number.isNaN(since) && Math.floor(pass.lastUpdatedAt.getTime() / 1000) <= Math.floor(since / 1000)) return reply.status(304).send();
    }
    const buf = await applePassBuffer(ctx, pass);
    return reply.header("content-type", PKPASS).header("last-modified", pass.lastUpdatedAt.toUTCString()).send(buf);
  });

  app.post(`${base}/log`, async (req, reply) => {
    const logs = (req.body as { logs?: unknown[] } | undefined)?.logs;
    if (Array.isArray(logs) && ctx.config.env !== "test") for (const l of logs.slice(0, 20)) console.warn(`[passkit] ${String(l).slice(0, 500)}`);
    return reply.status(200).send();
  });
}
