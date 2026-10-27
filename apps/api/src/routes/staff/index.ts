import type { FastifyInstance, FastifyRequest } from "fastify";
import { staffApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { badRequest } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requireUuid } from "../../services/customer.js";
import { isOwnClientsOnly } from "../../services/barber.js";
import { activity, award, kioskCheckIn, lookup, mergeMembers, redeem, regulars, sync, today, undo, verifyRedemptionCode } from "../../services/staff.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

/** Body field wins; otherwise the Idempotency-Key header. Required for counter writes. */
function idempotencyKey(req: FastifyRequest, bodyKey: string | undefined): string {
  const header = req.headers["idempotency-key"];
  const key = bodyKey ?? (typeof header === "string" ? header : undefined);
  if (!key) throw badRequest("idempotencyKey is required (body field or Idempotency-Key header)", [{ path: "idempotencyKey", message: "Required" }]);
  return parse(staffApi.idempotencyKeySchema, key);
}

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const base = "/merchants/:merchantId/counter";
  const staffOf = (req: Req, minRole: "staff" | "manager" = "staff") => requireStaff(ctx, req, requireUuid(req.params.merchantId, "Merchant"), minRole);

  app.get(`${base}/lookup`, async (req: Req) => {
    const staff = await staffOf(req);
    const q = parse(staffApi.lookupQuery, req.query);
    return lookup(ctx, staff.merchant.id, q.q, (await isOwnClientsOnly(ctx, staff)) ? staff.user.id : undefined);
  });

  app.get(`${base}/regulars`, async (req: Req) => {
    const staff = await staffOf(req);
    // A chair renter who sees only their own clients gets no shop-wide list.
    if (await isOwnClientsOnly(ctx, staff)) return { items: [] };
    return regulars(ctx, staff.merchant.id, staff.merchant.timezone);
  });

  app.post(`${base}/award`, async (req: Req) => {
    const staff = await staffOf(req);
    const body = parse(staffApi.awardBody, req.body);
    return award(ctx, staff, { ...body, idempotencyKey: idempotencyKey(req, body.idempotencyKey) });
  });

  app.post(`${base}/redeem`, async (req: Req) => {
    const staff = await staffOf(req);
    const body = parse(staffApi.redeemBody, req.body);
    return redeem(ctx, staff, { ...body, idempotencyKey: idempotencyKey(req, body.idempotencyKey) });
  });

  app.post(`${base}/redemptions/verify`, async (req: Req) => {
    const staff = await staffOf(req);
    const body = parse(staffApi.verifyRedemptionBody, req.body);
    return verifyRedemptionCode(ctx, staff, body.code, body.frontStoreOnly);
  });

  app.get(`${base}/today`, async (req: Req) => {
    const staff = await staffOf(req);
    const q = parse(staffApi.todayQuery, req.query);
    return today(ctx, staff, q.locationId);
  });

  app.get(`${base}/activity`, async (req: Req) => {
    const staff = await staffOf(req);
    return activity(ctx, staff, parse(staffApi.activityQuery, req.query));
  });

  app.post(`${base}/transactions/:transactionId/undo`, async (req: Req<{ transactionId: string }>) => {
    const staff = await staffOf(req);
    const body = parse(staffApi.undoBody, req.body ?? {});
    return undo(ctx, staff, req.params.transactionId, body.reason);
  });

  app.post(`${base}/sync`, async (req: Req) => {
    const staff = await staffOf(req);
    const body = parse(staffApi.syncBody, req.body);
    return sync(ctx, staff, body.events);
  });

  app.post(`${base}/kiosk/check-in`, async (req: Req) => {
    const staff = await staffOf(req);
    const body = parse(staffApi.kioskCheckInBody, req.body);
    const header = req.headers["idempotency-key"];
    return kioskCheckIn(ctx, staff, { ...body, idempotencyKey: body.idempotencyKey ?? (typeof header === "string" ? header : undefined) });
  });

  app.post(`${base}/members/merge`, async (req: Req) => {
    const staff = await staffOf(req, "manager");
    return mergeMembers(ctx, staff, parse(staffApi.mergeMembersBody, req.body));
  });
}
