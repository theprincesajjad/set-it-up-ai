/**
 * Refresh-token rotation. Refresh tokens are single use and replaying one
 * revokes every session (theft detection, docs/engineering/api/auth.md), so
 * concurrent refreshes of the same token within this process share one call.
 * On multi-instance deployments the proxy refreshes before tokens expire, which
 * keeps simultaneous 401 → refresh races rare.
 */
import type { authApi } from "@ll/shared";
import { serverApiUrl } from "../env";

const inflight = new Map<string, { at: number; promise: Promise<authApi.AuthResponse | null> }>();
const SHARE_MS = 30_000;

export function refreshSession(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<authApi.AuthResponse | null> {
  const now = Date.now();
  for (const [k, v] of inflight) if (now - v.at > SHARE_MS) inflight.delete(k);
  const hit = inflight.get(refreshToken);
  if (hit) return hit.promise;
  const promise = (async () => {
    try {
      const res = await fetchImpl(`${serverApiUrl()}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as authApi.AuthResponse;
    } catch {
      return null;
    }
  })();
  inflight.set(refreshToken, { at: now, promise });
  return promise;
}
