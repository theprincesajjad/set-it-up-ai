/**
 * Custom domains for the website builder (workstream G): which request hosts are ours and which are a shop's own domain.
 * The proxy rewrites `/` on a shop's domain to `/<host>` (app/(site)/[domain]) and sets SITE_HOST_HEADER so that page knows
 * the rewrite was real. Our hosts: NEXT_PUBLIC_SITE_URL's host, SITE_APP_HOSTS (comma separated), localhost and IPs, and
 * preview hosts (*.vercel.app). Custom hostnames are routed only when SITE_CUSTOM_HOSTS is not "0".
 */
export const SITE_HOST_HEADER = "x-ll-site-host";

export function isCustomSiteHost(rawHost: string | null, env: { siteUrl: string; appHosts?: string; enabled?: string }): string | null {
  if (!rawHost || env.enabled === "0") return null;
  const host = rawHost.split(":")[0]!.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost" || host.endsWith(".localhost")) return null;
  if (host.endsWith(".vercel.app")) return null;
  let own: string | null = null;
  try {
    own = new URL(env.siteUrl).hostname.toLowerCase();
  } catch {
    own = null;
  }
  const ours = new Set([own, ...(env.appHosts ?? "").split(",").map((h) => h.trim().toLowerCase())].filter(Boolean) as string[]);
  for (const o of ours) if (host === o || host === `www.${o}` || host.endsWith(`.${o}`)) return null;
  return host.replace(/^www\./, "");
}
