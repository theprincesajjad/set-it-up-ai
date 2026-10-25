export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in required") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this") => new HttpError(403, "forbidden", message);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
/** Feature exists but isn't on this merchant's plan or isn't rolled out yet. */
export const featureLocked = (feature: string, reason: "plan" | "rollout") =>
  new HttpError(402, "feature_locked", reason === "plan" ? `Upgrade to use ${feature}` : `${feature} is coming soon`, { feature, reason });
export const tooMany = (message: string) => new HttpError(429, "rate_limited", message);
/** An admin or rep tried to change something inside a shop without an active, reasoned support session. */
export const supportSessionRequired = (merchantId: string) =>
  new HttpError(403, "support_session_required", "Start a support session with a reason before changing this shop", { merchantId });
