/**
 * Wave N promo team: promo lifecycle extras, results, the AI writer (owners), the Deals inbox (customers) and /admin/ai.
 * Contract: packages/shared/src/api/promos.ts.
 */
import type { merchantApi, promosApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function promoEndpoints(c: ApiClient, b: string) {
  return {
    promoAction: (id: string, action: promosApi.PromoAction) => c.post<merchantApi.Promo>(`${b}/promos/${enc(id)}/action`, { action }),
    duplicatePromo: (id: string) => c.post<merchantApi.Promo>(`${b}/promos/${enc(id)}/duplicate`, {}),
    promoResults: (id: string) => c.get<promosApi.PromoResults>(`${b}/promos/${enc(id)}/results`),
    promoPreview: (id: string) => c.get<promosApi.DealDto>(`${b}/promos/${enc(id)}/preview`),
    redeemPromo: (id: string, body: { memberId?: string; code?: string; amountCents?: number | null }) => c.post<{ status: "redeemed"; remaining: number | null }>(`${b}/promos/${enc(id)}/redeem`, body),
    promoAudience: (segment: promosApi.PromoSegment) => c.get<promosApi.PromoAudiencePreview>(`${b}/promo-audience`, { query: { segment } }),
    promoAiUsage: () => c.get<promosApi.PromoAiUsage>(`${b}/promo-ai`),
    promoAi: (body: promosApi.PromoAiBody) => c.post<promosApi.PromoAiResponse>(`${b}/promo-ai`, body),
  };
}

export function myDealEndpoints(c: ApiClient) {
  return {
    deals: (merchantId?: string) => c.get<promosApi.DealsResponse>("/v1/me/deals", { query: { merchantId } }),
    openDeal: (promoId: string) => c.post<{ ok: true }>(`/v1/me/deals/${enc(promoId)}/open`, {}),
    claimDeal: (promoId: string) => c.post<promosApi.ClaimResponse>(`/v1/me/deals/${enc(promoId)}/claim`, {}),
  };
}

export function adminAiEndpoints(c: ApiClient) {
  return {
    settings: () => c.get<promosApi.AiAdminSettings>("/v1/admin/ai"),
    setKey: (apiKey: string) => c.put<promosApi.AiAdminSettings>("/v1/admin/ai/key", { apiKey }),
    deleteKey: () => c.delete<promosApi.AiAdminSettings>("/v1/admin/ai/key"),
    update: (body: Partial<Pick<promosApi.AiAdminSettings, "model" | "monthlySpendCapCents" | "shopGenerationsPerMonth" | "shopTokensPerMonth" | "freeGenerationsPerMonth">>) => c.patch<promosApi.AiAdminSettings>("/v1/admin/ai/settings", body),
  };
}
