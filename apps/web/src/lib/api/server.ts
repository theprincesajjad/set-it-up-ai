/**
 * Server-side API access for server components, route handlers and server actions.
 *
 *   const api = await getServerApi();
 *   const shop = await api.public.shop(slug);
 *
 * The bearer token comes from the httpOnly cookie. Server components cannot set
 * cookies, so they never refresh: the proxy (src/proxy.ts) refreshes stale
 * tokens before the page renders.
 */
import { cookies } from "next/headers";
import { serverApiUrl } from "../env";
import { ACCESS_COOKIE } from "../auth/cookies";
import { createApiClient, type ApiClient } from "./client";
import { llApi, type LlApi } from "./endpoints";

export async function getServerClient(): Promise<ApiClient> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  return createApiClient({ baseUrl: serverApiUrl(), getAccessToken: () => token });
}

export async function getServerApi(): Promise<LlApi> {
  return llApi(await getServerClient());
}

/** Anonymous client for public data (cacheable; no cookies read, so pages can stay static/ISR). */
export function publicServerApi(): LlApi {
  return llApi(createApiClient({ baseUrl: serverApiUrl() }));
}
