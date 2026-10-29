import { describe, expect, it } from "vitest";
import { RESTAURANT_FEATURES, effectivePlan, FEATURES, FEES, FEATURE_KEYS, FREE_FOREVER, PAID_FEATURES, PLANS, calculateEarn, isFeatureEnabled, featureOffer, isPlanAvailable, normalizePhone, type FeatureKey } from "../src/index.js";

describe("plans", () => {
  it("keeps the loyalty program and reporting free forever (Pricing v2)", () => {
    const expected: FeatureKey[] = [
      "loyalty.points",
      "loyalty.visits",
      "loyalty.stamps",
      "loyalty.items",
      "loyalty.rewards_catalog",
      "loyalty.welcome_bonus",
      "loyalty.manual_adjust",
      "loyalty.no_earn_categories",
      "network.listing",
      "wallet.passes",
      "customers.directory",
      "reports.basic",
      "staff.unlimited",
      "locations.unlimited",
    ];
    expect([...FREE_FOREVER].sort()).toEqual([...expected].sort());
    for (const k of FREE_FOREVER) {
      expect(FEATURES[k].minPlan).toBe("free");
      expect(FEATURES[k].defaultStage).toBe("ga");
      // Never gated: on for a free merchant at GA with no override.
      expect(isFeatureEnabled(k, { plan: "free", stage: "ga" })).toBe(true);
    }
  });
  it("puts promos, marketing, VIP, CSV and integrations on Plus, live at launch (trade tools self-serve)", () => {
    const plus: FeatureKey[] = [
      "promos.basic",
      "promos.double_points",
      "loyalty.vip_levels",
      "loyalty.birthday_bonus",
      "loyalty.referrals",
      "discount_cards",
      "marketing.email",
      "marketing.sms",
      "marketing.automations",
      "promos.push_nearby",
      "customers.csv_export",
      "customers.csv_import",
      "integrations.pos_auto_award",
      "integrations.webhooks",
      "reports.advanced",
      "orders.order_ahead",
      "orders.pickup_status",
      "payments.in_app",
      "booking.pickup_slots",
    ];
    for (const k of plus) {
      expect(FEATURES[k].minPlan, k).toBe("plus");
      expect(FEATURES[k].defaultStage, k).toBe(k === "promos.push_nearby" ? "hidden" : "ga");
      expect(FEATURES[k].unlockAtMerchants, k).toBe(k === "promos.push_nearby" ? 100 : 0);
      expect(isFeatureEnabled(k, { plan: "free", stage: "ga" }), k).toBe(false);
      expect(isFeatureEnabled(k, { plan: "plus", stage: "ga" }), k).toBe(true);
      // Pro includes Plus.
      expect(isFeatureEnabled(k, { plan: "pro", stage: "ga" }), k).toBe(true);
    }
    for (const k of ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices", "booking.dropoff_scheduling", "staff.permissions"] as const) {
      expect(FEATURES[k].minPlan).toBe("pro");
      expect(FEATURES[k].defaultStage).toBe("ga");
      expect(isFeatureEnabled(k, { plan: "plus", stage: "ga" })).toBe(false);
    }
    // Every paid trade tool ships live (founder decision 2026-10-27); only network-wide extras ship hidden. Outside PAID_FEATURES: FREE_FOREVER + the platform perks lever + phase 3 are outside PAID_FEATURES.
    for (const k of PAID_FEATURES) expect(FEATURES[k].defaultStage).toBe(FEATURES[k].networkGated ? "hidden" : "ga");
    expect(FEATURE_KEYS.filter((k) => !FREE_FOREVER.includes(k) && !PAID_FEATURES.includes(k) && !RESTAURANT_FEATURES.includes(k)).sort()).toEqual(
      // booking.appointments is free (one calendar) but not free forever: it is phase 2, gated only by the calendar cap.
      ["ads.map_pin", "ads.sponsored_listing", "ads.sponsored_promo", "booking.appointments", "campaigns.neighbourhood", "network.perks"].sort(),
    );
    expect(PLANS.plus.priceCents).toBe(3900);
    expect(PLANS.pro.priceCents).toBe(9900);
  });
  it("treats network perks as a platform lever, not a merchant feature", () => {
    expect(FEATURES["network.perks"].platform).toBe(true);
    expect(FREE_FOREVER).not.toContain("network.perks");
    expect(isFeatureEnabled("network.perks", { plan: "free", stage: "ga" })).toBe(true);
  });
  it("lets an admin override unlock a hidden paid feature for a pilot shop", () => {
    expect(isFeatureEnabled("promos.basic", { plan: "free", stage: "hidden", override: true })).toBe(true);
    expect(isFeatureEnabled("promos.basic", { plan: "free", stage: "hidden" })).toBe(false);
  });
  it("hides paid features until rolled out", () => {
    expect(isFeatureEnabled("orders.order_ahead", { plan: "pro", stage: "hidden" })).toBe(false);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "free", stage: "ga" })).toBe(false);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "plus", stage: "ga" })).toBe(true);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "plus", stage: "beta" })).toBe(false);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "plus", stage: "beta", betaOptIn: true })).toBe(true);
    expect(isPlanAvailable("plus", {})).toBe(true);
    expect(isPlanAvailable("plus", { "orders.order_ahead": "hidden" })).toBe(true);
  });
});

