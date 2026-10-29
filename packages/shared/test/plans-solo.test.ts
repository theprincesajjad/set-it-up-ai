import { describe, expect, it } from "vitest";
import {
  ANNUAL_INCLUDES_WEBSITE,
  FEATURES,
  FOUNDING_SOLO,
  FREE_BOOKABLE_CALENDARS,
  FREE_FOREVER,
  FREE_REMINDER_SMS_PER_MONTH,
  PLANS,
  PROMOS_PER_MONTH_PLUS,
  PROMOS_PER_YEAR_ANNUAL,
  SITE_AI_EDITS_PER_MONTH,
  SITE_AI_GENERATIONS_PER_MONTH,
  SMS_OVERAGE_CENTS,
  bookableCalendarLimit,
  foundingSoloConfig,
  foundingSoloSpotsLeft,
  isFeatureEnabled,
  isFoundingSoloEligible,
  isPlanAvailable,
  promoAllowance,
} from "../src/index.js";

describe("solo pro packaging (solo-pro-launch.md §3.2)", () => {
  it("states the constants the other workstreams read", () => {
    expect(FREE_BOOKABLE_CALENDARS).toBe(1);
    expect(PLANS.free.smsPerMonth).toBe(30);
    expect(FREE_REMINDER_SMS_PER_MONTH).toBe(30);
    expect(PLANS.plus.smsPerMonth).toBe(500);
    expect(SMS_OVERAGE_CENTS).toBe(4);
    expect(PROMOS_PER_MONTH_PLUS).toBe(4);
    expect(PROMOS_PER_YEAR_ANNUAL).toBe(48);
    expect(ANNUAL_INCLUDES_WEBSITE).toBe(true);
    expect(SITE_AI_GENERATIONS_PER_MONTH).toBe(10);
    expect(SITE_AI_EDITS_PER_MONTH).toBe(40);
    expect(PLANS.plus.priceCents).toBe(3900);
    expect(PLANS.plus.annualPriceCents).toBe(39000);
  });

  it("gates appointments only by the calendar cap: free, not free forever, one calendar on Free", () => {
    expect(FEATURES["booking.appointments"].minPlan).toBe("free");
    expect(FREE_FOREVER).not.toContain("booking.appointments");
    for (const plan of ["free", "plus", "pro"] as const) expect(isFeatureEnabled("booking.appointments", { plan, stage: "ga" })).toBe(true);
    expect(bookableCalendarLimit("free")).toBe(1);
    expect(bookableCalendarLimit("plus")).toBeNull();
    expect(bookableCalendarLimit("pro")).toBeNull();
    // A restaurant tier includes Pro, so no cap.
    expect(bookableCalendarLimit("free", "starter")).toBeNull();
  });

  it("keeps Pro purchasable after appointments moved to Free", () => {
    expect(isPlanAvailable("plus", {})).toBe(true);
  });
});

describe("promo allowance", () => {
  const periodStart = "2026-11-01T00:00:00.000Z";
  it("is zero on Free", () => {
    expect(promoAllowance({ plan: "free", sentCount: 0, sentPeriodStart: null, periodStart })).toMatchObject({ limit: 0, remaining: 0, period: null });
  });
  it("gives 4 a month on Pro monthly and counts this period's sends", () => {
    const a = promoAllowance({ plan: "plus", interval: "month", sentCount: 3, sentPeriodStart: "2026-11-02T10:00:00Z", periodStart });
    expect(a).toMatchObject({ limit: 4, used: 3, remaining: 1, period: "month" });
  });
  it("resets when the billing period moves on (unused promos do not roll over)", () => {
    const a = promoAllowance({ plan: "plus", interval: "month", sentCount: 4, sentPeriodStart: "2026-10-01T00:00:00Z", periodStart });
    expect(a).toMatchObject({ limit: 4, used: 0, remaining: 4 });
  });
  it("gives 48 a year on the annual plan", () => {
    const a = promoAllowance({ plan: "plus", interval: "year", sentCount: 10, sentPeriodStart: "2026-06-01T00:00:00Z", periodStart: "2026-03-01T00:00:00Z" });
    expect(a).toMatchObject({ limit: 48, used: 10, remaining: 38, period: "year" });
  });
  it("never goes below zero", () => {
    expect(promoAllowance({ plan: "plus", interval: "month", sentCount: 9, sentPeriodStart: periodStart, periodStart }).remaining).toBe(0);
  });
  it("counts a restaurant tier as Pro", () => {
    expect(promoAllowance({ plan: "free", restaurantTier: "starter", interval: "month", sentCount: 0, sentPeriodStart: null, periodStart }).limit).toBe(4);
  });
});

