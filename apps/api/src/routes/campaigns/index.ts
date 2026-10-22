import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { campaignsApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requirePlatformRole, requireStaff, requireUser } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
// Importing the service registers the campaign visit hook with the ledger.
import {
  addCampaignMerchant,
  addNeighbourhoodManager,
  campaignDto,
  campaignReport,
  cancelCampaign,
  createCampaign,
  drawWinner,
  listCampaigns,
  listManagedNeighbourhoods,
  listMerchantCampaigns,
  listNeighbourhoodMerchants,
  listNeighbourhoodManagers,
  loadManagedCampaign,
  markCampaignPaid,
  merchantJoinCampaign,
  merchantLeaveCampaign,
  myCampaigns,
  publicCampaign,
  removeCampaignMerchant,
  removeNeighbourhoodManager,
  scheduleCampaign,
  updateCampaign,
} from "../../services/campaigns.js";

const idParams = z.object({ id: z.uuid() });
const campaignMerchantParams = z.object({ id: z.uuid(), merchantId: z.uuid() });
const merchantCampaignParams = z.object({ merchantId: z.uuid(), campaignId: z.uuid() });
const managerParams = z.object({ neighbourhoodId: z.uuid(), userId: z.uuid() });

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // -------------------------------------------------------------------------
  // BIA manager (neighbourhood-scoped) and platform admin
  // -------------------------------------------------------------------------
  app.get("/me/neighbourhoods-managed", async (req): Promise<{ items: campaignsApi.ManagedNeighbourhood[]; nextCursor: null }> => {
    const user = requireUser(req);
    return { items: await listManagedNeighbourhoods(ctx, user), nextCursor: null };
  });

  app.get("/admin/neighbourhoods/:id/merchants", async (req): Promise<{ items: campaignsApi.NeighbourhoodMerchant[]; nextCursor: null }> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return { items: await listNeighbourhoodMerchants(ctx, user, id), nextCursor: null };
  });

  app.get("/campaigns", async (req) => {
    const user = requireUser(req);
    return listCampaigns(ctx, user, parse(campaignsApi.listCampaignsQuery, req.query));
  });

  app.post("/campaigns", async (req, reply) => {
    const user = requireUser(req);
    const row = await createCampaign(ctx, user, parse(campaignsApi.createCampaignBody, req.body));
    return reply.status(201).send(await campaignDto(ctx.db, row));
  });

  app.get("/campaigns/:id", async (req): Promise<campaignsApi.Campaign> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return campaignDto(ctx.db, await loadManagedCampaign(ctx, user, id));
  });

  app.patch("/campaigns/:id", async (req): Promise<campaignsApi.Campaign> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return campaignDto(ctx.db, await updateCampaign(ctx, user, id, parse(campaignsApi.updateCampaignBody, req.body)));
  });

  app.post("/campaigns/:id/schedule", async (req): Promise<campaignsApi.Campaign> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return campaignDto(ctx.db, await scheduleCampaign(ctx, user, id));
  });

  app.post("/campaigns/:id/cancel", async (req): Promise<campaignsApi.Campaign> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return campaignDto(ctx.db, await cancelCampaign(ctx, user, id));
  });

  app.post("/campaigns/:id/merchants", async (req): Promise<campaignsApi.Campaign> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    const { merchantId } = parse(campaignsApi.addCampaignMerchantBody, req.body);
    return addCampaignMerchant(ctx, user, id, merchantId);
  });

  app.delete("/campaigns/:id/merchants/:merchantId", async (req): Promise<campaignsApi.Campaign> => {
    const user = requireUser(req);
    const { id, merchantId } = parse(campaignMerchantParams, req.params);
    return removeCampaignMerchant(ctx, user, id, merchantId);
  });

  app.get("/campaigns/:id/report", async (req): Promise<campaignsApi.CampaignReport> => {
    const user = requireUser(req);
    const { id } = parse(idParams, req.params);
    return campaignReport(ctx, await loadManagedCampaign(ctx, user, id));
  });

  // -------------------------------------------------------------------------
  // Platform admin only
  // -------------------------------------------------------------------------
  app.post("/admin/campaigns/:id/mark-paid", async (req): Promise<campaignsApi.Campaign> => {
    requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const { paid } = parse(campaignsApi.markCampaignPaidBody, req.body ?? {});
    return campaignDto(ctx.db, await markCampaignPaid(ctx, id, paid));
  });

  app.post("/admin/campaigns/:id/draw", async (req): Promise<campaignsApi.DrawResult> => {
    requirePlatformRole(req, "admin");
    const { id } = parse(idParams, req.params);
    const { redraw } = parse(campaignsApi.drawBody, req.body ?? {});
    return drawWinner(ctx, id, { redraw });
  });

  app.get("/admin/campaign-managers", async (req) => {
    requirePlatformRole(req, "admin");
    const { neighbourhoodId } = parse(campaignsApi.listManagersQuery, req.query);
    return { items: await listNeighbourhoodManagers(ctx, neighbourhoodId), nextCursor: null };
  });

  app.post("/admin/campaign-managers", async (req, reply) => {
    const admin = requirePlatformRole(req, "admin");
    const items = await addNeighbourhoodManager(ctx, admin.id, parse(campaignsApi.addManagerBody, req.body));
    return reply.status(201).send({ items, nextCursor: null });
  });

  app.delete("/admin/campaign-managers/:neighbourhoodId/:userId", async (req, reply) => {
    requirePlatformRole(req, "admin");
    const { neighbourhoodId, userId } = parse(managerParams, req.params);
    await removeNeighbourhoodManager(ctx, neighbourhoodId, userId);
    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Merchant opt-in (owner / manager)
  // -------------------------------------------------------------------------
  app.get("/merchants/:merchantId/campaigns", async (req) => {
    const { merchantId } = parse(z.object({ merchantId: z.uuid() }), req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "manager");
    return { items: await listMerchantCampaigns(ctx, merchant), nextCursor: null };
  });

  app.post("/merchants/:merchantId/campaigns/:campaignId/join", async (req): Promise<campaignsApi.MerchantCampaign> => {
    const { merchantId, campaignId } = parse(merchantCampaignParams, req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "manager");
    return merchantJoinCampaign(ctx, merchant, campaignId);
  });

  app.delete("/merchants/:merchantId/campaigns/:campaignId/join", async (req): Promise<campaignsApi.MerchantCampaign> => {
    const { merchantId, campaignId } = parse(merchantCampaignParams, req.params);
    const { merchant } = await requireStaff(ctx, req, merchantId, "manager");
    return merchantLeaveCampaign(ctx, merchant, campaignId);
  });

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------
  app.get("/me/campaigns", async (req) => {
    const user = requireUser(req);
    const q = parse(campaignsApi.myCampaignsQuery, req.query);
    return { items: await myCampaigns(ctx, user.id, q), nextCursor: null };
  });

  app.get("/public/campaigns/:id", async (req): Promise<campaignsApi.PublicCampaign> => {
    const { id } = parse(idParams, req.params);
    return publicCampaign(ctx, id);
  });
}
