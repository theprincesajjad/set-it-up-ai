/**
 * Which landing tests were ended from /admin/experiments, for the proxy's assignment (landing-assign.ts). Read from the API at
 * most once a minute per server process and kept in memory; if the API does not answer within 400 ms the last answer stands
 * (or none, so the pre-registered schedule in @ll/shared experiments.ts applies). An end therefore reaches the pages within a minute.
 */
import type { experimentsApi } from "@ll/shared";
import { serverApiUrl } from "@/lib/env";

const TTL_MS = 60_000;
let cache: { at: number; ended: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

export async function endedExperiments(now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<string[]> {
  if (cache && now - cache.at < TTL_MS) return cache.ended;
  inflight ??= (async () => {
    try {
      const res = await fetchImpl(`${serverApiUrl()}/v1/public/experiments`, { cache: "no-store", signal: AbortSignal.timeout(400) });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as experimentsApi.PublicExperimentsState;
      cache = { at: now, ended: Array.isArray(body.ended) ? body.ended.filter((x) => typeof x === "string") : [] };
    } catch {
      // Keep the last answer; try again in a minute rather than on every request.
      cache = { at: now, ended: cache?.ended ?? [] };
    } finally {
      inflight = null;
    }
    return cache.ended;
  })();
  return inflight;
}

/** Tests only. */
export function resetEndedExperimentsCache() {
  cache = null;
  inflight = null;
}
