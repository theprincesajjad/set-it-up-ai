import type { Config } from "../config.js";
import { createProviders, type Providers } from "./index.js";

/**
 * Production providers. Falls back to console providers for anything that
 * isn't configured, so a partially configured environment still runs.
 */
export function createRealProviders(config: Config): Providers {
  return createProviders(config);
}
