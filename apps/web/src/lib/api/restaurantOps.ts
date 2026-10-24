/**
 * Restaurant pack operations: tiffin, catering and banquet client methods for one shop.
 * Spread into `merchantEndpoints` (endpoints.ts) so pages call `api.tiffin.plans()`,
 * `api.catering.get(id)`, `api.banquet.halls()`. Contracts: @ll/shared tiffinApi / restaurantApi,
 * routes: docs/engineering/restaurant-endpoints.md.
 */
import type { paymentsManualApi, restaurantApi, tiffinApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;
type Q = Record<string, string | number | boolean | undefined | null>;

/** GET :m/catering (pipeline + counts per status). */
export interface CateringListResponse {
  items: restaurantApi.CateringEventDto[];
  nextCursor: string | null;
  counts: Partial<Record<restaurantApi.CateringStatus, number>>;
  /** Money tiles and the 8-week strip. */
  summary: restaurantApi.CateringSummary;
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
  refundPolicy?: restaurantApi.HallRefundPolicy;
  paymentSchedule?: { label: string; bps: number; dueOffsetDays: number }[] | null;
  autoConfirmOnFirstPayment?: boolean;
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
      subscriberCharges: (id: string) => c.get<tiffinApi.SubscriberChargesResponse>(`${t}/subscribers/${enc(id)}/charges`),
      updateSubscriber: (id: string, body: { routeId?: string | null; stopOrder?: number | null; addressNotes?: string | null }) => c.patch<tiffinApi.SubscriberDto>(`${t}/subscribers/${enc(id)}`, body),
      pause: (id: string, body: tiffinApi.PauseBody) => c.post<SubscriberChange>(`${t}/subscribers/${enc(id)}/pause`, body),
      resume: (id: string) => c.post<SubscriberChange>(`${t}/subscribers/${enc(id)}/resume`, {}),
      cancel: (id: string, reason?: string) => c.post<tiffinApi.SubscriberDto>(`${t}/subscribers/${enc(id)}/cancel`, reason ? { reason } : {}),
      skip: (id: string, body: tiffinApi.SkipBody) => c.post<SubscriberChange>(`${t}/subscribers/${enc(id)}/skips`, body),
      kitchen: (date?: string) => c.get<tiffinApi.KitchenResponse>(`${t}/kitchen`, { query: { date } }),
      manifest: (date?: string, routeId?: string) => c.get<tiffinApi.ManifestResponse>(`${t}/manifest`, { query: { date, routeId } }),
      setDeliveryStatus: (body: tiffinApi.SetDeliveryStatusBody) => c.post<tiffinApi.SetDeliveryStatusResponse>(`${t}/deliveries/status`, body),
      revenue: (month?: string) => c.get<tiffinApi.RevenueResponse>(`${t}/revenue`, { query: { month } }),
      awaiting: () => c.get<paymentsManualApi.AwaitingResponse>(`${t}/awaiting`),
      recordPayment: (chargeId: string, body: paymentsManualApi.RecordPaymentBody) => c.post<tiffinApi.ChargeDto>(`${t}/charges/${enc(chargeId)}/record-payment`, body),
      voidPayment: (chargeId: string, reason: string) => c.post<tiffinApi.ChargeDto>(`${t}/charges/${enc(chargeId)}/void-payment`, { reason }),
      driverLink: (routeId: string, date?: string) => c.post<tiffinApi.DriverLinkResponse>(`${t}/routes/${enc(routeId)}/driver-link`, date ? { date } : {}),
      sendDriverLinks: (routeIds: string[], channel: "sms" | "whatsapp", date?: string) => c.post<tiffinApi.SendDriverLinksResponse>(`${t}/driver-links/send`, { routeIds, channel, ...(date ? { date } : {}) }),
      markAllOut: (body: { routeId?: string; date?: string } = {}) => c.post<tiffinApi.MarkAllOutResponse>(`${t}/deliveries/mark-all-out`, body),
      lateNotice: (body: { routeId?: string; minutes: number; date?: string }) => c.post<{ notified: number }>(`${t}/deliveries/late-notice`, body),
    },
    /** Shop-level settings shared by tiffin, catering and banquet. */
    settings: {
      payment: () => c.get<paymentsManualApi.PaymentSettingsDto>(`${b}/payment-settings`),
      savePayment: (body: paymentsManualApi.PaymentSettingsBody) => c.put<paymentsManualApi.PaymentSettingsDto>(`${b}/payment-settings`, body),
      tax: () => c.get<paymentsManualApi.TaxSettingsDto>(`${b}/tax-settings`),
      saveTax: (body: paymentsManualApi.TaxSettingsBody) => c.put<paymentsManualApi.TaxSettingsDto>(`${b}/tax-settings`, body),
      foodSafety: () => c.get<paymentsManualApi.FoodSafetyDto>(`${b}/food-safety`),
      saveFoodSafety: (body: paymentsManualApi.FoodSafetyBody) => c.put<paymentsManualApi.FoodSafetyDto>(`${b}/food-safety`, body),
    },
    catering: {
      /** The shop's tax line (HST 13%, GST 5%...) from its public menu, for live totals. Null when unavailable. */
      taxInfo: (slug: string) => c.get<{ tax: { label: string; ratePpm: number } }>(`/v1/public/shops/${enc(slug)}/menu`, { anonymous: true }).then((r) => r.tax, () => null),
      list: (q: Q = {}) => c.get<CateringListResponse>(cat, { query: q }),
      calendar: (from: string, to: string) => c.get<restaurantApi.CateringCalendarResponse>(`${cat}/calendar`, { query: { from, to } }),
      create: (body: CateringStaffInquiryBody) => c.post<restaurantApi.CateringEventDto>(cat, body),
      get: (id: string) => c.get<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}`),
      update: (id: string, body: Partial<Omit<restaurantApi.CateringInquiryBody, "service">> & { service?: restaurantApi.CateringService }) => c.patch<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}`, body),
      setMenu: (id: string, body: restaurantApi.CateringMenuBody) => c.put<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/menu`, body),
      tasting: (id: string, tastingAt: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/tasting`, { tastingAt }),
      sendQuote: (id: string, channels: ("sms" | "email")[]) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/send-quote`, { channels }),
      markDepositPaid: (id: string, method: "cash" | "etransfer" | "cheque" | "other" | paymentsManualApi.RecordPaymentBody = "other") =>
        c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/deposit/mark-paid`, typeof method === "string" ? { method } : method),
      recordBalance: (id: string, body: paymentsManualApi.RecordPaymentBody) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/balance/record-payment`, body),
      /** Owner only. Undo the latest (or the named) hand-recorded payment. */
      voidPayment: (id: string, reason: string, paymentId?: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/void-payment`, { reason, ...(paymentId ? { paymentId } : {}) }),
      invoice: (id: string, send: boolean) => c.post<restaurantApi.CateringInvoiceDto>(`${cat}/${enc(id)}/invoice`, { send }),
      complete: (id: string) => c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/complete`, {}),
      /** `refund` applies to a deposit paid in the app: "full", "none" (default) or { amountCents }. */
      cancel: (id: string, reason?: string, refund?: restaurantApi.DepositRefundChoice) =>
        c.post<restaurantApi.CateringEventDto>(`${cat}/${enc(id)}/cancel`, { ...(reason ? { reason } : {}), ...(refund ? { refund } : {}) }),
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
      cancel: (id: string, refund?: restaurantApi.DepositRefundChoice) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/cancel`, refund ? { refund } : {}),
      complete: (id: string) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/complete`, {}),
      recordPayment: (id: string, body: paymentsManualApi.RecordPaymentBody) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/payments`, body),
      /** Owner only. Undo the latest (or the named) hand-recorded instalment. */
      voidPayment: (id: string, reason: string, paymentId?: string) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/void-payment`, { reason, ...(paymentId ? { paymentId } : {}) }),
      deposit: (id: string) => c.post<restaurantApi.HoldResponse>(`${bq}/bookings/${enc(id)}/deposit`, {}),
      linkCatering: (id: string, cateringEventId: string) => c.post<restaurantApi.HallBookingDto>(`${bq}/bookings/${enc(id)}/catering`, { cateringEventId }),
    },
  };
}
