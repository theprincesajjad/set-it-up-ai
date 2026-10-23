import { describe, expect, it } from "vitest";
import type { FeatureKey } from "@ll/shared";
import { RESTAURANT_NAV, buildMerchantNav, restaurantModules, restaurantUnlock } from "@/lib/dashboard/nav";

const keys = (enabled: FeatureKey[]) => buildMerchantNav("/m/x", "owner", new Set(enabled)).filter((n) => n.group.startsWith("r-")).map((n) => n.key);

describe("restaurant nav", () => {
  it("shows the plain commerce nav for a shop without any restaurant feature", () => {
    expect(keys([])).toEqual([]);
  });
  it("lists only entitled modules and folds the rest into one 'More for restaurants' entry", () => {
    expect(keys(["restaurant.dietary_tags", "restaurant.reviews", "restaurant.whatsapp_notifications"])).toEqual(["home", "orders", "restaurant-phone-orders", "restaurant-menu", "restaurant-whatsapp", "restaurant-reviews", "customers", "program", "promos", "discount-cards", "messages", "reports", "restaurant-more"]);
  });
  it("banquet and phone orders follow the merchant's enabled list (add-ons are folded in there)", () => {
    expect(keys(["restaurant.dietary_tags", "restaurant.banquet", "restaurant.phone_ai"])).toContain("restaurant-banquet");
    expect(keys(["restaurant.dietary_tags", "restaurant.banquet", "restaurant.phone_ai"])).toContain("restaurant-phone-orders");
    expect(keys([])).toEqual([]);
    expect(keys(["restaurant.dietary_tags"])).not.toContain("restaurant-banquet");
  });
  it("has no 'More' entry when everything is unlocked", () => {
    expect(keys(RESTAURANT_NAV.map((r) => r.feature))).not.toContain("restaurant-more");
    expect(restaurantModules(new Set(RESTAURANT_NAV.map((r) => r.feature))).locked).toEqual([]);
  });
  it("does not reuse the commerce 'Menu & catalog' label", () => {
    const labels = buildMerchantNav("/m/x", "owner", new Set<FeatureKey>(["restaurant.dietary_tags", "orders.order_ahead"])).map((n) => n.label);
    expect(labels).toContain("Menu & dietary");
    expect(labels).not.toContain("Dietary & languages");
  });
  it("names the tier and add-on that unlock a module", () => {
    expect(restaurantUnlock("tiffin")).toMatchObject({ tier: "Restaurant Growth", addOn: null });
    expect(restaurantUnlock("banquet")).toMatchObject({ tier: "Restaurant Pro", addOn: { name: "Banquet module", priceCents: 9900 } });
  });
});
