import { describe, expect, it } from "vitest";
import { MAX_DRAWN_STAMPS, stampCardNumbers, stampCols } from "@/lib/stamps";

describe("stamp card numbers (wave-n final audit)", () => {
  it("never clamps the goal: a 15-stamp card is 15, not 12", () => {
    expect(stampCardNumbers(0, 15)).toMatchObject({ goal: 15, onCard: 0, toGo: 15, ready: false, drawn: true });
    expect(stampCardNumbers(12, 15)).toMatchObject({ onCard: 12, toGo: 3, ready: false });
    expect(stampCardNumbers(15, 15)).toMatchObject({ onCard: 15, toGo: 0, ready: true });
  });
  it("counts to a tier below the goal first, then to the card's reward", () => {
    expect(stampCardNumbers(1, 15, 5)).toMatchObject({ onCard: 1, toGo: 4 });
    expect(stampCardNumbers(5, 15, 15)).toMatchObject({ onCard: 5, toGo: 10 });
    expect(stampCardNumbers(5, 15, null)).toMatchObject({ toGo: 10 });
  });
  it("a full card stays full until redeemed; extra stamps carry", () => {
    expect(stampCardNumbers(17, 15)).toMatchObject({ onCard: 15, ready: true, toGo: 0 });
  });
  it("draws circles up to MAX_DRAWN_STAMPS, a bar above it, in tidy rows", () => {
    expect(stampCardNumbers(3, MAX_DRAWN_STAMPS).drawn).toBe(true);
    expect(stampCardNumbers(3, 50).drawn).toBe(false);
    expect([6, 8, 10, 12, 15, 20].map(stampCols)).toEqual([6, 4, 5, 6, 5, 5]);
  });
});
