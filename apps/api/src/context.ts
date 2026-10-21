import type { Db } from "@ll/db";
import type { Config } from "./config.js";
import type { Providers } from "./providers/index.js";

/** Everything a route or service needs. Passed explicitly; no globals. */
export interface AppContext {
  db: Db;
  config: Config;
  providers: Providers;
  /** Injectable clock for tests. */
  now: () => Date;
}
