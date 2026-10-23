import { describe, expect, it } from "vitest";
import { cardLabel } from "@/components/pass/cardLabel";
import { NO_REFUND, refundBody, refundedText, startingPart } from "@/components/dashboard/restaurant/RefundChoice";

describe("cancel refund choice", () => {
  it("defaults to keeping the deposit", () => {
    expect(refundBody(NO_REFUND, 44409)).toBe("none");
  });
  it("sends full, or a part in cents that is at least a cent and at most the deposit", () => {
    expect(refundBody({ mode: "full", amount: "" }, 44409)).toBe("full");
    expect(refundBody({ mode: "part", amount: "200.50" }, 44409)).toEqual({ amountCents: 20050 });
    expect(refundBody({ mode: "part", amount: "444.09" }, 44409)).toEqual({ amountCents: 44409 });
    expect(refundBody({ mode: "part", amount: "444.10" }, 44409)).toBeNull();
    expect(refundBody({ mode: "part", amount: "" }, 44409)).toBeNull();
    expect(refundBody({ mode: "part", amount: "0" }, 44409)).toBeNull();
  });
  it("starts a partial refund at half the deposit and words what was refunded", () => {
    expect(startingPart(44409)).toBe("222.05");
    expect(refundedText(0, null, String)).toBeNull();
    expect(refundedText(20050, "2026-11-03", (d) => `on ${d}`)).toBe("$200.50 refunded on 2026-11-03");
  });
});

describe("card on file label", () => {
  it("shows the brand and last four", () => {
    expect(cardLabel({ type: "card", brand: "visa", last4: "4242" })).toBe("Visa •••• 4242");
    expect(cardLabel({ type: "pad", brand: "Stripe Test Bank", last4: "6789" })).toBe("Stripe Test Bank •••• 6789");
    expect(cardLabel({ type: "card", brand: null, last4: "4242" })).toBe("•••• 4242");
  });
});
