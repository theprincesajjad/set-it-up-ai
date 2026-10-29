/** The client's own asks (web pass and app): list, remove, and take an open offer (docs/business/pro-value.md §3.2 P2). */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context.js";
import { requireUser } from "../../lib/auth.js";
import * as svc from "../../services/waitlist.js";

export default async function registerWaitlist(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/me/waitlist", async (req) => svc.listMine(ctx, requireUser(req).id));

  app.delete<{ Params: { entryId: string } }>("/me/waitlist/:entryId", async (req, reply) => {
    await svc.removeMine(ctx, requireUser(req).id, req.params.entryId);
    return reply.status(204).send();
  });

  app.post<{ Params: { entryId: string } }>("/me/waitlist/:entryId/take", async (req) => svc.takeMine(ctx, requireUser(req).id, req.params.entryId));
}
