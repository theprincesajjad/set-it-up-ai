import type { FastifyInstance } from "fastify";
import { repApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { parse } from "../../lib/validate.js";
import { createPublicLead } from "../../services/public-leads.js";

/** Public (no auth) lead capture from the marketing site. Docs: docs/engineering/api/rep.md. */
export default async function registerPublicLeads(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post("/public/leads", async (req, reply): Promise<repApi.PublicLeadResponse> => {
    const body = parse(repApi.publicLeadBody, req.body);
    reply.status(201);
    return createPublicLead(ctx, body, req.ip);
  });
}
