import { describe, expect, it } from "vitest";
import { rewardInSentence, signed } from "./format";

describe("signed", () => {
  it("uses a real minus sign", () => {
    expect(signed(50)).toBe("+50");
    expect(signed(-250)).toBe("−250");
    expect(signed(1610)).toBe("+1,610");
    expect(signed(0)).toBe("0");
  });
});

describe("rewardInSentence", () => {
  it("lowers a plain first word only", () => {
    expect(rewardInSentence("Free drink")).toBe("free drink");
    expect(rewardInSentence("Free drop-in class")).toBe("free drop-in class");
    expect(rewardInSentence("$10 off")).toBe("$10 off");
    expect(rewardInSentence("VIP night")).toBe("VIP night");
  });
});
