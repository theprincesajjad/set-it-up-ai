/**
 * Custom domains for the website builder (workstream G). Docs: docs/engineering/site-builder.md § Domains.
 *
 * Two providers:
 *  - manual (SITE_DOMAINS_ENABLED off, the launch default): nothing external is called. A request becomes an admin task
 *    (GET /v1/admin/site-domains); the admin buys or connects the domain, points it at SITE_CNAME_TARGET and marks it live.
 *  - cloudflare (SITE_DOMAINS_ENABLED=1 with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID): .ca availability through RDAP, and
 *    routing through Cloudflare for SaaS custom hostnames (POST /zones/:zone/custom_hostnames), polled until the hostname and its
 *    certificate are active. Buying a new .ca stays an admin step (registrar purchase through our account) until the registrar
 *    integration is ready; the hostname is added automatically once the admin records the purchase.
 * The site is always at {siteUrl}/s/{slug} whatever happens here.
 */
import type { AppContext } from "../context.js";

export type HostnameState = "pending" | "live" | "failed";
export interface DnsRecord {
  type: "CNAME" | "TXT" | "A";
  name: string;
  value: string;
}

export interface DomainProvider {
  name: "manual" | "cloudflare";
  /** null when we cannot tell. */
  available(hostname: string): Promise<boolean | null>;
  /** Start routing a hostname to the sites target. Manual: returns null (an admin does it). */
  addHostname(hostname: string): Promise<{ ref: string; state: HostnameState; dns: DnsRecord[] } | null>;
  hostnameState(ref: string): Promise<HostnameState | null>;
  removeHostname(ref: string): Promise<void>;
}

/** The records an owner (or we) set so the hostname reaches us. */
export function dnsFor(hostname: string, target: string): DnsRecord[] {
  return [
    { type: "CNAME", name: hostname, value: target },
    { type: "CNAME", name: `www.${hostname}`, value: target },
  ];
}

export function manualDomains(): DomainProvider {
  return {
    name: "manual",
    available: async () => null,
    addHostname: async () => null,
    hostnameState: async () => null,
    removeHostname: async () => {},
  };
}

export function cloudflareDomains(opts: { apiToken: string; zoneId: string; target: string; fetchFn?: typeof fetch }): DomainProvider {
  const f = opts.fetchFn ?? fetch;
  const api = async <T>(path: string, init: RequestInit = {}): Promise<T | null> => {
    const res = await f(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: { authorization: `Bearer ${opts.apiToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T } | null;
    return res.ok && body?.success ? (body.result ?? null) : null;
  };
  const stateOf = (r: { status?: string; ssl?: { status?: string } } | null): HostnameState | null => {
    if (!r) return null;
    if (r.status === "active" && (!r.ssl || r.ssl.status === "active")) return "live";
    if (["moved", "deleted", "blocked"].includes(r.status ?? "")) return "failed";
    return "pending";
  };
  return {
    name: "cloudflare",
    async available(hostname) {
      // RDAP: 404 means no registration exists for the name. Anything else: unknown or taken.
      try {
        const res = await f(`https://rdap.ca.fury.ca/rdap/domain/${encodeURIComponent(hostname)}`, { signal: AbortSignal.timeout(8_000) });
        if (res.status === 404) return true;
        if (res.ok) return false;
        return null;
      } catch {
        return null;
      }
    },
    async addHostname(hostname) {
      const r = await api<{ id: string; status?: string; ssl?: { status?: string } }>(`/zones/${opts.zoneId}/custom_hostnames`, {
        method: "POST",
        body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv" } }),
      });
      if (!r) return null;
      return { ref: r.id, state: stateOf(r) ?? "pending", dns: dnsFor(hostname, opts.target) };
    },
    async hostnameState(ref) {
      return stateOf(await api<{ status?: string; ssl?: { status?: string } }>(`/zones/${opts.zoneId}/custom_hostnames/${encodeURIComponent(ref)}`));
    },
    async removeHostname(ref) {
      await api(`/zones/${opts.zoneId}/custom_hostnames/${encodeURIComponent(ref)}`, { method: "DELETE" });
    },
  };
}

/** The provider for this app: injected (tests), Cloudflare when the flag and keys are set, else manual. */
export function domainsFor(ctx: AppContext): DomainProvider {
  if (ctx.providers.siteDomains) return ctx.providers.siteDomains;
  const s = ctx.config.site;
  if (s.domainsEnabled && s.cloudflare.apiToken && s.cloudflare.zoneId) {
    return (ctx.providers.siteDomains = cloudflareDomains({ apiToken: s.cloudflare.apiToken, zoneId: s.cloudflare.zoneId, target: s.cnameTarget }));
  }
  return manualDomains();
}

/** Automatic domains: the flag is on and a real provider is configured (or injected). */
export function domainsAuto(ctx: AppContext): boolean {
  return ctx.config.site.domainsEnabled && domainsFor(ctx).name !== "manual";
}
