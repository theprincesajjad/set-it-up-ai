import { describe, expect, it } from "vitest";
import {
  addDays,
  approvalToken,
  bookingNeedsDeposit,
  busyOnDay,
  canApproveQuote,
  canStillSkip,
  canUndoSkip,
  cateringTimeline,
  countdownParts,
  dietBadges,
  earliestStart,
  firstServiceDay,
  fromPerHeadCents,
  holdLeft,
  freeStartTimes,
  holdWindow,
  isIsoDay,
  isPostalCode,
  normalizePostalCode,
  overlapsBusy,
  cardLabel,
  paymentUrl,
  refundIfCancelled,
  refundTiers,
  setupUrl,
  planFulfilments,
  planPriceCents,
  shopMatchesHalal,
  subscriptionActions,
  summarizeDiet,
  tiffinRoute,
  torontoInstant,
  torontoToday,
  weekdayOf,
} from "./restaurant";

const plan = { priceCents: 8500, extraServingCents: 6000, deliveryFeeCents: 500 };

describe("tiffin pricing", () => {
  it("adds extra servings and the delivery fee (same as the API's priceFor)", () => {
    expect(planPriceCents(plan, 1, "pickup")).toBe(8500);
    expect(planPriceCents(plan, 1, "delivery")).toBe(9000);
    expect(planPriceCents(plan, 4, "delivery")).toBe(8500 + 3 * 6000 + 500);
    expect(planPriceCents(plan, 0, "pickup")).toBe(8500);
  });
  it("lists the fulfilments a plan allows, delivery first", () => {
    expect(planFulfilments({ deliveryAllowed: true, pickupAllowed: true })).toEqual(["delivery", "pickup"]);
    expect(planFulfilments({ deliveryAllowed: false, pickupAllowed: true })).toEqual(["pickup"]);
  });
  it("starts tomorrow for day-ahead cutoffs and finds the first service day", () => {
    expect(earliestStart({ cutoffHours: 24 }, "2026-10-22")).toBe("2026-10-23");
    expect(earliestStart({ cutoffHours: 0 }, "2026-10-22")).toBe("2026-10-22");
    // 2026-10-24 is a Saturday; a Mon-Fri plan starts Monday the 26th.
    expect(firstServiceDay([1, 2, 3, 4, 5], "2026-10-24")).toBe("2026-10-26");
    expect(firstServiceDay([1, 2, 3, 4, 5], "2026-10-26")).toBe("2026-10-26");
  });
  it("normalizes and checks Canadian postal codes", () => {
    expect(normalizePostalCode("l4t1a1")).toBe("L4T 1A1");
    expect(normalizePostalCode("l4t")).toBe("L4T");
    expect(isPostalCode("L4T 1A1")).toBe(true);
    expect(isPostalCode("L4T1A1")).toBe(true);
    expect(isPostalCode("12345")).toBe(false);
  });
});

describe("dates in Toronto", () => {
  it("does day arithmetic and weekdays", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("2026-10-22")).toBe(true);
  });
  it("reads today in Toronto, not UTC", () => {
    // 02:30 UTC on Oct 23 is still the evening of Oct 22 in Toronto (EDT, UTC-4).
    expect(torontoToday(new Date("2026-10-23T02:30:00Z"))).toBe("2026-10-22");
  });
  it("converts Toronto wall-clock time to UTC across the November DST change", () => {
    expect(torontoInstant("2026-10-31", "18:00").toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(torontoInstant("2026-11-07", "18:00").toISOString()).toBe("2026-11-07T23:00:00.000Z");
  });
});

