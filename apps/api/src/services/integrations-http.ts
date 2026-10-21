import type { AppContext } from "../context.js";

export type Fetch = typeof fetch;

/**
 * Outbound HTTP for connectors, webhooks and wallet. Tests inject a fake
 * `fetch` per AppContext (no live network calls); production uses global fetch.
 */
const registry = new WeakMap<AppContext, Fetch>();

export function setHttp(ctx: AppContext, f: Fetch): void {
  registry.set(ctx, f);
}

export function httpFor(ctx: AppContext): Fetch {
  return registry.get(ctx) ?? fetch;
}
