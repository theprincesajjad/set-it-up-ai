import { describe, expect, it } from "vitest";
import { capFirst, sentenceCase } from "./sentenceCase";

describe("sentenceCase", () => {
  it("uppercases the first letter of a plain string", () => {
    expect(capFirst("ready now")).toBe("Ready now");
    expect(capFirst("")).toBe("");
  });
  it("leaves scripts without case alone", () => {
    expect(capFirst("والٹ")).toBe("والٹ");
    expect(capFirst("वॉलेट")).toBe("वॉलेट");
  });
  it("handles children: a string, an array starting with a string, anything else untouched", () => {
    expect(sentenceCase("wallet")).toBe("Wallet");
    expect(sentenceCase(["near ", 3])).toEqual(["Near ", 3]);
    expect(sentenceCase(42)).toBe(42);
  });
});
