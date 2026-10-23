import type { tiffinApi } from "@ll/shared";

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay", interac: "Interac" };

/** "Visa •••• 4242", "Stripe Test Bank •••• 6789", or "•••• 4242" when the brand is unknown. */
export function cardLabel(card: tiffinApi.CardOnFile): string {
  const brand = card.brand ? (BRANDS[card.brand.toLowerCase()] ?? card.brand) : "";
  return [brand, card.last4 ? `•••• ${card.last4}` : ""].filter(Boolean).join(" ");
}
