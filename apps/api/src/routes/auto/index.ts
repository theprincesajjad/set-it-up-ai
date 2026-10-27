/**
 * Auto care: vehicles and service reminders (`auto.vehicles`), tire season and storage (`auto.tires`), wash check-in (`auto.wash`).
 * Contract: @ll/shared autoApi. Docs: docs/engineering/api/auto.md. Plans and punch cards for a wash are the existing membership routes.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { type FeatureKey, autoApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as vehicles from "../../services/auto-vehicles.js";
import * as tires from "../../services/auto-tires.js";
import * as wash from "../../services/auto-wash.js";

type MerchantParams = { merchantId: string };
type IdParams = MerchantParams & { id: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole, feature: FeatureKey, perm: boolean) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, feature);
    if (perm) await requirePermission(ctx, staff, "bookings.manage");
    return staff;
  }
  const veh = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "auto.vehicles", true);
  const tire = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "auto.tires", true);
  const wsh = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "auto.wash", true);

  // ---------------------------------------------------------------- settings (any auto feature)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/auto/settings", async (req) => {
    const { merchantId } = req.params;
    const staff = await requireStaff(ctx, req, merchantId, "staff");
    return vehicles.getSettings(ctx, staff.merchant.id);
  });
  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/auto/settings", async (req) => {
    const { merchantId } = req.params;
    const staff = await requireStaff(ctx, req, merchantId, "manager");
    return vehicles.saveSettings(ctx, staff.merchant.id, parse(autoApi.autoSettingsBody, req.body));
  });

  // ---------------------------------------------------------------- vehicles and reminders (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/auto/vehicles", async (req) => vehicles.listVehicles(ctx, (await veh(req)).merchant, parse(autoApi.vehicleListQuery, req.query)));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/auto/vehicles", async (req, reply) => reply.status(201).send(await vehicles.createVehicleForMember(ctx, await veh(req), parse(autoApi.staffVehicleBody, req.body))));
  // Fixed paths before /vehicles/:id so they are not read as an id.
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/auto/reminders", async (req) => vehicles.remindersOverview(ctx, (await veh(req)).merchant));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/auto/reminders/send", async (req) => vehicles.sendReminders(ctx, (await veh(req)).merchant, parse(autoApi.remindersSendBody, req.body ?? {})));
  app.get<{ Params: IdParams }>("/merchants/:merchantId/auto/vehicles/:id", async (req) => vehicles.getVehicle(ctx, (await veh(req)).merchant, req.params.id));
  app.patch<{ Params: IdParams }>("/merchants/:merchantId/auto/vehicles/:id", async (req) => vehicles.updateVehicle(ctx, await veh(req), req.params.id, parse(autoApi.updateVehicleBody, req.body)));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/auto/vehicles/:id/readings", async (req, reply) => reply.status(201).send(await vehicles.addReading(ctx, await veh(req), req.params.id, parse(autoApi.readingBody, req.body))));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/auto/vehicles/:id/services", async (req, reply) => reply.status(201).send(await vehicles.logService(ctx, await veh(req), req.params.id, parse(autoApi.serviceDoneBody, req.body))));

  // ---------------------------------------------------------------- tires (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/auto/tires/plan", async (req) => tires.plan(ctx, (await tire(req)).merchant, parse(autoApi.tirePlanQuery, req.query)));
  app.get<{ Params: MerchantParams; Querystring: { status?: string } }>("/merchants/:merchantId/auto/tires/sets", async (req) => tires.listSets(ctx, (await tire(req)).merchant, req.query.status === "picked_up" ? "picked_up" : "stored"));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/auto/tires/sets", async (req, reply) => reply.status(201).send(await tires.createSet(ctx, await tire(req), parse(autoApi.tireSetBody, req.body))));
  app.patch<{ Params: IdParams }>("/merchants/:merchantId/auto/tires/sets/:id", async (req) => tires.updateSet(ctx, await tire(req), req.params.id, parse(autoApi.updateTireSetBody, req.body)));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/auto/tires/sets/:id/pickup", async (req) => tires.pickupSet(ctx, await tire(req), req.params.id));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/auto/tires/swaps", async (req, reply) => reply.status(201).send(await tires.staffBookSwap(ctx, await tire(req), parse(autoApi.swapBody, req.body))));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/auto/tires/swaps/:id/status", async (req) => tires.setSwapStatus(ctx, await tire(req), req.params.id, parse(autoApi.swapStatusBody, req.body)));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/auto/tires/pickup-texts", async (req) => ({ sent: await tires.sendPickupTexts(ctx, (await tire(req, "manager")).merchant) }));

  // ---------------------------------------------------------------- wash (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/auto/wash/lookup", async (req) => wash.lookup(ctx, (await wsh(req)).merchant, parse(autoApi.washLookupQuery, req.query).q));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/auto/wash/check-in", async (req) => wash.checkIn(ctx, await wsh(req), parse(autoApi.washCheckInBody, req.body)));
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/auto/wash/summary", async (req) => wash.summary(ctx, (await wsh(req)).merchant));

  // ---------------------------------------------------------------- owner
  app.get("/me/vehicles", async (req): Promise<autoApi.MyVehiclesResponse> => {
    const user = requireUser(req);
    return { ...(await vehicles.listMyVehicles(ctx, user)), tireShops: await tires.myTireShops(ctx, user) };
  });
  app.post("/me/vehicles", async (req, reply) => reply.status(201).send(await vehicles.createMyVehicle(ctx, requireUser(req), parse(autoApi.vehicleBody, req.body))));
  app.patch<{ Params: { id: string } }>("/me/vehicles/:id", async (req) => vehicles.updateMyVehicle(ctx, requireUser(req), req.params.id, parse(autoApi.vehicleBody.partial(), req.body)));
  app.delete<{ Params: { id: string } }>("/me/vehicles/:id", async (req, reply) => {
    await vehicles.deleteMyVehicle(ctx, requireUser(req), req.params.id);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>("/me/vehicles/:id/readings", async (req, reply) => reply.status(201).send(await vehicles.addMyReading(ctx, requireUser(req), req.params.id, parse(autoApi.readingBody, req.body))));
  app.post("/me/tire-swaps", async (req, reply) => reply.status(201).send(await tires.bookMySwap(ctx, requireUser(req), parse(autoApi.customerSwapBody, req.body))));
  app.delete<{ Params: { id: string } }>("/me/tire-swaps/:id", async (req, reply) => {
    await tires.cancelMySwap(ctx, requireUser(req), req.params.id);
    return reply.status(204).send();
  });
}
