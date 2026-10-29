import { describe, expect, it } from "vitest";
import {
  ANNUAL_INCLUDES_WEBSITE,
  FEATURES,
  FEATURE_KEYS,
  FIRST_YEAR_PRICE,
  FREE_BOOKABLE_CALENDARS,
  FREE_FOREVER,
  FREE_REMINDER_SMS_PER_MONTH,
  PAID_FEATURES,
  PLANS,
  PLAN_IDS,
  PLAN_RANK,
  PRO_BOOKABLE_CALENDARS,
  PROMOS_PER_MONTH_PLUS,
  PROMOS_PER_MONTH_STUDIO,
  PROMOS_PER_YEAR_ANNUAL,
  PROMOS_PER_YEAR_STUDIO_ANNUAL,
  SITE_AI_EDITS_PER_MONTH,
  SITE_AI_GENERATIONS_PER_MONTH,
  SMS_OVERAGE_CENTS,
  TRIAL_DAYS,
  TRIAL_PLAN,
  TRIAL_SMS_CAP,
  bookableCalendarLimit,
  effectivePlan,
  featureOffer,
  firstYearPriceConfig,
  firstYearPriceShown,
  firstYearPriceSpotsLeft,
  isFeatureEnabled,
  isFirstYearPriceEligible,
  isPlanAvailable,
  liveTrialPlan,
  promoAllowance,
  showsPoweredBy,
  trialActive,
  trialDaysLeft,
  trialEndsAt,
  type FeatureKey,
} from "../src/index.js";

