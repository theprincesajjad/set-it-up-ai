import { translator } from "@ll/shared";
import { describe, expect, it } from "vitest";
import { clockIn, isolate } from "../src/lib/restaurant/kitchenText";

describe("kitchen text in the cook's language", () => {
  const at = "2026-11-14T19:15:00Z"; // 2:15 pm in Toronto
  it("keeps 12-hour am/pm for English and uses 24-hour digits elsewhere", () => {
    expect(clockIn("en", at)).toBe("2:15 pm");
    expect(clockIn("ur", at)).toBe("14:15");
    expect(clockIn("hi", at)).toBe("14:15");
    expect(clockIn("pa", at)).toBe("14:15");
  });
  it("isolates a time inside an Urdu sentence and leaves English alone", () => {
    expect(isolate("ur", "14:15")).toBe("⁨14:15⁩");
    expect(isolate("en", "14:15")).toBe("14:15");
  });
  it("the FIRE band reads as one Urdu sentence with each time isolated", () => {
    const tr = translator("ur");
    const band = tr("kitchen.fireBand", { time: isolate("ur", "14:15"), min: isolate("ur", 210), pickup: isolate("ur", "17:45") });
    expect(band).toContain("⁨14:15⁩");
    expect(band).toContain("⁨210⁩");
    expect(band).not.toMatch(/\b[AP]M\b/);
  });
});
