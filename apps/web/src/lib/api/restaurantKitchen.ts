/**
 * Restaurant pack ordering: menu settings, pre-orders, kitchen display and split bills for one shop.
 * Spread into `merchantEndpoints` (endpoints.ts) as `api.restaurantMenu`, `api.preorders`, `api.kitchen`,
 * `api.splits`; the public split page uses `publicSplitEndpoints`. Contracts: @ll/shared restaurantApi,
 * routes: docs/engineering/restaurant-endpoints.md.
 */
import type { restaurantApi, restaurantWebApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function restaurantKitchenEndpoints(c: ApiClient, b: string) {
  return {
    /** Languages, cash price and pre-order cap for the menu. */
    menuSettings: {
      languages: () => c.get<restaurantApi.MenuLanguagesResponse>(`${b}/menu/languages`),
      saveLanguages: (languages: restaurantApi.MenuLang[]) => c.put<restaurantApi.MenuLanguagesResponse>(`${b}/menu/languages`, { languages }),
      dualPricing: () => c.get<restaurantApi.DualPricingResponse>(`${b}/dual-pricing`),
      saveDualPricing: (cashDiscountBps: number) => c.put<restaurantApi.DualPricingResponse>(`${b}/dual-pricing`, { cashDiscountBps }),
    },
    preorders: {
      list: (q: { from?: string; to?: string } = {}) => c.get<restaurantApi.PreordersResponse>(`${b}/preorders`, { query: q }),
      settings: () => c.get<restaurantApi.PreorderSettingsResponse>(`${b}/preorders/settings`),
      /** Daily cap only (older callers). */
      saveSettings: (preorderDailyCap: number | null) => c.put<restaurantApi.PreorderRulesResponse>(`${b}/preorders/settings`, { preorderDailyCap }),
      rules: () => c.get<restaurantApi.PreorderRulesResponse>(`${b}/preorders/settings`),
      waitlist: (q: { from?: string; to?: string } = {}) => c.get<{ items: restaurantApi.WaitlistEntryDto[] }>(`${b}/preorders/waitlist`, { query: q }),
      cancelRule: () => c.get<restaurantWebApi.CancelRuleResponse>(`${b}/preorders/cancel-rule`),
      saveCancelRule: (cancelCutoffHours: number | null) => c.put<restaurantWebApi.CancelRuleResponse>(`${b}/preorders/cancel-rule`, { cancelCutoffHours }),
      saveRules: (body: restaurantApi.PreorderRulesBody) => c.put<restaurantApi.PreorderRulesResponse>(`${b}/preorders/settings`, body),
    },
    kitchen: {
      tickets: (q: { station?: string; lang?: restaurantApi.MenuLang } = {}) => c.get<restaurantApi.KitchenTicketsResponse>(`${b}/kitchen/tickets`, { query: q }),
      setItem: (itemId: string, status: "cooking" | "ready") => c.patch<restaurantApi.KitchenItemDto>(`${b}/kitchen/items/${enc(itemId)}`, { status }),
      bump: (orderId: string) => c.post<unknown>(`${b}/kitchen/orders/${enc(orderId)}/bump`, {}),
      recall: (orderId: string) => c.post<unknown>(`${b}/kitchen/orders/${enc(orderId)}/recall`, {}),
      fire: (orderId: string) => c.post<unknown>(`${b}/kitchen/orders/${enc(orderId)}/fire`, {}),
      soldOut: (lang?: restaurantApi.MenuLang) => c.get<restaurantApi.SoldOutResponse>(`${b}/kitchen/sold-out`, { query: { lang } }),
      setSoldOut: (itemId: string, until: restaurantApi.SoldOutBody["until"]) => c.patch<restaurantApi.SoldOutItemDto>(`${b}/kitchen/sold-out/${enc(itemId)}`, { until }),
    },
    splits: {
      list: (orderId: string) => c.get<restaurantApi.OrderSplitsResponse>(`${b}/orders/${enc(orderId)}/splits`),
      create: (orderId: string, body: restaurantApi.CreateSplitsBody) => c.post<restaurantApi.OrderSplitsResponse>(`${b}/orders/${enc(orderId)}/splits`, body),
      remove: (orderId: string) => c.delete<void>(`${b}/orders/${enc(orderId)}/splits`),
      markPaid: (orderId: string, splitId: string, body: restaurantApi.MarkSplitPaidBody) => c.post<restaurantApi.OrderSplitsResponse>(`${b}/orders/${enc(orderId)}/splits/${enc(splitId)}/mark-paid`, body),
      setTender: (orderId: string, splitId: string, tender: restaurantApi.SplitTender) => c.patch<restaurantApi.OrderSplitsResponse>(`${b}/orders/${enc(orderId)}/splits/${enc(splitId)}`, { tender }),
    },
  };
}

/** Guest side of a split bill (no login): `public.split(token)` and `public.paySplit(token, tipCents)`. */
export function publicSplitEndpoints(c: ApiClient) {
  return {
    split: (token: string) => c.get<restaurantApi.PublicSplitResponse>(`/v1/public/splits/${enc(token)}`, { anonymous: true }),
    paySplit: (token: string, tipCents: number) => c.post<restaurantApi.PaySplitResponse>(`/v1/public/splits/${enc(token)}/pay`, { tipCents }, { anonymous: true }),
  };
}