describe("solo pro packaging (solo-pro-launch.md §3.2)", () => {
  it("states the constants the other workstreams read", () => {
    expect(FREE_BOOKABLE_CALENDARS).toBe(1);
    expect(PLANS.free.smsPerMonth).toBe(30);
    expect(FREE_REMINDER_SMS_PER_MONTH).toBe(30);
    expect(PLANS.plus.smsPerMonth).toBe(300);
    expect(PLANS.studio.smsPerMonth).toBe(1000);
    expect(PLANS.pro.smsPerMonth).toBe(1500);
    expect(SMS_OVERAGE_CENTS).toBe(4);
    expect(PROMOS_PER_MONTH_PLUS).toBe(4);
    expect(PROMOS_PER_YEAR_ANNUAL).toBe(48);
    expect(ANNUAL_INCLUDES_WEBSITE).toBe(true);
    expect(SITE_AI_GENERATIONS_PER_MONTH).toBe(10);
    expect(SITE_AI_EDITS_PER_MONTH).toBe(40);
    expect(PLANS.plus.priceCents).toBe(2900);
    expect(PLANS.plus.annualPriceCents).toBe(29000);
    expect(PLANS.studio).toMatchObject({ name: "Studio", priceCents: 5900, annualPriceCents: 59000 });
  });

  it("gates appointments only by the calendar cap: free, not free forever, one calendar on Free", () => {
    expect(FEATURES["booking.appointments"].minPlan).toBe("free");
    expect(FREE_FOREVER).not.toContain("booking.appointments");
    for (const plan of PLAN_IDS) expect(isFeatureEnabled("booking.appointments", { plan, stage: "ga" })).toBe(true);
    expect(bookableCalendarLimit("free")).toBe(1);
    expect(bookableCalendarLimit("plus")).toBe(2);
    expect(PRO_BOOKABLE_CALENDARS).toBe(2);
    expect(bookableCalendarLimit("studio")).toBeNull();
    expect(bookableCalendarLimit("pro")).toBeNull();
    // A restaurant tier includes Studio, so no cap; a live trial counts as Pro.
    expect(bookableCalendarLimit("free", "starter")).toBeNull();
    expect(bookableCalendarLimit("free", null, "plus")).toBe(2);
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
  it("gives Studio and Service 8 a month and 96 a year", () => {
    expect(PROMOS_PER_MONTH_STUDIO).toBe(8);
    expect(PROMOS_PER_YEAR_STUDIO_ANNUAL).toBe(96);
    for (const plan of ["studio", "pro"] as const) {
      expect(promoAllowance({ plan, interval: "month", sentCount: 0, sentPeriodStart: null, periodStart }).limit).toBe(8);
      expect(promoAllowance({ plan, interval: "year", sentCount: 0, sentPeriodStart: null, periodStart }).limit).toBe(96);
    }
  });
  it("counts a restaurant tier as Studio", () => {
    expect(promoAllowance({ plan: "free", restaurantTier: "starter", interval: "month", sentCount: 0, sentPeriodStart: null, periodStart }).limit).toBe(8);
  });
  it("gives a live trial Pro's monthly allowance", () => {
    expect(promoAllowance({ plan: "free", trialPlan: "plus", sentCount: 1, sentPeriodStart: periodStart, periodStart })).toMatchObject({ limit: 4, used: 1, period: "month" });
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

describe("first-year price (founder decision, Oct 29 2026)", () => {
  it("defaults on: $199 for the first year of annual Pro, 200 shops, every trade", () => {
    expect(FIRST_YEAR_PRICE).toMatchObject({ enabled: true, priceCents: 19900, slots: 200, verticals: null });
    expect(firstYearPriceConfig({})).toEqual(FIRST_YEAR_PRICE);
    expect(firstYearPriceShown(FIRST_YEAR_PRICE, 200)).toBe(true);
    expect(firstYearPriceShown(FIRST_YEAR_PRICE, 0)).toBe(false);
  });
  it("can be changed, narrowed or turned off by config", () => {
    expect(firstYearPriceConfig({ FIRST_YEAR_PRICE_ENABLED: "false" }).enabled).toBe(false);
    expect(firstYearPriceConfig({ FIRST_YEAR_PRICE_ENABLED: "0" }).enabled).toBe(false);
    expect(firstYearPriceConfig({ FIRST_YEAR_PRICE_ENABLED: "true" }).enabled).toBe(true);
    expect(firstYearPriceConfig({ FIRST_YEAR_PRICE_CENTS: "25000", FIRST_YEAR_PRICE_SLOTS: "50" })).toMatchObject({ priceCents: 25000, slots: 50 });
    expect(firstYearPriceConfig({ FIRST_YEAR_PRICE_CENTS: "abc", FIRST_YEAR_PRICE_SLOTS: "-1" })).toMatchObject({ priceCents: 19900, slots: 200 });
    expect([...(firstYearPriceConfig({ FIRST_YEAR_PRICE_VERTICALS: "solo" }).verticals ?? [])].sort()).toEqual(["barber", "brows_lashes", "makeup", "nails", "salon"]);
    expect(firstYearPriceConfig({ FIRST_YEAR_PRICE_VERTICALS: "nails, barber" }).verticals).toEqual(["nails", "barber"]);
    // Not cheaper than the list price: not shown.
    expect(firstYearPriceShown(firstYearPriceConfig({ FIRST_YEAR_PRICE_CENTS: "29000" }), 10)).toBe(false);
  });
  it("counts spots and eligibility", () => {
    expect(firstYearPriceSpotsLeft(0)).toBe(200);
    expect(firstYearPriceSpotsLeft(199)).toBe(1);
    expect(firstYearPriceSpotsLeft(250)).toBe(0);
    expect(firstYearPriceSpotsLeft(0, firstYearPriceConfig({ FIRST_YEAR_PRICE_ENABLED: "off" }))).toBe(0);
    expect(isFirstYearPriceEligible({ vertical: "nails" }, 10)).toBe(true);
    expect(isFirstYearPriceEligible({ vertical: "cafe" }, 0)).toBe(true);
    expect(isFirstYearPriceEligible({ vertical: "barber" }, 199)).toBe(true);
    expect(isFirstYearPriceEligible({ vertical: "barber" }, 200)).toBe(false);
    expect(isFirstYearPriceEligible({ vertical: "nails", used: true }, 0)).toBe(false);
    expect(isFirstYearPriceEligible({ vertical: "nails" }, 0, firstYearPriceConfig({ FIRST_YEAR_PRICE_ENABLED: "false" }))).toBe(false);
    expect(isFirstYearPriceEligible({ vertical: "cafe" }, 0, firstYearPriceConfig({ FIRST_YEAR_PRICE_VERTICALS: "solo" }))).toBe(false);
  });
});

describe("two paid tiers: Pro and Studio (pro-value.md §2.2)", () => {
  it("ranks Free < Pro < Studio < Service", () => {
    expect(PLAN_IDS).toEqual(["free", "plus", "studio", "pro"]);
    expect([...PLAN_IDS].sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b])).toEqual(["free", "plus", "studio", "pro"]);
    expect(PLANS.plus.name).toBe("Pro");
    expect(PLANS.studio.name).toBe("Studio");
    expect(PLANS.pro.name).toBe("Service");
  });
  const studioKeys: FeatureKey[] = [
    "booking.walkin_queue", "staff.payouts", "orders.order_ahead", "orders.pickup_status", "booking.pickup_slots", "integrations.pos_auto_award",
    "integrations.webhooks", "pets.daycare", "grocery.flyer", "grocery.counter_preorders", "grocery.pantry_reminders", "grocery.whatsapp_orders",
  ];
  it("offers Studio at its price for the shop features", () => {
    for (const k of studioKeys) {
      expect(FEATURES[k].minPlan, k).toBe("studio");
      expect(featureOffer(k), k).toEqual({ kind: "plan", plan: "studio", name: "Studio", priceCents: 5900 });
      expect(PAID_FEATURES, k).toContain(k);
    }
    expect(isPlanAvailable("studio", {})).toBe(true);
  });
  it("puts the four money features on Pro", () => {
    for (const k of ["booking.waitlist", "booking.review_requests", "booking.add_ons", "insights.weekly"] as const) {
      expect(FEATURE_KEYS, k).toContain(k);
      expect(FEATURES[k].minPlan, k).toBe("plus");
      expect(featureOffer(k), k).toMatchObject({ kind: "plan", plan: "plus", priceCents: 2900 });
      expect(isFeatureEnabled(k, { plan: "free", stage: "ga" }), k).toBe(false);
      expect(isFeatureEnabled(k, { plan: "plus", stage: "ga" }), k).toBe(true);
    }
  });
  it("lists every feature key once (workstreams add keys in parallel)", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });
  it("leaves Free forever untouched", () => {
    for (const k of FREE_FOREVER) expect(FEATURES[k].minPlan, k).toBe("free");
    expect(FREE_FOREVER).toHaveLength(14);
  });
});

describe("the 14-day Pro trial", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const live = { trialPlan: "plus", trialEndsAt: "2026-11-15T12:00:00Z" };
  const over = { trialPlan: "plus", trialEndsAt: "2026-11-09T12:00:00Z" };
  it("states the constants", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_PLAN).toBe("plus");
    expect(TRIAL_SMS_CAP).toBe(100);
    expect(trialEndsAt(new Date("2026-11-01T00:00:00Z")).toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
  it("is on until trial_ends_at, then off", () => {
    expect(trialActive(live, now)).toBe(true);
    expect(trialActive(over, now)).toBe(false);
    expect(trialActive({}, now)).toBe(false);
    expect(liveTrialPlan(live, now)).toBe("plus");
    expect(liveTrialPlan(over, now)).toBeNull();
    expect(trialDaysLeft(live.trialEndsAt, now)).toBe(5);
    expect(trialDaysLeft(over.trialEndsAt, now)).toBe(0);
  });
  it("turns Pro features on while live and off after it ends", () => {
    expect(isFeatureEnabled("booking.waitlist", { plan: "free", stage: "ga", trialPlan: liveTrialPlan(live, now) })).toBe(true);
    expect(isFeatureEnabled("booking.waitlist", { plan: "free", stage: "ga", trialPlan: liveTrialPlan(over, now) })).toBe(false);
    // The trial is Pro, not Studio.
    expect(isFeatureEnabled("booking.walkin_queue", { plan: "free", stage: "ga", trialPlan: "plus" })).toBe(false);
    expect(effectivePlan("free", null, "plus")).toBe("plus");
    // Never lowers a better plan.
    expect(effectivePlan("studio", null, "plus")).toBe("studio");
    expect(showsPoweredBy("free", null, "plus")).toBe(false);
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
