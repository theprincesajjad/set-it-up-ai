/**
 * Order-ahead cart. Prices here are an ESTIMATE for display only: the API
 * ignores client prices and computes totals server-side (commerce.md § Pricing).
 */
export interface CartModifier {
  name: string;
  option: string;
  priceCents: number;
}

export interface CartLine {
  key: string;
  catalogItemId: string;
  name: string;
  basePriceCents: number;
  quantity: number;
  modifiers: CartModifier[];
}

export function lineKey(itemId: string, modifiers: { name: string; option: string }[]): string {
  return `${itemId}|${modifiers.map((m) => `${m.name}=${m.option}`).sort().join("&")}`;
}

export function addToCart(cart: CartLine[], line: Omit<CartLine, "key">): CartLine[] {
  const key = lineKey(line.catalogItemId, line.modifiers);
  const existing = cart.find((l) => l.key === key);
  if (existing) return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l));
  return [...cart, { ...line, key }];
}

export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => l.key !== key);
  return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l));
}

export function unitPrice(line: Pick<CartLine, "basePriceCents" | "modifiers">): number {
  return line.basePriceCents + line.modifiers.reduce((s, m) => s + m.priceCents, 0);
}

export function cartSubtotal(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + unitPrice(l) * l.quantity, 0);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.quantity, 0);
}

/** Items for POST /v1/me/orders (ids, quantities, modifier names only). */
export function orderItems(cart: CartLine[]) {
  return cart.map((l) => ({ catalogItemId: l.catalogItemId, quantity: l.quantity, modifiers: l.modifiers.map(({ name, option }) => ({ name, option })) }));
}

/** Pickup time choices: ASAP (+15) then every 15 min for 2 hours, rounded up to the quarter hour. */
export function pickupChoices(now: Date, count = 8): Date[] {
  const start = new Date(now.getTime() + 15 * 60_000);
  start.setSeconds(0, 0);
  const rem = start.getMinutes() % 15;
  if (rem) start.setMinutes(start.getMinutes() + (15 - rem));
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 15 * 60_000));
}
