/**
 * Sales assistant endpoints: the public chat the marketing widget uses, and the admin console's. Spread into `llApi`
 * (endpoints.ts) as `api.salesAgent` and `api.admin.salesAgent`. Contracts: @ll/shared salesAgentApi.
 */
import type { salesAgentApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function publicSalesAgentEndpoints(c: ApiClient) {
  return {
    status: () => c.get<salesAgentApi.SalesAgentStatus>("/v1/public/sales-agent/status", { anonymous: true }),
    send: (body: salesAgentApi.WebMessageBody) => c.post<salesAgentApi.WebChatResponse>("/v1/public/sales-agent/messages", body, { anonymous: true }),
    poll: (sessionToken: string, since?: string) => c.get<salesAgentApi.WebPollResponse>("/v1/public/sales-agent/messages", { anonymous: true, query: { since }, headers: { "x-agent-session": sessionToken } }),
  };
}

export function adminSalesAgentEndpoints(c: ApiClient) {
  const base = "/v1/admin/sales-agent";
  return {
    list: (q: { view?: "queue" | "all" | "rated_down"; cursor?: string; limit?: number } = {}) => c.get<{ items: salesAgentApi.ConversationSummary[]; nextCursor: string | null }>(`${base}/conversations`, { query: q }),
    get: (id: string) => c.get<salesAgentApi.ConversationDetail>(`${base}/conversations/${enc(id)}`),
    takeOver: (id: string) => c.post<salesAgentApi.ConversationDetail>(`${base}/conversations/${enc(id)}/takeover`, {}),
    release: (id: string) => c.post<salesAgentApi.ConversationDetail>(`${base}/conversations/${enc(id)}/release`, {}),
    close: (id: string) => c.post<salesAgentApi.ConversationDetail>(`${base}/conversations/${enc(id)}/close`, {}),
    reply: (id: string, text: string) => c.post<salesAgentApi.ConversationDetail>(`${base}/conversations/${enc(id)}/reply`, { text }),
    rate: (messageId: string, rating: "up" | "down" | null) => c.put<void>(`${base}/messages/${enc(messageId)}/feedback`, { rating }),
    quality: () => c.get<salesAgentApi.QualityResponse>(`${base}/quality`),
  };
}
