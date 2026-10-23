/**
 * Repair and drop-off operations: board summary, quote preview and phone approval, photo upload, invoice list and
 * summary, rebooking, uncollected items, rolling drop-off slots, and the public status / booking calls.
 * Spread into `merchantEndpoints` (endpoints.ts) as `api.serviceOps`; the customer pages use `publicServiceEndpoints`.
 * Contracts: @ll/shared serviceApi and commerceApi; routes: docs/engineering/api/service.md.
 */
import type { commerceApi, serviceApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;
type Q = Record<string, string | number | boolean | undefined | null>;

export function serviceOpsEndpoints(c: ApiClient, b: string) {
  return {
    serviceOps: {
      summary: () => c.get<serviceApi.TicketSummaryResponse>(`${b}/tickets/summary`),
      settings: () => c.get<serviceApi.ServiceSettingsDto>(`${b}/service-settings`),
      saveSettings: (body: Partial<Pick<serviceApi.ServiceSettingsDto, "intakeTerms" | "warrantyDays" | "tipsEnabled" | "tipPresets">>) => c.put<serviceApi.ServiceSettingsDto>(`${b}/service-settings`, body),
      previewQuote: (ticketId: string, body: { lineItems: serviceApi.LineItemInput[]; depositPercent?: number; depositCents?: number }) =>
        c.post<serviceApi.QuotePreviewResponse>(`${b}/tickets/${enc(ticketId)}/quotes/preview`, body),
      authorizeByPhone: (quoteId: string, body: { name: string; phone?: string | null; note?: string | null }) =>
        c.post<{ quote: serviceApi.QuoteDto; ticketStatus: serviceApi.TicketStatus }>(`${b}/quotes/${enc(quoteId)}/authorize-by-phone`, body),
      /** Raw image bytes; the server checks the file's own header. Resolves to the stored URL. */
      upload: (file: Blob) => c.post<serviceApi.UploadResponse>(`${b}/uploads`, file, { headers: { "content-type": file.type || "image/jpeg" } }),
      updateTicket: (id: string, body: serviceApi.UpdateTicketBody) => c.patch<serviceApi.TicketDetailResponse>(`${b}/tickets/${enc(id)}`, body),
      invoices: (q: Q = {}) => c.get<serviceApi.InvoiceListResponse>(`${b}/invoices`, { query: q }),
      invoiceSummary: () => c.get<serviceApi.InvoiceSummaryResponse>(`${b}/invoices/summary`),
      sendInvoice: (id: string) => c.post<serviceApi.InvoiceDto>(`${b}/invoices/${enc(id)}/send`, {}),
      voidInvoice: (id: string) => c.post<serviceApi.InvoiceDto>(`${b}/invoices/${enc(id)}/void`, {}),
      markPaid: (id: string, method: "cash" | "card_terminal" | "other") => c.post<serviceApi.InvoiceDto>(`${b}/invoices/${enc(id)}/mark-paid`, { method }),
      uncollected: () => c.get<serviceApi.UncollectedResponse>(`${b}/uncollected`),
      lienNotice: (ticketId: string, note?: string) => c.post<serviceApi.TicketDetailResponse>(`${b}/tickets/${enc(ticketId)}/lien-notice`, note ? { note } : {}),
      rebooking: (state: "due" | "late" | "snoozed" = "due") => c.get<serviceApi.RebookingResponse>(`${b}/rebooking`, { query: { state } }),
      rebookSend: (userId: string, serviceId: string) => c.post<{ channel: "sms" | "push" }>(`${b}/rebooking/${enc(userId)}/${enc(serviceId)}/send`, {}),
      rebookSkip: (userId: string, serviceId: string) => c.post<void>(`${b}/rebooking/${enc(userId)}/${enc(serviceId)}/skip`, {}),
      rebookSnooze: (userId: string, serviceId: string, snoozeDays = 14) => c.post<void>(`${b}/rebooking/${enc(userId)}/${enc(serviceId)}/snooze`, { snoozeDays }),
      rebookSendAll: () => c.post<{ sent: number; skipped: number }>(`${b}/rebooking/send-all`, {}),
      rebookAuto: (auto: boolean) => c.put<{ auto: boolean }>(`${b}/rebooking/settings`, { auto }),
      rebookRules: () => c.get<{ items: serviceApi.RebookRuleDto[] }>(`${b}/rebooking/rules`),
      setRebookRule: (serviceId: string, rebookAfterDays: number | null) => c.put<serviceApi.RebookRuleDto>(`${b}/rebooking/rules/${enc(serviceId)}`, { rebookAfterDays }),
      dropoffSettings: () => c.get<commerceApi.DropoffSettingsDto>(`${b}/dropoff-settings`),
      saveDropoffSettings: (body: Partial<Pick<commerceApi.DropoffSettingsDto, "slotMinutes" | "capacity" | "daysAhead">>) => c.put<commerceApi.DropoffSettingsDto>(`${b}/dropoff-settings`, body),
      blockDay: (date: string) => c.post<{ removed: number; withBookings: number; settings: commerceApi.DropoffSettingsDto }>(`${b}/dropoff-settings/block`, { date }),
      unblockDay: (date: string) => c.delete<commerceApi.DropoffSettingsDto>(`${b}/dropoff-settings/block/${enc(date)}`),
    },
  };
}

/** Customer side: no-login status page and quote preview link, and the signed-in drop-off booking calls. */
export function publicServiceEndpoints(c: ApiClient) {
  return {
    ticketStatus: (token: string) => c.get<serviceApi.PublicTicketStatusResponse>(`/v1/public/tickets/${enc(token)}`, { anonymous: true }),
    quote: (token: string, opts: { preview?: boolean } = {}) => c.get<serviceApi.PublicQuoteResponse>(`/v1/public/quotes/${enc(token)}`, { anonymous: true, query: opts.preview ? { preview: "1" } : undefined }),
    payInvoice: (token: string, tipCents = 0) => c.post<serviceApi.PayInvoiceResponse>(`/v1/public/invoices/${enc(token)}/pay`, { tipCents }, { anonymous: true }),
    dropoffSlots: (slug: string, q: { from?: string; to?: string; locationId?: string } = {}) =>
      c.get<{ items: commerceApi.SlotDto[] }>(`/v1/public/shops/${enc(slug)}/slots`, { anonymous: true, query: { kind: "dropoff", ...q } }),
  };
}

export function myBookingEndpoints(c: ApiClient) {
  return {
    book: (body: commerceApi.CreateBookingBody) => c.post<commerceApi.BookingDto>("/v1/me/bookings", body),
    bookings: (past = false) => c.get<{ items: commerceApi.BookingDto[] }>("/v1/me/bookings", { query: past ? { past: "true" } : undefined }),
    cancelBooking: (id: string) => c.post<commerceApi.BookingDto>(`/v1/me/bookings/${enc(id)}/cancel`, {}),
  };
}
