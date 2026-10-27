/** Pharmacy rules page, owner confirmation and the order-ready text. Spread into `merchantEndpoints` as `api.pharmacy`. */
import type { pharmacyApi } from "@ll/shared";
import type { ApiClient } from "./client";

export function pharmacyEndpoints(c: ApiClient, b: string) {
  return {
    pharmacy: {
      rules: () => c.get<pharmacyApi.PharmacyRulesResponse>(`${b}/pharmacy/rules`),
      confirm: (body: pharmacyApi.ConfirmBody) => c.post<pharmacyApi.PharmacyRulesResponse>(`${b}/pharmacy/confirm`, body),
      pickupReady: (body: pharmacyApi.PickupReadyBody) => c.post<pharmacyApi.PickupReadyResponse>(`${b}/pharmacy/pickup-ready`, body),
    },
  };
}
