/**
 * Customer-facing restaurant endpoints (docs/engineering/restaurant-endpoints.md): catering quote approval,
 * public catering inquiry, tiffin plans and subscriptions, public menu, banquet halls and holds.
 * Same shape as `llApi`: pass any ApiClient (server, or `browserClient` for the BFF).
 */
import type { commerceApi, restaurantApi, tiffinApi } from "@ll/shared";
import type { ApiClient } from "@/lib/api/client";

const enc = encodeURIComponent;

export interface CateringInquiryReceipt {
  id: string;
  number: number;
  status: restaurantApi.CateringStatus;
  eventDate: string;
  headcount: number;
}

export function restaurantCustomerApi(c: ApiClient) {
  return {
    menu: (slug: string, q: { lang?: string; halal?: boolean; veg?: boolean; maxSpice?: number } = {}) =>
      c.get<commerceApi.PublicMenuResponse>(`/v1/public/shops/${enc(slug)}/menu`, {
        anonymous: true,
        query: { lang: q.lang, halal: q.halal ? 1 : undefined, veg: q.veg ? 1 : undefined, maxSpice: q.maxSpice },
        cache: "no-store",
      }),
    catering: {
      view: (token: string) => c.get<restaurantApi.PublicCateringResponse>(`/v1/public/catering/${enc(token)}`, { anonymous: true, cache: "no-store" }),
      approve: (token: string, signatureName: string) => c.post<restaurantApi.ApproveCateringResponse>(`/v1/public/catering/${enc(token)}/approve`, { signatureName }, { anonymous: true }),
      inquire: (slug: string, body: restaurantApi.CateringInquiryBody & { name: string; phone: string; email?: string | null }) =>
        c.post<CateringInquiryReceipt>(`/v1/public/shops/${enc(slug)}/catering/inquiries`, body, { anonymous: true }),
    },
    banquet: {
      halls: (slug: string) => c.get<{ items: restaurantApi.HallDto[] }>(`/v1/public/shops/${enc(slug)}/banquet/halls`, { anonymous: true, cache: "no-store" }),
      availability: (slug: string, q: { from: string; to: string; hallId?: string }) =>
        c.get<restaurantApi.HallAvailabilityResponse>(`/v1/public/shops/${enc(slug)}/banquet/availability`, { anonymous: true, query: q, cache: "no-store" }),
      hold: (body: restaurantApi.CreateHoldBody) => c.post<restaurantApi.HoldResponse>("/v1/me/banquet/holds", body),
    },
    tiffin: {
      plans: (slug: string, q: { lang?: string; menuDays?: number } = {}) =>
        c.get<tiffinApi.PublicPlansResponse>(`/v1/public/shops/${enc(slug)}/tiffin/plans`, { anonymous: true, query: q, cache: "no-store" }),
      subscribe: (body: tiffinApi.SubscribeBody) => c.post<tiffinApi.SubscribeResponse>("/v1/me/tiffin/subscriptions", body),
      mine: () => c.get<tiffinApi.MySubscriptionsResponse>("/v1/me/tiffin/subscriptions"),
      detail: (id: string) => c.get<tiffinApi.MySubscriptionDetailResponse>(`/v1/me/tiffin/subscriptions/${enc(id)}`),
      upcoming: (q: { days?: number; subscriptionId?: string } = {}) => c.get<tiffinApi.UpcomingResponse>("/v1/me/tiffin/upcoming", { query: q }),
      update: (id: string, body: tiffinApi.UpdateMySubscriptionBody) => c.patch<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(id)}`, body),
      skip: (id: string, dates: string[]) => c.post<tiffinApi.SkipResponse>(`/v1/me/tiffin/subscriptions/${enc(id)}/skips`, { dates }),
      unskip: (id: string, date: string) => c.delete<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(id)}/skips/${enc(date)}`),
      pause: (id: string, body: tiffinApi.PauseBody) => c.post<tiffinApi.PauseResponse>(`/v1/me/tiffin/subscriptions/${enc(id)}/pause`, body),
      resume: (id: string) => c.post<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(id)}/resume`, {}),
      cancel: (id: string, reason?: string) => c.post<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(id)}/cancel`, reason ? { reason } : {}),
      /** Change the card on file: a SetupIntent to confirm (SetupBox). */
      paymentMethod: (id: string) => c.post<tiffinApi.PaymentMethodSetupResponse>(`/v1/me/tiffin/subscriptions/${enc(id)}/payment-method`, {}),
      retryPayment: (id: string) => c.post<tiffinApi.RetryPaymentResponse>(`/v1/me/tiffin/subscriptions/${enc(id)}/retry-payment`, {}),
    },
  };
}

export type RestaurantCustomerApi = ReturnType<typeof restaurantCustomerApi>;
