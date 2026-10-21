import type { ApiError as ApiErrorEnvelope } from "@ll/shared";

/** Thrown by the API client for every non-2xx response (and for network failures, status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

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
    const e = new ApiError(0, "network_error", "Can't connect right now. Check your connection and try again.");
    (e as { cause?: unknown }).cause = cause;
    return e;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Parse the `{ error: { code, message, details? } }` envelope; tolerate anything else. */
export function toApiError(status: number, body: unknown): ApiError {
  const env = body as Partial<ApiErrorEnvelope> | null;
  if (env && typeof env === "object" && env.error && typeof env.error.code === "string") {
    return new ApiError(status, env.error.code, env.error.message || defaultMessage(status), env.error.details);
  }
  return new ApiError(status, status >= 500 ? "server_error" : "http_error", defaultMessage(status));
}

function defaultMessage(status: number): string {
  if (status === 401) return "For your security, please sign in again.";
  if (status === 404) return "We couldn't find that.";
  if (status === 429) return "Too many tries. Try again in 10 minutes.";
  if (status >= 500) return "Something went wrong on our end. Try again in a moment.";
  return "Something went wrong. Try again.";
}

/** A short, human message for any thrown value (ux-copy.md §2 errors). */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.isNetwork) return "Can't connect right now. Check your connection and try again.";
    if (e.status >= 500) return "Something went wrong on our end. Try again in a moment.";
    return e.message;
  }
  return "Something went wrong on our end. Try again in a moment.";
}