describe("annual website entitlement", () => {
  it("needs the annual subscription, not just the plan", () => {
    expect(FEATURES["site.builder"].minPlan).toBe("plus");
    expect(FEATURES["site.builder"].requiresAnnual).toBe(true);
    expect(FEATURES["site.builder"].defaultStage).toBe("ga");
    expect(isFeatureEnabled("site.builder", { plan: "free", stage: "ga", annualSiteEntitled: true })).toBe(false);
    expect(isFeatureEnabled("site.builder", { plan: "plus", stage: "ga" })).toBe(false);
    expect(isFeatureEnabled("site.builder", { plan: "plus", stage: "ga", annualSiteEntitled: false })).toBe(false);
    expect(isFeatureEnabled("site.builder", { plan: "plus", stage: "ga", annualSiteEntitled: true })).toBe(true);
    expect(isFeatureEnabled("site.builder", { plan: "pro", stage: "ga", annualSiteEntitled: true })).toBe(true);
    // An admin override still wins (pilot shop).
    expect(isFeatureEnabled("site.builder", { plan: "free", stage: "ga", override: true })).toBe(true);
  });
});

describe("founding solo price", () => {
  it("defaults on: $290 for the first year, 200 spots, beauty pros and barbers", () => {
    expect(FOUNDING_SOLO).toMatchObject({ enabled: true, priceCents: 29000, slots: 200 });
    expect([...FOUNDING_SOLO.verticals].sort()).toEqual(["barber", "brows_lashes", "makeup", "nails", "salon"]);
    expect(foundingSoloConfig({})).toEqual(FOUNDING_SOLO);
  });
  it("can be changed or turned off by config", () => {
    expect(foundingSoloConfig({ FOUNDING_SOLO_ENABLED: "false" }).enabled).toBe(false);
    expect(foundingSoloConfig({ FOUNDING_SOLO_ENABLED: "0" }).enabled).toBe(false);
    expect(foundingSoloConfig({ FOUNDING_SOLO_ENABLED: "true" }).enabled).toBe(true);
    expect(foundingSoloConfig({ FOUNDING_SOLO_PRICE_CENTS: "25000", FOUNDING_SOLO_SLOTS: "50" })).toMatchObject({ priceCents: 25000, slots: 50 });
    expect(foundingSoloConfig({ FOUNDING_SOLO_PRICE_CENTS: "abc", FOUNDING_SOLO_SLOTS: "-1" })).toMatchObject({ priceCents: 29000, slots: 200 });
  });
  it("counts spots and eligibility", () => {
    expect(foundingSoloSpotsLeft(0)).toBe(200);
    expect(foundingSoloSpotsLeft(199)).toBe(1);
    expect(foundingSoloSpotsLeft(250)).toBe(0);
    expect(foundingSoloSpotsLeft(0, foundingSoloConfig({ FOUNDING_SOLO_ENABLED: "off" }))).toBe(0);
    expect(isFoundingSoloEligible({ vertical: "nails" }, 10)).toBe(true);
    expect(isFoundingSoloEligible({ vertical: "barber" }, 199)).toBe(true);
    expect(isFoundingSoloEligible({ vertical: "barber" }, 200)).toBe(false);
    expect(isFoundingSoloEligible({ vertical: "cafe" }, 0)).toBe(false);
    expect(isFoundingSoloEligible({ vertical: "nails", foundingSolo: true }, 0)).toBe(false);
    expect(isFoundingSoloEligible({ vertical: "nails" }, 0, foundingSoloConfig({ FOUNDING_SOLO_ENABLED: "false" }))).toBe(false);
  });
});

describe("powered by badge", () => {
  it("shows on Free only", async () => {
    const { showsPoweredBy } = await import("../src/index.js");
    expect(showsPoweredBy("free")).toBe(true);
    expect(showsPoweredBy("plus")).toBe(false);
    expect(showsPoweredBy("free", "starter")).toBe(false);
  });
});
