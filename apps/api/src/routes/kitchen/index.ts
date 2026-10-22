/**
 * Restaurant ordering (Desi pack): kitchen display, counter orders, degh pre-order
 * prep list, split bills, and the menu settings that go with them (languages,
 * cash price, daily pot cap). Contract: @ll/shared restaurantApi.
 * Menu/catalog endpoints themselves stay in routes/commerce and routes/public.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { restaurantApi, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, type StaffRole } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import * as catalog from "../../services/catalog.js";
import { requirePermission, type StaffPermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as kitchen from "../../services/kitchen.js";
import * as splits from "../../services/splits.js";

type MerchantParams = { merchantId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole, features: FeatureKey[], perm?: StaffPermission) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    for (const f of features) await requireFeature(ctx.db, staff.merchant, f);
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }

  // ---------------------------------------------------------------- menu settings
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/menu/languages", async (req) => {
    const staff = await staffFor(req, "staff", []);
    return catalog.getMenuLanguages(ctx.db, staff.merchant);
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/menu/languages", async (req) => {
    const staff = await staffFor(req, "manager", []);
    const body = parse(restaurantApi.menuLanguagesBody, req.body);
    return catalog.setMenuLanguages(ctx, staff.merchant, body.languages);
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/dual-pricing", async (req) => {
    const staff = await staffFor(req, "staff", []);
    return catalog.getDualPricing(ctx.db, staff.merchant);
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/dual-pricing", async (req) => {
    const staff = await staffFor(req, "owner", []);
    const body = parse(restaurantApi.dualPricingBody, req.body);
    return catalog.setDualPricing(ctx, staff.merchant, body.cashDiscountBps);
  });

  // ---------------------------------------------------------------- degh pre-orders
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/preorders/settings", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.degh_preorders"]);
    return { preorderDailyCap: staff.merchant.preorderDailyCap };
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/preorders/settings", async (req) => {
    const staff = await staffFor(req, "manager", []);
    const body = parse(restaurantApi.preorderSettingsBody, req.body);
    return catalog.setPreorderCap(ctx, staff.merchant, body.preorderDailyCap);
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/preorders", async (req) => {
    const staff = await staffFor(req, "staff", ["orders.order_ahead"]);
    return kitchen.listPreorders(ctx, staff, parse(restaurantApi.preordersQuery, req.query));
  });

  // ---------------------------------------------------------------- counter orders
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/orders/counter", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["orders.order_ahead"], "orders.manage");
    const body = parse(restaurantApi.counterOrderBody, req.body);
    return reply.status(201).send(await kitchen.placeCounterOrder(ctx, staff, body));
  });

  // ---------------------------------------------------------------- kitchen display
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/kitchen/tickets", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.kds"]);
    return kitchen.listTickets(ctx, staff, parse(restaurantApi.kitchenTicketsQuery, req.query));
  });

  app.patch<{ Params: MerchantParams & { itemId: string } }>("/merchants/:merchantId/kitchen/items/:itemId", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.kds"], "orders.manage");
    const body = parse(restaurantApi.kitchenItemStatusBody, req.body);
    return kitchen.setItemStatus(ctx, staff, req.params.itemId, body.status);
  });

  app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/kitchen/orders/:orderId/bump", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.kds", "orders.order_ahead"], "orders.manage");
    return kitchen.bumpTicket(ctx, staff, req.params.orderId);
  });

  app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/kitchen/orders/:orderId/recall", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.kds"], "orders.manage");
    return kitchen.recallTicket(ctx, staff, req.params.orderId);
  });

  app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/kitchen/orders/:orderId/fire", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.kds"], "orders.manage");
    return kitchen.fireTicketNow(ctx, staff, req.params.orderId);
  });

  // ---------------------------------------------------------------- split bills
  app.get<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/splits", async (req) => {
    const staff = await staffFor(req, "staff", ["restaurant.split_bills"]);
    return splits.listSplits(ctx, staff, req.params.orderId);
  });

  app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/splits", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["restaurant.split_bills", "orders.order_ahead"], "orders.manage");
    const body = parse(restaurantApi.createSplitsBody, req.body);
    return reply.status(201).send(await splits.createSplits(ctx, staff, req.params.orderId, body));
  });

  app.delete<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/splits", async (req, reply) => {
    const staff = await staffFor(req, "staff", ["restaurant.split_bills"], "orders.manage");
    await splits.deleteSplits(ctx, staff, req.params.orderId);
    return reply.status(204).send();
  });

  // Public pay links (no login; the token is the credential).
  app.get<{ Params: { token: string } }>("/public/splits/:token", async (req) => splits.getPublicSplit(ctx, req.params.token));

  app.post<{ Params: { token: string } }>("/public/splits/:token/pay", async (req) => {
    const body = parse(restaurantApi.paySplitBody, req.body ?? {});
    return splits.paySplit(ctx, req.params.token, body);
  });
}
