/**
 * Add-ons at booking (phase-pro P5, docs/business/pro-value.md §3.2 P5). Owner CRUD beside the services routes. Setting them up
 * needs only the calendar (booking.appointments): on Free the services page shows them with the plan line, and the booking page
 * offers them only with `booking.add_ons` (Pro). Contract: @ll/shared appointmentsApi (createAddOnBody, AddOnDto).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { appointmentsApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, type StaffRole } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireFeature } from "../../services/features.js";
import * as addOns from "../../services/add-ons.js";

type MerchantParams = { merchantId: string };
type AddOnParams = MerchantParams & { addOnId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole) {
    const staff = await requireStaff(ctx, req, (req.params as MerchantParams).merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, "booking.appointments");
    return staff;
  }

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/add-ons", async (req) => addOns.listAddOns(ctx, (await staffFor(req, "staff")).merchant));

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/add-ons", async (req, reply) => {
    const staff = await staffFor(req, "manager");
    return reply.status(201).send(await addOns.createAddOn(ctx, staff.merchant, parse(appointmentsApi.createAddOnBody, req.body)));
  });

  app.patch<{ Params: AddOnParams }>("/merchants/:merchantId/add-ons/:addOnId", async (req) => {
    const staff = await staffFor(req, "manager");
    return addOns.updateAddOn(ctx, staff.merchant, req.params.addOnId, parse(appointmentsApi.updateAddOnBody, req.body));
  });

  app.delete<{ Params: AddOnParams }>("/merchants/:merchantId/add-ons/:addOnId", async (req, reply) => {
    const staff = await staffFor(req, "manager");
    await addOns.deleteAddOn(ctx, staff.merchant, req.params.addOnId);
    return reply.status(204).send();
  });
}
