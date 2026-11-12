/**
 * Translated text for a failed request. Pure (no hooks), so it runs in server components, tests and event handlers; client
 * components get it bound to their language with `useErrorText()` (lib/api/useErrorText.ts).
 *
 *   const text = useErrorText();
 *   catch (e) { setError(text(e, { notFound: t("book.gone"), conflict: t("book.taken") })); }
 *
 * What it says, by kind (see errorKind): the `err.<kind>.line` sentence of the catalogue in the page's language. In English the API's own
 * sentence is kept for 400/402/404/409/410/422 (it names the specific thing); in hi/ur/pa it never is, because it is English.
 */
import type { Locale, MessageKey, Vars } from "@ll/shared";
import { errorKind, fieldIssues, isApiError, type ErrorKind, type FieldIssue } from "./errors";

export type T = (key: MessageKey, vars?: Vars) => string;

/** Sentences the screen knows better than the generic ones. Already translated. */
export interface ErrorContext {
  /** 404 / 410: "That spot is gone", "We can’t find your order". */
  notFound?: string;
  /** 409: "Someone else just took that time." */
  conflict?: string;
  /** 400 / 422 with no field-level details: "Check the date and time." */
  validation?: string;
  /** 403. */
  forbidden?: string;
  /** Anything else (5xx, unknown). */
  fallback?: string;
}

/** The API sentences that are fit to show when the page is English. Mirrors errors.ts. */
const SHOW_SERVER_TEXT = new Set([400, 402, 404, 409, 410, 422]);

/** "30 seconds", "2 minutes", "1 hour", in the page's language. */
export function waitText(sec: number, t: T): string {
  if (sec < 90) return t("err.wait.seconds", { n: Math.max(1, Math.round(sec)) });
  if (sec < 3300) return t("err.wait.minutes", { n: Math.round(sec / 60) });
  return t("err.wait.hours", { n: Math.round(sec / 3600) });
}

/** One sentence for any thrown value, in the page's language. */
export function userMessage(e: unknown, t: T, locale: Locale, ctx: ErrorContext = {}): string {
  const kind = errorKind(e);
  if (kind === "notFound" && ctx.notFound) return ctx.notFound;
  if (kind === "conflict" && ctx.conflict) return ctx.conflict;
  if (kind === "validation" && ctx.validation) return ctx.validation;
  if (kind === "forbidden" && ctx.forbidden) return ctx.forbidden;
  if (kind === "generic" && ctx.fallback) return ctx.fallback;
  if (kind === "server" && ctx.fallback) return ctx.fallback;
  if (!isApiError(e)) return t("err.generic.line");
  if (kind === "rateLimited") return e.retryAfter && e.retryAfter > 0 ? t("err.rate.line", { wait: waitText(e.retryAfter, t) }) : t("err.rate.lineNoWait");
  if (locale === "en" && e.code !== "http_error" && e.code !== "server_error" && e.message && (SHOW_SERVER_TEXT.has(e.status) || (e.status === 401 && kind !== "session") || (e.status === 403 && e.code !== "forbidden"))) {
    // Validation with field details: the sentence is the generic one; the fields say the rest.
    if (!(kind === "validation" && fieldIssues(e).length)) return e.message;
  }
  return t(LINE_KEY[kind]);
}

/** The one-sentence key for each kind (rate limits are built from `err.rate.line*`). */
export const LINE_KEY: Record<Exclude<ErrorKind, "rateLimited">, MessageKey> = {
  offline: "err.offline.line",
  network: "err.network.line",
  session: "err.session.line",
  forbidden: "err.forbidden.line",
  notFound: "err.notFound.line",
  conflict: "err.conflict.line",
  validation: "err.validation.line",
  server: "err.server.line",
  generic: "err.generic.line",
};

/** The title / body keys of a full-screen failure, by kind. */
export const TITLE_KEY: Record<ErrorKind, MessageKey> = {
  offline: "err.offline.title",
  network: "err.network.title",
  session: "err.session.title",
  forbidden: "err.forbidden.title",
  notFound: "err.notFound.title",
  conflict: "err.conflict.title",
  rateLimited: "err.rate.title",
  validation: "err.validation.title",
  server: "err.server.title",
  generic: "err.generic.title",
};

export const BODY_KEY: Record<Exclude<ErrorKind, "rateLimited" | "forbidden">, MessageKey> = {
  offline: "err.offline.body",
  network: "err.network.body",
  session: "err.session.body",
  notFound: "err.notFound.body",
  conflict: "err.conflict.body",
  validation: "err.validation.body",
  server: "err.server.body",
  generic: "err.generic.body",
};

/** Translated text for one field-level problem (`details[]` of a 400). */
export function fieldMessage(issue: FieldIssue, t: T, locale: Locale): string {
  switch (issue.code) {
    case "required":
      return t("err.field.required");
    case "too_short":
      return issue.min !== undefined ? t("err.field.tooShort", { min: issue.min }) : t("err.field.invalid");
    case "too_long":
      return issue.max !== undefined ? t("err.field.tooLong", { max: issue.max }) : t("err.field.invalid");
    case "email":
      return t("err.field.email");
    case "phone":
      return t("err.field.phone");
    case "int":
      return t("err.field.int");
    case "number":
      return t("err.field.number");
    case "min":
      return issue.min !== undefined ? t("err.field.min", { min: issue.min }) : t("err.field.invalid");
    case "max":
      return issue.max !== undefined ? t("err.field.max", { max: issue.max }) : t("err.field.invalid");
    case "url":
      return t("err.field.url");
    case "date":
      return t("err.field.date");
    default:
      // A custom sentence the API wrote for this field ("Use at least 8 characters"): fit to show in English only.
      return locale === "en" && issue.message ? issue.message : t("err.field.invalid");
  }
}

/**
 * Field errors from a thrown 400, keyed by field path: `{ email: "Enter a valid email address." }`. Empty when the error is not a
 * validation error or names no field. Show each under its field (TextField `error=`), and call `focusFirstInvalid(form)` after setting them.
 */
export function fieldErrors(e: unknown, t: T, locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of fieldIssues(e)) {
    // Only the first problem per field; the first sentence is the most useful one.
    if (!(issue.path in out)) out[issue.path] = fieldMessage(issue, t, locale);
  }
  return out;
}
