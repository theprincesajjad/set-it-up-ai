/**
 * Field-level problems from a rejected request (400 with `details: [{ path, message, code, min?, max? }]`), in the person's
 * language, keyed by field path. Empty when the failure names no field. No React Native imports (unit-tested in Node).
 */
import type { MessageKey, Vars } from "@ll/shared";
import { isApiError } from "../api/client";

type T = (key: MessageKey, vars?: Vars) => string;

interface Issue {
  path: string;
  message?: string;
  code?: string;
  min?: number;
  max?: number;
}

function issues(e: unknown): Issue[] {
  if (!isApiError(e) || !Array.isArray(e.details)) return [];
  const out: Issue[] = [];
  for (const d of e.details as unknown[]) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    if (typeof o.path !== "string") continue;
    out.push({ path: o.path, message: typeof o.message === "string" ? o.message : undefined, code: typeof o.code === "string" ? o.code : undefined, min: typeof o.min === "number" ? o.min : undefined, max: typeof o.max === "number" ? o.max : undefined });
  }
  return out;
}

function message(i: Issue, t: T, locale: string): string {
  switch (i.code) {
    case "required":
      return t("err.field.required");
    case "too_short":
      return i.min !== undefined ? t("err.field.tooShort", { min: i.min }) : t("err.field.invalid");
    case "too_long":
      return i.max !== undefined ? t("err.field.tooLong", { max: i.max }) : t("err.field.invalid");
    case "email":
      return t("err.field.email");
    case "phone":
      return t("err.field.phone");
    case "int":
      return t("err.field.int");
    case "number":
      return t("err.field.number");
    case "min":
      return i.min !== undefined ? t("err.field.min", { min: i.min }) : t("err.field.invalid");
    case "max":
      return i.max !== undefined ? t("err.field.max", { max: i.max }) : t("err.field.invalid");
    case "url":
      return t("err.field.url");
    case "date":
      return t("err.field.date");
    default:
      // A sentence the API wrote for this field ("Enter a Canadian postal code like M6R 2K3"): fit to show in English only.
      return locale === "en" && i.message ? i.message : t("err.field.invalid");
  }
}

/** `{ email: "Enter a valid email address." }`: only the first problem per field. */
export function fieldErrors(e: unknown, t: T, locale = "en"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues(e)) if (!(i.path in out)) out[i.path] = message(i, t, locale);
  return out;
}
