/**
 * Restaurant desk (desi2): Home, busy mode, balance reminders, phone-number lookup and "usual" for phone orders.
 * Spread into `merchantEndpoints` (endpoints.ts) as `api.restaurantHome`, `api.busy`, `api.orderTools`.
 * Contracts: @ll/shared restaurantApi (restaurantDesk.ts).
 */
import type { commerceApi, restaurantApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function restaurantDeskEndpoints(c: ApiClient, b: string) {
  return {
    restaurantHome: () => c.get<restaurantApi.RestaurantHomeResponse>(`${b}/restaurant/home`),
    /** Counts for the sidebar: new orders, phone calls to check, WhatsApp chats waiting on payment. */
    restaurantBadges: () => c.get<restaurantApi.RestaurantBadges>(`${b}/restaurant/badges`),
    busy: {
      get: () => c.get<restaurantApi.BusyState>(`${b}/restaurant/busy`),
      set: (body: restaurantApi.BusyBody) => c.put<restaurantApi.BusyState>(`${b}/restaurant/busy`, body),
    },
    orderTools: {
      remindBalance: (orderId: string) => c.post<restaurantApi.RemindBalanceResponse>(`${b}/orders/${enc(orderId)}/remind-balance`, {}),
      /** "Take a phone order" and the counter: staff ring up an order (channel "phone" for a call taken by hand). */
      counterOrder: (body: restaurantApi.CounterOrderBody) => c.post<commerceApi.OrderDto>(`${b}/orders/counter`, body),
      lookupPhone: (phone: string) => c.get<restaurantApi.PhoneLookupResponse>(`${b}/phone/lookup`, { query: { phone } }),
      usual: (memberId: string) => c.get<restaurantApi.UsualResponse>(`${b}/customers/${enc(memberId)}/usual`),
    },
  };
}
