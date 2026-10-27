/**
 * Grocers and halal butchers: weekly flyer, butcher-counter weigh-in and Eid plan, pantry (restock) reminders, and the customer's
 * own reminder switches. Contract: @ll/shared groceryApi. Logic: services/grocery.ts. Docs: docs/engineering/api/grocery.md.
 */
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchants } from "@ll/db";
import { groceryApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requirePermission } from "../../services/commerceShared.js";
import * as grocery from "../../services/grocery.js";
import { rejectMalformedIds } from "../merchant/params.js";

type MerchantParams = { merchantId: string };

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);

    async function staffFor(req: FastifyRequest, minRole: StaffRole) {
      const { merchantId } = req.params as MerchantParams;
      return requireStaff(ctx, req, merchantId, minRole);
    }

    // ---------------------------------------------------------------- home
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/home", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.groceryHome(ctx, staff.merchant);
    });

    // ---------------------------------------------------------------- weekly flyer (grocery.flyer)
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/deals", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.listDeals(ctx, staff.merchant);
    });

    app.post<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/deals", async (req, reply) => {
      const staff = await staffFor(req, "manager");
      return reply.status(201).send(await grocery.createDeal(ctx, staff.merchant, staff.user.id, parse(groceryApi.dealBody, req.body)));
    });

    app.patch<{ Params: MerchantParams & { dealId: string } }>("/merchants/:merchantId/grocery/deals/:dealId", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.updateDeal(ctx, staff.merchant, staff.user.id, req.params.dealId, parse(groceryApi.updateDealBody, req.body));
    });

    app.delete<{ Params: MerchantParams & { dealId: string } }>("/merchants/:merchantId/grocery/deals/:dealId", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.deleteDeal(ctx, staff.merchant, staff.user.id, req.params.dealId);
    });

    app.post<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/flyer/text", async (req, reply) => {
      const staff = await staffFor(req, "manager");
      return reply.status(201).send(await grocery.draftFlyerText(ctx, staff.merchant, staff.user.id));
    });

    // ---------------------------------------------------------------- butcher counter (grocery.counter_preorders)
    app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/weigh", async (req) => {
      const staff = await staffFor(req, "staff");
      await requirePermission(ctx, staff, "orders.manage");
      return grocery.weighOrder(ctx, staff, req.params.orderId, parse(groceryApi.weighBody, req.body));
    });

    app.get<{ Params: MerchantParams; Querystring: { year?: string } }>("/merchants/:merchantId/grocery/butcher/eid", async (req) => {
      const staff = await staffFor(req, "staff");
      return grocery.getEidPlan(ctx, staff.merchant, parse(groceryApi.eidPlanQuery, req.query).year);
    });

    app.put<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/butcher/eid", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.saveEidPlan(ctx, staff, parse(groceryApi.eidPlanBody, req.body));
    });

    app.put<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/butcher/eid/moved", async (req) => {
      const staff = await staffFor(req, "manager");
      const b = parse(groceryApi.eidMovedBody, req.body);
      return grocery.moveEid(ctx, staff, b.year, b.start);
    });

    // ---------------------------------------------------------------- pantry reminders (grocery.pantry_reminders)
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/pantry", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.pantryOverview(ctx, staff.merchant);
    });

    app.post<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/pantry/items", async (req, reply) => {
      const staff = await staffFor(req, "manager");
      return reply.status(201).send(await grocery.createPantryItem(ctx, staff.merchant, staff.user.id, parse(groceryApi.pantryItemBody, req.body)));
    });

    app.patch<{ Params: MerchantParams & { itemId: string } }>("/merchants/:merchantId/grocery/pantry/items/:itemId", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.updatePantryItem(ctx, staff.merchant, staff.user.id, req.params.itemId, parse(groceryApi.updatePantryItemBody, req.body));
    });

    app.post<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/pantry/send", async (req) => {
      const staff = await staffFor(req, "manager");
      return grocery.sendPantryReminders(ctx, staff.merchant, parse(groceryApi.pantrySendBody, req.body ?? {}));
    });

    // The counter (any staff): the chips for what was bought, and the tap that logs it.
    app.get<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/counter/pantry-items", async (req) => {
      const staff = await staffFor(req, "staff");
      return { items: (await grocery.listPantryItems(ctx, staff.merchant)).filter((i) => i.active), askText: grocery.PANTRY_ASK("20 lb atta") };
    });

    app.post<{ Params: MerchantParams }>("/merchants/:merchantId/grocery/counter/pantry", async (req) => {
      const staff = await staffFor(req, "staff");
      return grocery.logPantryPurchase(ctx, staff, parse(groceryApi.pantryLogBody, req.body));
    });

    // ---------------------------------------------------------------- public flyer (no login)
    app.get<{ Params: { slug: string } }>("/public/shops/:slug/flyer", async (req) => {
      const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
      if (!m || m.status === "closed") throw notFound("Shop");
      return grocery.publicFlyer(ctx, m);
    });

    // The staple a restock text links to: one item, no household data.
    app.get<{ Params: { slug: string; itemId: string } }>("/public/shops/:slug/pantry/:itemId", async (req) => {
      const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
      if (!m || m.status === "closed") throw notFound("Shop");
      return grocery.publicPantryItem(ctx, m, req.params.itemId);
    });

    // ---------------------------------------------------------------- the customer's reminders
    app.get("/me/pantry", async (req) => grocery.myPantry(ctx, requireUser(req).id));

    app.put<{ Params: { entryId: string } }>("/me/pantry/:entryId", async (req) => {
      const u = requireUser(req);
      return grocery.setMyPantry(ctx, u.id, req.params.entryId, parse(groceryApi.myPantryBody, req.body).remind);
    });
  });
}
