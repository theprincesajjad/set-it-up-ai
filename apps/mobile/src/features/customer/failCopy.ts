import type { LocaleValue } from "../../lib/i18n";
import { failKind } from "../../lib/failKind";

/**
 * The words for a request that failed, picked by what really happened: no signal reads as offline, anything else the server
 * could not do reads as "our side". Never the server's own text. Screens pair it with Try again.
 */
export function failCopy(L: Pick<LocaleValue, "t">, error: unknown, assumeOffline = false): { offline: boolean; title: string; body: string } {
  const offline = assumeOffline || failKind(error) === "offline";
  return offline ? { offline, title: L.t("err.offline.title"), body: L.t("err.offline.body") } : { offline, title: L.t("err.server.title"), body: L.t("err.server.body") };
}
