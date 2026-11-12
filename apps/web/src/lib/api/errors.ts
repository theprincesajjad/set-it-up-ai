import type { ApiError as ApiErrorEnvelope } from "@ll/shared";

/**
 * The error model for the whole web app. One place decides what kind of failure a thrown value is (`errorKind`), and every
 * screen, banner and form turns that kind into words: `lib/api/userError.ts` for translated text (customers, counter, shop
 * dashboard), `components/errors/*` for full screens. Do not branch on `e.message` anywhere else.
 */

/** One field-level problem from a 400: the API sends `details: [{ path, message, code?, min?, max? }]`. */
export interface FieldIssue {
  /** Dotted path of the field ("email", "items.0.qty"). */
  path: string;
  /** English text from the API. Only shown when the page is English; other languages map `code` to a catalogue key. */
  message: string;
  /** "required" | "too_short" | "too_long" | "email" | "phone" | "int" | "number" | "min" | "max" | "url" | "date" | "invalid". */
  code?: string;
  min?: number;
  max?: number;
}

/** Thrown by the API client for every non-2xx response (and for network failures, status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /** Seconds until the caller may try again, from the Retry-After header or `details.retryAfterSec` (429 and some 503). */
  retryAfter?: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the request never reached the server (offline, DNS, CORS, API down). */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  static network(cause?: unknown): ApiError {
    const e = new ApiError(0, "network_error", "We couldn’t reach Local Loyalty. Check your connection and try again.");
    (e as { cause?: unknown }).cause = cause;
    return e;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Parse a Retry-After header: delta-seconds or an HTTP date. Seconds, or undefined. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined;
}

/** Parse the `{ error: { code, message, details? } }` envelope; tolerate anything else. `headers` supplies Retry-After. */
export function toApiError(status: number, body: unknown, headers?: { get(name: string): string | null } | null): ApiError {
  const env = body as Partial<ApiErrorEnvelope> | null;
  let e: ApiError;
  if (env && typeof env === "object" && env.error && typeof env.error.code === "string") {
    e = new ApiError(status, env.error.code, env.error.message || defaultMessage(status), env.error.details);
  } else {
    e = new ApiError(status, status >= 500 ? "server_error" : "http_error", defaultMessage(status));
  }
  const fromDetails = (e.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec;
  e.retryAfter = parseRetryAfter(headers?.get("retry-after")) ?? (typeof fromDetails === "number" ? fromDetails : undefined);
  return e;
}

function defaultMessage(status: number): string {
  if (status === 401) return "Your session ended. Sign in again to carry on.";
  if (status === 403) return "You don’t have access to this. Ask the shop owner to add you.";
  if (status === 404) return "We couldn’t find that. It may have been removed.";
  if (status === 429) return "You’re going a little fast. Wait a moment, then try again.";
  if (status >= 500) return "Something went wrong on our side. Try again in a minute.";
  return "Something went wrong. Try again.";
}

/** What kind of failure is this? Drives the title, the sentence and the primary action of every error screen. */
export type ErrorKind = "offline" | "network" | "session" | "forbidden" | "notFound" | "conflict" | "rateLimited" | "validation" | "server" | "generic";

/** Browser only: the device says it has no connection. Always false on the server. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** The kind of a thrown value. `offline` is `network` while the browser reports no connection. */
export function errorKind(e: unknown): ErrorKind {
  if (!isApiError(e)) return "generic";
  // The same-origin proxy answers 502 network_error when the API itself cannot be reached.
  if (e.status === 0 || e.code === "network_error") return isOffline() ? "offline" : "network";
  // 401 is a lost session only when the API says so (`unauthorized`). A wrong staff PIN is a wrong entry; an expired one-time link is gone.
  if (e.status === 401) return e.code === "invalid_pin" ? "validation" : e.code === "link_expired" ? "notFound" : "session";
  if (e.status === 403) return "forbidden";
  if (e.status === 404 || e.status === 410) return "notFound";
  if (e.status === 409) return "conflict";
  if (e.status === 429) return "rateLimited";
  if (e.status === 400 || e.status === 422) return "validation";
  if (e.status >= 500) return "server";
  return "generic";
}

/** Retrying cannot fix these; the screen offers a different primary action. */
export function isRetryable(e: unknown): boolean {
  const k = errorKind(e);
  return k === "offline" || k === "network" || k === "server" || k === "rateLimited" || k === "conflict" || k === "generic";
}

/** True when the failure is the person's session (401 after the proxy's refresh attempt). */
export function isSessionEnded(e: unknown): boolean {
  return isApiError(e) && e.status === 401;
}

/** The field-level problems carried by a 400, normalised (empty when there are none). */
export function fieldIssues(e: unknown): FieldIssue[] {
  if (!isApiError(e) || !Array.isArray(e.details)) return [];
  const out: FieldIssue[] = [];
  for (const d of e.details as unknown[]) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    if (typeof o.path !== "string" || typeof o.message !== "string") continue;
    out.push({
      path: o.path,
      message: o.message,
      code: typeof o.code === "string" ? o.code : undefined,
      min: typeof o.min === "number" ? o.min : undefined,
      max: typeof o.max === "number" ? o.max : undefined,
    });
  }
  return out;
}

