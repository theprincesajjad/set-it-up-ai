import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import auth from "./auth/index.js";
import customer from "./customer/index.js";
import merchant from "./merchant/index.js";
import staff from "./staff/index.js";
import network from "./network/index.js";
import wallet from "./wallet/index.js";
import messaging from "./messaging/index.js";
import reports from "./reports/index.js";
import rep from "./rep/index.js";
import admin from "./admin/index.js";
import commerce from "./commerce/index.js";
import service from "./service/index.js";
import billing from "./billing/index.js";
import payments from "./payments/index.js";
import integrations from "./integrations/index.js";
import ads from "./ads/index.js";
import campaigns from "./campaigns/index.js";
import publicRoutes from "./public/index.js";
import notifications from "./notifications/index.js";

/** Each area owns its folder and registers its own paths under /v1. */
export async function registerRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await auth(app, ctx);
  await customer(app, ctx);
  await merchant(app, ctx);
  await staff(app, ctx);
  await network(app, ctx);
  await wallet(app, ctx);
  await messaging(app, ctx);
  await reports(app, ctx);
  await rep(app, ctx);
  await admin(app, ctx);
  await commerce(app, ctx);
  await service(app, ctx);
  await billing(app, ctx);
  await payments(app, ctx);
  await integrations(app, ctx);
  await ads(app, ctx);
  await campaigns(app, ctx);
  await publicRoutes(app, ctx);
  await notifications(app, ctx);
}