describe("appointments pricing", () => {
  it("puts appointments on Free for one bookable calendar, not free forever (solo-pro-launch.md §3.1)", () => {
    expect(PLANS.plus.name).toBe("Pro");
    expect(FEATURES["booking.appointments"].minPlan).toBe("free");
    expect(FEATURES["booking.appointments"].defaultStage).toBe("ga");
    expect(FREE_FOREVER).not.toContain("booking.appointments");
    expect(isFeatureEnabled("booking.appointments", { plan: "free", stage: "ga" })).toBe(true);
    expect(isFeatureEnabled("booking.appointments", { plan: "plus", stage: "ga" })).toBe(true);
    expect(isFeatureEnabled("booking.appointments", { plan: "pro", stage: "ga" })).toBe(true);
    // Not free forever, so an admin can still hide it; the one plan gate is the calendar cap.
    expect(isFeatureEnabled("booking.appointments", { plan: "plus", stage: "hidden" })).toBe(false);
    expect(isFeatureEnabled("booking.appointments", { plan: "free", stage: "hidden" })).toBe(false);
    expect(isFeatureEnabled("booking.appointments", { plan: "free", stage: "hidden", override: true })).toBe(true);
  });
  it("takes no platform fee on in-person checkout through the calendar", () => {
    expect(FEES.appointmentCheckoutBps).toBe(0);
    expect(FEES.depositInvoiceBps).toBe(100);
  });
});

describe("points", () => {
  it("computes earn with VIP and promo multipliers", () => {
    const r = calculateEarn({
      rules: { earnType: "per_dollar", pointsPerDollar: 1, pointsPerVisit: 0, minSpendCents: 0 },
      lines: [{ amountCents: 1050 }],
      noEarnCategoryIds: [],
      boosts: [{ multiplier: 2 }, { bonusPoints: 5 }],
      vipMultiplier: 1.5,
    });
    expect(r.basePoints).toBe(30);
    expect(r.totalPoints).toBe(35);
  });
  it("normalizes phones", () => {
    expect(normalizePhone("(416) 555-0100")).toBe("+14165550100");
    expect(normalizePhone("12")).toBeNull();
  });
});

describe("restaurant pack", () => {
  it("gates restaurant features by tier, not plan, and includes Pro", () => {
    expect(isFeatureEnabled("restaurant.tiffin", { plan: "pro", stage: "ga" })).toBe(false);
    expect(isFeatureEnabled("restaurant.tiffin", { plan: "free", stage: "ga", restaurantTier: "starter" })).toBe(false);
    expect(isFeatureEnabled("restaurant.tiffin", { plan: "free", stage: "ga", restaurantTier: "growth" })).toBe(true);
    expect(isFeatureEnabled("restaurant.kds", { plan: "free", stage: "ga", restaurantTier: "growth" })).toBe(false);
    expect(isFeatureEnabled("restaurant.kds", { plan: "free", stage: "ga", restaurantTier: "pro" })).toBe(true);
    expect(isFeatureEnabled("orders.order_ahead", { plan: "free", stage: "ga", restaurantTier: "starter" })).toBe(true);
    expect(effectivePlan("free", "starter")).toBe("plus");
    expect(effectivePlan("pro", "starter")).toBe("pro");
    for (const k of RESTAURANT_FEATURES) expect(FEATURES[k].defaultStage).toBe("ga");
  });
  it("unlocks banquet and phone AI on Growth with the matching add-on only", () => {
    const g = { plan: "free", stage: "ga", restaurantTier: "growth" } as const;
    expect(isFeatureEnabled("restaurant.banquet", g)).toBe(false);
    expect(isFeatureEnabled("restaurant.banquet", { ...g, addOns: ["banquet_module"] })).toBe(true);
    expect(isFeatureEnabled("restaurant.phone_ai", { ...g, addOns: ["banquet_module"] })).toBe(false);
    expect(isFeatureEnabled("restaurant.phone_ai", { ...g, addOns: ["phone_ai"] })).toBe(true);
    expect(isFeatureEnabled("restaurant.kds", { ...g, addOns: ["banquet_module", "phone_ai"] })).toBe(false);
    // Starter can't buy its way into Growth features, and hidden stages still win.
    expect(isFeatureEnabled("restaurant.banquet", { plan: "free", stage: "ga", restaurantTier: "starter", addOns: ["banquet_module"] })).toBe(false);
    expect(isFeatureEnabled("restaurant.banquet", { ...g, stage: "hidden", addOns: ["banquet_module"] })).toBe(false);
  });
  it("keeps Plus purchasable on its own trade tools, not because restaurant features are live", () => {
    expect(isPlanAvailable("plus", {})).toBe(true);
    expect(isPlanAvailable("plus", Object.fromEntries(FEATURE_KEYS.filter((k) => !RESTAURANT_FEATURES.includes(k) && FEATURES[k].minPlan === "plus").map((k) => [k, "hidden"])))).toBe(false);
  });
});

