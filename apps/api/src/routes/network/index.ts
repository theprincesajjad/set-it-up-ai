import type { FastifyInstance } from "fastify";
import { networkApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { parse } from "../../lib/validate.js";
import { requireUuid } from "../../services/customer.js";
import { feed, getNeighbourhood, joinInfo, listNeighbourhoods, listShops, publicPlans, publicShop, startQrJoin, trackPromo } from "../../services/network.js";

/**
 * Public network routes (no auth; optional bearer token personalises results).
 * Also serves the public merchant page and counter-QR join under /v1/public/
 * (assigned to the network area; the public area keeps quotes/invoices).
 */
export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/network/neighbourhoods", async () => listNeighbourhoods(ctx));

  app.get<{ Params: { slug: string } }>("/network/neighbourhoods/:slug", async (req) => getNeighbourhood(ctx, req.params.slug));

  app.get("/network/shops", async (req) => listShops(ctx, parse(networkApi.shopsQuery, req.query), req.authUser?.id ?? null));

  app.get("/network/feed", async (req) => feed(ctx, parse(networkApi.feedQuery, req.query), req.authUser?.id ?? null));

  app.post<{ Params: { promoId: string } }>("/network/promos/:promoId/view", async (req) => trackPromo(ctx, requireUuid(req.params.promoId, "Promo"), "view"));

  app.post<{ Params: { promoId: string } }>("/network/promos/:promoId/claim", async (req) => trackPromo(ctx, requireUuid(req.params.promoId, "Promo"), "claim"));

  app.get<{ Params: { slug: string } }>("/public/shops/:slug", async (req) => publicShop(ctx, req.params.slug));

  app.get("/public/plans", async () => publicPlans(ctx));

  app.get<{ Params: { qrCode: string } }>("/public/join/:qrCode", async (req) => joinInfo(ctx, req.params.qrCode));

  app.post<{ Params: { qrCode: string } }>("/public/join/:qrCode", async (req) => startQrJoin(ctx, req.params.qrCode, parse(networkApi.publicJoinBody, req.body)));
}
