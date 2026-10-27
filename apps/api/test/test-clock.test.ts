import { describe, expect, it } from "vitest";
import { promoClockAt } from "../src/lib/testClock.js";

describe("promo test clock", () => {
  const real = new Date("2026-10-27T15:00:00Z"); // a Tuesday
  it("is off unless TEST_PROMO_NOW is set", () => {
    expect(promoClockAt(real, {})).toBe(real);
  });
  it("pins the instant when set", () => {
    expect(promoClockAt(real, { TEST_PROMO_NOW: "2026-01-07T16:00:00Z" }).toISOString()).toBe("2026-01-07T16:00:00.000Z");
  });
  it("is ignored in production and for a bad value", () => {
    expect(promoClockAt(real, { NODE_ENV: "production", TEST_PROMO_NOW: "2026-01-07T16:00:00Z" })).toBe(real);
    expect(promoClockAt(real, { TEST_PROMO_NOW: "nope" })).toBe(real);
  });
});
