/**
 * People side (phase solo, workstream D): the inbox, the client profile extras and list, promos, Instagram (shop side), and the
 * customer's threads, web push and channel preference. Spread into `merchantEndpoints` as `api.inbox`, `api.people`, `api.promos`,
 * `api.instagram`; the customer side as `api.me.threads` etc. Contract: @ll/shared inboxApi, messagingApi; docs/engineering/api/inbox.md.
 */
import type { appointmentsApi, inboxApi, messagingApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function inboxEndpoints(c: ApiClient, b: string) {
  return {
    inbox: {
      list: (q: Partial<{ channel: string; unread: "true"; q: string }> = {}) => c.get<inboxApi.InboxResponse>(`${b}/inbox`, { query: q }),
      start: (who: { memberId: string } | { userId: string }) => c.post<inboxApi.ConversationDto>(`${b}/inbox`, who),
      thread: (id: string) => c.get<inboxApi.ThreadResponse>(`${b}/inbox/${enc(id)}`),
      send: (id: string, body: string) => c.post<inboxApi.SendInboxMessageResponse>(`${b}/inbox/${enc(id)}/messages`, { body }),
      bookingPrefill: (id: string) => c.get<inboxApi.BookingPrefill>(`${b}/inbox/${enc(id)}/booking-prefill`),
    },
    people: {
      profile: (memberId: string) => c.get<inboxApi.ClientProfileResponse>(`${b}/customers/${enc(memberId)}/people`),
      setPreferences: (memberId: string, body: inboxApi.UpdateClientPreferencesBody) => c.patch<{ channelPref: inboxApi.ChannelPref; locale: string | null }>(`${b}/customers/${enc(memberId)}/preferences`, body),
      clients: (q: Partial<{ q: string; segment: inboxApi.ClientSegment; staffId: string; cursor: string; limit: number }> = {}) => c.get<inboxApi.ListClientsResponse>(`${b}/clients`, { query: q }),
      visitNote: (appointmentId: string, body: appointmentsApi.VisitNoteBody) => c.put<{ id: string; visitNote: string | null; visitPhotoUrl: string | null }>(`${b}/appointments/${enc(appointmentId)}/visit-note`, body),
      intakeQuestions: () => c.get<appointmentsApi.IntakeQuestionsResponse>(`${b}/intake-questions`),
      setIntakeQuestion: (serviceId: string, question: string | null) => c.put<{ id: string; question: string | null }>(`${b}/services/${enc(serviceId)}/intake-question`, { question }),
    },
    regularsPromos: {
      templates: (lang?: string) => c.get<messagingApi.PromoTemplatesResponse>(`${b}/promo-templates`, { query: lang ? { lang } : {} }),
      send: (body: messagingApi.SendPromoBody) => c.post<messagingApi.SendPromoResponse>(`${b}/promo-sends`, body),
      last: () => c.get<{ result: messagingApi.PromoResult | null }>(`${b}/promo-sends/last`),
    },
    instagram: {
      status: () => c.get<inboxApi.InstagramStatus>(`${b}/instagram`),
      connect: () => c.post<inboxApi.InstagramConnectResponse>(`${b}/instagram/connect`, {}),
      disconnect: () => c.post<inboxApi.InstagramStatus>(`${b}/instagram/disconnect`, {}),
    },
  };
}

export function myInboxEndpoints(c: ApiClient) {
  return {
    threads: () => c.get<inboxApi.MyThreadsResponse>("/v1/me/inbox"),
    thread: (id: string) => c.get<inboxApi.MyThreadResponse>(`/v1/me/inbox/${enc(id)}`),
    replyThread: (id: string, body: string) => c.post<inboxApi.ThreadMessageDto>(`/v1/me/inbox/${enc(id)}/messages`, { body }),
    webPushKey: () => c.get<inboxApi.WebPushKeyResponse>("/v1/public/web-push/key", { anonymous: true }),
    webPushStatus: () => c.get<inboxApi.WebPushStatusResponse>("/v1/me/web-push"),
    webPushSubscribe: (body: inboxApi.WebPushSubscribeBody) => c.post<inboxApi.WebPushStatusResponse>("/v1/me/web-push", body),
    webPushUnsubscribe: (endpoint: string) => c.delete<inboxApi.WebPushStatusResponse>("/v1/me/web-push", { endpoint }),
    channelPref: () => c.get<inboxApi.MyChannelPrefResponse>("/v1/me/channel-pref"),
    setChannelPref: (channelPref: inboxApi.ChannelPref) => c.put<inboxApi.MyChannelPrefResponse>("/v1/me/channel-pref", { channelPref }),
  };
}
