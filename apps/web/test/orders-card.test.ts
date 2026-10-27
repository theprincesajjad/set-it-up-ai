import { describe, expect, it } from "vitest";
import { depositLine, isEventOrder } from "../src/lib/restaurant/orders";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const base = { kind: "preorder", depositCents: 12814, depositPaidAt: "2026-11-01T12:00:00Z", balanceDueCents: 29900, paymentStatus: "authorized" as const };

describe("the money line on a deposit order", () => {
  it("shows the balance still owed after the deposit (order #52: $299.00 due, not 'nothing left')", () => {
    expect(depositLine(base, fmt)).toBe("Deposit $128.14 paid · $299.00 due at pickup");
  });
  it("says paid in full only when the order is settled", () => {
    expect(depositLine({ ...base, balanceDueCents: 0, paymentStatus: "paid" }, fmt)).toBe("Deposit $128.14 paid · paid in full");
  });
  it("uses event wording for a hall booking", () => {
    expect(depositLine({ ...base, kind: "banquet" }, fmt)).toBe("Deposit $128.14 paid · $299.00 due at the event");
    expect(isEventOrder({ kind: "banquet" })).toBe(true);
    expect(isEventOrder({ kind: "preorder" })).toBe(false);
  });
});
