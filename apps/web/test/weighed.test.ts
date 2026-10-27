import { describe, expect, it } from "vitest";
import { isWeighedLine, noticeDays, portionLabel } from "../src/lib/restaurant/weighed";

describe("weighed lines", () => {
  it("knows a cut sold by weight from a whole-animal booking", () => {
    expect(isWeighedLine({ weightUnit: "kg", unitPriceCents: 1399, nominalWeightG: 1000, preorderOnly: false })).toBe(true);
    expect(isWeighedLine({ weightUnit: "kg", unitPriceCents: 2400, nominalWeightG: 20000, preorderOnly: true })).toBe(false);
    expect(isWeighedLine({ weightUnit: null, unitPriceCents: null, nominalWeightG: null })).toBe(false);
  });
  it("names a portion in the shop's unit", () => {
    expect(portionLabel(500, "kg")).toBe("500 g");
    expect(portionLabel(1000, "kg")).toBe("1 kg");
    expect(portionLabel(1500, "kg")).toBe("1.5 kg");
    expect(portionLabel(907, "lb")).toBe("2 lb");
  });
  it("says notice in days only when it is whole days", () => {
    expect(noticeDays(336)).toBe(14);
    expect(noticeDays(72)).toBe(3);
    expect(noticeDays(24)).toBeNull();
    expect(noticeDays(36)).toBeNull();
  });
});
