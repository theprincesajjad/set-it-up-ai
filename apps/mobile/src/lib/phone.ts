/**
 * NANP phone formatting shared by PhoneField (customer) and the counter Keypad.
 * Same algorithm as apps/web/src/lib/phone.ts (docs/design/system.md § PhoneField).
 * Digits only internally; display "(416) 555-0123"; emit E.164 "+14165550123".
 */

/** Strip to digits, drop a leading country code "1" on 11-digit input, cap at 10. */
export function sanitizePhoneInput(text: string): string {
  let d = text.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  else if (d.length > 10 && d.startsWith("1") && text.trim().startsWith("+")) d = d.slice(1);
  return d.slice(0, 10);
}

/** `4` → `(4`; `416` → `(416`; `4165` → `(416) 5`; `4165550` → `(416) 555-0`. */
export function formatNanp(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export type PhoneError = "incomplete" | "invalid";

/** null when valid: exactly 10 digits, area code and exchange don't start with 0 or 1. */
export function validateNanp(digits: string): PhoneError | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 10) return "incomplete";
  if (/^[01]/.test(d) || /^[01]/.test(d.slice(3))) return "invalid";
  return null;
}

export function isValidNanp(digits: string): boolean {
  return validateNanp(digits) === null;
}

/** "+14165550123", or null when the digits aren't a valid NANP number. */
export function toE164(digits: string): string | null {
  const d = sanitizePhoneInput(digits);
  return isValidNanp(d) ? `+1${d}` : null;
}

/**
 * Apply an edit from a TextInput showing the formatted value. If the user
 * deleted a formatting character (digits unchanged but text shorter), the
 * previous digit is removed so backspace never gets "stuck" on ") " or "-".
 */
export function applyPhoneEdit(prevDigits: string, nextText: string): string {
  const next = sanitizePhoneInput(nextText);
  const prevText = formatNanp(prevDigits);
  if (next === prevDigits && nextText.length < prevText.length) return prevDigits.slice(0, -1);
  return next;
}

/** Display form of an E.164 or raw number: "(416) 555-0123". */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = sanitizePhoneInput(phone);
  return d.length === 10 ? formatNanp(d) : phone;
}

/** "(416) 555-••23" style for the My card fallback line (middle digits hidden until tapped). */
export function maskMiddle(phone: string | null | undefined): string {
  const d = sanitizePhoneInput(phone ?? "");
  if (d.length !== 10) return displayPhone(phone);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6).replace(/\d/g, "•")}-${d.slice(6, 8).replace(/\d/g, "•")}${d.slice(8)}`;
}

export function last4(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-4);
}

/**
 * The one mask (polish-audit S18): "(647) ••• 1009". Works on a full number or the API's masked form
 * "(647) ***-1009". Without an area code: "•• 1009".
 */
export function maskPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 4) return phone ?? "";
  const tail = d.slice(-4);
  const nanp = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return nanp.length >= 7 ? `(${nanp.slice(0, 3)}) ••• ${tail}` : `•• ${tail}`;
}

/** Last four for tight rows: "•• 1009". */
export function last4Label(phone: string | null | undefined): string {
  const t = last4(phone);
  return t ? `•• ${t}` : "";
}
