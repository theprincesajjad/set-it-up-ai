/**
 * One translated sentence for a failed website read (POST /v1/site-import), by the API's reason code. The API's own sentence is
 * English, so it is never shown: a shop owner reading Urdu gets Urdu. Used by the signup's first step and the dashboard's import.
 */
import type { MessageKey } from "@ll/shared";
import { errorKind, isApiError } from "@/lib/api/errors";

const REASON_KEY: Record<string, MessageKey> = {
  site_import_bad_url: "imp.err.bad_url",
  site_import_robots: "imp.err.robots",
  site_import_fetch_failed: "imp.err.fetch_failed",
  site_import_timeout: "imp.err.timeout",
};

export function importErrorText(err: unknown, t: (key: MessageKey) => string, errText: (e: unknown) => string): string {
  if (isApiError(err)) {
    const key = REASON_KEY[err.code];
    if (key) return t(key);
    // Too many reads in an hour, offline, the session, our own outage: the shared sentences already say those in every language.
    const kind = errorKind(err);
    if (kind === "rateLimited" || kind === "offline" || kind === "network" || kind === "session" || kind === "server") return errText(err);
  }
  return t("imp.err.generic");
}
