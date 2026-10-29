/**
 * The sign-up link the sales assistant sends is pre-filled from the chat (?shop=&vertical=&phone=&ref=assistant). Query text is
 * untrusted: it is only ever put into form fields the person can change, trimmed, length-capped and checked against known values.
 */
import { VERTICALS, isVariantId, parseVariantCookie } from "@ll/shared";

export interface SignupPrefill {
  shop?: string;
  vertical?: string;
  phone?: string;
  /** From the landing page's short form ("Email or mobile" holding an email). */
  email?: string;
  /** The plan button on /pricing the owner came from (?plan=plus, restaurant-growth ...): the checkout opens after signup. */
  plan?: string;
  /** Where the owner came from (?src=ig on an ad or landing page), stored with the new shop for attribution. */
  src?: string;
  /** "year" from an annual plan button (?interval=year): the checkout opens on the annual price. */
  interval?: "year";
  /** The landing-page variant (?v= from the start form: `<experimentId>:<variant>`, or a bare variant id), stored with the signup. */
  v?: { experimentId: string | null; variant: string };
}

/** The landing page's short form (?trade=) names a trade; the wizard wants a vertical. Brows and lashes share one. */
const TRADE_VERTICAL: Record<string, string> = { nails: "nails", brows: "brows_lashes", lashes: "brows_lashes", makeup: "makeup", barber: "barber", groom: "pet" };

/** Plans a pricing-page button can carry through signup. */
export const SIGNUP_PLANS = ["plus", "pro", "restaurant-starter", "restaurant-growth", "restaurant-pro"] as const;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function signupPrefill(params: Params): SignupPrefill {
  const out: SignupPrefill = {};
  const shop = one(params.shop)?.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120);
  if (shop) out.shop = shop;
  const trade = one(params.trade)?.trim() ?? "";
  const vertical = one(params.vertical)?.trim() || (Object.hasOwn(TRADE_VERTICAL, trade) ? TRADE_VERTICAL[trade] : undefined);
  if (vertical && (VERTICALS as readonly string[]).includes(vertical)) out.vertical = vertical;
  const plan = one(params.plan)?.trim();
  if (plan && (SIGNUP_PLANS as readonly string[]).includes(plan)) out.plan = plan;
  if (one(params.interval)?.trim() === "year") out.interval = "year";
  const src = one(params.src)?.trim();
  if (src && /^[A-Za-z0-9_.-]{1,40}$/.test(src)) out.src = src;
  const v = one(params.v)?.trim();
  const pv = parseVariantCookie(v);
  if (pv) out.v = pv;
  else if (isVariantId(v)) out.v = { experimentId: null, variant: v };
  // The landing page's "Email or mobile" field (?contact=): an email goes to the account, anything else is read as a phone number.
  const contact = one(params.contact)?.trim().slice(0, 254) ?? "";
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact)) out.email = contact;
  // The form's phone field holds the 10 digits of a Canadian number.
  let phone = (one(params.phone) ?? (out.email ? "" : contact)).replace(/\D/g, "");
  if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1);
  if (phone.length === 10) out.phone = phone;
  return out;
}
