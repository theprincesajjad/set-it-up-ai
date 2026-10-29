/**
 * Waitlist that fills cancelled slots (phase-pro P2, docs/business/pro-value.md §3.2 P2). Contract: @ll/shared waitlistApi.
 * Kept out of `endpoints.ts`: the owner pages call `waitlistEndpoints(browserClient, merchantId)` (lib/dashboard/waitlist.ts),
 * the booking page and the pass call `publicWaitlistEndpoints` / `myWaitlistEndpoints`.
 */
import type { waitlistApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function waitlistEndpoints(c: ApiClient, merchantId: string) {
  const b = `/v1/merchants/${enc(merchantId)}/waitlist`;
  return {
    list: (q: { status?: "open" | "all"; day?: string } = {}) => c.get<waitlistApi.WaitlistResponse>(b, { query: q }),
    add: (body: waitlistApi.AddWaitlistBody) => c.post<waitlistApi.WaitlistEntryDto>(b, body),
    remove: (id: string) => c.delete<void>(`${b}/${enc(id)}`),
    openings: (id: string) => c.get<waitlistApi.OpeningsResponse>(`${b}/${enc(id)}/openings`),
    offer: (id: string, body: waitlistApi.OfferSlotBody) => c.post<waitlistApi.WaitlistEntryDto>(`${b}/${enc(id)}/offer`, body),
    slot: (appointmentId: string) => c.get<waitlistApi.SlotPreviewResponse>(`${b}/slots/${enc(appointmentId)}`),
    setSlot: (appointmentId: string, offer: boolean) => c.put<waitlistApi.SlotPreviewResponse>(`${b}/slots/${enc(appointmentId)}`, { offer }),
  };
}

export function publicWaitlistEndpoints(c: ApiClient) {
  return {
    info: (slug: string, q: { from: string; to: string }) => c.get<waitlistApi.PublicWaitlistInfo>(`/v1/public/shops/${enc(slug)}/waitlist`, { query: q }),
    join: (slug: string, body: waitlistApi.JoinWaitlistBody) => c.post<waitlistApi.MyWaitlistEntryDto>(`/v1/public/shops/${enc(slug)}/waitlist`, body),
    offer: (token: string) => c.get<waitlistApi.OfferDto>(`/v1/public/w/${enc(token)}`),
    take: (token: string) => c.post<waitlistApi.TakeOfferResponse>(`/v1/public/w/${enc(token)}/take`, {}),
  };
}

export function myWaitlistEndpoints(c: ApiClient) {
  return {
    list: () => c.get<waitlistApi.MyWaitlistResponse>("/v1/me/waitlist"),
    remove: (id: string) => c.delete<void>(`/v1/me/waitlist/${enc(id)}`),
    take: (id: string) => c.post<waitlistApi.TakeOfferResponse>(`/v1/me/waitlist/${enc(id)}/take`, {}),
  };
}
