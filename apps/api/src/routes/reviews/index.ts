/**
 * Review requests: public rating page by token, merchant list, stats and settings.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { restaurantWebApi, whatsappApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as svc from "../../services/reviews.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req = FastifyRequest<{ Params: { merchantId: string } }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    // ---- Public (no login): the link the customer gets ----
    app.get("/public/reviews/:token", async (req: FastifyRequest<{ Params: { token: string } }>) => svc.getPublicReview(ctx, req.params.token));
    app.post("/public/reviews/:token", async (req: FastifyRequest<{ Params: { token: string } }>) => svc.submitReview(ctx, req.params.token, parse(whatsappApi.reviewSubmitBody, req.body)));

    app.post("/public/reviews/:token/google-opened", async (req: FastifyRequest<{ Params: { token: string } }>) => svc.markGoogleOpened(ctx, req.params.token));

    // ---- Merchant ----
    app.get("/merchants/:merchantId/reviews", async (req: Req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.listReviews(ctx, s.merchant, parse(whatsappApi.listReviewsQuery, req.query));
    });

    app.get("/merchants/:merchantId/reviews/stats", async (req: Req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.reviewStats(ctx, s.merchant);
    });

    app.put("/merchants/:merchantId/reviews/settings", async (req: Req) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
      return svc.saveReviewSettings(ctx, s.merchant, s.user.id, parse(whatsappApi.reviewSettingsBody, req.body));
    });

    type ReviewReq = FastifyRequest<{ Params: { merchantId: string; reviewId: string } }>;
    app.post("/merchants/:merchantId/reviews/:reviewId/handled", async (req: ReviewReq) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.markHandled(ctx, s.merchant, s.user.id, req.params.reviewId);
    });

    app.post("/merchants/:merchantId/reviews/:reviewId/reply", async (req: ReviewReq) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.replyToReview(ctx, s.merchant, s.user.id, req.params.reviewId, parse(restaurantWebApi.reviewReplyBody, req.body));
    });

    app.post("/merchants/:merchantId/reviews/:reviewId/offer-chai", async (req: ReviewReq) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      return svc.offerFreeChai(ctx, s.merchant, s.user.id, req.params.reviewId);
    });

    app.post("/merchants/:merchantId/reviews/requests", async (req: Req, reply) => {
      const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
      const { orderId } = parse(whatsappApi.manualReviewRequestBody, req.body);
      reply.status(201);
      return svc.requestForOrder(ctx, s.merchant, orderId);
    });
  });
}
