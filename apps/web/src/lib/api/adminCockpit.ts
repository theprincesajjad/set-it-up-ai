/**
 * The founder's cockpit (wave N, team admin): overview, businesses, landing funnel, health and performance.
 * Contract: packages/shared/src/api/admin-cockpit.ts. Admin only (the API re-checks the role on every call).
 */
import type { adminCockpitApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;
type Q = Record<string, string | number | boolean | undefined | null>;

export function adminCockpitEndpoints(c: ApiClient) {
  return {
    overview: (days: adminCockpitApi.CockpitPeriod = 30) => c.get<adminCockpitApi.Cockpit>("/v1/admin/cockpit", { query: { days } }),
    businesses: (q: Q = {}) => c.get<adminCockpitApi.BusinessList>("/v1/admin/businesses", { query: q }),
    /** The filtered list as a CSV file (raw response, for a download). */
    businessesCsv: (q: Q = {}) => c.request<Response>("/v1/admin/businesses", { query: { ...q, format: "csv" }, raw: true }),
    business: (merchantId: string) => c.get<adminCockpitApi.BusinessDetail>(`/v1/admin/businesses/${enc(merchantId)}`),
    funnel: (days: adminCockpitApi.CockpitPeriod, by: adminCockpitApi.FunnelDimension) => c.get<adminCockpitApi.LandingFunnel>("/v1/admin/funnel", { query: { days, by } }),
    health: () => c.get<adminCockpitApi.HealthReport>("/v1/admin/health"),
    performance: (hours = 24) => c.get<adminCockpitApi.PerformanceReport>("/v1/admin/performance", { query: { hours } }),
  };
}