describe("skip countdown", () => {
  const cutoff = "2026-10-23T12:00:00Z";
  const at = (iso: string) => new Date(iso).getTime();
  it("shows the two largest units, then passed", () => {
    expect(countdownParts(cutoff, at("2026-10-21T09:00:00Z"))).toEqual({ kind: "dh", d: 2, h: 3 });
    expect(countdownParts(cutoff, at("2026-10-23T06:40:00Z"))).toEqual({ kind: "hm", h: 5, m: 20 });
    expect(countdownParts(cutoff, at("2026-10-23T11:30:00Z"))).toEqual({ kind: "m", m: 30 });
    expect(countdownParts(cutoff, at("2026-10-23T11:59:59Z"))).toEqual({ kind: "m", m: 1 });
    expect(countdownParts(cutoff, at("2026-10-23T12:00:00Z"))).toEqual({ kind: "passed" });
  });
  it("only offers Skip before the cutoff and Undo for a skipped day before the cutoff", () => {
    const base = { cutoffAt: cutoff, canSkip: true, status: "scheduled" as const };
    expect(canStillSkip(base, at("2026-10-22T12:00:00Z"))).toBe(true);
    expect(canStillSkip(base, at("2026-10-23T12:00:01Z"))).toBe(false);
    expect(canStillSkip({ ...base, canSkip: false }, at("2026-10-22T12:00:00Z"))).toBe(false);
    expect(canUndoSkip({ cutoffAt: cutoff, status: "skipped" }, at("2026-10-22T12:00:00Z"))).toBe(true);
    expect(canUndoSkip({ cutoffAt: cutoff, status: "skipped" }, at("2026-10-24T12:00:00Z"))).toBe(false);
    expect(canUndoSkip({ cutoffAt: cutoff, status: "scheduled" }, at("2026-10-22T12:00:00Z"))).toBe(false);
  });
  it("picks the subscription actions by status", () => {
    expect(subscriptionActions({ status: "active", pausedUntil: null }, "2026-10-22")).toMatchObject({ canSkip: true, canPause: true, canResume: false, canCancel: true, canRetry: false });
    expect(subscriptionActions({ status: "paused", pausedUntil: "2026-11-02" }, "2026-10-22")).toMatchObject({ canSkip: false, canPause: false, canResume: true });
    expect(subscriptionActions({ status: "past_due", pausedUntil: null }, "2026-10-22")).toMatchObject({ canRetry: true, canCancel: true });
    expect(subscriptionActions({ status: "cancelled", pausedUntil: null }, "2026-10-22")).toMatchObject({ canCancel: false, canEdit: false, canRetry: false });
  });
});

describe("dietary claims", () => {
  it("shows zabihah instead of plain halal and vegan instead of vegetarian", () => {
    expect(dietBadges({ halal: true, zabihah: true, vegetarian: true, vegan: true, glutenFree: true })).toEqual(["zabihah", "vegan", "glutenFree"]);
    expect(dietBadges({ halal: true })).toEqual(["halal"]);
    expect(dietBadges(undefined)).toEqual([]);
  });
  it("summarizes a menu: all or some halal, certifiers, the hottest spice", () => {
    const all = summarizeDiet([{ halal: true, spice: 1, halalCertifier: "HMA" }, { zabihah: true, spice: 3, halalCertifier: "HMA" }]);
    expect(all).toMatchObject({ halal: "all", zabihah: true, veg: null, maxSpice: 3, certifiers: ["HMA"] });
    const some = summarizeDiet([{ halal: true }, undefined, { vegetarian: true }]);
    expect(some).toMatchObject({ halal: "some", veg: "some", maxSpice: null, zabihah: false });
    expect(summarizeDiet([])).toMatchObject({ halal: null, veg: null, maxSpice: null });
  });
  it("falls back to client-side halal filtering when the API ignores the param", () => {
    expect(shopMatchesHalal({ halalMenu: "some" }, "1")).toBe(true);
    expect(shopMatchesHalal({ halalMenu: "some" }, "all")).toBe(false);
    expect(shopMatchesHalal({ halalMenu: "all" }, "all")).toBe(true);
    expect(shopMatchesHalal({ dietary: { zabihah: true } }, "1")).toBe(true);
    expect(shopMatchesHalal({ tags: ["Cafe", "Halal"] }, "1")).toBe(true);
    expect(shopMatchesHalal({}, "1")).toBe(false);
  });
});

