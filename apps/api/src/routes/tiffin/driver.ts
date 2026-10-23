/** Public driver page API: token only, no login. Logic: services/tiffin-driver.ts. */
import type { FastifyInstance } from "fastify";
import { tiffinApi, uuidSchema } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { parse } from "../../lib/validate.js";
import * as driver from "../../services/tiffin-driver.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  type T = { token: string };
  app.get<{ Params: T }>("/public/tiffin/driver/:token", async (req) => driver.driverRun(ctx, req.params.token));
  app.post<{ Params: T & { deliveryId: string } }>("/public/tiffin/driver/:token/stops/:deliveryId", async (req) =>
    driver.driverStop(ctx, req.params.token, parse(uuidSchema, req.params.deliveryId), parse(tiffinApi.driverStopBody, req.body)),
  );
  app.post<{ Params: T }>("/public/tiffin/driver/:token/late", async (req) => driver.driverLate(ctx, req.params.token, parse(tiffinApi.driverLateBody, req.body)));
}
