import { describe, expect, it } from "vitest";
import { bookingLogic, isValidGstHstNumber, salesTaxBps, salesTaxCopy } from "../src/index.js";

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

describe("salesTaxCopy", () => {
  it("says tax only for a registered shop, with the province's name for it", () => {
    expect(salesTaxCopy({ province: "ON", taxRegistered: true })).toEqual({ applies: true, name: "HST" });
    expect(salesTaxCopy({ province: "QC", taxRegistered: true })).toEqual({ applies: true, name: "GST + QST" });
    expect(salesTaxCopy({ province: "AB", taxRegistered: true })).toEqual({ applies: true, name: "GST" });
    expect(salesTaxCopy({ province: "ON", taxRegistered: false }).applies).toBe(false);
    expect(salesTaxCopy({ province: "ON", taxRegistered: null }).applies).toBe(false);
    expect(salesTaxCopy({ taxRegistered: true }).name).toBe("HST");
  });
});

describe("booking total line", () => {
  const t = (k: string, v: Record<string, string>) => (k === "bk.totalPlus" ? `${v.amount} plus ${v.tax}` : k === "bk.from" ? `from ${v.price}` : v.amount!);
  const money = (c: number) => `$${c / 100}`;
  it("adds plus HST only for a registered shop and a taxable service", () => {
    const hst = { tax: { applies: true, name: "HST" } };
    expect(bookingLogic.totalText(t as never, hst, { priceCents: 6500, from: false, taxable: true }, money)).toBe("$65 plus HST");
    expect(bookingLogic.totalText(t as never, hst, { priceCents: 14500, from: true, taxable: true }, money)).toBe("from $145 plus HST");
    expect(bookingLogic.totalText(t as never, hst, { priceCents: 5000, from: false, taxable: false }, money)).toBe("$50");
    expect(bookingLogic.totalText(t as never, { tax: { applies: false, name: "HST" } }, { priceCents: 6500, from: false, taxable: true }, money)).toBe("$65");
  });
});
