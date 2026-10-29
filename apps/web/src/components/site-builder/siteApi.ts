/**
 * Website builder calls (workstream G). Owner calls go through the BFF (`browserClient`); the public page data is fetched on the
 * server. Contracts: @ll/shared siteApi. Kept here rather than in lib/api/endpoints.ts so the builder owns its own surface.
 */
import type { siteApi } from "@ll/shared";
import type { ApiClient } from "@/lib/api/client";

const enc = encodeURIComponent;

export function siteEndpoints(c: ApiClient, merchantId: string) {
  const b = `/v1/merchants/${enc(merchantId)}/site`;
  return {
    get: () => c.get<siteApi.SiteBuilderResponse>(b),
    save: (body: siteApi.SaveSiteBody) => c.put<siteApi.SiteBuilderResponse>(b, body),
    preview: () => c.get<siteApi.PublicSiteResponse>(`${b}/preview`),
    draft: (body: siteApi.DraftSiteBody) => c.post<siteApi.SiteDraftResponse>(`${b}/draft`, body),
    rewrite: (body: siteApi.RewriteBody) => c.post<siteApi.SiteRewriteResponse>(`${b}/rewrite`, body),
    reset: (preset?: siteApi.SitePreset) => c.post<siteApi.SiteBuilderResponse>(`${b}/reset`, preset ? { preset } : {}),
    publish: () => c.post<siteApi.SiteBuilderResponse>(`${b}/publish`, {}),
    unpublish: () => c.post<siteApi.SiteBuilderResponse>(`${b}/unpublish`, {}),
    checkDomain: (name: string) => c.get<siteApi.DomainCheckResponse>(`${b}/domain/check?name=${enc(name)}`),
    requestDomain: (body: siteApi.DomainRequestBody) => c.post<siteApi.SiteBuilderResponse>(`${b}/domain`, body),
    removeDomain: () => c.delete<siteApi.SiteBuilderResponse>(`${b}/domain`),
  };
}
export type SiteEndpoints = ReturnType<typeof siteEndpoints>;

export function publicSiteEndpoints(c: ApiClient) {
  return {
    bySlug: (slug: string) => c.get<siteApi.PublicSiteResponse>(`/v1/public/sites/${enc(slug)}`, { anonymous: true }),
    byHost: (host: string) => c.get<siteApi.PublicSiteResponse>(`/v1/public/sites/by-host/${enc(host)}`, { anonymous: true }),
  };
}

export function adminSiteEndpoints(c: ApiClient) {
  return {
    list: () => c.get<{ items: siteApi.AdminSiteDomainDto[] }>("/v1/admin/site-domains"),
    update: (id: string, body: siteApi.AdminDomainUpdateBody) => c.post<siteApi.AdminSiteDomainDto>(`/v1/admin/site-domains/${enc(id)}`, body),
  };
}
