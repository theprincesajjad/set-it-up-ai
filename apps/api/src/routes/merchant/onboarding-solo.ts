/**
 * Solo-pro setup cards (docs/design/onboarding-v1.md §3.3; phase-solo B). Each save returns the fresh checklist, so the setup page
 * and its live preview update from one response. Managers and owners only; the import is owner and manager too.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { allow } from "../../lib/rate-limit.js";
import { tooMany } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { getOnboardingChecklist, recordMilestone, userLocale } from "../../services/onboarding.js";
import { completeSoloStep, recordShare, saveHours, saveInvite, saveLink, savePrivacy, saveServices, slugAvailable } from "../../services/onboarding-solo.js";
import { importLink } from "../../services/link-import.js";

type Req = FastifyRequest<{ Params: { merchantId: string }; Querystring: { slug?: string } }>;

export default async function registerOnboardingSolo(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const fresh = async (merchantId: string, userId: string) => getOnboardingChecklist(ctx, merchantId, await userLocale(ctx.db, userId));

  app.get("/merchants/:merchantId/onboarding/solo/slug", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return slugAvailable(ctx, s.merchant.id, String(req.query.slug ?? ""));
  });

  app.post("/merchants/:merchantId/onboarding/solo/link", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await saveLink(ctx, s.merchant.id, s.user.id, parse(merchantApi.soloLinkBody, req.body));
    return fresh(s.merchant.id, s.user.id);
  });

  app.post("/merchants/:merchantId/onboarding/solo/services", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await saveServices(ctx, s.merchant.id, s.user.id, parse(merchantApi.soloServicesBody, req.body));
    return fresh(s.merchant.id, s.user.id);
  });

  app.post("/merchants/:merchantId/onboarding/solo/hours", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await saveHours(ctx, s.merchant.id, s.user.id, parse(merchantApi.soloHoursBody, req.body));
    return fresh(s.merchant.id, s.user.id);
  });

  app.post("/merchants/:merchantId/onboarding/solo/privacy", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    await savePrivacy(ctx, s.merchant.id, s.user.id, parse(merchantApi.soloPrivacyBody, req.body));
    return fresh(s.merchant.id, s.user.id);
  });

  app.post("/merchants/:merchantId/onboarding/solo/share", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { channel } = parse(merchantApi.soloShareBody, req.body);
    await recordShare(ctx, s.merchant.id, s.user.id, channel, (key, data) => recordMilestone(ctx.db, s.merchant.id, key, ctx.now(), data));
    return fresh(s.merchant.id, s.user.id);
  });

  app.post("/merchants/:merchantId/onboarding/solo/invite", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const r = await saveInvite(ctx, s.merchant.id, s.user.id, parse(merchantApi.soloInviteBody, req.body));
    return { ...(await fresh(s.merchant.id, s.user.id)), invite: r };
  });

  app.post("/merchants/:merchantId/onboarding/solo/complete", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { step } = parse(merchantApi.soloCompleteBody, req.body);
    await completeSoloStep(ctx, s.merchant.id, s.user.id, step);
    return fresh(s.merchant.id, s.user.id);
  });

  // One public page from four allow-listed hosts (services/link-import.ts). Ten looks an hour per shop.
  app.post("/merchants/:merchantId/onboarding/import-link", async (req: Req): Promise<merchantApi.ImportLinkResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { url } = parse(merchantApi.importLinkBody, req.body);
    if (!(await allow(ctx, `import-link:${s.merchant.id}`, 10, 3_600_000))) throw tooMany("Too many look-ups. Try again in an hour.");
    return importLink(url);
  });
}
