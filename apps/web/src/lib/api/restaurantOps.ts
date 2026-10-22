/**
 * Restaurant pack operations: tiffin, catering and banquet client methods for one shop.
 * Spread into `merchantEndpoints` (endpoints.ts) so pages call `api.tiffin.plans()`,
 * `api.catering.get(id)`, `api.banquet.halls()`. Contracts: @ll/shared tiffinApi / restaurantApi,
 * routes: docs/engineering/restaurant-endpoints.md.
 */
import type { restaurantApi, tiffinApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;
type Q = Record<string, string | number | boolean | undefined | null>;

/** GET :m/catering (pipeline + counts per status). */
export interface CateringListResponse {
  items: restaurantApi.CateringEventDto[];
  nextCursor: string | null;
  counts: Partial<Record<restaurantApi.CateringStatus, number>>;
}
/** POST :m/catering: the public inquiry body (a staff member enters it by phone). */
export type CateringStaffInquiryBody = restaurantApi.CateringInquiryBody & { name: string; phone: string; email?: string | null };
export interface HallBody {
  name: string;
  capacity: number;
  description?: string | null;
  baseCents?: number;
  packages?: { name: string; perHeadCents: number; includes?: string[] }[];
  depositBps?: number;
  active?: boolean;
}
export interface HallBookingsResponse {
  items: restaurantApi.HallBookingDto[];
  nextCursor: string | null;
}
export interface HallsResponse {
  items: restaurantApi.HallDto[];
  nextCursor: string | null;
}
/** The subscriber the API returns after pause / resume / skip, plus what changed. */
export interface SubscriberChange {
  subscriber: tiffinApi.SubscriberDto;
  [k: string]: unknown;
}

export function restaurantOpsEndpoints(c: ApiClient, b: string) {
  const t = `${b}/tiffin`;
  const cat = `${b}/catering`;
  const bq = `${b}/banquet`;
  return {
    tiffin: {
      plans: () => c.get<tiffinApi.PlansResponse>(`${t}/plans`),
      createPlan: (body: tiffinApi.CreatePlanBody) => c.post<tiffinApi.PlanDto>(`${t}/plans`, body),
      updatePlan: (id: string, body: tiffinApi.UpdatePlanBody) => c.patch<tiffinApi.PlanDto>(`${t}/plans/${enc(id)}`, body),
      deletePlan: (id: string) => c.delete<tiffinApi.DeletePlanResponse>(`${t}/plans/${enc(id)}`),
      menus: (q: { from?: string; to?: string; planId?: string } = {}) => c.get<tiffinApi.MenusResponse>(`${t}/menus`, { query: q }),
      putMenus: (body: tiffinApi.PutMenusBody) => c.put<tiffinApi.MenusResponse>(`${t}/menus`, body),
      deleteMenu: (id: string) => c.delete<{ deleted: true }>(`${t}/menus/${enc(id)}`),
      routes: () => c.get<tiffinApi.RoutesResponse>(`${t}/routes`),
      createRoute: (body: tiffinApi.CreateRouteBody) => c.post<tiffinApi.RouteDto>(`${t}/routes`, body),
      updateRoute: (id: string, body: tiffinApi.UpdateRouteBody) => c.patch<tiffinApi.RouteDto>(`${t}/routes/${enc(id)}`, body),
      deleteRoute: (id: string) => c.delete<{ deleted: true; unassigned: number }>(`${t}/routes/${enc(id)}`),
      reorderStops: (routeId: string, subscriptionIds: string[]) => c.put<tiffinApi.RouteDto>(`${t}/routes/${enc(routeId)}/stops`, { subscriptionIds }),
      autoAssign: (onlyUnassigned = true) => c.post<{ assigned: number }>(`${t}/routes/auto-assign`, { onlyUnassigned }),
      subscribers: (q: Q = {}) => c.get<tiffinApi.SubscribersResponse>(`${t}/subscribers`, { query: q }),
      subscriber: (id: string) => c.get<tiffinApi.SubscriberDto>(`${t}/subscribers/${enc(id)}`),
      updateSubscriber: (id: string, body: { routeId?: string | null; stopOrder?: number | null; addressNotes?: string | null }) => c.patch<tiffinApi.SubscriberDto>(`${t}/subscribers/${enc(id)}`, body),
      pause: (id: string, body: tiffinApi.PauseBody) => c.post<SubscriberChange>(`${t}/subscribers/${enc(id)}/pause`, body),
      resume: (id: string) => c.post<SubscriberChange>(`${t}/subscribers/${enc(id)}/resume`, {}),
      cancel: (id: string, reason?: string) => c.post<tiffinApi.SubscriberDto>(`${t}/subscribers/${enc(id)}/cancel`, reason ? { reason } : {}),
      skip: (id: string, body: tiffinApi.SkipBody) => c.post<SubscriberChange>(`${t}/subscribers/${enc(id)}/skips`, body),
      kitchen: (date?: string) => c.get<tiffinApi.KitchenResponse>(`${t}/kitchen`, { query: { date } }),
      manifest: (date?: string, routeId?: string) => c.get<tiffinApi.ManifestResponse>(`${t}/manifest`, { query: { date, routeId } }),
      setDeliveryStatus: (body: tiffinApi.SetDeliveryStatusBody) => c.post<tiffinApi.SetDeliveryStatusResponse>(`${t}/deliveries/status`, body),
      revenue: (month?: string) => c.get<tiffinApi.RevenueResponse>(`${t}/revenue`, { query: { month } }),
    },
    catering: {
      list: (q: Q = {}) => c.get<CateringListResponse>(cat, { query: q }),
      calendar: (from: string, to: string) => c.get<restaurantApi.CateringCalendarResponse>(`${cat}/calendar`, { query: { from, to } }),
      create: (body: CateringStaffInquiryBody) => c.post<restaurantApi.CateringEventDto>(cat, body),
      get: (id: string) => c.get<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}`),
      update: (id: string, body: Partial<Omit<restaurantApi.CateringInquiryBody, "service">> & { service?: restaurantApi.CateringService }) => c.patch<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}`, body),
      setMenu: (id: string, body: restaurantApi.CateringMenuBody) => c.put<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/menu`, body),
      tasting: (id: string, tastingAt: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/tasting`, { tastingAt }),
      sendQuote: (id: string, channels: ("sms" | "email")[]) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/send-quote`, { channels }),
      markDepositPaid: (id: string, method: "cash" | "etransfer" | "cheque" | "other" = "other") => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/deposit/mark-paid`, { method }),
      invoice: (id: string, send: boolean) => c.post<restaurantApi.CateringInvoiceDto>(`${cat}/${enc(id)}/invoice`, { send }),
      complete: (id: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/complete`, {}),
      cancel: (id: string, reason?: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/cancel`, reason ? { reason } : {}),
      linkHall: (id: string, hallBookingId: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/hall-booking`, { hallBookingId }),
    },
    banquet: {
      halls: () => c.get<HallsResponse>(`${bq}/halls`),
      createHall: (body: HallBody) => c.post<restaurantApi.HallDto>(`${bq}/halls`, body),
      updateHall: (id: string, body: Partial<HallBody>) => c.patch<restaurantApi.HallDto>(`${bq}/halls/${enc(id)}`, body),
      deleteHall: (id: string) => c.delete<void>(`${bq}/halls/${enc(id)}`),
      availability: (from: string, to: string, hallId?: string) => c.get<restaurantApi.HallAvailabilityResponse>(`${bq}/availability`, { query: { from, to, hallId } }),
      bookings: (q: Q = {}) => c.get<HallBookingsResponse>(`${bq}/bookings`, { query: q }),
      createHold: (body: restaurantApi.CreateHoldBody) => c.post<restaurantApi.HoldResponse>(`${bq}/bookings`, body),
      confirm: (id: string, markDepositPaid = false) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/confirm`, { markDepositPaid }),
      cancel: (id: string) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/cancel`, {}),
      complete: (id: string) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/complete`, {}),
      deposit: (id: string) => c.post<restaurantApi.HoldResponse>(`${bq}/bookings/${enc(id)}/deposit`, {}),
      linkCatering: (id: string, cateringEventId: string) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/catering`, { cateringEventId }),
    },
  };
}
