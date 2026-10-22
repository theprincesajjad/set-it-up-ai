/** Customers directory, member detail, adjustments, activity, CSV export/import. */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { writeAudit } from "../../services/admin-audit.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/merchant-customers.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

const csvName = (slug: string, what: string, now: Date) => `${slug}-${what}-${now.toISOString().slice(0, 10)}.csv`;

export default async function registerCustomers(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/merchants/:merchantId/customers", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await requireFeature(ctx.db, s.merchant, "customers.directory");
    return svc.listCustomers(ctx, s.merchant.id, parse(merchantApi.listCustomersQuery, req.query));
  });

  app.get("/merchants/:merchantId/customers/export.csv", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "customers.csv_export");
    const q = parse(merchantApi.listCustomersQuery, req.query);
    const csv = await svc.exportCustomersCsv(ctx, s.merchant.id, q);
    // Full phones/emails leave the system: audit every export.
    const { cursor: _c, limit: _l, ...filters } = q;
    await writeAudit(ctx.db, { actorUserId: s.user.id, merchantId: s.merchant.id, action: "customers.exported", entity: "merchant", entityId: s.merchant.id, data: { filters }, ip: req.ip });
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${csvName(s.merchant.slug, "customers", ctx.now())}"`)
      .send(csv);
  });

  app.post("/merchants/:merchantId/customers/import", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "customers.csv_import");
    const body = parse(merchantApi.importCustomersBody, req.body);
    return svc.importCustomersCsv(ctx, s.merchant.id, s.user.id, body);
  });

  app.get("/merchants/:merchantId/customers/:memberId", async (req: Req<{ memberId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.getCustomerDetail(ctx, s.merchant.id, req.params.memberId);
  });

  app.post("/merchants/:merchantId/customers/:memberId/reveal-phone", async (req: Req<{ memberId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return svc.revealCustomerPhone(ctx, s.merchant.id, s.user.id, req.params.memberId, req.ip);
  });

  app.patch("/merchants/:merchantId/customers/:memberId", async (req: Req<{ memberId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.updateCustomer(ctx, s.merchant.id, s.user.id, req.params.memberId, parse(merchantApi.updateCustomerBody, req.body));
  });

  app.post("/merchants/:merchantId/customers/:memberId/adjust", async (req: Req<{ memberId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "loyalty.manual_adjust");
    const body = parse(merchantApi.adjustPointsBody, req.body);
    const headerKey = req.headers["idempotency-key"];
    return svc.adjustCustomerPoints(ctx, s.merchant.id, s.user.id, req.params.memberId, {
      ...body,
      idempotencyKey: body.idempotencyKey ?? (typeof headerKey === "string" ? headerKey : undefined),
    });
  });

  app.get("/merchants/:merchantId/activity", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return svc.listActivity(ctx, s.merchant.id, parse(merchantApi.listActivityQuery, req.query));
  });

  app.get("/merchants/:merchantId/activity/export.csv", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await requireFeature(ctx.db, s.merchant, "customers.csv_export");
    const q = parse(merchantApi.listActivityQuery, req.query);
    const csv = await svc.exportTransactionsCsv(ctx, s.merchant.id, q);
    const { cursor: _c, limit: _l, ...filters } = q;
    await writeAudit(ctx.db, { actorUserId: s.user.id, merchantId: s.merchant.id, action: "transactions.exported", entity: "merchant", entityId: s.merchant.id, data: { filters }, ip: req.ip });
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${csvName(s.merchant.slug, "transactions", ctx.now())}"`)
      .send(csv);
  });

  app.post("/merchants/:merchantId/activity/:transactionId/reverse", async (req: Req<{ transactionId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { reason } = parse(merchantApi.reverseTransactionBody, req.body);
    return svc.reverseCustomerTransaction(ctx, s.merchant.id, s.user.id, req.params.transactionId, reason);
  });
}