describe("catering", () => {
  const e = (status: string, extra: object = {}) => ({ status, createdAt: "2026-10-01T00:00:00Z", tastingAt: null, quoteSentAt: null, depositPaidAt: null, approvedAt: null, ...extra }) as never;
  it("walks inquiry, tasting, quoted, confirmed", () => {
    expect(cateringTimeline(e("inquiry")).map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(cateringTimeline(e("tasting", { tastingAt: "2026-10-05T18:00:00Z" })).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(cateringTimeline(e("quoted", { quoteSentAt: "2026-10-06T00:00:00Z" })).map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(cateringTimeline(e("confirmed", { depositPaidAt: "2026-10-07T00:00:00Z" })).map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(cateringTimeline(e("completed")).every((s) => s.state === "done")).toBe(true);
    expect(cateringTimeline(e("cancelled")).map((s) => s.state)).toEqual(["done", "todo", "todo", "todo"]);
  });
  it("opens the web approval only for a sent quote", () => {
    expect(canApproveQuote({ status: "quoted", approvalUrl: "https://x.test/e/abc" })).toBe(true);
    expect(canApproveQuote({ status: "quoted", approvalUrl: null })).toBe(false);
    expect(canApproveQuote({ status: "confirmed", approvalUrl: "https://x.test/e/abc" })).toBe(false);
    expect(approvalToken("https://local.example/e/tok_123?x=1")).toBe("tok_123");
    expect(approvalToken(null)).toBeNull();
  });
});

describe("banquet", () => {
  const busy = [{ bookingId: "b1", status: "confirmed" as const, startsAt: "2026-11-14T22:00:00Z", endsAt: "2026-11-15T03:00:00Z" }];
  it("builds the hold window in Toronto time", () => {
    expect(holdWindow("2026-11-14", "18:00", 5)).toEqual({ startsAt: "2026-11-14T23:00:00.000Z", endsAt: "2026-11-15T04:00:00.000Z" });
  });
  it("finds busy windows on a day and overlaps", () => {
    expect(busyOnDay(busy, "2026-11-14")).toHaveLength(1);
    expect(busyOnDay(busy, "2026-11-13")).toHaveLength(0);
    expect(busyOnDay(busy, "2026-11-16")).toHaveLength(0);
    expect(overlapsBusy(busy, "2026-11-14T20:00:00Z", "2026-11-14T22:30:00Z")).toBe(true);
    expect(overlapsBusy(busy, "2026-11-15T03:00:00Z", "2026-11-15T06:00:00Z")).toBe(false);
  });
  it("offers 30-minute start times only where the whole hold fits", () => {
    // Busy 17:00-22:00 Toronto (22:00Z-03:00Z).
    const times = freeStartTimes(busy, "2026-11-14", 5);
    expect(times[0]).toBe("09:00");
    expect(times).toContain("12:00"); // ends exactly when the booking starts
    expect(times).not.toContain("12:30");
    expect(times).not.toContain("18:00");
    expect(times).toContain("22:00"); // after the booking
    expect(freeStartTimes(busy, "2026-11-14", 5).every((h) => /^\d\d:(00|30)$/.test(h))).toBe(true);
    expect(freeStartTimes(busy, "2026-11-13", 5)).toHaveLength(27);
    // A short hold squeezes in earlier than a long one.
    expect(freeStartTimes(busy, "2026-11-14", 3)).toContain("14:00");
    expect(freeStartTimes(busy, "2026-11-14", 6)).not.toContain("14:00");
  });
  it("shows the cheapest package per head", () => {
    expect(fromPerHeadCents({ packages: [{ name: "a", perHeadCents: 4500, includes: [] }, { name: "b", perHeadCents: 3800, includes: [] }] })).toBe(3800);
    expect(fromPerHeadCents({ packages: [] })).toBeNull();
  });
  it("counts the hold down and only asks for a deposit while the hold is live", () => {
    const now = new Date("2026-10-22T12:00:00Z").getTime();
    const b = { status: "hold" as const, depositCents: 50_000, depositPaidAt: null, holdExpiresAt: "2026-10-25T12:00:00Z" };
    expect(holdLeft(b, now)).toEqual({ kind: "dh", d: 3, h: 0 });
    expect(holdLeft({ ...b, status: "confirmed" as never }, now)).toBeNull();
    expect(bookingNeedsDeposit(b, now)).toBe(true);
    expect(bookingNeedsDeposit({ ...b, holdExpiresAt: "2026-10-22T11:00:00Z" }, now)).toBe(false);
    expect(bookingNeedsDeposit({ ...b, depositPaidAt: "2026-10-22T11:00:00Z" }, now)).toBe(false);
    expect(bookingNeedsDeposit({ ...b, depositCents: 0 }, now)).toBe(false);
  });
});

describe("payments and notifications", () => {
  it("builds the web pay link for a PaymentIntent", () => {
    expect(paymentUrl("https://local.example/", { paymentIntentId: "pi_1", clientSecret: "pi_1_secret_x y" })).toBe("https://local.example/pay/intent/pi_1?cs=pi_1_secret_x%20y");
  });
  it("routes tiffin pushes to the subscription", () => {
    expect(tiffinRoute({ type: "tiffin_update", subscriptionId: "sub-1", event: "delivered" })).toBe("/tiffin/sub-1");
    expect(tiffinRoute({ type: "tiffin_menu", subscriptionId: "sub-2" })).toBe("/tiffin/sub-2");
    expect(tiffinRoute({ screen: "tiffin", subscriptionId: "sub-3" })).toBe("/tiffin/sub-3");
    expect(tiffinRoute({ type: "tiffin_update" })).toBeNull();
    expect(tiffinRoute({ type: "order_ready", subscriptionId: "x" })).toBeNull();
    expect(tiffinRoute(null)).toBeNull();
  });
});

describe("saved card and deposit refunds", () => {
  it("builds the web setup link for a SetupIntent", () => {
    expect(setupUrl("https://local.example/", { setupIntentId: "seti_1", clientSecret: "seti_1_secret_x y" })).toBe("https://local.example/pay/setup/seti_1?cs=seti_1_secret_x%20y");
  });

  it("labels the card on file with a known brand name, the raw name, or just the last four", () => {
    expect(cardLabel({ brand: "visa", last4: "4242" })).toBe("Visa \u2022\u2022\u2022\u2022 4242");
    expect(cardLabel({ brand: "Stripe Test Bank", last4: "6789" })).toBe("Stripe Test Bank \u2022\u2022\u2022\u2022 6789");
    expect(cardLabel({ brand: null, last4: "4242" })).toBe("\u2022\u2022\u2022\u2022 4242");
    expect(cardLabel({ brand: "mastercard", last4: null })).toBe("Mastercard");
  });

  const policy = { tiers: [{ minDaysBefore: 14, refundBps: 5000 }, { minDaysBefore: 30, refundBps: 10000 }] };
  const day = 86_400_000;
  const startsAt = "2026-12-12T17:00:00Z";
  const at = (daysBefore: number) => new Date(startsAt).getTime() - daysBefore * day;
  const booking = { depositCents: 141250, depositPaidAt: "2026-11-03T15:00:00Z", depositRefundedAt: null, startsAt, refundPolicy: policy };

  it("lists the policy tiers largest first, as percentages", () => {
    expect(refundTiers(policy)).toEqual([{ days: 30, pct: 100 }, { days: 14, pct: 50 }]);
    expect(refundTiers({ tiers: [] })).toEqual([]);
  });

  it("works out what cancelling now returns, the same way the server does", () => {
    expect(refundIfCancelled(booking, at(40))).toEqual({ cents: 141250, bps: 10000 });
    expect(refundIfCancelled(booking, at(20))).toEqual({ cents: 70625, bps: 5000 });
    expect(refundIfCancelled(booking, at(5))).toEqual({ cents: 0, bps: 0 });
  });

  it("returns nothing when the deposit isn't paid, was already refunded, or the hall has no policy", () => {
    expect(refundIfCancelled({ ...booking, depositPaidAt: null }, at(40)).cents).toBe(0);
    expect(refundIfCancelled({ ...booking, depositRefundedAt: "2026-11-05T00:00:00Z" }, at(40)).cents).toBe(0);
    expect(refundIfCancelled({ ...booking, refundPolicy: null }, at(40)).cents).toBe(0);
  });
});
