/** Locations (manager+) and team management (owner only for writes). */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { merchantApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff } from "../../lib/auth.js";
import { forbidden } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { createLocation, deactivateLocation, listLocations, rotateLocationQr, updateLocation } from "../../services/merchant-program.js";
import { inviteStaff, listStaff, removeStaff, setStaffPinFor, updateStaffRole } from "../../services/merchant-staff.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function registerTeam(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Locations (unlimited, free) ----
  app.get("/merchants/:merchantId/locations", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { items: await listLocations(ctx, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/locations", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    reply.status(201);
    return createLocation(ctx, s.merchant.id, s.user.id, parse(merchantApi.createLocationBody, req.body));
  });
  app.patch("/merchants/:merchantId/locations/:locationId", async (req: Req<{ locationId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return updateLocation(ctx, s.merchant.id, s.user.id, req.params.locationId, parse(merchantApi.updateLocationBody, req.body));
  });
  app.delete("/merchants/:merchantId/locations/:locationId", async (req: Req<{ locationId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    await deactivateLocation(ctx, s.merchant.id, s.user.id, req.params.locationId);
    return reply.status(204).send();
  });
  app.post("/merchants/:merchantId/locations/:locationId/rotate-qr", async (req: Req<{ locationId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return rotateLocationQr(ctx, s.merchant.id, s.user.id, req.params.locationId);
  });

  // ---- Team ----
  app.get("/merchants/:merchantId/team", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    return { items: await listStaff(ctx.db, s.merchant.id), nextCursor: null };
  });
  app.post("/merchants/:merchantId/team", async (req: Req, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    const body = parse(merchantApi.inviteStaffBody, req.body);
    reply.status(201);
    return inviteStaff(ctx, s.merchant.id, s.user.id, body);
  });
  app.patch("/merchants/:merchantId/team/:userId", async (req: Req<{ userId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    const { role } = parse(merchantApi.updateStaffBody, req.body);
    return updateStaffRole(ctx, s.merchant.id, s.user.id, req.params.userId, role);
  });
  app.delete("/merchants/:merchantId/team/:userId", async (req: Req<{ userId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "owner");
    await removeStaff(ctx, s.merchant.id, s.user.id, req.params.userId);
    return reply.status(204).send();
  });
  app.put("/merchants/:merchantId/team/:userId/pin", async (req: Req<{ userId: string }>, reply) => {
    // Owners set anyone's PIN; everyone can set their own.
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    if (s.role !== "owner" && s.user.id !== req.params.userId) throw forbidden("Only owners can set someone else's PIN");
    const { pin } = parse(merchantApi.setPinBody, req.body);
    await setStaffPinFor(ctx, s.merchant.id, s.user.id, req.params.userId, pin);
    return reply.status(204).send();
  });
}
