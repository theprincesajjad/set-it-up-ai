import type { Config } from "../config.js";
import { consoleEmail, consolePush, consoleSms } from "./console.js";
import type { Outbox, Providers } from "./types.js";

export * from "./types.js";

/**
 * Build providers from config. Real providers are registered by the
 * connectors module (see src/providers/real.ts) when credentials exist.
 */
export function createProviders(config: Config, overrides: Partial<Providers> = {}): Providers {
  const outbox: Outbox = { sms: [], email: [], push: [] };
  const log = config.env === "development";
  return {
    sms: consoleSms(outbox, log),
    email: consoleEmail(outbox, log),
    push: consolePush(outbox, log),
    outbox,
    ...overrides,
  };
}
