import { describe, expect, it } from "vitest";
import { isValidGstHstNumber, salesTaxBps } from "../src/index.js";

describe("salesTaxBps", () => {
  it("returns the provincial rate for registered and unasked merchants", () => {
    expect(salesTaxBps({ province: "ON", taxRegistered: true })).toBe(1300);
    expect(salesTaxBps({ province: "ON", taxRegistered: null })).toBe(1300);
    expect(salesTaxBps({ province: "bc" })).toBe(1200);
    expect(salesTaxBps({ province: "AB", taxRegistered: true })).toBe(500);
  });
  it("is zero when not registered", () => {
    expect(salesTaxBps({ province: "ON", taxRegistered: false })).toBe(0);
  });
  it("defaults unknown provinces to ON", () => {
    expect(salesTaxBps({ province: "ZZ", taxRegistered: true })).toBe(1300);
    expect(salesTaxBps({ province: null, taxRegistered: true })).toBe(1300);
  });
});
describe("isValidGstHstNumber", () => {
  it("checks the 9 digit + RT format", () => {
    expect(isValidGstHstNumber("123456789RT0001")).toBe(true);
    expect(isValidGstHstNumber("123456789")).toBe(true);
    expect(isValidGstHstNumber("12345")).toBe(false);
  });
});
