import { describe, expect, it } from "vitest";
import { addToCart, cartCount, cartSubtotal, orderItems, pickupChoices, setQuantity } from "./cart";

const latte = { catalogItemId: "latte", name: "Latte", basePriceCents: 525, quantity: 1, modifiers: [{ name: "Size", option: "Large", priceCents: 75 }] };

describe("cart", () => {
  it("merges identical lines and sums modifiers (commerce.md example)", () => {
    let cart = addToCart([], latte);
    cart = addToCart(cart, latte);
    cart = addToCart(cart, { catalogItemId: "croissant", name: "Croissant", basePriceCents: 375, quantity: 1, modifiers: [] });
    expect(cart).toHaveLength(2);
    expect(cartCount(cart)).toBe(3);
    expect(cartSubtotal(cart)).toBe(2 * 600 + 375);
  });
  it("sends only ids, quantities and modifier names (server prices)", () => {
    expect(orderItems(addToCart([], latte))).toEqual([{ catalogItemId: "latte", quantity: 1, modifiers: [{ name: "Size", option: "Large" }] }]);
  });
  it("quantity 0 removes the line", () => {
    const cart = addToCart([], latte);
    expect(setQuantity(cart, cart[0]!.key, 0)).toEqual([]);
  });
  it("pickup choices start 15+ minutes out on the quarter hour", () => {
    const c = pickupChoices(new Date(2026, 9, 21, 15, 7), 3);
    expect(c.map((d) => `${d.getHours()}:${d.getMinutes()}`)).toEqual(["15:30", "15:45", "16:0"]);
  });
});
