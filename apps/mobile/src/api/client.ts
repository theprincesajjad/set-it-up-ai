/**
 * Typed fetch client for the Local Loyalty API.
 *
 * - Bearer access token from a TokenStore (expo-secure-store in the app,
 *   in-memory in tests).
 * - Refresh-token rotation: on a 401 the client calls POST /v1/auth/refresh
 *   once (single-flight, so 5 parallel 401s cause one refresh), stores the
 *   NEW pair (refresh tokens are single use) and retries the request once.
 *   If the refresh is also rejected the tokens are cleared and
 *   `onSessionExpired` fires (UI shows "Sign in again").
 * - Counter calls can use a staff PIN token (no refresh token; when it expires
 *   `onStaffTokenExpired` fires and the device asks for the PIN again).
 * - Every non-2xx becomes an ApiError parsed from `{ error: { code, message, details } }`.
 * - Network failures / timeouts become ApiError with code "network" (status 0),
 *   which the counter offline queue treats as "queue and retry".
 *
 * No React Native imports here: tested in plain Node (client.test.ts).
 */
import type { authApi } from "@ll/shared";
import { observeServerDate } from "../lib/serverClock";

export interface StoredTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface TokenStore {
  get(): Promise<StoredTokens | null>;
  set(tokens: StoredTokens | null): Promise<void>;
}

export interface StaffTokenSource {
  /** Current staff PIN token for counter calls, or null to use the device user's token. */
  get(): { accessToken: string; accessTokenExpiresAt: string } | null;
  clear(): void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  /** Seconds the server asked us to wait (Retry-After on a 429), when it said. */
  retryAfterSeconds: number | null = null;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** No response at all (offline, DNS, timeout). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
  /** Worth retrying later: offline, timeout, 5xx or the API's "internal" code. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.code === "internal";
  }
}

let requestLocale: string | null = null;
/** The language the person chose; sent as Accept-Language on every request so the server can answer (texts, errors) in it. */
export function setRequestLocale(locale: string | null): void {
  requestLocale = locale;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export type AuthMode = "user" | "staff" | "none" | "optional";

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** "user" (default): device user's token, refresh on 401. "staff": PIN token if set, else user. "optional": send if signed in. */
  auth?: AuthMode;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  staffToken?: StaffTokenSource;
  fetch?: typeof fetch;
  onSessionExpired?: () => void;
  onStaffTokenExpired?: () => void;
  /** Called after every successful refresh with the new pair (e.g. to update React state). */
  onTokens?: (tokens: StoredTokens) => void;
  defaultTimeoutMs?: number;
  userAgent?: string;
}

export interface ApiClient {
  request<T>(method: string, path: string, opts?: RequestOptions): Promise<T>;
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  del<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  /** Store tokens from a sign-in response. */
  setSession(res: authApi.AuthResponse | StoredTokens | null): Promise<void>;
  hasSession(): Promise<boolean>;
  /** Force a refresh now (e.g. on app foreground when the access token is about to expire). */
  refresh(): Promise<StoredTokens | null>;
  readonly baseUrl: string;
}

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return `${base}${p}${qs ? `?${qs}` : ""}`;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = res.status === 401 ? "unauthorized" : res.status >= 500 ? "internal" : "error";
  let message = res.statusText || `Request failed (${res.status})`;
  let details: unknown;
  try {
    const text = await res.text();
    if (text) {
      const json = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown } };
      if (json && typeof json === "object" && json.error) {
        code = json.error.code ?? code;
        message = json.error.message ?? message;
        details = json.error.details;
      }
    }
  } catch {
    // non-JSON body (proxy error page etc.)
  }
  const err = new ApiError(res.status, code, message, details);
  const wait = Number(res.headers?.get?.("retry-after"));
  if (Number.isFinite(wait) && wait > 0) err.retryAfterSeconds = Math.ceil(wait);
  return err;
}