describe("trade tools self-serve (founder decision 2026-10-27)", () => {
  it("gates only network-wide extras; every other paid feature ships live", () => {
    const gated = FEATURE_KEYS.filter((k) => FEATURES[k].networkGated).sort();
    expect(gated).toEqual(["ads.map_pin", "ads.sponsored_listing", "ads.sponsored_promo", "campaigns.neighbourhood", "promos.push_nearby"].sort());
    for (const k of FEATURE_KEYS) {
      const d = FEATURES[k];
      expect(d.defaultStage, k).toBe(d.networkGated ? "hidden" : "ga");
      if (d.networkGated) expect(d.unlockAtMerchants, k).toBeGreaterThanOrEqual(100);
      else expect(d.unlockAtMerchants, k).toBe(0);
    }
  });
  it("a new shop gets its trade tools on its plan without an override", () => {
    const stage = (k: FeatureKey) => FEATURES[k].defaultStage;
    const on = (k: FeatureKey, ctx: Omit<Parameters<typeof isFeatureEnabled>[1], "stage">) => isFeatureEnabled(k, { ...ctx, stage: stage(k) });
    expect(on("booking.appointments", { plan: "plus" })).toBe(true);
    expect(on("booking.classes", { plan: "plus" })).toBe(true);
    expect(on("booking.walkin_queue", { plan: "plus" })).toBe(true);
    expect(on("pets.daycare", { plan: "plus", vertical: "pet" })).toBe(true);
    expect(on("pets.daycare", { plan: "plus", vertical: "cafe" })).toBe(false);
    expect(on("orders.order_ahead", { plan: "free", restaurantTier: "starter" })).toBe(true);
    expect(on("restaurant.tiffin", { plan: "free", restaurantTier: "starter" })).toBe(false);
    expect(on("restaurant.tiffin", { plan: "free", restaurantTier: "growth" })).toBe(true);
    expect(on("service.tickets", { plan: "pro" })).toBe(true);
    // network extras stay shut, even on Pro, until an admin flips them
    expect(on("ads.sponsored_promo", { plan: "pro" })).toBe(false);
    expect(on("campaigns.neighbourhood", { plan: "pro" })).toBe(false);
  });
  it("appointments are free for every trade now, pharmacies included; classes stay paid", () => {
    expect(isFeatureEnabled("booking.appointments", { plan: "free", stage: "ga", vertical: "pharmacy" })).toBe(true);
    expect(isFeatureEnabled("booking.appointments", { plan: "free", stage: "ga", vertical: "salon" })).toBe(true);
    expect(isFeatureEnabled("booking.classes", { plan: "free", stage: "ga", vertical: "pharmacy" })).toBe(false);
  });
});

describe("featureOffer: the plan, price and checkout a locked feature points at", () => {
  it("names the real plan for each kind of feature", () => {
    expect(featureOffer("booking.appointments")).toEqual({ kind: "free" });
    expect(featureOffer("promos.basic")).toMatchObject({ kind: "plan", plan: "plus", name: "Pro", priceCents: 3900 });
    expect(featureOffer("promos.basic")).not.toHaveProperty("interval");
    expect(featureOffer("site.builder")).toEqual({ kind: "plan", plan: "plus", name: "Pro", priceCents: 39000, interval: "year" });
    expect(featureOffer("service.tickets")).toMatchObject({ kind: "plan", plan: "pro", name: "Service", priceCents: 9900 });
    // Tiffin and catering are Growth ($199), not Starter ($99); banquet is Pro ($349).
    expect(featureOffer("restaurant.tiffin")).toMatchObject({ kind: "restaurant", tier: "growth", priceCents: 19900 });
    expect(featureOffer("restaurant.catering")).toMatchObject({ kind: "restaurant", tier: "growth", priceCents: 19900 });
    expect(featureOffer("restaurant.banquet")).toMatchObject({ kind: "restaurant", tier: "pro", priceCents: 34900 });
    expect(featureOffer("restaurant.dietary_tags")).toMatchObject({ kind: "restaurant", tier: "starter", priceCents: 9900 });
    expect(featureOffer("ads.sponsored_promo")).toMatchObject({ kind: "network", unlockAtMerchants: 300 });
    expect(featureOffer("campaigns.neighbourhood")).toMatchObject({ kind: "network", unlockAtMerchants: 100 });
    expect(featureOffer("loyalty.points")).toEqual({ kind: "free" });
  });
});
