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
export const unauthorized = (message = "Please sign in to continue.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this. Ask the shop owner.") => new HttpError(403, "forbidden", message);
/** "Shop" becomes "We couldn't find that shop." (a leading acronym such as "VIP level" keeps its capitals). */
const lowerFirst = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
export const notFound = (what = "item") => new HttpError(404, "not_found", `We couldn't find that ${lowerFirst(what)}.`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
/** Feature exists but isn't on this merchant's plan or isn't rolled out yet. */
export const featureLocked = (feature: string, reason: "plan" | "rollout") =>
  new HttpError(402, "feature_locked", reason === "plan" ? `${feature} isn't on your plan yet.` : `${feature} isn't available yet.`, { feature, reason });
export const tooMany = (message: string) => new HttpError(429, "rate_limited", message);
/** An admin or rep tried to change something inside a shop without an active, reasoned support session. */
export const supportSessionRequired = (merchantId: string) =>
  new HttpError(403, "support_session_required", "Start a support session and give a reason before you change this shop.", { merchantId });
