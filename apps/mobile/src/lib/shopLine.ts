/**
 * The one italic line under a shop on Discover and on a map pin, in the order the café research sets
 * (docs/research/cafes-retail.md 7.9): my progress, a live earn window, the shop's perk, the kind of place.
 * The window and the perk come from the network directory (`promoLine`, `perk` on each shop), so Discover
 * and the map say the same thing. Pure and unit tested.
 */
export interface ShopLineInput {
  /** "your 7 / 10" for a member, "5 / 8 stamps" on a pin. */
  progress?: string | null;
  /** A live window right now: "2× stamps till 4 pm". */
  promoLine?: string | null;
  /** A standing perk: "5% off Tuesdays", "show your card for 10% off". */
  perk?: string | null;
  /** The kind of place: "bakery". */
  kind: string;
  /** The kind with its distance and hours ("café · 140 m · open"); used when there is nothing to add. */
  meta?: string | null;
}

export function shopLine(o: ShopLineInput): string {
  const head = [o.progress, o.promoLine].filter((x): x is string => !!x);
  if (head.length) return head.join(" · ");
  if (o.perk) return `${o.kind} · ${o.perk}`;
  return o.meta || o.kind;
}
