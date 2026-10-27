/**
 * Grocers and halal butchers: weekly flyer, butcher weigh-in and Eid plan, pantry reminders. Spread into `merchantEndpoints`
 * (endpoints.ts) as `api.grocery`; the public flyer and the customer's reminders are spread into `public` and `me`.
 * Contracts: @ll/shared groceryApi. Docs: docs/engineering/api/grocery.md.
 */
import type { groceryApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function groceryEndpoints(c: ApiClient, b: string) {
  return {
    grocery: {
      home: () => c.get<groceryApi.GroceryHomeResponse>(`${b}/grocery/home`),
      deals: () => c.get<groceryApi.DealsResponse>(`${b}/grocery/deals`),
      createDeal: (body: groceryApi.DealBody) => c.post<groceryApi.DealDto>(`${b}/grocery/deals`, body),
      updateDeal: (id: string, body: groceryApi.UpdateDealBody) => c.patch<groceryApi.DealDto>(`${b}/grocery/deals/${enc(id)}`, body),
      deleteDeal: (id: string) => c.delete<{ ok: true }>(`${b}/grocery/deals/${enc(id)}`),
      draftFlyerText: () => c.post<groceryApi.FlyerDraftResponse>(`${b}/grocery/flyer/text`, {}),
      weigh: (orderId: string, body: groceryApi.WeighBody) => c.post<groceryApi.WeighResponse>(`${b}/orders/${enc(orderId)}/weigh`, body),
      eid: (year?: number) => c.get<groceryApi.EidPlanResponse>(`${b}/grocery/butcher/eid`, { query: { year } }),
      saveEid: (body: groceryApi.EidPlanBody) => c.put<groceryApi.EidPlanResponse>(`${b}/grocery/butcher/eid`, body),
      moveEid: (year: number, start: string | null) => c.put<groceryApi.EidPlanResponse>(`${b}/grocery/butcher/eid/moved`, { year, start }),
      pantry: () => c.get<groceryApi.PantryOverviewResponse>(`${b}/grocery/pantry`),
      createPantryItem: (body: groceryApi.PantryItemBody) => c.post<groceryApi.PantryItemDto>(`${b}/grocery/pantry/items`, body),
      updatePantryItem: (id: string, body: Partial<groceryApi.PantryItemBody>) => c.patch<{ ok: true }>(`${b}/grocery/pantry/items/${enc(id)}`, body),
      sendPantry: (entryIds?: string[]) => c.post<groceryApi.PantrySendResponse>(`${b}/grocery/pantry/send`, entryIds ? { entryIds } : {}),
      /** The counter: chips for what can be logged. The tap that logs a purchase is `counter.logPantry` (it runs as the PIN-switched staff member). */
      counterPantryItems: () => c.get<{ items: groceryApi.PantryItemDto[]; askText: string }>(`${b}/grocery/counter/pantry-items`),
    },
  };
}

export function publicGroceryEndpoints(c: ApiClient) {
  return {
    flyer: (slug: string) => c.get<groceryApi.PublicFlyerResponse>(`/v1/public/shops/${enc(slug)}/flyer`, { anonymous: true }),
    /** The staple a restock text links to (frame 12). */
    pantryItem: (slug: string, itemId: string) => c.get<groceryApi.PublicPantryItemResponse>(`/v1/public/shops/${enc(slug)}/pantry/${enc(itemId)}`, { anonymous: true, cache: "no-store" }),
  };
}

export function myGroceryEndpoints(c: ApiClient) {
  return {
    pantry: () => c.get<groceryApi.MyPantryResponse>("/v1/me/pantry"),
    setPantry: (entryId: string, remind: boolean) => c.put<groceryApi.MyPantryResponse["items"][number]>(`/v1/me/pantry/${enc(entryId)}`, { remind }),
  };
}
