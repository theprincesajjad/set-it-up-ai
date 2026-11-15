import { describe, expect, it } from "vitest";
import { changeChip, DELTA_MIN_BASE } from "../src/lib/dashboard/time";

describe("changeChip (the growth chip on the reports page)", () => {
  it("shows a percentage when the earlier period is big enough to mean something", () => {
    expect(changeChip(120, 100)).toEqual({ text: "+20%", direction: 1 });
    expect(changeChip(80, 100)).toEqual({ text: "-20%", direction: -1 });
    expect(changeChip(50, 50)).toEqual({ text: "0%", direction: 0 });
  });
  it("shows the plain change off a tiny base, never +1933%", () => {
    expect(changeChip(61, 3)).toEqual({ text: "+58", direction: 1 });
    expect(changeChip(31, 1)).toEqual({ text: "+30", direction: 1 });
    expect(changeChip(2, DELTA_MIN_BASE - 1)).toEqual({ text: "-7", direction: -1 });
  });
  it("shows the plain change past +500% even from a normal base", () => {
    expect(changeChip(700, 100)).toEqual({ text: "+600", direction: 1 });
  });
  it("says nothing when there is no earlier period to compare with", () => {
    expect(changeChip(12, 0)).toBeNull();
    expect(changeChip(0, 0)).toEqual({ text: "0%", direction: 0 });
  });
});
