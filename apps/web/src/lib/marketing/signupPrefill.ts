/**
 * The sign-up link the sales assistant sends is pre-filled from the chat (?shop=&vertical=&phone=&ref=assistant). Query text is
 * untrusted: it is only ever put into form fields the person can change, trimmed, length-capped and checked against known values.
 */
import { VERTICALS } from "@ll/shared";

export interface SignupPrefill {
  shop?: string;
  vertical?: string;
  phone?: string;
  /** The plan button on /pricing the owner came from (?plan=plus, restaurant-growth ...): the checkout opens after signup. */
  plan?: string;
  /** Where the owner came from (?src=ig on an ad or landing page), stored with the new shop for attribution. */
  src?: string;
}

/** Plans a pricing-page button can carry through signup. */
export const SIGNUP_PLANS = ["plus", "pro", "restaurant-starter", "restaurant-growth", "restaurant-pro"] as const;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function signupPrefill(params: Params): SignupPrefill {
  const out: SignupPrefill = {};
  const shop = one(params.shop)?.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120);
  if (shop) out.shop = shop;
  const vertical = one(params.vertical)?.trim();
  if (vertical && (VERTICALS as readonly string[]).includes(vertical)) out.vertical = vertical;
  const plan = one(params.plan)?.trim();
  if (plan && (SIGNUP_PLANS as readonly string[]).includes(plan)) out.plan = plan;
  const src = one(params.src)?.trim();
  if (src && /^[A-Za-z0-9_.-]{1,40}$/.test(src)) out.src = src;
  // The form's phone field holds the 10 digits of a Canadian number.
  let phone = (one(params.phone) ?? "").replace(/\D/g, "");
  if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1);
  if (phone.length === 10) out.phone = phone;
  return out;
}