function toTokens(res: authApi.AuthResponse | StoredTokens): StoredTokens {
  return {
    accessToken: res.accessToken,
    accessTokenExpiresAt: res.accessTokenExpiresAt,
    refreshToken: res.refreshToken,
    refreshTokenExpiresAt: res.refreshTokenExpiresAt,
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const defaultTimeout = options.defaultTimeoutMs ?? 15_000;
  let refreshing: Promise<StoredTokens | null> | null = null;

  async function rawFetch(method: string, url: string, init: { headers: Record<string, string>; body?: string; timeoutMs: number; signal?: AbortSignal }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);
    const onAbort = () => controller.abort();
    init.signal?.addEventListener("abort", onAbort);
    try {
      return await doFetch(url, { method, headers: init.headers, body: init.body, signal: controller.signal });
    } catch (e) {
      if (init.signal?.aborted) throw new ApiError(0, "aborted", "Request cancelled");
      const timedOut = controller.signal.aborted;
      throw new ApiError(0, "network", timedOut ? "This is taking too long and timed out. Check your connection and try again." : "Can't connect right now. Check your connection and try again.", {
        cause: e instanceof Error ? e.message : String(e),
      });
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    }
  }

  async function doRefresh(): Promise<StoredTokens | null> {
    const current = await options.tokenStore.get();
    if (!current?.refreshToken) return null;
    const res = await rawFetch("POST", buildUrl(baseUrl, "/v1/auth/refresh"), {
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
      timeoutMs: defaultTimeout,
    });
    if (res.status === 401 || res.status === 400) {
      // Refresh token unknown/expired/replayed: the session is over.
      await options.tokenStore.set(null);
      options.onSessionExpired?.();
      return null;
    }
    if (!res.ok) throw await parseError(res);
    const body = (await res.json()) as authApi.AuthResponse;
    const tokens = toTokens(body);
    await options.tokenStore.set(tokens);
    options.onTokens?.(tokens);
    return tokens;
  }

  function refresh(): Promise<StoredTokens | null> {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const auth = opts.auth ?? "user";
    const url = buildUrl(baseUrl, path, opts.query);
    const timeoutMs = opts.timeoutMs ?? defaultTimeout;

    const attempt = async (retried: boolean): Promise<T> => {
      const headers: Record<string, string> = { accept: "application/json", ...(requestLocale ? { "accept-language": requestLocale } : {}), ...(opts.headers ?? {}) };
      if (options.userAgent) headers["x-client"] = options.userAgent;
      let usedStaffToken = false;
      if (auth !== "none") {
        // An in-flight refresh means the stored access token is stale: wait for the new one.
        if (refreshing) await refreshing.catch(() => null);
        const staff = auth === "staff" ? options.staffToken?.get() : null;
        if (staff) {
          headers.authorization = `Bearer ${staff.accessToken}`;
          usedStaffToken = true;
        } else {
          const tokens = await options.tokenStore.get();
          if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
        }
      }
      let body: string | undefined;
      if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
      if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

      const res = await rawFetch(method, url, { headers, body, timeoutMs, signal: opts.signal });
      observeServerDate(res.headers?.get?.("date"));

      if (res.status === 401 && headers.authorization && !retried) {
        if (usedStaffToken) {
          // PIN tokens can't be refreshed: drop it and ask for the PIN again.
          options.staffToken?.clear();
          options.onStaffTokenExpired?.();
          throw await parseError(res);
        }
        const fresh = await refresh();
        if (fresh) return attempt(true);
        throw await parseError(res);
      }
      if (!res.ok) throw await parseError(res);
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    };
    return attempt(false);
  }

  return {
    baseUrl,
    request,
    get: (path, opts) => request("GET", path, opts),
    post: (path, body, opts) => request("POST", path, { ...opts, body }),
    patch: (path, body, opts) => request("PATCH", path, { ...opts, body }),
    put: (path, body, opts) => request("PUT", path, { ...opts, body }),
    del: (path, body, opts) => request("DELETE", path, { ...opts, body }),
    async setSession(res) {
      await options.tokenStore.set(res ? toTokens(res) : null);
    },
    async hasSession() {
      return (await options.tokenStore.get()) !== null;
    },
    refresh,
  };
}

/** Catalog keys for the translated sentence per failure kind. They exist in en, hi, ur and pa (the shared "err.*" family). */
export type ApiErrorKey = "err.validation.line" | "err.session.line" | "err.forbidden.line" | "err.notFound.line" | "err.conflict.line" | "err.rate.line" | "err.rate.lineNoWait" | "err.generic.line";
export type ApiErrorTranslate = (key: ApiErrorKey | "err.wait.seconds" | "err.wait.minutes" | "err.wait.hours", vars?: Record<string, string | number>) => string;

let translateApiError: ApiErrorTranslate | null = null;
/** The locale provider registers its translator here, so every caller of errorMessage speaks the person's language without passing it in. */
export function setApiErrorTranslator(fn: ApiErrorTranslate | null): void {
  translateApiError = fn;
}

/** Which translated sentence fits a failed response. Never the server's own (English) text. */
export function apiErrorKey(e: ApiError): ApiErrorKey {
  if (e.status === 401) return "err.session.line";
  if (e.status === 403) return "err.forbidden.line";
  if (e.status === 404 || e.status === 410) return "err.notFound.line";
  if (e.status === 409) return "err.conflict.line";
  if (e.status === 429) return e.retryAfterSeconds ? "err.rate.line" : "err.rate.lineNoWait";
  if (e.status === 400 || e.status === 422) return "err.validation.line";
  return "err.generic.line";
}

function waitText(tr: ApiErrorTranslate, seconds: number): string {
  if (seconds < 90) return tr("err.wait.seconds", { n: Math.max(1, seconds) });
  if (seconds < 5400) return tr("err.wait.minutes", { n: Math.ceil(seconds / 60) });
  return tr("err.wait.hours", { n: Math.ceil(seconds / 3600) });
}

/**
 * Message for any thrown value, in the person's language: the network and server copy the caller passes, and for every other
 * failure a translated sentence chosen by status (validation, signed out, forbidden, not found, conflict, rate limit).
 * The server's own message is never shown: it is English and may carry codes or field paths.
 */
export function errorMessage(e: unknown, copy: { network: string; server: string }): string {
  if (!isApiError(e)) return copy.server;
  if (e.isNetwork) return copy.network;
  if (e.status >= 500) return copy.server;
  const tr = translateApiError;
  if (!tr) return copy.server;
  const key = apiErrorKey(e);
  return key === "err.rate.line" ? tr(key, { wait: waitText(tr, e.retryAfterSeconds!) }) : tr(key);
}
