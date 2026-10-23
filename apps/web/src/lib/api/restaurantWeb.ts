/**
 * Restaurant customer pages, owner side (desi1): the shop's halal certification and the private-feedback actions
 * on Reviews. Spread into `merchantEndpoints` (endpoints.ts) as `api.halalCertification` and `api.reviewActions`.
 * Contracts: @ll/shared restaurantWebApi and whatsappApi.
 */
import type { restaurantWebApi, whatsappApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function restaurantWebEndpoints(c: ApiClient, b: string) {
  return {
    halalCertification: {
      get: () => c.get<restaurantWebApi.HalalCertificationResponse>(`${b}/menu/halal-certification`),
      save: (body: restaurantWebApi.HalalCertificationBody) => c.put<restaurantWebApi.HalalCertificationResponse>(`${b}/menu/halal-certification`, body),
      remove: () => c.delete<restaurantWebApi.HalalCertificationResponse>(`${b}/menu/halal-certification`),
    },
    reviewActions: {
      handled: (id: string) => c.post<whatsappApi.ReviewDto>(`${b}/reviews/${enc(id)}/handled`, {}),
      reply: (id: string, body: restaurantWebApi.ReviewReplyBody) => c.post<restaurantWebApi.ReviewReplyResponse>(`${b}/reviews/${enc(id)}/reply`, body),
      offerChai: (id: string) => c.post<restaurantWebApi.ReviewOfferResponse>(`${b}/reviews/${enc(id)}/offer-chai`, {}),
    },
  };
}
