import type { z } from "zod";
import { badRequest } from "./errors.js";

/** One field-level problem in a 400's `details`: what the web shows under the field (it translates from `code`; `message` is the English). */
export interface FieldIssue {
  path: string;
  message: string;
  /** "required" | "too_short" | "too_long" | "email" | "url" | "int" | "number" | "min" | "max" | "date" | "invalid" */
  code: string;
  min?: number;
  max?: number;
}

/** The library's own sentences ("Invalid input: expected string, received undefined", "Too small: expected …") are not fit to show. A schema author's own sentence is. */
const LIBRARY_TEXT = /^(Invalid input|Invalid option|Invalid email|Invalid URL|Invalid string|Invalid (?:ISO|date|datetime|time|uuid|UUID|number|input)|Too small|Too big|Unrecognized key|Input not instance)/i;

/** Plain Canadian English, by kind of problem. Keep in step with `err.field.*` in the web catalogue. */
const SAY = {
  required: () => "This is required.",
  too_short: (n: number) => `Use at least ${n} characters.`,
  too_long: (n: number) => `Use ${n} characters or fewer.`,
  email: () => "Enter a valid email address.",
  url: () => "Enter a valid web address.",
  int: () => "Enter a whole number.",
  number: () => "Enter a number.",
  min: (n: number) => `Use ${n} or more.`,
  max: (n: number) => `Use ${n} or less.`,
  date: () => "Enter a valid date.",
  invalid: () => "Check this and try again.",
};

/** Turn one zod issue into a field problem a person can act on. */
export function fieldIssue(i: z.core.$ZodIssue): FieldIssue {
  const path = i.path.join(".");
  const custom = i.message && !LIBRARY_TEXT.test(i.message) ? i.message : null;
  const done = (code: keyof typeof SAY, extra: { min?: number; max?: number } = {}): FieldIssue => {
    const n = extra.min ?? extra.max ?? 0;
    return { path, message: custom ?? (SAY[code] as (n: number) => string)(n), code, ...extra };
  };
  const issue = i as unknown as { origin?: string; minimum?: number | bigint; maximum?: number | bigint; format?: string; expected?: string };
  switch (i.code) {
    case "invalid_type": {
      if (/received (undefined|null)/.test(i.message)) return done("required");
      if (issue.expected === "int" || issue.expected === "safeint") return done("int");
      if (issue.expected === "number") return done("number");
      return done("invalid");
    }
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? done("required") : done("too_short", { min });
      if (issue.origin === "array" || issue.origin === "set") return min <= 1 ? done("required") : done("min", { min });
      return done("min", { min });
    }
    case "too_big": {
      const max = Number(issue.maximum);
      return issue.origin === "string" ? done("too_long", { max }) : done("max", { max });
    }
    case "invalid_format": {
      if (issue.format === "email") return done("email");
      if (issue.format === "url") return done("url");
      if (issue.format === "date" || issue.format === "datetime" || issue.format === "time") return done("date");
      return done("invalid");
    }
    default:
      return done("invalid");
  }
}

/** Parse untrusted input with a zod schema; throws a 400 with field errors as `details: [{ path, message, code, min?, max? }]`. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw badRequest("Check the highlighted fields and try again.", r.error.issues.map(fieldIssue));
  }
  return r.data;
}

/** A `from`/`to` query value: an ISO date or date-time. Anything else is a 400 the web can show, not a 500 from an Invalid Date. */
export function parseQueryDate(value: string | undefined, field = "from"): Date | undefined {
  if (value === undefined || value === "") return undefined;
  const d = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value) ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(d.getTime())) throw badRequest("Use a date like 2026-11-30.", [{ path: field, message: "Use a date like 2026-11-30.", code: "date" }]);
  return d;
}
