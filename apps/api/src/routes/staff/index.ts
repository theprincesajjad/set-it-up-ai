import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../context.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  void app;
  void ctx;
}
