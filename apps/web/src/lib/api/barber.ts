/**
 * Barbershops, threading bars and beauty supply (docs/research/barbers-beauty.md): the walk-in line, payouts and pay, family members and
 * "my barber". Spread into `merchantEndpoints` as `api.barber`; the customer pages use `publicBarberEndpoints` (no login) and
 * `myBarberEndpoints` (signed in). Contract: @ll/shared barberApi; routes: docs/engineering/api/barber.md.
 */
import type { barberApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function barberEndpoints(c: ApiClient, b: string) {
  return {
    barber: {
      board: () => c.get<barberApi.QueueBoardResponse>(`${b}/queue`),
      settings: () => c.get<barberApi.QueueSettingsDto>(`${b}/queue/settings`),
      saveSettings: (body: barberApi.QueueSettingsBody) => c.put<barberApi.QueueSettingsDto>(`${b}/queue/settings`, body),
      add: (body: barberApi.StaffAddBody) => c.post<barberApi.QueueActionResponse>(`${b}/queue`, body),
      call: (id: string, staffId: string) => c.post<barberApi.QueueActionResponse>(`${b}/queue/${enc(id)}/call`, { staffId }),
      start: (id: string) => c.post<barberApi.QueueActionResponse>(`${b}/queue/${enc(id)}/start`, {}),
      skip: (id: string) => c.post<barberApi.QueueActionResponse>(`${b}/queue/${enc(id)}/skip`, {}),
      undoSkip: (id: string, undo: barberApi.SkipUndo) => c.post<barberApi.QueueActionResponse>(`${b}/queue/${enc(id)}/undo-skip`, undo),
      done: (id: string) => c.post<barberApi.QueueActionResponse>(`${b}/queue/${enc(id)}/done`, {}),
      remove: (id: string) => c.post<barberApi.QueueActionResponse>(`${b}/queue/${enc(id)}/remove`, {}),
      staffPay: () => c.get<{ items: barberApi.StaffPayDto[] }>(`${b}/staff-pay`),
      savePay: (userId: string, body: barberApi.StaffPayBody) => c.put<barberApi.StaffPayDto>(`${b}/staff/${enc(userId)}/pay`, body),
      payouts: (q: { from: string; to: string }) => c.get<barberApi.PayoutsResponse>(`${b}/payouts`, { query: q }),
    },
  };
}

/** Customer side, no login: the line, a place in it, leaving. */
export function publicBarberEndpoints(c: ApiClient) {
  return {
    queue: (slug: string) => c.get<barberApi.PublicQueueResponse>(`/v1/public/shops/${enc(slug)}/queue`, { anonymous: true }),
    joinQueue: (slug: string, body: barberApi.JoinQueueBody) => c.post<barberApi.JoinQueueResponse>(`/v1/public/shops/${enc(slug)}/queue`, body),
    queueStatus: (token: string) => c.get<barberApi.QueueStatusResponse>(`/v1/public/queue/${enc(token)}`, { anonymous: true }),
    leaveQueue: (token: string) => c.post<barberApi.QueueStatusResponse>(`/v1/public/queue/${enc(token)}/leave`, {}),
  };
}

/** Customer side, signed in: family members and "my barber". */
export function myBarberEndpoints(c: ApiClient) {
  return {
    family: () => c.get<barberApi.FamilyResponse>("/v1/me/family"),
    addFamily: (body: barberApi.FamilyBody) => c.post<barberApi.FamilyMemberDto>("/v1/me/family", body),
    removeFamily: (id: string) => c.delete<void>(`/v1/me/family/${enc(id)}`),
    myBarber: (slug: string) => c.get<barberApi.MyBarberResponse>(`/v1/me/shops/${enc(slug)}/barber`),
    setMyBarber: (slug: string, staffId: string | null) => c.put<barberApi.MyBarberResponse>(`/v1/me/shops/${enc(slug)}/barber`, { staffId }),
  };
}
