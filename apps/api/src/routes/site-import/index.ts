/**
 * Website import (wave O, team import). services/site-import has the rules.
 *
 *   POST /v1/site-import                          onboarding step 1: signed in or not (the signup form creates the account later);
 *                                                 rate-limited per user and per address
 *   GET  /v1/site-import/:importId/logo           the downloaded logo, for the review card (24 h, by the import's random id)
 *   POST /v1/merchants/:merchantId/site-import    Settings, "Refresh from my website" (owner or manager)
 *   POST /v1/merchants/:merchantId/site-import/apply   save the fields the owner kept (owner or manager)
 *   GET  /v1/public/logos/:merchantId/:file       a logo the import stored, served while it is still the shop's logo
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { siteImportApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { applySiteImport, cachedImport, importSite, publicLogo } from "../../services/site-import/index.js";
import { rejectMalformedIds } from "../merchant/params.js";

type MerchantReq = FastifyRequest<{ Params: { merchantId: string } }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    app.post("/site-import", async (req): Promise<siteImportApi.SiteImportResult> => {
      const body = parse(siteImportApi.siteImportBody, req.body);
      return importSite(ctx, body.url, { userId: req.authUser?.id ?? null, ip: req.ip ?? null });
    });

    app.get<{ Params: { importId: string } }>("/site-import/:importId/logo", async (req, reply) => {
      const row = await cachedImport(ctx, req.params.importId);
      if (!row?.logoB64 || !row.logoType) throw notFound("Logo");
      return reply
        .header("content-type", row.logoType)
        .header("cache-control", "private, max-age=3600")
        .header("x-content-type-options", "nosniff")
        .header("content-security-policy", "default-src 'none'; sandbox")
        .send(Buffer.from(row.logoB64, "base64"));
    });

    app.post("/merchants/:merchantId/site-import", async (req: MerchantReq): Promise<siteImportApi.SiteImportResult> => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      const body = parse(siteImportApi.siteImportBody, req.body);
      return importSite(ctx, body.url, { userId: s.user.id, ip: req.ip ?? null }, s.merchant);
    });

    app.post("/merchants/:merchantId/site-import/apply", async (req: MerchantReq): Promise<siteImportApi.SiteImportApplyResponse> => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      const body = parse(siteImportApi.siteImportApplyBody, req.body);
      return applySiteImport(ctx, s.merchant, s.user.id, body, req.ip ?? null);
    });

    app.get<{ Params: { merchantId: string; file: string } }>("/public/logos/:merchantId/:file", async (req, reply) => {
      const obj = await publicLogo(ctx, req.params.merchantId, req.params.file);
      if (!obj) throw notFound("Logo");
      return reply
        .header("content-type", obj.contentType)
        .header("cache-control", "public, max-age=86400")
        .header("x-content-type-options", "nosniff")
        .header("content-security-policy", "default-src 'none'; sandbox")
        .send(obj.body);
    });
  });
}
