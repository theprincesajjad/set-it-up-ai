import { describe, expect, it } from "vitest";
import { translator } from "@ll/shared";
import { rewardNameIn } from "../src/lib/i18n/rewardName";

describe("rewardNameIn", () => {
  it("leaves English as written", () => {
    expect(rewardNameIn("en", translator("en"), "Free appetizer")).toBe("Free appetizer");
  });
  it("translates template names in Urdu, Hindi and Punjabi", () => {
    expect(rewardNameIn("ur", translator("ur"), "$10 off")).toBe("$10 کی رعایت");
    expect(rewardNameIn("hi", translator("hi"), "Free appetizer")).toBe("मुफ़्त स्टार्टर");
    expect(rewardNameIn("pa", translator("pa"), "15% off")).toBe("15% ਛੋਟ");
    expect(rewardNameIn("ur", translator("ur"), "Free masala chai")).toBe("مفت مصالحہ چائے");
  });
  it("keeps a name the owner wrote themselves", () => {
    expect(rewardNameIn("ur", translator("ur"), "Free biryani raita")).toBe("Free biryani raita");
    expect(rewardNameIn("hi", translator("hi"), "$10 off a service")).toBe("$10 off a service");
  });
});
