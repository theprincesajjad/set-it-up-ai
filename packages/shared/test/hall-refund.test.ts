import { describe, expect, it } from "vitest";
import { restaurantApi } from "../src/api/index.js";

const { DEFAULT_HALL_REFUND_POLICY, hallRefundBps, hallRefundPolicy, depositRefundChoice, cateringCancelBody, cancelHallBookingBody } = restaurantApi;
const event = new Date("2026-12-12T17:00:00Z");
const daysBefore = (d: number) => new Date(event.getTime() - d * 86_400_000);

describe("hallRefundBps", () => {
  it("applies the default policy: full from 30 days, half from 14, none after", () => {
    expect(hallRefundBps(DEFAULT_HALL_REFUND_POLICY, event, daysBefore(60))).toBe(10_000);
    expect(hallRefundBps(DEFAULT_HALL_REFUND_POLICY, event, daysBefore(30))).toBe(10_000);
    expect(hallRefundBps(DEFAULT_HALL_REFUND_POLICY, event, daysBefore(29.9))).toBe(5_000);
    expect(hallRefundBps(DEFAULT_HALL_REFUND_POLICY, event, daysBefore(14))).toBe(5_000);
    expect(hallRefundBps(DEFAULT_HALL_REFUND_POLICY, event, daysBefore(13.9))).toBe(0);
    expect(hallRefundBps(DEFAULT_HALL_REFUND_POLICY, event, daysBefore(-1))).toBe(0);
  });

  it("doesn't depend on tier order, accepts ISO strings, and an empty policy never refunds", () => {
    const shuffled = { tiers: [{ minDaysBefore: 7, refundBps: 2_500 }, { minDaysBefore: 60, refundBps: 10_000 }, { minDaysBefore: 21, refundBps: 5_000 }] };
    expect(hallRefundBps(shuffled, event.toISOString(), daysBefore(40))).toBe(5_000);
    expect(hallRefundBps(shuffled, event, daysBefore(8))).toBe(2_500);
    expect(hallRefundBps({ tiers: [] }, event, daysBefore(365))).toBe(0);
  });

  it("a minDaysBefore of 0 refunds right up to the start", () => {
    expect(hallRefundBps({ tiers: [{ minDaysBefore: 0, refundBps: 10_000 }] }, event, new Date(event.getTime() - 1000))).toBe(10_000);
  });
});

describe("refund contracts", () => {
  it("validates the policy: unique days, basis points in range, at most five tiers", () => {
    expect(hallRefundPolicy.safeParse(DEFAULT_HALL_REFUND_POLICY).success).toBe(true);
    expect(hallRefundPolicy.safeParse({ tiers: [{ minDaysBefore: 7, refundBps: 1 }, { minDaysBefore: 7, refundBps: 2 }] }).success).toBe(false);
    expect(hallRefundPolicy.safeParse({ tiers: [{ minDaysBefore: 7, refundBps: 10_001 }] }).success).toBe(false);
    expect(hallRefundPolicy.safeParse({ tiers: Array.from({ length: 6 }, (_, i) => ({ minDaysBefore: i, refundBps: 0 })) }).success).toBe(false);
  });

  it("the refund choice is full, none or a positive amount; cancelling defaults to none", () => {
    for (const ok of ["full", "none", { amountCents: 1 }]) expect(depositRefundChoice.safeParse(ok).success).toBe(true);
    for (const bad of ["half", { amountCents: 0 }, { amountCents: 1.5 }, {}, 5]) expect(depositRefundChoice.safeParse(bad).success).toBe(false);
    expect(cateringCancelBody.parse({}).refund).toBe("none");
    expect(cancelHallBookingBody.parse({}).refund).toBe("none");
    expect(cancelHallBookingBody.parse({ refund: { amountCents: 500 } }).refund).toEqual({ amountCents: 500 });
  });

  it("a hall PATCH body keeps unspecified fields unset (no defaults leaking in)", () => {
    expect(restaurantApi.updateHallBody.parse({ active: false })).toEqual({ active: false });
  });
});
