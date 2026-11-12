import { connect } from "@ll/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRealProviders } from "./providers/real.js";
import { startJobs } from "./jobs/index.js";

/** How long a shutdown may take (draining requests and running jobs) before the process exits anyway. */
const SHUTDOWN_TIMEOUT_MS = 25_000;

const config = loadConfig();
const db = await connect(config.databaseUrl);
const providers = createRealProviders(config, { db });
const ctx = { db, config, providers, now: () => new Date() };
const app = await buildApp(ctx, { logger: config.env !== "test" });
const stopJobs = startJobs(ctx);

let shuttingDown = false;
const shutdown = async (signal: string, code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  // The forced exit is the backstop: a hung request or job must not keep a deploy waiting forever.
  const force = setTimeout(() => {
    app.log.error("shutdown timed out, exiting");
    process.exit(code || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  let exit = code;
  try {
    // Stop taking new requests and let in-flight ones finish, and let running job passes finish, then close the database.
    await Promise.all([app.close(), stopJobs(SHUTDOWN_TIMEOUT_MS - 5_000)]);
  } catch (err) {
    app.log.error({ err }, "error while shutting down");
    exit = 1;
  }
  try {
    await db.$close();
  } catch (err) {
    app.log.error({ err }, "error closing the database");
    exit = 1;
  }
  process.exit(exit);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// A bug that escapes every handler leaves the process in an unknown state: log it and exit non-zero so the supervisor restarts it.
process.on("uncaughtException", (err) => {
  app.log.error({ err }, "uncaught exception");
  void shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (err) => {
  app.log.error({ err }, "unhandled rejection");
  void shutdown("unhandledRejection", 1);
});

await app.listen({ port: config.port, host: "0.0.0.0" });
