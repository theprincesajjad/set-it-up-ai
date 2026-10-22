import type { PushProvider, PushReceipt, PushTicket } from "./types.js";

export type Fetch = typeof fetch;

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo accepts at most 100 messages per send request and 1000 ids per receipts request. */
export const EXPO_CHUNK = 100;
export const EXPO_RECEIPT_CHUNK = 1000;

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo push notifications. Tokens look like ExponentPushToken[...].
 *  - Tickets: an immediate DeviceNotRegistered is reported through `onInvalidToken`
 *    so the caller can delete the token; ok tickets carry a receipt id.
 *  - Receipts (`receipts(ids)`, ~15 min later): the authoritative delivery result
 *    from APNs/FCM. The notifications job deletes tokens whose receipt says
 *    DeviceNotRegistered (services/notifications.ts → checkPushReceipts).
 */
export function expoPush(
  opts: { accessToken?: string; onInvalidToken?: (token: string) => void | Promise<void> } = {},
  fetchImpl: Fetch = fetch,
): PushProvider {
  const headers = () => ({
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
    "content-type": "application/json",
    ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
  });
  return {
    name: "expo",
    async send(msgs) {
      let ok = 0;
      let failed = 0;
      const tickets: PushTicket[] = [];
      for (let i = 0; i < msgs.length; i += EXPO_CHUNK) {
        const chunk = msgs.slice(i, i + EXPO_CHUNK);
        const body = chunk.map((m) => ({
          to: m.token,
          title: m.title,
          body: m.body,
          data: m.data ?? {},
          sound: "default",
          ...(m.channelId ? { channelId: m.channelId } : {}),
          ...(m.priority ? { priority: m.priority } : {}),
        }));
        try {
          const res = await fetchImpl(EXPO_PUSH_URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
          if (!res.ok) {
            failed += chunk.length;
            for (const m of chunk) tickets.push({ token: m.token, status: "error", error: `HTTP ${res.status}` });
            continue;
          }
          const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
          const data = json.data ?? [];
          chunk.forEach((m, idx) => {
            const t = data[idx];
            if (t?.status === "ok") {
              ok++;
              tickets.push({ token: m.token, status: "ok", id: t.id });
            } else {
              failed++;
              tickets.push({ token: m.token, status: "error", error: t?.details?.error ?? t?.message ?? "unknown" });
              if (t?.details?.error === "DeviceNotRegistered") void opts.onInvalidToken?.(m.token);
            }
          });
        } catch (err) {
          failed += chunk.length;
          for (const m of chunk) tickets.push({ token: m.token, status: "error", error: (err as Error).message });
        }
      }
      return { ok, failed, tickets };
    },
    async receipts(ids) {
      const out: Record<string, PushReceipt> = {};
      for (let i = 0; i < ids.length; i += EXPO_RECEIPT_CHUNK) {
        const chunk = ids.slice(i, i + EXPO_RECEIPT_CHUNK);
        const res = await fetchImpl(EXPO_RECEIPTS_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ids: chunk }) });
        if (!res.ok) throw new Error(`Expo receipts HTTP ${res.status}`);
        const json = (await res.json().catch(() => ({}))) as { data?: Record<string, { status: "ok" | "error"; message?: string; details?: { error?: string } }> };
        for (const [id, r] of Object.entries(json.data ?? {})) out[id] = { status: r.status, message: r.message, error: r.details?.error };
      }
      return out;
    },
  };
}
