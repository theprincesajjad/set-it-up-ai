import { describe, expect, it } from "vitest";
import type { FeatureKey } from "@ll/shared";
import { buildMerchantNav } from "@/lib/dashboard/nav";

const nav = (enabled: FeatureKey[], vertical: string, plan: "free" | "pro" = "free", stages?: Partial<Record<FeatureKey, string>>) =>
  buildMerchantNav("/m/x", "owner", new Set(enabled), { vertical, plan, stages }).map((n) => n.key);

const PAID: FeatureKey[] = ["promos.basic", "marketing.sms", "discount_cards", "service.tickets", "orders.order_ahead", "ads.map_pin", "campaigns.neighbourhood"];

describe("nav gating by vertical", () => {
  it("a café sees loyalty sections and no service, ordering or ad sections on a loyalty plan", () => {
    const k = nav(PAID, "cafe", "free", { "ads.map_pin": "beta", "campaigns.neighbourhood": "beta" });
    expect(k).toEqual(expect.arrayContaining(["home", "counter", "customers", "program", "promos", "messages", "reports"]));
    expect(k).not.toContain("tickets");
    expect(k).not.toContain("orders");
    expect(k).not.toContain("catalog");
    expect(k).not.toContain("discount-cards");
    expect(k).not.toContain("ads");
    expect(k).not.toContain("campaigns");
    expect(k).not.toContain("settings");
  });
  it("a pharmacy shows Discount cards", () => {
    expect(nav(PAID, "pharmacy")).toContain("discount-cards");
  });
  it("a repair shop shows tickets and no calendar", () => {
    const k = nav([...PAID, "booking.appointments"], "repair_electronics");
    expect(k).toContain("tickets");
    expect(k).not.toContain("calendar");
  });
  it("ads and campaigns appear once their stage is ga", () => {
    const k = nav(PAID, "cafe", "free", { "ads.map_pin": "ga", "campaigns.neighbourhood": "ga" });
    expect(k).toContain("ads");
    expect(k).toContain("campaigns");
  });
});
