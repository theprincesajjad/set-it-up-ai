import { describe, expect, it } from "vitest";
import { legalTokens, type PlanId } from "@ll/shared";
import { FEE_KINDS, computeFees, platformFeeBpsFor } from "../src/services/fees.js";

/** The fee the legal pages state must be the fee computeFees() actually charges. */
const label = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
const plans: PlanId[] = ["free", "plus", "pro"];

describe("legal fee text matches fees.ts", () => {
  const t = legalTokens();
  it("orders", () => {
    expect(label(platformFeeBpsFor("order", "free"))).toBe(t["fee.orderFree"]);
    for (const p of plans.slice(1)) expect(label(platformFeeBpsFor("order", p))).toBe(t["fee.orderPaid"]);
    for (const tier of ["starter", "growth", "pro"] as const) expect(label(platformFeeBpsFor("order", "free", tier))).toBe(t["fee.orderPaid"]);
  });
  it("deposits, invoices, tiffin, appointment checkout, manual payments", () => {
    for (const p of plans) {
      expect(label(platformFeeBpsFor("deposit", p))).toBe(t["fee.depositInvoice"]);
      expect(label(platformFeeBpsFor("invoice", p))).toBe(t["fee.depositInvoice"]);
      expect(label(platformFeeBpsFor("tiffin", p))).toBe(t["fee.tiffin"]);
      expect(label(platformFeeBpsFor("appointment_checkout", p))).toBe(t["fee.appointmentCheckout"]);
      expect(label(platformFeeBpsFor("manual", p))).toBe(t["fee.manual"]);
    }
    expect(FEE_KINDS).toHaveLength(6);
  });
  it("customer service fee", () => {
    const f = computeFees({ kind: "order", amountCents: 1000, plan: "plus", customerServiceFee: true });
    expect(`$${(f.customerFeeCents / 100).toFixed(2)}`).toBe(t["fee.customerService"]);
  });
});
