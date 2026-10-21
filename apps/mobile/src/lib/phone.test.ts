import { describe, expect, it } from "vitest";
import { applyPhoneEdit, displayPhone, formatNanp, isValidNanp, maskMiddle, sanitizePhoneInput, toE164, validateNanp } from "./phone";

describe("formatNanp (system.md PhoneField examples)", () => {
  it.each([
    ["", ""],
    ["4", "(4"],
    ["416", "(416"],
    ["4165", "(416) 5"],
    ["416555", "(416) 555"],
    ["4165550", "(416) 555-0"],
    ["4165550123", "(416) 555-0123"],
  ])("%s → %s", (digits, out) => expect(formatNanp(digits)).toBe(out));

  it("caps at 10 digits", () => expect(formatNanp("41655501239")).toBe("(416) 555-0123"));
});

describe("sanitizePhoneInput (paste / autofill)", () => {
  it.each([
    ["+1 416-555-0123", "4165550123"],
    ["416.555.0123", "4165550123"],
    ["14165550123", "4165550123"],
    ["(416) 555-0123", "4165550123"],
    ["416 555 0123 ext 9", "4165550123"],
  ])("%s → %s", (input, out) => expect(sanitizePhoneInput(input)).toBe(out));
});

describe("validateNanp", () => {
  it("needs exactly 10 digits", () => {
    expect(validateNanp("416555")).toBe("incomplete");
    expect(validateNanp("")).toBe("incomplete");
  });
  it("rejects area codes and exchanges starting with 0 or 1", () => {
    expect(validateNanp("0165550123")).toBe("invalid");
    expect(validateNanp("1165550123")).toBe("invalid");
    expect(validateNanp("4160550123")).toBe("invalid");
    expect(validateNanp("4161550123")).toBe("invalid");
  });
  it("accepts a normal Toronto number", () => {
    expect(validateNanp("4165550123")).toBeNull();
    expect(isValidNanp("6475550199")).toBe(true);
  });
});

describe("toE164", () => {
  it("emits +1 E.164", () => expect(toE164("4165550123")).toBe("+14165550123"));
  it("accepts formatted and 11-digit input", () => {
    expect(toE164("(416) 555-0123")).toBe("+14165550123");
    expect(toE164("1-416-555-0123")).toBe("+14165550123");
  });
  it("returns null when invalid", () => {
    expect(toE164("555-0123")).toBeNull();
    expect(toE164("0165550123")).toBeNull();
  });
});

describe("applyPhoneEdit (caret stays at the end; backspace over a format char deletes a digit)", () => {
  it("typing appends", () => expect(applyPhoneEdit("416", "(4165")).toBe("4165"));
  it("backspace over ') ' removes the previous digit", () => {
    // "(416) 5" → user deletes "5" → "(416) " ; then deletes " " → "(416)" which has the same digits
    expect(applyPhoneEdit("4165", "(416) ")).toBe("416");
    // caret placed after ")" and backspace: digits unchanged, so the digit before it goes
    expect(applyPhoneEdit("4165", "(416 5")).toBe("416");
  });
  it("backspace over '-' removes the previous digit", () => expect(applyPhoneEdit("4165550", "(416) 555-")).toBe("416555"));
  it("paste replaces", () => expect(applyPhoneEdit("", "+1 416-555-0123")).toBe("4165550123"));
});

describe("display helpers", () => {
  it("displayPhone formats E.164", () => expect(displayPhone("+14165550123")).toBe("(416) 555-0123"));
  it("maskMiddle hides the middle digits", () => expect(maskMiddle("+14165550123")).toBe("(416) •••-••23"));
});
