/** Who is looking at a failure. It decides the way out and who to contact (customers: the shop; owners and admins: our support address). */
export type Audience = "visitor" | "customer" | "owner" | "staff" | "admin";

/** The audience for a URL path: the area of the app tells us who is signed in there. */
export function audienceFromPath(path: string | null | undefined): Audience {
  const p = path ?? "/";
  if (p === "/admin" || p.startsWith("/admin/")) return "admin";
  if (p === "/rep" || p.startsWith("/rep/") || p === "/bia" || p.startsWith("/bia/")) return "staff";
  if (/^\/m(\/|$)/.test(p) || p.startsWith("/door/")) return "owner";
  if (/^\/(me|o|j|e|i|q|r|t|w|d|c|line|visit|pay|shops|discover|map|join)(\/|$)/.test(p)) return "customer";
  return "visitor";
}

/** Owners, staff and admins read the shop-dashboard wording (who to email, not "ask the shop"). */
export const isShopSide = (a: Audience): boolean => a === "owner" || a === "staff" || a === "admin";

/** `/m/<id>` for a path inside a shop's dashboard or door tablet, else null. */
export function merchantBase(path: string | null | undefined): string | null {
  const m = /^\/(?:m|door)\/([0-9a-f-]{8,})/i.exec(path ?? "");
  return m ? `/m/${m[1]}` : null;
}

/** Shops can be told their customers' cards and counter awards are safe; admins and the onboarding team cannot (it says nothing about them). */
export const reassuresShop = (a: Audience): boolean => a === "owner";
