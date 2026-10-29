/**
 * Website builder routes (workstream G). Contract: @ll/shared siteApi. Docs: docs/engineering/api/site.md.
 *  - Owner (manager+ reads and builds; the owner publishes, unpublishes and handles domains): /v1/merchants/:merchantId/site/*
 *  - Admin: /v1/admin/site-domains (the manual domain task list)
 *  - Public: routes/public/site.ts
 */
import type { FastifyInstance } from "fastify";
import { siteApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requirePlatformRole, requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as site from "../../services/site.js";
import { rejectMalformedIds } from "../merchant/params.js";
import registerPublicSite from "../public/site.js";

type P = { merchantId: string };

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await registerPublicSite(app, ctx);

    app.get<{ Params: P }>("/merchants/:merchantId/site", async (req) => site.builder(ctx, (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant));
    app.put<{ Params: P }>("/merchants/:merchantId/site", async (req) => site.save(ctx, (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant, parse(siteApi.saveSiteBody, req.body)));
    app.get<{ Params: P }>("/merchants/:merchantId/site/preview", async (req) => site.preview(ctx, (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant));
    app.post<{ Params: P }>("/merchants/:merchantId/site/draft", async (req) => site.draftWithAi(ctx, (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant, parse(siteApi.draftSiteBody, req.body ?? {})));
    app.post<{ Params: P }>("/merchants/:merchantId/site/rewrite", async (req) => site.rewriteLine(ctx, (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant, parse(siteApi.rewriteBody, req.body)));
    app.post<{ Params: P }>("/merchants/:merchantId/site/reset", async (req) => site.reset(ctx, (await requireStaff(ctx, req, req.params.merchantId, "manager")).merchant, parse(siteApi.resetBody, req.body ?? {}).preset));
    app.post<{ Params: P }>("/merchants/:merchantId/site/publish", async (req) => site.publish(ctx, (await requireStaff(ctx, req, req.params.merchantId, "owner")).merchant));
    app.post<{ Params: P }>("/merchants/:merchantId/site/unpublish", async (req) => site.unpublish(ctx, (await requireStaff(ctx, req, req.params.merchantId, "owner")).merchant));
    app.get<{ Params: P }>("/merchants/:merchantId/site/domain/check", async (req) => site.checkDomain(ctx, (await requireStaff(ctx, req, req.params.merchantId, "owner")).merchant, parse(siteApi.domainCheckQuery, req.query).name));
    app.post<{ Params: P }>("/merchants/:merchantId/site/domain", async (req) => site.requestDomain(ctx, (await requireStaff(ctx, req, req.params.merchantId, "owner")).merchant, parse(siteApi.domainRequestBody, req.body)));
    app.delete<{ Params: P }>("/merchants/:merchantId/site/domain", async (req) => site.removeDomain(ctx, (await requireStaff(ctx, req, req.params.merchantId, "owner")).merchant));

    app.get("/admin/site-domains", async (req) => {
      requirePlatformRole(req, "admin");
      return site.adminDomains(ctx);
    });
    app.post<{ Params: { domainId: string } }>("/admin/site-domains/:domainId", async (req) => {
      requirePlatformRole(req, "admin");
      return site.adminUpdateDomain(ctx, req.params.domainId, parse(siteApi.adminDomainUpdateBody, req.body));
    });
  });
}
