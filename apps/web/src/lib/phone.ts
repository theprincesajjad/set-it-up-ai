/**
 * NANP (Canada / US) phone formatting, docs/design/system.md "PhoneField".
 * Same algorithm as apps/mobile/src/lib/phone.ts (keep them in sync).
 *
 *   formatNanp("4165550")      → "(416) 555-0"
 *   toE164("4165550123")       → "+14165550123"
 *   normalizeDigits("+1 416-555-0123") → "4165550123"
 */

/** Strip non-digits; drop a leading country code 1 when 11 digits; cap at 10. */
export function normalizeDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  // Typed "1" first (people often prefix the country code): don't keep it as an area-code digit.
  if (d.length > 10 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Display format while typing: (4 → (416 → (416) 5 → (416) 555-0123. */
export function formatNanp(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export type PhoneValidation = "ok" | "incomplete" | "invalid";

/** 10 digits; area code and exchange can't start with 0 or 1. */
export function validateNanp(digits: string): PhoneValidation {
  const d = digits.replace(/\D/g, "");
  if (d.length < 10) return "incomplete";
  if (d.length > 10) return "invalid";
  if (/^[01]/.test(d) || /^[01]/.test(d.slice(3))) return "invalid";
  return "ok";
}

/** E.164 for a valid 10-digit NANP number, else null. */
export function toE164(digits: string): string | null {
  const d = normalizeDigits(digits);
  return validateNanp(d) === "ok" ? `+1${d}` : null;
}

/** "+14165550123" → "(416) 555-0123" (for display of stored numbers). */
export function formatE164(e164: string | null | undefined): string {
  if (!e164) return "";
  return formatNanp(normalizeDigits(e164));
}

/**
 * Backspace over a formatting character should delete the previous digit.
 * Given the previous display value and the new raw input value, return the new digits.
 */
export function digitsAfterEdit(prevDisplay: string, nextRaw: string, caret?: number | null): string {
  const prevDigits = prevDisplay.replace(/\D/g, "");
  const nextDigits = nextRaw.replace(/\D/g, "");
  // A deletion that only removed formatting (same digits, shorter string): drop the digit before it.
  if (nextRaw.length < prevDisplay.length && nextDigits === prevDigits) {
    const at = caret ?? nextRaw.length;
    const digitsBefore = nextRaw.slice(0, at).replace(/\D/g, "").length;
    if (digitsBefore === 0) return prevDigits;
    return prevDigits.slice(0, digitsBefore - 1) + prevDigits.slice(digitsBefore);
  }
  return normalizeDigits(nextRaw);
}

export const PHONE_ERRORS = {
  incomplete: "Enter a 10-digit mobile number.",
  invalid: "That doesn't look like a Canadian or US mobile number. Check the area code.",
} as const;

/** The one mask (polish-audit S18): "(647) ••• 1009" from a full number or the API's "(647) ***-1009". */
export function maskPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 4) return phone ?? "";
  const nanp = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return nanp.length >= 7 ? `(${nanp.slice(0, 3)}) ••• ${d.slice(-4)}` : `•• ${d.slice(-4)}`;
}
