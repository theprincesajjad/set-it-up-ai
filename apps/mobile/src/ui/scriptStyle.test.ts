import { describe, expect, it } from "vitest";
import { mayHoldUrdu, scriptStyle, URDU_MIN_LINE_HEIGHT } from "./scriptStyle";

describe("scriptStyle", () => {
  it("leaves English, Hindi and Punjabi text alone", () => {
    for (const l of ["en", "hi", "pa"] as const) expect(scriptStyle(l, { fontSize: 14, lineHeight: 18 })).toBeNull();
  });

  it("gives Urdu at least 1.7 times the font size, never less than the style asked for", () => {
    expect(URDU_MIN_LINE_HEIGHT).toBe(1.7);
    expect(scriptStyle("ur", { fontSize: 13, lineHeight: 17 })?.lineHeight).toBe(22);
    expect(scriptStyle("ur", { fontSize: 11, lineHeight: 14 })?.lineHeight).toBe(19);
    expect(scriptStyle("ur", { fontSize: 14, lineHeight: 40 })?.lineHeight).toBe(40);
    expect(scriptStyle("ur", { fontSize: 20 })?.lineHeight).toBe(34);
  });

  it("switches off letter-spacing (it breaks Arabic-script joins) and italics", () => {
    expect(scriptStyle("ur", { fontSize: 15, lineHeight: 18 })).toMatchObject({ letterSpacing: 0, fontStyle: "normal" });
  });

  it("skips Latin codes and numbers, which keep the spacing they were designed with", () => {
    expect(scriptStyle("ur", { fontSize: 28, lineHeight: 34 }, "YDKM J5DN")).toBeNull();
    expect(scriptStyle("ur", { fontSize: 28, lineHeight: 34 }, 394)).toBeNull();
    expect(scriptStyle("ur", { fontSize: 14, lineHeight: 18 }, "ریڈیم کریں")).not.toBeNull();
    expect(mayHoldUrdu(["5 ", "اسٹامپ"])).toBe(true);
    expect(mayHoldUrdu(["Nonna's Table"])).toBe(false);
    expect(mayHoldUrdu({ type: "span" })).toBe(true);
  });
});
