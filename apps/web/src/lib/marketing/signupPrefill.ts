/**
 * The sign-up link the sales assistant sends is pre-filled from the chat (?shop=&vertical=&phone=&ref=assistant). Query text is
 * untrusted: it is only ever put into form fields the person can change, trimmed, length-capped and checked against known values.
 */
import { VERTICALS } from "@ll/shared";

export interface SignupPrefill {
  shop?: string;
  vertical?: string;
  phone?: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function signupPrefill(params: Params): SignupPrefill {
  const out: SignupPrefill = {};
  const shop = one(params.shop)?.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120);
  if (shop) out.shop = shop;
  const vertical = one(params.vertical)?.trim();
  if (vertical && (VERTICALS as readonly string[]).includes(vertical)) out.vertical = vertical;
  // The form's phone field holds the 10 digits of a Canadian number.
  let phone = (one(params.phone) ?? "").replace(/\D/g, "");
  if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1);
  if (phone.length === 10) out.phone = phone;
  return out;
}
