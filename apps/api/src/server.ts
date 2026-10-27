import "./lib/testClock.js";
import { connect } from "@ll/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRealProviders } from "./providers/real.js";
import { startJobs } from "./jobs/index.js";

const config = loadConfig();
const db = await connect(config.databaseUrl);
const providers = createRealProviders(config, { db });
const ctx = { db, config, providers, now: () => new Date() };
const app = await buildApp(ctx, { logger: config.env !== "test" });
const stopJobs = startJobs(ctx);

const shutdown = async () => {
  stopJobs();
  await app.close();
  await db.$close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: "0.0.0.0" });
