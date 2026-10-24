/**
 * Birthdays are month and day only ("MM-DD"). We never store or ask for the
 * year: the privacy policy promises "day and month only". Feb 29 is allowed.
 */
import { z } from "zod";

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True for a real calendar month and day, "MM-DD" (02-29 is valid). */
export function isMonthDay(v: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

/**
 * "MM-DD" or a legacy "YYYY-MM-DD" (older app builds and CSV files) -> "MM-DD", dropping any year.
 * Returns null when it is not a real date.
 */
export function toMonthDay(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  const full = /^\d{4}-(\d{2}-\d{2})$/.exec(s);
  const md = full ? full[1]! : s;
  return isMonthDay(md) ? md : null;
}

/** API input: accepts "MM-DD" (or a legacy "YYYY-MM-DD" whose year is dropped) and always yields "MM-DD". */
export const birthdaySchema = z
  .string()
  .transform((v, ctx) => {
    const md = toMonthDay(v);
    if (!md) ctx.issues.push({ code: "custom", message: "Use a month and day like 05-04", input: v });
    return md ?? z.NEVER;
  });
