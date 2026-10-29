/**
 * The owner's waitlist (docs/business/pro-value.md §3.2 P2): the asks, adding one by hand, removing, the next openings for an ask and
 * "Offer a slot" (Pro, Studio, the trial), the freed slots for the calendar chip, and the cancel confirm's preview and switch.
 * Seeing, adding and removing are on every plan with appointments; sending an offer needs `booking.waitlist`.
 * Contract: @ll/shared waitlistApi.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { waitlistApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as svc from "../../services/waitlist.js";

type MerchantParams = { merchantId: string };
type EntryParams = MerchantParams & { entryId: string };
type ApptParams = MerchantParams & { appointmentId: string };

export default async function registerWaitlist(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, "staff");
    await requireFeature(ctx.db, staff.merchant, "booking.appointments");
    await requirePermission(ctx, staff, "bookings.manage");
    return staff;
  }

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/waitlist", async (req) => {
    const staff = await staffFor(req);
    return svc.listForOwner(ctx, staff.merchant, parse(waitlistApi.listWaitlistQuery, req.query));
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/waitlist", async (req, reply) => {
    const staff = await staffFor(req);
    return reply.status(201).send(await svc.addByHand(ctx, staff.merchant, parse(waitlistApi.addWaitlistBody, req.body)));
  });

  app.delete<{ Params: EntryParams }>("/merchants/:merchantId/waitlist/:entryId", async (req, reply) => {
    const staff = await staffFor(req);
    await svc.removeForOwner(ctx, staff.merchant, req.params.entryId);
    return reply.status(204).send();
  });

  app.get<{ Params: EntryParams }>("/merchants/:merchantId/waitlist/:entryId/openings", async (req) => {
    const staff = await staffFor(req);
    return svc.openingsFor(ctx, staff.merchant, req.params.entryId);
  });

  app.post<{ Params: EntryParams }>("/merchants/:merchantId/waitlist/:entryId/offer", async (req) => {
    const staff = await staffFor(req);
    await requireFeature(ctx.db, staff.merchant, "booking.waitlist");
    return svc.offerSlotTo(ctx, staff.merchant, req.params.entryId, parse(waitlistApi.offerSlotBody, req.body));
  });

  app.get<{ Params: ApptParams }>("/merchants/:merchantId/waitlist/slots/:appointmentId", async (req) => {
    const staff = await staffFor(req);
    return svc.slotPreview(ctx, staff.merchant, req.params.appointmentId);
  });

  app.put<{ Params: ApptParams }>("/merchants/:merchantId/waitlist/slots/:appointmentId", async (req) => {
    const staff = await staffFor(req);
    return svc.setSlotPreference(ctx, staff.merchant, req.params.appointmentId, parse(waitlistApi.slotPreferenceBody, req.body).offer);
  });
}
