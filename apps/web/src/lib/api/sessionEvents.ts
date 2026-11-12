/**
 * "The session is gone" as one event for the whole page. The browser API client calls `notifySessionEnded()` when a request is still
 * 401 after the proxy tried to refresh the session; `<SessionGuard />` (components/errors) listens and shows ONE banner with
 * "Sign in again", instead of every list on the screen showing its own failure. Browser only; a no-op on the server.
 */
const EVENT = "ll:session-ended";

export function notifySessionEnded(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe to the event; returns the unsubscribe function. */
export function onSessionEnded(fn: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** `/login?next=<where you are now>&reason=expired`. Only same-site paths are ever sent as `next`. */
export function loginHref(path: string, opts: { reason?: "expired" | "denied" } = {}): string {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const qs = new URLSearchParams({ next: safe });
  if (opts.reason) qs.set("reason", opts.reason);
  return `/login?${qs.toString()}`;
}
