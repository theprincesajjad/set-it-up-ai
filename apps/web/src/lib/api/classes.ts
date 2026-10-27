/**
 * Classes and memberships (Café & Retail: booking.classes, memberships.recurring). Spread into `merchantEndpoints`
 * as `api.classes`; the studio page uses `publicClassEndpoints` (browsing, signed in or not) and the passes page
 * uses `myClassEndpoints` (signed in). Contract: @ll/shared classesApi; routes: docs/engineering/api/classes.md.
 */
import type { classesApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function classEndpoints(c: ApiClient, b: string) {
  const k = `${b}/classes`;
  return {
    classes: {
      settings: () => c.get<classesApi.ClassSettingsDto>(`${k}/settings`),
      saveSettings: (body: classesApi.ClassSettingsBody) => c.put<classesApi.ClassSettingsDto>(`${k}/settings`, body),
      types: () => c.get<classesApi.ClassTypesResponse>(`${k}/types`),
      createType: (body: Record<string, unknown>) => c.post<classesApi.ClassTypeDto>(`${k}/types`, body),
      updateType: (id: string, body: Record<string, unknown>) => c.patch<classesApi.ClassTypeDto>(`${k}/types/${enc(id)}`, body),
      sessions: (q: { from?: string; to?: string } = {}) => c.get<classesApi.SessionsResponse>(`${k}/sessions`, { query: q }),
      createSessions: (body: Record<string, unknown>) => c.post<classesApi.CreateSessionsResponse>(`${k}/sessions`, body),
      updateSession: (id: string, body: Record<string, unknown>) => c.patch<classesApi.ClassSessionDto>(`${k}/sessions/${enc(id)}`, body),
      cancelSession: (id: string, reason?: string) => c.post<classesApi.ClassSessionDto>(`${k}/sessions/${enc(id)}/cancel`, { reason }),
      roster: (id: string) => c.get<classesApi.RosterResponse>(`${k}/sessions/${enc(id)}/roster`),
      addToSession: (id: string, body: Record<string, unknown>) => c.post<classesApi.RosterResponse>(`${k}/sessions/${enc(id)}/bookings`, body),
      checkInRow: (bookingId: string) => c.post<classesApi.RosterResponse>(`${k}/bookings/${enc(bookingId)}/check-in`, {}),
      markBooking: (bookingId: string, status: "no_show" | "excused") => c.post<classesApi.RosterResponse>(`${k}/bookings/${enc(bookingId)}/mark`, { status }),
      moveWaitlist: (bookingId: string, position: number) => c.post<classesApi.RosterResponse>(`${k}/bookings/${enc(bookingId)}/move`, { position }),
      checkIn: (body: { memberCode?: string; phone?: string; sessionId?: string; addIfNotBooked?: boolean; idempotencyKey?: string }) => c.post<classesApi.CheckInResponse>(`${k}/check-in`, body),
      door: (sessionId?: string) => c.get<classesApi.DoorResponse>(`${k}/door`, { query: { sessionId } }),
      products: () => c.get<classesApi.ProductsResponse>(`${k}/products`),
      createProduct: (body: Record<string, unknown>) => c.post<classesApi.ProductDto>(`${k}/products`, body),
      updateProduct: (id: string, body: Record<string, unknown>) => c.patch<classesApi.ProductDto>(`${k}/products/${enc(id)}`, body),
      recordSale: (body: Record<string, unknown>) => c.post<classesApi.MyPassDto>(`${k}/sales`, body),
      summary: () => c.get<classesApi.StudioSummaryResponse>(`${k}/summary`),
      members: (q: { q?: string; status?: string } = {}) => c.get<classesApi.StudioMembersResponse>(`${k}/members`, { query: q }),
      cancelMembership: (id: string, body: { effective?: "now" | "period_end"; refundLast?: boolean; reason?: string }) => c.post<classesApi.StudioMembersResponse>(`${k}/memberships/${enc(id)}/cancel`, body),
      freezeMembership: (id: string, body: { days: number }) => c.post<classesApi.StudioMembersResponse>(`${k}/memberships/${enc(id)}/freeze`, body),
    },
  };
}

/** Customer side, anyone: the studio's schedule, offers and policy (signed-in viewers also get their own booking state). */
export function publicClassEndpoints(c: ApiClient) {
  return {
    studioClasses: (slug: string, q: { from?: string; to?: string } = {}) => c.get<classesApi.PublicClassesResponse>(`/v1/public/shops/${enc(slug)}/classes`, { query: q }),
  };
}

/** Customer side, signed in: book, cancel, buy a pack, join and manage a membership. */
export function myClassEndpoints(c: ApiClient) {
  return {
    classes: (merchantId?: string) => c.get<classesApi.MyClassesResponse>("/v1/me/classes", { query: { merchantId } }),
    bookClass: (body: { sessionId: string; use?: "auto" | "drop_in"; waitlist?: boolean }) => c.post<classesApi.BookClassResponse>("/v1/me/classes/bookings", body),
    cancelClassBooking: (id: string) => c.post<classesApi.CancelBookingResponse>(`/v1/me/classes/bookings/${enc(id)}/cancel`, {}),
    buyPack: (productId: string) => c.post<classesApi.PurchaseResponse>("/v1/me/classes/purchases", { productId }),
    membershipAgreement: (productId: string, startDate?: string) => c.get<classesApi.AgreementDto>(`/v1/me/classes/products/${enc(productId)}/agreement`, { query: { startDate } }),
    joinMembership: (body: { productId: string; agreementHash: string; startDate?: string }) => c.post<classesApi.JoinMembershipResponse>("/v1/me/classes/memberships", { ...body, acceptAgreement: true }),
    freezeMembership: (id: string, days: number) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/freeze`, { days }),
    cancelMembership: (id: string, reason?: string) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/cancel`, { reason }),
    keepMembership: (id: string) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/keep`, {}),
    declineRenewal: (id: string) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/decline-renewal`, {}),
    payMembership: (id: string) => c.post<classesApi.PurchaseResponse>(`/v1/me/classes/memberships/${enc(id)}/pay`, {}),
    membershipCardSetup: (id: string) => c.post<classesApi.MembershipSetupResponse>(`/v1/me/classes/memberships/${enc(id)}/card`, {}),
  };
}
