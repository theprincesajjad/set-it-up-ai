import type { FastifyInstance, FastifyRequest } from "fastify";
import { pharmacyApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireUuid } from "../../services/customer.js";
import { confirmPharmacy, rulesFor, sendPickupReady } from "../../services/pharmacy.js";

type Req = FastifyRequest<{ Params: { merchantId: string } }>;

/** Pharmacy rules page, the pharmacist-owner confirmation, and the order-ready text (docs/research/pharmacies-wellness.md). */
export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const base = "/merchants/:merchantId/pharmacy";
  const staffOf = (req: Req, minRole: "staff" | "manager" = "staff") => requireStaff(ctx, req, requireUuid(req.params.merchantId, "Merchant"), minRole);

  app.get(`${base}/rules`, async (req: Req) => rulesFor(ctx, (await staffOf(req)).merchant));

  app.post(`${base}/confirm`, async (req: Req) => {
    const staff = await staffOf(req, "manager");
    return confirmPharmacy(ctx, staff, parse(pharmacyApi.confirmBody, req.body));
  });

  app.post(`${base}/pickup-ready`, async (req: Req) => {
    const staff = await staffOf(req);
    return sendPickupReady(ctx, staff, parse(pharmacyApi.pickupReadyBody, req.body));
  });
}
