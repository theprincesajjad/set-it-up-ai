/**
 * What kind of failure a thrown value is, so a screen can say the true thing: a phone with no signal is not a bad link,
 * and a server error is not a missing page. No React Native imports (unit-tested in Node).
 */
import { isApiError } from "../api/client";

export type FailKind = "offline" | "server" | "notFound" | "expired" | "signedOut" | "forbidden" | "other";

export function failKind(e: unknown): FailKind {
  if (!e) return "notFound";
  if (!isApiError(e)) return "other";
  if (e.isNetwork) return "offline";
  if (e.status >= 500) return "server";
  if (e.status === 410 || /expired/i.test(e.code)) return "expired";
  if (e.status === 404) return "notFound";
  if (e.status === 401) return "signedOut";
  if (e.status === 403) return "forbidden";
  return "other";
}

/** Worth offering "Try again": the request may succeed next time. A 404 or an expired link will not. */
export function canRetry(kind: FailKind): boolean {
  return kind === "offline" || kind === "server" || kind === "other";
}
