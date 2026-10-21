/**
 * Typed fetch client for the Local Loyalty API. Works in server components,
 * route handlers, the proxy and client components (it only uses `fetch`).
 *
 *  - JSON in/out; `{ error: { code, message, details? } }` → `ApiError`.
 *  - Bearer token from `getAccessToken()` (server: the httpOnly cookie;
 *    browser: none, the BFF route at /api/ll adds it).
 *  - On 401 calls `refresh()` once and retries (refresh-token rotation).
 *  - Network failures → `ApiError` with status 0 (`isNetwork`).
 *
 * Contracts live in @ll/shared (`authApi`, `customerApi`, `networkApi`, ...).
 * See `endpoints.ts` for the typed wrappers.
 */
import { ApiError, toApiError } from "./errors";

type Primitive = string | number | boolean | null | undefined;

export interface ApiClientOptions {
  /** e.g. "http://localhost:4000" (server) or "/api/ll" (browser, via the BFF route). */
  baseUrl: string;
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Called once after a 401. Return true when new credentials are available and the call should be retried. */
  refresh?: () => Promise<boolean>;
  fetch?: typeof fetch;
  /** Default headers on every request. */
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, Primitive | Primitive[]>;
  /** Serialised as JSON unless it is FormData / Blob / string. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent as the `Idempotency-Key` header (retry-safe writes: redeem, orders, payments). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip the bearer token (public endpoints). Default false. */
  anonymous?: boolean;
  /** Next.js fetch cache options (server only). */
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  /** Return the raw Response instead of parsing JSON (binary downloads, e.g. .pkpass). */
  raw?: boolean;
}

export interface ApiClient {
  request<T>(path: string, opts?: RequestOptions): Promise<T>;
  get<T>(path: string, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  delete<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  readonly baseUrl: string;
}

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  let url = `${base}${p}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      const values = Array.isArray(v) ? v : [v];
      for (const one of values) if (one !== undefined && one !== null && one !== "") qs.append(k, String(one));
    }
    const s = qs.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  return url;
}

function isBodyInit(b: unknown): b is BodyInit {
  return (
    typeof b === "string" ||
    (typeof FormData !== "undefined" && b instanceof FormData) ||
    (typeof Blob !== "undefined" && b instanceof Blob) ||
    (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams)
  );
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function send<T>(path: string, opts: RequestOptions, retried: boolean): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json", ...options.headers, ...opts.headers };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      if (isBodyInit(opts.body)) body = opts.body;
      else {
        body = JSON.stringify(opts.body);
        headers["content-type"] = "application/json";
      }
    }
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    if (!opts.anonymous && options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }

    const init: RequestInit & { next?: RequestOptions["next"] } = {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
      credentials: options.credentials,
    };
    if (opts.cache) init.cache = opts.cache;
    if (opts.next) init.next = opts.next;

    let res: Response;
    try {
      res = await doFetch(buildUrl(options.baseUrl, path, opts.query), init);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      throw ApiError.network(err);
    }

    if (res.status === 401 && !retried && !opts.anonymous && options.refresh) {
      const ok = await options.refresh().catch(() => false);
      if (ok) return send<T>(path, opts, true);
    }

    if (opts.raw && res.ok) return res as unknown as T;
    const data = await parseBody(res);
    if (!res.ok) throw toApiError(res.status, data);
    return data as T;
  }

  const client: ApiClient = {
    baseUrl: options.baseUrl,
    request: (path, opts = {}) => send(path, opts, false),
    get: (path, opts = {}) => send(path, { ...opts, method: "GET" }, false),
    post: (path, body, opts = {}) => send(path, { ...opts, method: "POST", body }, false),
    put: (path, body, opts = {}) => send(path, { ...opts, method: "PUT", body }, false),
    patch: (path, body, opts = {}) => send(path, { ...opts, method: "PATCH", body }, false),
    delete: (path, body, opts = {}) => send(path, { ...opts, method: "DELETE", body }, false),
  };
  return client;
}

/** A fresh idempotency key per user action (redeem, pay, order). */
export function newIdempotencyKey(prefix = "web"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${rnd}`;
}
