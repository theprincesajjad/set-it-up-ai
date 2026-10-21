import type { PushProvider } from "./types.js";

export type Fetch = typeof fetch;

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo accepts at most 100 messages per request. */
export const EXPO_CHUNK = 100;

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo push notifications. Tokens look like ExponentPushToken[...]. Invalid
 * tokens are reported through `onInvalidToken` (DeviceNotRegistered) so the
 * caller can delete them.
 */
export function expoPush(
  opts: { accessToken?: string; onInvalidToken?: (token: string) => void | Promise<void> } = {},
  fetchImpl: Fetch = fetch,
): PushProvider {
  return {
    name: "expo",
    async send(msgs) {
      let ok = 0;
      let failed = 0;
      for (let i = 0; i < msgs.length; i += EXPO_CHUNK) {
        const chunk = msgs.slice(i, i + EXPO_CHUNK);
        const body = chunk.map((m) => ({ to: m.token, title: m.title, body: m.body, data: m.data ?? {}, sound: "default" }));
        try {
          const res = await fetchImpl(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
              accept: "application/json",
              "accept-encoding": "gzip, deflate",
              "content-type": "application/json",
              ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            failed += chunk.length;
            continue;
          }
          const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
          const tickets = json.data ?? [];
          chunk.forEach((m, idx) => {
            const t = tickets[idx];
            if (t?.status === "ok") ok++;
            else {
              failed++;
              if (t?.details?.error === "DeviceNotRegistered") void opts.onInvalidToken?.(m.token);
            }
          });
        } catch {
          failed += chunk.length;
        }
      }
      return { ok, failed };
    },
  };
}