/** The English sentence for each kind: only for the English-only shop dashboard helpers (`errorMessage`). Keep in step with `err.<kind>.line` in the catalogue (a unit test checks). */
export const ENGLISH_LINE: Record<Exclude<ErrorKind, "rateLimited">, string> & { rateLimited: string; rateLimitedAfter: string } = {
  offline: "You’re offline. Reconnect and try again.",
  network: "We couldn’t reach Local Loyalty. Check your connection and try again.",
  session: "Your session ended. Sign in again to carry on.",
  forbidden: "You don’t have access to this. Ask the shop owner to add you.",
  notFound: "We couldn’t find that. It may have been removed.",
  conflict: "That changed while you were working. Reload and try again.",
  rateLimited: "You’re going a little fast. Wait a moment, then try again.",
  rateLimitedAfter: "You’re going a little fast. Try again in {wait}.",
  validation: "Check the highlighted fields and try again.",
  server: "Something went wrong on our side. Try again in a minute.",
  generic: "Something went wrong. Try again.",
};

/** "30 seconds", "2 minutes", "1 hour" (English; the translated twin is `waitText` in userError.ts). */
function englishWait(sec: number): string {
  if (sec < 90) return `${Math.max(1, Math.round(sec))} ${Math.round(sec) === 1 ? "second" : "seconds"}`;
  if (sec < 3300) return `${Math.round(sec / 60)} minutes`;
  const h = Math.round(sec / 3600);
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

/** The API's own sentence is fit to show (English only) for these: it names the specific thing that is wrong. */
const SHOW_SERVER_TEXT = new Set([400, 402, 404, 409, 410, 422]);

/**
 * A short, human message for any thrown value, in English. For the English-only shop dashboard (and server logs); customer, counter
 * and any translated screen use `useErrorText()` / `userMessage()` from `lib/api/userError.ts` instead.
 */
export function errorMessage(e: unknown): string {
  const kind = errorKind(e);
  if (isApiError(e)) {
    if (kind === "rateLimited") {
      if (e.retryAfter && e.retryAfter > 0) return ENGLISH_LINE.rateLimitedAfter.replace("{wait}", englishWait(e.retryAfter));
      return e.message && e.message !== ENGLISH_LINE.rateLimited && !/^too many requests\.?$/i.test(e.message) ? e.message : ENGLISH_LINE.rateLimited;
    }
    // Validation: the API's generic sentence, or its specific one. A field-level list is shown under the fields by the form.
    if ((SHOW_SERVER_TEXT.has(e.status) || (e.status === 401 && kind !== "session") || (e.status === 403 && e.code !== "forbidden")) && e.code !== "http_error" && e.code !== "server_error" && e.message) return e.message;
    return ENGLISH_LINE[kind];
  }
  return ENGLISH_LINE.generic;
}

/**
 * The kind behind a message that `errorMessage()` produced (callers that only kept the string, like `useApi().error`). Exact matches
 * only: a server sentence that happens to read like one is not guessed. Null when the message is something else.
 */
export function kindFromEnglishLine(message: string | null | undefined): ErrorKind | null {
  if (!message) return null;
  for (const k of Object.keys(ENGLISH_LINE) as (keyof typeof ENGLISH_LINE)[]) {
    if (k === "rateLimitedAfter") continue;
    if (ENGLISH_LINE[k] === message) return k;
  }
  if (message.startsWith("You’re going a little fast.")) return "rateLimited";
  return null;
}

/** Field problems from a 400 as `{ path: "English sentence" }`, first problem per field. For the English-only shop dashboard (translated screens use `fieldErrors` from userError.ts). */
export function fieldErrorMap(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of fieldIssues(e)) if (!(i.path in out)) out[i.path] = i.message;
  return out;
}
